'use strict';
/* DATA - dungeons. A dungeon is a list of ROOMS you walk through one after another: each room is a picture-sized 2D list of tile codes
 * (js/shared/roomCodes.js; the rooms themselves are in js/content/caveRooms.js, made from the PNGs in assets/dungeons/rooms/).
 *   rooms      the room ids, in order: the exit (3) of one leads to the entrance (2) of the next; the first entrance leads back outside
 *   ring       which zone its cave mouth stands in (0 = zone 1)
 *   lair       (optional) true: the zone's guardian lair (the boss arena of zone `ring`) is the dungeon's LAST layer, down from the last room's exit; beating the guardian opens the next zone
 *   enemies    the creatures a plain spawn node (4) picks from: ids, or [id, weight] for a rare one ([['slime', 9], ['wolf', 1]] = one wolf in ten). (A creature number, 1000+, always spawns that creature.) Default: the ring's hostile creatures
 *   loot       what its chests can hold: [{ item, min, max, chance }] (default: a few coins and supplies) */
const Dungeons = new Registry('dungeons', { required: ['name', 'ring', 'rooms'] });
