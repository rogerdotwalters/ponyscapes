'use strict';
/* SHARED - how ponies look. A pony's look is a tiny array of palette indices [coat, mane, mark, name] derived from a gene
 * number, so every client draws the same pony and nothing but four small integers ever goes over the wire.
 * (Original designs in the spirit of pastel pony tales: earth ponies, winged pegasi, horned unicorns and rare alicorns.) */
const PonyPalette = Object.freeze({
  coats: ['#f4eef7', '#f7c6d9', '#cdb4f0', '#a9d4f5', '#b8ecd0', '#fbe7a1', '#f9c79a', '#e8a0a8', '#9fb7e8', '#d9d9e8', '#c8f0ea', '#f5b8e0'],
  manes: [                                                  // each is 2-3 colours drawn as stripes through the mane and tail
    ['#d6336c', '#f48fb1'], ['#6a4bc4', '#a58be8'], ['#2fa6b8', '#7fd9e6'], ['#f2a33a', '#ffd37a'], ['#43a047', '#9be39e'],
    ['#e53935', '#ff8a80'], ['#ff7ab6', '#ffd1e8', '#8ed1ff'], ['#7e57c2', '#4dd0e1', '#f48fb1'], ['#212b66', '#5c6bc0'], ['#ffb300', '#ff7043', '#ec407a']
  ],
  marks: ['star', 'heart', 'flower', 'moon', 'cloud', 'apple', 'drop', 'note'],      // the cutie mark on the flank
  names: ['Sprout', 'Clover', 'Petal', 'Willow', 'Pippin', 'Honey', 'Comet', 'Daisy', 'Misty', 'Breeze', 'Twinkle', 'Buttercup',
          'Ember', 'Marigold', 'Zephyr', 'Lilac', 'Nimbus', 'Pebble', 'Aurora', 'Sorrel', 'Bramble', 'Skye', 'Maple', 'Dandelion']
});

/** UNIQUE PONIES PER BIOME. Index 0 is the ordinary meadow pony (the palette above); every other biome has its own coats, manes, cutie marks, names
 *  and a signature accessory / effect, so you can tell where a pony came from at a glance: a Blossom pony wears a flower crown, a Crystal pony grows gem
 *  shards, a Starlit pony is dusted with stars, an Ember pony has a mane of flame. */
const PonyVariants = Object.freeze([
  Object.freeze({ id: 'meadow', name: 'Meadow', biome: 'meadow', accessory: null, glow: null }),
  Object.freeze({ id: 'moss', name: 'Moss', biome: 'forest', accessory: 'leaves', glow: null,
    coats: ['#9fcf9a', '#7fb77f', '#c7d8a3', '#b4a77a'], manes: [['#2e7d32', '#81c784'], ['#33691e', '#9ccc65', '#c0ca33'], ['#4e342e', '#8d6e63']],
    marks: ['leaf', 'apple', 'flower'], names: ['Fern', 'Ivy', 'Hazel', 'Bracken', 'Juniper', 'Mossy', 'Alder', 'Clover'] }),
  Object.freeze({ id: 'marsh', name: 'Marsh', biome: 'wetland', accessory: 'bubbles', glow: null,
    coats: ['#9fd8d0', '#7ec8c8', '#b6e3dd', '#8fb8d9'], manes: [['#00838f', '#4dd0e1'], ['#26a69a', '#80cbc4', '#b2dfdb'], ['#3949ab', '#7986cb']],
    marks: ['drop', 'leaf', 'cloud'], names: ['Ripple', 'Reed', 'Brook', 'Lily', 'Dewdrop', 'Tadpole', 'Marlow', 'Teal'] }),
  Object.freeze({ id: 'dune', name: 'Dune', biome: 'dry', accessory: 'dust', glow: null,
    coats: ['#f0d9a0', '#e8c48a', '#d9a56b', '#f4e2b8'], manes: [['#c0561f', '#f2a65a'], ['#8d4a1d', '#d9822b', '#f2c14e'], ['#6d4c41', '#bf8f5a']],
    marks: ['sun', 'flame', 'moon'], names: ['Saffron', 'Sienna', 'Mirage', 'Cumin', 'Amber', 'Sirocco', 'Dune', 'Paprika'] }),
  Object.freeze({ id: 'frost', name: 'Frost', biome: 'highland', accessory: 'frost', glow: null,
    coats: ['#eef3fa', '#dbe7f3', '#c6d4e4', '#f5f9ff'], manes: [['#78909c', '#cfd8dc'], ['#5c6bc0', '#b3c5ff', '#e8eaf6'], ['#455a64', '#90a4ae']],
    marks: ['snow', 'cloud', 'star'], names: ['Flurry', 'Glacier', 'Rime', 'Icicle', 'Tundra', 'Sleet', 'Snowdrop', 'Hoar'] }),
  Object.freeze({ id: 'blossom', name: 'Blossom', biome: 'blossom', accessory: 'crown', glow: null,
    coats: ['#fbd3e3', '#f7b8d2', '#fde2ee', '#e8c3f2'], manes: [['#d81b60', '#f48fb1', '#ffd1e8'], ['#8e24aa', '#ce93d8'], ['#ff80ab', '#ffcdd2', '#fff3e0']],
    marks: ['flower', 'heart', 'apple'], names: ['Sakura', 'Peony', 'Wisteria', 'Lotus', 'Camellia', 'Orchid', 'Poppy', 'Magnolia'] }),
  Object.freeze({ id: 'crystal', name: 'Crystal', biome: 'crystal', accessory: 'crystals', glow: '#9fe7ff',
    coats: ['#d6f1ff', '#bfe6fa', '#e4f5ff', '#cdd6ff'], manes: [['#00b8d4', '#84ffff', '#e0f7fa'], ['#7c4dff', '#b388ff', '#e1d5ff'], ['#00e5ff', '#ffffff']],
    marks: ['gem', 'star', 'drop'], names: ['Prism', 'Glint', 'Opal', 'Quartz', 'Beryl', 'Shard', 'Topaz', 'Facet'] }),
  Object.freeze({ id: 'starlit', name: 'Starlit', biome: 'starlit', accessory: 'stars', glow: '#b9a6ff',
    coats: ['#2a2f6b', '#1f2557', '#3b2f78', '#233a6e'], manes: [['#7e57c2', '#4dd0e1', '#f48fb1'], ['#ffe082', '#ffffff'], ['#26c6da', '#9575cd', '#ede7f6']],
    marks: ['star', 'moon', 'gem'], names: ['Nova', 'Lyra', 'Vesper', 'Orion', 'Selene', 'Comet', 'Astra', 'Eclipse'] }),
  Object.freeze({ id: 'ember', name: 'Ember', biome: 'ember', accessory: 'flames', glow: '#ff9a3c',
    coats: ['#4a3b3b', '#5d4037', '#6d4c41', '#3e2f2f'], manes: [['#ff3d00', '#ff9100', '#ffd740'], ['#d50000', '#ff6e40', '#ffab40'], ['#ff6f00', '#ffca28']],
    marks: ['flame', 'sun', 'star'], names: ['Cinder', 'Blaze', 'Kindle', 'Ash', 'Spark', 'Magma', 'Flare', 'Pyre'] })
]);
/** biome -> variant index (ponies in biomes without an entry are meadow ponies). */
const PonyVariantOfBiome = Object.freeze(Object.fromEntries(PonyVariants.map((v, i) => [v.biome, i])));

const PonyLook = {
  /** A gene number (and the variant of the biome it was born in) -> [coat, mane, mark, name, variant, rarity, traitSeed].
   *  The rarity (an index into RarityOrder, never below `minRarity`) and the trait seed decide its buffs and abilities (PonyTraits). */
  fromGene(gene, variant = 0, minRarity = 'common') {
    const rng = mulberry32(gene | 0), V = variant ? PonyVariants[variant] : null, P = PonyPalette;
    const coats = V ? V.coats.length : P.coats.length, manes = V ? V.manes.length : P.manes.length, marks = V ? V.marks.length : P.marks.length, names = V ? V.names.length : P.names.length;
    const look = [Math.floor(rng() * coats), Math.floor(rng() * manes), Math.floor(rng() * marks), Math.floor(rng() * names), variant | 0];
    look.push(PonyTraits.rollRarity(rng, minRarity), Math.floor(rng() * 65536));
    return look;
  },
  /** The same pony at another rarity (the starter pony of the testing version is made rare, so its abilities can be tried at once). */
  withRarity(look, rarity) { const out = look.slice(); out[5] = Math.max(out[5] | 0, rarityOf(rarity).order); return out; },
  variantOf(biome) { return PonyVariantOfBiome[biome] || 0; },
  /** Indices -> things to draw. */
  describe(look) {
    const P = PonyPalette, l = look || [0, 0, 0, 0, 0], v = l[4] | 0, V = v ? PonyVariants[v] : null;
    const rarity = RarityDefs[RarityOrder[clamp(l[5] | 0, 0, RarityOrder.length - 1)]];
    if (!V) return { coat: P.coats[l[0]], mane: P.manes[l[1]], mark: P.marks[l[2]], name: P.names[l[3]], variant: 0, variantName: 'Meadow', variantId: 'meadow', accessory: null, glow: null, rarity };
    return { coat: V.coats[l[0]], mane: V.manes[l[1]], mark: V.marks[l[2]], name: V.names[l[3]], variant: v, variantName: V.name, variantId: V.id, accessory: V.accessory, glow: V.glow, rarity };
  }
};
