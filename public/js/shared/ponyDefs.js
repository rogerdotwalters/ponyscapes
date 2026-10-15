'use strict';
/* SHARED - how ponies look. A pony's look is a tiny array of palette indices [coat, mane, mark, name] derived from a gene
 * number, so every client draws the same pony and nothing but four small integers ever goes over the wire.
 * (Original designs in the spirit of pastel pony tales: earth ponies, winged pegasi, horned unicorns and rare alicorns.) */
const PonyPalette = Object.freeze({
  recessive: Object.freeze({ count: 2, names: ['Black', 'Silver'] }),           // the LAST `count` coats and manes (black, then silver) are recessive: a pony shows one only when BOTH its alleles are recessive ones (a lower number is dominant: ponyGenes.js)
  base: Object.freeze({ coats: 12, manes: 10 }),           // how many of the colours below are the original ones: a wild pony's first roll is over those, the rest come in through its genes (PonyGenes.roll)
  coats: ['#f4eef7', '#f7c6d9', '#cdb4f0', '#a9d4f5', '#b8ecd0', '#fbe7a1', '#f9c79a', '#e8a0a8', '#9fb7e8', '#d9d9e8', '#c8f0ea', '#f5b8e0',
          '#c9a27e', '#8a6a52', '#5b4a44', '#3a3a45', '#fffaf0', '#d8b4a0', '#b7c9a8', '#f6a6a0', '#a0e0f0', '#d0a8e8', '#f0d060', '#7fb3a0',
          '#1b1b22', '#c9ced8'],         // black and silver come LAST: they are the recessive colours (PonyPalette.recessive)      // (the first twelve are the original coats: the rest were added after, so saved ponies keep theirs)
  manes: [                                                  // each is 2-3 colours drawn as stripes through the mane and tail
    ['#d6336c', '#f48fb1'], ['#6a4bc4', '#a58be8'], ['#2fa6b8', '#7fd9e6'], ['#f2a33a', '#ffd37a'], ['#43a047', '#9be39e'],
    ['#e53935', '#ff8a80'], ['#ff7ab6', '#ffd1e8', '#8ed1ff'], ['#7e57c2', '#4dd0e1', '#f48fb1'], ['#212b66', '#5c6bc0'], ['#ffb300', '#ff7043', '#ec407a'],
    ['#111827', '#4b5563'], ['#ffffff', '#cbd5e1'], ['#8d5524', '#d9a066'], ['#c0392b', '#f5b041', '#f7dc6f'], ['#16a085', '#76d7c4', '#1abc9c'],
    ['#e91e63', '#9c27b0', '#3f51b5'], ['#ff6f61', '#ffd1c1'], ['#2e86de', '#74b9ff'], ['#f1c40f', '#fff3b0'], ['#6d214f', '#d6a2e8'],
    ['#0d0d12', '#2c2c36'], ['#c5cad3', '#f1f3f7', '#9aa3b0']                // black, silver (recessive)
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
  /** A gene number (and the variant of the biome it was born in) -> [coat, mane, mark, name, variant, rarity, traitSeed, ...genome] (PonyGenes).
   *  The rarity (an index into RarityOrder, never below `minRarity`) and the trait seed decide its buffs and abilities (PonyRarity). */
  fromGene(gene, variant = 0, minRarity = 'common') {
    const rng = mulberry32(gene | 0), V = variant ? PonyVariants[variant] : null, P = PonyPalette;
    const coats = V ? V.coats.length : P.base.coats, manes = V ? V.manes.length : P.base.manes, marks = V ? V.marks.length : P.marks.length, names = V ? V.names.length : P.names.length;
    const look = [Math.floor(rng() * coats), Math.floor(rng() * manes), Math.floor(rng() * marks), Math.floor(rng() * names), variant | 0];
    look.push(PonyRarity.rollRarity(rng, minRarity), Math.floor(rng() * 65536));
    return PonyGenes.roll(rng, look, variant | 0);                    // (the genes come last, so the older numbers of a gene are what they always were)
  },
  /** The same pony at another rarity (the starter pony of the testing version is made rare, so its abilities can be tried at once). */
  withRarity(look, rarity) { const out = look.slice(); out[5] = Math.max(out[5] | 0, rarityOf(rarity).order); return out; },
  /** [r, g, b] of a pony's aura (see PonyGenes.auraColor), worked out once per look: what a night-light pony shines in. */
  auraRgb(look) {
    const key = look.join(); let c = PonyLook._aura.get(key);
    if (!c) { const n = parseInt(PonyLook.describe(look).aura.slice(1), 16); c = [n >> 16, (n >> 8) & 255, n & 255]; if (PonyLook._aura.size > 600) PonyLook._aura.clear(); PonyLook._aura.set(key, c); }
    return c;
  },
  _aura: new Map(),
  variantOf(biome) { return PonyVariantOfBiome[biome] || 0; },
  /** Ponies are male or female: a bit of the look's trait seed decides (so a herd's mix is stable, saved ponies keep theirs, and nothing new has to be stored). 'f' | 'm' */
  sexOf(look) { return (((look && look[6]) | 0) >> 7) & 1 ? 'f' : 'm'; },
  /** Symbol and word of a sex: { symbol: '\u2640', word: 'Mare' }. */
  sexInfo(sex) { return sex === 'f' ? { symbol: '\u2640', word: 'Mare', name: 'Female' } : { symbol: '\u2642', word: 'Stallion', name: 'Male' }; },
  /** Indices -> things to draw. */
  describe(look) {
    const P = PonyPalette, l = look || [0, 0, 0, 0, 0], v = l[4] | 0, V = v ? PonyVariants[v] : null;
    const rarity = RarityDefs[RarityOrder[clamp(l[5] | 0, 0, RarityOrder.length - 1)]], sex = PonyLook.sexOf(l);
    const gene = PonyGenes.phenotype(l);                                                    // the shapes and colours its genes give it (genes.js)
    const coatHex = PonyGenes.shade((V || P).coats[l[0]], gene.coatShade), aura = PonyGenes.auraColor(gene.maneColors[0], coatHex);              // its glow: the colour of its mane
    if (!V) return { sex, coat: coatHex, mane: P.manes[l[1]], mark: P.marks[l[2]], name: P.names[l[3]], variant: 0, variantName: 'Meadow', variantId: 'meadow', accessory: null, glow: null, rarity, gene, aura };
    return { sex, coat: coatHex, mane: V.manes[l[1]], mark: V.marks[l[2]], name: V.names[l[3]], variant: v, variantName: V.name, variantId: V.id, accessory: V.accessory, glow: V.glow, rarity, gene, aura };
  }
};
