'use strict';
/* SHARED - pony QUALITY: one 0..100 score (and a grade) for how well a pony is BRED, from three things that all come from its family tree (ponyPedigree.js):
 *   diversity   the genetic diversity rating (inbreeding and heterozygosity)                                                                                       (half the score)
 *   alignment   how TRUE to its morph it is: the share of its ancestry (parents count most, then grandparents, ...) that belongs to its own morph or the morphs it is made from. A Plasma pony bred from
 *               Ember and Star lines is 100% aligned (Ember x Star is its recipe); one with a lot of other morphs in its blood is not. Chaos has no recipe, so it is only aligned with other Chaos: the more
 *               morphs in a Chaos pony's blood, the more detailed its traits and the lower its score.                                                                  (the other half)
 *   inbreeding  close inbreeding (over 12.5%) weakens a pony and takes points off; a little linebreeding (under 6.25%) in an already true line adds a few: it fixes the type.
 * A hybrid's POWER is scaled by its quality (x0.70 for a poor one up to x1.30 for a champion). Ponies with no family on record are foundation stock: fully aligned, so only their genes count. */
const PonyQuality = (() => {
  const GRADES = [[85, 'A', 'Champion', '#4caf50'], [70, 'B', 'Fine', '#8bc34a'], [55, 'C', 'Good', '#e0b020'], [40, 'D', 'Plain', '#ff9800'], [0, 'F', 'Poor', '#e53935']];
  const pct = v => Math.round(v * 100);
  /** The morphs a variety counts as itself: its own id and, for a hybrid, the morphs of its recipe (all the way down). Chaos has no recipe: only itself. */
  function closure(id, out = new Set()) {
    if (out.has(id)) return out;
    out.add(id);
    const h = HybridTable.get(id);
    if (h) for (const p of h.parents) closure(p, out);
    return out;
  }
  /** Walk a tree: { share (of the known ancestry that is aligned), known (ancestors with a morph on record), mix: [{ id, name, share }] the morphs in its blood, biggest first }. */
  function ancestry(ped, own) {
    const aligned = closure(own), blood = new Map();
    let known = 0, total = 0, good = 0;
    const walk = (n, g) => {
      if (!n) return;
      const w = Math.pow(0.5, g);
      if (n[5]) { known++; total += w; if (aligned.has(n[5])) good += w; blood.set(n[5], (blood.get(n[5]) || 0) + w); }
      walk(n[3], g + 1); walk(n[4], g + 1);
    };
    if (ped) { walk(ped[3], 1); walk(ped[4], 1); }
    const nameOf = id => (PonyVariantTable.get(id) || { name: id }).name;
    const mix = [...blood].map(([id, w]) => ({ id, name: nameOf(id), share: total ? w / total : 0 })).sort((a, b) => b.share - a.share);
    return { share: total ? good / total : 1, known, mix };
  }
  /** The quality of an animal-like { look, ped }: { score, grade, word, color, alignment (0..1), morph: { id, name, hybrid } , parts, mix, traits, powerScale }. */
  function of(a) {
    const look = a.look, own = look && PonyVariants[look[4] | 0] ? PonyVariants[look[4] | 0].id : 'meadow', ped = Array.isArray(a.ped) ? a.ped : null;
    const rep = Pedigree.reportOf(a), div = rep.rating.score, anc = ancestry(ped, own), F = rep.F, hybrid = HybridTable.has(own), chaos = own === 'chaos';
    let score = 0.5 * div + 0.5 * anc.share * 100;
    const traits = [];
    if (F > 0.125) { const loss = (F - 0.125) * 160; score -= loss; traits.push(`Weakened by close inbreeding (${Pedigree.pct(F)}%)`); }
    else if (F > 0 && F <= 0.0625 && anc.share >= 0.8) { score += 4 * (F / 0.0625); traits.push('A well-bred line: a little linebreeding has fixed its type'); }
    if (chaos) { score *= 0.9; traits.push('Chaos is unstable by nature'); }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const gr = GRADES.find(r => score >= r[0]), morphName = (PonyVariantTable.get(own) || { name: own }).name;
    if (hybrid) traits.unshift(`${pct(anc.share)}% true to its ${morphName} morph`);
    else if (anc.known) traits.unshift(`${pct(anc.share)}% true to its ${morphName} line`);
    const others = anc.mix.filter(m => !closure(own).has(m.id) && m.share >= 0.08).slice(0, 3);
    for (const m of others) traits.push(chaos ? `${m.name} blood (${pct(m.share)}%)` : `${pct(m.share)}% ${m.name} blood`);
    if (chaos && others.length) traits.push(`Its traits come from ${others.length} morph${others.length === 1 ? '' : 's'}: the more there are, the more it varies and the lower its score`);
    return { score, grade: gr[1], word: gr[2], color: gr[3], alignment: anc.share, morph: { id: own, name: morphName, hybrid }, parts: { diversity: div, alignment: Math.round(anc.share * 100), inbreeding: Pedigree.pct(F) }, mix: anc.mix, traits, powerScale: hybrid ? 0.7 + 0.6 * score / 100 : 1 };
  }
  /** The small version that rides in every snapshot, merged into the pedigree summary and cached on the animal. */
  function summaryOf(a) {
    const s = Pedigree.summaryOf(a);
    if (s.q && a._qFor === a.ped && a._qLook === a.look) return s;
    const q = of(a);
    s.q = { s: q.score, g: q.grade, w: q.word, c: q.color, al: Math.round(q.alignment * 100), m: q.morph.name, h: q.morph.hybrid ? 1 : 0, t: q.traits, x: Math.round(q.powerScale * 100) / 100 };
    a._qFor = a.ped; a._qLook = a.look;
    return s;
  }
  return Object.freeze({ GRADES, closure, ancestry, of, summaryOf });
})();
