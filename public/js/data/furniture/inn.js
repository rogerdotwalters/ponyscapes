'use strict';
/* DATA - furniture for the Pony Inn (data/buildings/pony_inn.js): the innkeeper's bar, and the CONNECT FOUR TABLE: walk up to it and press Use to sit down and play
 * (shared/connectFour.js, client/ui/connectFourUI.js). */
FurnitureDefs.registerAll([
  { id: 'bar_counter', name: 'Bar', size: [3, 1], solid: true, height: 28, style: 'counter', colors: { top: '#b8844a', front: '#6d4a2c', trim: '#3a281a' } },
  { id: 'connect4_table', name: 'Connect Four Table', size: [2, 2], solid: true, height: 26, style: 'game_table', connect4: true, colors: { top: '#a8763f', leg: '#6d4c2f', board: '#2f55a4', frame: '#1f3c7a' } }
]);
