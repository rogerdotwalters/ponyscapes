'use strict';
/* SHARED - time of day. Pure functions of the server tick (and the Admin page's clock in GameSettings, which every player is sent), so every
 * client agrees on the hour. The day / night split and how fast time runs come from GameSettings too. */
const DayCycle = (() => {
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /** Hour of day 0..24 at a (possibly fractional) tick. */
  function hourAt(tick) { const h = GameSettings.totalHours(tick) % 24; return h < 0 ? h + 24 : h; }
  function dayAt(tick) { return 1 + Math.floor(GameSettings.totalHours(tick) / 24); }

  /** 0 = deep night, 1 = full daylight. Dawn and dusk each take 2.5 hours around GameSettings.dayHours() (as built: 5:00-7:30 and 18:00-20:30). */
  const TWILIGHT = 1.25;
  function daylight(hour) { const { dawn, dusk } = GameSettings.dayHours(); return smoothstep(dawn - TWILIGHT, dawn + TWILIGHT, hour) * (1 - smoothstep(dusk - TWILIGHT, dusk + TWILIGHT, hour)); }

  /** How much of a warm sunrise / sunset glow there is (peaks in the middle of dawn and dusk). */
  function horizonGlow(hour) {
    const d = GameSettings.dayHours(), dawn = 1 - Math.abs(hour - d.dawn) / TWILIGHT, dusk = 1 - Math.abs(hour - d.dusk) / TWILIGHT;
    return clamp(Math.max(dawn, dusk), 0, 1);
  }

  function phase(hour) {
    const { dawn, dusk } = GameSettings.dayHours(), T = TWILIGHT;
    return hour >= dawn + T && hour < dusk - T ? 'day' : hour >= dawn - T && hour < dawn + T ? 'dawn' : hour >= dusk - T && hour < dusk + T ? 'dusk' : 'night';
  }

  function format(hour) {
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  return { hourAt, dayAt, daylight, horizonGlow, phase, format };
})();
