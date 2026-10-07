// Cloudflare Pages Function: /health, to check the site and its relay binding.
import RelayProtocol from '../src/relayProtocol.js';

export function onRequest({ env }) {
  return new Response(JSON.stringify({ ok: true, relay: !!env.ROOMS || !!String(env.RELAY_URL || '').trim(), via: env.ROOMS ? 'binding' : env.RELAY_URL ? 'url' : 'none', protocol: RelayProtocol.VERSION, maxPlayers: RelayProtocol.MAX_PLAYERS }), { headers: { 'content-type': 'application/json' } });
}
