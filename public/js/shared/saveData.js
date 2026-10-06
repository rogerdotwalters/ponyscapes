'use strict';
/* SHARED - save games. The HOST's browser owns the world, so the host's own database holds two kinds of record:
 *
 *   WORLD      what the players changed: everything built, felled trees, picked bushes, dug treasure, the clock.
 *              (The land itself, its wild animals and its biomes come from the seed, so they are not stored.)
 *   CHARACTER  one per person who ever played in that world: pack, worn gear, skills, maps, pony book, ponies, where they stood.
 *
 * Everything that comes BACK from a database is treated as untrusted and re-validated: unknown items, absurd counts, NaNs, huge
 * lists and wrong types are dropped, never trusted, so a damaged or edited save cannot crash or cheat the session. */
/** Items that no longer exist (the old armour system) and what they were made from: a saved character gets the materials back instead of losing them. */
const LEGACY_ITEMS = Object.freeze({ hide_cap: ['hide', 2], hide_vest: ['hide', 3], hide_leggings: ['hide', 3], hide_boots: ['hide', 2], hide_gloves: ['hide', 2], wooden_shield: ['plank', 4], tool_belt: ['hide', 3], scabbard: ['hide', 2], sling: ['hide', 2] });

const SaveData = {
  VERSION: 1,
  MAX_BUILT_TILES: 200000, MAX_STATE_ENTRIES: 200000, MAX_PETS: 24, MAX_MAPS: 8,

  /* ---------------------------------- helpers ---------------------------------- */
  _num(v, lo, hi, fallback) { return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback; },
  _int(v, lo, hi, fallback) { return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback; },
  _plain: v => v !== null && typeof v === 'object' && !Array.isArray(v),

  /** Somewhere a person can actually stand, near (x, y): their own spot if it is fine, else the closest free tile, else the village spawn. */
  safeSpot(server, x, y, slot) {
    const map = server.map, spawn = Village.spawns[slot] || Village.spawns[0];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: spawn.x, y: spawn.y };
    map.ensureAround(x, y, 1);
    if (!isWaterTile(map.tile(Math.floor(x), Math.floor(y))) && !circleBlocked(map, x, y, CONFIG.sim.playerRadius)) return { x, y };
    const free = nearestFreeTile(map, Math.floor(x), Math.floor(y), 12);
    return free || { x: spawn.x, y: spawn.y };
  },

  /* ---------------------------------- WORLD ---------------------------------- */
  exportWorld(server) {
    const m = server.map;
    return {
      v: SaveData.VERSION, seed: m.seed, tick: server.tick,
      built: JSON.parse(JSON.stringify(m.built)), floors: Object.assign({}, m.floors), treasureDug: Object.assign({}, m.treasureDug),
      treeStates: JSON.parse(JSON.stringify(m.treeStates)), forageStates: JSON.parse(JSON.stringify(m.forageStates)),
      stockpiles: Stockpiles.exportState(m),
      bossesDefeated: [...server.worldProgress.defeated], hostilesOff: !!server.settings.hostilesOff,
      treeRespawns: server.trees.respawns.map(r => ({ tx: r.tx, ty: r.ty, atTick: r.atTick })),
      forageRegrows: server.forage.regrows.map(r => ({ tx: r.tx, ty: r.ty, atTick: r.atTick }))
    };
  },

  /** Validate a saved world. Returns a clean copy, or null if it is not a world at all. */
  sanitizeWorld(data) {
    if (!SaveData._plain(data) || data.v !== SaveData.VERSION || !Number.isInteger(data.seed)) return null;
    const out = { v: data.v, seed: data.seed, tick: SaveData._int(data.tick, 0, 2 ** 40, 0), built: {}, floors: {}, treasureDug: {}, treeStates: {}, forageStates: {}, treeRespawns: [], forageRegrows: [], bossesDefeated: [], stockpiles: { piles: {}, levels: {} } };
    const keyOk = k => /^-?\d+$/.test(k);
    let n = 0;
    for (const [k, tile] of Object.entries(SaveData._plain(data.built) ? data.built : {})) {
      if (!keyOk(k) || !SaveData._plain(tile) || ++n > SaveData.MAX_BUILT_TILES) continue;
      const clean = {};
      for (const slot of ['n', 'e', 's', 'w', 'c']) if (typeof tile[slot] === 'string' && StructureDefs[tile[slot]]) clean[slot] = tile[slot];
      if (Object.keys(clean).length) out.built[k] = clean;
    }
    n = 0;
    for (const [k, type] of Object.entries(SaveData._plain(data.floors) ? data.floors : {})) if (keyOk(k) && StructureDefs[type] && ++n <= SaveData.MAX_BUILT_TILES) out.floors[k] = type;
    n = 0;
    for (const k of Object.keys(SaveData._plain(data.treasureDug) ? data.treasureDug : {})) if (keyOk(k) && ++n <= SaveData.MAX_STATE_ENTRIES) out.treasureDug[k] = true;
    n = 0;
    for (const [k, s] of Object.entries(SaveData._plain(data.treeStates) ? data.treeStates : {})) {
      if (!keyOk(k) || !SaveData._plain(s) || ++n > SaveData.MAX_STATE_ENTRIES) continue;
      out.treeStates[k] = { hp: SaveData._int(s.hp, 0, TreeDef.maxHp, TreeDef.maxHp), alive: s.alive !== false };
    }
    n = 0;
    for (const k of Object.keys(SaveData._plain(data.forageStates) ? data.forageStates : {})) if (keyOk(k) && ++n <= SaveData.MAX_STATE_ENTRIES) out.forageStates[k] = { ripe: false };
    const queue = (list, into) => { if (!Array.isArray(list)) return; for (const r of list.slice(0, SaveData.MAX_STATE_ENTRIES)) if (SaveData._plain(r) && Number.isInteger(r.tx) && Number.isInteger(r.ty) && Number.isInteger(r.atTick)) into.push({ tx: r.tx, ty: r.ty, atTick: r.atTick }); };
    out.hostilesOff = data.hostilesOff === true;
    if (Array.isArray(data.bossesDefeated)) out.bossesDefeated = [...new Set(data.bossesDefeated.filter(r => Number.isInteger(r) && r >= 0 && r < Rings.size))];
    queue(data.treeRespawns, out.treeRespawns); queue(data.forageRegrows, out.forageRegrows);
    const stock = SaveData._plain(data.stockpiles) ? data.stockpiles : {};                         // (older saves have none)
    for (const [k, pile] of Object.entries(SaveData._plain(stock.piles) ? stock.piles : {})) {
      const type = out.built[k] && out.built[k].c;
      if (!keyOk(k) || !Stockpiles.isStockpile(type) || !SaveData._plain(pile) || !SaveData._plain(pile.items)) continue;
      const items = {};
      for (const [item, n] of Object.entries(pile.items)) if (ItemDefs[item] && ItemDB.resource(item) === StructureDefs[type].stockpile) items[item] = SaveData._int(n, 0, 1e6, 0);
      out.stockpiles.piles[k] = { items };
    }
    for (const [k, level] of Object.entries(SaveData._plain(stock.levels) ? stock.levels : {})) {
      const type = out.built[k] && out.built[k].c;
      if (keyOk(k) && Buildings.upgradeable(type)) out.stockpiles.levels[k] = SaveData._int(level, 1, BuildingUpgrades[type].length, 1);
    }
    for (const [k, tile] of Object.entries(out.built)) if (Stockpiles.isStockpile(tile.c) && !out.stockpiles.piles[k]) out.stockpiles.piles[k] = { items: {} };
    return out;
  },

  /** Step 1 (before any chunk exists): what players changed on the map itself. `world` must already be sanitized. */
  applyMapState(map, world) {
    map.built = {}; BuildSystem.replaceAll(map, world.built);
    BuildSystem.replaceFloors(map, world.floors);
    map.treasureDug = Object.assign({}, world.treasureDug);
    map.treeStates = JSON.parse(JSON.stringify(world.treeStates));
    map.forageStates = JSON.parse(JSON.stringify(world.forageStates));
    Stockpiles.replaceAll(map, world.stockpiles);
  },
  /** Step 2 (after the systems exist): the clock and the regrow timers, so a felled tree comes back when it was due to. */
  applyTimers(server, world) {
    server.tick = world.tick;
    server.trees.respawns = world.treeRespawns.map(r => Object.assign({}, r));
    server.forage.regrows = world.forageRegrows.map(r => Object.assign({}, r));
    server.settings.hostilesOff = !!world.hostilesOff; server.animals.hostilesOff = !!world.hostilesOff;
    server.worldProgress.restore(world.bossesDefeated || []);                                  // the guardians that are down, and the rings that opened
    server.builtRev++; server.floorsRev++; server.stockRev++;
  },

  /* ---------------------------------- CHARACTER ---------------------------------- */
  exportCharacter(server, id) {
    const p = server.players[id], inventory = server.inventories[id];
    if (!p || !inventory) return null;
    const spot = SaveData.safeSpot(server, p.x, p.y, p.slot);                   // (rowing a boat? they are put back on the shore)
    const pets = Object.values(server.animals.animals).filter(a => a.owner === id && !a.trial).slice(0, SaveData.MAX_PETS)
      .map(a => ({ type: a.type, level: a.level, look: a.look ? a.look.slice() : null, hpFraction: a.maxHp ? a.hp / a.maxHp : 1, x: a.x, y: a.y, friend: Friendship.hasBond(a.friends[id]) ? Friendship.encode(a.friends[id]) : null }));
    const xp = server.progress.ensure(id);
    return {
      v: SaveData.VERSION, savedAt: Date.now(),
      x: spot.x, y: spot.y, hp: p.hp, hunger: p.hunger, thirst: p.thirst, sel: p.sel,
      inventory: inventory.toJSON(), gear: Object.assign({}, p.gear),
      xp: { s: Object.assign({}, xp.s), a: Object.assign({}, xp.a) },
      maps: (server.treasureMaps[id] || []).map(m => Object.assign({ key: m.key, tx: m.tx, ty: m.ty }, m.kind === 'dungeon' ? { kind: 'dungeon', ring: m.ring } : {})),
      looted: !!p.looted, appearance: p.appearance ? p.appearance.slice() : null,
      book: { types: Object.keys(server.everTamed[id] || {}), variants: Object.keys(server.everVariants[id] || {}).map(Number) },
      pets, friends: server.friendship.exportFor(id)                      // hearts with the villagers (hearts with a pet travel with the pet)
    };
  },

  /** Validate a saved character. Returns a clean copy, or null if it is not a character. */
  sanitizeCharacter(data) {
    if (!SaveData._plain(data) || data.v !== SaveData.VERSION) return null;
    const N = SaveData._num, I = SaveData._int, S = CONFIG.sim;
    const out = { v: data.v, x: N(data.x, -1e7, 1e7, NaN), y: N(data.y, -1e7, 1e7, NaN), hp: N(data.hp, 1, 100000, 1), hunger: N(data.hunger, 0, S.hunger.max, S.hunger.max), thirst: N(data.thirst, 0, S.thirst.max, S.thirst.max), sel: I(data.sel, 0, S.inventory.totalSlots - 1, 0),
      appearance: CharacterLook.sanitize(data.appearance), inventory: [], gear: { crown: 'crown_simple' }, xp: { s: {}, a: {} }, maps: [], looted: !!data.looted, book: { types: [], variants: [] }, pets: [] };
    const total = S.inventory.totalSlots, source = Array.isArray(data.inventory) ? data.inventory : [], refunds = [];
    const refund = (id, count) => { const old = LEGACY_ITEMS[id]; if (old) refunds.push({ id: old[0], count: old[1] * count }); else if (ItemDefs[id]) refunds.push({ id, count }); };
    for (let i = 0; i < Math.max(total, source.length); i++) {
      const slot = source[i], def = slot && typeof slot.id === 'string' ? ItemDefs[slot.id] : null, count = slot ? I(slot.count, 1, 9999, 1) : 0;
      if (i < total) { out.inventory.push(def ? { id: slot.id, count: Math.min(count, def.maxStack) } : null); if (!def && slot && typeof slot.id === 'string') refund(slot.id, Math.min(count, 99)); }
      else if (slot && typeof slot.id === 'string') refund(slot.id, Math.min(count, 99));            // the old tool-belt slots: folded into the bag
    }
    for (const [slotName, item] of Object.entries(SaveData._plain(data.gear) ? data.gear : {})) {
      if (typeof item !== 'string' || !item) continue;
      if (WardrobeSlots.includes(slotName) && ItemDefs[item] && Wardrobe.slotFor(item) === slotName) out.gear[slotName] = item;
      else refund(item, 1);                                                                           // old armour, shield, belt, scabbard or a sword that was in the sword slot
    }
    for (const r of refunds) {                                                                         // put refunds into stacks / free slots; anything that cannot fit is dropped
      const max = ItemDefs[r.id].maxStack; let left = r.count;
      for (const slot of out.inventory) if (left > 0 && slot && slot.id === r.id && slot.count < max) { const t = Math.min(max - slot.count, left); slot.count += t; left -= t; }
      for (let i = 0; i < out.inventory.length && left > 0; i++) if (!out.inventory[i]) { const t = Math.min(max, left); out.inventory[i] = { id: r.id, count: t }; left -= t; }
    }
    for (const kind of ['s', 'a']) {
      const defs = kind === 's' ? SkillDefs : AttributeDefs, src = SaveData._plain(data.xp) && SaveData._plain(data.xp[kind]) ? data.xp[kind] : {};
      for (const name of Object.keys(defs)) out.xp[kind][name] = N(src[name], 0, XP_TABLE[MAX_LEVEL] * 4, 0);
    }
    if (Array.isArray(data.maps)) for (const m of data.maps.slice(0, SaveData.MAX_MAPS)) if (SaveData._plain(m) && Number.isInteger(m.tx) && Number.isInteger(m.ty)) out.maps.push(m.kind === 'dungeon' && Number.isInteger(m.ring) && m.ring >= 0 && m.ring < Rings.size ? { key: 'cave' + m.ring, tx: m.tx, ty: m.ty, kind: 'dungeon', ring: m.ring } : { key: tileKey(m.tx, m.ty), tx: m.tx, ty: m.ty });
    if (SaveData._plain(data.book)) {
      for (const t of Array.isArray(data.book.types) ? data.book.types : []) if (AnimalDefs[t] && AnimalDefs[t].pony) out.book.types.push(t);
      for (const v of Array.isArray(data.book.variants) ? data.book.variants : []) if (Number.isInteger(v) && v >= 0 && v < PonyVariants.length) out.book.variants.push(v);
    }
    if (Array.isArray(data.pets)) for (const q of data.pets.slice(0, SaveData.MAX_PETS)) {
      if (!SaveData._plain(q) || !AnimalDefs[q.type] || !(AnimalDefs[q.type].pony || AnimalDefs[q.type].tameable)) continue;      // only things you can actually keep: a saved "pet" can never be a dragon
      const look = Array.isArray(q.look) && q.look.length >= 4 && q.look.every(Number.isInteger) ? q.look.slice(0, 7).map(v => Math.max(0, v)) : null;   // [coat, mane, mark, name, variant, rarity, traitSeed]
      out.pets.push({ type: q.type, level: I(q.level, 1, CONFIG.sim.levels.max, 1), look, hpFraction: N(q.hpFraction, 0.05, 1, 1), x: N(q.x, -1e7, 1e7, NaN), y: N(q.y, -1e7, 1e7, NaN), friend: Friendship.decode(q.friend) });
    }
    out.friends = {};                                                                       // hearts with the villagers: { 'n_baker': [level, points] }
    if (SaveData._plain(data.friends)) for (const key of Object.keys(data.friends).slice(0, 40)) { const bond = Friendship.decode(data.friends[key]); if (/^n_[a-z_]+$/.test(key) && Npcs.has(key.slice(2)) && bond) out.friends[key] = bond; }
    return out;
  },

  /** Put a saved character into the seat `id` (which addPlayer has just created with a fresh starter pack). */
  importCharacter(server, id, data) {
    const c = SaveData.sanitizeCharacter(data), p = server.players[id];
    if (!c || !p) return false;
    server.inventories[id] = Inventory.fromJSON(c.inventory); server.inventoryRev[id]++;
    for (const k of Object.keys(p.gear)) delete p.gear[k];
    Object.assign(p.gear, c.gear);
    p.sel = c.sel; p.looted = c.looted; if (c.appearance) p.appearance = c.appearance;
    const ledger = server.progress.ensure(id); ledger.s = c.xp.s; ledger.a = c.xp.a; server.progress.rev[id] = (server.progress.rev[id] || 0) + 1;
    server._applyLevels(id, server.progress.levels(id));
    p.hp = Math.min(c.hp, p.maxHp); p.hunger = c.hunger; p.thirst = c.thirst;
    server.treasureMaps[id] = c.maps; server.treasureRev[id]++;
    server.everTamed[id] = Object.fromEntries(c.book.types.map(t => [t, true])); server.everVariants[id] = Object.fromEntries(c.book.variants.map(v => [v, true]));
    const spot = SaveData.safeSpot(server, c.x, c.y, p.slot);
    p.x = spot.x; p.y = spot.y; p.vx = p.vy = 0; p.ack = 0; server.map.ensureAround(p.x, p.y, SERVER_STREAM_RADIUS);
    for (const a of Object.values(server.animals.animals)) if (a.owner === id) delete server.animals.animals[a.id];      // the starter pony makes way for the real ones
    for (const q of c.pets) {
      const at = SaveData.safeSpot(server, Number.isFinite(q.x) ? q.x : p.x + 1, Number.isFinite(q.y) ? q.y : p.y, p.slot);
      const pet = server.animals.release(q.type, at.x, at.y, id, undefined, { level: q.level, variant: q.look ? q.look[4] | 0 : 0 });
      if (q.look && AnimalDefs[q.type].pony) pet.look = q.look;
      pet.hp = Math.max(1, Math.round(pet.maxHp * q.hpFraction));
      if (q.friend) pet.friends[id] = q.friend;                                  // a pet remembers how fond of you it is
    }
    server.friendship.restore(id, c.friends);
    server._updateCompanions();                                              // carry limit and pony buffs, straight away
    return true;
  }
};
