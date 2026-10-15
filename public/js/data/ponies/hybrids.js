'use strict';
/* DATA - HYBRID ponies: breed two ponies of the right varieties and a foal may be a whole new variety (and kind of pony). Ember x Star can make a Plasma pony, Water x Lightning a Tempest.
 * One line per hybrid (`H(...)` below) registers three things: the hybrid itself (the recipe: `parents` are two variety ids, hybrids included, in any order, and the `chance` per foal), its VARIETY
 * (coats, manes, marks, names, a signature accessory and glow: they are added at the END of the variety table, so saved ponies keep their numbers), its pony KIND (like the moon and sky ponies, a hybrid is
 * its own kind, never wild: you can only breed one) and its skill tree (a power of its own, then the cutie mark's). `chaos` has no recipe: any two different hybrids with no recipe of their own may make one.
 *   shape of a power:  [name, description, cooldown, glyph, color, effect...]   an effect: [kind, value, radius, shape, target, duration]   (the kinds, shapes and targets of rarity.js) */
(() => {
const MARKS = ['star', 'heart', 'flower', 'moon', 'cloud', 'apple', 'drop', 'note'];                    // (the cutie marks that give a power: ponySkills.js)
const effect = ([kind, value = 0, radius = 0, shape = 'circle', target = 'hostile', duration = 0]) => ({ kind, value, radius, shape, target, duration });
/** H(id, name, [parentA, parentB], chance, rarity, flags, accessory, glow, coats, manes, names, power) */
function H(id, name, parents, chance, rarity, flags, accessory, glow, coats, manes, names, power, extra = {}) {
  const [pn, pd, cd, glyph, color, ...fx] = power, marks = extra.marks || MARKS.slice(0, 3);
  PonyVariantTable.register({ id, name, biome: null, accessory, glow, coats, manes, marks, names: names.split(' '), hybrid: true });
  const wings = flags.includes('w'), horn = flags.includes('h'), speed = { common: 4.6, uncommon: 4.9, rare: 5.3, epic: 5.8, legendary: 6.2 }[rarity];
  PonyKinds.register({ id: 'pony_' + id, name: name + ' Pony', rarity, baseSpeed: speed, lassoTier: 4, ring: 0, weight: 0, group: [1, 1], levelBase: { rare: 14, epic: 18, legendary: 24 }[rarity] || 14, tameApples: 6, tameTier: 4,
    mystical: true, ...(wings ? { wings: true, abilities: ['fly'] } : {}), ...(horn ? { horn: true } : {}), fleeSpeed: speed - 0.8, followSpeed: 4.0 });
  HybridTable.register({ id, kind: 'pony_' + id, variant: id, name, parents, chance, rarity, power: { id: 'hybrid_' + id, name: pn, description: pd, cooldown: cd, glyph, color, effects: fx.map(effect) } });
  PonySkillTrees.register({ id, skills: [{ id: 'hybrid_' + id, label: pn, level: 3, ability: 'hybrid_' + id }, { id: 'cutie_mark', label: 'Cutie mark power', level: 6, byMark: true }] });
}
const dmg = (v, r, shape = 'circle', t = 'hostile') => ['damage', v, r, shape, t], heal = (v, r) => ['heal', v, r, 'circle', 'allies'], slow = (v, r, d = 3) => ['slow', v, r, 'circle', 'wild', d], scare = (r, shape = 'circle') => ['scare', 0, r, shape, 'wild'];

/* ---- two varieties make a hybrid ---- */
H('plasma', 'Plasma', ['ember', 'star'], 0.35, 'legendary', 'wh', 'flames', '#ff6adf', ['#3a1a4d', '#4a1d5c', '#2a1540', '#5a2060'], [['#ff3df0', '#ff9100', '#fff176'], ['#00e5ff', '#ff40ff', '#ffffff']],
  'Ion Flux Quasar Corona Photon Fusion Helio Spark', ['Plasma Burst', 'A ball of burning starlight scorches hostile creatures all round you', 11, '💥', '#ff5ce1', dmg(15, 4.8), scare(4.8)]);
H('steam', 'Steam', ['ember', 'water'], 0.4, 'rare', '', 'bubbles', '#eef4fa', ['#e6edf2', '#d4dde6', '#f2f6f9', '#c3ccd6'], [['#cfd8dc', '#ffffff', '#ff8a65'], ['#90a4ae', '#eceff1']],
  'Vapor Kettle Whistle Mist Geyser Billow Puff Sizzle', ['Scalding Cloud', 'A cloud of hot steam hurts hostile creatures and slows the wild ones', 10, '♨', '#e8eef2', dmg(8, 3.8), slow(55, 3.8)]);
H('tempest', 'Tempest', ['water', 'lightning'], 0.4, 'epic', 'w', 'sparks', '#7fb8ff', ['#2c3e66', '#364b7a', '#22305a', '#40548a'], [['#1e88e5', '#ffea00', '#ffffff'], ['#00e5ff', '#7c4dff', '#ffd600']],
  'Gale Squall Monsoon Cyclone Surge Thunderhead Typhoon Torrent', ['Storm Surge', 'A wave of rain and lightning hurts hostile creatures ahead and heals friends', 11, '🌩', '#7fb8ff', dmg(12, 5, 'cone'), heal(18, 4)]);
H('eclipse', 'Eclipse', ['sun', 'moon'], 0.3, 'legendary', 'h', 'rays', '#ffb347', ['#26204a', '#3a2c5c', '#1a1638', '#4a3a6a'], [['#ffd54f', '#ff8f00', '#cfd8ff'], ['#ffffff', '#ffca28']],
  'Totality Umbra Corona Penumbra Syzygy Obscura Diamond Halo', ['Eclipse', 'Day and night collide: a flash of dark fire hurts hostile creatures and the wild ones flee', 13, '🌑', '#ffb347', dmg(16, 5), scare(5)]);
H('aurora', 'Aurora', ['frost', 'star'], 0.35, 'epic', 'w', 'frost', '#7dffc8', ['#d8fff0', '#c2f5e6', '#e8fff8', '#b5e8f5'], [['#00e676', '#18ffff', '#b388ff'], ['#69f0ae', '#40c4ff', '#f48fb1']],
  'Borealis Shimmer Ribbon Glow Veil Lumen Polar Gleam', ['Northern Lights', 'Curtains of light heal you and friends beside you and calm the wild animals', 14, '🌌', '#7dffc8', heal(24, 4.6), slow(60, 4.2, 4)]);
H('blizzard', 'Blizzard', ['frost', 'lightning'], 0.35, 'epic', 'w', 'frost', '#cfefff', ['#e0ecf8', '#cddced', '#eef5fc', '#b8c8dc'], [['#90caf9', '#ffea00', '#ffffff'], ['#b3e5fc', '#ffd600']],
  'Whiteout Squall Hail Gust Drift Flurry Icebolt Snap', ['Whiteout', 'A freezing storm slows and hurts everything hostile round you', 11, '❄', '#cfefff', dmg(10, 4.4), slow(70, 4.4, 4)]);
H('bog', 'Bog', ['moss', 'water'], 0.45, 'rare', '', 'bubbles', null, ['#7a9a6a', '#6b8a5c', '#8aa878', '#5f7a52'], [['#33691e', '#827717', '#4db6ac'], ['#558b2f', '#a5d6a7']],
  'Marsh Newt Cattail Peat Fen Lilypad Mire Frog', ['Mire Grasp', 'Sucking mud slows the wild animals round you and heals you a little', 12, '🪷', '#7a9a6a', slow(75, 4), ['heal', 14, 0, 'self', 'self']]);
H('sunbloom', 'Sunbloom', ['sun', 'orchard'], 0.4, 'rare', '', 'leaves', '#ffd54f', ['#ffe9a8', '#fbd38a', '#fff3c7', '#f7c6a0'], [['#ff9800', '#ffeb3b', '#ef5350'], ['#fdd835', '#8bc34a']],
  'Marigold Sunny Cider Honey Zinnia Daffodil Buttercup Gold', ['Golden Harvest', 'Warm light heals you and friends and shakes a couple of apples loose', 16, '🌻', '#ffd54f', heal(26, 4.4), ['gift', 2, 0, 'self', 'self']]);
H('geode', 'Geode', ['crystal', 'ember'], 0.4, 'epic', 'h', 'crystals', '#ff9a3c', ['#5a3a4a', '#6d4658', '#483040', '#7a5060'], [['#ff6f00', '#e040fb', '#00e5ff'], ['#ffab40', '#7c4dff']],
  'Druse Amethyst Magma Agate Cinder Onyx Garnet Ore', ['Shard Burst', 'Molten crystal shards fly out and cut hostile creatures', 10, '💎', '#ff9a3c', dmg(14, 4)]);
H('nebula', 'Nebula', ['starlit', 'star'], 0.35, 'legendary', 'wh', 'stars', '#d19cff', ['#201a4a', '#2c2060', '#181238', '#38246a'], [['#e040fb', '#448aff', '#ffffff'], ['#ff80ab', '#7c4dff', '#18ffff']],
  'Cosmos Stardust Galaxy Pulsar Orbit Void Quasar Comet', ['Star Cloud', 'A cloud of stardust hurts hostile creatures and heals your friends', 13, '✨', '#d19cff', dmg(12, 4.6), heal(20, 4.6)]);
H('dream', 'Dream', ['moon', 'candy'], 0.4, 'epic', 'h', 'sprinkles', '#cfe0ff', ['#e8dcff', '#d8e8ff', '#f4e0f4', '#cfd8ff'], [['#b39ddb', '#f48fb1', '#80deea'], ['#ce93d8', '#ffffff']],
  'Lullaby Slumber Nightcap Drowsy Pillow Reverie Snooze Wisp', ['Sweet Dreams', 'A lullaby sends the wild animals round you drowsy and heals you', 15, '💤', '#cfe0ff', slow(85, 4.8, 5), ['heal', 18, 0, 'self', 'self']]);
H('prism', 'Prism', ['crystal', 'rainbow'], 0.3, 'legendary', 'wh', 'rainbow', '#ffffff', ['#ffffff', '#f4f8ff', '#fff4fa', '#f0fff8'], [['#ff1744', '#ffea00', '#00e676', '#2979ff'], ['#e040fb', '#18ffff', '#ffd600', '#ff6d00']],
  'Spectra Refract Chroma Kaleido Gleam Dispersa Lustre Rayne', ['Spectrum Beam', 'A split beam of every colour burns hostile creatures ahead', 11, '🌈', '#ffffff', dmg(17, 5.6, 'cone')]);
H('wildfire', 'Wildfire', ['ember', 'jungle'], 0.4, 'rare', '', 'flames', '#ff7a2c', ['#5a4a2a', '#6a5a30', '#4a3c20', '#7a6a38'], [['#ff3d00', '#76ff03', '#ffd740'], ['#ff6e40', '#00c853']],
  'Smolder Bramble Scorch Tinder Kindle Canopy Ember Char', ['Brush Fire', 'A sweep of fire scorches hostile creatures and chases the wild ones off', 9, '🔥', '#ff7a2c', dmg(11, 4, 'cone'), scare(4, 'cone')]);
H('diamond', 'Diamond', ['frost', 'crystal'], 0.4, 'epic', 'h', 'crystals', '#e0fbff', ['#f4fcff', '#e6f6fc', '#fafeff', '#d8eef8'], [['#80deea', '#ffffff', '#b3e5fc'], ['#e1f5fe', '#4dd0e1']],
  'Brilliant Carat Facet Glacier Sparkle Cullinan Solitaire Rime', ['Glass Armor', 'A shell of crystal heals you and everyone beside you', 16, '💠', '#e0fbff', heal(32, 4.2)]);
H('solar', 'Solar Flare', ['sun', 'lightning'], 0.35, 'epic', 'w', 'rays', '#fff06a', ['#fff0b0', '#ffe48a', '#fff8d0', '#ffd870'], [['#ffea00', '#ff6d00', '#ffffff'], ['#fff176', '#ff9100']],
  'Flare Corona Photon Beam Dazzle Nova Sparkfly Blaze', ['Solar Flare', 'A flash of sun and lightning hurts hostile creatures and lights the dark', 10, '☀', '#fff06a', dmg(14, 4.6), ['light', 0, 8, 'self', 'self']]);
H('sleet', 'Sleet', ['water', 'frost'], 0.5, 'rare', '', 'frost', '#a8d8ff', ['#cfe6f5', '#bcd8ec', '#dcecf8', '#a8c8e0'], [['#4fc3f7', '#e1f5fe'], ['#81d4fa', '#b3e5fc', '#ffffff']],
  'Drizzle Icicle Slush Rime Hailey Thaw Chill Drip', ['Freezing Rain', 'A freezing downpour slows the wild animals round you', 12, '🌧', '#a8d8ff', slow(70, 4.4, 4), dmg(5, 4.4)]);
H('confetti', 'Confetti', ['candy', 'rainbow'], 0.4, 'epic', '', 'sprinkles', '#ffffff', ['#ffd1e8', '#d1f5e0', '#fff0b3', '#d1e8ff'], [['#ff4081', '#ffea00', '#00e5ff', '#76ff03'], ['#e040fb', '#ff9100', '#18ffff']],
  'Party Streamer Sprinkle Jubilee Fiesta Pinata Glitter Tada', ['Confetti Burst', 'A bang of sweets and streamers startles the wild animals and cheers your friends', 12, '🎉', '#ff80ab', scare(5), heal(16, 4.5)]);
H('verdant', 'Verdant', ['jungle', 'orchard'], 0.5, 'rare', '', 'leaves', null, ['#9ccc65', '#8bc34a', '#aed581', '#7cb342'], [['#1b5e20', '#76ff03', '#ff5252'], ['#2e7d32', '#ffeb3b']],
  'Canopy Bloom Sprout Fruit Vine Pippin Orchid Frond', ['Overgrowth', 'Vines rise up: they slow the wild animals and cut hostile creatures nearby', 11, '🌿', '#76ff03', slow(70, 4), dmg(7, 4)]);
H('cosmic', 'Cosmic', ['moon', 'star'], 0.3, 'legendary', 'wh', 'stars', '#9fb0ff', ['#141a4a', '#1c2260', '#0e1236', '#262c70'], [['#ffffff', '#9fa8da', '#ffe082'], ['#b388ff', '#82b1ff', '#ffffff']],
  'Infinity Zodiac Eon Astral Lunar Meteor Cosmo Equinox', ['Meteor Shower', 'Meteors rain on hostile creatures round you and the wild ones scatter', 14, '☄', '#9fb0ff', dmg(18, 5), scare(5)]);
H('twilight', 'Twilight', ['moon', 'starlit'], 0.4, 'epic', 'h', 'stars', '#b9a6ff', ['#3a3470', '#4a4088', '#2c2858', '#564a98'], [['#7e57c2', '#ffab91', '#ffe082'], ['#5c6bc0', '#f48fb1']],
  'Dusk Gloaming Vesper Eventide Umbra Sundown Nightfall Afterglow', ['Dusk Veil', 'A veil of dusk heals you and friends and slows the wild animals', 14, '🌆', '#b9a6ff', heal(20, 4.4), slow(55, 4.4)]);
H('tropic', 'Tropic', ['jungle', 'sun'], 0.45, 'rare', '', 'leaves', '#ffca28', ['#ffd77a', '#a5d66a', '#ffe9a8', '#8fd19a'], [['#00c853', '#ffea00', '#ff6d00'], ['#ff5722', '#ffd600', '#00e676']],
  'Papaya Mango Coconut Lagoon Pineapple Toucan Guava Palm', ['Heatwave', 'A wave of damp heat hurts hostile creatures and speeds you up', 12, '🌴', '#ffca28', dmg(9, 4), ['speed', 50, 0, 'self', 'self', 3]]);
H('frostfire', 'Frostfire', ['ember', 'frost'], 0.3, 'epic', '', 'flames', '#8fe0ff', ['#4a4a6a', '#5a5a80', '#3a3a58', '#6a6a90'], [['#00e5ff', '#ff6d00', '#ffffff'], ['#40c4ff', '#ff3d00']],
  'Paradox Cinder Rime Frostburn Hoarfire Blueflame Icecoal Smoulder', ['Cold Flame', 'Blue fire burns hostile creatures and slows them to a crawl', 10, '🔵', '#8fe0ff', dmg(12, 4.2), slow(80, 4.2, 3)]);
H('sugarbolt', 'Sugarbolt', ['candy', 'lightning'], 0.4, 'epic', 'w', 'sparks', '#ffd1ff', ['#ffd1e8', '#fff0b3', '#e6d1ff', '#d1f5e0'], [['#ff4081', '#ffea00', '#ffffff'], ['#ba68c8', '#ffd600']],
  'Zapple Fizz Pop Rocket Jolt Candybolt Tingle Crackle', ['Sugar Rush', 'A jolt of sugar makes you far faster for a moment and scares the wild ones', 14, '🍭', '#ffd1ff', ['speed', 80, 0, 'self', 'self', 3], scare(4)]);
H('glimmer', 'Glimmer', ['crystal', 'starlit'], 0.4, 'epic', 'h', 'crystals', '#b9a6ff', ['#d6d0ff', '#c8c0f8', '#e4dfff', '#b4b0ee'], [['#7c4dff', '#18ffff', '#ffffff'], ['#b388ff', '#e1bee7']],
  'Twinkle Sheen Shimmer Spangle Lustre Glint Sequin Gloss', ['Prismatic Ward', 'Crystal starlight heals you and friends and shoves hostile creatures back', 15, '🔮', '#b9a6ff', heal(22, 4.4), dmg(6, 4.4)]);

/* ---- hybrids of hybrids ---- */
H('supernova', 'Supernova', ['plasma', 'nebula'], 0.3, 'legendary', 'wh', 'stars', '#ffffff', ['#1a0a30', '#2a1244', '#12061f', '#3a1a58'], [['#ffffff', '#ff4081', '#ffea00', '#18ffff'], ['#ff6d00', '#e040fb', '#ffffff']],
  'Cataclysm Zenith Blast Pyre Omega Brightest Fission Halo', ['Supernova', 'A star dies: everything hostile nearby is blasted and the wild ones flee', 18, '🌟', '#ffffff', dmg(26, 6.4), scare(6.4)]);
H('maelstrom', 'Maelstrom', ['tempest', 'blizzard'], 0.3, 'legendary', 'w', 'sparks', '#bfe6ff', ['#2c3c5c', '#38486c', '#22304a', '#44587c'], [['#4fc3f7', '#ffffff', '#ffea00'], ['#81d4fa', '#7c4dff']],
  'Vortex Whirl Eddy Tornado Twister Gyre Cyclone Typhon', ['Maelstrom', 'A raging storm of ice and lightning hurts and slows everything hostile round you', 15, '🌪', '#bfe6ff', dmg(18, 5.4), slow(80, 5.4, 4)]);
H('singularity', 'Singularity', ['cosmic', 'eclipse'], 0.25, 'legendary', 'wh', 'stars', '#8a5cff', ['#0a0a1e', '#14122e', '#06061a', '#1c1840'], [['#ffffff', '#8a5cff', '#ff8f00'], ['#311b92', '#ffd54f']],
  'Horizon Abyss Void Paradox Nadir Collapse Antimatter Tesseract', ['Event Horizon', 'Space folds in: hostile creatures are crushed and the wild ones bolt', 18, '⚫', '#8a5cff', dmg(24, 6), scare(6)]);
H('paradise', 'Paradise', ['prism', 'confetti'], 0.3, 'legendary', 'wh', 'rainbow', '#ffffff', ['#ffffff', '#fff4fa', '#f4fff8', '#f4f8ff'], [['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'], ['#ffffff', '#ff80ab', '#18ffff']],
  'Utopia Eden Elysia Bliss Heaven Jubilant Radiance Harmony', ['Paradise', 'A burst of pure joy heals you and everyone beside you a great deal', 18, '🌺', '#ffffff', heal(46, 5.4)]);
H('hellfire', 'Hellfire', ['plasma', 'wildfire'], 0.3, 'legendary', 'wh', 'flames', '#ff3d00', ['#2a0a0a', '#3a1010', '#1e0606', '#4a1414'], [['#ff1744', '#ff6d00', '#ffea00'], ['#d50000', '#ff9100', '#ffffff']],
  'Inferno Brimstone Cinder Conflagra Pyra Ashen Furnace Blaze', ['Hellfire', 'A firestorm engulfs hostile creatures all round you', 13, '🌋', '#ff3d00', dmg(22, 5.4), scare(5.4)]);
H('chaos', 'Chaos', [], 0.12, 'legendary', 'wh', 'stars', '#ff40ff', ['#101010', '#ff0050', '#00e5ff', '#ffee00'], [['#ff1744', '#00e5ff', '#ffea00', '#d500f9'], ['#76ff03', '#ff6d00', '#2979ff']],
  'Entropy Havoc Mayhem Wild Glitch Rift Anarchy Flux', ['Wild Magic', 'Anything can happen: a wave of raw magic hurts hostile creatures and heals your friends', 12, '🎲', '#ff40ff', dmg(14, 5), heal(14, 5)], { marks: MARKS });
})();
