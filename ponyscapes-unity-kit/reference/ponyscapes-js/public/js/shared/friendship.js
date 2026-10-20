'use strict';
/* SHARED - the friendship meter as pure functions (server and client agree). A BOND between one player and one being is { level, into }:
 * `level` is the colour (1..24) and `into` the points collected towards the next colour. Each level has three hearts; a heart costs more at higher levels.
 * The highest LEVEL you can reach is set by your skill: Friendship for people, Animal Friendship for animals (they are separate skills). */
const Friendship = {
  get MAX_LEVEL() { return FriendshipLevels.size; },
  cfg: () => CONFIG.sim.friendship,
  /** Points for ONE heart at this level, and for all three. */
  heartCost: level => Friendship.cfg().heartCost + Friendship.cfg().heartCostPerLevel * (level - 1),
  levelCost: level => Friendship.cfg().heartsPerLevel * Friendship.heartCost(level),
  /** The highest friendship level your skill level allows (1 at skill 1). */
  capFor: skillLevel => clamp(1 + Math.floor(((skillLevel || 1) - 1) / Friendship.cfg().skillPerLevel), 1, Friendship.MAX_LEVEL),
  /** The skill level you need before this friendship level opens up. */
  skillFor: level => 1 + (clamp(level, 1, Friendship.MAX_LEVEL) - 1) * Friendship.cfg().skillPerLevel,
  fresh: () => ({ level: 1, into: 0 }),
  /** The look of a level: { level, name, tier, hue, color }. */
  info: level => FriendshipLevels.all()[clamp(level, 1, Friendship.MAX_LEVEL) - 1],
  /** How many of the three hearts are filled, as a fraction (2.5 = two full and a half). */
  hearts: bond => clamp((bond ? bond.into : 0) / Friendship.heartCost(bond ? bond.level : 1), 0, Friendship.cfg().heartsPerLevel),
  /** At least one whole heart: it knows you. */
  isFriend: bond => !!bond && (bond.level > 1 || bond.into >= Friendship.heartCost(1)),
  /** Has any friendship at all (shown over its head). */
  hasBond: bond => !!bond && (bond.level > 1 || bond.into > 0),
  /** Add (or take away) points under a level cap. A full level moves you up a colour; at the cap the hearts just stay full.
   *  Losing points never loses a colour. @returns { bond, ups, capped, gained } with a NEW bond (the old one is untouched). */
  apply(bond, points, cap) {
    let level = bond ? bond.level : 1, into = bond ? bond.into : 0, ups = 0, capped = false, before = level * 1e6 + into;
    if (points < 0) into = Math.max(0, into + points);
    else {
      into += points;
      while (into >= Friendship.levelCost(level)) {
        if (level >= cap) { into = Friendship.levelCost(level); capped = true; break; }
        into -= Friendship.levelCost(level); level++; ups++;
      }
      if (level >= cap && into >= Friendship.levelCost(level)) capped = true;
    }
    return { bond: { level, into }, ups, capped, gained: level * 1e6 + into - before };
  },
  /** Wire / save form: [level, points]. */
  encode: bond => [bond.level, Math.round(bond.into * 10) / 10],
  decode(a) { return Array.isArray(a) && Number.isFinite(a[0]) && Number.isFinite(a[1]) ? { level: clamp(Math.round(a[0]), 1, Friendship.MAX_LEVEL), into: clamp(a[1], 0, Friendship.levelCost(clamp(Math.round(a[0]), 1, Friendship.MAX_LEVEL))) } : null; },
  /** 'person' beings train Friendship; 'animal' beings train Animal Friendship. */
  skillOf: kind => (kind === 'animal' ? 'animal_friendship' : 'friendship'),
  /** loved / liked / disliked / neutral: how a being feels about an item, from its tastes { likes, loves, dislikes }. */
  opinion(tastes, itemId) {
    if (!tastes || !itemId) return 'neutral';
    if ((tastes.loves || []).includes(itemId)) return 'loved';
    if ((tastes.likes || []).includes(itemId)) return 'liked';
    if ((tastes.dislikes || []).includes(itemId)) return 'disliked';
    return 'neutral';
  }
};
