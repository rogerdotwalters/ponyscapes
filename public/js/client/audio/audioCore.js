'use strict';
/* CLIENT - the one Web Audio context the game shares (weather, footsteps, the bag, the music), and the three volumes the player sets in
 * Menu > Controls > Mouse & touch (kept in this browser; 0 switches that kind off). Browsers keep sound off until the person has touched the page,
 * so the context is made on the first tap, click or key; whatever wants sound registers with onReady() and is started then. Nothing here
 * uses sound files: every sound is built from oscillators and filtered noise. */
const GameAudio = (() => {
  const KEYS = { weather: 'ponyscapes.weatherVolume', music: 'ponyscapes.musicVolume', sfx: 'ponyscapes.sfxVolume' };
  const DEFAULTS = { weather: 0.5, music: 0.5, sfx: 0.7 };
  const listeners = [], volumeListeners = [];
  const state = { ctx: null, ok: typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext), noiseBuf: null, buses: null };

  const volume = kind => {
    try { const v = parseFloat(localStorage.getItem(KEYS[kind])); if (v >= 0 && v <= 1) return v; } catch (e) { /* private window */ }
    return DEFAULTS[kind];
  };
  const setVolume = (kind, v) => {
    const value = clamp(Number(v) || 0, 0, 1);
    try { localStorage.setItem(KEYS[kind], String(value)); } catch (e) { /* lasts this session */ }
    for (const fn of volumeListeners) fn(kind, value);
  };

  function start() {
    if (!state.ok) return;
    try {
      if (!state.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.ctx = new AC();
        const out = state.ctx.createDynamicsCompressor();                       // a gentle limiter so rain, music and steps never add up to a blast
        out.threshold.value = -14; out.knee.value = 18; out.ratio.value = 3; out.attack.value = 0.01; out.release.value = 0.3;
        out.connect(state.ctx.destination);
        const bus = v => { const g = state.ctx.createGain(); g.gain.value = v; g.connect(out); return g; };
        state.buses = { music: bus(volume('music')), sfx: bus(volume('sfx')), weather: bus(volume('weather')) };
        volumeListeners.push((kind, v) => { const b = state.buses[kind]; if (b) b.gain.setTargetAtTime(v, state.ctx.currentTime, 0.1); });
        for (const fn of listeners) fn(state.ctx);
      }
      if (state.ctx.state === 'suspended') state.ctx.resume();
    } catch (e) { state.ok = false; }
  }

  if (state.ok) {
    const wake = () => { start(); if (state.ctx && state.ctx.state === 'running') for (const t of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(t, wake, true); };
    for (const t of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(t, wake, true);
    document.addEventListener('visibilitychange', () => { const c = state.ctx; if (!c) return; if (document.hidden) c.suspend(); else c.resume(); });      // (no sound from a hidden tab)
  }

  return {
    get ctx() { return state.ctx && state.ctx.state === 'running' ? state.ctx : null; },
    get buses() { return state.buses; },
    volume, setVolume,
    /** Run fn(ctx) once the context exists (at once if it already does). */
    onReady(fn) { if (state.ctx) fn(state.ctx); else listeners.push(fn); },
    onVolume(fn) { volumeListeners.push(fn); },
    /** A shared 2-second buffer of white noise (every short burst of "air" in the sound effects reads from it). */
    noise() {
      const ctx = state.ctx;
      if (!state.noiseBuf && ctx) { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; state.noiseBuf = b; }
      return state.noiseBuf;
    }
  };
})();
