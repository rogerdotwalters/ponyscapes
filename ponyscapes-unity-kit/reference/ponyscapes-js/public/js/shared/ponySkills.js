'use strict';
/* SHARED - pony SKILL TREES. Every pony variety (the biome it comes from) has its own tree of skills, unlocked by the pony's level (data/ponies/skills.js lists them). A skill is a power
 * the pony gives its rider while it is ridden, fired with the same keys as its rarity abilities (H, K, then Y and O; the power button on touch screens). They are two to a tree to start:
 * one that suits the variety's biome, and one that comes from the pony's CUTIE MARK (so two meadow ponies share the first and differ in the second).
 *
 * The powers are Abilities built from Effects (rarity.js). A skill grows 8% stronger for every pony level above 1 (damage, healing, slows). The pure part here runs on the client too,
 * so the Pony Book can show the tree; the server fires the powers (gameServer.js _useRarityAbility). */
/** The effects of the hybrid ponies' powers (data/ponies/hybrids.js): one per entry of a power's list. */
const HybridEffects = (() => {
  const fx = {};
  for (const h of HybridTable.all()) h.power.effects.forEach((e, i) => { const id = `${h.id}_fx${i}`; fx[id] = new Effect(Object.assign({ id, name: h.power.name, color: h.power.color }, e)); });
  return fx;
})();
const SkillEffectDefs = Object.freeze({
  ...HybridEffects,
  leaf_damage:  new Effect({ id: 'leaf_damage',  name: 'Razor Leaves', kind: 'damage', value: 5, radius: 3.6, shape: 'cone',   target: 'hostile', color: '#5fbf4a' }),
  leaf_scare:   new Effect({ id: 'leaf_scare',   name: 'Rustle',       kind: 'scare',  radius: 3.6, shape: 'cone',   target: 'wild',    color: '#8fd46a' }),
  star_damage:  new Effect({ id: 'star_damage',  name: 'Starburst',    kind: 'damage', value: 6, radius: 3.2, shape: 'circle', target: 'hostile', color: '#ffe066' }),
  heart_heal:   new Effect({ id: 'heart_heal',   name: 'Heartglow',    kind: 'heal',   value: 25, radius: 4,  shape: 'circle', target: 'allies',  color: '#ff7ab6' }),
  flower_slow:  new Effect({ id: 'flower_slow',  name: 'Pollen',       kind: 'slow',   value: 50, radius: 3.6, duration: 3, shape: 'circle', target: 'wild', color: '#f7a8d8' }),
  moon_dash:    new Effect({ id: 'moon_dash',    name: 'Moon Dash',    kind: 'speed',  value: 70, duration: 2, shape: 'self', target: 'self', color: '#cfd8ff' }),
  cloud_scare:  new Effect({ id: 'cloud_scare',  name: 'Mist',         kind: 'scare',  radius: 4.5, shape: 'circle', target: 'wild',   color: '#e8eef5' }),
  apple_gift:   new Effect({ id: 'apple_gift',   name: 'Bounty',       kind: 'gift',   value: 2, item: 'apple', shape: 'self', target: 'self', color: '#d9382b' }),
  drop_heal:    new Effect({ id: 'drop_heal',    name: 'Dewdrop',      kind: 'heal',   value: 30, shape: 'self', target: 'self', color: '#8fd0ff' }),
  tide_heal:    new Effect({ id: 'tide_heal',    name: 'Tidal Wash',   kind: 'heal',   value: 28, radius: 4.2, shape: 'circle', target: 'allies', color: '#7fc8ff' }),
  tide_slow:    new Effect({ id: 'tide_slow',    name: 'Undertow',     kind: 'slow',   value: 55, radius: 3.8, duration: 3, shape: 'circle', target: 'wild', color: '#9fd8ff' }),
  bolt_damage:  new Effect({ id: 'bolt_damage',  name: 'Bolt',         kind: 'damage', value: 11, radius: 5, shape: 'cone',   target: 'hostile', color: '#ffe94d' }),
  bolt_scare:   new Effect({ id: 'bolt_scare',   name: 'Thunderclap',  kind: 'scare',  radius: 5, shape: 'cone',   target: 'wild',    color: '#fff7a0' }),
  sun_damage:   new Effect({ id: 'sun_damage',   name: 'Sunbeam',      kind: 'damage', value: 9, radius: 4, shape: 'circle', target: 'hostile', color: '#ffd54f' }),
  sun_glow:     new Effect({ id: 'sun_glow',     name: 'Daylight',     kind: 'light',  radius: 8, shape: 'self', target: 'self', color: '#fff0a0' }),
  star_fall:    new Effect({ id: 'star_fall',    name: 'Starfall',     kind: 'damage', value: 10, radius: 4.6, shape: 'circle', target: 'hostile', color: '#fff5b0' }),
  star_heal:    new Effect({ id: 'star_heal',    name: 'Wish',         kind: 'heal',   value: 18, radius: 4.6, shape: 'circle', target: 'allies', color: '#d6c8ff' }),
  note_slow:    new Effect({ id: 'note_slow',    name: 'Lullaby',      kind: 'slow',   value: 70, radius: 4, duration: 4, shape: 'circle', target: 'wild', color: '#c9b3ff' })
});

/** ... and the Ability each hybrid's skill tree points at. */
const HybridAbilities = Object.fromEntries(HybridTable.all().map(h => [h.power.id, new Ability({ id: h.power.id, name: h.power.name, description: h.power.description, cooldown: h.power.cooldown,
  effects: h.power.effects.map((e, i) => `${h.id}_fx${i}`), glyph: h.power.glyph, color: h.power.color })]));
const SkillAbilityDefs = Object.freeze({
  ...HybridAbilities,
  leaf_blast:   new Ability({ id: 'leaf_blast',   name: 'Leaf Blast',      description: 'A cone of razor leaves: cuts the hostile creatures ahead and sends other wild animals scampering', cooldown: 7,  effects: ['leaf_damage', 'leaf_scare'], glyph: '🍃', color: '#5fbf4a' }),
  mark_star:    new Ability({ id: 'mark_star',    name: 'Starburst',       description: 'A burst of starlight round you hurts hostile creatures',          cooldown: 10, effects: ['star_damage'],  glyph: '⭐',       color: '#ffe066' }),
  mark_heart:   new Ability({ id: 'mark_heart',   name: 'Heartglow',       description: 'A warm glow heals you and friends beside you',                    cooldown: 15, effects: ['heart_heal'],   glyph: '❤',       color: '#ff7ab6' }),
  mark_flower:  new Ability({ id: 'mark_flower',  name: 'Pollen Puff',     description: 'A cloud of pollen slows the wild animals round you',              cooldown: 10, effects: ['flower_slow'],  glyph: '🌸', color: '#f7a8d8' }),
  mark_moon:    new Ability({ id: 'mark_moon',    name: 'Moon Dash',       description: 'A sudden burst of speed',                                          cooldown: 12, effects: ['moon_dash'],    glyph: '🌙', color: '#cfd8ff' }),
  mark_cloud:   new Ability({ id: 'mark_cloud',   name: 'Mist Veil',       description: 'A billow of mist scares the wild animals nearby',                 cooldown: 12, effects: ['cloud_scare'],  glyph: '☁',       color: '#e8eef5' }),
  mark_apple:   new Ability({ id: 'mark_apple',   name: 'Apple Bounty',    description: 'Shakes a couple of apples loose into your bag',                   cooldown: 45, effects: ['apple_gift'],   glyph: '🍎', color: '#d9382b' }),
  mark_drop:    new Ability({ id: 'mark_drop',    name: 'Dewdrop',         description: 'A cool drop of dew heals you',                                     cooldown: 15, effects: ['drop_heal'],    glyph: '💧', color: '#8fd0ff' }),
  tidal_wash:   new Ability({ id: 'tidal_wash',   name: 'Tidal Wash',      description: 'A wave of water heals you and friends beside you and slows the wild animals round you', cooldown: 14, effects: ['tide_heal', 'tide_slow'], glyph: '🌊', color: '#7fc8ff' }),
  lightning_strike: new Ability({ id: 'lightning_strike', name: 'Lightning Strike', description: 'A bolt ahead hurts hostile creatures and sends other wild animals bolting', cooldown: 9, effects: ['bolt_damage', 'bolt_scare'], glyph: '⚡', color: '#ffe94d' }),
  sunbeam:      new Ability({ id: 'sunbeam',      name: 'Sunbeam',         description: 'A burst of sunlight burns hostile creatures round you and lights the dark', cooldown: 10, effects: ['sun_damage', 'sun_glow'], glyph: '☀', color: '#ffd54f' }),
  starfall:     new Ability({ id: 'starfall',     name: 'Starfall',        description: 'Stars rain down on hostile creatures round you, and a wish heals your friends', cooldown: 12, effects: ['star_fall', 'star_heal'], glyph: '✨', color: '#fff5b0' }),
  mark_note:    new Ability({ id: 'mark_note',    name: 'Lullaby',         description: 'A soft tune slows the wild animals around you',                   cooldown: 14, effects: ['note_slow'],    glyph: '♪',       color: '#c9b3ff' })
});
/** Any power by id: a rarity ability or a skill. */
const abilityDef = id => AbilityDefs[id] || SkillAbilityDefs[id] || null;

const PonySkills = {
  /** The skill power a cutie mark gives (a mark name such as 'star'), or null for a mark with none yet. */
  markAbility: mark => (SkillAbilityDefs['mark_' + mark] ? 'mark_' + mark : null),
  /** How much stronger a skill is at a pony's level: +8% per level above 1. */
  scale: level => 1 + 0.08 * (Math.max(1, level || 1) - 1),
  /** A pony's tree: [{ id, level (to unlock), unlocked, ability (the power, or null), name, text }], for its look, kind and level: its variety's skills, then the skill it inherited, if any. */
  tree(look, type, level = 1) {
    const d = PonyLook.describe(look), tree = PonySkillTrees.get(d.variantId), out = [];
    for (const s of tree ? tree.skills : []) {
      const abilityId = s.byMark ? PonySkills.markAbility(d.mark) : s.ability, ability = abilityId ? SkillAbilityDefs[abilityId] : null;
      out.push({ id: s.id, label: s.label, level: s.level, unlocked: (level || 1) >= s.level && !!ability, ability, name: ability ? ability.name : s.label, text: s.byMark ? `from its ${d.mark} cutie mark` : 'from where it was born' });
    }
    const talent = PonyGenes.talentOf(look), ability = talent ? SkillAbilityDefs[talent.ability] : null;       // the skill it inherited (a gene: ponyGenes.js), unless the pony has that power already
    if (ability && !out.some(s => s.ability && s.ability.id === ability.id)) out.push({ id: 'talent', label: 'Inherited skill', level: talent.level, unlocked: (level || 1) >= talent.level, ability, name: ability.name, text: 'inherited from its parents' });
    return out;
  },
  /** The powers a pony has unlocked at its level (ability ids, in tree order). */
  unlocked: (look, type, level) => PonySkills.tree(look, type, level).filter(s => s.unlocked).map(s => s.ability.id)
};
