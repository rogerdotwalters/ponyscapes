'use strict';
/* SHARED - CROSSBREEDING. What two ponies can make besides a copy of a parent (data/ponies/hybrids.js, rules for the KIND of pony below):
 *   - a HYBRID: when the parents' varieties match a recipe (Ember x Star: Plasma) each foal has the recipe's `chance` of being the new variety, and a hybrid is its own kind of pony
 *     (like the moon and sky ponies it is never wild). Hybrids cross with each other too (Plasma x Nebula: Supernova), and any two different hybrids with no recipe may make Chaos.
 *   - a new KIND: a pegasus and a unicorn may have an alicorn, an alicorn with either of them sometimes does, and now and then a plain pony has an earth pony, an earth pony a pegasus or unicorn.
 * The roll happens when the foal is born (stableSystem.js); the stall's menu shows what could come (`possible`) before you press Breed. */
const Hybrids = {
  /** [kindA, kindB (any order)] -> kind, with a chance per foal. */
  KIND_CROSSES: Object.freeze([
    { a: 'pony_pegasus', b: 'pony_unicorn', kind: 'pony_alicorn', chance: 0.22, name: 'Alicorn' },
    { a: 'pony_alicorn', b: 'pony_pegasus', kind: 'pony_alicorn', chance: 0.4, name: 'Alicorn' },
    { a: 'pony_alicorn', b: 'pony_unicorn', kind: 'pony_alicorn', chance: 0.4, name: 'Alicorn' }]),
  /** The chance a foal is a step up in kind (plain -> earth -> pegasus or unicorn) when no cross applies. */
  STEP_UP: 0.05,
  isHybrid: id => HybridTable.has(id) && !HybridTable.get(id).legend,                       // (a legendary pony is never bred: data/ponies/legends.js)
  isLegend: id => !!(HybridTable.get(id) || {}).legend,
  /** The legendary ponies' ids, in table order. */
  legends: () => HybridTable.all().filter(h => h.legend).map(h => h.id),
  /** The look of a legendary pony: its one coat, mane, mark and name, always legendary, classic genes (a rainbow trail for the ones that have one). Every legend is the same pony wherever it is drawn. */
  legendLook(id) {
    const v = Hybrids.variantIndex(id), V = PonyVariants[v];
    if (!V || !V.legend) return null;
    const look = [0, 0, 0, 0, v, RarityOrder.indexOf('legendary'), V.seed | 0];
    for (let i = 0; i < PonyGenes.LOCI.length; i++) look.push(0);
    if (V.trail) look[PonyGenes.BASE + PonyGenes.at('trail')] = V.trail * 64 + V.trail;
    return look;
  },
  /** The recipes for two variety ids (any order). */
  recipes(a, b) { return HybridTable.all().filter(h => h.parents.length === 2 && ((h.parents[0] === a && h.parents[1] === b) || (h.parents[0] === b && h.parents[1] === a))); },
  /** Everything two varieties could make: [{ id, name, chance, rarity }] (the recipes, or Chaos for two different hybrids with none). */
  possible(a, b) {
    const out = Hybrids.recipes(a, b);
    if (!out.length && a !== b && Hybrids.isHybrid(a) && Hybrids.isHybrid(b)) { const c = HybridTable.get('chaos'); if (c) out.push(c); }
    return out.map(h => ({ id: h.id, name: h.name, chance: h.chance, rarity: h.rarity }));
  },
  /** Roll a hybrid for a foal of two varieties: the hybrid's entry, or null. */
  cross(rng, a, b) {
    for (const h of Hybrids.possible(a, b)) if (rng() < h.chance) return HybridTable.get(h.id);
    return null;
  },
  /** The variant index (into PonyVariants) of a variety id. */
  variantIndex: id => PonyVariants.findIndex(v => v.id === id),
  /** What the kinds of two parents could make: [{ kind, name, chance }] besides the usual (a free parent's kind). */
  kindOptions(ka, kb) {
    const out = Hybrids.KIND_CROSSES.filter(c => (c.a === ka && c.b === kb) || (c.a === kb && c.b === ka)).map(c => ({ kind: c.kind, name: c.name, chance: c.chance }));
    for (const k of [ka, kb]) for (const up of Hybrids.stepUps(k)) if (!out.some(o => o.kind === up)) out.push({ kind: up, name: AnimalDefs[up].name, chance: Hybrids.STEP_UP / (k === 'pony_earth' ? 2 : 1) });
    return out;
  },
  /** The kinds one step up from this one. */
  stepUps: kind => (kind === 'pony_plain' ? ['pony_earth'] : kind === 'pony_earth' ? ['pony_pegasus', 'pony_unicorn'] : []),
  /** Roll the kind of a foal of two ordinary parents: a cross, a step up, else null (the usual rule). */
  kindCross(rng, ka, kb) {
    for (const c of Hybrids.KIND_CROSSES) if (((c.a === ka && c.b === kb) || (c.a === kb && c.b === ka)) && rng() < c.chance) return c.kind;
    for (const k of [ka, kb]) if (k === 'pony_plain' && rng() < Hybrids.STEP_UP) return 'pony_earth'; else if (k === 'pony_earth' && rng() < Hybrids.STEP_UP) return rng() < 0.5 ? 'pony_pegasus' : 'pony_unicorn';
    return null;
  }
};
