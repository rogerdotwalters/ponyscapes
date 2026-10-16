'use strict';
/* DATA - the pony GENES (the gene system is shared/ponyGenes.js). Every entry is one LOCUS: a pony carries two alleles of it (one from each parent) and the one with the LOWER
 * number shows (dominant); the other is carried and can come out in a foal. The ORDER here is the order the genes sit in a pony's look (saved ponies point at it), so new genes are only ever ADDED at the end.
 *   kind 'palette': the alleles are the colours of the pony's variety (`palette`: its coats or manes); `slot` is the place in the look the shown colour is also kept (0: coat, 1: mane).
 *   kind 'shape' | 'colour': `alleles` lists the choices (the first is the classic look every older pony has); `weight` is how common it is in the wild (default 1).
 *   kind 'switch': a gene with a RULE. `link: [from, to]`: while the gene shows its first allele, the `to` colour MUST equal the `from` colour (the tail always matches the mane). */
(() => {
const swatch = (id, name, color, weight = 1) => ({ id, name, color, weight });
const shapes = (...names) => names.map(([n, w], i) => ({ id: n.toLowerCase(), name: n, weight: w }));

PonyGeneTable.register({ id: 'bodyColor', part: 'body', name: 'Coat colour', kind: 'palette', palette: 'coats', slot: 0 });
PonyGeneTable.register({ id: 'maneColor', part: 'mane', name: 'Mane colour', kind: 'palette', palette: 'manes', slot: 1 });
PonyGeneTable.register({ id: 'tailColor', part: 'tail', name: 'Tail colour', kind: 'palette', palette: 'manes', legacyFrom: 1 });     // (older ponies had the mane's colours in the tail)
PonyGeneTable.register({ id: 'tailLink', part: 'tail', name: 'Matching tail', kind: 'switch', link: ['maneColor', 'tailColor'],
  alleles: [{ id: 'matched', name: 'Tail matches the mane', weight: 3 }, { id: 'free', name: 'Tail colour is its own', weight: 1 }] });
PonyGeneTable.register({ id: 'eyeShape', part: 'eyes', name: 'Eye shape', kind: 'shape', alleles: shapes(['Round', 50], ['Almond', 18], ['Sleepy', 14], ['Big', 10], ['Starry', 8]) });
PonyGeneTable.register({ id: 'eyeColor', part: 'eyes', name: 'Eye colour', kind: 'colour', alleles: [
  swatch('mane', 'Mane tint', null, 30), swatch('brown', 'Brown', '#7a4a2a', 16), swatch('blue', 'Blue', '#3a78d8', 12), swatch('green', 'Green', '#3f9a54', 10),
  swatch('amber', 'Amber', '#d9922a', 9), swatch('violet', 'Violet', '#8a52c8', 8), swatch('rose', 'Rose', '#d8527e', 6), swatch('teal', 'Teal', '#2aa6a0', 6),
  swatch('grey', 'Grey', '#8896a8', 7), swatch('gold', 'Gold', '#e0b020', 6), swatch('lime', 'Lime', '#8fc43a', 5), swatch('crimson', 'Crimson', '#c0392b', 4),
  swatch('sky', 'Sky', '#6ec3f0', 6), swatch('lavender', 'Lavender', '#b79ce8', 5)] });
PonyGeneTable.register({ id: 'maneShape', part: 'mane', name: 'Mane shape', kind: 'shape', alleles: shapes(['Wavy', 40], ['Cropped', 24], ['Flowing', 22], ['Spiky', 14]) });
PonyGeneTable.register({ id: 'tailShape', part: 'tail', name: 'Tail shape', kind: 'shape', alleles: shapes(['Long', 40], ['Short', 22], ['Bushy', 24], ['Sleek', 14]) });
PonyGeneTable.register({ id: 'bodyShape', part: 'body', name: 'Body shape', kind: 'shape', alleles: shapes(['Standard', 50], ['Stocky', 25], ['Slender', 25]) });
PonyGeneTable.register({ id: 'hoofShape', part: 'hooves', name: 'Hoof shape', kind: 'shape', alleles: shapes(['Round', 45], ['Feathered', 20], ['Shod', 15], ['Sleek', 20]) });
PonyGeneTable.register({ id: 'hoofColor', part: 'hooves', name: 'Hoof colour', kind: 'colour', alleles: [
  swatch('slate', 'Slate', null, 40), swatch('black', 'Black', '#26222a', 18), swatch('gold', 'Gold', '#d9a93a', 8), swatch('silver', 'Silver', '#aeb7c4', 12),
  swatch('rose', 'Rose', '#d98aa0', 10), swatch('cream', 'Cream', '#e6d7b4', 12),
  swatch('bronze', 'Bronze', '#b87333', 8), swatch('blue', 'Blue', '#4a74b8', 7), swatch('lilac', 'Lilac', '#a98ad8', 7), swatch('mint', 'Mint', '#7fcfb0', 7),
  swatch('white', 'White', '#f4f4f4', 8), swatch('crimson', 'Crimson', '#b03040', 5)] });
PonyGeneTable.register({ id: 'headShape', part: 'head', name: 'Head and snout', kind: 'shape', alleles: shapes(['Classic', 40], ['Long', 16], ['Button', 16], ['Roman', 14], ['Dished', 14], ['Broad', 12], ['Pointed', 12]) });
/* Hair patterns (added after the first genes, so they sit at the end). The classic one is what every pony had: the variety's own colours in stripes. */
PonyGeneTable.register({ id: 'manePattern', part: 'mane', name: 'Mane pattern', kind: 'shape', alleles: shapes(['Striped', 40], ['Solid', 34], ['Multicolor', 26]) });
PonyGeneTable.register({ id: 'tailPattern', part: 'tail', name: 'Tail pattern', kind: 'shape', alleles: shapes(['Striped', 40], ['Solid', 34], ['Multicolor', 26]) });
/* The inherited SKILL: a power a pony can pass to its foals, whatever its variety. Its alleles are skill powers (shared/ponySkills.js); the last one is "no talent", and it is the RECESSIVE one, so a pony with
 * any power allele has the power. `level`: the pony level it unlocks at (after the variety's and the cutie mark's skills). An older pony reads as having none (`fallback: 'last'`). */
PonyGeneTable.register({ id: 'talent', part: 'skills', name: 'Inherited skill', kind: 'skill', level: 9, fallback: 'last', alleles: [
  { id: 'leaf_blast', name: 'Leaf Blast', weight: 6 }, { id: 'mark_star', name: 'Starburst', weight: 6 }, { id: 'mark_heart', name: 'Heartglow', weight: 6 },
  { id: 'mark_flower', name: 'Pollen Puff', weight: 6 }, { id: 'mark_moon', name: 'Moon Dash', weight: 6 }, { id: 'mark_cloud', name: 'Mist Veil', weight: 6 },
  { id: 'mark_apple', name: 'Apple Bounty', weight: 5 }, { id: 'mark_drop', name: 'Dewdrop', weight: 6 }, { id: 'mark_note', name: 'Lullaby', weight: 6 },
  { id: 'none', name: 'No talent', weight: 90 }] });
/* Colour DEPTH (added last): how rich the coat and the mane are. 0 is the variety's colour as it is; each step is a deeper, stronger version of it (shared/ponyGenes.js `shade`). It is ADDITIVE, not
 * dominant: a pony shows the average of its two alleles. Wild ponies are nearly all natural; depth comes from BREEDING (shared/colorBreeding.js: two blues, two purples or two reds make a deeper one). */
const depths = [['Natural', 70], ['Rich', 18], ['Deep', 8], ['Vivid', 3], ['Intense', 1]].map(([name, weight], i) => ({ id: 'depth' + i, name, weight }));
PonyGeneTable.register({ id: 'coatShade', part: 'body', name: 'Coat depth', kind: 'shade', additive: true, alleles: depths });
PonyGeneTable.register({ id: 'maneShade', part: 'mane', name: 'Mane depth', kind: 'shade', additive: true, alleles: depths });
/* MUTATIONS (added last): one gene whose first allele is "none". The others are the mutations of mutations.js: a DOMINANT one shows at once, a RECESSIVE one only with two copies (a carrier looks ordinary and can pass it on).
 * A few ordinary ponies carry a hidden recessive one (PonyGenes.CARRIER_ODDS) and about 1 foal in 200 gets a new one of its own (PonyGenes.MUTATION_ODDS). */
PonyGeneTable.register({ id: 'mutation', part: 'body', name: 'Mutation', kind: 'mutation', alleles: [{ id: 'none', name: 'None', weight: 1 }].concat(PonyMutationTable.all().map(m => ({ id: m.id, name: m.name, weight: 1, dominant: m.dominant }))) });
})();
