'use strict';
/* SHARED (Cloudflare Worker + tests) - what a room does, written against a tiny `io` interface so the very same code runs inside a
 * Durable Object (which may hibernate, so NO room state is kept in memory: it lives in each socket's attachment) and inside the tests.
 *
 *   io.sockets()          -> [{ ws, att }]   every open socket of the room and its attachment { role, cid, name }
 *   io.send(ws, text)     io.close(ws, code, reason)     io.setAtt(ws, att)
 *   io.allow(ws)          optional: false = this client is sending too fast
 *
 * Close codes: 4001 room taken, 4002 no such room / no host, 4003 room full, 4004 host left, 4005 bad request, 4006 kicked, 4008 too fast. */
const RelayLogicProtocol = (typeof RelayProtocol !== 'undefined') ? RelayProtocol : require('./relayProtocol.js');
const RelayLogic = {
  CODES: { ROOM_TAKEN: 4001, NO_HOST: 4002, ROOM_FULL: 4003, HOST_LEFT: 4004, BAD_REQUEST: 4005, KICKED: 4006, TOO_FAST: 4008 },

  _event: (ev, extra) => JSON.stringify(Object.assign({ t: 'relay', ev }, extra)),
  _hostOf: io => io.sockets().find(s => s.att && s.att.role === 'host') || null,
  _clients: io => io.sockets().filter(s => s.att && s.att.role === 'client'),

  /** A socket connected. Accepts or rejects (rejections are sent as a message first, because browsers cannot read an HTTP error from a failed WebSocket). */
  open(io, ws, { role, name }) {
    const P = RelayLogicProtocol, E = RelayLogic._event;
    const reject = (code, reason, text) => { io.send(ws, E('error', { code: reason, text })); io.close(ws, code, reason); return false; };
    const others = io.sockets().filter(s => s.ws !== ws), host = others.find(s => s.att && s.att.role === 'host');
    name = P.cleanName(name);
    if (role === 'host') {
      if (host) return reject(RelayLogic.CODES.ROOM_TAKEN, 'room_taken', 'That room code is already in use');
      io.setAtt(ws, { role: 'host', cid: 'host', name });
      io.send(ws, E('hosting', { max: P.MAX_PLAYERS }));
      return true;
    }
    if (role !== 'client') return reject(RelayLogic.CODES.BAD_REQUEST, 'bad_request', 'Unknown role');
    if (!host) return reject(RelayLogic.CODES.NO_HOST, 'no_host', 'No game is hosted with that code');
    const clients = others.filter(s => s.att && s.att.role === 'client');
    if (clients.length + 1 >= P.MAX_PLAYERS) return reject(RelayLogic.CODES.ROOM_FULL, 'room_full', 'That game is full (4 players)');
    const used = new Set(clients.map(s => s.att.cid)); let n = 1; while (used.has('c' + n)) n++;
    const cid = 'c' + n;
    io.setAtt(ws, { role: 'client', cid, name });
    io.send(ws, E('joined', { cid, max: P.MAX_PLAYERS }));
    io.send(host.ws, E('peer_join', { cid, name }));
    return true;
  },

  /** A text frame arrived on `ws` (whose attachment is `att`). */
  message(io, ws, att, raw) {
    const P = RelayLogicProtocol, E = RelayLogic._event;
    if (typeof raw !== 'string' || !att) { io.close(ws, 1003, 'text only'); return; }
    if (att.role === 'client') {
      if (raw.length > P.MAX_CLIENT_FRAME) { io.close(ws, 1009, 'frame too big'); return; }
      if (io.allow && !io.allow(ws)) { io.close(ws, RelayLogic.CODES.TOO_FAST, 'sending too fast'); return; }
      const host = RelayLogic._hostOf(io);
      if (host) io.send(host.ws, P.fromClient(att.cid, raw));
      return;
    }
    if (att.role !== 'host') return;
    const frame = P.parseHostFrame(raw);
    if (!frame) return;
    const clients = RelayLogic._clients(io);
    if (frame.control) {
      const c = frame.control;
      if (c.t === 'kick') { const target = clients.find(s => s.att.cid === c.cid); if (target) { io.send(target.ws, E('kicked', { text: String(c.reason || 'Removed by the host').slice(0, 80) })); io.close(target.ws, RelayLogic.CODES.KICKED, 'kicked'); } }
      else if (c.t === 'end') for (const s of clients) { io.send(s.ws, E('ended')); io.close(s.ws, 1000, 'session ended'); }
      return;
    }
    for (const { to, body } of frame.items) {
      if (to === '*') { for (const s of clients) io.send(s.ws, body); continue; }
      const target = clients.find(s => s.att.cid === to);
      if (target) io.send(target.ws, body);
    }
  },

  /** A socket closed. */
  close(io, ws, att) {
    const E = RelayLogic._event;
    if (!att) return;
    const others = io.sockets().filter(s => s.ws !== ws);
    if (att.role === 'host') {
      for (const s of others) if (s.att && s.att.role === 'client') { io.send(s.ws, E('host_left')); io.close(s.ws, RelayLogic.CODES.HOST_LEFT, 'host left'); }
    } else if (att.role === 'client') {
      const host = others.find(s => s.att && s.att.role === 'host');
      if (host) io.send(host.ws, E('peer_leave', { cid: att.cid }));
    }
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = { RelayLogic };
