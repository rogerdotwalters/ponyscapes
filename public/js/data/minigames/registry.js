'use strict';
/* DATA - minigames. EVERY minigame is one entry, each in its own file. A minigame is played in an INSTANCE (its own grid: js/shared/grids.js) that the players are
 * taken into, and brings them back out when it ends. The rules of each one live in its entry; the machinery is a system in js/shared/ (the Round-Up: roundupSystem.js).
 *   name, blurb   shown on the interaction button and in the dialogue
 *   (the rest)    that minigame's own tunables: see its file */
const Minigames = new Registry('minigames', { required: ['name', 'blurb'] });
