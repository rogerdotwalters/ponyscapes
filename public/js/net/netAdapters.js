'use strict';
/* NETWORK - the only seam between the game and "the server". The game (ClientGame) only ever calls these four methods:
 *   LocalAdapter   solo play: the authoritative GameServer runs in-process.
 *   HostAdapter    (hostAdapter.js)  the same, plus it lets friends join through the relay and saves to the host's database.
 *   RemoteAdapter  (remoteAdapter.js) a friend's browser: everything goes to the host through the relay. */

/** Interface the client game talks to. */
class NetAdapter {
  /** @returns {Promise<{id, slot, mapSeed, tickRate, tick, player, inventory, built}>} */
  connect() { throw new Error('not implemented'); }
  sendInput(input) { throw new Error('not implemented'); }
  /** Non-movement requests: { type:'moveSlot', from, to } | { type:'craft', recipe } | { type:'place', tx, ty, side, slot } | { type:'setVitals', target, hunger, thirst } ... */
  sendCommand(command) { throw new Error('not implemented'); }
  /** cb receives { tick, players, trees, events, inventory?, built? } */
  onSnapshot(cb) { throw new Error('not implemented'); }
  disconnect() {}
}

/** Runs the authoritative GameServer in-process. Messages round-trip through JSON (and optional
 *  fake lag) so anything that works here is guaranteed serializable for a real socket. */
class LocalAdapter extends NetAdapter {
  /** @param {{name?:string, appearance?:number[]}} [options] who is playing (the character screen's choices) */
  constructor(options = {}) {
    super();
    this.options = options;
    this.callback = null; this.backlog = []; this.server = null; this.id = null; this.timer = null;       // (snapshots that arrive before the game is listening are kept, never dropped)
    this.accumulator = 0; this.lastTime = 0; this.nextDelivery = { up: 0, down: 0 };
  }

  connect() {
    this.server = new GameServer(1337);
    this.id = this.server.addPlayer(false);
    if (this.options.name) this.server.players[this.id].name = this.options.name;
    const look = CharacterLook.sanitize(this.options.appearance); if (look) this.server.players[this.id].appearance = look;
    for (let i = 0; i < CONFIG.net.bots; i++) this.server.addPlayer(true);
    this.lastTime = performance.now();
    this.timer = setInterval(() => this._pump(), 8);          // the "server" runs on its own clock
    return Promise.resolve(JSON.parse(JSON.stringify(SnapshotBuilder.welcomeFor(this.server, this.id))));
  }

  sendInput(input) { const wire = JSON.stringify(input); this._deliver('up', () => this.server.receiveInput(this.id, JSON.parse(wire))); }
  sendCommand(command) { const wire = JSON.stringify(command); this._deliver('up', () => this.server.receiveCommand(this.id, JSON.parse(wire))); }
  onSnapshot(cb) { this.callback = cb; const waiting = this.backlog; this.backlog = []; for (const s of waiting) cb(s); }
  disconnect() { clearInterval(this.timer); }

  _pump() {
    const now = performance.now();
    this.accumulator += Math.min(now - this.lastTime, 250); this.lastTime = now;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.server.step();
      if (this.server.tick % CONFIG.net.snapshotEvery === 0) this._sendSnapshot();
    }
  }
  _sendSnapshot() {
    const snapshot = SnapshotBuilder.snapshotsFor(this.server, [this.id])[this.id];
    const wire = JSON.stringify(snapshot);
    this._deliver('down', () => { const snap = JSON.parse(wire); if (this.callback) this.callback(snap); else this.backlog.push(snap); });
  }
  _deliver(direction, fn) {                                    // one-way delay = half the fake RTT, order preserved
    const net = CONFIG.net, delay = net.fakeLatencyMs / 2 + Math.random() * net.fakeJitterMs;
    if (delay <= 0) return fn();
    const now = performance.now(), at = Math.max(now + delay, this.nextDelivery[direction]);
    this.nextDelivery[direction] = at;
    setTimeout(fn, at - now);
  }
}
