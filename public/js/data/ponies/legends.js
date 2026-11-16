'use strict';
/* DATA - LEGENDARY ponies: named characters (a fan tribute to a certain famous pastel pony show). Each one is a single variety (one coat, one mane, one cutie mark, one name), its own kind of pony,
 * always legendary, never wild and never bred: you meet them through the host's Dev settings (Spawn legendary ponies). They are registered like the hybrids (so they get a power of their own, a
 * skill tree, a collector coin and a Pony Book entry) with `legend: true`, and are added at the END of the variety table so saved ponies keep their numbers (this file loads after hybrids.js).
 *   epithet / quote   the lines their Pony Book card shows         card   the card's look (css custom properties, see .pcard.legend in style.css)
 *   flags             w: wings, h: horn                              trail  1 short, 2 rainbow, 3 grand rainbow trail */
(() => {
const effect = ([kind, value = 0, radius = 0, shape = 'circle', target = 'hostile', duration = 0]) => ({ kind, value, radius, shape, target, duration });
const dmg = (v, r, shape = 'circle') => ['damage', v, r, shape, 'hostile'], heal = (v, r) => ['heal', v, r, 'circle', 'allies'], scare = (r, shape = 'circle') => ['scare', 0, r, shape, 'wild'];
const slow = (v, r, d = 3) => ['slow', v, r, 'circle', 'wild', d], speed = (v, d) => ['speed', v, 0, 'self', 'self', d];

/** L(id, name, kindName, flags, coat, mane, mark, accessory, glow, seed, trail, card, power) */
function L(id, name, kindName, flags, coat, mane, mark, accessory, glow, seed, trail, card, power) {
  const [pn, pd, cd, glyph, color, ...fx] = power, wings = flags.includes('w'), horn = flags.includes('h');
  PonyVariantTable.register({ id, name, biome: null, accessory, glow, coats: [coat], manes: [mane], marks: [mark], names: [name], hybrid: true, legend: true, seed, trail, card });
  PonyKinds.register({ id: 'pony_' + id, name: kindName, rarity: 'legendary', baseSpeed: wings ? 6.4 : 5.9, lassoTier: 4, ring: 0, weight: 0, group: [1, 1], levelBase: 24, tameApples: 6, tameTier: 4,
    mystical: true, ...(wings ? { wings: true, abilities: ['fly'] } : {}), ...(horn ? { horn: true } : {}), fleeSpeed: 5.2, followSpeed: 4.2 });
  HybridTable.register({ id, kind: 'pony_' + id, variant: id, name, parents: [], chance: 0, rarity: 'legendary', legend: true, power: { id: 'hybrid_' + id, name: pn, description: pd, cooldown: cd, glyph, color, effects: fx.map(effect) } });
  PonySkillTrees.register({ id, skills: [{ id: 'hybrid_' + id, label: pn, level: 1, ability: 'hybrid_' + id }] });
}

L('twilight_sparkle', 'Twilight Sparkle', 'Alicorn', 'wh', '#b58bdc', ['#27286e', '#d23a9c', '#8f4fd0'], 'sparkle', 'stars', '#c9a2ff', 9101, 0,
  { epithet: 'Element of Magic', quote: 'Friendship is the greatest magic of all.', color: '#c9a2ff', color2: '#ff6fd0', glyph: '✨', font: "'Cinzel Decorative'" },
  ['Friendship Magic', 'A blaze of purple magic hurts hostile creatures and heals friends beside you', 12, '✨', '#c9a2ff', dmg(18, 5.2), heal(26, 4.8)]);
L('rainbow_dash', 'Rainbow Dash', 'Pegasus', 'w', '#8fd3f6', ['#e8403a', '#f6923a', '#f9e24a', '#58c85a', '#3f8ff0', '#9a58d0'], 'bolt', 'rainbow', '#9fe3ff', 9102, 2,
  { epithet: 'Element of Loyalty', quote: 'Twenty percent cooler.', color: '#7fd8ff', color2: '#ff8a4c', glyph: '⚡', font: "'Bungee'" },
  ['Sonic Rainboom', 'A rainbow burst: you streak away at tremendous speed and the wild animals bolt', 14, '\u{1F308}', '#ff9a3c', speed(130, 4), scare(5)]);
L('rarity', 'Rarity', 'Unicorn', 'h', '#f4f0f8', ['#4a2f98', '#7049c8'], 'gems', 'crystals', '#e8d8ff', 9103, 0,
  { epithet: 'Element of Generosity', quote: 'Darling, everything is better with a little sparkle.', color: '#e6d4ff', color2: '#7fe0ff', glyph: '\u{1F48E}', font: "'Great Vibes'" },
  ['Dazzling Gems', 'Showers of gems heal you and your friends and dazzle the wild animals into a crawl', 13, '\u{1F48E}', '#e6d4ff', heal(34, 4.8), slow(75, 4.8, 4)]);
L('pinkie_pie', 'Pinkie Pie', 'Earth Pony', '', '#f8a6cb', ['#e8388f', '#ff7ab6'], 'balloons', 'sprinkles', '#ffb3dc', 9104, 0,
  { epithet: 'Element of Laughter', quote: 'Smile, smile, smile!', color: '#ff8fc8', color2: '#ffe14a', glyph: '\u{1F388}', font: "'Pacifico'" },
  ['Party Cannon', 'A surprise party: confetti scares the wild animals away and a rush of joy heals everyone beside you', 12, '\u{1F389}', '#ff8fc8', scare(5.4), heal(32, 5.2)]);
})();
