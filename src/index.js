// Ponyscapes relay: a Worker that routes WebSockets to one Durable Object per room, and serves the game's static files.
import { DurableObject } from 'cloudflare:workers';
import RelayProtocol from './relayProtocol.js';
import { RelayLogic } from './relayLogic.js';

/** Token bucket per client socket: a burst of 120 frames, then 80 a second (the game sends about 20 a second). */
const BURST = 120, REFILL_PER_SECOND = 80;

export class PonyscapesRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // keep-alive: the relay answers "ping" itself, without waking this object (and without it being billed as a request)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.buckets = new WeakMap();
    this.deferred = null;
    // The room keeps NO state in memory (it may hibernate): who is host / which client is c2 lives in each socket's attachment.
    this.io = {
      sockets: () => this.ctx.getWebSockets().map(ws => ({ ws, att: ws.deserializeAttachment() })),
      send: (ws, text) => { try { ws.send(text); } catch (e) { console.warn('relay send failed:', String(e)); } },
      close: (ws, code, reason) => {
        if (this.deferred) { this.deferred.push({ ws, code, reason }); return; }          // (a close during the upgrade itself is lost: see fetch)
        try { ws.close(code, reason); } catch (e) { console.warn('relay close failed:', String(e)); }
      },
      setAtt: (ws, att) => ws.serializeAttachment(att),
      allow: ws => this.allow(ws)
    };
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const url = new URL(request.url);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);                         // hibernation API: no CPU or memory is billed while the room is quiet
    this.deferred = [];
    RelayLogic.open(this.io, server, { role: url.searchParams.get('role'), name: url.searchParams.get('name') });
    const closes = this.deferred; this.deferred = null;
    if (closes.length) {                                      // a refused guest is told why (already sent), and only THEN hung up on, once the handshake is complete
      this.ctx.waitUntil(new Promise(done => setTimeout(() => { for (const c of closes) { try { c.ws.close(c.code, c.reason); } catch (e) { /* gone */ } } done(); }, 100)));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) { RelayLogic.message(this.io, ws, ws.deserializeAttachment(), message); }
  // (no ws.close() here: with this compatibility date the runtime completes the close handshake itself)
  webSocketClose(ws) { RelayLogic.close(this.io, ws, ws.deserializeAttachment()); }
  webSocketError(ws) { RelayLogic.close(this.io, ws, ws.deserializeAttachment()); }

  allow(ws) {
    const now = Date.now();
    let b = this.buckets.get(ws);
    if (!b) { b = { tokens: BURST, at: now }; this.buckets.set(ws, b); }
    b.tokens = Math.min(BURST, b.tokens + (now - b.at) / 1000 * REFILL_PER_SECOND); b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(request.headers.get('Origin') || '')) return new Response('Origin not allowed', { status: 403 });
      const code = RelayProtocol.normalizeCode(url.searchParams.get('room'));
      if (!RelayProtocol.isCode(code)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    if (url.pathname === '/health') return json({ ok: true, protocol: RelayProtocol.VERSION, maxPlayers: RelayProtocol.MAX_PLAYERS });
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Ponyscapes relay is running. Connect a WebSocket to /ws?room=CODE&role=host|client.', { status: 200 });
  }
};
