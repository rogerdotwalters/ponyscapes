'use strict';
/* SHARED - tree state helpers (used by both sides) + the server-only TreeSystem.
 * A tree is identified by its tile key. Only damaged / felled trees are stored (map.treeStates), so the
 * world can be generated, dropped and regenerated without losing what players did to it. */

const treeAt = (map, tx, ty) => { const p = map.propAt(tx, ty); return p && p.t === 'tree' ? p : null; };

/** Records a tree's state and applies it to the prop if its chunk is loaded. */
function setTreeState(map, tx, ty, hp, alive) {
  const key = tileKey(tx, ty);
  if (alive && hp >= TreeDef.maxHp) delete map.treeStates[key]; else map.treeStates[key] = { hp, alive };
  const tree = map.peekPropAt(tx, ty);
  if (tree && tree.t === 'tree') { tree.hp = hp; tree.alive = alive; }
}

/** Client side: adopt the server's list of damaged / felled trees. */
function applyTreeStates(map, states) {
  for (const key of Object.keys(map.treeStates)) if (!(key in states)) setTreeState(map, keyTileX(key), keyTileY(key), TreeDef.maxHp, true);
  for (const key of Object.keys(states)) {
    const s = states[key], current = map.treeStates[key];
    if (!current || current.hp !== s.hp || current.alive !== s.alive) setTreeState(map, keyTileX(key), keyTileY(key), s.hp, s.alive);
  }
}

/** Server side: only trees that differ from "healthy" are sent (a delta-friendly snapshot). */
const collectTreeStates = map => JSON.parse(JSON.stringify(map.treeStates));

const FACING_PREFERENCE = 0.35;   // among trees in reach, prefer the one the player is facing

/** Nearest living tree within `reach` (measured from the player to the trunk's edge) as { tx, ty, tree }, or null. */
function findTreeInReach(map, p, reach) {
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing), span = Math.ceil(reach + 1);
  const px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null, bestScore = Infinity;
  for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
    const tree = treeAt(map, tx, ty);
    if (!tree || !tree.alive) continue;
    const dx = tree.x - p.x, dy = tree.y - p.y, centreDist = Math.hypot(dx, dy), gap = centreDist - tree.r;
    if (gap > reach) continue;
    const score = gap - FACING_PREFERENCE * (centreDist > 1e-6 ? (dx * fx + dy * fy) / centreDist : 0);
    if (score < bestScore) { bestScore = score; best = { tx, ty, tree }; }
  }
  return best;
}

/** Server-authoritative tree health + respawn timers. */
class TreeSystem {
  constructor(map, rng, getTick) { this.map = map; this.rng = rng; this.getTick = getTick; this.respawns = []; }

  damage(tx, ty, amount) {
    const tree = treeAt(this.map, tx, ty);
    const hp = Math.max(0, tree.hp - amount), felled = hp === 0;
    setTreeState(this.map, tx, ty, hp, !felled);
    if (felled) this.respawns.push({ tx, ty, atTick: this.getTick() + secondsToTicks(TreeDef.respawnSeconds) });
    return { felled };
  }

  rollLogCount() { return TreeDef.logsMin + Math.floor(this.rng() * (TreeDef.logsMax - TreeDef.logsMin + 1)); }

  update(tick) {
    this.respawns = this.respawns.filter(r => {
      if (r.atTick > tick) return true;
      setTreeState(this.map, r.tx, r.ty, TreeDef.maxHp, true);
      return false;
    });
  }
}
