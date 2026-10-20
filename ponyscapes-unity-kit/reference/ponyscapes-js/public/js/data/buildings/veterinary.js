'use strict';
/* DATA - building: the veterinary (where ponies are looked after) */
BuildingDefs.register({ id: 'veterinary', name: 'Veterinary', glyph: '⚕', size: [4, 4], door: 1, interior: 'veterinary', instance: 'shared', hours: [8, 17], keeper: 'exam_table',
  exterior: { wall: '#eef0ea', side: '#c9cdc4', roof: '#4f8a8b', trim: '#2f5d5e', sign: '#ffffff', infill: 'plaster', dormer: false, props: ['lantern', 'hay', 'flowers'] } });
