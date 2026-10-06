'use strict';
/* DATA - pony abilities. A pony kind lists the abilities it has (`abilities: ['fly']` in kinds.js). `slot` is the button it uses.
 * Flight: the rider lifts off for `duration` seconds, glides over water, trees and fences (but not a ring's barrier or a cave wall), then lands
 * and waits out the cooldown. Duration grows with the pony's level; the cape's POWER multiplies the whole ability (longer flight, shorter cooldown). */
PonyAbilities.register({
  id: 'fly', name: 'Flight', slot: 'fly', key: 'B',
  duration: 4, durationPerLevel: 0.25, maxDuration: 14,          // seconds airborne: 4 at level 1, +0.25 per pony level, never more than 14 (before the cape)
  cooldown: 24, cooldownPerLevel: 0.3, minCooldown: 8,           // seconds before the next flight: 24 at level 1, -0.3 per pony level, never less than 8 (before the cape)
  speedFactor: 1.3,                                              // a little faster in the air
  rise: 0.35                                                     // seconds to climb / to settle (the sprite's lift follows it)
});
