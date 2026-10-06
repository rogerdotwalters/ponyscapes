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

## Buildings, interiors and the level editor

The village has four buildings you walk into: the **Carpenter**, the **Veterinary**, the **General Store** and **Your Home** (they replace the old
placeholder houses and the wall-built starter home; the crafting table now stands in the home's yard). Walk up to a door and press **F** (or tap the
interact button) to go in; stand on the **doormat** inside and press F to go back out.

* **Grids and instances.** The overworld and every instance are separate game **grids**, each its own World with its own coordinates
  (`js/shared/grids.js`). Going through a door moves you to another grid rather than to a far-off corner of the overworld. Grid ids: `''` the overworld,
  `room:<site>` a shared room (store, carpenter, vet), `room:<site>:<n>` a player's own copy (Your Home: every player gets one, remembered by
  their player key and saved with the world), `cave:<ring>` a ring's dungeon. Players, animals and items on the ground carry their `grid`; things are
  only ever near each other on the same grid, and each player is only sent what is on theirs. The client keeps the overworld (its buildings, trees and
  stockpiles stay up to date) plus the grid it stands on. A new kind of instance is a plan class (tiles, walls, props, entry / exit) and one line in
  `Grids.plan()`.
* **Data.** Buildings are `js/data/buildings/` (one file each: size, door, colours, sign, which room, shared or per player), where they stand is
  `js/shared/layers/buildingSites.js`, tile types are `js/data/interiors/tiles.js` and furniture is `js/data/furniture/` (bed, table, chair, bookshelf,
  dresser, rug, fireplace, potted plant, lamp, shop counter, goods shelf, crate, workbench, lumber rack, exam table, medicine cabinet, hay bale).
* **The rooms** live in `public/js/content/interiors.js`, written by **`/level-editor.html`**: paint tiles (paint, room, rectangle, fill, pick, erase),
  place and turn furniture, resize, undo, see the room as the game draws it, and get warnings (no doormat, a blocked arrival tile, overlapping furniture).
  **Play-test room** opens the game standing inside it (`index.html?solo=1&content=draft&enter=<building>`); **Download interiors.js** gives you the file.

## Creatures that want things, and bosses you can appease

A creature whose data has `wants` shows a **thought bubble** with what it is after when you come near (`js/shared/wantSystem.js`). Hold that item
and press **F** ("Give ...") beside it: it is happier with you (hearts) and stops asking for a while. Dogs want a **bone** (dropped by deer, sheep,
goats, boar, elk and wolves) or raw meat; cats want fish.

**The Cave Bear can be fought or appeased.** Three of her **cubs** are lost somewhere in the first ring. They only come to you for **fish** (catch
some with the rod), and they won't be picked up until you have fed them one. To find them, study the **glowing paw prints** in her cave (F): from then on the lost cubs show on your map (saved per player). Carry a cub to her cave and hold it in your hand: she won't attack
you, and F gives it back (her bubble counts 0/3). With all three home she is at peace, the next ring opens just as if she had been beaten, and she
stays in the cave with her cubs from then on (saved with the world). Any other boss can get the same treatment from its data: `wants: { items, need,
appease: true, quest: { creature, count } }`, plus a young creature with `wants: { items, unlocks: 'pickup' }` and a carried item for it.

## The map

Drag the map (mouse or finger) to look around; **Centre on me** brings it back. An arrow on the edge always points the way to **town** (with the
distance), and others point to you when you have dragged away, to the nearest treasure, and to the nearest lost cub you have tracked.

## Admin page (testing)

Menu > **Admin** (the host only) asks for the code **112298** (remembered until the tab closes; **Lock** locks it again). It is there to keep
younger testers out, not real security: the code is in `js/client/ui/settingsUI.js`. Behind it:

* **Testing**: the flying test pony and hostile mobs off.
* **World** (changes at once, for everyone in the game): **Global speed** 1-100 (everything that moves; 100 = as built), **Day / night** (% of each day
  that is daylight; 54 = as built, a 50 / 50 button), **Game time** (in-game hours per real hour; 180 = as built, a day in 8 real minutes).
* **Trees per biome** (folded, one entry per biome): amount (% of normal) and max (% of grass tiles). Trees are part of the land each machine builds
  from the seed, so they change from the next time a world is started or continued, and only where the land has not been seen yet.
* **Save into the game folder**: the settings live in `public/js/content/gameSettings.js`. Changes on the page are kept in the host's browser; **Export JSON**
  (or **Download gameSettings.js**) gives you the values to paste into that file so everyone gets them. You can also paste JSON back in, or go back to the file's values.

## Ponies, lassos and grooming

* **Speed scales with level.** Every pony kind has a `baseSpeed` (Pony 3.8, Earth 4.4, Pegasus 5.2, Unicorn 4.8, Alicorn 5.6 tiles/s); its level multiplies that by
  `CONFIG.sim.ponySpeed.curve` (editable in editor.html > Settings). A wild pony flees at `wildFleeFactor` (0.92) of its own top speed, so to catch a pegasus
  you first raise your earth pony to about level 18 (`js/shared/ponyProgress.js`).
* **Ponies level up** from distance ridden, tasks done in the saddle (chopping, hunting, lassoing...), treats (more for food they love) and grooming.
* **Lasso slot** (Gear, **G**): **L** (or the Lasso button) throws whatever lasso is in it. Rope Lasso (tier 1: ponies, earth ponies) → Silk (2: pegasi) →
  Golden (3: unicorns) → Starlight (4: alicorns), each crafted from the one before at the crafting table.
* **Your main pony** (★ on its name) follows you everywhere when you are not riding it: around the world, into buildings and caves, and it
  catches up if you gallop off on another pony. Your starter pony begins as your main pony. Riding another of your ponies, open the bag (**I**) and press
  **★ Make main pony** in its section (or press **N**) to make it your main pony instead (the old one stays where it is). It is in the bag, not on the screen,
  so it is never hit by accident. It is saved with your character and the world.
* **Tool belt and bags** (`js/data/items/bags.js`, `js/shared/packSystem.js`): you carry a **5-slot tool belt** (the hotbar, keys **1-5**) plus the
  **bag** you wear (the Bag slot in Gear). Everybody starts with the **Starter Backpack** (5 slots); buy a **Leather Satchel** (8) or an **Explorer's Pack** (12)
  at the General Store, or craft one at a crafting table, then **Wear bag** (in the bag, **I**) or **Swap bag** (Gear). You always wear exactly one bag;
  a swap is refused if the new bag is too small for what you carry, and the old bag goes into the new one.
* **Pony packs**: every pony you own has at least **2 bag slots** (3 for rare and epic ponies, 4 for legendary), and pony bags are bigger. The starter pony
  wears the **Starter Side Pack** (10 slots), which holds the rest of the test kit (bow, arrows, torches, jug, planks, rope, string, stone, apples and 25 gold).
  **Saddlebags** (15) and **Great Saddlebags** (20) are sold at the General Store or crafted. Ride your pony or stand next to it and the bag (**I**) shows
  its pack: tap a stack and tap a slot in any section, or use **To pony** / **To my bag**; pick a pony bag and press **Put on pony**, tap a bag on the pony to
  take it off (the rest of the pack must still hold everything). The pack is saved with the pony (character and world saves). An older save with a bigger
  inventory loses nothing: what the new bag cannot hold goes into the main pony's pack (it gets a Starter Side Pack), or on the ground.
* **Shops**: the General Store's **Shop Counter** (press **F** at it) sells bags, torches and jugs for gold coins (an item's `price` in its data table; a building
  lists what it sells with `shop: [...]`, and any furniture with `shop: true` is a counter). Coins come from your bag first, then from your pony's pack.
* **Brushes**: a Wooden Brush (by hand: plank + 2 string) or a Soft Brush grooms a pony you own (Use beside it): hearts and XP.
* **Items on the ground**: in the bag (**I**) pick a stack, then **Drop 1**, **Drop all** or **Destroy** (tap twice). Anyone picks a pile up with **F**; loot that does not fit
  in your pack falls on the ground too.
* Hunger and thirst are switched off for players (`CONFIG.sim.vitals`), and so is building walls, floors, doors, windows and fences (`CONFIG.sim.construction`);
  stations (crafting table, stockpiles, stable, furnace, campfire) are still crafted, placed and upgraded.

`public/` is the game source (it came from realm.zip) and is deployed as it is.
`python3 tools/bundle.py out.html` packs the game in `public/` into one self-contained HTML file.
