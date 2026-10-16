'use strict';
/* SHARED - CONNECT FOUR at the Pony Inn (data/buildings/pony_inn.js, furniture `connect4_table` in data/furniture/inn.js).
 *
 * Walk up to a Connect Four table and press Use to SIT: the first player takes seat 0, the next seat 1, and the game begins. Alone, you can play the innkeeper's computer
 * instead. Players drop pony coins (each side's token is the coin of its main pony's variety) into the seven columns of a six-row board; the first to line up four wins.
 * The server holds the game; the screen (client/ui/connectFourUI.js) draws it and the coins' falling and bouncing, and shows seat 1 the board MIRRORED, as if sitting across the table.
 * Walking away from the table (or leaving the building, or the game) stands you up: your opponent wins a game in progress.
 *
 * The board is a flat array of 42 numbers, row 0 at the top, row-major: -1 empty, 0 / 1 the coin of that seat (sent to the screens as 42 characters: '.', '0' or '1'). */
const ConnectFour = (() => {
  const COLS = 7, ROWS = 6, N = COLS * ROWS, IDLE = -1;
  const at = (b, c, r) => b[r * COLS + c];
  const empty = () => new Array(N).fill(IDLE);
  /** The row a coin dropped in column c comes to rest in (the lowest empty one), or -1 if the column is full. */
  function rowFor(b, c) { if (!(c >= 0 && c < COLS)) return -1; for (let r = ROWS - 1; r >= 0; r--) if (at(b, c, r) === IDLE) return r; return -1; }
  const full = b => b.every(v => v !== IDLE);
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  /** The four in a row, if there is one: { who, cells: [[c, r] x 4] }. */
  function winner(b) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = at(b, c, r); if (v === IDLE) continue;
      for (const [dc, dr] of DIRS) {
        let k = 1; while (k < 4) { const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || at(b, cc, rr) !== v) break; k++; }
        if (k === 4) return { who: v, cells: [0, 1, 2, 3].map(i => [c + dc * i, r + dr * i]) };
      }
    }
    return null;
  }
  /** How good the board is for `me`: windows of four with only my coins count for me, only theirs against me, and the middle column is worth the most. */
  function score(b, me) {
    let s = 0; const opp = 1 - me;
    for (let r = 0; r < ROWS; r++) if (at(b, 3, r) === me) s += 3; else if (at(b, 3, r) === opp) s -= 3;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dc, dr] of DIRS) {
      const ec = c + dc * 3, er = r + dr * 3; if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      let mine = 0, theirs = 0; for (let i = 0; i < 4; i++) { const v = at(b, c + dc * i, r + dr * i); if (v === me) mine++; else if (v === opp) theirs++; }
      if (mine && !theirs) s += [0, 1, 6, 40][mine - 1]; else if (theirs && !mine) s -= [0, 1, 6, 50][theirs - 1];
    }
    return s;
  }
  const ORDER = [3, 2, 4, 1, 5, 0, 6];                                                                       // (middle first: better pruning, and it is the better move)
  function search(b, who, me, depth, alpha, beta) {
    const w = winner(b);
    if (w) return w.who === me ? 100000 + depth : -100000 - depth;
    if (full(b)) return 0;
    if (depth === 0) return score(b, me);
    let best = who === me ? -Infinity : Infinity;
    for (const c of ORDER) {
      const r = rowFor(b, c); if (r < 0) continue;
      b[r * COLS + c] = who;
      const v = search(b, 1 - who, me, depth - 1, alpha, beta);
      b[r * COLS + c] = IDLE;
      if (who === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (beta <= alpha) break;
    }
    return best;
  }
  /** The computer's move for `me`: it always takes a win or blocks one, otherwise looks `depth` moves ahead; `slip` (0..1) is the chance it just plays a random column (so a person can win). */
  function bestMove(b, me, depth = 5, slip = 0.12, rnd = Math.random) {
    const open = ORDER.filter(c => rowFor(b, c) >= 0);
    if (!open.length) return -1;
    const trial = c => { const r = rowFor(b, c); b[r * COLS + c] = me; const w = winner(b); b[r * COLS + c] = IDLE; return !!w; };
    for (const c of open) if (trial(c)) return c;                                                            // take a win
    const block = c => { const r = rowFor(b, c); b[r * COLS + c] = 1 - me; const w = winner(b); b[r * COLS + c] = IDLE; return !!w; };
    for (const c of open) if (block(c)) return c;                                                            // block theirs
    if (rnd() < slip) return open[Math.floor(rnd() * open.length)];
    let best = -Infinity, pick = open[0];
    for (const c of open) {
      const r = rowFor(b, c); b[r * COLS + c] = me;
      const v = search(b, 1 - me, me, depth - 1, -Infinity, Infinity) + rnd() * 0.5;
      b[r * COLS + c] = IDLE;
      if (v > best) { best = v; pick = c; }
    }
    return pick;
  }
  return { COLS, ROWS, N, IDLE, empty, rowFor, full, winner, bestMove, at };
})();

const CONNECT4_REACH = 2.6, CONNECT4_AI_SECONDS = 1.1;

/** Pure (client + server): a Connect Four table within reach. */
function findConnectFour(map, p) {
  if (p.asleep || p.down > 0) return null;
  const [hit] = HomeCrafts.near(map, p, def => def.connect4);
  return hit ? { kind: 'connect4', label: 'Play Connect Four', dist: hit.dist, fx: hit.f.x, fy: hit.f.y } : null;
}
Interactions.extra.unshift(findConnectFour);
InteractionHandlers.connect4 = (server, id, p, action) => { const hit = server._roomPiece(p, action, d => d.connect4); if (hit) server.connect4.sit(id, p, hit.f); };

class ConnectFourSystem {
  constructor(server) { this.s = server; this.tables = new Map(); this.seat = {}; }

  /* ---------------------------------------- sitting down ---------------------------------------- */
  _key(grid, f) { return `${grid}|${f.x},${f.y}`; }
  _spot(t) { return { x: t.f.x + t.f.w / 2, y: t.f.y + t.f.h / 2 }; }
  _name(id) { return id === 'ai' ? 'Hattie (computer)' : (this.s.players[id] && this.s.players[id].name) || 'Player'; }
  /** The pony coin each side plays with: its main pony's variety; a side that has none, or the same as the other, gets another (the computer likes ember and crystal). */
  _tokens(seats) {
    const own = id => {
      const a = id && id !== 'ai' && this.s._mainPonyOf(id), v = a && a.look && PonyVariantTable.all()[a.look[4] | 0];
      return v && PonyCoins.ids.includes(v.id) ? v.id : null;
    };
    const t = seats.map(own), pick = (avoid, ai) => (ai ? ['ember', 'crystal', 'candy'] : ['meadow', 'moss']).concat(PonyCoins.ids).find(v => PonyCoins.ids.includes(v) && v !== avoid);
    if (!t[0]) t[0] = pick(t[1], seats[0] === 'ai');
    if (!t[1] || t[1] === t[0]) t[1] = pick(t[0], seats[1] === 'ai');
    return t;
  }
  sit(id, p, f) {
    const s = this.s, grid = gridOf(p), key = this._key(grid, f);
    let t = this.tables.get(key);
    if (this.seat[id] === key) { s.pendingEvents.push({ type: 'openConnect4', to: id }); return; }
    if (this.seat[id]) this.leave(id);
    if (!t) { t = { key, grid, f: { x: f.x, y: f.y, w: f.w, h: f.h }, seats: [null, null], board: ConnectFour.empty(), turn: 0, starter: 0, status: 'waiting', winner: -1, line: null, last: null, seq: 0, again: [false, false], ai: false }; this.tables.set(key, t); }
    const k = t.seats[0] ? (t.seats[1] ? -1 : 1) : 0;
    if (k < 0) { s._notice(id, t.ai ? 'Somebody is playing the computer at this table' : 'Both seats are taken'); return; }
    t.seats[k] = id; this.seat[id] = key;
    s.pendingEvents.push({ type: 'openConnect4', to: id });
    if (t.seats[0] && t.seats[1]) { this._start(t); s._notice(t.seats[0], `${this._name(id)} sat down: your game begins`); }
    else s._notice(id, 'You sit down. Wait for an opponent, or play the computer');
  }
  _start(t) {
    t.board = ConnectFour.empty(); t.status = 'playing'; t.winner = -1; t.line = null; t.last = null; t.again = [false, false]; t.seq++;
    t.turn = t.starter; t.starter = 1 - t.starter;
    t.tokens = this._tokens(t.seats);
    this._think(t);
  }
  /** Play the computer (alone at the table). */
  playAi(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.ai || t.status === 'playing' || t.seats[0] && t.seats[1]) return;
    t.ai = true; t.seats[t.seats[0] ? 1 : 0] = 'ai'; this._start(t);
  }

  /* ---------------------------------------- playing ---------------------------------------- */
  drop(id, col) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.status !== 'playing') return;
    const k = t.seats.indexOf(id);
    if (k !== t.turn) return;
    this._place(t, k, col | 0);
  }
  _place(t, k, col) {
    const row = ConnectFour.rowFor(t.board, col);
    if (row < 0) return false;
    t.board[row * ConnectFour.COLS + col] = k; t.last = { col, row, by: k }; t.seq++;
    const w = ConnectFour.winner(t.board);
    if (w) { t.status = 'done'; t.winner = w.who; t.line = w.cells; this._finish(t); }
    else if (ConnectFour.full(t.board)) { t.status = 'done'; t.winner = -1; this._finish(t); }
    else { t.turn = 1 - t.turn; this._think(t); }
    return true;
  }
  _finish(t) {
    for (const id of t.seats) if (id && id !== 'ai') this.s._notice(id, t.winner < 0 ? 'A draw!' : t.seats[t.winner] === id ? 'Four in a row! You win!' : `${this._name(t.seats[t.winner])} wins this one`);
  }
  /** The computer's turn: it takes a moment to "think", then drops a coin. */
  _think(t) {
    if (t.status !== 'playing' || t.seats[t.turn] !== 'ai') return;
    const seq = t.seq;
    this.s.later.push({ at: this.s.tick + Math.round(CONNECT4_AI_SECONDS / TICK_DT), fn: () => {
      if (!this.tables.has(t.key) || t.seq !== seq || t.status !== 'playing' || t.seats[t.turn] !== 'ai') return;
      const col = ConnectFour.bestMove(t.board.slice(), t.turn, 5, 0.1);
      if (col >= 0) this._place(t, t.turn, col);
    } });
  }
  /** Ready for another game (both people must say so; the computer always is). */
  again(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t || t.status !== 'done') return;
    t.again[t.seats.indexOf(id)] = true;
    if (t.seats.every((x, i) => x === 'ai' || t.again[i])) this._start(t);
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
    this.s.pendingEvents.push({ type: 'closeConnect4', to: id });
    if (t.ai || !other) { delete this.seat[other]; this.tables.delete(key); return; }                        // (a game against the computer ends with the person; an empty table is forgotten)
    if (t.status === 'playing') { t.status = 'done'; t.winner = 1 - k; t.line = null; this.s._notice(other, `${this._name(id)} left the table: you win`); }
    else { t.status = 'waiting'; t.board = ConnectFour.empty(); t.winner = -1; t.line = null; t.last = null; }
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
      if (gridOf(p) !== t.grid || Math.hypot(p.x - c.x, p.y - c.y) > CONNECT4_REACH + t.f.w / 2) this.leave(id);
    }
  }

  /** What the player seated at a table is shown (null when they are not seated). */
  stateFor(id) {
    const t = this.tables.get(this.seat[id]);
    if (!t) return null;
    return { seat: t.seats.indexOf(id), status: t.status, turn: t.turn, board: t.board.map(v => (v < 0 ? '.' : v)).join(''), tokens: t.tokens || this._tokens(t.seats), names: t.seats.map(x => (x ? this._name(x) : '')), ai: t.ai, winner: t.winner, line: t.line, last: t.last, seq: t.seq, again: t.again, key: t.key };
  }
}
