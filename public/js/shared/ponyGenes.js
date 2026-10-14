'use strict';
/* SHARED - the PONY GENE SYSTEM. A pony's genome is one PAIR of alleles for each gene in the table (data/ponies/genes.js): one from each parent. The allele with the lower number is
 * DOMINANT and shows; the other is CARRIED and can come back out in a foal. Genes: coat, mane and tail colour, eye shape and colour, mane, tail, body, hoof and head shapes, and the
 * rule gene "matching tail" (while it shows, the tail colour MUST equal the mane colour).
 *
 * The genome rides at the end of the pony's look, after [coat, mane, mark, name, variant, rarity, traitSeed]: look[7 + gene] = first * 64 + second. The first two slots stay the SHOWN coat and
 * mane colour, so everything that read them before still works; ponies saved before genes existed have no genome and read as a plain one (classic shapes, tail the mane's colour): nothing to migrate. */
const PonyGenes = (() => {
  const LOCI = PonyGeneTable.all(), BASE = 7, PACK = 64, MUTATION = 0.06, LEN = BASE + LOCI.length;
  const at = id => LOCI.findIndex(L => L.id === id);
  /** How many alleles a gene has for a variety (a palette gene has one per colour of the variety). */
  const sizeOf = (L, variant) => L.palette ? (variant ? PonyVariants[variant] : PonyPalette)[L.palette].length : L.alleles.length;
  const pair = (look, i) => { const v = look[BASE + i]; return Number.isInteger(v) && v >= 0 ? [Math.floor(v / PACK) % PACK, v % PACK] : null; };
  /** The genome of a look: [[a, b], ...] in table order. A look without one (an older pony) reads as homozygous for what it shows. */
  function genomeOf(look) {
    return LOCI.map((L, i) => {
      const p = pair(look, i); if (p) return p;
      const from = L.slot !== undefined ? L.slot : L.legacyFrom, v = from !== undefined ? look[from] | 0 : 0;
      return [v, v];
    });
  }
  const pick = (rng, weights) => { let t = weights.reduce((a, b) => a + b, 0) * rng(); for (let i = 0; i < weights.length; i++) { t -= weights[i]; if (t < 0) return i; } return weights.length - 1; };
  return {
    LOCI, BASE, LEN, at, genomeOf, sizeOf,
    hasGenome: look => !!look && look.length >= LEN,
    /** A wild pony's genome, appended to `look` (which already holds its shown coat and mane). Each gene's shown allele is rolled by its weights; the carried one is any allele after it. */
    roll(rng, look, variant) {
      for (const L of LOCI) {
        const n = sizeOf(L, variant);
        const shown = L.slot !== undefined ? Math.min(look[L.slot] | 0, n - 1) : pick(rng, L.alleles ? L.alleles.map(a => a.weight || 1) : new Array(n).fill(1));
        const carried = shown + Math.floor(rng() * (n - shown));
        look.push(rng() < 0.5 ? shown * PACK + carried : carried * PACK + shown);
      }
      return look;
    },
    /** A foal's genome: one allele of each gene from each parent, now and then a mutation. An allele that does not fit the foal's variety is drawn afresh. */
    inherit(rng, A, B, variant) {
      const ga = genomeOf(A), gb = genomeOf(B);
      return LOCI.map((L, i) => {
        const n = sizeOf(L, variant);
        let x = ga[i][rng() < 0.5 ? 0 : 1], y = gb[i][rng() < 0.5 ? 0 : 1];
        if (rng() < MUTATION) x = Math.floor(rng() * n);
        if (rng() < MUTATION) y = Math.floor(rng() * n);
        if (x >= n) x = Math.floor(rng() * n);
        if (y >= n) y = Math.floor(rng() * n);
        return x * PACK + y;
      });
    },
    /** Make the look's coat and mane slots show what its genome says (after building a look from a new genome). */
    sync(look) { const g = genomeOf(look); for (let i = 0; i < LOCI.length; i++) if (LOCI[i].slot !== undefined) look[LOCI[i].slot] = Math.min(g[i][0], g[i][1]); return look; },
    /** The genes as they SHOW: { geneId: allele index }, the rule genes applied (a matched tail takes the mane's colour). */
    express(look) {
      const g = genomeOf(look), v = look[4] | 0, out = {};
      LOCI.forEach((L, i) => { const n = sizeOf(L, v); out[L.id] = (L.slot !== undefined ? look[L.slot] | 0 : Math.min(g[i][0], g[i][1])) % n; });
      for (const L of LOCI) if (L.link && out[L.id] === 0) out[L.link[1]] = out[L.link[0]];
      return out;
    },
    /** What the renderer and the Pony Book need: shapes as numbers (0 is the classic one), colours as css (null: the classic colour), the tail's mane colours, and a `key` that tells two genomes' looks apart. */
    phenotype(look) {
      const ex = PonyGenes.express(look), v = look[4] | 0, V = v ? PonyVariants[v] : null, P = PonyPalette, allele = id => LOCI[at(id)].alleles[ex[id]];
      const manes = (V || P).manes, tailLinked = LOCI.some(L => L.link && ex[L.id] === 0 && L.link[1] === 'tailColor');
      const traits = [
        { part: 'Eyes', text: `${allele('eyeShape').name}, ${allele('eyeColor').name.toLowerCase()}`, color: allele('eyeColor').color },
        { part: 'Mane', text: allele('maneShape').name },
        { part: 'Tail', text: allele('tailShape').name + (tailLinked ? ', matching the mane' : ', its own colour'), color: tailLinked ? null : manes[ex.tailColor][0] },
        { part: 'Body', text: allele('bodyShape').name },
        { part: 'Hooves', text: `${allele('hoofShape').name}, ${allele('hoofColor').name.toLowerCase()}`, color: allele('hoofColor').color },
        { part: 'Head', text: allele('headShape').name + ' snout' }];
      return {
        eyeShape: ex.eyeShape, eyeColor: allele('eyeColor').color, maneShape: ex.maneShape, tailShape: ex.tailShape, bodyShape: ex.bodyShape,
        hoofShape: ex.hoofShape, hoofColor: allele('hoofColor').color, headShape: ex.headShape, tailLinked, tailMane: manes[ex.tailColor], traits,
        key: LOCI.filter(L => L.slot === undefined).map(L => L.id === 'tailColor' && tailLinked ? 'm' : ex[L.id]).join('')
      };
    }
  };
})();
