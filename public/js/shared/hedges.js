'use strict';
/* SHARED - hedges: the HEDGE CUTTER cuts a berry bush down (Use, standing beside it: you get a Hedge Bush, and the berries if it was ripe; the wild bush is a
 * low stub for a few minutes, then grows back), you PLANT the Hedge Bush on open grass or dirt (hold it, press the interact key: next to your home, along a
 * path, anywhere) and it stands there as a solid, TRIMMED hedge. Use the hedge cutter on a hedge to trim it into the next shape (a neat block, a ball, tiers),
 * and a shovel digs it up again.
 * State lives in the FARM table (farming.js) under keys of their own: "h<tx>,<ty>" -> { s: style 0..2, v: variant }. So it is sent to everyone and saved with
 * the world like the fields and the groves; each one is also a real, blocking prop ('hedge') in its chunk (here for a chunk already loaded, and on generation
 * for one that is not), so people and ponies cannot walk through it. */
const HEDGE_STYLES = Object.freeze([{ id: 'block', name: 'a neat block' }, { id: 'ball', name: 'a round ball' }, { id: 'tiers', name: 'tiers' }]);
const BUSH_CUT_REGROW_SECONDS = 300;                                             // a wild bush that was cut down is a stub this long

const Hedges = {
  key: (tx, ty) => 'h' + tx + ',' + ty,
  isKey: key => key.charCodeAt(0) === 104,                                       // 'h'
  tileOf(key) { const i = key.indexOf(','); return [+key.slice(1, i), +key.slice(i + 1)]; },
  at: (map, tx, ty) => (map && map.farm && map.farm[Hedges.key(tx, ty)]) || null,
  /** The tile a step ahead of you (where a hedge goes). */
  frontTile: p => [Math.floor(p.x + Math.cos(p.facing) * 0.9), Math.floor(p.y + Math.sin(p.facing) * 0.9)],
  /** The prop a hedge entry stands as. */
  propOf: (tx, ty, e) => ({ t: 'hedge', x: tx + 0.5, y: ty + 0.5, r: 0.42, v: e.v | 0, s: clamp(e.s | 0, 0, HEDGE_STYLES.length - 1), hp: 0, alive: true }),
  /** Open grass or dirt in the overworld with nothing on the tile (a hedge that was dug up leaves a dead prop: that is free again). */
  plantable(map, tx, ty) {
    if (!map || map.grid || map.kind !== 'world') return false;
    const t = map.tile(tx, ty);
    if (t !== TILE.GRASS && t !== TILE.DIRT) return false;
    if (map.objAt(tx, ty) || map.built[tileKey(tx, ty)] || (map.floors && map.floors[tileKey(tx, ty)]) || BuildingSites.at(tx, ty) || Village.blocksTrees(tx, ty)) return false;
    const prop = map.propAt(tx, ty);
    if (prop && !(prop.t === 'hedge' && prop.alive === false)) return false;
    if (Hedges.at(map, tx, ty) || Groves.at(map, tx, ty)) return false;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) if (Farming.plotAt(map, tx * 2 + sx, ty * 2 + sy)) return false;
    return true;
  },
  /** Stand the hedge in its chunk (if that chunk is loaded), or refresh it there. */
  place(map, tx, ty, entry, chunk = map.peekChunkOfTile(tx, ty)) {
    if (!chunk) return;
    const li = ((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK), i = chunk.propIndex[li], prop = Hedges.propOf(tx, ty, entry);
    if (i >= 0) { if (chunk.props[i].t === 'hedge') { Object.assign(chunk.props[i], prop); chunk.renderItems = null; } return; }
    addChunkProp(chunk, li, prop);
    chunk.renderItems = null;                                                      // (the renderer's list of what stands in the chunk)
  },
  /** The hedge is gone (dug up): its prop stays in the chunk but no longer exists. */
  remove(map, tx, ty) {
    const prop = map.peekPropAt(tx, ty);
    if (prop && prop.t === 'hedge') { prop.alive = false; const chunk = map.peekChunkOfTile(tx, ty); if (chunk) chunk.renderItems = null; }
  },
  /** A player's machine, after the farm arrives: every hedge stands in the loaded chunks and any that were dug up are gone. */
  sync(map) {
    if (!map || !map.farm) return;
    for (const key in map.farm) if (Hedges.isKey(key)) { const [tx, ty] = Hedges.tileOf(key); Hedges.place(map, tx, ty, map.farm[key]); }
    for (const chunk of map.chunks.values()) for (const prop of chunk.props) {
      if (prop.t === 'hedge' && prop.alive && !map.farm[Hedges.key(Math.floor(prop.x), Math.floor(prop.y))]) { prop.alive = false; chunk.renderItems = null; }
    }
  },
  /** A chunk being generated takes the hedges planted in it. */
  intoChunk(world, chunk) {
    if (!world.farm) return;
    const x0 = chunk.cx * CHUNK_SIZE, y0 = chunk.cy * CHUNK_SIZE;
    for (const key in world.farm) {
      if (!Hedges.isKey(key)) continue;
      const [tx, ty] = Hedges.tileOf(key);
      if (tx >= x0 && tx < x0 + CHUNK_SIZE && ty >= y0 && ty < y0 + CHUNK_SIZE) Hedges.place(world, tx, ty, world.farm[key], chunk);
    }
  },
  /** The nearest hedge (alive) within `range` of the player: { tx, ty, prop, dist } or null. */
  near(map, p, range) {
    const span = Math.ceil(range + 1), px = Math.floor(p.x), py = Math.floor(p.y);
    let best = null;
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const prop = map.propAt(tx, ty);
      if (!prop || prop.t !== 'hedge' || !prop.alive) continue;
      const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
      if (dist <= range + prop.r && (!best || dist < best.dist)) best = { tx, ty, prop, dist };
    }
    return best;
  }
};

/* ---- planting (the interact key; client + server) ---- */
function findHedgeInteraction(map, p, heldItemId) {
  const held = heldItemId && ItemDefs[heldItemId];
  if (!held || !held.hedge) return null;
  const [tx, ty] = Hedges.frontTile(p);
  return Hedges.plantable(map, tx, ty) ? { kind: 'plant_hedge', label: 'Plant ' + held.name, dist: 0.35, tx, ty } : null;
}
Interactions.extra.push(findHedgeInteraction);
InteractionHandlers.plant_hedge = (server, id, p, action) => server._plantHedge(id, p, action);

/* ---- the hedge cutter: cut a bush down, or trim a hedge ---- */
class HedgeCutterHandler {
  /** @param {{map, getInventory, emit, getPlayer, award, rng, forage, cutBush:(id, found)=>void, trimHedge:(id, found)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    if (gridOf(p) || p.mount || p.boat) return null;
    const hedge = Hedges.near(this.map, p, tool.reach);
    if (hedge) return { ref: 'trim' + tileKey(hedge.tx, hedge.ty), kind: 'trim', x: hedge.prop.x, y: hedge.prop.y, found: hedge };
    const span = Math.ceil(tool.reach + 1), px = Math.floor(p.x), py = Math.floor(p.y);
    let best = null;
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const prop = this.map.propAt(tx, ty);
      if (!prop || prop.t !== 'bush' || prop.cut) continue;
      const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
      if (dist <= tool.reach + 0.4 && (!best || dist < best.dist)) best = { tx, ty, prop, dist };
    }
    if (best) return { ref: 'cut' + tileKey(best.tx, best.ty), kind: 'cut', x: best.prop.x, y: best.prop.y, found: best };
    this.emit({ type: 'notice', to: p.id, text: 'Stand beside a berry bush to cut it down, or a hedge to trim it' });
    return null;
  }
  isValid(p, target, tool) {
    const f = target.found, prop = this.map.propAt(f.tx, f.ty);
    if (!prop || Math.hypot(prop.x - p.x, prop.y - p.y) > tool.reach + 0.4 + IMPACT_REACH_SLACK) return false;
    return target.kind === 'trim' ? prop.t === 'hedge' && prop.alive : prop.t === 'bush' && !prop.cut;
  }
  apply(id, target) { if (target.kind === 'trim') this.trimHedge(id, target.found); else this.cutBush(id, target.found); }
}

/** A shovel digs up a hedge when there is no mound or buried treasure to dig. */
function withHedgeDig(primary, dig) {
  return {
    find(p, tool, id) {
      const t = primary.find(p, tool, id);
      if (t) return Object.assign(t, { by: primary });
      if (gridOf(p)) return null;
      const hedge = Hedges.near(dig.map, p, tool.reach);
      return hedge ? { ref: 'dig' + tileKey(hedge.tx, hedge.ty), kind: 'digHedge', x: hedge.prop.x, y: hedge.prop.y, found: hedge, by: dig } : null;
    },
    isValid: (p, t, tool) => t.by.isValid(p, t, tool),
    apply: (id, t, tool) => t.by.apply(id, t, tool)
  };
}
class HedgeDigHandler {
  constructor(deps) { Object.assign(this, deps); }
  isValid(p, target, tool) { const prop = this.map.propAt(target.found.tx, target.found.ty); return !!prop && prop.t === 'hedge' && prop.alive && Math.hypot(prop.x - p.x, prop.y - p.y) <= tool.reach + 0.4 + IMPACT_REACH_SLACK; }
  apply(id, target) { this.digHedge(id, target.found); }
}

/* ---- the server side ---- */
Object.assign(GameServer.prototype, {
  _plantHedge(id, p, action) {
    const inventory = this.inventories[id], slot = p.sel | 0, s = inventory.slots[slot], def = s && ItemDefs[s.id];
    if (!def || !def.hedge) { this._notice(id, 'Hold a hedge bush to plant it'); return; }
    if (!Hedges.plantable(this.map, action.tx, action.ty)) { this._notice(id, 'Plant it on open grass or dirt, with nothing on the spot'); return; }
    s.count--; if (s.count <= 0) inventory.slots[slot] = null;
    const entry = { s: Math.floor(this.rng() * HEDGE_STYLES.length), v: Math.floor(this.rng() * 8) };
    this._farm()[Hedges.key(action.tx, action.ty)] = entry; Hedges.place(this.map, action.tx, action.ty, entry);
    this.inventoryRev[id]++; this._farmChanged(); this.progress.award(id, 'foraging', 6);
    this.pendingEvents.push({ type: 'planted', x: action.tx + 0.5, y: action.ty + 0.5 });
    this._notice(id, 'Hedge planted: trim it into shape with a hedge cutter');
  },
  /** The hedge cutter on a wild bush: the berries (if ripe) and a Hedge Bush to plant, and the bush is a stub until it grows back. */
  _cutBush(id, found) {
    const inventory = this.inventories[id], p = this.players[id], prop = found.prop, ripe = !!prop.ripe, berry = prop.drop;
    const gave = (item, n) => { const left = inventory.add(item, n); if (n - left) this.pendingEvents.push({ type: 'gain', to: id, item, count: n - left }); if (left) this._dropOnGround(item, left, prop.x, prop.y, ''); };
    this.forage.cut(found.tx, found.ty, BUSH_CUT_REGROW_SECONDS);
    gave('hedge_bush', 1);
    if (ripe) gave(berry, this.forage.rollYield(prop) + (this.rng() < Skills.bonusYieldChance(p.lv, 'foraging') ? 1 : 0));
    this.inventoryRev[id]++; this.progress.award(id, 'foraging', 14);
    this.pendingEvents.push({ type: 'cut', key: tileKey(found.tx, found.ty), x: prop.x, y: prop.y, by: id });
  },
  /** The hedge cutter on a hedge: the next trim. */
  _trimHedge(id, found) {
    const key = Hedges.key(found.tx, found.ty), entry = this._farm()[key];
    if (!entry) return;
    entry.s = ((entry.s | 0) + 1) % HEDGE_STYLES.length;
    Hedges.place(this.map, found.tx, found.ty, entry); this._farmChanged(); this.progress.award(id, 'foraging', 4);
    this.pendingEvents.push({ type: 'trim', key: tileKey(found.tx, found.ty), x: found.prop.x, y: found.prop.y, by: id, style: entry.s });
    this._notice(id, 'Trimmed into ' + HEDGE_STYLES[entry.s].name);
  },
  /** A shovel digs a hedge up: it goes back into the pack (or lands on the ground). */
  _digHedge(id, found) {
    const farm = this._farm(), key = Hedges.key(found.tx, found.ty), inventory = this.inventories[id];
    if (!farm[key]) return;
    delete farm[key]; Hedges.remove(this.map, found.tx, found.ty);
    const left = inventory.add('hedge_bush', 1);
    if (left) this._dropOnGround('hedge_bush', left, found.prop.x, found.prop.y, ''); else this.pendingEvents.push({ type: 'gain', to: id, item: 'hedge_bush', count: 1 });
    this.inventoryRev[id]++; this._farmChanged();
    this.pendingEvents.push({ type: 'dugHedge', key: tileKey(found.tx, found.ty), x: found.prop.x, y: found.prop.y, by: id });
  }
});
