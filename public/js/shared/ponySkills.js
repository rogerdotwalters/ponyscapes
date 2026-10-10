'use strict';
/* SHARED - pony SKILL TREES. Every pony variety (the biome it comes from) has its own tree of skills, unlocked by the pony's level (data/ponies/skills.js lists them). A skill is a power
 * the pony gives its rider while it is ridden, fired with the same keys as its rarity abilities (H, K, then Y and O; the power button on touch screens). They are two to a tree to start:
 * one that suits the variety's biome, and one that comes from the pony's CUTIE MARK (so two meadow ponies share the first and differ in the second).
 *
 * The powers are Abilities built from Effects (rarity.js). A skill grows 8% stronger for every pony level above 1 (damage, healing, slows). The pure part here runs on the client too,
 * so the Pony Book can show the tree; the server fires the powers (gameServer.js _useRarityAbility). */
const SkillEffectDefs = Object.freeze({
  leaf_damage:  new Effect({ id: 'leaf_damage',  name: 'Razor Leaves', kind: 'damage', value: 5, radius: 3.6, shape: 'cone',   target: 'hostile', color: '#5fbf4a' }),
  leaf_scare:   new Effect({ id: 'leaf_scare',   name: 'Rustle',       kind: 'scare',  radius: 3.6, shape: 'cone',   target: 'wild',    color: '#8fd46a' }),
  star_damage:  new Effect({ id: 'star_damage',  name: 'Starburst',    kind: 'damage', value: 6, radius: 3.2, shape: 'circle', target: 'hostile', color: '#ffe066' }),
  heart_heal:   new Effect({ id: 'heart_heal',   name: 'Heartglow',    kind: 'heal',   value: 25, radius: 4,  shape: 'circle', target: 'allies',  color: '#ff7ab6' }),
  flower_slow:  new Effect({ id: 'flower_slow',  name: 'Pollen',       kind: 'slow',   value: 50, radius: 3.6, duration: 3, shape: 'circle', target: 'wild', color: '#f7a8d8' }),
  moon_dash:    new Effect({ id: 'moon_dash',    name: 'Moon Dash',    kind: 'speed',  value: 70, duration: 2, shape: 'self', target: 'self', color: '#cfd8ff' }),
  cloud_scare:  new Effect({ id: 'cloud_scare',  name: 'Mist',         kind: 'scare',  radius: 4.5, shape: 'circle', target: 'wild',   color: '#e8eef5' }),
  apple_gift:   new Effect({ id: 'apple_gift',   name: 'Bounty',       kind: 'gift',   value: 2, item: 'apple', shape: 'self', target: 'self', color: '#d9382b' }),
  drop_heal:    new Effect({ id: 'drop_heal',    name: 'Dewdrop',      kind: 'heal',   value: 30, shape: 'self', target: 'self', color: '#8fd0ff' }),
  note_slow:    new Effect({ id: 'note_slow',    name: 'Lullaby',      kind: 'slow',   value: 70, radius: 4, duration: 4, shape: 'circle', target: 'wild', color: '#c9b3ff' })
});

const SkillAbilityDefs = Object.freeze({
  leaf_blast:   new Ability({ id: 'leaf_blast',   name: 'Leaf Blast',      description: 'A cone of razor leaves: cuts the hostile creatures ahead and sends other wild animals scampering', cooldown: 7,  effects: ['leaf_damage', 'leaf_scare'], glyph: '🍃', color: '#5fbf4a' }),
  mark_star:    new Ability({ id: 'mark_star',    name: 'Starburst',       description: 'A burst of starlight round you hurts hostile creatures',          cooldown: 10, effects: ['star_damage'],  glyph: '⭐',       color: '#ffe066' }),
  mark_heart:   new Ability({ id: 'mark_heart',   name: 'Heartglow',       description: 'A warm glow heals you and friends beside you',                    cooldown: 15, effects: ['heart_heal'],   glyph: '❤',       color: '#ff7ab6' }),
  mark_flower:  new Ability({ id: 'mark_flower',  name: 'Pollen Puff',     description: 'A cloud of pollen slows the wild animals round you',              cooldown: 10, effects: ['flower_slow'],  glyph: '🌸', color: '#f7a8d8' }),
  mark_moon:    new Ability({ id: 'mark_moon',    name: 'Moon Dash',       description: 'A sudden burst of speed',                                          cooldown: 12, effects: ['moon_dash'],    glyph: '🌙', color: '#cfd8ff' }),
  mark_cloud:   new Ability({ id: 'mark_cloud',   name: 'Mist Veil',       description: 'A billow of mist scares the wild animals nearby',                 cooldown: 12, effects: ['cloud_scare'],  glyph: '☁',       color: '#e8eef5' }),
  mark_apple:   new Ability({ id: 'mark_apple',   name: 'Apple Bounty',    description: 'Shakes a couple of apples loose into your bag',                   cooldown: 45, effects: ['apple_gift'],   glyph: '🍎', color: '#d9382b' }),
  mark_drop:    new Ability({ id: 'mark_drop',    name: 'Dewdrop',         description: 'A cool drop of dew heals you',                                     cooldown: 15, effects: ['drop_heal'],    glyph: '💧', color: '#8fd0ff' }),
  mark_note:    new Ability({ id: 'mark_note',    name: 'Lullaby',         description: 'A soft tune slows the wild animals around you',                   cooldown: 14, effects: ['note_slow'],    glyph: '♪',       color: '#c9b3ff' })
});
/** Any power by id: a rarity ability or a skill. */
const abilityDef = id => AbilityDefs[id] || SkillAbilityDefs[id] || null;

const PonySkills = {
  /** The skill power a cutie mark gives (a mark name such as 'star'), or null for a mark with none yet. */
  markAbility: mark => (SkillAbilityDefs['mark_' + mark] ? 'mark_' + mark : null),
  /** How much stronger a skill is at a pony's level: +8% per level above 1. */
  scale: level => 1 + 0.08 * (Math.max(1, level || 1) - 1),
  /** A pony's tree: [{ id, level (to unlock), unlocked, ability (the power, or null), name, text }], for its look, kind and level. Empty for a variety with no tree yet. */
  tree(look, type, level = 1) {
    const d = PonyLook.describe(look), tree = PonySkillTrees.get(d.variantId);
    if (!tree) return [];
    return tree.skills.map(s => {
      const abilityId = s.byMark ? PonySkills.markAbility(d.mark) : s.ability, ability = abilityId ? SkillAbilityDefs[abilityId] : null;
      return { id: s.id, label: s.label, level: s.level, unlocked: (level || 1) >= s.level && !!ability, ability, name: ability ? ability.name : s.label, text: s.byMark ? `from its ${d.mark} cutie mark` : 'from where it was born' };
    });
  },
  /** The powers a pony has unlocked at its level (ability ids, in tree order). */
  unlocked: (look, type, level) => PonySkills.tree(look, type, level).filter(s => s.unlocked).map(s => s.ability.id)
};
