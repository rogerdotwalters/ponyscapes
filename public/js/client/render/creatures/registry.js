'use strict';
/* CLIENT - creature sprites. Each kind of creature is drawn by ONE small file in this folder that registers itself here; a creature's data names its
 * kind (sprite: { kind: 'dragon', color, scale }). AnimalSprite only dispatches: it never names a species. Add a creature that looks like an existing kind
 * = no client change at all; a new look = one new file.
 * draw(s, info): s = the AnimalSprite (s.g is the drawing helper; the origin is the animal's footprint, facing RIGHT; y goes up as NEGATIVE),
 * info = { animal, def, sprite, phase, speed, now, seed, hunting } */
const CreatureSprites = new Registry('creature sprites', { required: ['draw'] });
