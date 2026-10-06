'use strict';
/* DATA - building: the storehouse. Everyone shares its room; its Wool Bin keeps the town's wool (store it, take it back out). */
BuildingDefs.register({ id: 'storehouse', name: 'Storehouse', glyph: '📦', size: [5, 4], door: 2, interior: 'storehouse', instance: 'shared',
  exterior: { wall: '#b9a283', side: '#97805f', roof: '#6b5a3a', trim: '#3f3322', sign: '#efe2c4' } });
