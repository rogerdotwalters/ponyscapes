'use strict';
/* DATA - the SKY ponies: ponies that step out only under the right sky (shared/skyEvents.js runs them). One entry each; the pony kind is in kinds.js, its look in variants.js.
 *   weather     the weather types it comes out in (shared/weather.js)         hours   [from, to] in-game hours (wraps past midnight); omit for any hour
 *   episode     one chance to be visited per player per: 'weather' spell | 'day' | 'night'          chance   that chance (0..1)
 *   intensity   what measures how strong the sky is: 'rain' | 'lightning' | 'sun' | 'night'. A sky at 85%+ makes a better pony (one rarity higher) one time in four.
 *   when        the line the Pony Book shows. The pony fades when the sky changes unless somebody has caught it. */
SkyPonyTable.register({ id: 'water', kind: 'pony_water', variant: 'water', when: 'Only in the rain', weather: ['drizzle', 'rain', 'downpour', 'thunderstorm'], episode: 'weather', chance: 0.12, intensity: 'rain',
  notice: 'The rain gathers into a shimmering shape...' });
SkyPonyTable.register({ id: 'lightning', kind: 'pony_lightning', variant: 'lightning', when: 'Only in a thunderstorm', weather: ['thunderstorm'], episode: 'weather', chance: 0.1, intensity: 'lightning',
  notice: 'Lightning crackles along the ground... something is running with the storm!' });
SkyPonyTable.register({ id: 'sun', kind: 'pony_sun', variant: 'sun', when: 'Only under the full noon sun', weather: ['clear'], hours: [10.5, 15.5], episode: 'day', chance: 0.12, intensity: 'sun',
  notice: 'The sunlight gathers into a golden shape...' });
SkyPonyTable.register({ id: 'star', kind: 'pony_star', variant: 'star', when: 'Only at the peak of a clear night', weather: ['clear', 'breeze'], hours: [23, 1], episode: 'night', chance: 0.05, intensity: 'night',
  notice: 'A star seems to fall... and starts to gallop.' });
