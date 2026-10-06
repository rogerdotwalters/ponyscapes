'use strict';
/* SERVER-SIDE player-to-player trading.
 *   1. one player requests a trade with a nearby player          (bots always accept)
 *   2. both put items from their inventories on the table         (any change clears both confirmations)
 *   3. both confirm -> the swap happens atomically, or nothing happens if anyone lacks room / items
 * The server is the only place the swap is decided; clients just show the state they are sent. */
const BOT_TRADE_STOCK = ['rope', 'string', 'stone', 'raspberry', 'plank'];

class TradeSystem {
  /** @param {{players, inventories, bots, rng, emit, markInventoryChanged, notice}} deps  (the first three are live dictionaries) */
  constructor(deps) { Object.assign(this, deps); this.sessions = []; this.rev = {}; this.sentRev = {}; }

  sessionOf(id) { return this.sessions.find(s => s.a === id || s.b === id) || null; }
  _other(s, id) { return s.a === id ? s.b : s.a; }
  _touch(s) { for (const id of [s.a, s.b]) this.rev[id] = (this.rev[id] || 0) + 1; }

  request(from, target) {
    const a = this.players[from], b = this.players[target];
    if (!a || !b || from === target) { this.notice(from, 'Nobody to trade with'); return; }
    if (this.sessionOf(from) || this.sessionOf(target)) { this.notice(from, 'One of you is already trading'); return; }
    if (!sameGrid(a, b) || Math.hypot(a.x - b.x, a.y - b.y) > CONFIG.sim.tradeRange) { this.notice(from, 'Too far away to trade'); return; }
    const s = { a: from, b: target, status: this.bots[target] ? 'active' : 'pending', offers: { [from]: {}, [target]: {} }, confirmed: { [from]: false, [target]: false } };
    this.sessions.push(s);
    if (this.bots[target]) s.offers[target] = { [BOT_TRADE_STOCK[Math.floor(this.rng() * BOT_TRADE_STOCK.length)]]: 1 };   // a bot puts something on the table
    else this.notice(target, `${from.toUpperCase()} wants to trade`);
    this._touch(s);
  }

  accept(id) {
    const s = this.sessionOf(id);
    if (!s || s.b !== id || s.status !== 'pending') return;
    s.status = 'active'; this._touch(s);
  }

  cancel(id, text = 'Trade cancelled') {
    const s = this.sessionOf(id);
    if (!s) return;
    this.sessions = this.sessions.filter(x => x !== s);
    this._touch(s);
    const other = this._other(s, id);
    if (this.players[other]) this.notice(other, text);
  }

  /** Put `count` of `item` on the table (0 takes it back). */
  offer(id, item, count) {
    const s = this.sessionOf(id);
    if (!s || s.status !== 'active' || !ItemDefs[item] || !Number.isInteger(count) || count < 0) return;
    if (count > this.inventories[id].count(item)) { this.notice(id, 'You do not have that many'); return; }
    if (count === 0) delete s.offers[id][item]; else s.offers[id][item] = count;
    s.confirmed[s.a] = s.confirmed[s.b] = false;
    this._touch(s);
  }

  confirm(id, value) {
    const s = this.sessionOf(id);
    if (!s || s.status !== 'active') return;
    s.confirmed[id] = !!value;
    const other = this._other(s, id);
    if (this.bots[other] && value && Object.keys(s.offers[id]).length) s.confirmed[other] = true;     // the bot agrees to any real offer
    this._touch(s);
    if (s.confirmed[s.a] && s.confirmed[s.b]) this._execute(s);
  }

  _execute(s) {
    const give = (from, to) => Object.entries(s.offers[from]);
    const trials = {};
    for (const id of [s.a, s.b]) trials[id] = this.inventories[id].clone();
    let problem = '';
    for (const [from, to] of [[s.a, s.b], [s.b, s.a]]) {
      for (const [item, count] of give(from, to)) {
        if (!this.bots[from] && !trials[from].remove(item, count)) problem = `${from.toUpperCase()} no longer has the items`;   // a bot's stock is conjured, not owned
      }
      for (const [item, count] of give(to, from)) {
        if (trials[from].add(item, count) > 0) problem = problem || `${from.toUpperCase()} has no room`;
      }
    }
    if (problem) {
      s.confirmed[s.a] = s.confirmed[s.b] = false; this._touch(s);
      for (const id of [s.a, s.b]) if (!this.bots[id]) this.notice(id, 'Trade failed: ' + problem);
      return;
    }
    for (const id of [s.a, s.b]) { this.inventories[id].slots = trials[id].slots; this.markInventoryChanged(id); this.emit({ type: 'tradeDone', to: id }); }
    this.sessions = this.sessions.filter(x => x !== s);
    this._touch(s);
  }

  /** Called every tick: a trade ends if either player vanishes or walks away. */
  update() {
    for (const s of [...this.sessions]) {
      const a = this.players[s.a], b = this.players[s.b];
      if (!a || !b || !sameGrid(a, b) || Math.hypot(a.x - b.x, a.y - b.y) > CONFIG.sim.tradeRange + 2) this.cancel(a ? s.a : s.b, 'Trade cancelled: out of range');
    }
  }

  /** The player's view of their trade, only when it changed since last sent: { state } (state null = no trade) or null. */
  updateFor(id) {
    if ((this.sentRev[id] || 0) === (this.rev[id] || 0)) return null;
    this.sentRev[id] = this.rev[id] || 0;
    const s = this.sessionOf(id);
    if (!s) return { state: null };
    const other = this._other(s, id);
    return { state: { status: s.status, with: other, incoming: s.b === id && s.status === 'pending', mine: Object.assign({}, s.offers[id]), theirs: Object.assign({}, s.offers[other]), myConfirm: s.confirmed[id], theirConfirm: s.confirmed[other] } };
  }
}
