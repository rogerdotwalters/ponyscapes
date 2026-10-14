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
  swatch('amber', 'Amber', '#d9922a', 9), swatch('violet', 'Violet', '#8a52c8', 8), swatch('rose', 'Rose', '#d8527e', 6), swatch('teal', 'Teal', '#2aa6a0', 6)] });
PonyGeneTable.register({ id: 'maneShape', part: 'mane', name: 'Mane shape', kind: 'shape', alleles: shapes(['Wavy', 40], ['Cropped', 24], ['Flowing', 22], ['Spiky', 14]) });
PonyGeneTable.register({ id: 'tailShape', part: 'tail', name: 'Tail shape', kind: 'shape', alleles: shapes(['Long', 40], ['Short', 22], ['Bushy', 24], ['Sleek', 14]) });
PonyGeneTable.register({ id: 'bodyShape', part: 'body', name: 'Body shape', kind: 'shape', alleles: shapes(['Standard', 50], ['Stocky', 25], ['Slender', 25]) });
PonyGeneTable.register({ id: 'hoofShape', part: 'hooves', name: 'Hoof shape', kind: 'shape', alleles: shapes(['Round', 45], ['Feathered', 20], ['Shod', 15], ['Sleek', 20]) });
PonyGeneTable.register({ id: 'hoofColor', part: 'hooves', name: 'Hoof colour', kind: 'colour', alleles: [
  swatch('slate', 'Slate', null, 40), swatch('black', 'Black', '#26222a', 18), swatch('gold', 'Gold', '#d9a93a', 8), swatch('silver', 'Silver', '#aeb7c4', 12),
  swatch('rose', 'Rose', '#d98aa0', 10), swatch('cream', 'Cream', '#e6d7b4', 12)] });
PonyGeneTable.register({ id: 'headShape', part: 'head', name: 'Head and snout', kind: 'shape', alleles: shapes(['Classic', 50], ['Long', 25], ['Button', 25]) });
})();
