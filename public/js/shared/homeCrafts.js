'use strict';
/* SHARED - furniture you work at (data: js/data/furniture/, placed in rooms with level-editor.html).
 *   station   a crafting station inside a room: the LOOM (station: 'loom') weaves linen. Stand beside it and craft (Q), like at a crafting table.
 *   press     the DYE PRESS: hold anything and press the interact key beside it: one of it is squeezed into the dye of its colour.
 *   store     a bin for one item (the WOOL BIN): the interact key stores all of that item you carry, or (carrying none) takes a stack back out.
 *             Its count lives on the world map (map.roomStores, per room and bin), travels with the town's stockpiles and is saved with them.
 *   container a CHEST: the interact key opens the Chest window; put things in from your bag and take them out. It keeps up to `slots` kinds of item
 *             (any amount of each) in map.roomChests (per room and chest), saved and sent with the town's stockpiles like the bins.
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
  /** What a chest holds: { itemId: count } (read only on the client). */
  chestItems: (worldMap, key) => (worldMap && worldMap.roomChests && worldMap.roomChests[key]) || {},
  CHEST_MAX_STACK: 9999,
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
  const [hit] = HomeCrafts.near(map, p, def => def.press || def.store || def.container);
  if (!hit) return null;
  const { f, def, dist } = hit;
  if (def.container) return { kind: 'room_chest', label: `Open ${def.name.toLowerCase()}`, dist, fx: f.x, fy: f.y };
  if (def.press) {
    const ok = heldItemId && Dyes.pressable(heldItemId);
    return { kind: 'press', label: ok ? `Press ${ItemDefs[heldItemId].name}` : 'Dye press', dist, fx: f.x, fy: f.y };
  }
  const item = ItemDefs[def.store.item];
  return { kind: 'room_store', label: `${def.name}: store / take ${item ? item.name.toLowerCase() : def.store.item}`, dist, fx: f.x, fy: f.y };
}
Interactions.extra.push(findHomeCraft);

InteractionHandlers.press = (server, id, p, action) => server._press(id, p, action);
InteractionHandlers.room_chest = (server, id, p, action) => server._openRoomChest(id, p, action);
InteractionHandlers.room_store = (server, id, p, action) => server._useRoomStore(id, p, action);

Object.assign(GameServer.prototype, {
  /** The furniture piece an action points at, in the player's room (or null). */
  _roomPiece(p, action, test) {
    const map = this.mapOf(p); if (!map || map.kind !== 'room') return null;
    const f = map.plan.layout.furniture.find(f => f.x === action.fx && f.y === action.fy), def = f && FurnitureDefs.get(f.id);
    return def && test(def) ? { f, def } : null;
  },
  /** A chest within reach: opens its window on the player's screen. */
  _openRoomChest(id, p, action) {
    const hit = this._roomPiece(p, action, d => d.container); if (!hit) return;
    this.pendingEvents.push({ type: 'chest', to: id, fx: hit.f.x, fy: hit.f.y, name: hit.def.name, slots: hit.def.container.slots | 0 || 24, grid: gridOf(p) });
  },
  /** The chest a command points at, if the player stands within reach of it: { f, def, key, contents } or null. */
  _chestFor(id, p, cmd) {
    if (!Number.isInteger(cmd.fx) || !Number.isInteger(cmd.fy) || typeof cmd.item !== 'string' || !ItemDefs[cmd.item]) return null;
    const map = this.mapOf(p), hit = map && HomeCrafts.near(map, p, d => d.container).find(h => h.f.x === cmd.fx && h.f.y === cmd.fy);
    if (!hit) { this._notice(id, 'Walk up to the chest first'); return null; }
    const key = HomeCrafts.storeKey(gridOf(p), hit.f), chests = this.map.roomChests || (this.map.roomChests = {});
    return { f: hit.f, def: hit.def, key, contents: chests[key] || (chests[key] = {}), chests };
  },
  /** Put some of what is in your bag into a chest. */
  _chestPut(id, cmd) {
    const p = this.players[id], inventory = this.inventories[id], chest = p && this._chestFor(id, p, cmd); if (!chest) return;
    const { contents, def } = chest, have = contents[cmd.item] | 0, slots = def.container.slots | 0 || 24;
    if (!have && Object.keys(contents).length >= slots) { this._notice(id, `The ${def.name.toLowerCase()} is full (${slots} kinds of item)`); return; }
    const n = Math.min(clamp(cmd.count | 0, 1, HomeCrafts.CHEST_MAX_STACK), inventory.count(cmd.item), HomeCrafts.CHEST_MAX_STACK - have);
    if (n <= 0) { this._notice(id, have >= HomeCrafts.CHEST_MAX_STACK ? 'That stack is full' : `You carry no ${ItemDefs[cmd.item].name.toLowerCase()}`); return; }
    inventory.remove(cmd.item, n); contents[cmd.item] = have + n;
    this.inventoryRev[id]++; this.stockRev++;
  },
  /** Take some of what a chest holds into your bag (what does not fit stays in the chest). */
  _chestTake(id, cmd) {
    const p = this.players[id], inventory = this.inventories[id], chest = p && this._chestFor(id, p, cmd); if (!chest) return;
    const { contents, chests, key } = chest, have = contents[cmd.item] | 0; if (!have) return;
    const want = Math.min(have, clamp(cmd.count | 0, 1, HomeCrafts.CHEST_MAX_STACK));
    inventory.limitHit = null;
    const taken = want - inventory.add(cmd.item, want);
    if (!taken) { this._notice(id, inventory.limitHit ? this._carryText(id, inventory.limitHit) : 'No room in your pack'); inventory.limitHit = null; return; }
    if (have - taken > 0) contents[cmd.item] = have - taken; else delete contents[cmd.item];
    if (!Object.keys(contents).length) delete chests[key];
    this.inventoryRev[id]++; this.stockRev++;
    this.pendingEvents.push({ type: 'gain', to: id, item: cmd.item, count: taken });
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

/* ---- locked buildings ---- */
InteractionHandlers.locked_building = (server, id, p, action) => {
  const site = BuildingSites.list[action.site];
  server._notice(id, site && site.def.id === 'vacant_home' ? 'This home stands empty for now: it is waiting for a new neighbour' : `The ${site ? site.def.name : 'door'} is locked`);
};
