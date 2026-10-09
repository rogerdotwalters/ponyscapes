'use strict';
/* CLIENT - the soundtrack: a calm, melodic, retro "country pony" tune that never stops and never repeats exactly. It is made live from
 * oscillators (no files), in the spirit of an old 8-bit game played on a porch: a pulse-wave lead that plucks and slides into its notes like a
 * pedal steel, a triangle bass that rocks root-fifth ("boom-chick"), a soft strummed backbeat, and a brushed-snare shimmer. The chords wander
 * round a country circle in G (G C G D, then Em C D G) at a lazy walking pace; each four bars the lead sings a fresh phrase from the major
 * pentatonic, answering its own previous phrase. At night the band thins to a lullaby (lead and bass only, slower, softer); in a cave the music
 * fades to a hush and indoors it is muffled. Volume: Menu > Controls > Mouse & touch (0 switches it off). */
const PonyMusic = (() => {
  const KEY = 7;                                              // G (semitones above C)
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const SCALE = [0, 2, 4, 7, 9];                              // major pentatonic: every note sits well over every chord of the key
  const PROGRESSION = [                                       // chord roots (scale degree in semitones above the key), major (M) or minor (m)
    [[0, 'M'], [5, 'M'], [0, 'M'], [7, 'M']],                 // G C G D
    [[9, 'm'], [5, 'M'], [7, 'M'], [0, 'M']]                  // Em C D G
  ];
  const BEAT = 60 / 82;                                       // a lazy 82 bpm; the lead plays in eighths

  let pulse = null;
  const pulseWave = ctx => pulse || (pulse = (() => { const n = 24, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = Math.sin(Math.PI * k * 0.25) / k; return ctx.createPeriodicWave(re, im); })());      // a 25% pulse: the hollow "NES" voice

  class Music {
    constructor() {
      this.ctx = null; this.out = null; this.timer = 0; this.nextTime = 0; this.step = 0; this.bar = 0; this.phrase = []; this.lastPhrase = [];
      this.mood = { night: 0, indoors: 0, cave: 0 };
      this.lead = 3;                                          // the lead's last scale position (it walks, rather than leaps)
      GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
    }

    _build() {
      const ctx = this.ctx, g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 20000;                // muffled indoors
      this.fade = g(0); this.room.connect(this.fade); this.fade.connect(GameAudio.buses.music);
      this.fade.gain.setTargetAtTime(0.85, ctx.currentTime + 1.5, 2.5);                                                    // (the music drifts in)
      const delay = ctx.createDelay(1); delay.delayTime.value = BEAT * 0.75;                                              // a faint porch echo
      const fb = g(0.28), wet = g(0.22), tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
      this.bus = g(1); this.bus.connect(this.room); this.bus.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(this.room);
      this.nextTime = ctx.currentTime + 2; this.step = 0; this.bar = 0;
      this.timer = setInterval(() => this._schedule(), 120);
    }

    /** Called every frame: hour 0..24, the map kind ('world' | 'room' | 'cave' | 'dungeon'), and the rain (the music gives way a little to a downpour). */
    update(hour, kind, rain = 0) {
      if (!this.ctx || !this.fade) return;
      const m = this.mood; m.night = hour >= 21 || hour < 5.5 ? 1 : 0; m.indoors = kind === 'room' ? 1 : 0; m.cave = kind === 'cave' || kind === 'dungeon' ? 1 : 0;
      const now = this.ctx.currentTime, level = (m.cave ? 0.45 : 1) * (1 - rain * 0.2) * (m.night ? 0.8 : 1);
      this.fade.gain.setTargetAtTime(0.85 * level, now, 1.2);
      this.room.frequency.setTargetAtTime(m.cave ? 1000 : m.indoors ? 2400 : 20000, now, 0.6);
    }

    /* ---- the players ---- */
    /** The lead: a plucked pulse wave that slides up into its note (a pedal-steel bend) and sings a little vibrato on long ones. */
    _lead(t, note, len, vel, bend) {
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), hz = midi(note);
      o.setPeriodicWave(pulseWave(ctx)); o2.type = 'triangle';
      o.frequency.setValueAtTime(bend ? hz * 0.944 : hz, t); if (bend) o.frequency.exponentialRampToValueAtTime(hz, t + 0.09);
      o2.frequency.setValueAtTime(bend ? hz * 0.944 : hz, t); if (bend) o2.frequency.exponentialRampToValueAtTime(hz, t + 0.09);
      if (len > BEAT * 0.9) {                                  // a held note wobbles gently
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = hz * 0.006; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); lfo.start(t + 0.25); lfo.stop(t + len + 0.1);
      }
      f.type = 'lowpass'; f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(1300, t + Math.min(len, 0.6)); f.Q.value = 0.6;      // the pluck: bright, then mellow
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.012); g.gain.exponentialRampToValueAtTime(0.045 * vel, t + 0.12); g.gain.setTargetAtTime(0.0001, t + Math.max(0.15, len - 0.1), 0.12);
      const mix = ctx.createGain(); mix.gain.value = 0.55; o2.connect(mix); o.connect(f); mix.connect(f); f.connect(g); g.connect(this.bus);
      o.start(t); o2.start(t); const end = t + len + 0.7; o.stop(end); o2.stop(end);
    }
    /** The bass: a round triangle thump. */
    _bass(t, note, len, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = midi(note);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + len + 0.05);
    }
    /** The strum: a soft downstroke across the chord (three quick pulse-wave plucks), the "chick" of the boom-chick. */
    _strum(t, notes, vel) {
      const ctx = this.ctx;
      notes.forEach((n, i) => {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), at = t + i * 0.022;
        o.setPeriodicWave(pulseWave(ctx)); o.frequency.value = midi(n);
        f.type = 'lowpass'; f.frequency.value = 2000; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.045 * vel, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        o.connect(f); f.connect(g); g.connect(this.bus); o.start(at); o.stop(at + 0.26);
      });
    }
    /** Brushes: a faint filtered hiss on the backbeat. */
    _brush(t, vel) {
      const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = GameAudio.noise(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03 * vel, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random() * 1.5, 0.2);
    }

    /* ---- the composer ---- */
    /** A new four-bar phrase as eighth-note slots (null = rest): a short motif, then a varied answer, with room to breathe. Positions are indices
     *  into the pentatonic scale over two octaves (0-8); it starts where the last phrase ended. */
    _compose() {
      const rnd = Math.random, slots = new Array(32).fill(null), night = this.mood.night;
      const motifLen = 4 + (rnd() * 3 | 0), motif = []; let pos = this.lead;
      for (let i = 0; i < motifLen; i++) {
        let d = [-2, -1, -1, 0, 1, 1, 2][rnd() * 7 | 0];
        if ((pos >= 7 && d > 0) || (pos <= 1 && d < 0)) d = -d;                                                                // (it turns back before the ends of its range, so the tune stays in the middle)
        pos = clamp(pos + d, 0, 8); motif.push(pos);
      }
      const rhythms = [[0, 2, 3, 4, 6], [0, 1, 2, 4, 6], [0, 3, 4, 6, 7], [0, 2, 4, 5, 6], [0, 2, 4]];                        // (eighth offsets inside a bar; some syncopation)
      const rh = rhythms[rnd() * rhythms.length | 0];
      for (let bar = 0; bar < 4; bar++) {
        if (night && bar % 2 === 1) continue;                                                                                  // (the lullaby rests every other bar)
        if (bar === 3 && rnd() < 0.5) { slots[bar * 8] = { p: motif[0], len: 4 }; continue; }                                 // a long closing note
        const base = bar % 2 === 0 ? motif : motif.map(p => clamp(p + (rnd() < 0.5 ? 1 : -1), 1, 7));                          // (the second bar of each pair answers with the motif nudged)
        rh.forEach((off, i) => { if (i < base.length && (rnd() < 0.88 || i === 0)) slots[bar * 8 + off] = { p: base[i], len: 1.6 + (rnd() < 0.25 ? 1 : 0) }; });
      }
      return slots;
    }

    _schedule() {
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.2); return; }
      const eighth = BEAT / 2, night = this.mood.night, quiet = this.mood.cave ? 0.6 : 1;
      while (this.nextTime < ctx.currentTime + 0.6) {
        const s = this.step % 8, chord = PROGRESSION[Math.floor(this.bar / 4) % PROGRESSION.length][this.bar % 4], root = KEY + chord[0];
        if (s === 0 && this.bar % 4 === 0) this.phrase = this._compose();
        const third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7, pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0);       // the bass sits around G2-E3
        const tt = this.nextTime + (s % 2 === 1 ? eighth * 0.12 : 0);                                                           // a lazy shuffle on the off-eighths
        const chordTones = [root + 48, third + 48, fifth + 48, root + 60];
        if (!night) {
          if (s === 0) this._bass(tt, low, BEAT * 0.9, quiet);                                                                  // boom
          if (s === 4) this._bass(tt, low + 7, BEAT * 0.9, 0.8 * quiet);                                                         // (the root, then the fifth)
          if (s === 2 || s === 6) { this._strum(tt, chordTones, 0.9 * quiet); this._brush(tt, quiet); }                         // chick
        } else {
          if (s === 0) this._bass(tt, low, BEAT * 3.5, 0.8 * quiet);                                                             // a single low note a bar
          if (s === 4 && this.bar % 2 === 0) this._strum(tt, chordTones, 0.5 * quiet);
        }
        const slot = this.phrase[(this.bar % 4) * 8 + s];
        if (slot) {                                                                                                              // the lead: a scale position -> a note of the key's pentatonic (G4 and up)
          this._lead(tt, 60 + KEY + SCALE[slot.p % 5] + Math.floor(slot.p / 5) * 12, eighth * slot.len, (night ? 0.55 : 0.85) * quiet, s === 0 || Math.random() < 0.3);
          this.lead = slot.p;
        }
        this.nextTime += eighth; this.step++;
        if (this.step % 8 === 0) this.bar++;
      }
    }
  }
  return Music;
})();
