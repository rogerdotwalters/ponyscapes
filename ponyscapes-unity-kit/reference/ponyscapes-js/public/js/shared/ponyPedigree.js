'use strict';
/* SHARED - PEDIGREES and GENETIC DIVERSITY. Every pony born in a stall remembers its family: `a.ped` is a small tree [uid, name, sex, sire, dam] (sire and dam are trees of the same shape, or
 * null) kept back FIVE generations. A pony with no tree (caught wild, bought, or saved before pedigrees) is a FOUNDER: unrelated to every other pony. Beyond five generations ancestors are unknown,
 * which is how a real studbook works too.
 *
 * Behind the rating is real population genetics, not a made-up number:
 *   - inbreeding coefficient F of a pony = the KINSHIP of its parents (Malecot): the chance the two alleles at a locus are copies of one ancestral allele. Worked out over the whole pedigree
 *     with the tabular recursion phi(x, y) = (phi(sire x, y) + phi(dam x, y)) / 2, phi(x, x) = (1 + F x) / 2. Full siblings or parent x offspring give 25%, half siblings 12.5%, first cousins 6.25%.
 *   - the coefficient of relationship R = 2 phi, the common ancestors behind it, and each founder's gene share (effective number of founders for a herd)
 *   - heterozygosity: how many of the genome's loci hold two different alleles (observed), and what a mating is expected to give (every pair of alleles the parents can pass on)
 *   - hidden recessives both parents carry (a quarter of their foals show it), and for a herd: mean kinship, effective population size, allele richness, expected heterozygosity, F_IS.
 * The outcrossing rating folds the pedigree (65%) and the genes (35%) into one 0..100 score and a grade A..F. Nothing here changes how a pony plays; it only tells you what the breeding is doing. */
const Pedigree = (() => {
  const DEPTH = 5, MAX_NODES = 80, U = 0, N = 1, X = 2, S = 3, D = 4, V = 5;                       // (V: the variety id of the pony, an optional sixth part of a node: older trees have none)
  const HET_REF = 0.7;                                                                       // (about the heterozygosity of two unrelated wild ponies: the score's 100% mark)
  const GRADES = [[85, 'A', 'Excellent', '#4caf50'], [70, 'B', 'Good', '#8bc34a'], [55, 'C', 'Fair', '#e0b020'], [40, 'D', 'Poor', '#ff9800'], [0, 'F', 'Risky', '#e53935']];
  const BANDS = [[0.25, 'Extreme inbreeding', 'full siblings or parent and offspring'], [0.125, 'Close inbreeding', 'half siblings'], [0.0625, 'Linebreeding', 'first cousins'],
    [0.03125, 'Mild linebreeding', 'cousins once removed'], [1e-9, 'Distant relations', 'a shared ancestor far back']];
  const pct = (v, d = 2) => Math.round(v * 100 * Math.pow(10, d)) / Math.pow(10, d);

  /* ---------------------------------------------- the trees ---------------------------------------------- */
  const base36 = (v, n) => Math.floor(v * Math.pow(36, n)).toString(36).padStart(n, '0');
  const newUid = (rng = Math.random) => Date.now().toString(36).slice(-4) + base36(Math.random(), 4) + base36(rng(), 2);   // (time + chance: unique even when a world is reloaded and its seeded random numbers start again)
  const node = (u, n, x, s, d, v) => (v ? [u, n, x, s, d, v] : [u, n, x, s, d]);
  const varietyOf = look => (look && PonyVariants[look[4] | 0] ? PonyVariants[look[4] | 0].id : null);
  const founder = (name, sex, rng, variety) => node(newUid(rng), String(name || 'Pony').slice(0, 24), sex === 'f' ? 'f' : 'm', null, null, variety);
  /** The tree of an animal; makes it a founder (and keeps that) when it has none. */
  function ensure(a, rng) {
    if (!Array.isArray(a.ped)) a.ped = founder(a.look ? PonyLook.describe(a.look).name : '', a.look ? PonyLook.sexOf(a.look) : 'm', rng, varietyOf(a.look));
    return a.ped;
  }
  /** A node with `d` generations of ancestors kept above it. */
  function trim(node, d) { return node ? as5(node, d > 0 ? trim(node[S], d - 1) : null, d > 0 ? trim(node[D], d - 1) : null) : null; }
  const as5 = (n, s, d) => node(n[U], n[N], n[X], s, d, n[V]);
  /** The tree of a foal of two animals (the sire is the stallion of the pair). */
  function foalNode(rng, a, b, name, sex, variety) {
    const ma = a.look ? PonyLook.sexOf(a.look) : 'm', sire = ma === 'm' ? a : b, dam = sire === a ? b : a;
    return node(newUid(rng), String(name || 'Foal').slice(0, 24), sex === 'f' ? 'f' : 'm', trim(ensure(sire, rng), DEPTH - 1), trim(ensure(dam, rng), DEPTH - 1), variety);
  }
  /** Check a tree that came from a save or a message: shape, lengths and size (null when it is not one). */
  function clean(node, budget = { n: MAX_NODES }, depth = 0) {
    if (node === null || node === undefined) return null;
    if (!Array.isArray(node) || (node.length !== 5 && node.length !== 6) || depth > DEPTH + 1 || --budget.n < 0) return undefined;
    const [u, n, x, s, d, v] = node;
    if (typeof u !== 'string' || !/^[a-z0-9]{4,12}$/.test(u) || typeof n !== 'string') return undefined;
    const sire = clean(s, budget, depth + 1), dam = clean(d, budget, depth + 1);
    if (sire === undefined || dam === undefined) return undefined;
    return node2(u, n.replace(/[^A-Za-z0-9 '\-]/g, '').slice(0, 24) || 'Pony', x === 'f' ? 'f' : 'm', sire, dam, typeof v === 'string' && /^[a-z]{2,16}$/.test(v) ? v : null);
  }
  const node2 = node;
  /** A tree from a save: the cleaned tree, or null for none/bad. */
  const fromSave = raw => { const c = clean(raw); return c ? c : null; };

  /* ---------------------------------------------- the graph, kinship, inbreeding ---------------------------------------------- */
  /** All the ancestors of some trees as one graph: uid -> { u, n, x, s, d, gen } (a pony met twice keeps the version that knows its parents; gen: 0 for a founder, else 1 + the older parent's). */
  function graph(...roots) {
    const g = new Map();
    const walk = node => {
      if (!node) return;
      const known = g.get(node[U]), has = !!(node[S] || node[D]);
      if (!known || (has && !known.s && !known.d)) g.set(node[U], { u: node[U], n: node[N], x: node[X], v: node[V] || null, s: node[S] ? node[S][U] : null, d: node[D] ? node[D][U] : null, gen: -1 });
      walk(node[S]); walk(node[D]);
    };
    for (const r of roots) walk(r);
    const gen = u => { const n = g.get(u); if (!n) return -1; if (n.gen >= 0) return n.gen; n.gen = 0; n.gen = (n.s || n.d) ? 1 + Math.max(gen(n.s), gen(n.d)) : 0; return n.gen; };
    for (const u of g.keys()) gen(u);
    g.kin = new Map();
    return g;
  }
  /** Kinship of two ponies of the graph (the chance a random allele of each is a copy of one ancestral allele). */
  function kinship(g, a, b) {
    if (!a || !b) return 0;
    const key = a < b ? a + '|' + b : b + '|' + a, hit = g.kin.get(key);
    if (hit !== undefined) return hit;
    const x = g.get(a), y = g.get(b);
    let v = 0;
    if (x && y) {
      if (a === b) v = (1 + kinship(g, x.s, x.d)) / 2;
      else if (x.gen >= y.gen && (x.s || x.d)) v = (kinship(g, x.s, b) + kinship(g, x.d, b)) / 2;
      else if (y.s || y.d) v = (kinship(g, a, y.s) + kinship(g, a, y.d)) / 2;
    }
    g.kin.set(key, v); return v;
  }
  const inbreeding = (g, u) => { const n = g.get(u); return n ? kinship(g, n.s, n.d) : 0; };
  /** F of an animal (its parents' kinship), from its tree alone. */
  function coefficient(ped) { if (!ped) return 0; const g = graph(ped); return inbreeding(g, ped[U]); }
  /** Every ancestor of u (with how many generations up, the nearest way): Map uid -> generations. */
  function ancestors(g, u) {
    const out = new Map(), q = [[u, 0]];
    while (q.length) { const [id, d] = q.shift(), n = g.get(id); if (!n) continue; for (const p of [n.s, n.d]) if (p && (!out.has(p) || out.get(p) > d + 1)) { out.set(p, d + 1); q.push([p, d + 1]); } }
    return out;
  }
  /** The ancestors two ponies share (the ones that cause the inbreeding): [{ name, sex, up: [generations from a, from b] }], the nearest first; an ancestor of another shared one is left out. */
  function commonAncestors(g, a, b) {
    const A = ancestors(g, a), B = ancestors(g, b);
    for (const [u, base] of [[a, A], [b, B]]) if (!base.has(u)) base.set(u, 0);
    const shared = [...A.keys()].filter(u => B.has(u)), behind = new Set();
    for (const u of shared) for (const p of ancestors(g, u).keys()) behind.add(p);
    return shared.filter(u => !behind.has(u)).map(u => ({ uid: u, name: g.get(u).n, sex: g.get(u).x, up: [A.get(u), B.get(u)] })).sort((p, q) => (p.up[0] + p.up[1]) - (q.up[0] + q.up[1])).slice(0, 8);
  }
  /** Gene share of each founder in a pony, [uid, share] (the chance a random gene of the pony came from that founder). */
  function founderShares(g, u, memo = new Map()) {
    if (memo.has(u)) return memo.get(u);
    const n = g.get(u), out = new Map();
    if (!n || (!n.s && !n.d)) out.set(u, 1);
    else for (const p of [n.s, n.d]) { if (!p) { out.set('?' + u, (out.get('?' + u) || 0) + 0.5); continue; } for (const [f, v] of founderShares(g, p, memo)) out.set(f, (out.get(f) || 0) + v / 2); }
    memo.set(u, out); return out;
  }
  const ancestorCount = ped => { let n = 0; const walk = x => { if (x) { n++; walk(x[S]); walk(x[D]); } }; walk(ped && ped[S]); walk(ped && ped[D]); return n; };
  const generations = ped => { if (!ped || (!ped[S] && !ped[D])) return 0; return 1 + Math.max(generations(ped[S]), generations(ped[D])); };

  /* ---------------------------------------------- the genes ---------------------------------------------- */
  /** The pairs of alleles of a look, as { locus, name, a, b, het, shown, hidden, ... } rows, with a name (and colour) for each allele. */
  function alleleLabel(L, k, variant) {
    if (L.palette) {
      const set = variant ? PonyVariants[variant] : PonyPalette, n = set[L.palette].length, R = variant ? null : PonyPalette.recessive, rec = R && k >= n - R.count ? R.names[k - (n - R.count)] : null;
      const hex = L.palette === 'coats' ? set.coats[k] : (set.manes[k] || [])[0];
      return { name: rec || 'Shade ' + (k + 1), color: hex || null, recessive: !!rec };
    }
    const al = L.alleles[k] || { name: '?' };
    return { name: al.name, color: al.color || null, recessive: false };
  }
  function genomeRows(look) {
    const g = PonyGenes.genomeOf(look), v = look[4] | 0;
    return PonyGenes.LOCI.map((L, i) => {
      const [x, y] = g[i];
      let lo = Math.min(x, y), hi = Math.max(x, y);
      if (L.kind === 'mutation') { const s = PonyGenes.shownMutation(L, [x, y]); lo = s; hi = x === s ? y : x; }       // (a dominant mutation shows though it is the higher number)
      return { id: L.id, gene: L.name, het: x !== y, shown: alleleLabel(L, lo, v), hidden: x !== y ? alleleLabel(L, hi, v) : null, alleles: [lo, hi] };
    });
  }
  /** Observed heterozygosity: the share of loci holding two different alleles. */
  const heterozygosity = look => { const g = PonyGenes.genomeOf(look); return g.filter(([x, y]) => x !== y).length / g.length; };
  /** What a mating is expected to give, locus by locus: heterozygosity of the foal and the loci where the foal may show something both parents hide. */
  function matingGenes(lookA, lookB) {
    const ga = PonyGenes.genomeOf(lookA), gb = PonyGenes.genomeOf(lookB), v = lookA[4] | 0, rows = [], shared = [];
    let het = 0;
    PonyGenes.LOCI.forEach((L, i) => {
      const pa = new Map(), pb = new Map();
      for (const k of ga[i]) pa.set(k, (pa.get(k) || 0) + 0.5);
      for (const k of gb[i]) pb.set(k, (pb.get(k) || 0) + 0.5);
      let same = 0;
      for (const [k, p] of pa) {
        const q = pb.get(k) || 0; same += p * q;
        const hiddenA = ga[i][0] !== ga[i][1] && k === Math.max(...ga[i]), hiddenB = gb[i][0] !== gb[i][1] && k === Math.max(...gb[i]);
        if (q && p * q >= 0.25 && (hiddenA || hiddenB) && k > 0 && L.kind !== 'switch' && !L.additive && !(L.kind === 'mutation' && L.alleles[k].dominant)) shared.push({ gene: L.name, allele: alleleLabel(L, k, v), chance: p * q });
      }
      het += 1 - same;
    });
    return { het: het / PonyGenes.LOCI.length, shared };
  }

  /* ---------------------------------------------- ratings ---------------------------------------------- */
  const gradeOf = score => GRADES.find(r => score >= r[0]);
  function bandOf(F) {
    if (F <= 1e-9) return { id: 'outcross', name: 'Outcross', note: 'no common ancestor in the pedigree' };
    const b = BANDS.find(x => F >= x[0]) || BANDS[BANDS.length - 1];
    return { id: b[1].toLowerCase().replace(/ /g, '-'), name: b[1], note: b[2] };
  }
  /** Fold the pedigree (F) and the genes (heterozygosity, hidden recessives shared) into one score, a grade and a name. */
  function rating(F, het, sharedCount = 0) {
    const ped = 100 * (1 - Math.min(1, F / 0.25)), gen = Math.min(100, het / HET_REF * 100), score = Math.max(0, Math.min(100, Math.round(0.65 * ped + 0.35 * gen - 4 * sharedCount)));
    const gr = gradeOf(score);
    return { score, grade: gr[1], word: gr[2], color: gr[3], band: bandOf(F) };
  }
  /** One animal's own report: inbreeding, heterozygosity, parents, ancestry and rating. */
  function reportOf(a) {
    const ped = Array.isArray(a.ped) ? a.ped : null, F = coefficient(ped), het = a.look ? heterozygosity(a.look) : 0, r = rating(F, het);
    return { F, het, rating: r, founder: !ped || (!ped[S] && !ped[D]), sire: ped && ped[S] ? ped[S][N] : null, dam: ped && ped[D] ? ped[D][N] : null, gens: generations(ped), known: ancestorCount(ped) };
  }
  /** The small version that rides in every snapshot (cached on the animal: a pony's tree and genes never change). */
  function summaryOf(a) {
    if (a._sum && a._sumFor === a.ped && a._sumLook === a.look) return a._sum;
    const r = reportOf(a);
    a._sum = { f: pct(r.F, 2), h: pct(r.het, 0), s: r.rating.score, g: r.rating.grade, w: r.rating.word, c: r.rating.color, sire: r.sire, dam: r.dam, gens: r.gens }; a._sumFor = a.ped; a._sumLook = a.look;
    return a._sum;
  }
  /** What a mating would give: predicted inbreeding of the foal, how closely the parents are related, the shared ancestors, the genes and the rating. A and B are animals. */
  function pairReport(A, B, rng) {
    const pa = ensure(A, rng), pb = ensure(B, rng), g = graph(pa, pb), F = kinship(g, pa[U], pb[U]);
    const genes = matingGenes(A.look || [0, 0, 0, 0, 0, 0, 0], B.look || A.look || [0, 0, 0, 0, 0, 0, 0]), r = rating(F, genes.het, genes.shared.length);
    return { F, R: Math.min(1, 2 * F), het: genes.het, shared: genes.shared, common: commonAncestors(g, pa[U], pb[U]), rating: r, depth: Math.min(generations(pa), generations(pb)),
      tooClose: F >= 0.125 };
  }
  /** A herd's report (animals with trees and looks): mean kinship, effective size, effective founders, allele richness, expected/observed heterozygosity, F_IS and a rating. */
  function herdReport(list, rng) {
    const peds = list.map(a => ensure(a, rng)), n = peds.length;
    if (!n) return null;
    const g = graph(...peds), ids = peds.map(p => p[U]);
    let mk = 0; for (const x of ids) for (const y of ids) mk += kinship(g, x, y); mk /= n * n;
    const memo = new Map(), share = new Map(); for (const u of ids) for (const [f, v] of founderShares(g, u, memo)) share.set(f, (share.get(f) || 0) + v / n);
    const fe = 1 / [...share.values()].reduce((s, v) => s + v * v, 0), founders = [...share.keys()].filter(k => k[0] !== '?').length;
    const gen = list.map(a => PonyGenes.genomeOf(a.look || [0, 0, 0, 0, 0, 0, 0]));
    let he = 0, ho = 0, rich = 0;
    PonyGenes.LOCI.forEach((L, i) => {
      const count = new Map(); let hets = 0;
      for (const gm of gen) { for (const k of gm[i]) count.set(k, (count.get(k) || 0) + 1); if (gm[i][0] !== gm[i][1]) hets++; }
      he += 1 - [...count.values()].reduce((s, c) => s + (c / (2 * n)) * (c / (2 * n)), 0); ho += hets / n; rich += count.size;
    });
    const L = PonyGenes.LOCI.length; he /= L; ho /= L; rich /= L;
    const meanF = ids.reduce((s, u) => s + inbreeding(g, u), 0) / n, score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.min(1, mk / 0.25)) * 0.7 + 30 * Math.min(1, ho / HET_REF))));
    const gr = gradeOf(score);
    return { n, meanKinship: mk, ne: 1 / (2 * mk), founders, effectiveFounders: fe, richness: rich, he, ho, fis: he > 0 ? 1 - ho / he : 0, meanF, score, grade: gr[1], word: gr[2], color: gr[3] };
  }
  /** Is `uid` in the tree? How many generations up (1 = parent), or 0. */
  function depthOfAncestor(ped, uid) {
    const walk = (x, d) => { if (!x) return 0; if (x[U] === uid && d > 0) return d; const s = walk(x[S], d + 1); return s || walk(x[D], d + 1); };
    return walk(ped, 0);
  }

  return Object.freeze({ DEPTH, U, N, X, S, D, HET_REF, GRADES, BANDS, newUid, founder, ensure, trim, foalNode, clean, fromSave, graph, kinship, inbreeding, coefficient, ancestors, commonAncestors, founderShares,
    generations, ancestorCount, genomeRows, heterozygosity, matingGenes, bandOf, rating, reportOf, summaryOf, pairReport, herdReport, depthOfAncestor, pct });
})();
