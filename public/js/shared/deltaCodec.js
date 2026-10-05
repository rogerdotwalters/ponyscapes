'use strict';
/* SHARED - keeping an online player's snapshots small. A full snapshot is mostly the same numbers 15 times a second, so for REMOTE players:
 *   - numbers are rounded (a thousandth of a tile is invisible),
 *   - each animal is described in full ONCE, then only by a short array of the things that move,
 *   - the (potentially long) lists of felled trees and picked bushes are only sent when they change.
 * The receiving side rebuilds exactly the full snapshot the game already understands. Solo play never uses any of this. */
const DeltaCodec = {
  VIEW_RADIUS: 48,                                   // tiles: a remote player is only told about animals this close (the screen shows about 25)
  round: (v, decimals) => { const k = 10 ** decimals; return Math.round(v * k) / k; },

  /** Deep copy with every number rounded (default 3 decimals). */
  quantize(value, decimals = 3) {
    if (typeof value === 'number') return Number.isInteger(value) ? value : DeltaCodec.round(value, decimals);
    if (Array.isArray(value)) return value.map(v => DeltaCodec.quantize(v, decimals));
    if (value && typeof value === 'object') { const out = {}; for (const k in value) out[k] = DeltaCodec.quantize(value[k], decimals); return out; }
    return value;
  }
};

/** Host side, one per remote player: remembers which animals that player already knows about. */
class AnimalDeltaEncoder {
  constructor() { this.known = new Set(); this.lastDynamic = new Map(); }
  /** Seed with the animals sent in the welcome. */
  prime(states) { this.known = new Set(Object.keys(states)); }
  /** @param states { id: state } for every animal near any human  @param viewer the player object  @returns { f: full, u: { id: [dynamic...] }, g: [gone ids] } */
  encode(states, viewer) {
    const f = {}, u = {}, g = [], R = DeltaCodec.VIEW_RADIUS, r = DeltaCodec.round, seen = new Set();
    for (const id in states) {
      const a = states[id];
      if (Math.hypot(a.x - viewer.x, a.y - viewer.y) > R) continue;
      seen.add(id);
      const dynamic = [r(a.x, 2), r(a.y, 2), r(a.vx, 1), r(a.vy, 1), r(a.facing, 2), a.hp, a.state, a.owner, a.captor, a.leashed ? 1 : 0, a.rider], json = JSON.stringify(dynamic);
      if (!this.known.has(id)) { f[id] = DeltaCodec.quantize(a, 2); this.known.add(id); this.lastDynamic.set(id, json); continue; }   // (a full description already carries the moving part)
      if (this.lastDynamic.get(id) !== json) { u[id] = dynamic; this.lastDynamic.set(id, json); }          // an animal standing still costs nothing
    }
    for (const id of this.known) if (!seen.has(id)) { g.push(id); this.known.delete(id); this.lastDynamic.delete(id); }
    return { f, u, g };
  }
}

/** Client side: rebuilds the full { id: state } map from deltas. Every call returns NEW state objects, because the game keeps old snapshots for interpolation. */
class AnimalDeltaDecoder {
  constructor() { this.animals = {}; }
  reset(states) { this.animals = {}; for (const id in states) this.animals[id] = Object.assign({}, states[id]); }
  decode(delta) {
    const next = {};
    for (const id in this.animals) next[id] = this.animals[id];
    for (const id of delta.g || []) delete next[id];
    for (const id in delta.f || {}) next[id] = Object.assign({}, delta.f[id]);
    for (const id in delta.u || {}) {
      const prev = next[id], d = delta.u[id];
      if (!prev) continue;                                                // an update for an animal we never heard of: ignore it
      next[id] = Object.assign({}, prev, { x: d[0], y: d[1], vx: d[2], vy: d[3], facing: d[4], hp: d[5], state: d[6], owner: d[7], captor: d[8], leashed: !!d[9], rider: d[10] });
    }
    this.animals = next;
    return next;
  }
}

/** Remembers the last version of a big shared object per remote player and says whether it changed. */
class ChangeGate {
  constructor() { this.last = null; }
  /** Returns the object if it differs from what this player last got (else null). */
  changed(value) { const json = JSON.stringify(value); if (json === this.last) return null; this.last = json; return value; }
  prime(value) { this.last = JSON.stringify(value); }
}

/** Host side, one per remote player: for each player, only the FIELDS that changed since the last snapshot sent (a walking player is ~10 numbers;
 *  their gear, skill levels, colour and name are sent once). Every present player appears (possibly as {}), so the receiver knows who is here. */
class PlayerDeltaEncoder {
  constructor() { this.last = {}; }
  encode(players) {
    const out = {};
    for (const id in players) {
      const p = players[id], prev = this.last[id] || {}, next = {}, d = {};
      for (const k in p) { const v = p[k], s = v !== null && typeof v === 'object' ? JSON.stringify(v) : v; next[k] = s; if (prev[k] !== s) d[k] = v; }
      this.last[id] = next; out[id] = d;
    }
    for (const id in this.last) if (!(id in players)) delete this.last[id];
    return out;
  }
}
/** Client side: rebuilds full player objects (new ones each time: the game keeps old snapshots for interpolation). */
class PlayerDeltaDecoder {
  constructor() { this.players = {}; }
  decode(delta) {
    const next = {};
    for (const id in delta) next[id] = Object.assign({}, this.players[id] || {}, delta[id]);
    this.players = next;
    return next;
  }
}
