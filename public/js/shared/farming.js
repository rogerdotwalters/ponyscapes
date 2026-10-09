'use strict';
/* SHARED - farming. A TILLED TILE is a FIELD of 3 x 3 little plots ("sub tiles"), on open grass or dirt in the overworld.
 *   TILL     a hoe (Use) on open ground turns the whole tile into a field of nine loose, tilled plots. Tap the field with a hoe, shovel, watering can
 *            or seeds in hand and the GARDEN WINDOW opens (gardenUI.js): the nine plots, your seed packs on the side, and your tools.
 *   In the window (field commands, `_fieldOp` below):
 *     hoe     loosens a plot that has packed down again (after a harvest, or a withered crop cleared)
 *     shovel  digs a hole in a loose plot
 *     seeds   drag them from an open pouch (seedPouchUI.js) into a dug hole: a crop that grows in this season takes; out of season it will not
 *     hand    covers a seed with soil (or fills an empty hole), clears a withered crop, and picks a ripe one
 *     can     waters a plot, for today. The soil darkens. (A watering can used in the world waters the whole field.) Rain waters every plot too.
 *   GROW     each new day, every COVERED crop that was watered the day before grows a day; when it has grown its days (data/crops/crops.js, or the
 *            Admin page's) it is ripe. When its season ends, a crop withers. A field left empty and dry for a few days goes back to grass.
 *   HARVEST  the hand on a ripe crop: its produce (a crop with `regrow` fruits again; the others leave a packed plot to be loosened with a hoe).
 * State: map.farm["f<tx>,<ty>"] = { cells: [9 x { w: the day it was last watered, c: crop id ('' empty), d: days grown, dead, h: 1 dug, v: 1 covered,
 * u: 1 packed down }], idle } on the overworld, sent to every player like the built floors and saved with the world. Days come from the clock (Seasons.at). */
const FARM_IDLE_DAYS = 5;                                     // empty soil that is not watered for this many days goes back to grass

const Farming = {
  N: 3, CELLS: 9, REACH: 4,                                     // a field is N x N plots; you work it from within REACH tiles
  cellOf: (x, y) => [Math.floor(x * 2), Math.floor(y * 2)],     // (the half-tile the hoe / can lands on: the field is the tile that holds it)
  key: (tx, ty) => 'f' + tx + ',' + ty,
  isKey: key => key.charCodeAt(0) === 102,                      // 'f'
  tileOf: key => { const i = key.indexOf(','); return [+key.slice(1, i), +key.slice(i + 1)]; },
  /** The plot half a tile ahead of p (where a hoe or a can lands). */
  frontCell(p) {
    const aim = AimPoints[p.id];
    if (aim && Math.hypot(aim.x - p.x, aim.y - p.y) <= 1.8) return Farming.cellOf(aim.x, aim.y);      // clicked / tapped close by: exactly that spot
    return Farming.cellOf(p.x + Math.cos(p.facing) * 0.42, p.y + Math.sin(p.facing) * 0.42);
  },
  /** A point straight ahead (the swing's aim: it keeps your facing, so a row is worked by walking along it). */
  ahead: p => ({ x: p.x + Math.cos(p.facing), y: p.y + Math.sin(p.facing) }),
  newCell: () => ({ w: -1, c: '', d: 0 }),
  newField: () => ({ cells: Array.from({ length: Farming.CELLS }, Farming.newCell), idle: 0 }),
  fieldAt: (map, tx, ty) => (map && map.farm && map.farm[Farming.key(tx, ty)]) || null,
  /** The field that holds the half-tile cell (cx, cy) (hedges and saplings ask, to keep off fields). */
  plotAt: (map, cx, cy) => Farming.fieldAt(map, cx >> 1, cy >> 1),
  /** The field you are facing (or, failing that, standing on): { tx, ty, field }. */
  nearField(map, p) {
    for (const [cx, cy] of [Farming.frontCell(p), Farming.cellOf(p.x, p.y)]) { const field = Farming.plotAt(map, cx, cy); if (field) return { tx: cx >> 1, ty: cy >> 1, field }; }
    return null;
  },
  /** An old save's half-tile plot (2 x 2 to a tile) as a plot of the 3 x 3 field: the half-tile's corner. */
  legacyIndex: (cx, cy) => (cy & 1) * 2 * 3 + (cx & 1) * 2,
  growDays(cropId) { const c = Crops.get(cropId); return (GameSettings.values.crops || {})[cropId] || (c ? c.days : 5); },
  ripe: plot => !!plot.c && !!plot.v && !plot.dead && plot.d >= Farming.growDays(plot.c),
  /** 0-2 growing, 3 ripe, 'dead' withered, -1 nothing planted (or a seed still uncovered). */
  stage(plot) { if (!plot || !plot.c || !plot.v) return -1; if (plot.dead) return 'dead'; const g = Farming.growDays(plot.c); return plot.d >= g ? 3 : Math.min(2, Math.floor(plot.d / g * 3)); },
  inSeason(cropId, seasonIndex) { const c = Crops.get(cropId); return !!c && c.seasons.includes(Seasons.LIST[seasonIndex].id); },
  seasonNames: cropId => { const c = Crops.get(cropId); return c ? c.seasons.map(s => Seasons.byId(s).name).join(' and ') : ''; },
  /** What a plot looks like to the player: 'packed' (needs the hoe), 'loose' (tilled), 'hole', 'seed' (uncovered), 'growing', 'ripe', 'dead'. */
  stateOf(plot) {
    if (plot.c) return !plot.v ? 'seed' : plot.dead ? 'dead' : Farming.ripe(plot) ? 'ripe' : 'growing';
    return plot.u ? 'packed' : plot.h ? 'hole' : 'loose';
  },
  /** Does the player carry a tool of this kind (hoe, shovel, water)? */
  hasTool: (inventory, kind) => inventory.slots.some(s => { const t = s && ItemDB.getTool(s.id); return !!t && t.kind === kind; }),
  /** Open grass or dirt in the overworld, with nothing standing on its tile. */
  tillable(map, cx, cy) {
    if (!map || map.grid || map.kind === 'room') return false;
    const tx = cx >> 1, ty = cy >> 1, t = map.tile(tx, ty);
    if (t !== TILE.GRASS && t !== TILE.DIRT) return false;
    if (map.objAt(tx, ty) || map.built[tileKey(tx, ty)] || (map.floors && map.floors[tileKey(tx, ty)]) || BuildingSites.at(tx, ty)) return false;
    if (typeof Groves !== 'undefined' && Groves.at(map, tx, ty)) return false;                    // (a sapling growing there)
    return !map.propAt(tx, ty);                                                                    // (a tree, a bush, a stone, the well...)
  }
};

/* ---- the hoe and the watering can (Use) ---- */
class HoeHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    const [cx, cy] = Farming.frontCell(p);
    if (gridOf(p)) { this.emit({ type: 'notice', to: p.id, text: 'Farm out in the open, not indoors' }); return null; }
    if (Farming.plotAt(this.map, cx, cy)) { this.emit({ type: 'openGarden', to: p.id, tx: cx >> 1, ty: cy >> 1 }); return null; }     // (already a field: work its plots in the garden window)
    if (!Farming.tillable(this.map, cx, cy)) { this.emit({ type: 'notice', to: p.id, text: 'Till open grass or dirt (nothing standing on it)' }); return null; }
    return { ref: Farming.key(cx >> 1, cy >> 1), cx, cy, ...Farming.ahead(p) };
  }
  isValid() { return true; }
  apply(id, target) { this.till(id, target.cx, target.cy); }
}
class WaterHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    if (gridOf(p)) return null;
    const [cx, cy] = Farming.frontCell(p);
    return { ref: Farming.key(cx >> 1, cy >> 1), cx, cy, ...Farming.ahead(p) };
  }
  isValid() { return true; }
  apply(id, target) { this.water(id, target.cx, target.cy); }
}

/* ---- the server side ---- */
Object.assign(GameServer.prototype, {
  _farm() { return this.map.farm || (this.map.farm = {}); },
  _today() { return Seasons.at(this.tick).day; },
  _farmChanged() { this.farmRev = (this.farmRev || 1) + 1; },
  /** Till the tile that holds half-tile cell (cx, cy) into a field of nine tilled plots. */
  _till(id, cx, cy) {
    const farm = this._farm(), tx = cx >> 1, ty = cy >> 1, key = Farming.key(tx, ty);
    if (farm[key] || !Farming.tillable(this.map, cx, cy)) return;
    farm[key] = Farming.newField(); this._farmChanged(); this.progress.award(id, 'foraging', 3);
    this.pendingEvents.push({ type: 'till', x: tx + 0.5, y: ty + 0.5 });
  },
  /** A watering can swung in the world: every plot of the field in front of you is watered for today. */
  _water(id, cx, cy) {
    const field = this._farm()[Farming.key(cx >> 1, cy >> 1)];
    this.pendingEvents.push({ type: 'watered', x: (cx + 0.5) / 2, y: (cy + 0.5) / 2 });
    if (!field) return;
    const today = this._today(); let any = false;
    for (const plot of field.cells) if (plot.w !== today) { plot.w = today; any = true; if (plot.c && !plot.dead) this.progress.award(id, 'foraging', 1); }
    if (any) { field.idle = 0; this._farmChanged(); }
  },
  /** One thing done to one plot of a field from the garden window: { op: 'till'|'dig'|'water'|'plant'|'cover'|'clear'|'harvest', tx, ty, i, item? }. The server
   *  checks the reach, the tool you carry and the seeds you hold; the client only says what it wants. */
  _fieldOp(id, cmd) {
    const p = this.players[id], inventory = this.inventories[id];
    if (!p || !inventory || gridOf(p) || !cmd) return;
    const { tx, ty, i } = cmd;
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || !Number.isInteger(i) || i < 0 || i >= Farming.CELLS) return;
    const field = Farming.fieldAt(this.map, tx, ty), op = cmd.op;
    if (!field) return;
    if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > Farming.REACH + 1) { this._notice(id, 'Walk closer to the field'); return; }
    const plot = field.cells[i], x = tx + (i % 3 + 0.5) / 3, y = ty + (Math.floor(i / 3) + 0.5) / 3, today = this._today(), event = type => this.pendingEvents.push({ type, x, y });
    const need = (kind, what) => Farming.hasTool(inventory, kind) || (this._notice(id, `You need ${what} for that`), false);
    const reset = () => { plot.c = ''; plot.d = 0; plot.dead = false; plot.v = 0; plot.h = 0; plot.u = 1; };            // (a plot worked out: it packs down)
    if (op === 'till') {                                                                                      // loosen a packed plot
      if (!plot.u || !need('hoe', 'a hoe')) return;
      plot.u = 0; event('till');
    } else if (op === 'dig') {
      if (plot.c || plot.h) return;
      if (plot.u) { this._notice(id, 'The soil is packed hard: loosen it with the hoe first'); return; }
      if (!need('shovel', 'a shovel')) return;
      plot.h = 1; event('till');
    } else if (op === 'water') {
      if (plot.w === today || !need('water', 'a watering can')) return;
      plot.w = today; field.idle = 0; event('watered');
      if (plot.c && !plot.dead) this.progress.award(id, 'foraging', 2);
    } else if (op === 'plant') {
      const item = typeof cmd.item === 'string' ? cmd.item : '', def = ItemDefs[item];
      if (!def || !def.seed || plot.c || !plot.h) return;
      if (!inventory.has(item, 1)) { this._notice(id, 'You have no more of those seeds'); return; }
      const season = Seasons.at(this.tick);
      if (!Farming.inSeason(def.seed, season.index)) { this._notice(id, `${Crops.get(def.seed).name} only grows in ${Farming.seasonNames(def.seed)}: it is ${season.season.name} now`); return; }
      inventory.remove(item, 1); this.inventoryRev[id]++;
      plot.c = def.seed; plot.d = 0; plot.dead = false; plot.v = 0; field.idle = 0; this.progress.award(id, 'foraging', 2); event('planted');
    } else if (op === 'cover') {
      if (plot.c && !plot.v) { plot.v = 1; this.progress.award(id, 'foraging', 2); event('planted'); }
      else if (!plot.c && plot.h) { plot.h = 0; event('till'); }                                              // (an empty hole filled in)
      else return;
    } else if (op === 'clear') {
      if (!plot.c || !plot.dead) return;
      reset(); event('till');
    } else if (op === 'harvest') {
      if (!Farming.ripe(plot)) return;
      this._harvestPlot(id, p, plot, x, y);
    } else return;
    this._farmChanged();
  },
  _harvestPlot(id, p, plot, x, y) {
    const crop = Crops.get(plot.c), item = crop.produce || crop.id, [lo, hi] = crop.yield || [1, 1];
    const count = lo + Math.floor(this.rng() * (hi - lo + 1)) + (this.rng() < Skills.bonusYieldChance(p.lv, 'foraging') ? 1 : 0), seeds = this.rng() < 0.25 ? 1 : 0;
    const inventory = this.inventories[id];
    for (const [it, n] of [[item, count], ['seed_' + crop.id, seeds]]) {
      if (!n) continue;
      const left = inventory.add(it, n);
      if (n - left) this.pendingEvents.push({ type: 'gain', to: id, item: it, count: n - left });
      if (left) this._dropOnGround(it, left, x, y, '');                                              // (a full pack: it lands on the soil)
    }
    if (crop.regrow) plot.d = Math.max(0, Farming.growDays(plot.c) - crop.regrow); else { plot.c = ''; plot.d = 0; plot.v = 0; plot.h = 0; plot.u = 1; }
    this.inventoryRev[id]++; this.progress.award(id, 'foraging', 10);
    this.pendingEvents.push({ type: 'harvested', x, y, color: crop.colors.crop });
  },

  /** Called every tick: each new day grows what was watered the day before, withers what is out of season, lets dry empty fields go back. */
  _farmDays() {
    this._pruneGrass();
    if (this.tick % 15) return;
    const today = this._today();
    if (this.farmDay === undefined) this.farmDay = today;
    for (let n = 0; this.farmDay < today && n < 400; n++) { this._farmNewDay(this.farmDay); this.farmDay++; }
    if (this.farmDay > today) this.farmDay = today;                                                  // (the clock went back: an older save)
  },
  _farmNewDay(prev) {
    const farm = this._farm(), season = Seasons.indexOfDay(prev + 1);
    for (const [key, field] of Object.entries(farm)) {
      if (Groves.isKey(key)) { this._growGrove(key, field); continue; }                              // a planted sapling (groves.js): it grows every day
      if (!Farming.isKey(key)) continue;                                                             // cut grass (grass.js) and hedges: they grow back by themselves
      let busy = false;
      for (const plot of field.cells) {
        const watered = plot.w === prev;
        if (plot.c) {
          busy = true;
          if (plot.dead) continue;
          if (!Farming.inSeason(plot.c, season)) plot.dead = true;                                   // its season is over
          else if (plot.v && watered && !Farming.ripe(plot)) plot.d++;
        } else if (watered) busy = true;
      }
      field.idle = busy ? 0 : (field.idle | 0) + 1;
      if (field.idle >= FARM_IDLE_DAYS) delete farm[key];                                            // left dry and empty: it grasses over
    }
    if (prev >= this._today() - 1 && typeof this._spreadFlora === 'function') this._spreadFlora(prev);                       // the trees seed their neighbours (floraSystem.js; only for the day that has just ended, not a long catch-up)
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
