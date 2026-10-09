'use strict';
/* SHARED - furniture you work at (data: js/data/furniture/, placed in rooms with level-editor.html).
 *   station   a crafting station inside a room: the LOOM (station: 'loom') weaves linen. Stand beside it and craft (Q), like at a crafting table.
 *   press     the DYE PRESS: hold anything and press the interact key beside it: one of it is squeezed into the dye of its colour.
 *   store     a bin for one item (the WOOL BIN): the interact key stores all of that item you carry, or (carrying none) takes a stack back out.
 *             Its count lives on the world map (map.roomStores, per room and bin), travels with the town's stockpiles and is saved with them.
 *   container a chest (the WORN CHEST, 25 slots): the interact key opens it beside your bag; stacks move in and out like with a pony's pack.
 *   wardrobe  the WARDROBE: the interact key opens your Wardrobe (what you wear).
 * Locked buildings (data `locked: true`, the empty homes) just say so at the door. */

/** The ten dyes, and which dye each colour gives. */
const Dyes = (() => {
  // what has no colour of its own: its dye by hand (everything else uses its item colour, a wardrobe piece its look's colour, else brown)
  const BY_ITEM = {
    mutton: 'red', rabbit_meat: 'red', venison: 'red', chicken_meat: 'pink', bear_meat: 'red', raw_fish: 'pink', apple: 'red', brick: 'red', claw: 'black',
    cooked_chicken: 'brown', cooked_rabbit: 'brown', cooked_venison: 'brown', cooked_mutton: 'brown', cooked_fish: 'brown', cooked_bear: 'brown',
    egg: 'white', fried_egg: 'yellow', jug_water: 'blue', jug: 'orange', log: 'brown', plank: 'brown', rope: 'brown', hide: 'brown', antler: 'brown', arrow: 'brown',
    stone: 'black', clay: 'orange', brick_form: 'orange', wool: 'white', bone: 'white', string: 'white', fang: 'white', feather: 'white', linen: 'white',
    message_bottle: 'blue', gold_coin: 'yellow', treasure_map: 'yellow', torch: 'orange', dragon_scale: 'green', chitin: 'purple', dungeon_scroll: 'purple'
  };
  const hsl = hex => {
    const n = parseInt(String(hex).slice(1, 7), 16); if (!Number.isFinite(n)) return null;
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1)), h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  };
  /** A colour's family. */
  function family(hex) {
    const c = hsl(hex); if (!c) return 'brown';
    if (c.s < 0.18) return c.l > 0.6 ? 'white' : 'black';
    if (c.l > 0.88) return 'white';
    if (c.l < 0.16) return 'black';
    if (c.h >= 15 && c.h < 45 && c.l < 0.45) return 'brown';
    if ((c.h < 15 || c.h >= 345) && c.l > 0.7) return 'pink';
    if (c.h < 15 || c.h >= 345) return 'red';
    if (c.h < 42) return 'orange';
    if (c.h < 70) return 'yellow';
    if (c.h < 170) return 'green';
    if (c.h < 255) return 'blue';
    if (c.h < 295) return 'purple';
    return 'pink';
  }
  /** Can this be pressed? Not the things you use or wear (tools, weapons, bags, lassos, clothes), not a creature you carry, not a dye. */
  function pressable(id) {
    const d = ItemDefs[id];
    return !!d && !d.dye && !d.tool && !d.bag && !d.lasso && !d.equip && !d.creature && d.kind !== 'wardrobe';
  }
  /** The dye an item gives. */
  function of(id) {
    const d = ItemDefs[id]; if (!d) return null;
    const name = BY_ITEM[id] || (d.color ? family(d.color) : d.look && d.look.color ? family(d.look.color) : 'brown');
    return ItemDefs['dye_' + name] ? 'dye_' + name : 'dye_brown';
  }
  return { family, pressable, of };
})();

const HomeCrafts = {
  REACH: 1.35,
  CHEST_SLOTS: 25,                                   // what a worn chest holds
  /** The furniture pieces in this room (with their defs) within reach of p, nearest first. */
  near(map, p, test) {
    if (!map || map.kind !== 'room' || !map.plan || !map.plan.layout) return [];
    const out = [];
    for (const f of map.plan.layout.furniture) {
      const def = FurnitureDefs.get(f.id); if (!def || !test(def)) continue;
      const dx = Math.max(f.x - p.x, 0, p.x - (f.x + f.w)), dy = Math.max(f.y - p.y, 0, p.y - (f.y + f.h)), d = Math.hypot(dx, dy);
      if (d <= HomeCrafts.REACH) out.push({ f, def, dist: d });
    }
    return out.sort((a, b) => a.dist - b.dist);
  },
  /** A bin's key in map.roomStores: its room grid and its tile. */
  storeKey: (grid, f) => `${grid}|${f.x},${f.y}`,
  storeCount: (worldMap, key) => (worldMap && worldMap.roomStores && worldMap.roomStores[key]) | 0,
  /** Stations among the furniture within range (added to the crafting table, campfire... from the built tiles). */
  stationsNear(map, p, range) {
    if (!map || map.kind !== 'room' || !map.plan || !map.plan.layout) return [];
    const out = [];
    for (const f of map.plan.layout.furniture) {
      const def = FurnitureDefs.get(f.id); if (!def || !def.station) continue;
      const dx = Math.max(f.x - p.x, 0, p.x - (f.x + f.w)), dy = Math.max(f.y - p.y, 0, p.y - (f.y + f.h));
      if (Math.hypot(dx, dy) <= range) out.push(def.station);
    }
    return out;
  }
};

/* ---- what the interact key does at them (client + server) ---- */
function findHomeCraft(map, p, heldItemId) {
  const [hit] = HomeCrafts.near(map, p, def => def.press || def.store);
  if (!hit) return null;
  const { f, def, dist } = hit;
  if (def.press) {
    const ok = heldItemId && Dyes.pressable(heldItemId);
    return { kind: 'press', label: ok ? `Press ${ItemDefs[heldItemId].name}` : 'Dye press', dist, fx: f.x, fy: f.y };
  }
  const item = ItemDefs[def.store.item];
  return { kind: 'room_store', label: `${def.name}: store / take ${item ? item.name.toLowerCase() : def.store.item}`, dist, fx: f.x, fy: f.y };
}
Interactions.extra.push(findHomeCraft);

/** The chest or wardrobe within reach of p, nearest first (or null). */
function findStorageFurniture(map, p) {
  const [hit] = HomeCrafts.near(map, p, def => def.container || def.wardrobe);
  if (!hit) return null;
  const { f, def, dist } = hit;
  if (p.asleep) return null;                                                                          // (in bed, the button is Get up)
  const bed = typeof Sleep !== 'undefined' ? Sleep.bedOf(map) : null;
  if (bed && Math.hypot(p.x - clamp(p.x, bed.x, bed.x + bed.w), p.y - clamp(p.y, bed.y, bed.y + bed.h)) < dist - 0.05) return null;   // (the bed is nearer: that is Sleep)
  return def.container ? { kind: 'chest', label: `Open the ${def.name.toLowerCase()}`, dist, fx: f.x, fy: f.y } : { kind: 'wardrobe', label: `Open the ${def.name.toLowerCase()}`, dist, fx: f.x, fy: f.y };
}
Interactions.extra.unshift(findStorageFurniture);                                                     // (ahead of the bed's button: the nearer of the two wins)
InteractionHandlers.wardrobe = (server, id, p, action) => { if (server._roomPiece(p, action, d => d.wardrobe)) server.pendingEvents.push({ type: 'openWardrobe', to: id }); };
InteractionHandlers.chest = (server, id, p, action) => {
  const hit = server._roomPiece(p, action, d => d.container); if (!hit) return;
  const key = HomeCrafts.storeKey(gridOf(p), hit.f), S = server.interiors;
  if (!S.chests[key]) S.chests[key] = new Inventory(hit.def.container.slots || HomeCrafts.CHEST_SLOTS);
  S.openChest[id] = key; delete S.chestSent[id];
  server.pendingEvents.push({ type: 'openChest', to: id });
};

InteractionHandlers.press = (server, id, p, action) => server._press(id, p, action);
InteractionHandlers.room_store = (server, id, p, action) => server._useRoomStore(id, p, action);

Object.assign(GameServer.prototype, {
  /** The furniture piece an action points at, in the player's room (or null). */
  _roomPiece(p, action, test) {
    const map = this.mapOf(p); if (!map || map.kind !== 'room') return null;
    const f = map.plan.layout.furniture.find(f => f.x === action.fx && f.y === action.fy), def = f && FurnitureDefs.get(f.id);
    return def && test(def) ? { f, def } : null;
  },
  /** The dye press: one of what you hold becomes a dye of its colour. */
  _press(id, p, action) {
    if (!this._roomPiece(p, action, d => d.press)) return;
    const inventory = this.inventories[id], slot = p.sel | 0, s = inventory.slots[slot];
    if (!s) { this._notice(id, 'Hold something to press it for dye'); return; }
    if (!Dyes.pressable(s.id)) { this._notice(id, ItemDefs[s.id].dye ? 'That is a dye already' : `A ${ItemDefs[s.id].name} is not something to press`); return; }
    const dye = Dyes.of(s.id), from = s.id;
    s.count--; if (s.count <= 0) inventory.slots[slot] = null;
    if (inventory.add(dye, 1)) this._dropOnGround(dye, 1, p.x, p.y, gridOf(p));                          // (a full pack: it lands at your feet)
    this.inventoryRev[id]++;
    this.progress.award(id, 'crafting', 6);
    this.pendingEvents.push({ type: 'pressed', to: id, item: from, dye, color: ItemDefs[dye].color, x: action.fx + 0.5, y: action.fy + 0.5, grid: gridOf(p) });
    this.pendingEvents.push({ type: 'gain', to: id, item: dye, count: 1 });
  },
  /** A bin: store all of its item you carry, or (carrying none) take a stack back out. */
  _useRoomStore(id, p, action) {
    const hit = this._roomPiece(p, action, d => d.store); if (!hit) return;
    const { f, def } = hit, item = def.store.item, cap = def.store.capacity || 500, key = HomeCrafts.storeKey(gridOf(p), f), inventory = this.inventories[id];
    const stores = this.map.roomStores || (this.map.roomStores = {}), have = stores[key] | 0, carried = inventory.count(item), name = ItemDefs[item].name;
    if (carried) {
      const n = Math.min(carried, cap - have);
      if (!n) { this._notice(id, `The ${def.name} is full (${cap})`); return; }
      inventory.remove(item, n); stores[key] = have + n;
      this._notice(id, `Stored ${n} ${name} (${have + n} / ${cap})`);
    } else {
      if (!have) { this._notice(id, `The ${def.name} is empty: bring ${name.toLowerCase()} to store`); return; }
      const want = Math.min(have, ItemDefs[item].maxStack), n = want - inventory.add(item, want);
      if (!n) { this._notice(id, 'Inventory full'); return; }
      stores[key] = have - n; if (!stores[key]) delete stores[key];
      this.pendingEvents.push({ type: 'gain', to: id, item, count: n });
    }
    this.inventoryRev[id]++; this.stockRev++;                                                               // (the counts go out with the stockpiles)
  }
});

/* ---- the chest you have open (stacks move with packMove, as with a pony's pack) ---- */
Object.assign(GameServer.prototype, {
  /** The Inventory of the chest this player has open, if it is still within reach (else null, and it closes). */
  _chestOf(id) {
    const S = this.interiors, key = S.openChest[id], p = this.players[id];
    if (!key || !p) return null;
    const map = this.mapOf(p), near = map && map.kind === 'room' ? HomeCrafts.near(map, p, d => d.container).find(h => HomeCrafts.storeKey(gridOf(p), h.f) === key && h.dist <= HomeCrafts.REACH + 0.6) : null;
    if (!near || !S.chests[key]) { delete S.openChest[id]; return null; }
    return S.chests[key];
  },
  /** Private: the open chest, only when it changed (false: closed; null: no change). */
  chestUpdateFor(id) {
    const inv = this._chestOf(id), S = this.interiors;
    const wire = inv ? { key: S.openChest[id], name: 'Worn Chest', slots: inv.toJSON() } : false, json = JSON.stringify(wire);
    if (S.chestSent[id] === json || (S.chestSent[id] === undefined && !inv)) { S.chestSent[id] = json; return null; }
    S.chestSent[id] = json;
    return wire;
  }
});

/* ---- locked buildings ---- */
InteractionHandlers.locked_building = (server, id, p, action) => {
  const site = BuildingSites.list[action.site];
  server._notice(id, site && site.def.home ? (o => o ? `This is ${o.name || 'a neighbour'}'s home` : 'This home is empty: it is kept for a new neighbour')(server.interiors.owners[site.index]) : site && site.def.resident ? `${site.def.name} is locked: ${Npcs.get(site.def.resident).name} lives here` : `The ${site ? site.def.name : 'door'} is locked`);
};
