'use strict';
/* SHARED - every creature has a NUMBER (1000 and up) so a dungeon room can name it in a 2D list / PNG (js/shared/roomCodes.js).
 * The numbers are written down here, never worked out from the order of the creature files, so a code in a saved room never changes meaning.
 * Add a creature = add a line with the next free number. A creature with no line (e.g. one from the Admin page) still works: it is given the next
 * free number after the last one written here, in the order the game lists creatures. Ponies are not enemies and have no number. */
const ENEMY_CODE_TABLE = Object.freeze({
  rabbit: 1000, deer: 1001, sheep: 1002, elk: 1003, bat: 1004, spider: 1005, bear: 1006, centipede: 1007, lion: 1008, manticore: 1009, beastman: 1010,
  dragon_whelp: 1011, dragon_young: 1012, dragon: 1013, elder_dragon: 1014,
  chicken: 1015, duck: 1016, goat: 1017, cat: 1018, dog: 1019, fox: 1020, owl: 1021, boar: 1022, wolf: 1023, bear_cub: 1024,
  panther: 1025, monkey: 1026, lemur: 1027, snake: 1028, toucan: 1029,
  boss_cave_bear: 1100, boss_drake_matriarch: 1101, boss_broodmother: 1102, boss_centipede_queen: 1103, boss_ancient_dragon: 1104
});

const EnemyCodes = (() => {
  const byId = {}, byCode = {};
  let next = Math.max(...Object.values(ENEMY_CODE_TABLE)) + 1;
  for (const [id, code] of Object.entries(ENEMY_CODE_TABLE)) if (AnimalDefs[id] && !AnimalDefs[id].pony) { byId[id] = code; byCode[code] = id; }
  for (const def of Object.values(AnimalDefs)) {
    if (def.pony || byId[def.id] !== undefined) continue;
    while (byCode[next]) next++;
    byId[def.id] = next; byCode[next] = def.id;
  }
  return Object.freeze({
    /** The number of a creature id (or undefined). */
    codeOf: id => byId[id],
    /** The creature id a number stands for (or undefined). */
    idOf: code => byCode[code],
    all: () => Object.entries(byId).map(([id, code]) => ({ id, code })).sort((a, b) => a.code - b.code)
  });
})();
