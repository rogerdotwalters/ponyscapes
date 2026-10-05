/* Where the multiplayer relay lives.
 *   ''                                   the game and the relay are served by the same Cloudflare Worker (the default setup)
 *   'wss://realm-relay.NAME.workers.dev/ws'   the game is on Cloudflare Pages and the relay is a separate Worker
 * Players can also override it from the lobby ("Relay address") or with ?relay=wss://... in the link. */
window.REALM_RELAY = '';
