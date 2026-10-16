'use strict';
/* SHARED - BREEDING COLOURS. A foal's coat and mane colours do not just come from one parent or the other: the colours of the two parents act on each other.
 * Every colour belongs to a FAMILY (red, orange, yellow, green, aqua, blue, purple, pink) by its hue, or is a NEUTRAL (white, grey, black, silver, cream, brown) and neutrals do nothing at all.
 *   INTENSIFY  blue x blue, purple x purple, red x red: the foal is a DEEPER version (the coat or mane depth gene goes up a step, up to intense): a light blue and a light blue make a blue.
 *   DOMINATE   one colour wins over another (purple over pink, red over orange, green over yellow, aqua over green, blue over aqua ...): the foal takes the winner's colour as it is.
 *   MIX        any other two chromatic colours blend through the middle of their hues: blue x red = purple, red x yellow = orange, blue x yellow = green, blue x pink = purple.
 *   NOTHING    a neutral with anything, or two yellows, greens, oranges ...: the genes decide as before (a copy of one parent, now and then a surprise).
 * A rule fires for `APPLY` of foals (the rest are plain inheritance, so siblings still differ). It works on the colour genes at birth (stableSystem.js `_foalLook`): the foal gets the palette colour
 * closest to the result, and the depth gene (genes.js, `PonyGenes.shade`) carries how deep it is. `forecast` tells the stall's menu what a pair will do before you breed. */
const ColorBreeding = (() => {
  const HUES = { red: 0, orange: 28, yellow: 52, green: 130, aqua: 185, blue: 228, purple: 278, pink: 330 };
  const INTENSIFY = ['blue', 'purple', 'red'], MAX_DEPTH = 4, APPLY = 0.9, DEEPEN = 0.85;
  const DOMINANT = [['purple', 'pink'], ['red', 'pink'], ['red', 'orange'], ['orange', 'yellow'], ['green', 'yellow'], ['aqua', 'green'], ['blue', 'aqua']];          // [winner, loser]
  const PACK = 64;
  const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const midHue = (a, b) => { const d = ((b - a + 540) % 360) - 180; return (a + d / 2 + 360) % 360; };
  /** { fam, neutral, h, s, l } of a colour (hex). Browns and tans, greys, whites, blacks and silvers are neutral. */
  function classify(hex) {
    const [h, s, l] = PonyGenes.toHsl(hex);
    const neutral = s < 0.14 || l > 0.93 || l < 0.2 || (s < 0.3 && l > 0.8) || (h >= 8 && h <= 48 && l < 0.7 && s < 0.45);
    const fam = h >= 345 || h < 15 ? 'red' : h < 42 ? 'orange' : h < 68 ? 'yellow' : h < 165 ? 'green' : h < 200 ? 'aqua' : h < 262 ? 'blue' : h < 300 ? 'purple' : 'pink';
    return { fam, neutral, h, s, l };
  }
  /** What two families do: { rule: 'intensify' | 'dominant' | 'mix' | 'none', winner } (winner: the family that wins). */
  function ruleFor(a, b) {
    if (a === b) return INTENSIFY.includes(a) ? { rule: 'intensify' } : { rule: 'none' };
    const d = DOMINANT.find(([w, l]) => (w === a && l === b) || (w === b && l === a));
    return d ? { rule: 'dominant', winner: d[0] } : { rule: 'mix' };
  }
  /** A colour's name: "Light blue", "Blue", "Dark red", "Deep blue" (depth). */
  function nameOf(hex, depth = 0) {
    const c = classify(hex), l = c.l, base = c.neutral ? (c.l > 0.9 ? 'White' : c.l < 0.25 ? 'Black' : c.s < 0.14 ? 'Grey' : 'Brown') : c.fam[0].toUpperCase() + c.fam.slice(1);
    const tone = depth >= 3 ? 'Intense ' : depth === 2 ? 'Deep ' : depth === 1 ? 'Rich ' : l > 0.78 && !c.neutral ? 'Light ' : l < 0.4 && !c.neutral ? 'Dark ' : '';
    return tone + (tone && base ? base.toLowerCase() : base);
  }
  const LOCI = { coat: { id: 'bodyColor', shade: 'coatShade', slot: 0, part: 'Coat' }, mane: { id: 'maneColor', shade: 'maneShade', slot: 1, part: 'Mane' }, tail: { id: 'tailColor', shade: null, slot: null, part: 'Tail' } };
  /** The colours (hex) of a variety's palette for a gene, and how many of the last ones are recessive (never a target). */
  function palette(variant, id) {
    const V = variant ? PonyVariants[variant] : null, P = PonyPalette;
    const list = id === 'bodyColor' ? (V || P).coats : (V || P).manes.map(m => m[0]);
    return { list, skip: V ? 0 : P.recessive.count };
  }
  /** One parent's colour at a locus: { idx, hex (unshaded), depth, ...classify }. */
  function shown(look, spec) {
    const ex = PonyGenes.express(look), variant = look[4] | 0, idx = ex[spec.id], hex = palette(variant, spec.id).list[idx] || palette(variant, spec.id).list[0];
    return Object.assign({ idx, hex, depth: spec.shade ? ex[spec.shade] : (ex.maneShade | 0), variant }, classify(hex));
  }
  /** The palette index of `variant` closest in hue (and lightness) to a target, a chromatic colour that is not recessive. */
  function nearest(variant, id, h, l) {
    const { list, skip } = palette(variant, id); let best = -1, bs = Infinity;
    for (let i = 0; i < list.length - skip; i++) { const c = classify(list[i]); if (c.neutral) continue; const d = hueDist(c.h, h) / 180 + 0.5 * Math.abs(c.l - l); if (d < bs) { bs = d; best = i; } }
    return best;
  }
  /** What a pair does at a locus: { rule, target: { idx(into the foal's palette), depth }, a, b, result (hex)} or { rule: 'none' }. */
  function decide(rng, A, B, variant, spec) {
    const a = shown(A, spec), b = shown(B, spec);
    if (a.neutral || b.neutral) return { rule: 'none', a, b };
    const r = ruleFor(a.fam, b.fam), id = spec.id, avgDepth = (a.depth + b.depth) / 2;
    if (r.rule === 'none') return { rule: 'none', a, b };
    const same = p => p.variant === variant ? p.idx : nearest(variant, id, p.h, p.l);                          // (a parent of another variety: the closest colour this one has)
    if (r.rule === 'intensify') {
      const from = rng() < 0.5 ? a : b;
      return { rule: 'intensify', a, b, idx: same(from), depth: Math.min(MAX_DEPTH, Math.round(avgDepth) + (rng() < DEEPEN ? 1 : 0)), hexOf: depth => PonyGenes.shade(from.hex, depth), expected: Math.min(MAX_DEPTH, Math.ceil(avgDepth) + 1), from };
    }
    if (r.rule === 'dominant') { const w = a.fam === r.winner ? a : b; return { rule: 'dominant', a, b, idx: same(w), depth: w.depth, winner: w, hexOf: () => PonyGenes.shade(w.hex, w.depth) }; }
    const h = midHue(a.h, b.h), l = (a.l + b.l) / 2, idx = nearest(variant, id, h, l);
    return { rule: 'mix', a, b, idx, depth: Math.round(avgDepth), hexOf: depth => PonyGenes.shade(PonyGenes.fromHsl([h, (a.s + b.s) / 2, l]), depth), h };
  }
  /** Apply the rules to a foal's inherited genome (the array PonyGenes.inherit made, one packed pair per gene): coat, mane and (when it is its own) tail colour. Changes `genes` in place. */
  function apply(rng, A, B, variant, genes) {
    for (const key of ['coat', 'mane', 'tail']) {
      const spec = LOCI[key];
      if (rng() >= APPLY) continue;
      const d = decide(rng, A, B, variant, key === 'tail' ? Object.assign({}, spec, { shade: null }) : spec);
      if (d.rule === 'none' || !(d.idx >= 0)) continue;
      const i = PonyGenes.at(spec.id), x = Math.floor(genes[i] / PACK) % PACK, y = genes[i] % PACK, keep = [x, y].filter(v => v >= d.idx), other = keep.length ? keep[0] : d.idx;
      genes[i] = rng() < 0.5 ? d.idx * PACK + other : other * PACK + d.idx;
      if (spec.shade) { const j = PonyGenes.at(spec.shade); genes[j] = d.depth * PACK + d.depth; }
    }
    return genes;
  }
  /** What a pair will do, for the stall's menu: [{ part, a: {name, color}, b: {name, color}, rule, text, result: {name, color} | null, chance }]. */
  function forecast(A, B) {
    const out = [], rng = () => 0.999;                                                                           // (a fixed roll: the expected outcome, not a lucky one)
    for (const key of ['coat', 'mane']) {
      const spec = LOCI[key], d = decide(rng, A, B, A[4] | 0, spec), a = d.a, b = d.b, side = p => ({ name: nameOf(p.hex, p.depth), color: PonyGenes.shade(p.hex, p.depth) });
      let result = null, text = 'No blend: the genes decide, so a foal takes after one parent';
      if (d.rule === 'intensify') { const depth = Math.min(MAX_DEPTH, Math.ceil((a.depth + b.depth) / 2) + 1), hex = PonyGenes.shade(d.from.hex, depth); result = { name: nameOf(d.from.hex, depth), color: hex }; text = depth > Math.max(a.depth, b.depth) || depth === MAX_DEPTH ? 'Intensifies: a deeper shade' : 'Intensifies'; }
      else if (d.rule === 'dominant') { result = side(d.winner); text = `${d.winner.fam[0].toUpperCase() + d.winner.fam.slice(1)} dominates`; }
      else if (d.rule === 'mix') { const hex = d.hexOf(d.depth); result = { name: nameOf(hex, 0), color: hex }; text = 'Mixes'; }
      else if (a.neutral || b.neutral) text = 'A neutral colour does nothing: the genes decide';
      out.push({ part: spec.part, a: side(a), b: side(b), rule: d.rule, text, result, chance: Math.round(APPLY * 100) });
    }
    return out;
  }
  /** What a pair does to the RAINBOW TRAIL (the `trail` gene: its colours are the mane colours, so they follow the mane rules above): { a, b (their levels), names, chances: [{ level, name, chance (0..1) }], colors (the expected mane colours spread over the trail) }.
   *  A foal gets one trail allele from each parent and shows the lower half of the two; two strong trails (rainbow or better) intensify to a grander one 3 times in 10; a foal of a rainbow-themed variety always has at least a rainbow. */
  function forecastTrail(A, B, maneColors) {
    const L = PonyGenes.LOCI[PonyGenes.at('trail')], ga = PonyGenes.genomeOf(A)[PonyGenes.at('trail')], gb = PonyGenes.genomeOf(B)[PonyGenes.at('trail')], n = L.alleles.length, lv = p => Math.floor((p[0] + p[1]) / 2);
    const a = lv(ga), b = lv(gb), strong = a >= 2 && b >= 2, chance = new Array(n).fill(0);
    for (const x of ga) for (const y of gb) {
      const p = 0.25, plain = Math.floor((x + y) / 2), up = Math.min(n - 1, Math.max(x, y) + 1);
      if (strong) { chance[plain] += p * (1 - PonyGenes.TRAIL_INTENSIFY); chance[up] += p * PonyGenes.TRAIL_INTENSIFY; } else chance[plain] += p;
    }
    const cols = maneColors || PonyLook.describe(A).gene.maneColors, level = chance.reduce((best, v, i) => (v > chance[best] ? i : best), 0);
    return { a, b, names: L.alleles.map(x => x.name), chances: chance.map((v, i) => ({ level: i, name: L.alleles[i].name, chance: v })).filter(x => x.chance > 0.005), colors: level > 0 ? PonyGenes.trailColors(cols, level) : [] };
  }
  return Object.freeze({ forecastTrail, HUES, INTENSIFY, MAX_DEPTH, APPLY, DEEPEN, DOMINANT, classify, ruleFor, nameOf, decide, apply, forecast });
})();
