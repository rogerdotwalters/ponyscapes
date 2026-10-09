'use strict';
/* DATA - the rings. The world is a bullseye of five areas around the village (index 0 is the centre). Each ring has its own level band, its own
 * colour on the map, and a boss that guards the way to the NEXT ring. What lives in a ring is declared by the creatures themselves (their `ring` field). */
const Rings = new Registry('rings', { required: ['index', 'name', 'levelMin', 'levelMax', 'color', 'boss'] });
