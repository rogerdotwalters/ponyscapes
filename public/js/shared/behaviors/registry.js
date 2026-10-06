'use strict';
/* BEHAVIOURS - how a wild animal decides what to do each tick. A creature's data names one (behavior: 'predator'); AnimalSystem asks the registry
 * and calls think(system, animal, def, humans, dt). Add a behaviour = add a file here; no creature or system changes. `system` offers the
 * steering primitives (_wander, _steerAlong), damagePlayer(), emit(), getLights(), getTick(), rng(). */
const Behaviors = new Registry('behaviors', { required: ['think'] });
