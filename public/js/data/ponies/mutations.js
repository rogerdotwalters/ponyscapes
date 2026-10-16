'use strict';
/* DATA - pony MUTATIONS: rare, VIABLE changes that turn up in a foal (about 1 in 200 foals: PonyGenes.MUTATION_ODDS) and are then inherited like any gene (data/ponies/genes.js, the `mutation` gene).
 * A few ordinary ponies (about 1 in 17) also carry a hidden RECESSIVE one from the start: it shows only when both parents pass it on, so two carriers have a foal that shows it one time in four.
 *   dominant: true   shows as soon as a pony has one copy (and so can be seen in the parents)        dominant: false  recessive: hidden unless the pony has two copies
 * What it changes (all optional): coat (a colour), coatMix [colour, share] (the coat moves towards it), mane [colours], eye, hoof, pattern (a mane pattern index: 0 striped, 1 solid, 2 multicolor), maneShape, tailShape,
 * glow (a colour, or 'aura' for the colour of its mane), accessory (an effect a variety may already have). Added after the first genes, so the index of a mutation in a saved pony is its place in this list: only ADD to the end. */
const M = (id, name, dominant, desc, fx = {}) => PonyMutationTable.register({ id, name, dominant, desc, ...fx });
M('shimmer', 'Shimmer', true, 'a soft glow follows it wherever it goes', { glow: 'aura' });
M('gilded', 'Gilded', true, 'its coat has a golden sheen', { coatMix: ['#f0c040', 0.55], glow: '#ffd54f' });
M('starfreckle', 'Star-freckled', true, 'tiny stars twinkle across it', { accessory: 'stars' });
M('silkmane', 'Silk Mane', true, 'a flowing mane and a long, silky tail', { maneShape: 2, tailShape: 0 });
M('sparklehoof', 'Sparkle Hooves', true, 'golden, feathered hooves', { hoof: '#ffd54f', hoofShape: 1 });
M('roseglow', 'Rosy Glow', true, 'a warm rose blush and glow', { coatMix: ['#ff9ec4', 0.35], glow: '#ff9ec4' });
M('frostmane', 'Frost Mane', true, 'a mane of sparkling frost', { mane: ['#e8f6ff', '#9fd8ff', '#ffffff'], accessory: 'frost' });
M('pearl', 'Pearl', false, 'a pearly white coat and a soft pink mane', { coat: '#fdf8f2', mane: ['#ffffff', '#f8d8e8'], eye: '#d8527e' });
M('midnight', 'Midnight', false, 'a coat as dark as the night sky and golden eyes', { coat: '#15151f', mane: ['#6a4bc4', '#a58be8'], eye: '#ffe94d', glow: '#8a6aff' });
M('opalescent', 'Opalescent', false, 'a mane that shimmers in every pastel colour', { mane: ['#ffb3d9', '#b3e5ff', '#d9ffb3', '#e0b3ff'], pattern: 2, coatMix: ['#fff4fa', 0.45], glow: '#ffffff' });
M('sunburst', 'Sunburst', false, 'a mane like a sunrise', { mane: ['#ff9800', '#ffeb3b', '#ff5722'], coatMix: ['#fff0b0', 0.5], accessory: 'rays' });
M('dreamer', 'Dreamer', false, 'a dreamy mane and sprinkles of stardust', { mane: ['#7e57c2', '#4dd0e1', '#f48fb1'], accessory: 'sprinkles', glow: '#cfe0ff' });
M('cloudcoat', 'Cloud Coat', false, 'a coat as white and soft as a cloud', { coat: '#eef6ff', mane: ['#ffffff', '#cfe8ff'] });
