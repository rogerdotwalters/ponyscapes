'use strict';
/* SHARED - every tunable lives here. The `sim` block is used by client AND server. */
/* The character sprite keeps its pixel size; the WORLD grows. Every distance below is in tiles and was
 * authored for 64px tiles, so it is divided by TILE_SCALE to keep the same on-screen size and speed. */
const TILE_SCALE = 1.5;

const CONFIG = {
  /** The zoned world (js/data/zones/, layers/zoneLayer.js), in tiles: how far a zone's edge wobbles, how thick its cliff wall is, how wide a gateway is (each side of the middle), how much a child overlaps its parent (1 = just touching), and how wide the open sea round the map is (past it, an invisible barrier), and the side of the square cells a zone is cut into for wild ponies' limits. */
  world: { zoneWarp: 8, wallWidth: 3, gateHalfWidth: 3, zoneOverlap: 0.88, seaWidth: 14, ponyCell: 40 },
  sim: {
    tickRate: 30,
    mapW: 40, mapH: 40,
    playerRadius: 0.30 / TILE_SCALE,
    walkSpeed: 2.4 / TILE_SCALE, runSpeed: 4.8 / TILE_SCALE, sneakSpeed: 1.2 / TILE_SCALE,   // tiles / second
    accel: 16, decel: 32,                              // tiles / second^2: walk reached in 0.1s, a full-speed run stops in 0.1s
    turnRate: 11,                                      // rad / second
    wadeSpeedFactor: 0.65,                             // walking through shallow water
    ride: { walkSpeed: 2.7, runSpeed: 5.0, radius: 0.28, range: 1.7 },   // on a pony (tiles / second); range = how close you must be to mount
    testKit: true,                                     // this testing version: a small home, a crafting table, all the basic tools and a tamed pony
    ponyRideLevels: { pony_plain: 1, pony_earth: 1, pony_unicorn: 6, pony_pegasus: 9, pony_alicorn: 14 },   // Horsemanship level needed to ride
    maxInputsPerTick: 4,                               // server-side anti-speedhack budget
    maxPlayers: 4,
    slotColors: ['#e5534b', '#4f9bea', '#62c370', '#e9c24a'],
    inventory: { hotbarSlots: 5, starterBag: 'starter_backpack', ponyBagSlots: 2, starterPonyBag: 'starter_side_pack', packReach: 4 },   // the tool belt (keys 1-5) + your bag (data/items/bags.js); every pony has 2+ bag slots
    combat: { defPerPoint: 0.02, maxReduction: 0.5 },
    friendship: {                                            // the heart meter: 3 hearts per level, 24 levels (data/friendship/levels.js)
      heartsPerLevel: 3, heartCost: 12, heartCostPerLevel: 3,   // points for ONE heart at level 1, and how much more each later level asks
      skillPerLevel: 3,                                         // skill levels per friendship level: Friendship / Animal Friendship 1 allows level 1, 4 allows 2 ... 70 allows 24
      reach: 1.9, petReach: 1.7,                                // how close you must stand to talk / to pet
      gains: { pet: 6, groom: 10, feed: 4, feedLiked: 14, feedLoved: 30, talk: 5, gift: 6, giftLiked: 18, giftLoved: 36, giftDisliked: -8, together: 1 },
      cooldowns: { pet: 15, groom: 20, talk: 45, feed: 4, gift: 3 },       // seconds before the same act with the same one counts again
      togetherSeconds: 20, togetherRange: 6,                    // a pet near you slowly grows fonder
      xpPerPoint: 1.5, minXp: 2                                 // skill XP for a friendly act (it trains the skill even when you are at the cap)
    },          // a cape's DEF: each point soaks 2% of damage, never more than half
    health: { max: 100, regenPerSecond: 0.35, respawnFraction: 0.5 },
    /** Difficulty: easy / medium / hard. `downed` is what happens when health hits 0 inside a dungeon (and its lair): you drop to your knees, the view darkens, and
     *  you get back up after `seconds` with `reviveFraction` of your health; snacks shorten the wait (`snackSeconds` per point of the food's hunger) and add health
     *  (`snackHp` per point) for when you rise; a teammate pressing Interact within `reach` lifts you at once, in any mode; `graceSeconds` after getting up nothing can
     *  hurt you. Only easy is written so far, so every mode uses it (medium / hard point at the same rules until they get their own). Outside dungeons you still wake in the village. */
    difficulty: {
      default: 'easy',
      modes: {
        easy:   { label: 'Easy',   downed: { seconds: 7, reviveFraction: 0.5, snackSeconds: 0.15, snackHp: 0.6, reach: 1.6, graceSeconds: 2 } },
        medium: { label: 'Medium', like: 'easy' },
        hard:   { label: 'Hard',   like: 'easy' }
      }
    },
    /** Bulk resources (see stockpiles.js): stacks of EACH you may carry = base + Constitution level + perPony for every pony with you
     *  (ridden or leashed, up to maxPonyBonus) + Pack Pony buffs. Everything else is delivered to stockpiles. */
    carry: { limited: ['wood', 'stone', 'clay'], base: 0, perPony: 1, maxPonyBonus: 3, noticeSeconds: 4 },
    vitals: false,                                     // hunger and thirst: switched off (no drain, no bars, food is for ponies)
    construction: false,                               // building walls, floors, doors, windows and fences: switched off (stations such as stockpiles still go down)
    /** How fast a pony runs: its kind's baseSpeed (tiles / second at level 1) x this curve at its level. [level, multiplier] points, straight lines between.
     *  Wild ponies flee at wildFleeFactor of that, so you must raise your own pony until it outruns the kind you want to catch.
     *  Editable in editor.html > Settings (stored in customContent.js as settings.ponySpeedCurve). */
    ponySpeed: { curve: [[1, 1], [5, 1.1], [10, 1.22], [15, 1.34], [20, 1.46], [30, 1.62], [50, 1.85], [99, 2.2]], walkFraction: 0.55, wildFleeFactor: 0.92, defaultBase: 4 },
    /** Your own ponies level up from XP: distance ridden, things done from the saddle, food fed to them and grooming. XP for level L = xpBase x (L-1)^xpExponent. */
    ponyLeveling: { xpBase: 40, xpExponent: 1.55, travelXpPerTile: 0.8, taskXp: 6, feedXp: 10, feedLikedXp: 20, groomXp: 18 },
    /** Wild ponies (wildPonies.js): at most `perBiome` per region (a cell of `world.ponyCell` tiles square, within one zone), rolled every morning. `startFill` = the share of places already taken when a region is first seen,
     *  `arriveChance` / `leaveChance` = each morning's chance for a free place to be taken / for a pony to move on. They appear `spawnMin`..`spawnMax` tiles from a player, and leave
     *  only once nobody is within `hideDistance`. */
    wildPonies: { perBiome: 3, startFill: 0.4, arriveChance: 0.6, leaveChance: 0.3, morningHour: 6, spawnMin: 18, spawnMax: 40, hideDistance: 24, samples: 3 },
    /** Pony care (shared/ponyCare.js), switched on by the host (Dev settings > Pony care; off by default so it can be tested and tuned). Every owned pony gets hungry and thirsty; a stalled pony eats and
     *  drinks from the bowls of ITS OWN stall (one pony per stall; a breeding guest makes two). Fed and watered ponies get happier; a pony unhappy for too long loses friendship, and one that keeps losing it
     *  while still unhappy runs away. Everything is per second of game time. Costs are in PONY COINS (any variety) taken from the stable desk's bank.
     *  Levels are arrays: index = level. Bowl `size` = units the bowl holds (1 unit fills 1 point of hunger / thirst). Upgrade `cost[n]` = the price of going from level n-1 to n. */
    /** How many ponies one person may keep (stableSystem.js): `base`, plus `perLevel` for every stable upgrade (paid in pony coins at the stable desk; cost[n] = the price of level n). The pony vendor
     *  (ponyTrade.js) buys and sells ponies for GOLD coins: a pony's price = kind price + level x perLevel + rarity price; the vendor pays `sellFraction` of it and keeps `stock` ponies on offer, new ones each day. */
    ponyCap: { base: 100, perLevel: 25, cost: [0, 10, 20, 35, 55, 80] },
    ponyTrade: { price: { pony_plain: 4, pony_earth: 5, pony_unicorn: 12, pony_pegasus: 18, pony_alicorn: 60 }, perLevel: 1, rarity: [0, 4, 12, 30, 80], sellFraction: 0.5, stock: 4, maxStockLevel: 8, buyKinds: ['pony_plain', 'pony_earth', 'pony_unicorn', 'pony_pegasus'] },
    ponyCare: {
      hunger: { max: 100, drain: 0.04 }, thirst: { max: 100, drain: 0.06 },          // hunger empties in ~42 min, thirst in ~28 min
      outside: { drainFactor: 1, drinkRange: 2.2, drinkPerSecond: 10 },                // a pony out of its stall still drains; beside water it drinks by itself
      eatBelow: 70, eatPerSecond: 3,                                                    // a stalled pony tops itself up from its bowl once below this, this many points a second
      appleFood: 30, jugWater: 40,                                                      // hand-feeding: an apple restores this much hunger / fills this many units of a bowl; a jug of water fills a bowl by this much (a watering can: no limit)
      appleBowl: 20,
      happiness: { start: 70, low: 30, riseFed: 0.08, fall: 0.12, fallEmpty: 0.3, fedAbove: 50, hungryBelow: 25, comfort: [0, 0.25, 0.5, 0.8] },   // comfort level multiplies the rise
      neglect: { seconds: 120, every: 60, friendLoss: 6, runAfter: 3, recoverAbove: 45 },   // unhappy this long (s): friendship drops every `every` s; after `runAfter` drops while still unhappy it runs away
      foodBowl:  { size: [40, 80, 160, 320], cost: [0, 3, 8, 20] },
      waterBowl: { size: [60, 120, 240, 480], cost: [0, 3, 8, 20] },
      comfort:   { cost: [0, 4, 10, 24] },                                              // level 0-3: bedding, raises how fast a fed pony gets happier
      auto: { cost: 12, refillPerSecond: 3 },                                          // automate one stall's food / water (needs a tank with room)
      tank: { supply: [0, 2, 4, 6], maxCount: 4, buy: [0, 10, 18, 30], upsize: [0, 16, 28] }   // a tank feeds `supply[size]` stalls; you may own up to maxCount of them; buy = a tank of that size, upsize[n] = size n -> n+1 (all tanks)
    },
    drops: { max: 400, pickupRange: 1.3, gatherRange: 2.6, coinRange: 1.1, throwRange: 4 },             // items dropped on the ground (kept in the world save)
    // Animal levels rise with distance from the ORIGIN (the starting village): one level per `tilesPerLevel` tiles, on top of each species' own base level
    levels: { origin: { x: 20.5, y: 26.5 }, tilesPerLevel: 60, max: 99 },     // zones are wide: one level per 60 tiles
    light: { torchRadius: 6, campfireRadius: 8, torchSeconds: 120, darkBelow: 0.35 },   // tiles; a torch burns out after torchSeconds of use; "dark" = daylight below darkBelow
    emoteSeconds: 3, tradeRange: 4,
    hunger: { max: 100, decayPerSecond: 0.15, lowThreshold: 30, starvingSpeedFactor: 0.7, eatSeconds: 0.6 },   // full -> empty in ~11 minutes
    thirst: { max: 100, decayPerSecond: 0.22, lowThreshold: 30, slowFactor: 0.8 },                           // full -> empty in ~7.5 minutes
    /** Host-selectable per player. `drain` scales the decay; `penalty` = does an empty bar slow you down?
     *  off = bar hidden and never drains; cosmetic ("superficial") = drains and shows, but never hurts. */
    vitalModes: {
      off:      { drain: 0,   penalty: false, label: 'Off' },
      cosmetic: { drain: 1,   penalty: false, label: 'Superficial' },
      relaxed:  { drain: 0.5, penalty: true,  label: 'Relaxed' },
      normal:   { drain: 1,   penalty: true,  label: 'Normal' },
      hard:     { drain: 2,   penalty: true,  label: 'Hard' }
    },
    /** Energy (vitalsSystem.js): every character has an energy bar. It drains while awake (always on, whatever the hunger / thirst switch says); sleeping fills it, and eating
     *  fills it a little (food restores `eatPerHunger` x its hunger value, but eating alone never lifts you past `eatMax`). Below `tiredBelow` you may sleep; at 0 you are exhausted and slow. */
    energy: { max: 100, decayPerSecond: 0.05, tiredBelow: 70, lowThreshold: 25, exhaustedSpeedFactor: 0.8, eatMax: 60, eatPerHunger: 1.2 },   // full -> empty in ~33 minutes (about three and a half days)
    /** Sleep (sleepSystem.js): there is no forced bedtime. Whenever your energy is below energy.tiredBelow you may lie down in your bed at home (`bedReach` tiles from it) or CAMP in the
     *  woods (at least `campTrees` trees within `campRadius` tiles, nothing hostile within `campHostileRange`). Sleeping gives back `bedRest` energy a second in a bed, `campRest` camping
     *  (`campFireRest` beside a campfire); you wake when you are rested, or press the button to get up. When EVERYONE playing is asleep (fallAsleepSeconds after lying down) between
     *  nightHour and wakeHour the rest of the night is skipped; while anyone is awake time passes as usual. */
    sleep: { nightHour: 22, wakeHour: 6, bedReach: 1.6, fallAsleepSeconds: 2, bedRest: 2.5, campRest: 1.5, campFireRest: 2, campTrees: 3, campRadius: 4, campHostileRange: 12 },
    /** Night events (nightEvents.js): each night, every player outdoors may be visited by a MOON PONY, super rare: it keeps to the dark, spawns `spawnMin`..`spawnMax` tiles away
     *  and fades with the dawn unless somebody has caught it. Fireflies drift over the grass at night (client only: client/render/fireflies.js). */
    night: { moonPonyChance: 0.04, spawnMin: 16, spawnMax: 34, fireflies: 46 },
    /** Sky ponies (skyEvents.js, data/ponies/skyPonies.js): water, lightning, sun and star ponies come out in the right sky, `spawnMin`..`spawnMax` tiles from a player, at most `maxAtOnce` of a kind;
     *  every entry has its own chance per player per episode, and `chanceScale` multiplies them all (raise it to see them more often). */
    sky: { spawnMin: 16, spawnMax: 34, maxAtOnce: 2, chanceScale: 1 },
    /** Weather (weather.js): a spell lasts minHours..maxHours of in-game time; the layers ease at rampPerSecond. Rain fills a field plot by `waterPerSecond` x its intensity each
     *  second (watered at 1). Lightning strikes every strikeSeconds (longest at the weakest storm, shortest at the strongest), `strikeMin..strikeMax` tiles from a player (nearChance:
     *  right next to one). A strike hurts what is within strikeRadius (strikeDamage 0 = never); `fires` leave a short fire that hurts (fireDamage) and heavy rain puts out. */
    weather: { minHours: 3, maxHours: 12, rampPerSecond: 0.12, waterPerSecond: 1 / 12, strikeSecondsMax: 18, strikeSecondsMin: 4, strikeMin: 6, strikeMax: 30, nearChance: 0.06,
      strikeDamage: 12, strikeRadius: 1.6, fires: true, fireSeconds: 9, fireDamage: 3 },
    time: { dayLengthSeconds: 576, startHour: 9 }                                                            // one day = 9.6 real minutes (the original 8, made 20% longer)
  },
  view: {
    tileW: 64 * TILE_SCALE, tileH: 32 * TILE_SCALE,
    maxDpr: 2,
    maxDprTouch: 1.5,                                  // phones: fewer pixels to fill (a 2x screen draws 1.5x), the biggest single saving
    maxLightsTouch: 6,                                 // night lighting on phones: only the nearest few lights get a cut-out
    zoomRef: { w: 900, h: 480 }, zoomMin: 0.7, zoomMax: 1.6,
    camSmooth: 7,
    wallH: 68, towerH: 120, houseH: 66, woodWallH: 62
  },
  net: {
    snapshotEvery: 2,
    autosaveMinutes: 15,                               // the host's game (world + every player's character) is saved to their database this often
    hostPingMs: 3000,                                  // how often the host measures each friend's latency
    interpDelayTicks: 4,
    snapDistance: 1.3,
    fakeLatencyMs: 0,
    fakeJitterMs: 0
  },
  input: { joyRadius: 60, deadzone: 0.15 }
};

const TICK_DT = 1 / CONFIG.sim.tickRate;
const TICK_MS = 1000 * TICK_DT;
const MAX_CATCHUP_TICKS = 6, MAX_TICKS_PER_PUMP = 3, PUMP_BUDGET_MS = 12;       // a local/host server never owes more than 6 ticks, runs at most 3 per pump and yields after ~12 ms (so one slow tick cannot snowball)
const secondsToTicks = seconds => Math.round(seconds * CONFIG.sim.tickRate);
