'use strict';
/* NETWORK - a FRIEND's end of an online game. It looks to the game exactly like LocalAdapter, but everything goes through the relay to
 * the host's browser, which runs the real simulation. This side only:
 *   - introduces itself (name + this device's secret player key, so the host can give back the character it saved last time),
 *   - batches inputs (15 messages a second instead of 30: the relay is billed per message),
 *   - rebuilds the full snapshots the game understands from the host's compact ones. */
class RemoteAdapter extends NetAdapter {
  /** @param {{base?:string, code:string, name:string, key:string}} options */
  constructor(options) {
    super();
    this.o = options; this.callback = null; this.backlog = []; this.conn = null; this.id = null;
    this.inputs = []; this.flushTimer = null; this.pingTimer = null;
    this.decoder = new AnimalDeltaDecoder(); this.playerDecoder = new PlayerDeltaDecoder(); this.trees = {}; this.forage = {}; this.boats = {}; this.parts = new RelayProtocol.Reassembler();
    this.roster = []; this.rtt = null; this.code = RelayProtocol.normalizeCode(options.code); this.listeners = [];
    this.pending = null; this.welcomed = false; this.ended = false;
  }

  static explain(reason, detail = {}) {
    return ({
      room_full: 'That game is full (4 players).', no_host: 'No game is being hosted with that code. Check the code, and that the host is still online.', room_taken: 'That room code is already in use.',
      unreachable: 'Could not reach the relay server. Check your connection (and the relay address in the lobby).', timeout: 'The host did not answer in time.',
      host_left: 'The host left the game.', kicked: detail.text || 'You were removed by the host.', ended: 'The host ended the session.', host_ended: 'The host ended the session. Your character was saved.',
      closed: 'The connection was lost.', local: 'You left the game.', version: 'This game version does not match the host. Reload the page and try again.', bad_request: 'Could not join that game.'
    })[reason] || detail.text || 'Could not join the game.';
  }

  connect() {
    CONFIG.net.interpDelayTicks = 5;                                      // snapshots arrive over the internet: buffer a little more
    const base = this.o.base || RelayConnection.baseUrl();
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      const fail = reason => { if (this.pending) { const p = this.pending; this.pending = null; const err = new Error(RemoteAdapter.explain(reason.reason || reason, reason)); err.reason = reason.reason || reason; p.reject(err); } };
      this.conn = new RelayConnection({
        url: RelayConnection.urlFor(base, { room: this.code, role: 'client', name: this.o.name }),
        onFrame: raw => this._onFrame(raw),
        onRelay: msg => { if (msg.ev === 'joined') this._sendJson({ t: 'hello', v: RelayProtocol.VERSION, name: this.o.name, key: this.o.key, appearance: this.o.appearance }); },
        onEnd: (reason, detail) => {
          if (this.pending) fail(reason === 'error' ? { reason: detail.code, text: detail.text } : reason);
          else this._finish(reason, detail);
        }
      });
      this.conn.open().catch(e => fail(e.reason || 'unreachable'));
      setTimeout(() => fail('timeout'), 20000);
    });
  }

  _sendJson(obj) { this.conn.send(JSON.stringify(obj)); }

  sendInput(input) { this.inputs.push(input); if (this.inputs.length >= 6) this._flush(); }
  sendCommand(command) { this._flush(); this._sendJson({ t: 'cmd', cmd: command }); }     // (flush first: commands must not overtake the movement before them)
  onSnapshot(cb) { this.callback = cb; const waiting = this.backlog; this.backlog = []; for (const s of waiting) cb(s); }
  _flush() { if (this.inputs.length) { this._sendJson({ t: 'inputs', list: this.inputs }); this.inputs = []; } }

  _onFrame(raw) {
    let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.t === 'part') { const whole = this.parts.push(msg); if (!whole) return; try { msg = JSON.parse(whole); } catch (e) { return; } }
    switch (msg.t) {
      case 'welcome': this._onWelcome(msg); break;
      case 'denied': if (this.pending) { const p = this.pending; this.pending = null; const err = new Error(msg.text || RemoteAdapter.explain(msg.reason)); err.reason = msg.reason; p.reject(err); this.conn.close(); } break;
      case 'snapshot': this._onSnapshot(msg); break;
      case 'roster': this.roster = msg.players; this._emit({ type: 'roster' }); break;
      case 'ping': this._sendJson({ t: 'pong', ts: msg.ts }); break;
      case 'pong': if (typeof msg.ts === 'number') this.rtt = Math.max(0, Date.now() - msg.ts); break;
      case 'session_end': this._finish('host_ended', {}); break;
    }
  }

  _onWelcome(msg) {
    if (!this.pending || this.welcomed) return;
    this.welcomed = true; this.id = msg.id; this.roster = (msg.session && msg.session.players) || []; this.hostName = (this.roster.find(p => p.host) || {}).name || 'Host';
    this.decoder.reset(msg.animals); this.trees = msg.trees || {}; this.forage = msg.forage || {}; this.boats = msg.boats || {};
    this.flushTimer = setInterval(() => this._flush(), 66);
    this.pingTimer = setInterval(() => this._sendJson({ t: 'ping', ts: Date.now() }), CONFIG.net.hostPingMs);
    const p = this.pending; this.pending = null; delete msg.t; p.resolve(msg);
  }

  _onSnapshot(msg) {
    if (!this.welcomed) return;
    delete msg.t;
    msg.players = this.playerDecoder.decode(msg.players);
    msg.animals = this.decoder.decode(msg.animals);
    if (msg.boats) this.boats = msg.boats;  msg.boats = this.boats;
    if (msg.trees) this.trees = msg.trees;    msg.trees = this.trees;       // (the game treats a missing list as "everything regrew": always hand it the latest full one)
    if (msg.forage) this.forage = msg.forage; msg.forage = this.forage;
    if (this.callback) this.callback(msg); else this.backlog.push(msg);
  }

  _finish(reason, detail) {
    if (this.ended) return;
    this.ended = true; clearInterval(this.flushTimer); clearInterval(this.pingTimer);
    this._emit({ type: 'ended', reason, text: RemoteAdapter.explain(reason, detail) });
  }

  disconnect() {
    if (this.ended) return;
    try { this._flush(); this._sendJson({ t: 'bye' }); } catch (e) { /* socket already gone */ }
    clearInterval(this.flushTimer); clearInterval(this.pingTimer); this.ended = true;
    if (this.conn) this.conn.close();                                // (frames already sent are delivered before the close)
  }

  onSession(cb) { this.listeners.push(cb); }
  _emit(event) { for (const cb of this.listeners) { try { cb(event); } catch (e) { console.warn(e); } } }
  getSessionInfo() { return { role: 'client', online: !this.ended, code: this.code, players: this.roster.map(p => Object.assign({ rtt: p.id === this.id ? this.rtt : null }, p)), you: this.id, rtt: this.rtt, hostName: this.hostName }; }
}
