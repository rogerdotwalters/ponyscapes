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
/** The pony varieties are a TABLE (js/data/ponies/variants.js). Index 0 is the plain meadow pony; the order is what saved ponies point at, so new varieties are only ever ADDED at the end. */
const PonyVariants = Object.freeze(PonyVariantTable.all());
/** biome -> variant index (ponies in biomes without an entry are meadow ponies). */
const PonyVariantOfBiome = Object.freeze(Object.fromEntries(Biomes.all().map(b => [b.id, Math.max(0, PonyVariants.findIndex(v => v.id === b.ponyVariant))])));

const PonyLook = {
  /** A gene number (and the variant of the biome it was born in) -> [coat, mane, mark, name, variant]. */
  fromGene(gene, variant = 0) {
    const rng = mulberry32(gene | 0), V = variant ? PonyVariants[variant] : null, P = PonyPalette;
    const coats = V ? V.coats.length : P.coats.length, manes = V ? V.manes.length : P.manes.length, marks = V ? V.marks.length : P.marks.length, names = V ? V.names.length : P.names.length;
    return [Math.floor(rng() * coats), Math.floor(rng() * manes), Math.floor(rng() * marks), Math.floor(rng() * names), variant | 0];
  },
  variantOf(biome) { return PonyVariantOfBiome[biome] || 0; },
  /** Indices -> things to draw. */
  describe(look) {
    const P = PonyPalette, l = look || [0, 0, 0, 0, 0], v = l[4] | 0, V = v ? PonyVariants[v] : null;
    if (!V) return { coat: P.coats[l[0]], mane: P.manes[l[1]], mark: P.marks[l[2]], name: P.names[l[3]], variant: 0, variantName: 'Meadow', accessory: null, glow: null };
    return { coat: V.coats[l[0]], mane: V.manes[l[1]], mark: V.marks[l[2]], name: V.names[l[3]], variant: v, variantName: V.name, accessory: V.accessory, glow: V.glow };
  }
};
