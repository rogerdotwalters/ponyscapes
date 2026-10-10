# Ponyscapes: multiplayer on Cloudflare

**Cloudflare Pages serves the game** (static files in `public/`) and a small **relay Worker relays WebSocket messages** between the player who hosts a game and up to three friends. The game itself runs in the **host's browser**; the relay only copies messages. Nothing about the game is stored on Cloudflare.

```
 friend ─┐                                   ┌─ Durable Object "room ABCDE" (one per code, stores nothing)
 friend ─┼─ wss://your-site/ws?room=ABCDE ──┤        copies frames host <-> friends
 friend ─┘                                   └─ host (runs the whole game, keeps the saves in ITS OWN browser database)
```

## Deploy to Cloudflare Pages (about 10 minutes)

You need a free Cloudflare account. Two pieces go up: the **Pages site** (the game) and the **relay Worker** (multiplayer rooms, a Durable Object;
Pages cannot host those itself). The site publishes on its own: solo and offline play work straight away, and multiplayer switches on once the
relay is deployed and the site is pointed at it. The site's `/ws` function hands each WebSocket to the relay, so players only ever use the Pages address.

**From the terminal** (Node 18+):

```bash
npm install
npx wrangler login          # opens a browser once
npm run deploy:relay        # 1. the relay Worker "ponyscapes-relay": note the address it prints, e.g. https://ponyscapes-relay.YOUR-NAME.workers.dev
#   2. put that address in wrangler.toml:  RELAY_URL = "https://ponyscapes-relay.YOUR-NAME.workers.dev"
npm run deploy:pages        # 3. the game on Pages, project "ponyscapes" (wrangler asks to create it the first time)
```

**From the Cloudflare dashboard (Git, no terminal):**
1. *The site:* Workers & Pages > Create > Pages > Connect to Git, pick this repository. *Build command:* (leave empty), *Build output directory:* `public`.
   It publishes with or without the relay.
2. *The relay:* Workers & Pages > Create > Workers > Import a repository, pick this repository, name it `ponyscapes-relay`, and set the
   *Deploy command* to `npx wrangler deploy -c relay/wrangler.toml`. Note its address (`https://ponyscapes-relay.YOUR-NAME.workers.dev`).
3. Put that address in `wrangler.toml` (`RELAY_URL = "..."`), commit, and the site redeploys with multiplayer on.

Check it at `https://ponyscapes.pages.dev/health`: `"relay": true` means multiplayer is on (`"via": "url"` or `"binding"`). Then press **Host a game** and share the code or link.

The error *"script ponyscapes-relay not found" (8000109)* means the site was bound to a relay Worker that does not exist yet. The binding is now
off by default; if you want it (option b in `wrangler.toml`: the site talks to the rooms directly instead of through the relay's address),
uncomment it only after the relay Worker is deployed. If you rename the Worker, change `script_name` there to match.

**All-in-one alternative:** the relay Worker also serves the game, so `npm run deploy:relay` alone gives a working site at `https://ponyscapes-relay.NAME.workers.dev`.
Try everything locally with `npm run dev` (that Worker) or, for the Pages setup, `npx wrangler dev -c relay/wrangler.toml` in one terminal and `npx wrangler pages dev` in another.

Players can still point at any relay from the lobby ("Relay address") or with `?relay=wss://...` in the link; `public/relay-config.js` stays empty for Pages.

## The world

The map is a **tree of zones** (`public/js/data/zones/`, one small file each; `layers/zoneLayer.js` lays them out). The root, **The Meadows**, holds the village. Sub zones branch
off it (now: the Orchard, the Mushroom Kingdom, and the Forest, the next zone on), and a sub zone can have sub zones of its own. A zone's children are placed at random angles
round it, from the world seed.

* every zone has **one biome**, is walled in by **cliffs of that biome's colours**, and joins its parent through a **gateway** in the wall
* the whole map floats in open sea, behind an **invisible barrier** (boats and flying ponies cannot leave)
* a gateway can be **shut**: `locked: true` in the zone's data, opened by a guardian (`unlockedBy`) or by hand with `worldProgress.setGate(zoneIndex, true | false)`. A shut gate is a solid, shimmering barrier for now (visuals for story beats come later)
* the Cave Bear's lair is the last layer of the Old Cavern, in the Meadows' hills
* **plants**: each biome has a plant list (`public/js/data/flora/`, one file per biome): which trees, berry bushes and mushrooms grow there. Meadow: apple trees and some pine, raspberries. Orchard: oak and apple trees (many kinds of apple), no pine. Forest: hard pine and spruce, blackberries. Mushroom Kingdom: ash trees and five kinds of mushroom. Tree species (look, growing days, seasons, colour wash and how they **spread**) are in `data/trees/trees.js`. Once a day a tree near a player may seed a sapling of its own kind beside it (`shared/floraSystem.js`): only species its biome lists, only in a season it takes in, never on walls, gateways, paths or fields, never crowded, a dozen a day at most

**Going down in a dungeon** (`shared/downed.js`, rules in `CONFIG.sim.difficulty`): at 0 health inside a dungeon room or lair you drop to your knees and the view darkens instead of waking in the village. After 7 seconds you get up with half health; snacks (Use with food in hand) shorten the wait and add health, and a teammate pressing Interact beside you lifts you at once. There are easy / medium / hard modes (host: Settings > Difficulty); only easy is written, so all three use its rules for now. Check it with `npm run test:downed`.

To see what the generator makes, open **`/map-preview.html`**: a Regenerate button (new random seed), a seed box, Previous, an auto-regenerate timer and an "open all gateways" switch. `?seed=123` opens one seed. It uses the game's own world code and never touches saved worlds.

**The Slime Warren** (Act 1, `data/dungeons/slime_warren.js`): once the Cave Bear is beaten a second cave in the hills clears its rubble. Five levels of about 50 x 50 tiles (made by code, `shared/slimeRooms.js`), each filling with green slimes in waves: the dungeon data sets, per level, the most slimes alive at once, the seconds between new ones, their level and how many come in all. Beat every one and the way on opens. The last room is the Slime King, who leaps at you and slams the ground (`shared/behaviors/slimeking.js`). Menu > Dev settings > **Act 1** has a *Bot player* checkbox (a second player that follows, fights and picks you up), a *Cave Bear defeated* checkbox and teleports into each level. Check it with `npm run test:warren`. Caves are dark: bring a torch.

**Main menu, editor and loot tables.** The game opens on a menu: **Play** (character, then solo / host / join) or **Editor** (`editor.html`, behind the same developer code as Dev settings; `shared/devLock.js`). The menu's theme is the soundtrack's last tune, *Harmony Hooves*. The editor's **Loot** tab edits what every creature drops and what each dungeon's chests hold (`shared/lootTables.js`): changes save at once in that phone's or computer's browser storage, and *Download lootTables.js* / *Import* move them between devices (put the file at `public/js/content/lootTables.js` to make it the game's own). The host's device decides what drops in a game with friends. Check it with `npm run test:loot`.

Green slimes also **leap**: from a few tiles away a slime squats (a small red ring marks where you stand), hops at that spot and splashes down, hurting you only if you are still there (`shared/behaviors/slimeleap.js`, the `leap` block in `data/creatures/slime.js`).

**Pony skill trees.** Every pony variety (meadow, moss, frost ...) gets its own tree of skills that unlock as the pony levels up (`data/ponies/skills.js`, powers in `shared/ponySkills.js`). Meadow ponies come first: **Leaf Blast** (a cone of razor leaves, from pony level 3) and a power from the pony's **cutie mark** (level 6: star, heart, flower, moon, cloud, apple, drop and note each give a different one). Ridden, a pony's powers are H / K for its rarity abilities, then Y / O for skills (the power button on touch screens); skills grow 8% stronger per pony level, and the Pony Book shows the tree with what is still locked. Check it with `npm run test:skills`.

**The Apple button** (`shared/appleSystem.js`, key **C**, a round button beside the emote button on desktop and in the thumb cluster on touch screens): shows an apple and how many you carry (it reads 0 when you have none). Press it to give an apple to the pony you ride, or your nearest own pony: its health is restored at once (a share of its maximum), and special apples add effects (golden: rider speed, pink: powers recharge faster, crystal: full heal, speed and recharge, russet: pony experience), all set in the apple's `pony` block in `data/items/foods.js`. For the player an apple does nothing except give a short health regeneration. Hold the button (or Shift+C) to choose another kind. Check it with `npm run test:apples`.

**Enemy health bars and level markers.** A hostile creature (or guardian) near you shows a health bar above its name, and a marker beside the name tells you how its level compares with your Hunting level (`AnimalLevels.marker`): one or two green arrows down for weaker, a yellow diamond for even, one or two arrows up (orange, red) for stronger, and a **skull** when you are low level and it is far beyond you (at least 8 levels above and at least double yours). Check it with `npm run test:markers`.

**The slime castle and the Smithy.** The abandoned castle is full of slimes: the first time anyone steps into one of its ruined rooms they ooze out (more in big rooms, tougher deeper in; `shared/castleSlimes.js`), and restoring the castle clears them. A **trapdoor in the cellar** leads down into **The Slime Cellars** (`data/dungeons/castle_crypt.js`): three small levels of slime waves, then the **Slime Baron** (a smaller king with the same leap and slam). **Hilda's Smithy** (`data/buildings/blacksmith.js`, west of the village) sells seven swords, from the quick rapier to the slow, heavy broadsword (`data/items/weapons.js`); only the General Store buys things. Act 1 settings have teleports into the Cellars. Check it with `npm run test:castle`.

**Coins and selling.** Every enemy drops coins (a creature whose loot table has none gets silver worked out from its health), and a coin drop grows with the creature's level (+20% per level above 1) and varies a little each time, so deeper Slime Warren slimes pay more (`shared/lootTables.js`). The General Store's counter has a **Sell** tab: it buys everything in your bag except coins, for copper-sized prices (an item's own `sell` value, else 40% of its shop price, else from its recipe, food value, tool damage or rarity: `Shops.sellPrice`).

The older five-ring world is kept in `legacy/ring-world/` (see the README there). Check the world with `npm run test:dungeon`.

## How saving works

* The **host's browser database (IndexedDB)** holds each world and, inside it, one character per person who ever played. A friend is recognised by a secret key their own device keeps, so coming back on the same device restores their pack, skills, ponies and position.
* The **world** save also keeps everything players own that is not in their pack: every player's ponies and pets (tied to that player's key, so a
  friend's ponies wait where they left them, nobody else can ride or lasso them, and they come back when that friend rejoins, even after the host
  restarts) and the items lying on the ground.
* Saved: every **15 minutes** (`CONFIG.net.autosaveMinutes`), whenever **someone leaves** (their character first), when the host's tab goes to the **background**, on **Save now**, and when the host presses **End session & save**.
* **Solo saves too**: it is a hosted world that stays offline (one per browser, remembered by `ponyscapes.soloWorld`), so the character and the world carry on next time, and you can open it to friends later from the Session panel.
* **Characters have an id** (`cid`, kept in every copy of the save) and **a friend keeps their own copy** (`net/clientSaves.js`, localStorage, newest 12 worlds): the host sends it on joining, on every save and when the friend is removed or the session ends.
* **The handshake** (`HostAdapter._onHello`): on joining, the friend lists the worlds and character ids it holds; the host compares the one for *this* world with its own record. Same character, or nothing on either side: carry on. Different, or one side lost its copy: nothing is guessed. The friend is asked, and **starting a new character clears their old home** and character on the host. The friend's copy is a backup and the identity check; it is never loaded into the host's world on the friend's say-so (a hand-edited copy would be a cheat).
* **Homes** (`shared/interiorSystem.js`, buildings with `home: true`): the starter home goes to the host and the three "Neighbour's Homes" to friends, in order, kept by player key and saved with the world. Only the owner can go in. When all four are taken, a newcomer waits until the host clears the home of someone who is away (Session panel > Homes).
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

## Weather

`public/js/shared/weather.js` (server rules) with the look in `client/render/weatherFx.js` and the sound in `client/audio/weatherAudio.js` (synthesised, no sound files).

* **Seasonal table.** Every few in-game hours (`CONFIG.sim.weather.minHours`..`maxHours`) the server picks a weather type by weight from the current season's row (`Weather.TABLE`): light rain in spring, thunderstorms in summer, heavy wind in autumn, snow or nothing in winter. Everyone is sent the result; it is saved with the world.
* **Layers.** A type is a mix of independent layers, each 0..1: **rain**, **wind** (plus a direction), **lightning** and **snow**. A thunderstorm is just rain + wind + lightning at once; the layers ease in and out.
* **Rain waters the fields.** While it rains every tilled plot that is not covered (`Weather.covered`: floored or built-on spots, buildings, anything added to `Weather.coverFns`; indoors there are no fields) fills up and is watered for the day. Heavier rain is faster (`waterPerSecond` x intensity).
* **Lightning.** Random strikes near players: a flash for everyone (dimmer through a window, none in a cave) and thunder that arrives after a delay by distance. A strike can hurt what is right under it and leave a short fire (`strikeDamage`, `fires`; set to 0 / false to switch off); heavy rain puts fires out.
* **Wind.** Sways the grass, trees and crops, slants the rain and pushes particles. **Effects:** rain streaks and splashes, snowflakes, blown leaves, a grey veil under clouds, and audio per layer.
* **Testing.** `?weather=thunderstorm` starts a solo/hosted game under that sky; the host can call up any weather (or hand it back to the season) in Menu > Dev settings > Weather. Volume: Menu > Controls > Mouse & touch > Weather sounds.

## Hedges

`public/js/shared/hedges.js`. Buy or craft a **Hedge Cutter** (General Store, or stone + string + plank). **Use** it beside a berry bush to cut it down: you get a **Hedge Bush** (and the berries, if it was ripe) and the wild bush is a low stub for a few minutes. Hold the Hedge Bush and press the interact key on open grass or dirt (next to your home, along a path) to plant it as a solid, **trimmed** hedge. **Use** the cutter on a planted hedge to trim it into the next shape (block, ball, tiers); a **shovel** digs it up again. Hedges are saved with the farm table (`h<tx>,<ty>` keys) and sent to every player.

## Look and feel

* **Retro medieval UI.** The panels, buttons, slots and HUD plaques share one theme at the end of `public/css/style.css` (oak, iron-and-gold stepped borders, parchment text).
* **Inventory.** The action buttons (Wear / To pony / Drop / Destroy) sit at the top; below them is ONE grid: your belt and bag, then your pony's pack slots (tinted green) in the same flow, so a stack moves between them with one tap or drag.
* **Stable and barn.** Big buildings the size of the village houses (the stable 3 x 2 tiles, the barn 5 x 4), painted by the same pixel-art ray-caster (`pixelBuildings.js`) with their own look in `FARM_LOOKS` (`structureSprites.js`). Placing one claims its whole footprint, anchored on the north-west tile (`StructureDefs.size`; the other tiles are `*_part`); the hammer takes the whole building down. The **Barn** is crafted at the table, shelters ponies like a stable, reaches a little farther and gives a bigger apple discount. Fences and gates are hard-edged pixel art on the houses' 1.5 px grid (inked rails with grain, capped posts, braced plank gates).
* **Riders** sit astride the pony with seated legs (`PixelCharacter.riderLegs`, one leg behind the other in every view); **sleepers** are the character themself in their own colours (`Renderer._drawSleeper`).
* **Swings.** Whoever holds a tool uses a coded arm (`toolPose.js`: two bones from the shoulder to a hand, drawn in chunky pixels in their own sleeve and skin colours; the baked arm on that side is a separate layer that is simply left out). Every tool kind has three key poses (carry, wind, hit) that the swing moves through, landing on its impact time. Tool pictures are sized per kind (`TOOL_SIZE` in `playerSprite.js`). Riders sit at a height tuned for each view (`SEAT_LIFT`).
* **Tools.** `python3 tools/make_retro_tools.py public/assets/items` paints every tool's icon and in-hand picture as outlined pixel art (registered in `js/content/customContent.js`).
* `node tools/render-compare.js --scene stable|sleeping|inventory|ride_left ...` shoots these scenes.

## The Stable

The village **Stable** (`data/buildings/pony_stable.js`, inside the starter paddock) is a building you walk into, like a home: every player gets a stable of their OWN (`instance: 'player'`, `stable: true`), but anybody may enter. Inside (`pony_stable` in `content/interiors.js`) are ten **stalls** (`stall` furniture). Stand beside a stall and press the interact key: with one of your ponies with you (the one you ride, else the nearest of yours) it is put in the stall; beside a stall that holds one of yours it is taken out. A stalled pony stays put, does not follow you through doors, cannot be ridden until it is taken out, stays in the stable until you come back for it, and is saved with the world (`shared/stableSystem.js`). The stable also counts as shelter for taming a wild pony. The craftable 3 x 2 shelter that used to be called the Stable is now the **Pony Shelter** (it only shelters ponies you are taming; the Barn does too).

## Coins and the coin bag

**The coin system** (`shared/coins.js`): ten kinds of coin. **Copper, silver, gold, platinum and titanium** are each worth ten of the one below; the **gem coins** (ruby, sapphire, emerald, amethyst, diamond) are each worth five of the one below (so a ruby is 5 titanium). Gold is still the unit every price in the game uses, and is worth 100 copper. The purse holds real coins (`Inventory.coins`: a count of each kind, copper first; `Inventory.purse` is their total in copper). Gaining coins merges any kind that reaches its ratio up into the next (10 silver become a gold); paying works out change; older saves count their coins as gold (77 gold open as 7 platinum and 7 gold).

**Farming** (`shared/farming.js`, `client/ui/gardenUI.js`, `client/ui/seedPouchUI.js`; `npm run test:farming`): a **hoe** used on open grass or dirt tills the whole tile into a **field of 3 x 3 plots** (`map.farm["f<tx>,<ty>"]`, nine plot records). Tap a tilled tile with a hoe, shovel, watering can or seeds in hand and the **garden window** opens: the nine plots, your **seed packs** in a scrolling list on the side, and your tools below. The **hoe** loosens soil that has packed down, the **shovel** digs a hole, the **can** waters a plot for the day (a can swung in the world waters the whole field; rain waters every uncovered field), and the **hand** covers a seed, fills a hole, clears a withered crop and picks a ripe one. Tap a seed pack to open its **pouch** (a physics sack like the coin bag; several can be open at once) and drag seeds out of it into dug holes; the pouch's count follows what your bag really holds. A crop grows a day for each day it is **covered and watered**, withers when its season ends, and a harvested plot packs down until it is hoed again. Every job is a `field` command the server checks (reach, the tool you carry, the seeds you hold, the season). Older saves' half-tile plots become plots of the field on their tile.

**The coin bag**: the **Coins** button (top right) floats a cutaway sack over the world, with no window (tap outside it to close). It holds all your coins as chunky medieval pixel-art coins (`client/render/coinArt.js`: an inked disc with a reeded edge and a heraldic mark: a cross, a fleur-de-lis, a crown, a shield, a tower; the gem coins carry a cut stone) on a small physics world (`client/ui/coinBagUI.js`). Press a coin and drag it: inside the bag it shoves the others about; let go over the game world to **drop** it there (`dropCoins` with the coin's kind and a world spot, within `CONFIG.sim.drops.throwRange` tiles of you; whoever steps close picks the pile up, which is how coins change hands). **Double-tap** a coin to break it into the kind below; **Merge coins** turns every full set back into the next kind. A tap flicks a coin. At most about 64 coins are drawn at once.

**Shops ask in coins.** A price is shown as the coins the shop wants, "x2" beside the coin's picture (25 gold is x2 platinum and x5 gold), the same coins as in your bag. Press **Buy** and the coin bag opens beside the shop window: **hold a coin and drag it over the counter** to put it down (click a coin on the counter to take it back). The coins on the counter count towards the price, a bigger coin is worth more and the shop gives change; when there is enough, the shop takes them and hands over the goods (`buy` with `pay`, an array of counts: `shared/shopSystem.js`). On a phone the shop window shrinks to a slim card (top left in landscape, across the top in portrait) and the bag takes the room that is left, the thumb controls step aside while the bag is open, and a coin dragged with a finger rides a little above the fingertip so it can be seen.

## Controls

* **Mouse / touch** (not rebindable): left click or tap uses what is in your hand where you point (water, plant, hoe, chop, swing or shoot a weapon; hold the mouse button to repeat). On a villager it talks (a window offers their shop, any quests and gifts; with nothing to offer they just say hello). On an animal it feeds it (food in hand), ropes it (lasso in hand), attacks it (weapon in hand) or pets it. **Right click** throws the lasso in the lasso slot at the animal under the pointer; phones keep the **Lasso** button. Swords sweep a 120 degree fan and hit every animal in it.
* **Holding a finger down** rings what is under it (a villager, an animal, or the spot); lifting the finger acts on it. Out of reach, nothing happens unless **Walk to it, then act** is on (Menu > Controls > Mouse & touch): then you walk there first and the action follows.
* **Taps and clicks never attack or rope**: on a phone the Use button becomes **Attack** while a weapon is in hand (it swings at the nearest animal in reach) and the **Lasso** button ropes; on PC use E / Space to attack and L or right click to rope. A tap on an animal feeds or pets it.
* **Joystick**: fixed by default (it stays put and only a touch on it steers, so taps never move it); turn **Fixed joystick** off for the old floating stick.
* **Tap to walk** (pathfinding) is **on** by default: a tap on bare ground far away walks there; close by it uses your tool. A tap on a villager, animal, door, stockpile, crop, shop counter... walks to it and does its action (**Walk to it, then act**, also on by default). Both are switches in Menu > Controls > Mouse & touch.
* **Keys**: Menu > Controls > Keys rebinds every keyboard action (two keys each, kept in the browser). Slots 1-9 and Esc are fixed.
* **The rope**: any friendly animal can be lasso'd (not monsters or guardians) and nothing is picked up any more; a roped animal follows you until you untie it (U). You can hold 3 at once, +1 per 3 levels of Animal Friendship or Horsemanship (the higher one), up to 10 (`Skills.leashCap`). Every rope put on an animal is counted per kind (`server.leashLog`, saved in the character's `book.leashed`) for future quests; `server.leashedNow(id)` lists what is roped right now.
* Under the hood a click sends an **aim point** with the input (`aim, ax, ay`, read server side through `AimPoints[playerId]`); the server checks reach for everything. Clicks on people and animals send `talkTo` / `animalAct` commands (`shared/tapActions.js`).

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
  their player key and saved with the world), `cave:<ring>` a ring's boss lair, `dungeon:<d>:<r>` room `<r>` of room dungeon `<d>` (below). Players, animals and items on the ground carry their `grid`; things are
  only ever near each other on the same grid, and each player is only sent what is on theirs. The client keeps the overworld (its buildings, trees and
  stockpiles stay up to date) plus the grid it stands on. A new kind of instance is a plan class (tiles, walls, props, entry / exit) and one line in
  `Grids.plan()`.
* **Data.** Buildings are `js/data/buildings/` (one file each: size, door, colours, sign, which room, shared or per player), where they stand is
  `js/shared/layers/buildingSites.js`, tile types are `js/data/interiors/tiles.js` and furniture is `js/data/furniture/` (bed, table, chair, bookshelf,
  dresser, rug, fireplace, potted plant, lamp, shop counter, goods shelf, crate, workbench, lumber rack, exam table, medicine cabinet, hay bale).
* **The rooms** live in `public/js/content/interiors.js`, written by **`/level-editor.html`**: paint tiles (paint, room, rectangle, fill, pick, erase),
  place and turn furniture, resize, undo, see the room as the game draws it, and get warnings (no doormat, a blocked arrival tile, overlapping furniture).
  **Play-test room** opens the game standing inside it (`index.html?solo=1&content=draft&enter=<building>`); **Download interiors.js** gives you the file.

## Room dungeons, cliffs and the cave generator

A **room dungeon** is a row of rooms you walk through. Each room is a **2D list of numbers, one per tile**, drawn as a **PNG of the same size**: a 100x150 picture is a
100x150 tile room.

| code | meaning |
|---|---|
| `0` | floor |
| `1` | wall (and everything outside the picture) |
| `2` | **entrance**: you arrive beside it; interact on it to go back a room (in the first room, back outside) |
| `3` | **exit / next room**: interact on it to go on (in the last room, back outside) |
| `4` | **enemy spawn node**: a random enemy from the dungeon's list |
| `5` | **chest**: one-time loot, from the dungeon's `loot` table |
| `6`-`999` | reserved for more (doors, traps, keys...); they are solid until given a meaning |
| `1000`+ | a **specific enemy**: `1000` + the creature's number, written down in `js/shared/enemyCodes.js` (`rabbit` 1000, `snake` 1028, ...) |

**PNG colours.** An **8-bit** greyscale PNG is a viewable palette: mid grey `128` floor, darker grey `64` wall (black `0` is rock too), `255` entrance, `224` exit,
`192` spawn node, `160` chest, and greys `1`-`31` are enemies `1000`-`1030`. A **16-bit** greyscale PNG is literal: the pixel value *is* the code (so any enemy works).
Off-palette greys snap to the nearest entry.

**Making a room.** Save the PNG as `public/assets/dungeons/rooms/<id>.png` (lower case, digits, `_`), then `npm run rooms` turns every PNG there into
`public/js/content/caveRooms.js` (do not edit that file by hand) and tells you what is wrong with a room (no entrance, an exit you cannot walk to, too big...).
`node tools/cave-rooms.js show <id>` prints a room as text. **`npm run rooms:samples`** makes the temporary rooms (random caves: entrance at one end, exit at the
far end, spawn nodes, chests in nooks) as PNGs, and builds them.

**Making a dungeon.** A dungeon is one file in `public/js/data/dungeons/` (see `cavern.js`): its `rooms` in order, its `ring`, the `enemies` a plain spawn node
picks from, and its chest `loot`. Its enemies appear the first time anyone enters a room. Dungeons are numbered in the order they are registered; the *n*th one
gets the *n*th cave mouth in the world.

**Cliffs, hills and the cave mouth.** `public/js/shared/layers/caveSites.js` holds a few **hand-drawn stamps** (text pictures: `1`-`3` are cliffs of that height that
cannot be walked through, `,` bare dirt, `S` bare stone, `E` the cave mouth). After the land is generated they are dropped at random places in the centre ring (a pure
function of the world seed, so every player sees the same ones): one bluff with a cave in its face for each dungeon, plus ridges, knolls and crags. A stamp only lands
on dry land, and nothing grows in a cave's yard. Draw your own by adding a row-of-strings entry (and a count in `CaveSites`).

`node tools/test-dungeon.js` checks all of this in Node (no browser): the numbers, PNG round trips, the stamps over several seeds, and a player walking every room.

## Animal homes, wild ponies and sleeping

* **Animal homes.** Wild animals (not ponies) live around a *home* in the land: about half of all chunks hold one. The animals stay within a few tiles of it, and when one is hunted, picked up or tamed the home takes a new one in after five minutes, out of sight of every player. A creature's `marker` (`burrow`, `den`, `nest`, `web`; see `js/data/creatures/`) draws its home in the world; a creature with no marker (deer, sheep...) simply has an invisible home. The homes come from the world seed like everything else (`terrainGenerator.animalGroup`, `animalSystem.js`).
* **Wild ponies** have no home. Every biome *region* (one stretch of one biome) holds at most `CONFIG.sim.wildPonies.perBiome` of them (a biome's own `ponyMax` overrides it), and they are not all there from the start. Each morning (06:00) the game rolls: every wild pony may move on (only once nobody is close enough to see it go) and every free place may be taken by a newcomer, who appears out of sight near a player (`js/shared/wildPonies.js`). A pony you caught or own stops counting and never leaves.
* **Sleeping** (`js/shared/sleepSystem.js`, tuned in `CONFIG.sim.sleep`). From 22:00 you can lie down in **your bed at home** (the one bed in your own room: the `bed` furniture is `unique`). Anyone still up at 02:00 is carried to their bed and falls asleep, and everybody wakes at 06:00 beside their bed. Time passes as usual while anyone is awake; when **everyone** playing is asleep the night is skipped (the clock jumps to 06:00, and crops grow, ponies arrive, etc. as the days pass). There are no penalties for staying up yet.

## Creatures that want things, and bosses you can appease

A creature whose data has `wants` shows a **thought bubble** with what it is after when you come near (`js/shared/wantSystem.js`). Hold that item
and press **F** ("Give ...") beside it: it is happier with you (hearts) and stops asking for a while. Dogs want a **bone** (dropped by deer, sheep,
goats, boar, elk and wolves) or raw meat; cats want fish.

**The Cave Bear can be fought or appeased.** Three of her **cubs** are lost somewhere in the first ring. They only come to you for **fish** (catch
some with the rod), and they won't be picked up until you have fed them one. To find them, study the **glowing paw prints** in her cave (F): from then on the lost cubs show on your map (saved per player). Carry a cub to her cave and hold it in your hand: she won't attack
you, and F gives it back (her bubble counts 0/3). With all three home she is at peace, the next ring opens just as if she had been beaten, and she
stays in the cave with her cubs from then on (saved with the world). Any other boss can get the same treatment from its data: `wants: { items, need,
appease: true, quest: { creature, count } }`, plus a young creature with `wants: { items, unlocks: 'pickup' }` and a carried item for it.

## Coins, quests and puzzles

**Coins live in a purse, not in a bag slot.** Gold coins (from chests, bosses, quest rewards, the beach) go straight into your **coin purse**, shown at the top of the
inventory; shops and recipes spend from it. Coins on the ground (dropped from the purse with **Drop 10**, or lying where a loot drop fell) jump into the purse of
anyone who steps next to them, so nobody has to pick them up. Older saves with coin stacks in slots are moved into the purse on load (`Inventory.openPurse`).

**Quests belong to the host's world, not to a player** (`js/shared/questSystem.js`; each quest is one file in `js/data/quests/`). A villager with a **!** over their head
has a quest to give; a **?** means one is waiting on you at that villager (hand things over, or report to them). Anyone can accept a quest, and what any player
hands in or solves counts toward the same quest. When a quest is finished, **everyone playing at that moment shares the reward** (coins, items, hearts with the giver,
xp). A quest the world finished before you joined is closed to you; the ones still open, and the ones that come later, are yours to join. The **Journal > Quests** tab
lists them. The log is saved with the world. Step types: `deliver` (hand items to the giver), `puzzle` (solve a puzzle node), `visit` (somebody walks to a place), `talk`.

**Puzzle nodes** (`js/data/puzzles/`: a humming rune stone, a sunken dial, a broken tablet) are things in the overworld that open a **puzzle screen** (`js/client/ui/puzzleUI.js`)
when a quest's current step asks for them; otherwise they only hum. A puzzle is played on your own screen and the host **replays your moves** to check the solve
(`js/shared/puzzles.js`), so a solve cannot be faked. Mechanics so far: **lights** (flip a lantern and its neighbours: put them all out), **sequence** (watch the runes
glow, then repeat the order) and **slide** (sliding tiles). A new mechanic is a new entry in `PuzzleKinds` and a way to draw it in `puzzleUI.js`; a new puzzle or quest is a new data file
(also add it to `index.html` and `editor.html`).

## The map

Drag the map (mouse or finger) to look around; **Centre on me** brings it back. An arrow on the edge always points the way to **town** (with the
distance), and others point to you when you have dragged away, to the nearest treasure, and to the nearest lost cub you have tracked.

## Dev settings page (testing)

Menu > **Dev settings** (the host only) asks for the code **pnkpi** (remembered until the tab closes; **Lock** locks it again). It is there to keep
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
