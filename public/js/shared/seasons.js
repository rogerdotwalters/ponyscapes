'use strict';
/* SHARED - the seasons. Pure functions of the in-game clock (GameSettings), so everyone agrees: day 1 is the first day of spring, and each
 * season lasts GameSettings.values.seasonDays days (the Admin page; 20 as built), then spring comes round again in a new year.
 * The season colours the land (terrainRenderer.js), the trees (pixelProps.js) and decides which crops grow (farming.js). */
const Seasons = (() => {
  const LIST = Object.freeze([
    Object.freeze({ id: 'spring', name: 'Spring', icon: '\u{1F338}', color: '#7cc86a', treeTint: null }),
    Object.freeze({ id: 'summer', name: 'Summer', icon: '\u2600\uFE0F', color: '#f2c230', treeTint: 'rgba(40,110,30,.16)' }),
    Object.freeze({ id: 'autumn', name: 'Autumn', icon: '\u{1F342}', color: '#e07a2e', treeTint: 'rgba(214,112,36,.62)' }),
    Object.freeze({ id: 'winter', name: 'Winter', icon: '\u2744\uFE0F', color: '#9fd0f2', treeTint: 'rgba(235,246,255,.62)' })
  ]);
  const length = () => Math.max(1, GameSettings.values.seasonDays | 0 || 20);
  /** Everything about the date at a tick: day (0-based, since the world began), the season, the day in it (1-based), the year, and how far
   *  through the season it is (0..1, smooth through the hours). */
  function at(tick) {
    const hours = Math.max(0, GameSettings.totalHours(tick)), day = Math.floor(hours / 24), len = length(), index = Math.floor(day / len) % 4;
    return { day, index, season: LIST[index], dayInSeason: day % len + 1, length: len, year: Math.floor(day / (len * 4)) + 1, progress: ((hours / 24) % len) / len };
  }
  /** The season (0-3) on a given day number. */
  const indexOfDay = day => Math.floor(Math.max(0, day) / length()) % 4;
  return { LIST, at, indexOfDay, byId: id => LIST.find(s => s.id === id) || null };
})();
