// Cloudflare Pages Function: /ws on the game's own address, so the game on Pages needs no relay URL of its own (relay-config.js stays '').
// It hands each WebSocket to the relay: straight to the room's Durable Object when the site is bound to it (env.ROOMS), else through the relay
// Worker's address (env.RELAY_URL, set in wrangler.toml). With neither, multiplayer is off and the lobby says so; solo play is unaffected.
import RelayProtocol from '../src/relayProtocol.js';

export async function onRequest({ request, env }) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response('Origin not allowed', { status: 403 });   // only this site's own pages
  const url = new URL(request.url), code = RelayProtocol.normalizeCode(url.searchParams.get('room'));
  if (!RelayProtocol.isCode(code)) return new Response('Bad room code', { status: 400 });
  if (env.ROOMS) return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  const relay = String(env.RELAY_URL || '').trim().replace(/\/+$/, '');
  if (relay) {                                                    // pass the WebSocket on to the relay Worker (it answers with the 101 upgrade)
    const target = new URL(relay.replace(/^ws/, 'http') + '/ws');
    target.search = url.search;
    return fetch(new Request(target.toString(), request));
  }
  return new Response('The multiplayer relay is not set up: deploy the relay Worker (npm run deploy:relay), set RELAY_URL in wrangler.toml, then redeploy this site', { status: 503 });
}
