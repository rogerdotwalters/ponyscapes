'use strict';
/* SHARED - the PONY GENE SYSTEM. A pony's genome is one PAIR of alleles for each gene in the table (data/ponies/genes.js): one from each parent. The allele with the lower number is
 * DOMINANT and shows; the other is CARRIED and can come back out in a foal. Genes: coat, mane and tail colour, eye shape and colour, mane, tail, body, hoof and head shapes, and the
 * rule gene "matching tail" (while it shows, the tail colour MUST equal the mane colour).
 *
 * The genome rides at the end of the pony's look, after [coat, mane, mark, name, variant, rarity, traitSeed]: look[7 + gene] = first * 64 + second. The first two slots stay the SHOWN coat and
 * mane colour, so everything that read them before still works; ponies saved before genes existed have no genome and read as a plain one (classic shapes, tail the mane's colour): nothing to migrate. */
const PonyGenes = (() => {
  const LOCI = PonyGeneTable.all(), BASE = 7, PACK = 64, MUTATION = 0.06, LEN = BASE + LOCI.length;
  const TRAILS = new Map(), TRAIL_INTENSIFY = 0.3, MUTATION_ODDS = 1 / 200, CARRIER_ODDS = 1 / 17, WILD_DOMINANT_ODDS = 1 / 250, MUTATIONS = PonyMutationTable.all();   // (a new mutation in a foal; a wild pony carrying a hidden recessive one; a wild pony showing a dominant one)
  /** Mix two colours: `t` of the way from a to b. */
  const blend = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), c = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t); return '#' + [16, 8, 0].map(s => c(s).toString(16).padStart(2, '0')).join(''); };
  const mutationIds = (L, dominant) => L.alleles.map((a, i) => i).filter(i => i > 0 && !!L.alleles[i].dominant === dominant);
  const at = id => LOCI.findIndex(L => L.id === id);
  /** How many alleles a gene has for a variety (a palette gene has one per colour of the variety). */
  const sizeOf = (L, variant) => L.palette ? (variant ? PonyVariants[variant] : PonyPalette)[L.palette].length : L.alleles.length;
  const pair = (look, i) => { const v = look[BASE + i]; return Number.isInteger(v) && v >= 0 ? [Math.floor(v / PACK) % PACK, v % PACK] : null; };
  /** The genome of a look: [[a, b], ...] in table order. A look without one (an older pony) reads as homozygous for what it shows. */
  function genomeOf(look) {
    return LOCI.map((L, i) => {
      const p = pair(look, i); if (p) return p;
      const from = L.slot !== undefined ? L.slot : L.legacyFrom, v = from !== undefined ? look[from] | 0 : L.fallback === 'last' ? L.alleles.length - 1 : 0;
      return [v, v];
    });
  }
  /** Colours of a pony's hair, by pattern: striped is the variety's list as it is, solid its first colour, multicolor four colours (the list, then hues turned round from it). */
  const toHsl = hex => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
  const fromHsl = ([h, s, l]) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(((h % 360) + 360) % 360 / 60)];
    return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); };
  /** A colour at a DEPTH (0 = as it is): each step is richer (more saturated) and darker, so a light blue goes to a real, deep blue. */
  const shade = (hex, d) => { if (!(d > 0) || typeof hex !== 'string') return hex; const [h, s, l] = toHsl(hex); return fromHsl([h, Math.min(1, s + 0.08 * d), Math.max(0.25, l * (1 - 0.13 * d))]); };
  const turn = (hex, deg) => { const [h, s, l] = toHsl(hex); return fromHsl([h + deg, Math.max(s, 0.45), Math.min(0.75, Math.max(0.4, l))]); };
  const patterned = (list, pattern) => pattern === 1 ? [list[0]] : pattern === 2 ? [...list, turn(list[0], 100), turn(list[list.length - 1], -100), turn(list[0], 200)].slice(0, Math.max(4, list.length)) : list;
  const pick = (rng, weights) => { let t = weights.reduce((a, b) => a + b, 0) * rng(); for (let i = 0; i < weights.length; i++) { t -= weights[i]; if (t < 0) return i; } return weights.length - 1; };
  return {
    LOCI, BASE, LEN, at, genomeOf, sizeOf, shade, toHsl, fromHsl, blend, TRAIL_INTENSIFY,
    /** The colours of a rainbow trail of a level (1 short, 2 rainbow, 3 grand): the pony's mane colours spread over 3, 6 or 8 bands (a one-colour mane runs from light to deep). */
    trailColors(mane, level) {
      const key = level + mane.join(), hit = TRAILS.get(key); if (hit) return hit;
      const n = level >= 3 ? 8 : level === 2 ? 6 : 3, src = mane.length > 1 ? mane : [blend(mane[0], '#ffffff', 0.45), mane[0], shade(mane[0], 2)];
      const out = Array.from({ length: n }, (_, k) => { const t = n === 1 ? 0 : k / (n - 1) * (src.length - 1), a = Math.min(src.length - 2, Math.floor(t)); return blend(src[a], src[a + 1], t - a); });
      if (TRAILS.size > 800) TRAILS.clear(); TRAILS.set(key, out); return out;
    }, MUTATION_ODDS, CARRIER_ODDS, MUTATIONS,
    /** The mutation a pair of alleles shows (an index into the gene's alleles, 0 = none): a dominant one at once, a recessive one only when both copies are the same. */
    shownMutation(L, pair) { const dom = pair.filter(k => k > 0 && L.alleles[k] && L.alleles[k].dominant); return dom.length ? Math.min(...dom) : pair[0] === pair[1] ? pair[0] : 0; },
    hasGenome: look => !!look && look.length >= LEN,
    /** A wild pony's genome, appended to `look` (which already holds its shown coat and mane). Each gene's shown allele is rolled by its weights; the carried one is any allele after it. */
    roll(rng, look, variant) {
      const R = variant ? 0 : PonyPalette.recessive.count;                                       // (only the meadow palette has the recessive colours, black and silver)
      for (const L of LOCI) {
        if (L.kind === 'mutation') {                                                              // (most ponies have none; about 1 in 17 carries a hidden recessive one; now and then a wild pony shows a dominant one)
          const r = rng(), dom = mutationIds(L, true), rec = mutationIds(L, false), a = r < WILD_DOMINANT_ODDS ? dom[Math.floor(rng() * dom.length)] : r < WILD_DOMINANT_ODDS + CARRIER_ODDS ? rec[Math.floor(rng() * rec.length)] : 0;
          look.push(rng() < 0.5 ? a * PACK : a); continue;
        }
        if (L.id === 'trail') {                                                                    // (rainbow-themed varieties trail a rainbow; a few plain ponies have a short trail, more carry one hidden)
          const rb = variant && PonyVariants[variant].accessory === 'rainbow', t = () => { const r = rng(); return r < 0.965 ? 0 : r < 0.995 ? 1 : 2; };
          look.push(rb ? 2 * PACK + (rng() < 0.2 ? 3 : 2) : t() * PACK + t()); continue;
        }
        if (L.additive) { const w = L.alleles.map(a => a.weight || 1); look.push(pick(rng, w) * PACK + pick(rng, w)); continue; }                // (a depth: both alleles drawn by their weights)
        const n = sizeOf(L, variant), common = n - (L.palette ? R : 0);                          // the colours that are not recessive
        let shown = L.slot !== undefined ? Math.min(look[L.slot] | 0, n - 1) : L.palette ? Math.floor(rng() * common) : pick(rng, L.alleles ? L.alleles.map(a => a.weight || 1) : new Array(n).fill(1));
        if (L.palette && !variant) {
          const base = PonyPalette.base[L.palette], more = common - base;
          if (L.slot !== undefined && more > 0 && rng() < 0.4) shown = base + Math.floor(rng() * more);   // a meadow pony may carry one of the colours added later
          if (R && rng() < 0.015 * R) shown = n - R + Math.floor(rng() * R);                        // now and then one is black or silver itself: both its alleles recessive
          if (L.slot !== undefined) look[L.slot] = shown;
        }
        const carried = shown + Math.floor(rng() * (n - shown));                                  // (the carried allele is never a lower, dominant one: the recessive colours are last)
        look.push(rng() < 0.5 ? shown * PACK + carried : carried * PACK + shown);
      }
      return look;
    },
    /** Every gene drawn uniformly (any shape, any colour, black and silver as likely as the rest, a talent about as often as none): for the dev spawn, to see the whole range. Sets the genome of `look`. */
    randomize(rng, look) {
      const variant = look[4] | 0;
      look.length = BASE;
      for (const L of LOCI) { const n = sizeOf(L, variant); look.push(Math.floor(rng() * n) * PACK + Math.floor(rng() * n)); }
      return PonyGenes.sync(look);
    },
    /** A foal's genome: one allele of each gene from each parent, now and then a mutation. An allele that does not fit the foal's variety is drawn afresh. */
    inherit(rng, A, B, variant) {
      const ga = genomeOf(A), gb = genomeOf(B);
      return LOCI.map((L, i) => {
        const n = sizeOf(L, variant);
        let x = ga[i][rng() < 0.5 ? 0 : 1], y = gb[i][rng() < 0.5 ? 0 : 1];
        if (L.kind === 'mutation') {                                                              // about 1 foal in 200 gets a brand new mutation in one of its two copies: it is then carried and passed on like any gene
          if (rng() < MUTATION_ODDS) { const k = 1 + Math.floor(rng() * (n - 1)); if (rng() < 0.5) x = k; else y = k; }
          return x * PACK + y;
        }
        if (L.additive) {                                                                         // a depth drifts a step either way
          if (rng() < MUTATION) x = clamp(x + (rng() < 0.5 ? -1 : 1), 0, n - 1);
          if (rng() < MUTATION) y = clamp(y + (rng() < 0.5 ? -1 : 1), 0, n - 1);
          if (L.id === 'trail') {
            const lv = pr => Math.floor((pr[0] + pr[1]) / 2);
            if (lv(ga[i]) >= 2 && lv(gb[i]) >= 2 && rng() < TRAIL_INTENSIFY) x = y = Math.min(n - 1, Math.max(x, y) + 1);       // two strong trails make a grander one
            if (variant && PonyVariants[variant].accessory === 'rainbow') { x = Math.max(x, 2); y = Math.max(y, 2); }           // (a rainbow-themed pony always trails a rainbow)
          }
          return Math.min(x, n - 1) * PACK + Math.min(y, n - 1);
        }
        if (rng() < MUTATION) x = Math.floor(rng() * n);
        if (rng() < MUTATION) y = Math.floor(rng() * n);
        if (x >= n) x = Math.floor(rng() * n);
        if (y >= n) y = Math.floor(rng() * n);
        return x * PACK + y;
      });
    },
    /** The colour of a pony's AURA (the glow of a glowing or magical pony, a night-light pony's light): its mane's first colour, lightened so it shines. A grey mane (white, silver, black) borrows the coat's hue. */
    auraColor(maneHex, coatHex) {
      let [h, s, l] = toHsl(maneHex);
      if (s < 0.2) { const c = toHsl(coatHex); if (c[1] >= 0.2) [h, s] = c; }
      return fromHsl([h, s < 0.2 ? s : Math.max(s, 0.55), clamp(l, 0.58, 0.78)]);
    },
    /** Make the look's coat and mane slots show what its genome says (after building a look from a new genome). */
    sync(look) { const g = genomeOf(look); for (let i = 0; i < LOCI.length; i++) if (LOCI[i].slot !== undefined) look[LOCI[i].slot] = Math.min(g[i][0], g[i][1]); return look; },
    /** The skill power this pony inherited, { ability, name, level }, or null (no talent). */
    talentOf(look) {
      const i = at('talent'), L = LOCI[i], a = L.alleles[PonyGenes.express(look).talent];
      return a && a.id !== 'none' ? { ability: a.id, name: a.name, level: L.level } : null;
    },
    /** The genes as they SHOW: { geneId: allele index }, the rule genes applied (a matched tail takes the mane's colour). */
    express(look) {
      const g = genomeOf(look), v = look[4] | 0, out = {};
      LOCI.forEach((L, i) => { const n = sizeOf(L, v); out[L.id] = (L.slot !== undefined ? look[L.slot] | 0 : L.additive ? (L.floor ? Math.floor : Math.round)((g[i][0] + g[i][1]) / 2) : L.kind === 'mutation' ? PonyGenes.shownMutation(L, g[i]) : Math.min(g[i][0], g[i][1])) % n; });
      for (const L of LOCI) if (L.link && out[L.id] === 0) out[L.link[1]] = out[L.link[0]];
      return out;
    },
    /** What the renderer and the Pony Book need: shapes as numbers (0 is the classic one), colours as css (null: the classic colour), the tail's mane colours, and a `key` that tells two genomes' looks apart. */
    phenotype(look) {
      const ex = PonyGenes.express(look), v = look[4] | 0, V = v ? PonyVariants[v] : null, P = PonyPalette, allele = id => LOCI[at(id)].alleles[ex[id]];
      const manes = (V || P).manes, tailLinked = LOCI.some(L => L.link && ex[L.id] === 0 && L.link[1] === 'tailColor');
      const tailPattern = tailLinked ? ex.manePattern : ex.tailPattern;                           // (a matched tail matches the mane's pattern as well as its colour)
      const traits = [
        { part: 'Eyes', text: `${allele('eyeShape').name}, ${allele('eyeColor').name.toLowerCase()}`, color: allele('eyeColor').color },
        { part: 'Mane', text: `${allele('maneShape').name}, ${allele('manePattern').name.toLowerCase()}` },
        { part: 'Tail', text: `${allele('tailShape').name}, ${LOCI[at('tailPattern')].alleles[tailPattern].name.toLowerCase()}` + (tailLinked ? ', matching the mane' : ', its own colour'), color: tailLinked ? null : manes[ex.tailColor][0] },
        { part: 'Body', text: allele('bodyShape').name },
        { part: 'Hooves', text: `${allele('hoofShape').name}, ${allele('hoofColor').name.toLowerCase()}`, color: allele('hoofColor').color },
        { part: 'Head', text: allele('headShape').name + ' snout' }];
      const R = PonyPalette.recessive, g = genomeOf(look), rec = (i, n) => g[at(i)].filter(a => v === 0 && a >= n - R.count);                // the recessive colours a pony wears or carries
      for (const [id, part] of [['bodyColor', 'Coat'], ['maneColor', 'Mane']]) {
        const n = sizeOf(LOCI[at(id)], v), shownRec = v === 0 && ex[id] >= n - R.count, carried = rec(id, n).filter(a => a !== ex[id]);
        if (shownRec) traits.unshift({ part, text: `${R.names[ex[id] - (n - R.count)]} (recessive)` });
        else if (carried.length) traits.push({ part, text: `carries ${[...new Set(carried)].map(a => R.names[a - (n - R.count)].toLowerCase()).join(' and ')}` });
      }
      for (const [id, part] of [['coatShade', 'Coat'], ['maneShade', 'Mane']]) if (ex[id] > 0) traits.push({ part, text: `${LOCI[at(id)].alleles[ex[id]].name.toLowerCase()} colour (bred deeper)` });
      const mut = ex.mutation ? MUTATIONS[ex.mutation - 1] : null;
      if (ex.trail > 0) traits.push({ part: 'Trail', text: `${LOCI[at('trail')].alleles[ex.trail].name}, in its mane colours` });
      if (mut) traits.push({ part: 'Mutation', text: `${mut.name}: ${mut.desc}` });
      const talent = PonyGenes.talentOf(look); if (talent) traits.push({ part: 'Skill', text: `${talent.name}, inherited (level ${talent.level})` });
      const fx = mut || {}, pat = fx.pattern !== undefined ? fx.pattern : ex.manePattern, tpat = fx.pattern !== undefined ? fx.pattern : tailPattern;       // (a mutation can change the mane's colours and pattern)
      return {
        eyeShape: ex.eyeShape, eyeColor: fx.eye || allele('eyeColor').color, maneShape: fx.maneShape !== undefined ? fx.maneShape : ex.maneShape, tailShape: fx.tailShape !== undefined ? fx.tailShape : ex.tailShape, bodyShape: ex.bodyShape,
        hoofShape: fx.hoofShape !== undefined ? fx.hoofShape : ex.hoofShape, hoofColor: fx.hoof || allele('hoofColor').color, headShape: ex.headShape, tailLinked,
        manePattern: pat, tailPattern: tpat,
        maneColors: fx.mane ? patterned(fx.mane, pat) : patterned(manes[ex.maneColor], pat).map(c => shade(c, ex.maneShade)), tailMane: fx.mane ? patterned(fx.mane, tpat) : patterned(manes[ex.tailColor], tpat).map(c => shade(c, ex.maneShade)),
        coatShade: ex.coatShade, maneShade: ex.maneShade, mutation: mut, trailLevel: ex.trail, traits,
        key: LOCI.filter(L => L.slot === undefined && L.kind !== 'skill').map(L => L.id === 'tailColor' && tailLinked ? 'm' : ex[L.id]).join(',')
      };
    }
  };
})();
