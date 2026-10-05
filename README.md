# Realm: multiplayer on Cloudflare

One Cloudflare Worker does two jobs: it **serves the game** (static files in `public/`) and it **relays WebSocket messages** between the player who hosts a game and up to three friends. The game itself runs in the **host's browser**; the relay only copies messages. Nothing about the game is stored on Cloudflare.

```
 friend ─┐                                   ┌─ Durable Object "room ABCDE" (one per code, stores nothing)
 friend ─┼─ wss://your-worker/ws?room=ABCDE ─┤        copies frames host <-> friends
 friend ─┘                                   └─ host (runs the whole game, keeps the saves in ITS OWN browser database)
```

## Deploy (about 5 minutes)

You need a free Cloudflare account and Node 18+.

```bash
cd realm-cloudflare
npm install            # installs wrangler
npx wrangler login     # opens a browser once
npm run deploy         # builds ./public from the game source and deploys
```

Wrangler prints your address, e.g. `https://realm-relay.YOURNAME.workers.dev`. Open it: that is the game. One person presses **Host a game**, shares the 5-letter code (or the invite link from *Menu > Session*), and up to three friends press **Join a game**.

Try it locally first with `npm run dev` (needs the `workerd` binary that wrangler installs).

## Game on Cloudflare Pages instead

Pages cannot run Durable Objects, so deploy the Worker as above and put the game on Pages:

1. `npm run build` then `npx wrangler pages deploy public --project-name realm`.
2. Edit `public/relay-config.js`: `window.REALM_RELAY = 'wss://realm-relay.YOURNAME.workers.dev/ws';` (it survives rebuilds).
3. In `wrangler.toml` set `ALLOWED_ORIGINS = "https://realm.pages.dev"` and `npm run deploy` again, so only your page may open relay sockets.

Players can also point at any relay from the lobby ("Relay address") or with `?relay=wss://...` in the link.

## How saving works

* The **host's browser database (IndexedDB)** holds each world and, inside it, one character per person who ever played. A friend is recognised by a secret key their own device keeps, so coming back on the same device restores their pack, skills, ponies and position.
* Saved: every **15 minutes** (`CONFIG.net.autosaveMinutes`), whenever **someone leaves** (their character first), when the host's tab goes to the **background**, on **Save now**, and when the host presses **End session & save**.
* Hosts continue a world from the lobby. Saves live in that browser: clearing site data deletes them, and they do not follow the host to another device.

## Limits worth knowing

* 4 players per session (the host and 3 friends). A 5th person is refused.
* If the host closes the tab, the session ends for everyone (their characters were saved the moment each friend left or at the last save). The host's game continues offline if only the relay connection drops.
* The host's simulation keeps running in a background tab (it is driven by a Web Worker timer), but the host's own character stands still while the tab is hidden.
* Cost: a busy 4-player game is about 16 relay messages a second from the host plus about 15 a second from each friend. The relay is billed per message (WebSocket messages count 1/20 of a request), which fits comfortably in the free plan for several hours of play a day. Check Cloudflare's current limits.
* Identity is a key on the device, not an account: fine for friends, not for strangers.

## Layout

```
wrangler.toml       Worker + Durable Object + static assets
src/index.js        routes /ws to the room, serves /health and the game
src/relay*.js       the room's rules (shared with the browser; copied here by tools/build.py)
public/             the game (built by tools/build.py; edit relay-config.js here)
tools/build.py      copies the game source + relay modules into place
```
