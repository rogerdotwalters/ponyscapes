// Cloudflare Pages Function: /ws on the game's own address. It hands each WebSocket to the room's Durable Object in the relay Worker,
// so the game on Pages needs no separate relay URL (relay-config.js stays '').
import RelayProtocol from '../src/relayProtocol.js';

export async function onRequest({ request, env }) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response('Origin not allowed', { status: 403 });   // only this site's own pages
  if (!env.ROOMS) return new Response('The multiplayer relay is not set up: deploy the relay Worker (npm run deploy:relay), then redeploy this site', { status: 503 });
  const code = RelayProtocol.normalizeCode(new URL(request.url).searchParams.get('room'));
  if (!RelayProtocol.isCode(code)) return new Response('Bad room code', { status: 400 });
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
}
