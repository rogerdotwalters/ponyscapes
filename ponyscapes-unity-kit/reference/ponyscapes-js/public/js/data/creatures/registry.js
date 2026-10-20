'use strict';
/* DATA - creatures. EVERY non-pony animal and monster is one entry here, each family in its own file (rabbit.js, bear.js, dragons.js...).
 *   ring        which ring it lives in (0 = the centre) and, with `weight` and `group` [min, max], how common it is there. weight 0 = never spawns by itself
 *   levelBase   its level if the level-zone layer is switched off          behavior    how it thinks: a Behaviors id (timid / nocturnal / predator / territorial)
 *   marker      the sign of its home in the wild, drawn where its animals live: burrow / den / nest / web (none = nothing to see: deer and the like just graze)
 *   hostile     it attacks people (hunt = how far it notices you, attack = { damage, range, cooldown, ranged? })
 *   sprite      how the client draws it: { kind, color, scale } - a CreatureSprites id          boss: true, bossRing: the ring whose way on it guards
 *   wants       what it asks for (a bubble over its head; hold one and press the interact key to give it): { items, every: seconds before it
 *               wants another (0 = once), need: how many in all (a boss), appease: true (enough of them calms the boss for good: the ring opens),
 *               unlocks: 'pickup' (it lets you pick it up once fed), quest: { creature, count } (the boss's lost young, placed in its ring) }
 *               lureItems   only these foods lure it (default: any food)          (see js/shared/wantSystem.js) */
const Creatures = new Registry('creatures', { required: ['name', 'ring', 'hp'] });
