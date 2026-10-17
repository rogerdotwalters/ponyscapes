'use strict';
/* SHARED - the MEMORY GAME at the Pony Inn (data/buildings/pony_inn.js, furniture `memory_table` in data/furniture/inn.js).
 *
 * Walk up to a Memory table and press Use to SIT. Twenty cards lie face down in a grid: ten ponies, two cards of each. On your turn flip two cards; a pair that matches is yours
 * (and you go again), a pair that does not is turned back down after a moment and the turn passes. Play ALONE (press "Play alone": it counts your moves) or head to head
 * with the person who sits across the table: whoever finds the most pairs wins. There is no computer player. Walking away from the table (or leaving the building) stands you up;
 * your opponent wins a game in progress.
 * The server holds the game and the shuffle; a player is only ever told the faces of cards that are face up or matched (client/ui/memoryUI.js draws it).
 *
 * Cards are indices 0..19, row-major (the screen lays them out in 4 or 5 columns). Sent to the screens as three 20-character strings: `st` ('.' face down, 'u' face up, 'm' matched),
 * `fc` (the face of an up / matched card, '0'..'9', else '-') and `own` (who matched it, '0' / '1', else '-'). */
const MemoryGame = (() => {
  const PAIRS = 10, N = PAIRS * 2;
  /** The ten ponies on the cards: [coin variety, pony kind]. Each face is that variety's pony drawn by the client (memoryUI.js), so the faces are the ponies of the game. */
  const FACES = [['meadow', 'pony_plain'], ['moss', 'pony_earth'], ['frost', 'pony_unicorn'], ['jungle', 'pony_pegasus'], ['orchard', 'pony_earth'],
    ['candy', 'pony_unicorn'], ['crystal', 'pony_pegasus'], ['starlit', 'pony_alicorn'], ['ember', 'pony_pegasus'], ['rainbow', 'pony_alicorn']];
  /** A shuffled deck: two of each face (`rnd`: () => 0..1). */
  function deck(rnd = Math.random) {
    const d = []; for (let i = 0; i < PAIRS; i++) d.push(i, i);
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  return { PAIRS, N, FACES, deck };
})();

const MEMORY_REACH = 2.6, MEMORY_PEEK_SECONDS = 1.3;

/** Pure (client + server): a Memory table within reach. */
function findMemoryGame(map, p) {
  if (p.asleep || p.down > 0) return null;
  const [hit] = HomeCrafts.near(map, p, def => def.memory);
  return hit ? { kind: 'memory', label: 'Play Memory', dist: hit.dist, fx: hit.f.x, fy: hit.f.y } : null;
}
Interactions.extra.unshift(findMemoryGame);
InteractionHandlers.memory = (server, id, p, action) => { const hit = server._roomPiece(p, action, d => d.memory); if (hit) server.memory.sit(id, p, hit.f); };

class MemorySystem {
  constructor(server) { this.s = server; this.tables = new Map(); this.seat = {}; }

  _key(grid, f) { return `${grid}|${f.x},${f.y}`; }
  _spot(t) { return { x: t.f.x + t.f.w / 2, y: t.f.y + t.f.h / 2 }; }
  _name(id) { return (this.s.players[id] && this.s.players[id].name) || 'Player'; }
  sit(id, p, f) {
    const s = this.s, grid = gridOf(p), key = this._key(grid, f);
    let t = this.tables.get(key);
    if (this.seat[id] === key) { s.pendingEvents.push({ type: 'openMemory', to: id }); return; }
    if (this.seat[id]) this.leave(id);
    if (!t) { t = { key, grid, f: { x: f.x, y: f.y, w: f.w, h: f.h }, seats: [null, null], status: 'waiting', solo: false, turn: 0, starter: 0, faces: [], up: [], owner: [], score: [0, 0], moves: 0, seq: 0, again: [false, false], last: null, match: null }; this.tables.set(key, t); }
    const k = t.seats[0] ? (t.seats[1] ? -1 : 1) : 0;
    if (k < 0 || t.solo) { s._notice(id, t.solo ? 'Somebody is playing alone at this table' : 'Both seats are taken'); return; }
    t.seats[k] = id; this.seat[id] = key;
    s.pendingEvents.push({ type: 'openMemory', to: id });
    if (t.seats[0] && t.seats[1]) { this._start(t); s._notice(t.seats[0], `${this._name(id)} sat down: your game begins`); }
    else s._notice(id, 'You sit down. Wait for an opponent, or play alone');
  }
  _start(t) {
    t.faces = MemoryGame.deck(); t.up = []; t.owner = new Array(MemoryGame.N).fill(-1); t.score = [0, 0]; t.moves = 0;
    t.status = 'playing'; t.last = null; t.match = null; t.again = [false, false]; t.seq++;
    t.turn = t.solo ? 0 : t.starter; t.starter = 1 - t.starter;
    t.tokens = this.s.connect4._tokens(t.seats);
  }
  /** Play alone (nobody else at the table): the game counts your moves. */
  playAlone(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.solo || t.status === 'playing' || t.seats[0] && t.seats[1]) return;
    t.solo = true; this._start(t);
  }

  /* ---------------------------------------- playing ---------------------------------------- */
  flip(id, i) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.status !== 'playing' || t.up.length >= 2) return;
    if (t.seats.indexOf(id) !== t.turn) return;
    i |= 0;
    if (!(i >= 0 && i < MemoryGame.N) || t.owner[i] >= 0 || t.up.includes(i)) return;
    t.up.push(i); t.last = i; t.seq++;
    if (t.up.length < 2) return;
    t.moves++;
    const [a, b] = t.up;
    if (t.faces[a] === t.faces[b]) {                                                                         // a pair: it is yours, and you go again
      t.owner[a] = t.owner[b] = t.turn; t.score[t.turn]++; t.match = { cells: [a, b], face: t.faces[a], by: t.turn }; t.up = [];
      if (t.owner.every(o => o >= 0)) this._finish(t); else t.seq++;
    } else {                                                                                                 // no pair: they stay up for a moment, then turn back down
      const seq = t.seq;
      this.s.later.push({ at: this.s.tick + Math.round(MEMORY_PEEK_SECONDS / TICK_DT), fn: () => {
        if (!this.tables.has(t.key) || t.seq !== seq || t.status !== 'playing' || t.up.length < 2) return;
        t.up = []; if (!t.solo) t.turn = 1 - t.turn; t.seq++;
      } });
    }
  }
  _finish(t) {
    t.status = 'done'; t.seq++;
    t.winner = t.solo ? 0 : t.score[0] === t.score[1] ? -1 : t.score[0] > t.score[1] ? 0 : 1;
    for (const id of t.seats) if (id) this.s._notice(id, t.solo ? `All ${MemoryGame.PAIRS} pairs found in ${t.moves} moves!` : t.winner < 0 ? 'A draw!' : t.seats[t.winner] === id ? `You win ${t.score[t.winner]} to ${t.score[1 - t.winner]}!` : `${this._name(t.seats[t.winner])} wins this one`);
  }
  again(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.status !== 'done') return;
    t.again[t.seats.indexOf(id)] = true;
    if (t.solo || t.seats.every((x, i) => !x || t.again[i])) this._start(t);
  }

  /* ---------------------------------------- standing up ---------------------------------------- */
  leave(id) {
    const key = this.seat[id], t = key && this.tables.get(key);
    delete this.seat[id];
    if (!t) return;
    const k = t.seats.indexOf(id);
    if (k < 0) return;
    t.seats[k] = null;
    const other = t.seats[1 - k];
    this.s.pendingEvents.push({ type: 'closeMemory', to: id });
    if (t.solo || !other) { this.tables.delete(key); return; }
    if (t.status === 'playing') { t.status = 'done'; t.winner = 1 - k; t.up = []; this.s._notice(other, `${this._name(id)} left the table: you win`); }
    else { t.status = 'waiting'; t.faces = []; t.up = []; t.owner = []; t.winner = -1; }
    t.again = [false, false]; t.seq++;
  }
  forget(id) { if (this.seat[id]) this.leave(id); }

  /** Once in a while: stand up anyone who has walked away from their table (or out of the room). */
  update(tick) {
    if (tick % 15 || !this.tables.size) return;
    for (const id of Object.keys(this.seat)) {
      const p = this.s.players[id], t = this.tables.get(this.seat[id]);
      if (!p || !t) { this.leave(id); continue; }
      const c = this._spot(t);
      if (gridOf(p) !== t.grid || Math.hypot(p.x - c.x, p.y - c.y) > MEMORY_REACH + t.f.w / 2) this.leave(id);
    }
  }

  /** What the player seated at a table is shown (null when they are not seated): only the faces that are up or matched. */
  stateFor(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t) return null;
    const n = MemoryGame.N, st = [], fc = [], own = [];
    for (let i = 0; i < n; i++) {
      const m = t.owner[i] >= 0, u = t.up.includes(i), show = m || u;
      st.push(m ? 'm' : u ? 'u' : '.'); fc.push(show ? t.faces[i] : '-'); own.push(m ? t.owner[i] : '-');
    }
    return { seat: t.seats.indexOf(id), status: t.status, solo: t.solo, turn: t.turn, st: t.status === 'waiting' ? '.'.repeat(n) : st.join(''), fc: fc.join(''), own: own.join(''), score: t.score, moves: t.moves, tokens: t.tokens || this.s.connect4._tokens(t.seats),
      names: t.seats.map(x => (x ? this._name(x) : '')), winner: t.winner === undefined ? -1 : t.winner, last: t.last, match: t.match, seq: t.seq, again: t.again, key: t.key };
  }
}
