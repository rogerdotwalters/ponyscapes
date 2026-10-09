'use strict';
/* CLIENT - small sound effects, built from filtered noise and short tones (no files): the bag opening and closing (a leather rustle and a buckle
 * click) and your footsteps. Footsteps follow the ground under you: soft thuds on grass, dull ones on dirt and clay, a crunch on sand, a splash in
 * shallow water, a tick on stone, a knock on a wooden floor indoors, and a clip-clop of hooves when you ride. Nothing plays while you fly or stand still. */
const Sfx = (() => {
  const bus = () => GameAudio.buses && GameAudio.buses.sfx, LEAD = 0.05;      // (a short lead: the clock we read can be a few frames behind the one the sound plays on, and a 70 ms footfall must not be over before it starts)

  /** A burst of noise through one filter, with a quick attack and an exponential fade. Optionally the filter sweeps from freq to freq2. */
  function puff(ctx, { at = 0, len = 0.1, type = 'bandpass', freq = 1000, freq2 = 0, q = 0.8, gain = 0.3, attack = 0.005, pan = 0 }) {
    const t = ctx.currentTime + LEAD + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = GameAudio.noise();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    let tail = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    src.connect(f); f.connect(g); tail.connect(bus());
    src.start(t, Math.random() * 1.5, len + 0.05);
  }
  /** A short pitched knock or click: a sine/triangle that drops in pitch while it fades. */
  function tone(ctx, { at = 0, len = 0.08, from = 200, to = 80, gain = 0.3, type = 'sine', pan = 0 }) {
    const t = ctx.currentTime + LEAD + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    let tail = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    o.connect(g); tail.connect(bus()); o.start(t); o.stop(t + len + 0.02);
  }
  const ready = () => { const c = GameAudio.ctx; return c && bus() && GameAudio.volume('sfx') > 0 ? c : null; };

  /** The bag: opening is a leather flap lifting (a rising rustle) and a buckle; closing is a flap dropping and a soft thump. */
  function bag(open) {
    const ctx = ready(); if (!ctx) return;
    if (open) {
      puff(ctx, { len: 0.16, freq: 500, freq2: 2400, q: 1.1, gain: 0.22, attack: 0.04 });                     // the flap lifts
      puff(ctx, { at: 0.07, len: 0.12, type: 'highpass', freq: 3200, gain: 0.07, attack: 0.02 });             // canvas rustle
      tone(ctx, { at: 0.13, len: 0.05, from: 2100, to: 1500, gain: 0.07, type: 'triangle' });                 // buckle
      tone(ctx, { at: 0.17, len: 0.04, from: 2800, to: 2000, gain: 0.05, type: 'triangle' });
      tone(ctx, { at: 0.02, len: 0.14, from: 150, to: 95, gain: 0.12 });                                      // the weight shifting
    } else {
      puff(ctx, { len: 0.14, freq: 2200, freq2: 450, q: 1.1, gain: 0.2, attack: 0.02 });                      // the flap falls
      puff(ctx, { at: 0.02, len: 0.1, type: 'highpass', freq: 3000, gain: 0.06, attack: 0.02 });
      tone(ctx, { at: 0.11, len: 0.12, from: 130, to: 70, gain: 0.2 });                                       // it settles with a soft thump
      tone(ctx, { at: 0.13, len: 0.05, from: 1900, to: 1300, gain: 0.07, type: 'triangle' });                 // the clasp
    }
  }

  /* ---- footsteps ---- */
  /** One footfall on `ground`: 'grass' | 'dirt' | 'stone' | 'sand' | 'clay' | 'water' | 'wood'. side is -1 / +1 (left / right foot). */
  function step(ground, side, run) {
    const ctx = ready(); if (!ctx) return;
    const v = 1.9 * (run ? 1.15 : 1) * (0.8 + Math.random() * 0.4), pan = side * 0.12, fr = 0.92 + Math.random() * 0.16;
    switch (ground) {
      case 'grass': puff(ctx, { len: 0.11, freq: 1700 * fr, freq2: 900, q: 0.7, gain: 0.06 * v, attack: 0.012, pan }); tone(ctx, { len: 0.07, from: 110 * fr, to: 70, gain: 0.06 * v, pan }); break;
      case 'sand': puff(ctx, { len: 0.17, type: 'highpass', freq: 2600 * fr, gain: 0.05 * v, attack: 0.02, pan }); puff(ctx, { len: 0.1, freq: 1500, q: 0.6, gain: 0.04 * v, attack: 0.015, pan }); break;
      case 'stone': puff(ctx, { len: 0.05, freq: 2400 * fr, q: 1.6, gain: 0.07 * v, pan }); tone(ctx, { len: 0.06, from: 190 * fr, to: 100, gain: 0.07 * v, pan }); break;
      case 'water': puff(ctx, { len: 0.22, freq: 900 * fr, freq2: 2800, q: 0.9, gain: 0.1 * v, attack: 0.025, pan }); puff(ctx, { at: 0.05, len: 0.14, type: 'highpass', freq: 3500, gain: 0.04 * v, pan }); break;
      case 'wood': tone(ctx, { len: 0.09, from: 240 * fr, to: 130, gain: 0.1 * v, type: 'triangle', pan }); puff(ctx, { len: 0.04, freq: 1800 * fr, q: 1.2, gain: 0.05 * v, pan }); break;
      default: tone(ctx, { len: 0.08, from: 125 * fr, to: 65, gain: 0.08 * v, pan }); puff(ctx, { len: 0.07, freq: 1100 * fr, q: 0.6, gain: 0.05 * v, attack: 0.01, pan }); break;      // dirt, clay
    }
  }
  /** A hoofbeat: a hollow clop (two near-together on the beat, like a walking pony). */
  function hoof(ground, flip) {
    const ctx = ready(); if (!ctx) return;
    const soft = 1.6 * (ground === 'grass' || ground === 'sand' ? 0.7 : 1), hard = ground === 'stone' || ground === 'wood' ? 1.4 : 1, fr = 0.94 + Math.random() * 0.12;
    tone(ctx, { len: 0.07, from: (flip ? 330 : 280) * fr, to: 150, gain: 0.1 * soft, type: 'triangle' });
    puff(ctx, { len: 0.045, freq: (1500 + 400 * hard) * fr, q: 1.4, gain: 0.06 * soft * hard });
    if (ground === 'water') puff(ctx, { at: 0.02, len: 0.2, freq: 900, freq2: 2600, gain: 0.07 });
  }
  /** The oars: a soft dip and drip, once per stroke. */
  function oar() {
    const ctx = ready(); if (!ctx) return;
    puff(ctx, { len: 0.28, freq: 600, freq2: 1800, q: 0.8, gain: 0.13, attack: 0.05 });
    puff(ctx, { at: 0.12, len: 0.12, type: 'highpass', freq: 3800, gain: 0.045 });
  }

  const groundOf = (map, x, y) => {
    const tx = Math.floor(x), ty = Math.floor(y), t = map.tile(tx, ty);
    if (t >= INTERIOR_TILE_BASE) return 'wood';
    switch (t) { case TILE.GRASS: return 'grass'; case TILE.DIRT: return 'dirt'; case TILE.CLAY: return 'clay'; case TILE.SAND: return 'sand'; case TILE.SHALLOW: case TILE.WATER: return 'water'; case TILE.STONE: case TILE.CAVE: return 'stone'; default: return 'dirt'; }
  };

  /** Called every frame with the game: drops a footstep each time the local player has travelled a stride (shorter strides at a walk, longer at a run). */
  class Footsteps {
    constructor(game) { this.game = game; this.dist = 0; this.last = null; this.side = 1; this.beat = 0; }
    update() {
      const p = this.game.local; if (!p || !this.game.map) { this.last = null; return; }
      const prev = this.last; this.last = { x: p.x, y: p.y, map: this.game.map };
      if (!prev || prev.map !== this.last.map) { this.dist = 0; return; }
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (d > 2 || d <= 0 || p.asleep || p.state === 'idle') return;                           // (a jump of more than a tile or two is a teleport, not a stride)
      if (p.mount && p.flying) return;                                                         // wings make no footfalls
      this.dist += d;
      const run = p.state === 'run', riding = !!p.mount, boat = !!p.boat;
      const stride = boat ? 2 : riding ? 1.9 : run ? 1.05 : 0.8;
      if (this.dist < stride) return;
      this.dist -= stride; this.side = -this.side;
      if (boat || (this.game.localBoat)) return oar();
      const ground = groundOf(this.game.map, p.x, p.y);
      if (riding) { hoof(ground, this.side > 0); setTimeout(() => hoof(ground, this.side < 0), 120); }
      else step(ground, this.side, run);
    }
  }
  return { bag, step, hoof, oar, Footsteps };
})();
