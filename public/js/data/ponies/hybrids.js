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
H('hellfire', 'Blazeheart', ['plasma', 'wildfire'], 0.3, 'legendary', 'wh', 'flames', '#ff9a30', ['#6a2a1a', '#7a3420', '#5a2216', '#8a4026'], [['#ff5252', '#ff9100', '#ffea00'], ['#ff8a65', '#ffd54f', '#ffffff']],
  'Blaze Flicker Cinder Toasty Hearth Sparky Kindle Glowheart', ['Heartflame', 'A warm wave of golden flame sweeps hostile creatures away from you', 13, '🔥', '#ff9a30', dmg(22, 5.4), scare(5.4)]);
H('chaos', 'Chaos', [], 0.12, 'legendary', 'wh', 'stars', '#ff40ff', ['#101010', '#ff0050', '#00e5ff', '#ffee00'], [['#ff1744', '#00e5ff', '#ffea00', '#d500f9'], ['#76ff03', '#ff6d00', '#2979ff']],
  'Entropy Havoc Mayhem Wild Glitch Rift Anarchy Flux', ['Wild Magic', 'Anything can happen: a wave of raw magic hurts hostile creatures and heals your friends', 12, '🎲', '#ff40ff', dmg(14, 5), heal(14, 5)], { marks: MARKS });
/* ---- more crosses (added after the first batch: they sit at the end of the variety table so saved ponies keep their numbers) ---- */
H('wish', 'Wish', ['meadow', 'star'], 0.45, 'epic', 'h', 'stars', '#fff5b0', ['#fff3f8', '#f7e8ff', '#fffbe6', '#eaf2ff'], [['#ffd54f', '#ffffff', '#f48fb1'], ['#b39ddb', '#fff176']],
  'Hope Dandelion Wishbone Clover Fable Whisper Daydream Sparkle', ['Wishing Star', 'A wish on a falling star heals you and your friends and lights up the dark', 15, '🌠', '#fff5b0', heal(24, 4.6), ['light', 0, 7, 'self', 'self']]);
H('pastel', 'Pastel', ['meadow', 'rainbow'], 0.5, 'rare', '', 'rainbow', null, ['#fde4ec', '#e4f4e8', '#e8e4fb', '#fff2d6'], [['#f48fb1', '#ce93d8', '#90caf9'], ['#a5d6a7', '#fff59d', '#ffab91']],
  'Macaron Blush Lavender Peach Sorbet Mint Cream Petal', ['Soft Glow', 'A gentle pastel glow heals you and calms the wild animals nearby', 13, '🎀', '#f8bbd0', heal(20, 4), slow(50, 4)]);
H('fieldstorm', 'Fieldstorm', ['meadow', 'lightning'], 0.5, 'rare', '', 'sparks', '#ffe94d', ['#cfd8b8', '#dce6c0', '#bcc8a4', '#e8efd0'], [['#7cb342', '#ffea00', '#ffffff'], ['#aed581', '#ffd600']],
  'Haywire Static Thistle Crackle Twister Gust Prairie Harrow', ['Static Charge', 'A crackle of field lightning hurts hostile creatures and speeds you up', 10, '⚡', '#ffe94d', dmg(9, 4), ['speed', 55, 0, 'self', 'self', 3]]);
H('lichen', 'Lichen', ['moss', 'frost'], 0.45, 'rare', '', 'frost', null, ['#b8d4c0', '#a4c4b0', '#cfe0d4', '#90b4a0'], [['#4db6ac', '#e0f2f1', '#9ccc65'], ['#80cbc4', '#ffffff']],
  'Tundra Fungus Spore Hoar Frond Taiga Moss Rimefern', ['Frozen Roots', 'Frosted roots grab the wild animals and slow them, and prick hostile creatures', 12, '🍄', '#80cbc4', slow(75, 4, 4), dmg(7, 4)]);
H('wildwood', 'Wildwood', ['moss', 'jungle'], 0.5, 'rare', '', 'leaves', null, ['#6f9a58', '#5c8a4c', '#82aa68', '#4c7a40'], [['#1b5e20', '#8bc34a', '#4e342e'], ['#2e7d32', '#c6ff00']],
  'Thicket Bough Bramble Hollow Briar Sylvan Burrow Elm', ['Wild Growth', 'Tangled branches slow the wild animals and mend you and friends', 12, '🌳', '#8bc34a', slow(65, 4), heal(16, 4)]);
H('fae', 'Fae', ['moss', 'moon'], 0.4, 'epic', 'h', 'leaves', '#d6c8ff', ['#cfe0c8', '#e0e4f8', '#d4f0e0', '#e8dcf8'], [['#7e57c2', '#a5d6a7', '#f8bbd0'], ['#4db6ac', '#d1c4e9']],
  'Pixie Glimmer Gossamer Toadstool Moth Tansy Faerie Lantern', ['Fairy Dust', 'Glittering dust confuses the wild animals and lets friends heal', 14, '🧚', '#d6c8ff', scare(4.4), heal(20, 4.4)]);
H('hedgerow', 'Hedgerow', ['moss', 'orchard'], 0.5, 'uncommon', '', 'leaves', null, ['#a8c08a', '#bcd0a0', '#98b47c', '#c8d8b0'], [['#558b2f', '#ef5350', '#ffe082'], ['#7cb342', '#ff8a65']],
  'Bramble Sloe Haw Berry Thorn Elder Hazel Rosehip', ['Thorn Bush', 'Thorny brambles prick hostile creatures nearby', 9, '🌹', '#7cb342', dmg(8, 3.6)]);
H('hoarlight', 'Hoarlight', ['frost', 'moon'], 0.4, 'epic', 'h', 'frost', '#cfe0ff', ['#e8f0ff', '#d8e4fa', '#f2f6ff', '#c8d8f2'], [['#9fa8da', '#ffffff', '#b3e5fc'], ['#c5cae9', '#e1f5fe']],
  'Silverfrost Moonrime Glint Midwinter Opaline Nocturne Hush Crescent', ['Moonlit Frost', 'Pale frost under the moon slows the wild animals and heals you', 14, '🌙', '#cfe0ff', slow(70, 4.4, 4), ['heal', 18, 0, 'self', 'self']]);
H('thaw', 'Thaw', ['frost', 'sun'], 0.5, 'rare', '', 'rays', '#fff0c0', ['#fff4e0', '#e6f0f8', '#fdf0d0', '#dcecf4'], [['#81d4fa', '#ffe082', '#ffffff'], ['#b3e5fc', '#ffcc80']],
  'Meltwater Springtide Drip Runoff Brook Sunmelt Early Trickle', ['Spring Thaw', 'Warm meltwater heals you and friends beside you', 13, '💧', '#ffe082', heal(26, 4.2)]);
H('lagoon', 'Lagoon', ['crystal', 'water'], 0.45, 'epic', 'h', 'bubbles', '#8fd0ff', ['#bfeaf5', '#a8dcee', '#d0f2fa', '#98cfe6'], [['#00bcd4', '#b2ebf2', '#ffffff'], ['#26c6da', '#80deea']],
  'Atoll Reef Seaglass Cove Azure Shoal Tidepool Turquoise', ['Crystal Tide', 'A glassy wave heals friends and shoves hostile creatures back', 14, '🌊', '#8fd0ff', heal(24, 4.4), dmg(8, 4.4)]);
H('fulgurite', 'Fulgurite', ['crystal', 'lightning'], 0.4, 'epic', 'hw', 'sparks', '#ffe94d', ['#d8d0ec', '#c8c0e0', '#e4def4', '#bcb4d8'], [['#ffea00', '#7c4dff', '#ffffff'], ['#18ffff', '#ffd600']],
  'Fused Glassbolt Spark Prong Arc Voltaic Shatter Tendril', ['Glass Lightning', 'A bolt of fused crystal slices hostile creatures ahead', 10, '🔱', '#ffe94d', dmg(16, 5.4, 'cone')]);
H('moonstone', 'Moonstone', ['crystal', 'moon'], 0.4, 'epic', 'h', 'crystals', '#cfe0ff', ['#e6ecff', '#d6def8', '#f0f4ff', '#c6d0ee'], [['#b0bef0', '#ffffff', '#ce93d8'], ['#9fa8da', '#e8eaf6']],
  'Adularia Sheen Labrador Pearl Cabochon Gleam Selenite Halo', ['Moonstone Ward', 'A soft pearly ward heals you and friends and calms the wild animals', 15, '🔮', '#cfe0ff', heal(24, 4.4), slow(55, 4.4)]);
H('cinderstar', 'Cinderstar', ['starlit', 'ember'], 0.4, 'epic', 'h', 'flames', '#ffb86c', ['#3a2a4a', '#4a3258', '#2e2040', '#58405e'], [['#ff6d00', '#b39ddb', '#ffffff'], ['#ffab40', '#7e57c2']],
  'Ashstar Smolder Ember Meteorite Glowworm Cindra Kilnlight Sparkfall', ['Falling Embers', 'Burning stars rain on hostile creatures round you', 11, '☄', '#ffb86c', dmg(13, 4.6)]);
H('cotton', 'Cotton Candy', ['starlit', 'candy'], 0.45, 'rare', '', 'sprinkles', '#f8c8ff', ['#f6d0f0', '#d4d4fa', '#fadcec', '#cce4fa'], [['#f48fb1', '#b39ddb', '#80d8ff'], ['#ce93d8', '#f8bbd0']],
  'Fluff Spun Floss Carnival Puff Fairground Whirl Cloudy', ['Sugar Cloud', 'A fluffy cloud of spun sugar puts the wild animals to sleep and heals you', 13, '🍥', '#f8c8ff', slow(80, 4.2, 4), ['heal', 20, 0, 'self', 'self']]);
H('opal', 'Opal', ['starlit', 'rainbow'], 0.35, 'legendary', 'wh', 'rainbow', '#e8d8ff', ['#f4eefa', '#eaf6f4', '#faf0ee', '#eef0fa'], [['#80deea', '#f48fb1', '#fff59d', '#b39ddb'], ['#a5d6a7', '#ce93d8', '#ffcc80']],
  'Iridesce Fire Milky Gemma Sheen Shift Harlequin Play', ['Play of Colour', 'Shifting colours dazzle hostile creatures and heal your friends', 13, '🔷', '#e8d8ff', dmg(14, 4.8), heal(22, 4.8)]);
H('phoenix', 'Phoenix', ['ember', 'sun'], 0.3, 'legendary', 'w', 'flames', '#ffa000', ['#ffe0a0', '#ffcc80', '#fff0c8', '#ffb74d'], [['#ff3d00', '#ff9100', '#ffea00'], ['#d50000', '#ffab00', '#fff59d']],
  'Rebirth Ashen Emberwing Pyra Solara Flicker Rise Fenix', ['Rising Flame', 'Golden fire scorches hostile creatures and heals you and friends', 14, '🔥', '#ffa000', dmg(15, 4.8), heal(26, 4.8)]);
H('thunderforge', 'Thunderforge', ['ember', 'lightning'], 0.4, 'epic', 'w', 'sparks', '#ff9a3c', ['#4a3a3a', '#5a4646', '#3a2c2c', '#6a5252'], [['#ff6d00', '#ffea00', '#ffffff'], ['#ff3d00', '#ffd600']],
  'Anvil Hammer Bellows Slag Sparkfall Foundry Clang Crucible', ['Forge Strike', 'A white-hot hammer-blow of lightning hurts hostile creatures ahead', 10, '🔨', '#ff9a3c', dmg(17, 5, 'cone')]);
H('caramel', 'Caramel', ['ember', 'candy'], 0.45, 'rare', '', 'sprinkles', '#ffb74d', ['#d9a066', '#e6b87a', '#c88c52', '#f0c890'], [['#8d4a1d', '#ff9800', '#fff3e0'], ['#bf6f2a', '#ffd54f']],
  'Toffee Butterscotch Fudge Brulee Praline Drizzle Syrup Brittle', ['Sticky Toffee', 'Molten caramel glues the wild animals to the spot', 12, '🍮', '#ffb74d', slow(90, 3.8, 4), dmg(5, 3.8)]);
H('cobbler', 'Cobbler', ['ember', 'orchard'], 0.5, 'uncommon', '', 'flames', null, ['#e8b888', '#f0c8a0', '#d8a878', '#f4d4b0'], [['#c62828', '#ff8f00', '#ffe082'], ['#ef6c00', '#ffcc80']],
  'Crumble Pie Warm Bake Streusel Tart Oven Cinnamon', ['Hot Pie', 'A warm apple pie heals you and shakes out a few apples', 20, '🥧', '#ffcc80', ['heal', 18, 0, 'self', 'self'], ['gift', 3, 0, 'self', 'self']]);
H('rainforest', 'Rainforest', ['jungle', 'water'], 0.5, 'rare', '', 'leaves', '#8fe0c0', ['#7fc8a0', '#6cb890', '#92d4b0', '#5ca880'], [['#00796b', '#4fc3f7', '#c6ff00'], ['#26a69a', '#1de9b6']],
  'Downpour Cascade Mist Tropical Canopy Torrent Orchid Amazon', ['Monsoon', 'A warm downpour heals you and friends and slows the wild animals', 13, '🌦', '#8fe0c0', heal(22, 4.4), slow(60, 4.4)]);
H('stormvine', 'Stormvine', ['jungle', 'lightning'], 0.4, 'epic', '', 'sparks', '#b8ff6a', ['#8fc080', '#7ab070', '#a0d090', '#68a060'], [['#76ff03', '#ffea00', '#1b5e20'], ['#c6ff00', '#2e7d32']],
  'Lash Creeper Snap Liana Coil Whipcord Tangle Strangler', ['Lightning Vines', 'Charged vines lash hostile creatures and bind the wild ones', 11, '🌿', '#b8ff6a', dmg(12, 4.4), slow(70, 4.4)]);
H('taffyapple', 'Taffy Apple', ['orchard', 'candy'], 0.5, 'uncommon', '', 'sprinkles', null, ['#f4a0a0', '#f8c0c0', '#e88c8c', '#fcd0d0'], [['#d32f2f', '#ff80ab', '#ffffff'], ['#ad1457', '#ffcdd2']],
  'Caramelly Glaze Candied Crunch Stick Fairground Sweetie Polished', ['Sweet Bounty', 'Candied apples drop into your bag and cheer you up', 30, '🍎', '#ef5350', ['gift', 3, 0, 'self', 'self'], ['heal', 14, 0, 'self', 'self']]);
H('harvest', 'Harvest', ['orchard', 'rainbow'], 0.4, 'epic', 'h', 'rainbow', '#ffd54f', ['#f6e0b0', '#f0d098', '#fae8c4', '#e8c88c'], [['#ef6c00', '#fbc02d', '#8bc34a', '#c62828'], ['#ffb300', '#e65100']],
  'Bounty Cornucopia Gleaner Autumn Sheaf Abundance Plenty Hayloft', ['Bountiful Harvest', 'A rainbow harvest heals you and everyone near and drops apples', 22, '🌾', '#ffd54f', heal(30, 4.6), ['gift', 3, 0, 'self', 'self']]);
H('soda', 'Soda', ['water', 'candy'], 0.5, 'rare', '', 'bubbles', '#b8f0ff', ['#c8f0f8', '#f8d0e8', '#d8f8d0', '#fff0b8'], [['#00e5ff', '#ff4081', '#ffffff'], ['#76ff03', '#ff80ab']],
  'Fizz Pop Bubbly Seltzer Float Effervesce Cola Sparkling', ['Fizz Burst', 'A fizzing blast startles the wild animals and speeds you up', 11, '🥤', '#b8f0ff', scare(4.4), ['speed', 55, 0, 'self', 'self', 3]]);
H('moonwell', 'Moonwell', ['water', 'moon'], 0.4, 'epic', 'h', 'bubbles', '#cfe0ff', ['#c4d4f4', '#b4c8ee', '#d4e0f8', '#a8bce6'], [['#5c6bc0', '#b3e5fc', '#ffffff'], ['#7986cb', '#e1f5fe']],
  'Reflect Basin Lunar Spring Mirrorpool Ripplelight Nightwater Gibbous', ['Healing Waters', 'Moonlit water heals you and friends a great deal', 16, '⛲', '#cfe0ff', heal(34, 4.6)]);
H('mirror', 'Mirror', ['water', 'star'], 0.4, 'epic', 'h', 'stars', '#d8f0ff', ['#d0e4f8', '#c0d8f2', '#e0eefc', '#b4ccea'], [['#ffffff', '#4fc3f7', '#ffe082'], ['#b3e5fc', '#ffffff']],
  'Reflection Glass Doppel Twin Still Lakeshine Echo Looking', ['Starry Reflection', 'A reflected star bursts back on hostile creatures and heals friends', 13, '🪞', '#d8f0ff', dmg(13, 4.6), heal(18, 4.6)]);
H('daystar', 'Daystar', ['sun', 'star'], 0.35, 'legendary', 'wh', 'rays', '#fff5b0', ['#fff4c0', '#ffe9a0', '#fffadc', '#ffd980'], [['#ffffff', '#ffd600', '#ff8f00'], ['#fff59d', '#ffffff']],
  'Sunrise Morningstar Lucent Beacon Radiant Zenith Aureole Prime', ['Daybreak', 'A blazing burst of light burns hostile creatures and lights the dark', 12, '🌅', '#fff5b0', dmg(16, 5.2), ['light', 0, 9, 'self', 'self']]);
H('dawn', 'Dawn', ['sun', 'rainbow'], 0.4, 'epic', 'h', 'rainbow', '#ffd0a0', ['#ffe8d8', '#ffdcc8', '#fff0e4', '#ffd0b8'], [['#ff7043', '#ffca28', '#f48fb1', '#80deea'], ['#ffab91', '#fff59d']],
  'Daybreak Aurorae Pinkglow Skylight Cockcrow Morning Orange Break', ['First Light', 'The first rays of the day heal you and friends and scare the dark away', 14, '🌄', '#ffd0a0', heal(26, 4.8), scare(4.8)]);
H('nightbolt', 'Nightbolt', ['moon', 'lightning'], 0.4, 'epic', 'w', 'sparks', '#b0b8ff', ['#2a2f58', '#363c6c', '#202448', '#444a7c'], [['#7986cb', '#ffea00', '#ffffff'], ['#5c6bc0', '#ffd600']],
  'Darkflash Umbral Shade Midnight Nocturn Murk Blackout Wraith', ['Night Strike', 'A bolt from a clear night sky smites hostile creatures ahead', 10, '🌩', '#b0b8ff', dmg(16, 5.4, 'cone')]);
H('comet', 'Comet', ['star', 'lightning'], 0.4, 'epic', 'wh', 'stars', '#ffffa0', ['#262c70', '#30387e', '#1c2058', '#3c448c'], [['#ffff8d', '#ffffff', '#80d8ff'], ['#ffea00', '#b388ff']],
  'Halley Tail Streak Bolide Meteor Flyby Perihelion Trail', ['Comet Strike', 'A streaking comet smashes hostile creatures and you speed away', 11, '☄', '#ffffa0', dmg(15, 4.6), ['speed', 60, 0, 'self', 'self', 3]]);
H('stormbow', 'Stormbow', ['rainbow', 'lightning'], 0.4, 'epic', 'w', 'rainbow', '#ffffff', ['#f0f0fa', '#e4e8f8', '#faf4ff', '#dce4f6'], [['#ff1744', '#ffea00', '#00e5ff', '#d500f9'], ['#2979ff', '#ffd600', '#ffffff']],
  'Prismatic Thunderbow Squallow Showers Arc Vividly Splendor Cloudburst', ['Rainbow Bolt', 'A forking rainbow of lightning hurts hostile creatures and heals friends', 11, '🌈', '#ffffff', dmg(14, 5, 'cone'), heal(18, 4.4)]);

/* ---- more hybrids of hybrids ---- */
H('ragnarok', 'Ragnarok', ['hellfire', 'maelstrom'], 0.25, 'legendary', 'wh', 'flames', '#ff5030', ['#1e0c10', '#2c1418', '#14080c', '#3a1c22'], [['#ff1744', '#80d8ff', '#ffea00'], ['#d50000', '#40c4ff', '#ffffff']],
  'Doomsday Twilight Cataclysm Fimbul Surtr Calamity Endtimes Ruin', ['Ragnarok', 'Fire and storm tear down everything hostile near you', 18, '⚔', '#ff5030', dmg(28, 6.4), slow(80, 6.4, 4)]);
H('genesis', 'Genesis', ['paradise', 'supernova'], 0.25, 'legendary', 'wh', 'stars', '#ffffff', ['#fffaf0', '#fff0ff', '#f0f8ff', '#fffce0'], [['#ffffff', '#ffd700', '#ff80ab', '#18ffff'], ['#fff176', '#ba68c8', '#ffffff']],
  'Origin Alpha First Bigbang Creation Dawnborn Primal Seed', ['Genesis', 'A burst of creation heals you and friends enormously and sears hostile creatures', 20, '🌍', '#ffffff', heal(52, 6), dmg(18, 6)]);
H('oblivion', 'Oblivion', ['singularity', 'hellfire'], 0.25, 'legendary', 'wh', 'stars', '#ff4060', ['#06040a', '#0e0814', '#0a0610', '#140c1c'], [['#000000', '#ff1744', '#8a5cff'], ['#311b92', '#ff3d00', '#ffffff']],
  'Nullity Erasure Blotted Absence Finality Voidfire Omega Eclipse', ['Oblivion', 'Everything hostile nearby is erased, and the wild ones flee in terror', 20, '🕳', '#ff4060', dmg(30, 6.2), scare(6.4)]);
/* ---- friendly morphs: gentle, sunny crosses with healing and cheering powers (they go alongside the fiery and stormy ones) ---- */
H('friendship', 'Friendship', ['meadow', 'orchard'], 0.5, 'uncommon', '', 'leaves', '#ffd0e0', ['#fde8d8', '#fbe0e8', '#f4ecd0', '#e8f2d8'], [['#ec407a', '#ffca28', '#8bc34a'], ['#f48fb1', '#ffe082']],
  'Buddy Sweetie Pal Cheery Hugsy Chum Dearie Posy', ['Friendly Cheer', 'A warm hug of friendship heals you and the friends beside you', 14, '💗', '#ffd0e0', heal(24, 4.4)]);
H('kindness', 'Kindness', ['meadow', 'sun'], 0.45, 'rare', '', 'rays', '#ffe9a8', ['#fff3d6', '#ffe9c4', '#fdf5e0', '#ffe0b8'], [['#ffb74d', '#fff176', '#f48fb1'], ['#ffd54f', '#ffffff']],
  'Gentle Tender Soft Mercy Sunnyside Warmth Gracie Cosy', ['Kind Heart', 'A gentle glow heals you and your friends a good deal', 15, '🌼', '#ffe9a8', heal(32, 4.6)]);
H('laughter', 'Laughter', ['candy', 'sun'], 0.45, 'rare', '', 'sprinkles', '#fff0a0', ['#fff0b3', '#ffd1e8', '#d1f5e0', '#ffe0c0'], [['#ff4081', '#ffeb3b', '#00e5ff'], ['#ffca28', '#ff80ab']],
  'Giggles Chuckle Snickers Wiggles Tickle Guffaw Bubbly Punchline', ['Giggle Burst', 'Giggles startle the wild animals and cheer up your friends', 12, '😄', '#fff0a0', scare(4.4), heal(18, 4.4)]);
H('generosity', 'Generosity', ['orchard', 'crystal'], 0.4, 'epic', 'h', 'crystals', '#ffe6a0', ['#f6e8c8', '#f2dcc0', '#fdf0d8', '#e8dcc0'], [['#c62828', '#ffd54f', '#80deea'], ['#ef5350', '#fff59d']],
  'Bounty Giver Plenty Sharing Gifty Largesse Treasure Kindle', ['Generous Gifts', 'Gifts of apples and glowing warmth for you and your friends', 24, '🎁', '#ffe6a0', ['gift', 3, 0, 'self', 'self'], heal(20, 4.4)]);
H('loyalty', 'Loyalty', ['meadow', 'frost'], 0.45, 'rare', '', 'frost', '#cfe8ff', ['#eaf2fa', '#dde9f4', '#f2f7fc', '#d0e0ee'], [['#42a5f5', '#e3f2fd', '#ffffff'], ['#64b5f6', '#bbdefb']],
  'Steadfast True Faithful Trusty Staunch Constant Bluebell Stalwart', ['Steadfast Shield', 'A steady chill heals you and friends and slows anything hostile near you', 14, '🛡', '#cfe8ff', heal(22, 4.4), slow(55, 4, 3)]);
H('honesty', 'Honesty', ['meadow', 'crystal'], 0.45, 'rare', 'h', 'crystals', '#dff8ff', ['#e8f8ff', '#d8f0fa', '#f0fcff', '#cce8f4'], [['#26c6da', '#ffffff', '#fff59d'], ['#4dd0e1', '#e0f7fa']],
  'Truthful Clearly Plain Candor Sincere Honest Lucid Sparkly', ['Clear Light', 'A pure bright light heals you and chases the shadows away', 15, '💎', '#dff8ff', heal(24, 4.4), ['light', 0, 8, 'self', 'self']]);
H('sparkle', 'Sparkle', ['starlit', 'sun'], 0.4, 'epic', 'wh', 'stars', '#fff0c0', ['#3a3470', '#fff0c0', '#2c2858', '#4a4088'], [['#ffd54f', '#f48fb1', '#80deea'], ['#ffffff', '#ffca28', '#b39ddb']],
  'Glitterbug Starbeam Gleam Twinklestar Shiny Spangle Aglow Brightly', ['Sparkle Shower', 'A shower of sparkles heals your friends and dazzles hostile creatures', 13, '✨', '#fff0c0', heal(26, 4.8), dmg(10, 4.6)]);
H('cuddle', 'Cuddle', ['meadow', 'moon'], 0.45, 'rare', '', 'stars', '#e0e4ff', ['#e8eaf8', '#f0e8f8', '#e0e8f4', '#f6eef6'], [['#9fa8da', '#f8bbd0', '#ffffff'], ['#b39ddb', '#e1bee7']],
  'Snuggles Cosy Pillow Blanket Teddy Hushabye Nuzzle Lullaby', ['Cuddle Cloud', 'A cosy cloud lulls the wild animals to sleep and wraps you in warmth', 14, '🧸', '#e0e4ff', slow(85, 4.4, 5), ['heal', 20, 0, 'self', 'self']]);
H('twinkle', 'Twinkle', ['candy', 'star'], 0.4, 'epic', 'h', 'stars', '#ffe6ff', ['#261c58', '#3a2a78', '#ffd1e8', '#ffe6ff'], [['#fff176', '#ff80ab', '#80deea'], ['#ffffff', '#f48fb1']],
  'Twinkletoes Sugarstar Candystar Wishful Pixiedust Shimmerpop Starlight Bonbon', ['Twinkle Wish', 'A sweet wish on a star heals your friends and speeds you along', 13, '🌟', '#ffe6ff', heal(22, 4.6), ['speed', 55, 0, 'self', 'self', 3]]);
H('gumdrop', 'Gumdrop', ['candy', 'moss'], 0.5, 'uncommon', '', 'sprinkles', null, ['#c8f0d0', '#f8d0e8', '#fff0b8', '#d8e8ff'], [['#66bb6a', '#ff80ab', '#ffee58'], ['#81c784', '#f48fb1']],
  'Jellybean Sourdrop Licorice Lollipop Chewy Mintcake Rockcandy Bonbon', ['Sticky Sweets', 'Gooey gumdrops slow the wild animals and give you a little cheer', 11, '🍬', '#ff80ab', slow(70, 3.8, 3), ['heal', 14, 0, 'self', 'self']]);
H('petalpuff', 'Petal Puff', ['jungle', 'candy'], 0.45, 'rare', '', 'leaves', '#ffb8e0', ['#ffd0e4', '#d8f0c8', '#fff0c0', '#e8d0f8'], [['#ec407a', '#ffee58', '#66bb6a'], ['#ff80ab', '#ffd54f']],
  'Blossomy Petalpop Bloomie Posie Tulipa Marigold Fragrant Pollen', ['Petal Storm', 'A flurry of sweet petals heals friends and slows the wild animals', 12, '🌸', '#ffb8e0', heal(20, 4.4), slow(60, 4.4)]);
H('sunshower', 'Sunshower', ['sun', 'water'], 0.5, 'rare', '', 'bubbles', '#ffe9a8', ['#ffeeb8', '#bfe4fa', '#fff3c7', '#cfe9f8'], [['#ffca28', '#4fc3f7', '#ffffff'], ['#ffd54f', '#81d4fa']],
  'Drizzly Raindrop Rainbowbeam Puddles Splashy Dewy Showery Brightdrop', ['Rainbow Shower', 'A sparkling sunny shower heals you and everyone beside you', 14, '🌦', '#ffe9a8', heal(28, 4.6)]);
H('harmony', 'Harmony', ['friendship', 'kindness'], 0.3, 'legendary', 'wh', 'rainbow', '#fff0f8', ['#fff8fc', '#fdf0f8', '#f8f4ff', '#fffaf0'], [['#ec407a', '#ffca28', '#42a5f5', '#66bb6a'], ['#ba68c8', '#ff7043', '#26c6da']],
  'Concord Accord Serenade Chorus Melody Unison Carol Rhapsody', ['Harmony', 'Pure harmony heals you and all your friends greatly and calms the wild animals', 18, '🎶', '#fff0f8', heal(48, 6), slow(60, 5.6, 4)]);
H('unity', 'Unity', ['generosity', 'honesty'], 0.3, 'legendary', 'wh', 'crystals', '#ffffff', ['#fff6e0', '#e8f8ff', '#fff0f0', '#f0fff0'], [['#ffd54f', '#80deea', '#ffffff'], ['#ef5350', '#26c6da', '#fff176']],
  'Together Allied Bondling Kinship Tandem Oneness Teamwork Joined', ['Together', 'Everyone pulling together: a great healing glow and a warm, bright light', 18, '🤝', '#ffffff', heal(44, 6), ['light', 0, 10, 'self', 'self']]);
H('celebration', 'Celebration', ['laughter', 'twinkle'], 0.3, 'legendary', 'wh', 'sprinkles', '#ffffff', ['#fff0f8', '#f0f8ff', '#fffbe0', '#f0ffe8'], [['#ff4081', '#ffea00', '#00e5ff', '#76ff03'], ['#e040fb', '#ff9100', '#18ffff']],
  'Festive Jubilation Partytime Hooray Fanfare Streamers Cheer Revelry', ['Grand Party', 'A big party: cheering streamers heal your friends and send the wild animals scampering', 16, '🎊', '#ffffff', heal(36, 5.6), scare(5.6)]);
H('everbloom', 'Everbloom', ['petalpuff', 'sunshower'], 0.3, 'legendary', 'wh', 'leaves', '#ffffd0', ['#f8fce0', '#fff0f4', '#e8f8e0', '#fffadc'], [['#ec407a', '#76ff03', '#ffeb3b'], ['#ff80ab', '#69f0ae', '#ffd740']],
  'Springtide Evergreen Perennial Meadowlark Greenwing Fullbloom Eden Lush', ['Everbloom', 'Flowers burst into bloom everywhere: a big healing and a field of calming petals', 17, '🌷', '#ffffd0', heal(40, 5.8), slow(65, 5.4, 4)]);
})();
