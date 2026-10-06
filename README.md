# Realm: multiplayer on Cloudflare

**Cloudflare Pages serves the game** (static files in `public/`) and a small **relay Worker relays WebSocket messages** between the player who hosts a game and up to three friends. The game itself runs in the **host's browser**; the relay only copies messages. Nothing about the game is stored on Cloudflare.

```
 friend ─┐                                   ┌─ Durable Object "room ABCDE" (one per code, stores nothing)
 friend ─┼─ wss://your-site/ws?room=ABCDE ──┤        copies frames host <-> friends
 friend ─┘                                   └─ host (runs the whole game, keeps the saves in ITS OWN browser database)
```

## Deploy to Cloudflare Pages (about 10 minutes)

You need a free Cloudflare account and Node 18+. Two pieces go up: the **relay Worker** (multiplayer rooms, a Durable Object; Pages cannot host those itself)
and the **Pages site** (the game). The site's `/ws` function hands each WebSocket to the relay, so players only ever use the Pages address.

```bash
npm install
npx wrangler login          # opens a browser once
npm run deploy:relay        # 1. the relay Worker "realm-relay" (do this first: the site binds to it)
npm run deploy:pages        # 2. the game on Pages, project "realm" (wrangler asks to create it the first time)
```

Or both at once: `npm run deploy`. Open the address wrangler prints (e.g. `https://realm.pages.dev`), press **Host a game**, and share the code or link.
Check the relay binding at `https://realm.pages.dev/health` (`"relay": true`).

**Deploying from Git instead:** in the Cloudflare dashboard, Workers & Pages > Create > Pages > Connect to Git, pick this repository and set
*Build command:* (leave empty), *Build output directory:* `public`. The repo's `wrangler.toml` supplies the relay binding, and `functions/` is picked up
automatically. The relay Worker still has to be deployed once with `npm run deploy:relay`; redeploy it only when `src/` or the relay modules change.

Names: the Pages project is `realm` and the relay Worker `realm-relay` (in `wrangler.toml` and `relay/wrangler.toml`). If you rename the Worker, change
`script_name` in `wrangler.toml` to match.

**All-in-one alternative:** the relay Worker also serves the game, so `npm run deploy:relay` alone gives a working site at `https://realm-relay.NAME.workers.dev`.
Try everything locally with `npm run dev` (that Worker) or, for the Pages setup, `npx wrangler dev -c relay/wrangler.toml` in one terminal and `npx wrangler pages dev` in another.

Players can still point at any relay from the lobby ("Relay address") or with `?relay=wss://...` in the link; `public/relay-config.js` stays empty for Pages.

## How saving works

* The **host's browser database (IndexedDB)** holds each world and, inside it, one character per person who ever played. A friend is recognised by a secret key their own device keeps, so coming back on the same device restores their pack, skills, ponies and position.
* The **world** save also keeps everything players own that is not in their pack: every player's ponies and pets (tied to that player's key, so a
  friend's ponies wait where they left them, nobody else can ride or lasso them, and they come back when that friend rejoins, even after the host
  restarts) and the items lying on the ground.
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
wrangler.toml         the Cloudflare Pages project (output: public/, binds the relay's Durable Object)
functions/            Pages Functions: /ws (hands WebSockets to the relay) and /health
relay/wrangler.toml   the relay Worker + Durable Object (also serves the game: the all-in-one option)
src/index.js          the relay Worker's code; src/relay*.js are copies of public/js/shared/relay*.js (npm run build syncs them)
public/               the game itself, deployed as it is; editor.html is the content editor
tools/build.py        syncs the relay modules into src/ (it no longer touches public/)
tools/bundle.py       packs the game into one self-contained HTML file
```

## Your own content (editor.html)

Open `/editor.html` next to the game. It has a slot for every item, creature (ponies and animals) and character body:

* **Items**: name, stack size, rarity, resource type, food / tool / wardrobe (crown, outfit, cape with power and def) stats, a crafting recipe, where they lie about (biome + rate per 1000 tiles), and pictures: icon, on the ground, in the hand, built, and worn (up / down / left / right).
* **Creatures**: stats, lowest rarity, drops, where they spawn (ring, weight, herd size, and optionally only certain biomes) and four directional pictures (with walk-cycle frames). Ponies can have a picture set per biome variety.
* **Characters**: the prince and princess bodies, four directions.
* **Settings**: the pony speed curve (level → multiplier, with a chart and a "who can catch whom" table) and the pony levelling numbers.
  Ponies also have a **base speed** and a **lasso tier** (Creatures tab); lassos have a tier and an extra catch chance, brushes a grooming multiplier (Items tab).

Create, edit and delete your own entries; built-in ones can be changed (only the differences are saved) or reset. The draft lives in your browser;
**Play-test draft** opens the game with it, and **Download customContent.js** gives you the file to put at `public/js/content/customContent.js`
(pictures go in `public/assets/`, see `public/assets/README.md`). Anything without a picture keeps the game's procedural art.
Up / down views fall back to the side views until you draw them (`_drawUp` / `_drawDown` in `js/client/render/` are the procedural hooks).

## Rarity, buffs and abilities

Every pony rolls a rarity at birth (`js/shared/rarity.js`): common (basic), uncommon (one buff), rare (a buff and an ability), epic, legendary.
`Buff { id, name, type: movement | health | luck | friendship | carry, value, range, affectsOthers }` applies while the pony is ridden or
leashed (affectsOthers buffs also reach other players within `range`). `Ability { trigger, cooldown, effects }` and `Effect { kind, value, radius, duration, shape, target }`
define Flame Breath, Dash, Night Light and Frost Nova. They fire while riding with **H / K** (or the power button on touch screens); **B** stays the pegasus / alicorn flight.
(The class that rolls them is `PonyRarity`; `PonyTraits` is the game's own, separate pony-traits table.)

## Carrying, stockpiles and upgrades

You carry only as many stacks of wood, stone and clay as your Constitution level, +1 per pony with you (and Pack Pony buffs). Build Wood / Stone / Clay
Stockpiles at the crafting table (they need a stone hammer), deliver to them with **F**, and manage them in the **Town** window (**T**). Crafting tables pull missing
ingredients from linked stockpiles and store overflow there; buildings (stockpiles, crafting table, stable) upgrade with resources from nearby stockpiles.

## Ponies, lassos and grooming

* **Speed scales with level.** Every pony kind has a `baseSpeed` (Pony 3.8, Earth 4.4, Pegasus 5.2, Unicorn 4.8, Alicorn 5.6 tiles/s); its level multiplies that by
  `CONFIG.sim.ponySpeed.curve` (editable in editor.html > Settings). A wild pony flees at `wildFleeFactor` (0.92) of its own top speed, so to catch a pegasus
  you first raise your earth pony to about level 18 (`js/shared/ponyProgress.js`).
* **Ponies level up** from distance ridden, tasks done in the saddle (chopping, hunting, lassoing...), treats (more for food they love) and grooming.
* **Lasso slot** (Gear, **G**): **L** (or the Lasso button) throws whatever lasso is in it. Rope Lasso (tier 1: ponies, earth ponies) → Silk (2: pegasi) →
  Golden (3: unicorns) → Starlight (4: alicorns), each crafted from the one before at the crafting table.
* **Brushes**: a Wooden Brush (by hand: plank + 2 string) or a Soft Brush grooms a pony you own (Use beside it): hearts and XP.
* **Items on the ground**: in the bag (**I**) pick a stack, then **Drop 1**, **Drop all** or **Destroy** (tap twice). Anyone picks a pile up with **F**; loot that does not fit
  in your pack falls on the ground too.
* Hunger and thirst are switched off for players (`CONFIG.sim.vitals`), and so is building walls, floors, doors, windows and fences (`CONFIG.sim.construction`);
  stations (crafting table, stockpiles, stable, furnace, campfire) are still crafted, placed and upgraded.

`public/` is the game source (it came from realm.zip) and is deployed as it is.
`python3 tools/bundle.py out.html` packs the game in `public/` into one self-contained HTML file.
