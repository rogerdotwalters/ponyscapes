'use strict';
/* DATA - furniture, placed in rooms with level-editor.html. Each piece covers whole tiles (size [w, h], turned with rot 0-3: 1 and 3 swap w and h).
 *   solid    you cannot walk through it (a rug is not)               height   how tall it is drawn (pixels)
 *   style    which drawing the game uses (js/client/render/furnitureSprites.js)       colors   that drawing's colours
 *   unique   (optional) a room holds only ONE of it, the first placed (the bed: your bed at home is THE place you sleep and wake)
 *   light    (optional) a lamp or fire: glows                         sprites  { image }: your own picture (bottom centre at the front corner) */
const FurnitureDefs = new Registry('furniture', { required: ['name', 'size', 'style'] });
