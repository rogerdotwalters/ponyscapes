'use strict';
/* SHARED - time of day. Pure functions of the server tick, so every client agrees on the hour without any extra network data. */
const DayCycle = (() => {
  const dayTicks = () => CONFIG.sim.time.dayLengthSeconds * CONFIG.sim.tickRate;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /** Hour of day 0..24 at a (possibly fractional) tick. */
  function hourAt(tick) { return (CONFIG.sim.time.startHour + 24 * tick / dayTicks()) % 24; }
  function dayAt(tick) { return 1 + Math.floor((CONFIG.sim.time.startHour + 24 * tick / dayTicks()) / 24); }

  /** 0 = deep night, 1 = full daylight (dawn 5:00-7:30, dusk 18:00-20:30). */
  function daylight(hour) { return smoothstep(5, 7.5, hour) * (1 - smoothstep(18, 20.5, hour)); }

  /** How much of a warm sunrise / sunset glow there is (peaks in the middle of dawn and dusk). */
  function horizonGlow(hour) {
    const dawn = 1 - Math.abs(hour - 6.25) / 1.25, dusk = 1 - Math.abs(hour - 19.25) / 1.25;
    return clamp(Math.max(dawn, dusk), 0, 1);
  }

  function phase(hour) { return hour >= 7.5 && hour < 18 ? 'day' : hour >= 5 && hour < 7.5 ? 'dawn' : hour >= 18 && hour < 20.5 ? 'dusk' : 'night'; }

  function format(hour) {
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  return { hourAt, dayAt, daylight, horizonGlow, phase, format };
})();
