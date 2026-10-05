'use strict';
/* NETWORK - one WebSocket to the relay, for the host and for clients alike.
 *
 * It does NOT rely on the browser's `close` event to know the session is over: a relay message that ends things (error, host_left,
 * kicked, ended) is final by itself, because a close handshake can be slow or never finish through proxies. `onEnd` fires exactly once. */
class RelayConnection {
  /** @param {{url:string, onFrame:(text)=>void, onRelay:(msg)=>void, onEnd:(reason:string, detail?:object)=>void}} h */
  constructor(h) { Object.assign(this, h); this.ws = null; this.ended = false; this.lastSeen = 0; this.keepAlive = null; }

  /** The relay address: ?relay= in the link, the lobby's saved override, relay-config.js, else this page's own host (the all-in-one Worker). */
  static baseUrl() {
    const q = new URLSearchParams(location.search), saved = (() => { try { return localStorage.getItem('realm.relay'); } catch (e) { return null; } })();
    const chosen = q.get('relay') || saved || (typeof window !== 'undefined' && window.REALM_RELAY) || '';
    if (chosen) return chosen;
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
  }
  static urlFor(base, { room, role, name }) {
    return base + (base.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(room) + '&role=' + role + '&name=' + encodeURIComponent(name || '');
  }

  /** Resolves when the socket is open; rejects (with .reason = 'unreachable') if it cannot connect. */
  open() {
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(this.url); } catch (e) { const err = new Error('Could not open ' + this.url); err.reason = 'unreachable'; reject(err); return; }
      this.ws.onopen = () => { settled = true; this.lastSeen = Date.now(); this._startKeepAlive(); resolve(); };
      this.ws.onmessage = e => this._onMessage(e.data);
      this.ws.onerror = () => { if (!settled) { settled = true; const err = new Error('Could not connect to the relay'); err.reason = 'unreachable'; reject(err); } };
      this.ws.onclose = () => { if (!settled) { settled = true; const err = new Error('The relay closed the connection'); err.reason = 'unreachable'; reject(err); } this._end('closed'); };
    });
  }

  send(text) { if (this.ws && this.ws.readyState === 1 && !this.ended) this.ws.send(text); }
  get buffered() { return this.ws ? this.ws.bufferedAmount : 0; }
  get isOpen() { return !!this.ws && this.ws.readyState === 1 && !this.ended; }

  _onMessage(data) {
    this.lastSeen = Date.now();
    if (typeof data !== 'string' || data === 'pong') return;
    if (data.charCodeAt(0) === 123 && data.startsWith('{"t":"relay"')) {              // a message from the relay itself
      let msg; try { msg = JSON.parse(data); } catch (e) { return; }
      this.onRelay(msg);
      if (msg.ev === 'error' || msg.ev === 'host_left' || msg.ev === 'kicked' || msg.ev === 'ended') this._end(msg.ev, msg);
      return;
    }
    this.onFrame(data);
  }

  _startKeepAlive() {
    this.keepAlive = setInterval(() => {
      if (Date.now() - this.lastSeen > 60000) { this._end('timeout'); return; }          // nothing (not even a pong) for a minute
      this.send('ping');
    }, 20000);
  }

  _end(reason, detail) {
    if (this.ended) return;
    this.ended = true; clearInterval(this.keepAlive);
    try { this.ws.close(); } catch (e) { /* already closing */ }
    this.onEnd(reason, detail || {});
  }
  close() { this._end('local'); }
}
