'use strict';
/* SHARED - the Admin page's game-wide settings: one movement speed for everything, the day / night split, how fast in-game time runs, and the
 * trees in each biome. The values start from js/content/gameSettings.js (the game folder); the host's Admin page can change them live and keeps
 * its changes in the host's browser until they are exported into that file. The host's values are sent to everyone who joins, so every
 * player predicts movement, the clock and the land exactly as the host's server does.
 *
 * Trees are part of the land each machine builds from the world seed, so the trees in use are fixed for a world's session (the host's at the
 * moment the world starts): a change on the Admin page waits for the next time a world is started or continued. */
const GameSettings = (() => {
  const OVERRIDE_KEY = 'ponyscapes.adminSettings';
  const LIVE = ['globalSpeed', 'dayShare', 'gameHoursPerRealHour', 'seasonDays'];
  const LIMITS = { globalSpeed: [1, 100], dayShare: [10, 90], gameHoursPerRealHour: [1, 5000], seasonDays: [1, 365] };
  const DEFAULTS = Object.freeze({ globalSpeed: 100, dayShare: 54, gameHoursPerRealHour: 180, seasonDays: 20, trees: {}, crops: {} });   // crops: { cropId: days to grow } (else the crop's own)
  const BIOME_ID = /^[a-z][a-z0-9_]{0,39}$/;
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const copy = v => JSON.parse(JSON.stringify(v));

  /** Only valid values, everything else the default. */
  function sanitize(raw) {
    const out = { trees: {}, crops: {} };
    for (const k of LIVE) { const v = plain(raw) ? Number(raw[k]) : NaN; out[k] = Number.isFinite(v) ? clamp(v, LIMITS[k][0], LIMITS[k][1]) : DEFAULTS[k]; }
    out.trees = sanitizeTrees(plain(raw) ? raw.trees : null);
    out.crops = sanitizeCrops(plain(raw) ? raw.crops : null);
    return out;
  }
  /** Days each crop takes to grow (farming.js), where the Admin page changed them. */
  function sanitizeCrops(raw) {
    const out = {};
    if (plain(raw)) for (const [id, d] of Object.entries(raw)) if (BIOME_ID.test(id) && d !== '' && Number.isFinite(+d)) out[id] = clamp(Math.round(+d), 1, 120);
    return out;
  }
  function sanitizeTrees(raw) {
    const out = {};
    if (plain(raw)) for (const [biome, t] of Object.entries(raw)) {
      if (!BIOME_ID.test(biome) || !plain(t)) continue;
      const e = {};
      if (t.amount !== undefined && t.amount !== '' && Number.isFinite(+t.amount)) e.amount = clamp(+t.amount, 0, 500);
      if (t.max !== undefined && t.max !== '' && Number.isFinite(+t.max)) e.max = clamp(+t.max, 0, 100);
      if (Object.keys(e).length) out[biome] = e;
    }
    return out;
  }

  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  const file = sanitize(root.PONYSCAPES_SETTINGS);
  let values = copy(file);
  const clock = { anchorTick: 0, anchorHours: CONFIG.sim.time.startHour };       // the in-game time at one tick: the clock runs on from there
  const builtInDayLength = CONFIG.sim.time.dayLengthSeconds;
  const applyConfig = () => { CONFIG.sim.time.dayLengthSeconds = 24 * 3600 / values.gameHoursPerRealHour; };
  applyConfig();

  /** In-game hours since day 1, 00:00, at a (possibly fractional) tick. */
  function totalHours(tick) { return clock.anchorHours + 24 * (tick - clock.anchorTick) / (CONFIG.sim.time.dayLengthSeconds * CONFIG.sim.tickRate); }
  /** Continue the clock from `hours` at `tick` (a loaded save, or a change in how fast time runs). */
  function setClock(tick, hours) { clock.anchorTick = tick; clock.anchorHours = hours; }
  /** Start a new clock (a new world): day 1 at the start hour. */
  function resetClock() { setClock(0, CONFIG.sim.time.startHour); }

  /** Change the live values (speed, day split, time) at `tick`; the clock carries on from the current time. */
  function setLive(partial, tick) {
    const next = sanitize(Object.assign({}, values, partial));
    if (next.gameHoursPerRealHour !== values.gameHoursPerRealHour) setClock(tick, totalHours(tick));
    for (const k of LIVE) values[k] = next[k];
    values.crops = next.crops;
    applyConfig();
  }
  function useTrees(trees) { values.trees = sanitizeTrees(trees); }

  /* ---- the host's own changes (the Admin page), kept in the host's browser ---- */
  function readOverride() { try { const raw = localStorage.getItem(OVERRIDE_KEY); return raw ? sanitize(JSON.parse(raw)) : null; } catch (e) { return null; } }
  function saveOverride(v) { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(sanitize(v))); } catch (e) { /* private window: changes last this session */ } }
  function clearOverride() { try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* nothing stored */ } }
  /** A server is starting on this machine (solo or hosting): the host's saved Admin values (else the file's), and a fresh clock. */
  function startHost() { values = copy(readOverride() || file); applyConfig(); resetClock(); }

  /** What every player needs to match the host: the live values, the trees and the clock. */
  function wire() { return Object.assign(copy(values), { clock: { tick: clock.anchorTick, hours: clock.anchorHours } }); }
  /** A player's machine takes the host's values (the trees only before the land is built: on joining). */
  function applyWire(w, withTrees) {
    if (!plain(w)) return;
    const v = sanitize(w);
    for (const k of LIVE) values[k] = v[k];
    values.crops = v.crops;
    if (withTrees) values.trees = v.trees;
    applyConfig();
    if (plain(w.clock) && Number.isFinite(w.clock.tick) && Number.isFinite(w.clock.hours)) setClock(w.clock.tick, w.clock.hours);
  }

  /** The settings as JSON for js/content/gameSettings.js (only values, in the file's order). */
  function toJSON(v = values) { const s = sanitize(v); return JSON.stringify({ globalSpeed: s.globalSpeed, dayShare: s.dayShare, gameHoursPerRealHour: s.gameHoursPerRealHour, seasonDays: s.seasonDays, crops: s.crops, trees: s.trees }, null, 2); }

  /* ---- what the rest of the game asks ---- */
  /** Every movement speed is multiplied by this (1 = as built). */
  const speed = () => values.globalSpeed / 100;
  /** Where the day starts and ends: the middle of dawn and dusk, around 12:45 (the built-in 54% gives dawn 6:15, dusk 19:15). */
  function dayHours() { const half = 12 * values.dayShare / 100; return { dawn: 12.75 - half, dusk: 12.75 + half }; }
  /** A biome's tree density after its amount (% of normal) and its cap (% of grass tiles, else the game's own `max`). */
  function treeDensity(biome, density, max) {
    const t = values.trees[biome];
    if (!t) return clamp(density, 0, max);
    return clamp(density * (t.amount === undefined ? 100 : t.amount) / 100, 0, t.max === undefined ? max : t.max / 100);
  }

  return { DEFAULTS, LIMITS, LIVE, file, sanitize, sanitizeTrees, sanitizeCrops, get values() { return values; }, builtInDayLength, totalHours, setClock, resetClock, setLive, useTrees,
    readOverride, saveOverride, clearOverride, startHost, wire, applyWire, toJSON, speed, dayHours, treeDensity };
})();
