'use strict';
/* SHARED - skills and attributes, packaged together the RuneScape way.
 *
 *   SKILLS are what you DO (chop, forage, fish, hunt, build, craft, dig, ride). Each action earns skill XP.
 *   ATTRIBUTES are who you ARE (strength, dexterity ...). They are never trained directly: every skill feeds the
 *   attributes it is packaged with, a share of the XP it earns "under the surface", so chopping makes you stronger
 *   and riding makes you more dexterous and charming.
 *
 *   Levels use RuneScape's XP curve (level 2 = 83 xp, 10 = 1,154 xp, 50 = 101,333 xp, 99 = 13,034,431 xp). */
const AttributeDefs = Object.freeze({
  strength:     Object.freeze({ name: 'Strength',     short: 'STR', effect: 'Hits harder with every 10 levels' }),
  dexterity:    Object.freeze({ name: 'Dexterity',    short: 'DEX', effect: 'Move up to 20% faster, and get closer to animals before they notice you' }),
  constitution: Object.freeze({ name: 'Constitution', short: 'CON', effect: '+5 maximum health and +1 stack of wood, stone and clay you can carry per level' }),
  endurance:    Object.freeze({ name: 'Endurance',    short: 'END', effect: 'Hunger and thirst drain up to 30% slower' }),
  intelligence: Object.freeze({ name: 'Intelligence', short: 'INT', effect: 'All skills gain up to 25% more XP' }),
  charisma:     Object.freeze({ name: 'Charisma',     short: 'CHA', effect: 'Animals trust you from farther away' })
});

/** attrs: how much of the skill's XP also goes to each attribute. */
const SkillDefs = Object.freeze({
  woodcutting:  Object.freeze({ name: 'Woodcutting',  attrs: Object.freeze({ strength: 0.5, endurance: 0.25, constitution: 0.2 }) }),   // hauling timber builds the back you carry it with
  foraging:     Object.freeze({ name: 'Foraging',     attrs: Object.freeze({ dexterity: 0.35, intelligence: 0.25 }) }),
  fishing:      Object.freeze({ name: 'Fishing',      attrs: Object.freeze({ dexterity: 0.3, intelligence: 0.3 }) }),
  hunting:      Object.freeze({ name: 'Hunting',      attrs: Object.freeze({ dexterity: 0.4, strength: 0.3 }) }),
  building:     Object.freeze({ name: 'Building',     attrs: Object.freeze({ strength: 0.3, intelligence: 0.3 }) }),
  crafting:     Object.freeze({ name: 'Crafting',     attrs: Object.freeze({ intelligence: 0.5, dexterity: 0.2 }) }),
  digging:      Object.freeze({ name: 'Digging',      attrs: Object.freeze({ strength: 0.4, endurance: 0.4, constitution: 0.2 }) }),
  horsemanship: Object.freeze({ name: 'Horsemanship', attrs: Object.freeze({ charisma: 0.5, dexterity: 0.3, constitution: 0.2 }) }),
  friendship:        Object.freeze({ name: 'Friendship',        attrs: Object.freeze({ charisma: 0.6, intelligence: 0.2 }) }),          // talking to and giving gifts to PEOPLE
  animal_friendship: Object.freeze({ name: 'Animal Friendship', attrs: Object.freeze({ charisma: 0.5, endurance: 0.1 }) })             // petting and feeding ANIMALS: separate from the one above; also lets you get closer before animals bolt (AnimalSenses)
});
const MAX_LEVEL = 99;

/** XP_TABLE[level] = total XP needed to REACH that level. */
const XP_TABLE = (() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < MAX_LEVEL; level++) { points += Math.floor(level + 300 * Math.pow(2, level / 7)); table[level + 1] = Math.floor(points / 4); }
  return table;
})();

const zeroed = defs => Object.fromEntries(Object.keys(defs).map(k => [k, 0]));
const defaultLevels = () => ({ s: Object.fromEntries(Object.keys(SkillDefs).map(k => [k, 1])), a: Object.fromEntries(Object.keys(AttributeDefs).map(k => [k, 1])) });

const Skills = {
  levelFor(xp) { let level = 1; while (level < MAX_LEVEL && xp >= XP_TABLE[level + 1]) level++; return level; },
  xpFor(level) { return XP_TABLE[clamp(level, 1, MAX_LEVEL)]; },
  /** { level, into, need, fraction } : how far through the current level. */
  progress(xp) {
    const level = Skills.levelFor(xp);
    if (level >= MAX_LEVEL) return { level, into: 0, need: 0, fraction: 1 };
    const base = XP_TABLE[level], need = XP_TABLE[level + 1] - base;
    return { level, into: xp - base, need, fraction: (xp - base) / need };
  },

  /* ---- what the levels DO. `lv` is { s: {skill: level}, a: {attribute: level} } (missing = level 1) ---- */
  _a: (lv, name) => (lv && lv.a && lv.a[name]) || 1,
  _s: (lv, name) => (lv && lv.s && lv.s[name]) || 1,
  maxHp: lv => CONFIG.sim.health.max + 5 * (Skills._a(lv, 'constitution') - 1),
  speedFactor: lv => 1 + Math.min(0.2, 0.01 * (Skills._a(lv, 'dexterity') - 1)),
  damageBonus: lv => Math.floor(Skills._a(lv, 'strength') / 10),
  drainFactor: lv => 1 - Math.min(0.3, 0.01 * (Skills._a(lv, 'endurance') - 1)),
  xpFactor: lv => 1 + Math.min(0.25, 0.01 * (Skills._a(lv, 'intelligence') - 1)),
  trustFactor: lv => 1 + Math.min(0.5, 0.02 * (Skills._a(lv, 'charisma') - 1)),
  rideFactor: lv => 1 + Math.min(0.4, 0.006 * (Skills._s(lv, 'horsemanship') - 1)),
  /** Chance of an extra item from a harvest (woodcutting / foraging / digging). */
  bonusYieldChance: (lv, skill) => Math.min(0.4, 0.006 * (Skills._s(lv, skill) - 1)),
  /** Horsemanship makes the lasso land more often. */
  lassoBonus: lv => Math.min(0.25, 0.004 * (Skills._s(lv, 'horsemanship') - 1)),
  catchChance: lv => Math.min(0.85, 0.5 + 0.004 * (Skills._s(lv, 'fishing') - 1))
};

/** Server-side XP ledger. Awards XP to a skill and, "under the surface", to the attributes it is packaged with. */
/** Extra chance of a bonus harvest from Lucky Star ponies (a player's `buffs.luck` is in percent). */
const luckChance = p => ((p && p.buffs && p.buffs.luck) || 0) / 100;

class Progression {
  /** @param {{emit:(event)=>void, onLevels:(id, levels)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); this.data = {}; this.rev = {}; }

  ensure(id) { return this.data[id] || (this.data[id] = { s: zeroed(SkillDefs), a: zeroed(AttributeDefs) }); }

  levels(id) {
    const d = this.ensure(id), out = { s: {}, a: {} };
    for (const k in d.s) out.s[k] = Skills.levelFor(d.s[k]);
    for (const k in d.a) out.a[k] = Skills.levelFor(d.a[k]);
    return out;
  }

  /** Award `amount` XP in a skill (scaled by the player's intelligence). Emits 'xp' and any 'levelup's. */
  award(id, skill, amount, intelligenceLevels) {
    if (!SkillDefs[skill] || !(amount > 0)) return;
    const d = this.ensure(id), before = this.levels(id);
    const xp = Math.max(1, Math.round(amount * Skills.xpFactor(before)));
    d.s[skill] += xp;
    for (const [attr, share] of Object.entries(SkillDefs[skill].attrs)) d.a[attr] += xp * share;
    const after = this.levels(id);
    this.rev[id] = (this.rev[id] || 0) + 1;
    this.emit({ type: 'xp', to: id, skill, amount: xp });
    for (const k in after.s) if (after.s[k] > before.s[k]) this.emit({ type: 'levelup', to: id, kind: 'skill', name: SkillDefs[k].name, level: after.s[k] });
    for (const k in after.a) if (after.a[k] > before.a[k]) this.emit({ type: 'levelup', to: id, kind: 'attribute', name: AttributeDefs[k].name, level: after.a[k] });
    this.onLevels(id, after);
  }

  /** XP totals for the Journal (floored), only when something changed since last asked. */
  updateFor(id, sentRev) {
    if ((this.rev[id] || 0) === sentRev.value) return null;
    sentRev.value = this.rev[id] || 0;
    const d = this.ensure(id), round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.floor(v)]));
    return { s: round(d.s), a: round(d.a) };
  }
}
