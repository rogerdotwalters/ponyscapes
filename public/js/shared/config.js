'use strict';
/* SHARED - every tunable lives here. The `sim` block is used by client AND server. */
/* The character sprite keeps its pixel size; the WORLD grows. Every distance below is in tiles and was
 * authored for 64px tiles, so it is divided by TILE_SCALE to keep the same on-screen size and speed. */
const TILE_SCALE = 1.5;

const CONFIG = {
  /** The layered world: ring width (tiles), how far a ring edge may wander, the biome region size, and whether the OPTIONAL level-zone layer exists. */
  world: { ringWidth: 400, ringWobble: 70, biomeCell: 240, villageBiomeRadius: 90, zones: true },
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
    /** Wild ponies (wildPonies.js): at most `perBiome` per biome region, rolled every morning. `startFill` = the share of places already taken when a region is first seen,
     *  `arriveChance` / `leaveChance` = each morning's chance for a free place to be taken / for a pony to move on. They appear `spawnMin`..`spawnMax` tiles from a player, and leave
     *  only once nobody is within `hideDistance`. */
    wildPonies: { perBiome: 10, startFill: 0.4, arriveChance: 0.6, leaveChance: 0.3, morningHour: 6, spawnMin: 18, spawnMax: 40, hideDistance: 24, samples: 3 },
    drops: { max: 400, pickupRange: 1.3, gatherRange: 2.6, coinRange: 1.1 },             // items dropped on the ground (kept in the world save)
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
    /** Sleep (sleepSystem.js): you may go to bed (your bed at home) from tiredHour until wakeHour; anyone still up at forceHour falls asleep, and everybody wakes at wakeHour.
     *  When EVERYONE playing is asleep (fallAsleepSeconds after lying down) the night is skipped; while anyone is awake time passes as usual. */
    sleep: { tiredHour: 22, forceHour: 2, wakeHour: 6, bedReach: 1.6, fallAsleepSeconds: 2 },
    /** Weather (weather.js): a spell lasts minHours..maxHours of in-game time; the layers ease at rampPerSecond. Rain fills a field plot by `waterPerSecond` x its intensity each
     *  second (watered at 1). Lightning strikes every strikeSeconds (longest at the weakest storm, shortest at the strongest), `strikeMin..strikeMax` tiles from a player (nearChance:
     *  right next to one). A strike hurts what is within strikeRadius (strikeDamage 0 = never); `fires` leave a short fire that hurts (fireDamage) and heavy rain puts out. */
    weather: { minHours: 3, maxHours: 12, rampPerSecond: 0.12, waterPerSecond: 1 / 12, strikeSecondsMax: 18, strikeSecondsMin: 4, strikeMin: 6, strikeMax: 30, nearChance: 0.06,
      strikeDamage: 12, strikeRadius: 1.6, fires: true, fireSeconds: 9, fireDamage: 3 },
    time: { dayLengthSeconds: 480, startHour: 9 }                                                            // one day = 8 real minutes
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
const secondsToTicks = seconds => Math.round(seconds * CONFIG.sim.tickRate);
