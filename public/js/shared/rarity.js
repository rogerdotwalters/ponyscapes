'use strict';
/* SHARED - rarity, and what rarity GIVES a pony: buffs (always-on bonuses), abilities (things it can do) and the effects those
 * abilities have on the world.
 *
 *   common     basic: nothing extra
 *   uncommon   one small buff (a little faster, sturdier, luckier ...)
 *   rare       a buff and an ability (flame breath, dash, a light at night, frost nova)
 *   epic       two buffs and an ability, stronger
 *   legendary  two buffs and two abilities, strongest
 *
 * Items carry a rarity too (it colours their slot and decides how special a world spawn looks). */
const RarityDefs = Object.freeze({
  common:    Object.freeze({ id: 'common',    name: 'Common',    color: '#b9c0c8', order: 0, weight: 62, buffs: 0, abilities: 0, power: 1 }),
  uncommon:  Object.freeze({ id: 'uncommon',  name: 'Uncommon',  color: '#5fd068', order: 1, weight: 25, buffs: 1, abilities: 0, power: 1 }),
  rare:      Object.freeze({ id: 'rare',      name: 'Rare',      color: '#4fa3ff', order: 2, weight: 9,  buffs: 1, abilities: 1, power: 1.5 }),
  epic:      Object.freeze({ id: 'epic',      name: 'Epic',      color: '#b66dff', order: 3, weight: 3,  buffs: 2, abilities: 1, power: 2 }),
  legendary: Object.freeze({ id: 'legendary', name: 'Legendary', color: '#ffb43c', order: 4, weight: 1,  buffs: 2, abilities: 2, power: 3 })
});
const RarityOrder = Object.freeze(Object.keys(RarityDefs));
const rarityOf = id => RarityDefs[id] || RarityDefs.common;

/* ------------------------------------------------------------------------------------------------------------------ */

/** What a buff improves. movement: % faster; health: + maximum health; luck: % extra chance of a bonus harvest and a better lasso throw;
 *  friendship: % farther that animals trust you, and a better lasso throw; carry: + stacks of resources you can carry. */
const BuffTypes = Object.freeze(['movement', 'health', 'luck', 'friendship', 'carry']);

class Buff {
  /** @param {{id:string, name:string, type:string, value:number, range?:number, affectsOthers?:boolean, description?:string}} o
   *  value: whole number (its unit depends on the type); range: tiles from the pony that `affectsOthers` reaches; affectsOthers: does it also help other players nearby? */
  constructor({ id, name, type, value, range = 0, affectsOthers = false, description = '' }) {
    if (!BuffTypes.includes(type)) throw new Error(`Buff ${id}: unknown type "${type}"`);
    this.id = id; this.name = name; this.type = type;
    this.value = Math.round(value) | 0; this.range = Math.max(0, Math.round(range) | 0); this.affectsOthers = !!affectsOthers;
    this.description = description;
    Object.freeze(this);
  }
  /** The same buff at a rarity's power (values are whole numbers). */
  scaled(power) { return power === 1 ? this : new Buff(Object.assign({}, this, { value: Math.max(1, Math.round(this.value * power)) })); }
  /** "+12% movement" */
  get label() { return Buff.format(this.type, this.value); }
  static format(type, value) {
    return ({ movement: `+${value}% speed`, health: `+${value} max health`, luck: `+${value}% luck`, friendship: `+${value}% animal trust`, carry: `+${value} resource stack${value === 1 ? '' : 's'}` })[type];
  }
}

/** What an ability does when it fires. kind: damage (hp) | slow (% slower) | speed (% faster) | light (radius in tiles) | scare (wild animals bolt).
 *  shape: self | circle (round the pony) | cone (in front of it); target: self | hostile (spiders ...) | wild (any wild animal that is not a pony) | allies (players). */
const EffectKinds = Object.freeze(['damage', 'slow', 'speed', 'light', 'scare', 'heal', 'gift']);          // heal: restore health (to yourself or to players near you); gift: put `value` of `item` in your bag
const EffectShapes = Object.freeze(['self', 'circle', 'cone']);
const EffectTargets = Object.freeze(['self', 'hostile', 'wild', 'allies']);

class Effect {
  constructor({ id, name, kind, value = 0, radius = 0, duration = 0, shape = 'self', target = 'self', color = '#ffffff', item = '' }) {
    if (!EffectKinds.includes(kind)) throw new Error(`Effect ${id}: unknown kind "${kind}"`);
    if (!EffectShapes.includes(shape)) throw new Error(`Effect ${id}: unknown shape "${shape}"`);
    if (!EffectTargets.includes(target)) throw new Error(`Effect ${id}: unknown target "${target}"`);
    Object.assign(this, { id, name, kind, value: Math.round(value) | 0, radius: +radius || 0, duration: +duration || 0, shape, target, color, item });
    Object.freeze(this);
  }
  /** Is (x, y) inside this effect, fired from `from` facing `facing`? */
  covers(from, facing, x, y) {
    const d = Math.hypot(x - from.x, y - from.y);
    if (this.shape === 'self') return false;
    if (d > this.radius) return false;
    return this.shape === 'circle' || d < 0.6 || Math.abs(wrapAngle(Math.atan2(y - from.y, x - from.x) - facing)) <= Effect.CONE_HALF_ANGLE;
  }
}
Effect.CONE_HALF_ANGLE = 0.6;

/** An effect by id: a rarity ability's, or a pony skill's (ponySkills.js). */
const effectDef = id => EffectDefs[id] || (typeof SkillEffectDefs !== 'undefined' ? SkillEffectDefs[id] : null);

class Ability {
  /** trigger: 'active' (you fire it while riding: B / N or the ability button) | 'passive' (always on). cooldown in seconds. */
  constructor({ id, name, description = '', trigger = 'active', cooldown = 0, effects = [], glyph = '✨', color = '#ffffff' }) {
    if (trigger !== 'active' && trigger !== 'passive') throw new Error(`Ability ${id}: trigger must be active or passive`);
    for (const e of effects) if (!effectDef(e)) throw new Error(`Ability ${id}: unknown effect "${e}"`);
    Object.assign(this, { id, name, description, trigger, cooldown: +cooldown || 0, effects: Object.freeze(effects.slice()), glyph, color });
    Object.freeze(this);
  }
  get effectDefs() { return this.effects.map(effectDef); }
  get passive() { return this.trigger === 'passive'; }
}

/* ------------------------------------------------------------------------------------------------------------------ */

const EffectDefs = Object.freeze({
  fire_damage:  new Effect({ id: 'fire_damage',  name: 'Scorch',      kind: 'damage', value: 6, radius: 3.2, shape: 'cone',   target: 'hostile', color: '#ff7a1a' }),
  fire_scare:   new Effect({ id: 'fire_scare',   name: 'Fright',      kind: 'scare',  radius: 3.2, shape: 'cone',   target: 'wild',    color: '#ffb34a' }),
  dash_speed:   new Effect({ id: 'dash_speed',   name: 'Burst',       kind: 'speed',  value: 80, duration: 1.4, shape: 'self', target: 'self', color: '#fff1c2' }),
  night_glow:   new Effect({ id: 'night_glow',   name: 'Glow',        kind: 'light',  radius: 7, shape: 'self', target: 'self', color: '#fff3b0' }),
  frost_damage: new Effect({ id: 'frost_damage', name: 'Frostbite',   kind: 'damage', value: 4, radius: 3.5, shape: 'circle', target: 'hostile', color: '#9fe3ff' }),
  frost_slow:   new Effect({ id: 'frost_slow',   name: 'Chill',       kind: 'slow',   value: 60, radius: 3.5, duration: 3, shape: 'circle', target: 'wild', color: '#d6f4ff' })
});

const AbilityDefs = Object.freeze({
  flame_breath: new Ability({ id: 'flame_breath', name: 'Flame Breath', description: 'Breathes fire ahead: burns spiders, scares other wild animals off', cooldown: 8,  effects: ['fire_damage', 'fire_scare'], glyph: '🔥', color: '#ff7a1a' }),
  dash:         new Ability({ id: 'dash',         name: 'Dash',         description: 'A sudden burst of speed',                                     cooldown: 6,  effects: ['dash_speed'],                glyph: '💨', color: '#fff1c2' }),
  night_light:  new Ability({ id: 'night_light',  name: 'Night Light',  description: 'Glows after dark: a moving campfire that spiders keep away from', trigger: 'passive', effects: ['night_glow'], glyph: '🌟', color: '#fff3b0' }),
  frost_nova:   new Ability({ id: 'frost_nova',   name: 'Frost Nova',   description: 'A ring of frost: hurts spiders, slows every wild animal near',  cooldown: 12, effects: ['frost_damage', 'frost_slow'], glyph: '❄', color: '#9fe3ff' })
});

/** Base values (uncommon strength); higher rarities multiply them by their `power`. */
const BuffDefs = Object.freeze({
  swift_hooves: new Buff({ id: 'swift_hooves', name: 'Swift Hooves', type: 'movement',   value: 8,  description: 'You move faster while it is with you' }),
  trailblazer:  new Buff({ id: 'trailblazer',  name: 'Trailblazer',  type: 'movement',   value: 5,  range: 6, affectsOthers: true, description: 'Everyone near it moves faster' }),
  hardy:        new Buff({ id: 'hardy',        name: 'Hardy',        type: 'health',     value: 12, description: 'More maximum health' }),
  lucky_star:   new Buff({ id: 'lucky_star',   name: 'Lucky Star',   type: 'luck',       value: 6,  description: 'Bonus harvests more often' }),
  warm_heart:   new Buff({ id: 'warm_heart',   name: 'Warm Heart',   type: 'friendship', value: 20, range: 6, affectsOthers: true, description: 'Animals trust everyone near it from farther away' }),
  pack_pony:    new Buff({ id: 'pack_pony',    name: 'Pack Pony',    type: 'carry',      value: 1,  description: 'Carries an extra stack of every resource' })
});

/** Which ability suits which pony: a biome variety or species gets its own ability more often than chance. */
const AbilityAffinity = Object.freeze({ ember: 'flame_breath', frost: 'frost_nova', starlit: 'night_light', crystal: 'night_light', pony_pegasus: 'dash', pony_alicorn: 'night_light' });

/* ------------------------------------------------------------------------------------------------------------------ */

/** A pony's rarity and traits. They are two numbers in its look ([..., rarity, traitSeed]), so they cost nothing on the wire and
 *  every client works out the same buffs and abilities from them. */
const PonyRarity = (() => {
  const cache = new Map(), buffIds = Object.keys(BuffDefs), abilityIds = Object.keys(AbilityDefs);

  /** Roll a rarity (never below `minRarity`) with the rarity weights. `rng` is a 0..1 source. */
  function rollRarity(rng, minRarity = 'common') {
    const min = rarityOf(minRarity).order, tiers = RarityOrder.filter(r => RarityDefs[r].order >= min);
    const total = tiers.reduce((n, r) => n + RarityDefs[r].weight, 0);
    let roll = rng() * total;
    for (const r of tiers) if ((roll -= RarityDefs[r].weight) < 0) return RarityDefs[r].order;
    return RarityDefs[tiers[tiers.length - 1]].order;
  }

  /** @returns {{rarity, buffs:Buff[], abilities:Ability[]}} for a look array (and its species, for ability affinity). */
  function of(look, type = '') {
    const r = look && Number.isInteger(look[5]) ? clamp(look[5], 0, RarityOrder.length - 1) : 0, seed = look && Number.isInteger(look[6]) ? look[6] : 0;
    const variant = look ? (look[4] | 0) : 0, key = `${type}|${variant}|${r}|${seed}`;
    let traits = cache.get(key);
    if (traits) return traits;
    const rarity = RarityDefs[RarityOrder[r]], rng = mulberry32(seed * 2654435761 + 97), pick = (list, n) => {
      const pool = list.slice(), out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return out;
    };
    const buffs = pick(buffIds, rarity.buffs).map(id => BuffDefs[id].scaled(rarity.power));
    const variantId = typeof PonyVariants !== 'undefined' && PonyVariants[variant] ? PonyVariants[variant].id : '';
    const favourite = AbilityAffinity[variantId] || AbilityAffinity[type];
    let abilities = [];
    if (rarity.abilities) {
      const first = favourite && rng() < 0.6 ? favourite : null;
      abilities = (first ? [first] : []).concat(pick(abilityIds.filter(a => a !== first), rarity.abilities - (first ? 1 : 0))).map(id => AbilityDefs[id]);
    }
    traits = Object.freeze({ rarity, buffs: Object.freeze(buffs), abilities: Object.freeze(abilities) });
    cache.set(key, traits);
    return traits;
  }

  const hasPassive = (look, type, kind) => of(look, type).abilities.some(a => a.passive && a.effectDefs.some(e => e.kind === kind));
  return { rollRarity, of, hasPassive };
})();
