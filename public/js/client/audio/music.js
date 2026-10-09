'use strict';
/* CLIENT - the soundtrack: a calm, dreamy fantasy-pony tune that never stops and never repeats exactly. It is made live from oscillators and
 * filtered noise (no files), as a small chamber ensemble in a stone hall:
 *   flute   the melody: a breathy, vibrato-shaded sine that glides between long phrases of the key's pentatonic
 *   harp    a rolling arpeggio of the chord, each string plucked and left to ring
 *   cello   a bowed, slowly swelling note under each bar (the root with its fifth above), with a slow vibrato
 * The chords drift round a bright, hopeful circle in D (D A Bm G, then Bm G D A) at a slow pace; each four bars the flute sings a fresh phrase.
 * At night the harp thins to every other string and the flute rests every other bar; in a cave the music fades to a hush and indoors it is
 * muffled. Volume: Menu > Controls > Mouse & touch (0 switches it off). */
const PonyMusic = (() => {
  const KEY = 2;                                              // D (semitones above C)
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const SCALE = [0, 2, 4, 7, 9];                              // major pentatonic: every note sits well over every chord of the key
  const PROGRESSION = [                                       // chord roots (semitones above the key), major (M) or minor (m)
    [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],                 // D A Bm G
    [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']]                  // Bm G D A
  ];
  const BEAT = 60 / 70;                                       // a slow 70 bpm; the harp plays in eighths

  let flute = null, harp = null, hall = null;
  const wave = (ctx, partials) => { const re = new Float32Array(partials.length + 1), im = new Float32Array(partials.length + 1); partials.forEach((a, i) => { im[i + 1] = a; }); return ctx.createPeriodicWave(re, im); };
  const fluteWave = ctx => flute || (flute = wave(ctx, [1, 0.28, 0.07, 0.03]));         // mostly the fundamental: a soft, hollow tube
  const harpWave = ctx => harp || (harp = wave(ctx, [1, 0.5, 0.26, 0.13, 0.07, 0.03]));  // a plucked string: bright first, rounder as it dies
  /** The hall: a synthetic impulse response, noise that fades over about three seconds, so everything sounds as if played in a stone chamber. */
  const hallResponse = ctx => {
    if (hall) return hall;
    const secs = 3.2, n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return (hall = buf);
  };

  class Music {
    constructor() {
      this.ctx = null; this.timer = 0; this.nextTime = 0; this.step = 0; this.bar = 0; this.phrase = [];
      this.mood = { night: 0, indoors: 0, cave: 0 };
      this.lead = 4;                                          // the flute's last scale position (it walks, rather than leaps)
      GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
    }

    _build() {
      const ctx = this.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 20000;                // muffled indoors
      this.fade = g(0); this.room.connect(this.fade); this.fade.connect(GameAudio.buses.music);
      this.fade.gain.setTargetAtTime(0.45, ctx.currentTime + 1.5, 2.5);                                                   // (the music drifts in)
      const verb = ctx.createConvolver(); verb.buffer = hallResponse(ctx); const wet = g(0.55);
      this.bus = g(1); this.bus.connect(this.room); this.bus.connect(verb); verb.connect(wet); wet.connect(this.room);
      this.nextTime = ctx.currentTime + 2; this.step = 0; this.bar = 0;
      this.timer = setInterval(() => this._schedule(), 120);
    }

    /** Called every frame: hour 0..24, the map kind ('world' | 'room' | 'cave' | 'dungeon'), and the rain (the music gives way a little to a downpour). */
    update(hour, kind, rain = 0) {
      if (!this.ctx || !this.fade) return;
      const m = this.mood; m.night = hour >= 21 || hour < 5.5 ? 1 : 0; m.indoors = kind === 'room' ? 1 : 0; m.cave = kind === 'cave' || kind === 'dungeon' ? 1 : 0;
      const now = this.ctx.currentTime, level = (m.cave ? 0.45 : 1) * (1 - rain * 0.2) * (m.night ? 0.8 : 1);
      this.fade.gain.setTargetAtTime(0.45 * level, now, 1.2);
      this.room.frequency.setTargetAtTime(m.cave ? 1000 : m.indoors ? 2800 : 20000, now, 0.6);
    }

    /* ---- the players ---- */
    /** A slow vibrato on a pitch (fades in after `delay`), as a player's hand or breath would add. */
    _vibrato(t, params, hz, depth, rate, delay, stop) {
      const ctx = this.ctx, lfo = ctx.createOscillator(), amt = ctx.createGain();
      lfo.frequency.value = rate; amt.gain.setValueAtTime(0, t); amt.gain.setValueAtTime(0, t + delay); amt.gain.linearRampToValueAtTime(hz * depth, t + delay + 0.5);
      lfo.connect(amt); for (const p of params) amt.connect(p); lfo.start(t); lfo.stop(stop);
    }
    /** The flute: a soft sine with a puff of breath at the start and a little vibrato on longer notes. */
    _flute(t, note, len, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), hz = midi(note), end = t + len + 0.3;
      o.setPeriodicWave(fluteWave(ctx)); o.frequency.setValueAtTime(hz * 0.985, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.07);       // (a breath-onset scoop)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.09); g.gain.setTargetAtTime(0.075 * vel, t + 0.1, 0.25); g.gain.setTargetAtTime(0.0001, t + len, 0.09);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(end); this._vibrato(t, [o.frequency], hz, 0.0045, 5.3, 0.25, end);
      const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();                                                    // the breath
      n.buffer = GameAudio.noise(); nf.type = 'bandpass'; nf.frequency.value = Math.min(hz * 2.5, 9000); nf.Q.value = 1.2;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05 * vel, t + 0.04); ng.gain.setTargetAtTime(0.008 * vel, t + 0.06, 0.12); ng.gain.setTargetAtTime(0.0001, t + len, 0.08);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, len + 0.5);
    }
    /** One harp string: a bright pluck that rings and fades; lower strings ring longer. */
    _harp(t, note, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), ring = clamp(2.8 - (note - 40) / 30, 0.8, 2.6);
      o.setPeriodicWave(harpWave(ctx)); o.frequency.value = midi(note);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.4); f.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, ring / 5);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + ring + 0.2);
    }
    /** The cello: a bowed sawtooth pair through a low-pass that opens as the bow swells, with a slow vibrato. */
    _cello(t, note, len, vel) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.8, oscs = [];
      for (const detune of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o); }
      f.type = 'lowpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(900, t + len * 0.5); f.frequency.linearRampToValueAtTime(420, t + len);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055 * vel, t + 0.5); g.gain.setValueAtTime(0.055 * vel, t + len - 0.2); g.gain.setTargetAtTime(0.0001, t + len, 0.25);
      f.connect(g); g.connect(this.bus); this._vibrato(t, oscs.map(o => o.frequency), hz, 0.004, 4.6, 0.6, end);
    }

    /* ---- the composer ---- */
    /** A new four-bar phrase as eighth-note slots (null = rest): a short motif, then a varied answer, with room to breathe. Positions are indices
     *  into the pentatonic scale over two octaves (0-8); it starts where the last phrase ended. Each note is held until the next begins (a little
     *  overlapped) so the flute sings legato. */
    _compose() {
      const rnd = Math.random, slots = new Array(32).fill(null), night = this.mood.night;
      const motifLen = 4 + (rnd() * 3 | 0), motif = []; let pos = this.lead;
      for (let i = 0; i < motifLen; i++) {
        let d = [-2, -1, -1, 0, 1, 1, 2][rnd() * 7 | 0];
        if ((pos >= 7 && d > 0) || (pos <= 1 && d < 0)) d = -d;                                                                // (it turns back before the ends of its range, so the tune stays in the middle)
        pos = clamp(pos + d, 0, 8); motif.push(pos);
      }
      const rhythms = [[0, 3, 4, 6], [0, 2, 4, 6], [0, 4, 6], [0, 3, 6], [0, 4]];                                              // (eighth offsets inside a bar: unhurried)
      const rh = rhythms[rnd() * rhythms.length | 0];
      for (let bar = 0; bar < 4; bar++) {
        if (night && bar % 2 === 1) continue;                                                                                  // (the lullaby rests every other bar)
        if (bar === 3 && rnd() < 0.5) { slots[bar * 8] = { p: motif[0], len: 8 }; continue; }                                 // a long closing note
        const base = bar % 2 === 0 ? motif : motif.map(p => clamp(p + (rnd() < 0.5 ? 1 : -1), 1, 7));                          // (the second bar of each pair answers with the motif nudged)
        rh.forEach((off, i) => { if (i < base.length && (rnd() < 0.9 || i === 0)) slots[bar * 8 + off] = { p: base[i], len: 3 }; });
      }
      let next = 32;                                                                                                           // hold each note to the next, with a little overlap
      for (let i = 31; i >= 0; i--) if (slots[i]) { slots[i].len = Math.min(slots[i].len, next - i) + 0.3; next = i; }
      return slots;
    }

    _schedule() {
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.2); return; }
      const eighth = BEAT / 2, night = this.mood.night, quiet = this.mood.cave ? 0.6 : 1;
      while (this.nextTime < ctx.currentTime + 0.6) {
        const s = this.step % 8, chord = PROGRESSION[Math.floor(this.bar / 4) % PROGRESSION.length][this.bar % 4], root = KEY + chord[0];
        if (s === 0 && this.bar % 4 === 0) this.phrase = this._compose();
        const third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7, t = this.nextTime;
        if (s === 0) {                                                                                                         // the cello holds the whole bar: the root, with its fifth an octave up
          this._cello(t, 36 + root, eighth * 8, (night ? 0.7 : 1) * quiet);
          this._cello(t + 0.12, 36 + fifth + 12, eighth * 8 - 0.12, 0.45 * (night ? 0.7 : 1) * quiet);
        }
        if (!night || s % 2 === 0) {                                                                                           // the harp rolls the chord up and down
          const tones = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72];
          this._harp(t, tones[[0, 1, 2, 3, 4, 3, 2, 1][s]], (s === 0 ? 1 : 0.65) * (night ? 0.6 : 1) * quiet);
        }
        const slot = this.phrase[(this.bar % 4) * 8 + s];
        if (slot) {                                                                                                            // the flute: a scale position -> a note of the key's pentatonic (D4 and up, to A5)
          this._flute(t, 60 + KEY + SCALE[slot.p % 5] + Math.floor(slot.p / 5) * 12, eighth * slot.len, (night ? 0.6 : 0.9) * quiet);
          this.lead = slot.p;
        }
        this.nextTime += eighth; this.step++;
        if (this.step % 8 === 0) this.bar++;
      }
    }
  }
  return Music;
})();
