'use strict';
/* SHARED - farming. The ground is farmed in HALF-TILE plots (the cells the ground is drawn in: terrainRenderer.js), on open grass or dirt in
 * the overworld.
 *   TILL     a hoe (Use) turns the plot in front of you into soil (or clears a withered crop from it).
 *   PLANT    hold seeds and press the interact key at a tilled plot: a crop that grows in this season takes; out of season it will not.
 *   WATER    a watering can (Use) waters the plot in front of you, for today. The soil darkens.
 *   GROW     each new day, every crop that was watered the day before grows a day; when it has grown its days (data/crops/crops.js, or the
 *            Admin page's) it is ripe. When its season ends, a crop withers. Soil left empty and dry for a few days goes back to grass.
 *   HARVEST  the interact key at a ripe crop: its produce (a crop with `regrow` fruits again; the others leave the soil empty).
 * State: map.farm = { "cx,cy": { w: the day it was last watered, c: crop id ('' empty), d: days grown, dead, idle } } on the overworld,
 * sent to every player like the built floors and saved with the world. Days come from the clock (Seasons.at). */
const FARM_IDLE_DAYS = 5;                                     // empty soil that is not watered for this many days goes back to grass

const Farming = {
  cellOf: (x, y) => [Math.floor(x * 2), Math.floor(y * 2)],
  key: (cx, cy) => cx + ',' + cy,
  /** The plot half a tile ahead of p (where a hoe or a can lands, and what you plant into). */
  frontCell(p) { return Farming.cellOf(p.x + Math.cos(p.facing) * 0.42, p.y + Math.sin(p.facing) * 0.42); },
  /** A point straight ahead (the swing's aim: it keeps your facing, so a row is worked by walking along it). */
  ahead: p => ({ x: p.x + Math.cos(p.facing), y: p.y + Math.sin(p.facing) }),
  plotAt: (map, cx, cy) => (map && map.farm && map.farm[Farming.key(cx, cy)]) || null,
  /** The plot you are facing (or, failing that, standing on). */
  nearPlot(map, p) {
    for (const [cx, cy] of [Farming.frontCell(p), Farming.cellOf(p.x, p.y)]) { const plot = Farming.plotAt(map, cx, cy); if (plot) return { cx, cy, plot }; }
    return null;
  },
  growDays(cropId) { const c = Crops.get(cropId); return (GameSettings.values.crops || {})[cropId] || (c ? c.days : 5); },
  ripe: plot => !!plot.c && !plot.dead && plot.d >= Farming.growDays(plot.c),
  /** 0-2 growing, 3 ripe, 'dead' withered, -1 nothing planted. */
  stage(plot) { if (!plot || !plot.c) return -1; if (plot.dead) return 'dead'; const g = Farming.growDays(plot.c); return plot.d >= g ? 3 : Math.min(2, Math.floor(plot.d / g * 3)); },
  inSeason(cropId, seasonIndex) { const c = Crops.get(cropId); return !!c && c.seasons.includes(Seasons.LIST[seasonIndex].id); },
  seasonNames: cropId => { const c = Crops.get(cropId); return c ? c.seasons.map(s => Seasons.byId(s).name).join(' and ') : ''; },
  /** Open grass or dirt in the overworld, with nothing standing on its tile. */
  tillable(map, cx, cy) {
    if (!map || map.grid || map.kind === 'room') return false;
    const tx = cx >> 1, ty = cy >> 1, t = map.tile(tx, ty);
    if (t !== TILE.GRASS && t !== TILE.DIRT) return false;
    if (map.objAt(tx, ty) || map.built[tileKey(tx, ty)] || (map.floors && map.floors[tileKey(tx, ty)]) || BuildingSites.at(tx, ty)) return false;
    return !map.propAt(tx, ty);                                                                    // (a tree, a bush, a stone, the well...)
  }
};

/* ---- the hoe and the watering can (Use) ---- */
class HoeHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    const [cx, cy] = Farming.frontCell(p), plot = Farming.plotAt(this.map, cx, cy);
    if (gridOf(p)) { this.emit({ type: 'notice', to: p.id, text: 'Farm out in the open, not indoors' }); return null; }
    if (plot && !plot.dead && !plot.c) return null;                                               // (already soil: nothing to do)
    if (plot && plot.c && !plot.dead) { this.emit({ type: 'notice', to: p.id, text: 'Something is growing there' }); return null; }
    if (!plot && !Farming.tillable(this.map, cx, cy)) { this.emit({ type: 'notice', to: p.id, text: 'Till open grass or dirt (nothing standing on it)' }); return null; }
    return { ref: Farming.key(cx, cy), cx, cy, ...Farming.ahead(p) };
  }
  isValid() { return true; }
  apply(id, target) { this.till(id, target.cx, target.cy); }
}
class WaterHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    if (gridOf(p)) return null;
    const [cx, cy] = Farming.frontCell(p);
    return { ref: Farming.key(cx, cy), cx, cy, ...Farming.ahead(p) };
  }
  isValid() { return true; }
  apply(id, target) { this.water(id, target.cx, target.cy); }
}

/* ---- planting, harvesting (the interact key; client + server) ---- */
function findFarmInteraction(map, p, heldItemId) {
  if (!map || map.grid || map.kind === 'room' || !map.farm) return null;
  const near = Farming.nearPlot(map, p); if (!near) return null;
  const { cx, cy, plot } = near, held = heldItemId && ItemDefs[heldItemId];
  if (Farming.ripe(plot)) { const c = Crops.get(plot.c); return { kind: 'harvest', label: 'Harvest ' + (c ? c.name : ''), dist: 0.2, cx, cy }; }
  if (!plot.c && held && held.seed) return { kind: 'plant', label: 'Plant ' + held.name.replace(/ Seeds$/, ''), dist: 0.3, cx, cy };
  if (plot.dead) return { kind: 'clear_crop', label: 'Clear the withered crop', dist: 0.4, cx, cy };
  return null;
}
Interactions.extra.push(findFarmInteraction);
InteractionHandlers.plant = (server, id, p, action) => server._plant(id, p, action);
InteractionHandlers.harvest = (server, id, p, action) => server._harvest(id, p, action);
InteractionHandlers.clear_crop = (server, id, p, action) => server._clearCrop(id, p, action);

/* ---- the server side ---- */
Object.assign(GameServer.prototype, {
  _farm() { return this.map.farm || (this.map.farm = {}); },
  _today() { return Seasons.at(this.tick).day; },
  _farmChanged() { this.farmRev = (this.farmRev || 1) + 1; },
  /** Till a plot (or clear a withered crop from it). */
  _till(id, cx, cy) {
    const farm = this._farm(), key = Farming.key(cx, cy), plot = farm[key];
    if (plot && plot.dead) { plot.c = ''; plot.dead = false; plot.d = 0; }
    else if (!plot) { if (!Farming.tillable(this.map, cx, cy)) return; farm[key] = { w: -1, c: '', d: 0 }; }
    else return;
    this._farmChanged(); this.progress.award(id, 'foraging', 3);
    this.pendingEvents.push({ type: 'till', x: (cx + 0.5) / 2, y: (cy + 0.5) / 2 });
  },
  _water(id, cx, cy) {
    const plot = this._farm()[Farming.key(cx, cy)];
    this.pendingEvents.push({ type: 'watered', x: (cx + 0.5) / 2, y: (cy + 0.5) / 2 });
    if (!plot) return;
    const today = this._today();
    if (plot.w !== today) { plot.w = today; plot.idle = 0; this._farmChanged(); if (plot.c && !plot.dead) this.progress.award(id, 'foraging', 2); }
  },
  _plant(id, p, action) {
    const plot = this._farm()[Farming.key(action.cx, action.cy)], inventory = this.inventories[id], slot = p.sel | 0, s = inventory.slots[slot], def = s && ItemDefs[s.id];
    if (!plot || plot.c) return;
    if (!def || !def.seed) { this._notice(id, 'Hold seeds to plant them'); return; }
    const season = Seasons.at(this.tick);
    if (!Farming.inSeason(def.seed, season.index)) { this._notice(id, `${Crops.get(def.seed).name} only grows in ${Farming.seasonNames(def.seed)}: it is ${season.season.name} now`); return; }
    s.count--; if (s.count <= 0) inventory.slots[slot] = null;
    plot.c = def.seed; plot.d = 0; plot.dead = false; plot.idle = 0;
    this.inventoryRev[id]++; this._farmChanged(); this.progress.award(id, 'foraging', 4);
    this.pendingEvents.push({ type: 'planted', x: (action.cx + 0.5) / 2, y: (action.cy + 0.5) / 2 });
  },
  _harvest(id, p, action) {
    const plot = this._farm()[Farming.key(action.cx, action.cy)];
    if (!plot || !Farming.ripe(plot)) return;
    const crop = Crops.get(plot.c), item = crop.produce || crop.id, [lo, hi] = crop.yield || [1, 1];
    const count = lo + Math.floor(this.rng() * (hi - lo + 1)) + (this.rng() < Skills.bonusYieldChance(p.lv, 'foraging') ? 1 : 0), seeds = this.rng() < 0.25 ? 1 : 0;
    const x = (action.cx + 0.5) / 2, y = (action.cy + 0.5) / 2, inventory = this.inventories[id];
    for (const [it, n] of [[item, count], ['seed_' + crop.id, seeds]]) {
      if (!n) continue;
      const left = inventory.add(it, n);
      if (n - left) this.pendingEvents.push({ type: 'gain', to: id, item: it, count: n - left });
      if (left) this._dropOnGround(it, left, x, y, '');                                              // (a full pack: it lands on the soil)
    }
    if (crop.regrow) plot.d = Math.max(0, Farming.growDays(plot.c) - crop.regrow); else { plot.c = ''; plot.d = 0; }
    this.inventoryRev[id]++; this._farmChanged(); this.progress.award(id, 'foraging', 10);
    this.pendingEvents.push({ type: 'harvested', x, y, color: crop.colors.crop });
  },
  _clearCrop(id, p, action) { this._till(id, action.cx, action.cy); },

  /** Called every tick: each new day grows what was watered the day before, withers what is out of season, lets dry empty soil go back. */
  _farmDays() {
    if (this.tick % 15) return;
    const today = this._today();
    if (this.farmDay === undefined) this.farmDay = today;
    for (let n = 0; this.farmDay < today && n < 400; n++) { this._farmNewDay(this.farmDay); this.farmDay++; }
    if (this.farmDay > today) this.farmDay = today;                                                  // (the clock went back: an older save)
  },
  _farmNewDay(prev) {
    const farm = this._farm(), season = Seasons.indexOfDay(prev + 1);
    for (const [key, plot] of Object.entries(farm)) {
      const watered = plot.w === prev;
      if (plot.c && !plot.dead) {
        if (!Farming.inSeason(plot.c, season)) plot.dead = true;                                     // its season is over
        else if (watered && !Farming.ripe(plot)) plot.d++;
      } else if (!plot.c) {
        plot.idle = watered ? 0 : (plot.idle | 0) + 1;
        if (plot.idle >= FARM_IDLE_DAYS) delete farm[key];                                            // left dry and empty: it grasses over
      }
    }
    this._farmChanged();
  },
  /** The farm, only when it changed since last sent (else null). */
  farmUpdateFor(id) {
    this.farmSentRev = this.farmSentRev || {};
    const rev = this.farmRev || 1;
    if (this.farmSentRev[id] === rev) return null;
    this.farmSentRev[id] = rev;
    return JSON.parse(JSON.stringify(this._farm()));
  }
});
