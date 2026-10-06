'use strict';
/* DATA - creatures. EVERY non-pony animal and monster is one entry here, each family in its own file (rabbit.js, bear.js, dragons.js...).
 *   ring        which ring it lives in (0 = the centre) and, with `weight` and `group` [min, max], how common it is there. weight 0 = never spawns by itself
 *   levelBase   its level if the level-zone layer is switched off          behavior    how it thinks: a Behaviors id (timid / nocturnal / predator / territorial)
 *   hostile     it attacks people (hunt = how far it notices you, attack = { damage, range, cooldown, ranged? })
 *   sprite      how the client draws it: { kind, color, scale } - a CreatureSprites id          boss: true, bossRing: the ring whose way on it guards */
const Creatures = new Registry('creatures', { required: ['name', 'ring', 'hp'] });
