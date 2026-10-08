'use strict';
/* DATA - puzzle nodes: the old stones and shrines in the world that open a puzzle screen. EVERY node is one entry, each in its own file.
 * Whether one can be solved is up to the quests: a node only works while a quest's current step asks for it (`{ type: 'puzzle', node: id }`).
 *   name     what the interact key says ("Study the Old Rune Stone")
 *   x, y     where it stands in the overworld (tiles)
 *   look     how it is drawn: 'rune' (a humming standing stone), 'dial' (a stone ring with a gem), 'tablet' (a cracked stone slab)
 *   puzzle   { kind, seed, ...options }: the mechanic (js/shared/puzzles.js): 'lights' { size }, 'sequence' { symbols, length }, 'slide' { size }
 *   quiet    what it says when no quest needs it right now */
const PuzzleNodes = new Registry('puzzleNodes', { required: ['name', 'x', 'y', 'look', 'puzzle'], check: d => (['rune', 'dial', 'tablet'].includes(d.look) ? null : 'has an unknown look') });
