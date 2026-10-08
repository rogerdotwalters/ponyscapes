'use strict';
/* SHARED - things you pick up by hand: berry bushes and loose stones. State helpers (both sides) + the
 * server-only ForageSystem. Like trees, each one is identified by its tile key and only PICKED ones are
 * stored (map.forageStates), so chunks can be dropped and regenerated without forgetting. */

const forageAt = (map, tx, ty) => { const p = map.propAt(tx, ty); return p && ForageDefs[forageKind(p)] ? p : null; };

/** ripe: it can be picked. cut: a bush the hedge cutter cut down (hedges.js): a low stub until it regrows. */
function setForageState(map, tx, ty, ripe, cut = false) {
  const key = tileKey(tx, ty);
  if (ripe) delete map.forageStates[key]; else map.forageStates[key] = cut ? { ripe: false, cut: 1 } : { ripe: false };
  const prop = map.peekPropAt(tx, ty);
  if (prop && ForageDefs[forageKind(prop)]) { prop.ripe = ripe; prop.cut = !ripe && !!cut; }
}

/** Client side: adopt the server's list of picked props. */
function applyForageStates(map, states) {
  for (const key of Object.keys(map.forageStates)) if (!(key in states)) setForageState(map, keyTileX(key), keyTileY(key), true);
  for (const key of Object.keys(states)) { const now = map.forageStates[key]; if (!now || !!now.cut !== !!states[key].cut) setForageState(map, keyTileX(key), keyTileY(key), false, !!states[key].cut); }
}
const collectForageStates = map => JSON.parse(JSON.stringify(map.forageStates));

/** Nearest ripe bush / stone / apple tree / bottle within `range` of the player: { tx, ty, prop, dist } or null.
 *  Things that need a tool (a mound needs a shovel) are only offered while you hold it. */
function findForageable(map, p, range = FORAGE_RANGE, heldItemId = '') {
  const span = Math.ceil(range + 1), px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null;
  for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
    const prop = forageAt(map, tx, ty);
    if (!prop || !prop.ripe) continue;
    const needs = ForageDefs[forageKind(prop)].tool;
    if (needs && (ItemDB.getTool(heldItemId) || {}).kind !== needs) continue;
    const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
    if (dist <= range && (!best || dist < best.dist)) best = { tx, ty, prop, dist };
  }
  return best;
}

/** Server-authoritative picking and regrowth. */
class ForageSystem {
  constructor(map, rng, getTick) { this.map = map; this.rng = rng; this.getTick = getTick; this.regrows = []; }

  rollYield(prop) { const d = ForageDefs[forageKind(prop)]; return d.yieldMin + Math.floor(this.rng() * (d.yieldMax - d.yieldMin + 1)); }

  pick(tx, ty, prop) {
    setForageState(this.map, tx, ty, false);
    this.regrows.push({ tx, ty, atTick: this.getTick() + secondsToTicks(ForageDefs[forageKind(prop)].regrowSeconds) });
  }

  /** The hedge cutter cut this bush down: no berries, and a long wait before it grows back. */
  cut(tx, ty, seconds) {
    this.regrows = this.regrows.filter(r => !(r.tx === tx && r.ty === ty));
    setForageState(this.map, tx, ty, false, true);
    this.regrows.push({ tx, ty, atTick: this.getTick() + secondsToTicks(seconds) });
  }

  update(tick) {
    this.regrows = this.regrows.filter(r => {
      if (r.atTick > tick) return true;
      setForageState(this.map, r.tx, r.ty, true);
      return false;
    });
  }
}
