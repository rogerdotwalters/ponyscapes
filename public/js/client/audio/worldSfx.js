'use strict';
/* CLIENT - the sounds of the world, built (like everything here) from filtered noise and short tones, no files. Two halves:
 *   Sounds       one-shot effects added to Sfx: doors, splashes and puddles, mounting, tool swings, hits, chopping, felling, rustling bushes, picking,
 *                lasso, eating and drinking, entering a cave, slime squelches, animal calls, and an experimental NPC murmur.
 *   WorldSfx     the listener: it watches the game's events (chop, hit, lasso, pick, eat, door, ...) and the world around you each frame (a swing starting,
 *                you dismounting, a bush brushing past, animals calling and moving, villagers speaking) and plays the right sound, quieter and panned the
 *                further away it is. All of it follows the Footsteps & bag volume (Menu > Controls > Mouse & touch); the murmur has its own switch there. */
(() => {
  const clampv = (v, a, b) => Math.max(a, Math.min(b, v));
  const bus = () => GameAudio.buses && GameAudio.buses.sfx, LEAD = Sfx.LEAD, rnd = Math.random;
  const P = (ctx, o, a) => Sfx.puff(ctx, Object.assign({}, a, { vol: o.vol, pan: o.pan })), T = (ctx, o, a) => Sfx.tone(ctx, Object.assign({}, a, { vol: o.vol, pan: o.pan }));

  /** A voiced sound: an oscillator that glides from `from` through `mid` to `to`, with an optional vibrato and formant filter. Used for calls and murmurs. */
  function voice(ctx, o, a) {
    const { at = 0, len = 0.3, from = 300, mid = 0, to = 0, type = 'sawtooth', gain = 0.2, formant = 0, q = 2, vib = 0, vibRate = 7, attack = 0.02, hold = 0.5 } = a, g0 = gain * o.vol;
    if (g0 < 0.0004) return;
    const t = ctx.currentTime + LEAD + at, osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    osc.type = type; osc.frequency.setValueAtTime(from, t); if (mid) osc.frequency.linearRampToValueAtTime(mid, t + len * 0.45); osc.frequency.linearRampToValueAtTime(to || mid || from, t + len);
    if (vib) { const lfo = ctx.createOscillator(), amt = ctx.createGain(); lfo.frequency.value = vibRate; amt.gain.value = from * vib; lfo.connect(amt); amt.connect(osc.frequency); lfo.start(t); lfo.stop(t + len + 0.05); }
    f.type = formant ? 'bandpass' : 'lowpass'; f.frequency.value = formant || Math.max(400, from * 3); f.Q.value = formant ? q : 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + attack); g.gain.setValueAtTime(g0, t + Math.max(attack, len * hold)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(f); f.connect(g); let tail = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); tail = p; }
    tail.connect(bus()); osc.start(t); osc.stop(t + len + 0.05);
  }
  const V = (ctx, o, a) => voice(ctx, o, a);
  const gentle = o => ({ vol: o && o.vol != null ? o.vol : 1, pan: o && o.pan || 0 });

  /* ---- animal calls: each takes (ctx, o) with o = { vol, pan } ---- */
  const growl = (c, o, deep = 1, len = 0.7) => { V(c, o, { from: 85 / deep, to: 62 / deep, len, gain: 0.22, formant: 320, q: 1, vib: 0.12, vibRate: 30 }); P(c, o, { len: len * 0.9, type: 'lowpass', freq: 600, gain: 0.1, attack: 0.04 }); };
  const CALLS = {
    chicken: (c, o) => [0, 0.11, 0.2].forEach(k => V(c, o, { at: k, from: 720, to: 520, len: 0.07, type: 'triangle', gain: 0.2, formant: 1400, q: 1.5 })),
    duck: (c, o) => [0, 0.22].forEach(k => V(c, o, { at: k, from: 500, to: 330, len: 0.16, gain: 0.17, formant: 1000, q: 2 })),
    sheep: (c, o) => V(c, o, { from: 360, mid: 340, to: 290, len: 0.75, gain: 0.2, formant: 900, q: 3, vib: 0.06, vibRate: 22 }),
    goat: (c, o) => V(c, o, { from: 520, mid: 470, to: 400, len: 0.5, gain: 0.2, formant: 1100, q: 3, vib: 0.08, vibRate: 28 }),
    pony: (c, o) => { V(c, o, { from: 520, mid: 1000, to: 440, len: 0.95, gain: 0.18, formant: 1400, q: 1.5, vib: 0.03, vibRate: 9, hold: 0.6 }); P(c, o, { at: 0.05, len: 0.5, type: 'highpass', freq: 2500, gain: 0.05, attack: 0.1 }); },
    dog: (c, o) => [0, 0.22].forEach(k => { V(c, o, { at: k, from: 340, to: 200, len: 0.12, gain: 0.22, formant: 800, q: 2 }); P(c, o, { at: k, len: 0.08, freq: 900, gain: 0.12 }); }),
    cat: (c, o) => V(c, o, { from: 560, mid: 920, to: 620, len: 0.55, type: 'triangle', gain: 0.17, formant: 1800, q: 2, vib: 0.02, vibRate: 6 }),
    wolf: (c, o) => V(c, o, { from: 300, mid: 540, to: 380, len: 1.9, gain: 0.14, formant: 700, q: 2, vib: 0.02, vibRate: 5, hold: 0.7 }),
    lion: (c, o) => growl(c, o, 1, 0.9), panther: (c, o) => growl(c, o, 1, 0.8), bear: (c, o) => growl(c, o, 1.3, 1), manticore: (c, o) => growl(c, o, 1, 1),
    dragon: (c, o) => growl(c, o, 1.5, 1.2), boar: (c, o) => [0, 0.26].forEach(k => { V(c, o, { at: k, from: 120, to: 85, len: 0.18, gain: 0.22, formant: 400, q: 1.5 }); P(c, o, { at: k, len: 0.12, type: 'lowpass', freq: 700, gain: 0.1 }); }),
    beastman: (c, o) => [0, 0.2].forEach(k => V(c, o, { at: k, from: 150, to: 100, len: 0.17, gain: 0.2, formant: 500, q: 1.5 })),
    deer: (c, o) => P(c, o, { len: 0.28, freq: 900, freq2: 600, q: 1, gain: 0.13, attack: 0.04 }),
    elk: (c, o) => V(c, o, { from: 320, mid: 760, to: 420, len: 1.2, type: 'sine', gain: 0.15, formant: 600, q: 1.5, vib: 0.02, vibRate: 6 }),
    fox: (c, o) => [0, 0.17].forEach(k => V(c, o, { at: k, from: 800, to: 1100, len: 0.1, gain: 0.17, formant: 1800, q: 2 })),
    owl: (c, o) => [0, 0.45].forEach(k => V(c, o, { at: k, from: 400, to: 350, len: 0.32, type: 'sine', gain: 0.17, formant: 500, q: 4 })),
    bat: (c, o) => [0, 0.08, 0.16].forEach(k => V(c, o, { at: k, from: 4200, to: 3600, len: 0.05, type: 'sine', gain: 0.08 })),
    snake: (c, o) => P(c, o, { len: 0.75, type: 'highpass', freq: 3500, gain: 0.1, attack: 0.1 }),
    spider: (c, o) => { for (let i = 0; i < 6; i++) P(c, o, { at: i * 0.045, len: 0.02, type: 'highpass', freq: 2600, gain: 0.07 }); },
    monkey: (c, o) => { for (let i = 0; i < 4; i++) V(c, o, { at: i * 0.09, from: 900, to: 1400, len: 0.08, type: 'triangle', gain: 0.13, formant: 1600, q: 2 }); },
    toucan: (c, o) => [0, 0.3].forEach(k => V(c, o, { at: k, from: 340, to: 270, len: 0.26, gain: 0.17, formant: 700, q: 2 })),
    slime: (c, o) => Sfx.slime(o.vol, o.pan)
  };
  const ALIAS = { centipede: 'spider', lemur: 'monkey', dragon_whelp: 'dragon', dragon_young: 'dragon', elder_dragon: 'dragon', bear_cub: 'cat', boss_ancient_dragon: 'dragon', boss_broodmother: 'spider', boss_cave_bear: 'bear', boss_centipede_queen: 'spider', boss_drake_matriarch: 'dragon' };
  const callOf = (type, def) => CALLS[type] || CALLS[ALIAS[type]] || (def && def.pony ? CALLS.pony : null);

  /* ---- one-shot effects, added onto Sfx. v is a volume 0..1, pan -1..1 ---- */
  const ready = () => Sfx.ready();
  const fx = {
    /** A wooden door: opening is a creak and a click, closing a thud and a latch. */
    door(open, v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      if (open) { V(c, o, { from: 150, mid: 260, to: 210, len: 0.4, gain: 0.1, formant: 650, q: 4, vib: 0.05, vibRate: 14, hold: 0.8 }); T(c, o, { at: 0.02, len: 0.04, from: 1600, to: 1100, gain: 0.07, type: 'triangle' }); }
      else { T(c, o, { len: 0.14, from: 150, to: 62, gain: 0.2 }); P(c, o, { len: 0.07, type: 'lowpass', freq: 700, gain: 0.1 }); T(c, o, { at: 0.1, len: 0.04, from: 1900, to: 1300, gain: 0.08, type: 'triangle' }); }
    },
    /** A doorway: the door opens, you pass, it swings shut behind you. */
    doorPass(v = 1) { fx.door(true, v); setTimeout(() => fx.door(false, v), 430); },
    splash(v = 1, pan = 0, run = false) {
      const c = ready(); if (!c) return; const o = { vol: v * (run ? 1.1 : 1), pan };
      P(c, o, { len: 0.28, freq: 900, freq2: 3200, q: 0.9, gain: 0.2, attack: 0.02 }); P(c, o, { at: 0.04, len: 0.16, type: 'highpass', freq: 3600, gain: 0.08 });
      for (let i = 0; i < 3; i++) T(c, o, { at: 0.07 + i * 0.07 + rnd() * 0.03, len: 0.04, from: 900 + rnd() * 700, to: 1700 + rnd() * 800, gain: 0.05, type: 'sine' });
    },
    puddle(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; P(c, o, { len: 0.1, type: 'highpass', freq: 2400, gain: 0.1 }); T(c, o, { len: 0.06, from: 500 + rnd() * 200, to: 950, gain: 0.09 }); },
    drip(v = 1) { const c = ready(); if (!c) return; T(c, { vol: v, pan: 0 }, { len: 0.07, from: 1500, to: 800, gain: 0.07 }); },
    /** Mounting: a leather creak, a thud into the saddle and a friendly nicker. */
    mount(v = 1) {
      const c = ready(); if (!c) return; const o = { vol: v, pan: 0 };
      P(c, o, { len: 0.22, freq: 400, freq2: 900, q: 1.2, gain: 0.12, attack: 0.05 }); T(c, o, { at: 0.12, len: 0.12, from: 120, to: 62, gain: 0.26 }); T(c, o, { at: 0.2, len: 0.04, from: 1500, to: 1100, gain: 0.05, type: 'triangle' });
      V(c, o, { at: 0.25, from: 380, mid: 520, to: 360, len: 0.4, gain: 0.1, formant: 1100, q: 1.5, vib: 0.03, vibRate: 10 });
    },
    dismount(v = 1) { const c = ready(); if (!c) return; const o = { vol: v, pan: 0 }; P(c, o, { len: 0.16, freq: 800, freq2: 350, q: 1, gain: 0.1, attack: 0.03 }); T(c, o, { at: 0.1, len: 0.12, from: 130, to: 58, gain: 0.28 }); },
    /** A tool swung: a whoosh whose weight and pitch follow the tool. */
    swing(kind, v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      const W = { axe: [520, 190, 0.26, 0.2], hammer: [480, 170, 0.28, 0.2], pick: [560, 200, 0.24, 0.2], shovel: [800, 350, 0.22, 0.17], hoe: [800, 350, 0.22, 0.17], sword: [1900, 800, 0.17, 0.2], knife: [2600, 1200, 0.11, 0.14], spear: [2000, 650, 0.2, 0.18], rod: [3000, 1500, 0.13, 0.12], scythe: [1200, 500, 0.22, 0.17], leash: [650, 1200, 0.36, 0.17] }[kind] || [900, 400, 0.2, 0.15];
      P(c, o, { len: W[2], freq: W[0], freq2: W[1], q: 1, gain: W[3], attack: W[2] * 0.4 });
      if (kind === 'leash') T(c, o, { len: 0.3, from: 140, to: 190, gain: 0.04, type: 'sawtooth' });
    },
    /** A blow landing on a creature: a meaty thud and a crack. */
    hit(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; T(c, o, { len: 0.13, from: 170 + rnd() * 40, to: 60, gain: 0.34 }); P(c, o, { len: 0.07, type: 'lowpass', freq: 900, gain: 0.18 }); P(c, o, { len: 0.03, freq: 2300, q: 1.5, gain: 0.14 }); },
    /** A creature falling: a descending squeal and a thud (a slime splats instead). */
    kill(animal, v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      if (animal === 'slime') { fx.slime(v, pan, true); return; }
      V(c, o, { from: 520, to: 140, len: 0.3, type: 'triangle', gain: 0.12 }); T(c, o, { at: 0.22, len: 0.16, from: 110, to: 50, gain: 0.3 });
    },
    bite(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; P(c, o, { len: 0.04, type: 'highpass', freq: 3000, gain: 0.15 }); T(c, o, { at: 0.02, len: 0.1, from: 200, to: 90, gain: 0.2 }); },
    hurt(v = 1) { const c = ready(); if (!c) return; const o = { vol: v, pan: 0 }; T(c, o, { len: 0.14, from: 140, to: 70, gain: 0.3 }); V(c, o, { at: 0.02, from: 380, to: 230, len: 0.16, gain: 0.1, formant: 800, q: 2 }); },
    /** Chopping: a sharp crack and a hollow knock. */
    chop(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; P(c, o, { len: 0.06, freq: 1500, q: 2, gain: 0.32 }); T(c, o, { len: 0.1, from: 330, to: 190, gain: 0.26, type: 'triangle' }); T(c, o, { at: 0.03, len: 0.18, from: 125, to: 88, gain: 0.2 }); },
    /** A tree falling: creaks, a rush of leaves and a heavy thud. */
    fell(v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      V(c, o, { from: 130, mid: 90, to: 70, len: 0.7, gain: 0.13, formant: 500, q: 5, vib: 0.08, vibRate: 11 }); P(c, o, { len: 0.8, freq: 1800, freq2: 700, q: 0.6, gain: 0.2, attack: 0.5 });
      T(c, o, { at: 0.7, len: 0.4, from: 75, to: 38, gain: 0.5 }); P(c, o, { at: 0.7, len: 0.3, type: 'lowpass', freq: 400, gain: 0.25 }); P(c, o, { at: 0.75, len: 0.4, freq: 3000, q: 0.6, gain: 0.1 });
    },
    /** Leaves brushed or shaken. */
    rustle(v = 1, pan = 0, n = 1) { const c = ready(); if (!c) return; const o = { vol: v, pan }; for (let i = 0; i < n; i++) P(c, o, { at: i * 0.07, len: 0.16 + rnd() * 0.06, freq: 3200 + rnd() * 900, q: 0.7, gain: 0.13, attack: 0.03 }); },
    /** Picking something: a rustle and a snap (bush), a shake and a falling thunk (tree), a clack (stone), a pluck (crops). */
    pick(prop, v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      if (prop === 'stone' || prop === 'clay') { P(c, o, { len: 0.03, freq: 2800, q: 1.5, gain: 0.2 }); T(c, o, { len: 0.06, from: 700, to: 400, gain: 0.15, type: 'triangle' }); }
      else if (prop === 'apple_tree') { fx.rustle(v, pan, 3); T(c, o, { at: 0.3, len: 0.09, from: 220, to: 120, gain: 0.2 }); T(c, o, { at: 0.46, len: 0.07, from: 190, to: 110, gain: 0.14 }); }
      else if (prop === 'bottle') { T(c, o, { len: 0.1, from: 1500, to: 1100, gain: 0.12, type: 'triangle' }); P(c, o, { len: 0.06, freq: 2500, gain: 0.08 }); }
      else { fx.rustle(v, pan, 2); T(c, o, { at: 0.1, len: 0.04, from: 1500, to: 900, gain: 0.09, type: 'triangle' }); }
    },
    pluck(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; T(c, o, { len: 0.05, from: 520, to: 820, gain: 0.14, type: 'triangle' }); P(c, o, { len: 0.07, freq: 2000, gain: 0.08 }); },
    /** The lasso landing: a snug tightening if it caught, a slap on the ground if it missed. */
    lassoLand(hit, v = 1, pan = 0) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      if (hit) { P(c, o, { len: 0.18, freq: 700, freq2: 1500, q: 2, gain: 0.12, attack: 0.04 }); T(c, o, { at: 0.04, len: 0.1, from: 200, to: 120, gain: 0.2 }); } else { P(c, o, { len: 0.09, type: 'lowpass', freq: 800, gain: 0.18 }); T(c, o, { len: 0.1, from: 100, to: 60, gain: 0.16 }); }
    },
    snap(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; P(c, o, { len: 0.04, type: 'highpass', freq: 4000, gain: 0.25 }); T(c, o, { len: 0.1, from: 900, to: 280, gain: 0.18, type: 'triangle' }); },
    /** A happy little chime (an animal tamed). */
    chime(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; [880, 1175, 1568].forEach((f, i) => T(c, o, { at: i * 0.09, len: 0.45, from: f, to: f * 0.99, gain: 0.1 })); },
    /** Eating: a crunch, three chomps. */
    eat(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; for (let i = 0; i < 3; i++) { P(c, o, { at: i * 0.12, len: 0.05, freq: 1800 + rnd() * 300, q: 1.2, gain: 0.26 }); T(c, o, { at: i * 0.12, len: 0.05, from: 260, to: 190, gain: 0.1 }); } },
    /** An animal munching: softer, slower chewing. */
    munch(v = 1, pan = 0) { const c = ready(); if (!c) return; const o = { vol: v, pan }; for (let i = 0; i < 4; i++) P(c, o, { at: i * 0.17, len: 0.07, freq: 900 + rnd() * 200, q: 0.9, gain: 0.14, attack: 0.012 }); },
    drink(v = 1) { const c = ready(); if (!c) return; const o = { vol: v, pan: 0 }; [0, 0.2].forEach(k => { T(c, o, { at: k, len: 0.12, from: 420, to: 190, gain: 0.14 }); P(c, o, { at: k, len: 0.1, type: 'lowpass', freq: 600, gain: 0.07 }); }); },
    /** Entering a cave: a cold rush of air, a low rumble, the scrape of stone and a few echoing drips. */
    cave(v = 1) {
      const c = ready(); if (!c) return; const o = { vol: v, pan: 0 };
      P(c, o, { len: 0.9, freq: 700, freq2: 220, q: 0.8, gain: 0.16, attack: 0.25 }); P(c, o, { len: 1.1, type: 'lowpass', freq: 220, freq2: 70, gain: 0.25, attack: 0.2 }); P(c, o, { at: 0.2, len: 0.35, freq: 700, q: 1.5, gain: 0.07 });
      [0.55, 1.1, 1.8].forEach((k, i) => { for (let e = 0; e < 3; e++) T(c, o, { at: k + e * 0.18, len: 0.09, from: 1400 - i * 100, to: 900, gain: 0.09 / (e + 1) }); });
    },
    /** A slime: a wet squelch and a bubble (`splat` is a bigger, final one). */
    slime(v = 1, pan = 0, splat = false) {
      const c = ready(); if (!c) return; const o = { vol: v, pan };
      P(c, o, { len: splat ? 0.3 : 0.17, freq: 500, freq2: 1300, q: 1.5, gain: splat ? 0.22 : 0.12, attack: 0.03 }); V(c, o, { from: 190, mid: 480, to: 260, len: splat ? 0.3 : 0.2, type: 'sine', gain: splat ? 0.2 : 0.12, formant: 600, q: 3 });
      T(c, o, { at: 0.08, len: 0.07, from: 320 + rnd() * 150, to: 720, gain: 0.07 });
    },
    call(type, def, v = 1, pan = 0) { const c = ready(), f = callOf(type, def); if (c && f) f(c, { vol: Math.min(1, v * 1.5), pan }); },
    /** The experimental NPC murmur: a string of soft syllables (a voice through two vowel formants), `len` seconds long, `pitch` Hz. */
    murmur(len, pitch, v = 1, pan = 0) {
      const c = ready(); if (!c || v < 0.02) return; const o = { vol: v, pan };
      const VOW = [[700, 1200], [500, 1800], [400, 900], [600, 1500], [350, 2300], [800, 1300]];
      let t = 0; while (t < len) {
        const syl = 0.06 + rnd() * 0.09, [f1, f2] = VOW[rnd() * VOW.length | 0], f0 = pitch * (0.9 + rnd() * 0.25);
        V(c, o, { at: t, from: f0, to: f0 * (0.94 + rnd() * 0.12), len: syl, gain: 0.07, formant: f1, q: 5, attack: 0.012, hold: 0.55 }); V(c, o, { at: t, from: f0, to: f0, len: syl, gain: 0.045, formant: f2, q: 6, attack: 0.012, hold: 0.55 });
        t += syl + (rnd() < 0.22 ? 0.14 + rnd() * 0.16 : 0.012 + rnd() * 0.03);
      }
    }
  };
  /* levels: some effects are naturally loud, some faint; a factor on the volume argument (at the given position) evens them out (measured offline, see the PR) */
  const TRIM = { hit: [0.6, 0], chop: [0.6, 0], fell: [0.5, 0], snap: [0.5, 0], hurt: [0.8, 0], dismount: [0.7, 0], kill: [0.8, 1], mount: [0.8, 0], murmur: [3, 2], swing: [1.8, 1] };
  for (const k in TRIM) { const f = fx[k], [m, i] = TRIM[k]; fx[k] = (...a) => { a[i] = (a[i] === undefined ? 1 : a[i]) * m; return f(...a); }; }
  Object.assign(Sfx, fx);

  /* ---- the listener ---- */
  const MURMUR_KEY = 'ponyscapes.npcMurmur';
  const hash = str => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };
  class WorldSfx {
    static get murmurOn() { try { return localStorage.getItem(MURMUR_KEY) !== '0'; } catch (e) { return true; } }
    static setMurmur(on) { try { localStorage.setItem(MURMUR_KEY, on ? '1' : '0'); } catch (e) { /* lasts this session */ } }

    constructor(game) {
      this.game = game; this.t = 0; this.swingPrev = {}; this.mountPrev = ''; this.kind = game.map ? game.map.kind : 'world'; this.nextCall = {}; this.nextSlime = {}; this.nextMunch = {}; this.nextMurmur = {}; this.said = {}; this.lastBush = 0; this.lastCall = 0; this.bushSeen = {};
      const on = (ev, fn) => game.events.on(ev, e => { try { fn(e || {}); } catch (err) { /* a sound must never break the game */ } });
      const me = () => game.local, mine = e => !e.to || e.to === game.myId;
      on('chop', e => this._at(e, (v, p) => Sfx.chop(v, p)));
      on('fell', e => this._at(e, (v, p) => Sfx.fell(v, p), 22));
      on('hit', e => this._at(e, (v, p) => Sfx.hit(v, p)));
      on('kill', e => this._at(e, (v, p) => Sfx.kill(e.animal, v, p)));
      on('bite', e => this._at(e, (v, p) => Sfx.bite(v, p)));
      on('hurt', e => { if (mine(e) || (e.to === undefined)) this._at(e, (v, p) => (e.to === game.myId ? Sfx.hurt(1) : Sfx.hit(v * 0.7, p))); });
      on('lasso', e => this._at({ x: e.x0, y: e.y0 }, (v, p) => setTimeout(() => Sfx.lassoLand(e.hit, v, p), 220)));
      on('caught', e => this._at(e, (v, p) => Sfx.lassoLand(true, v, p)));
      on('brokeFree', e => this._at(e, (v, p) => Sfx.snap(v, p)));
      on('letGo', e => this._at(e, (v, p) => Sfx.rustle(v * 0.6, p)));
      on('tamed', e => this._at(e, (v, p) => Sfx.chime(v, p)));
      on('pick', e => this._at(e, (v, p) => Sfx.pick(e.prop, v, p)));
      on('harvested', e => this._at(e, (v, p) => Sfx.pluck(v, p)));
      on('eat', e => { if (mine(e)) Sfx.eat(1); });
      on('drink', e => { if (mine(e)) Sfx.drink(1); });
      on('fed', e => { if (mine(e)) this._at(e, (v, p) => setTimeout(() => Sfx.munch(v, p), 150)); });
      on('mounted', e => { if (mine(e)) Sfx.mount(1); });
      on('enteredCave', e => { if (mine(e)) Sfx.cave(1); });
      on('door', e => this._at({ x: e.tx + 0.5, y: e.ty + 0.5 }, (v, p) => Sfx.door(e.open, v, p), 14));
      on('gridChanged', e => {                                                                                              // a doorway into or out of a building: it opens, you pass, it closes
        const was = this.kind, now = e.kind || (game.map && game.map.kind); this.kind = now;
        if ((was === 'world' && now === 'room') || (was === 'room' && now === 'world')) Sfx.doorPass(0.9);
      });
      this.me = me;
    }

    /** Play fn(volume, pan) for an event at (e.x, e.y): quieter and panned by distance from you. No position means right here, full volume. */
    _at(e, fn, range = 16) {
      const p = this.me(), x = e.x, y = e.y;
      if (!p || x === undefined || y === undefined) return fn(1, 0);
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > range) return;
      fn(Math.pow(1 - d / range, 1.3), clampv((dx - dy) / 10, -1, 1) * 0.7);
    }

    /** Someone is talking to a villager (the dialogue just opened): a short greeting murmur. */
    talk(npc) { if (WorldSfx.murmurOn && npc) Sfx.murmur(0.9 + rnd() * 0.5, 105 + hash(String(npc.id || npc.type)) % 150, 0.9, 0); }

    update(dt) {
      const game = this.game, p = game.local; this.t += dt;
      if (!p || !game.map || GameAudio.volume('sfx') <= 0 || !GameAudio.ctx) return;
      this.kind = game.map.kind;
      /* swings: a tool starts to swing (yours, then other players') */
      const sw = game.localSwingT > 0, was = this.swingPrev.me;
      if (sw && !was) { const tool = ItemDB.getTool(game.heldItemId()); Sfx.swing(tool ? tool.kind : 'axe', 1); }
      this.swingPrev.me = sw;
      const last = game.snapshots && game.snapshots[game.snapshots.length - 1], players = (last && last.players) || {};
      for (const id in players) {
        if (id === game.myId) continue; const o = players[id], on = o.swingT > 0;
        if (on && !this.swingPrev[id]) { const tool = ItemDB.getTool(o.held); this._at(o, (v, pan) => Sfx.swing(tool ? tool.kind : 'axe', v * 0.8, pan), 14); }
        this.swingPrev[id] = on;
      }
      /* dismounting */
      const mount = p.mount || ''; if (this.mountPrev && !mount && !p.flying) Sfx.dismount(0.9); this.mountPrev = mount;
      /* running past a bush */
      if (p.state !== 'idle' && !p.boat && !(p.mount && p.flying) && game.map.peekPropAt && this.t - this.lastBush > 0.18) {
        const tx0 = Math.floor(p.x), ty0 = Math.floor(p.y);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const pr = game.map.peekPropAt(tx0 + dx, ty0 + dy); if (!pr || pr.t !== 'bush' || pr.cut) continue;
          if (Math.hypot(pr.x - p.x, pr.y - p.y) > 0.85) continue;
          const key = (tx0 + dx) + ',' + (ty0 + dy); if (this.t - (this.bushSeen[key] || -9) < 1.4) continue;
          this.bushSeen[key] = this.t; this.lastBush = this.t; Sfx.rustle(0.7 + (p.state === 'run' ? 0.3 : 0), 0, 2); dx = 2; break;
        }
      }
      /* animals: calls now and then, slimes squelching as they move, grazers munching */
      const animals = game.latestAnimals ? game.latestAnimals() : {}, near = [];
      for (const id in animals) { const a = animals[id], d = Math.hypot(a.x - p.x, a.y - p.y); if (d < 18) near.push([d, id, a]); }
      near.sort((u, v) => u[0] - v[0]);
      for (const [d, id, a] of near.slice(0, 8)) {
        const def = AnimalDefs[a.type], vol = Math.pow(1 - d / 18, 1.3), pan = clampv(((a.x - p.x) - (a.y - p.y)) / 10, -1, 1) * 0.7, moving = Math.hypot(a.vx || 0, a.vy || 0) > 0.15;
        if (a.type === 'slime') {
          if (moving && this.t >= (this.nextSlime[id] || 0)) { this.nextSlime[id] = this.t + 0.5 + rnd() * 0.45; Sfx.slime(vol * 0.9, pan); }
          continue;
        }
        if (!def || !callOf(a.type, def)) continue;
        const hostile = !!(def.hostile || def.boss), eager = hostile && a.state === 'chase';
        if (this.nextCall[id] === undefined) this.nextCall[id] = this.t + 3 + rnd() * 14;
        if (this.t >= this.nextCall[id] && this.t - this.lastCall > 1.2) {
          this.nextCall[id] = this.t + (eager ? 2.5 + rnd() * 3 : hostile ? 14 + rnd() * 20 : 12 + rnd() * 26); this.lastCall = this.t;
          Sfx.call(a.type, def, vol, pan);
        }
        if (!hostile && !moving && a.state === 'idle' && ['sheep', 'goat', 'deer', 'elk', 'rabbit'].includes(a.type) || (def.pony && !moving && a.state === 'idle')) {
          if (this.nextMunch[id] === undefined) this.nextMunch[id] = this.t + 6 + rnd() * 18;
          if (this.t >= this.nextMunch[id] && d < 10) { this.nextMunch[id] = this.t + 14 + rnd() * 24; Sfx.munch(vol * 0.8, pan); }
        }
      }
      /* villagers: a murmur when one speaks (and a soft one now and then when you are among them) */
      if (WorldSfx.murmurOn && game.npcs) {
        let spoke = 0;
        for (const id in game.npcs) {
          const n = game.npcs[id], d = Math.hypot(n.x - p.x, n.y - p.y); if (d > 14) continue;
          const say = n.say || '', pitch = 105 + hash(String(n.type) + id) % 150, vol = Math.pow(1 - d / 14, 1.2), pan = clampv(((n.x - p.x) - (n.y - p.y)) / 10, -1, 1) * 0.7;
          if (say && say !== this.said[id]) { Sfx.murmur(clampv(say.length * 0.05, 0.6, 3.2), pitch, vol, pan); spoke++; }
          this.said[id] = say;
          if (!say && d < 6 && !spoke) {
            if (this.nextMurmur[id] === undefined) this.nextMurmur[id] = this.t + 4 + rnd() * 14;
            if (this.t >= this.nextMurmur[id]) { this.nextMurmur[id] = this.t + 12 + rnd() * 25; Sfx.murmur(0.7 + rnd() * 0.8, pitch, vol * 0.35, pan); spoke++; }
          }
        }
      }
    }
  }
  window.WorldSfx = WorldSfx;
})();
