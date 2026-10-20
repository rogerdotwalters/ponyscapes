'use strict';
/* CLIENT - creature sprite: ponies (all five kinds; their look comes from the pony tables). The drawing code is AnimalSprite._pony. */
CreatureSprites.register({ id: 'pony', draw(s, { animal, phase, speed, now }) { s._pony(animal, phase, speed, now); } });
