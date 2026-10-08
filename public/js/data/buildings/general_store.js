'use strict';
/* DATA - building: the general store */
BuildingDefs.register({ id: 'general_store', name: 'General Store', glyph: '🛒', size: [5, 4], door: 2, interior: 'general_store', instance: 'shared', hours: [8, 17], keeper: 'counter',
  shop: ['satchel', 'explorer_pack', 'saddlebags', 'great_saddlebags', 'torch', 'jug', 'shears', 'sickle', 'hedge_cutter', 'hoe', 'watering_can', ...(typeof Crops !== 'undefined' ? Crops.all().map(c => 'seed_' + c.id) : [])],   // (and every crop's seeds)                 // sold at its Shop Counter (shopSystem.js), for each item's price
  exterior: { wall: '#e6cf9a', side: '#c4ab77', roof: '#8e3b3b', trim: '#5b2424', sign: '#f6e2b0', infill: 'plaster', props: ['lantern', 'barrels', 'crates', 'flowers'] } });
