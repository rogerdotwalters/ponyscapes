'use strict';
/* SHARED - the grass. Every grass tile has a clump of SHORT, MEDIUM or TALL grass (1, 2, 3) that the land decides for itself:
 *   where it grows  wet ground and lush biomes grow taller (a jungle's thick, ice and fire thin), in meadow patches; it stays short in the
 *                   village and right beside buildings and walls;
 *   when            winter keeps it short; it is at its tallest from spring to autumn;
 *   cut             with a knife, a sword, shears or a sickle (a sickle mows a three-tile swath) it drops HAY (tall 2, medium 1, short now and
 *                   then) and starts again from nothing. It grows back a stage at a time, faster in lush biomes and where the grass around
 *                   it is tall (it SPREADS from its neighbours), until it is as tall as that spot allows.
 * Only cut tiles are stored: in the FARM table (farming.js) as "c<tx>,<ty>" -> { t: the tick it was cut }, so they are sent to every player and
 * saved with the world like the fields; a tile that has grown back is forgotten again. Everything else is a pure function of the land and the
 * clock, so every machine agrees. The client draws it and makes it sway and part around whoever walks through (grassRenderer.js). */
const Grass = (() => {
  const LUSH = { jungle: 0.35, magic: 0.15, rainbow: 0.1, forest: 0.1, apple: 0.05, candy: 0, normal: 0, crystal: -0.3, ice: -0.5, fire: -0.6 };
  const GROW = { jungle: 0.6, magic: 0.8, forest: 0.9, ice: 2, fire: 2.5, crystal: 1.6 };   // how long each stage takes, x (lower: faster)
  const STAGE_HOURS = 3;                                                    // in-game hours to grow one stage (before biome and neighbours)
  const HAY = [0, 0, 1, 2];                                                 // hay a cut gives, by height (short: a quarter of the time)
  const cache = new Map();
  const key = (tx, ty) => 'c' + tx + ',' + ty;
  const isKey = k => k.charCodeAt(0) === 99;                                // 'c'
  const tileOf = k => { const i = k.indexOf(','); return [+k.slice(1, i), +k.slice(i + 1)]; };
  /** A smooth 0..1 noise over meadow-sized patches (so tall grass grows in drifts, not speckles). */
  function patch(seed, tx, ty) {
    const S = 7, x = tx / S, y = ty / S, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash3(seed, a, b, 401);
    return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
  }
  /** How tall the grass at a tile grows by itself, before the season: 0 (not grass) .. 3. Remembered per tile. */
  function natural(map, tx, ty) {
    if (!map || map.kind !== 'world') return 0;
    const k = tx * 65536 + ty;
    let v = cache.get(k);
    if (v !== undefined && cache.mapRef === map) return v;
    if (cache.mapRef !== map) { cache.clear(); cache.mapRef = map; }
    if (map.tile(tx, ty) !== TILE.GRASS) v = 0;
    else if (Village.influence(tx, ty) > 0.3) v = 1;                                       // the village keeps its grass short
    else {
      const T = map.terrain, wet = T.moisture ? T.moisture(tx, ty) : 0, lush = 0.45 + 0.45 * wet + (LUSH[map.biome(tx, ty)] || 0);
      const s = lush * 0.55 + patch(T.seed, tx, ty) * 0.75 + (hash3(T.seed, tx, ty, 402) - 0.5) * 0.25;
      v = s > 0.9 ? 3 : s > 0.62 ? 2 : 1;
      if (v > 1) for (let dy = -1; dy <= 1 && v > 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.objAt(tx + dx, ty + dy)) { v = 1; break; }   // trimmed by walls and buildings
    }
    if (cache.size > 60000) { cache.clear(); cache.mapRef = map; }
    cache.set(k, v); return v;
  }
  /** The tallest it can be in this season (winter keeps it short). */
  const seasonCap = tick => (Seasons.at(tick).season.id === 'winter' ? 1 : 3);
  /** Ticks per stage of regrowth at a tile: the biome, and the tall grass around it (it spreads). */
  function stageTicks(map, tx, ty) {
    let tallNear = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && natural(map, tx + dx, ty + dy) >= 2 && !(map.farm && map.farm[key(tx + dx, ty + dy)])) tallNear++;
    const hour = CONFIG.sim.time.dayLengthSeconds * CONFIG.sim.tickRate / 24;
    return STAGE_HOURS * hour * (GROW[map.biome(tx, ty)] || 1) * Math.max(0.5, 1.4 - 0.12 * tallNear);
  }
  /** How tall it would be if nobody had cut it. */
  const full = (map, tx, ty, tick) => Math.min(natural(map, tx, ty), seasonCap(tick));
  /** How tall the grass is now: 0 (none, or just cut) .. 3. */
  function levelAt(map, tx, ty, tick) {
    const n = full(map, tx, ty, tick);
    if (!n) return 0;
    const cut = map.farm && map.farm[key(tx, ty)];
    if (!cut) return n;
    return Math.max(0, Math.min(n, Math.floor((tick - cut.t) / stageTicks(map, tx, ty))));
  }
  /** The tiles a cut reaches: the one in front of you, and for a sickle the ones either side of it too. */
  function swath(p, wide) {
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing), cx = p.x + fx * 0.9, cy = p.y + fy * 0.9, out = [[Math.floor(cx), Math.floor(cy)]];
    if (wide) for (const s of [-0.8, 0.8]) out.push([Math.floor(cx - fy * s), Math.floor(cy + fx * s)]);
    return out;
  }
  return { key, isKey, tileOf, natural, full, levelAt, stageTicks, swath, HAY };
})();

/** Cutting grass: what the sickle does, and what a knife, a sword or shears do when there is nothing else to strike. */
class GrassCutHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    if (gridOf(p) || p.mount || p.boat) return null;
    const tick = this.tick(), tiles = Grass.swath(p, tool.kind === 'sickle').filter(([tx, ty]) => Grass.levelAt(this.map, tx, ty, tick) > 0);
    if (!tiles.length) { if (tool.kind === 'sickle') this.emit({ type: 'notice', to: p.id, text: 'No grass to cut there' }); return null; }
    const [tx, ty] = tiles[0];
    return { ref: 'grass:' + tx + ',' + ty, x: tx + 0.5, y: ty + 0.5, tiles };
  }
  isValid() { return true; }
  apply(id, target) { this.cutGrass(id, target.tiles); }
}
/** A tool that does its own job first (strike an animal, shear a sheep) and cuts grass when there is nothing for that. Its own "nothing here"
 *  message is only shown when there is no grass either. */
function withGrass(primary, grass) {
  return {
    precheck: primary.precheck ? (id, tool) => primary.precheck(id, tool) : undefined,
    find(p, tool, id) {
      const emit = primary.emit; let said = null;
      if (emit) primary.emit = e => { if (e.type === 'notice') said = e; else emit(e); };
      let t; try { t = primary.find(p, tool, id); } finally { if (emit) primary.emit = emit; }
      if (t) return Object.assign(t, { by: primary });
      const g = grass.find(p, tool);
      if (g) return Object.assign(g, { by: grass });
      if (said && emit) emit(said);
      return null;
    },
    isValid: (p, t, tool) => t.by.isValid(p, t, tool),
    apply: (id, t, tool) => t.by.apply(id, t, tool)
  };
}

Object.assign(GameServer.prototype, {
  /** Cut the grass on these tiles: each drops its hay and starts growing again. */
  _cutGrass(id, tiles) {
    const p = this.players[id], farm = this._farm();
    let hay = 0, any = false;
    for (const [tx, ty] of tiles) {
      const level = Grass.levelAt(this.map, tx, ty, this.tick);
      if (!level) continue;
      any = true;
      farm[Grass.key(tx, ty)] = { t: this.tick };
      const n = Grass.HAY[level] + (level === 1 && this.rng() < 0.25 ? 1 : 0) + (level > 1 && this.rng() < Skills.bonusYieldChance(p.lv, 'foraging') ? 1 : 0);
      if (n) this._dropOnGround('hay', n, tx + 0.5 + (this.rng() - 0.5) * 0.4, ty + 0.5 + (this.rng() - 0.5) * 0.4, '');
      hay += n;
      this.pendingEvents.push({ type: 'grassCut', x: tx + 0.5, y: ty + 0.5, level });
    }
    if (!any) return;
    this._farmChanged(); this.progress.award(id, 'foraging', 2 + hay * 2);
  },
  /** Now and then: forget cut tiles that have grown back (they look after themselves from then on). */
  _pruneGrass() {
    if (this.tick % 600) return;
    const farm = this._farm(); let changed = false;
    for (const k in farm) {
      if (!Grass.isKey(k)) continue;
      const [tx, ty] = Grass.tileOf(k);
      if (Grass.levelAt(this.map, tx, ty, this.tick) >= Grass.full(this.map, tx, ty, this.tick)) { delete farm[k]; changed = true; }
    }
    if (changed) this._farmChanged();
  }
});
