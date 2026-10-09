'use strict';
/* CLIENT - the soundtrack: three tunes for three moods, each made live from oscillators and filtered noise (no files), played by a small chamber
 * ensemble in a stone hall. None ever repeats exactly: every four bars the flute sings a fresh phrase.
 *   CALM    "Meadowlight Reverie": flute melody, rolling harp arpeggios and a bowed cello, in a bright major key (D) at a slow 70 bpm. At night the harp and flute thin out.
 *   STORM   "Thunder Over Hollowmere": dark and slow, in C minor: a deep cello drone, tremolo strings, tolling low harp, distant drum swells and a lonely flute.
 *           Plays under a thunderstorm, a downpour or a gale.
 *   BATTLE  "Ironhoof Gallop": fast and driving, in D minor, in a galloping 6/8: an ostinato cello, rapid harp, tremolo strings, war drums and a staccato flute.
 *           Plays when something hostile is near (or just was), when you are hurt, and in any cave or dungeon.
 * Changing mood crossfades: the old tune fades out while the new one begins on its first bar. In a room the music is muffled.
 * Volume: Menu > Controls > Mouse & touch (0 switches it off). */
const PonyMusic = (() => {
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const MAJOR_PENT = [0, 2, 4, 7, 9], MINOR_PENT = [0, 3, 5, 7, 10];
  const THEMES = {
    calm: {
      title: 'Meadowlight Reverie', key: 2, scale: MAJOR_PENT, eighth: 60 / 70 / 2, bar: 8, level: 1, fadeIn: 2.2, fadeOut: 3,                                       // D
      prog: [[[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']]],                                      // D A Bm G, then Bm G D A
      rhythms: [[0, 3, 4, 6], [0, 2, 4, 6], [0, 4, 6], [0, 3, 6], [0, 4]]
    },
    storm: {
      title: 'Thunder Over Hollowmere', key: 0, scale: MINOR_PENT, eighth: 60 / 54 / 2, bar: 8, level: 1, fadeIn: 3, fadeOut: 3.5,                                       // C minor
      prog: [[[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], [[0, 'm'], [5, 'm'], [7, 'm'], [0, 'm']]],                                     // Cm Ab Eb Bb, then Cm Fm Gm Cm
      rhythms: [[0, 5], [0, 4], [2, 6], [0], [0, 3, 6]]
    },
    battle: {
      title: 'Ironhoof Gallop', key: 2, scale: MINOR_PENT, eighth: 0.19, bar: 6, level: 0.9, fadeIn: 0.5, fadeOut: 1.1,                                          // D minor, 6/8 (two dotted-quarter beats a bar)
      prog: [[[0, 'm'], [8, 'M'], [10, 'M'], [0, 'm']], [[0, 'm'], [5, 'm'], [7, 'm'], [0, 'm']]],                                     // Dm Bb C Dm, then Dm Gm Am Dm
      rhythms: [[0, 1, 3, 4], [0, 2, 3, 5], [0, 3, 4, 5], [0, 1, 2, 4], [0, 2, 3, 4, 5]]
    }
  };
  const HOSTILE_RANGE = 11, HOLD_BATTLE = 7, HOLD_STORM = 5;                           // tiles; seconds the mood lingers after the cause is gone

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
      this.ctx = null; this.timer = 0; this.nextTime = 0; this.step = 0; this.bar = 0; this.phrase = []; this.lead = 4;     // lead: the flute's last scale position (it walks, rather than leaps)
      this.theme = 'calm'; this.mood = { night: 0, indoors: 0, cave: 0 }; this.hurtT = 0; this.lastHp = null; this.battleT = 0; this.stormT = 0; this.last = 0;
      GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
    }

    _build() {
      const ctx = this.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 20000;                // muffled indoors
      this.fade = g(0); this.room.connect(this.fade); this.fade.connect(GameAudio.buses.music);
      this.fade.gain.setTargetAtTime(0.45, ctx.currentTime + 1.5, 2.5);                                                   // (the music drifts in)
      const verb = ctx.createConvolver(); verb.buffer = hallResponse(ctx); const wet = g(0.55); verb.connect(wet); wet.connect(this.room);
      this.buses = {};                                                                                                    // one bus per tune, so a tune can fade while the next begins
      for (const name in THEMES) { const b = g(name === this.theme ? THEMES[name].level : 0); b.connect(this.room); b.connect(verb); this.buses[name] = b; }
      this.bus = this.buses[this.theme];
      this.nextTime = ctx.currentTime + 2; this.step = 0; this.bar = 0;
      this.timer = setInterval(() => this._schedule(), 120);
    }

    /** What is the mood right now? A hostile creature near you (or one lately, or you being hurt) and any cave or dungeon is BATTLE; a storm is STORM. */
    _sense(game, weather, dt) {
      const p = game.local, kind = game.map.kind;
      if (p) {
        if (this.lastHp !== null && p.hp < this.lastHp - 0.5) this.hurtT = HOLD_BATTLE;
        this.lastHp = p.hp;
        const animals = game.latestAnimals();
        for (const id in animals) {
          const a = animals[id], d = AnimalDefs[a.type];
          if (d && (d.hostile || d.boss) && !(a.hp <= 0) && Math.hypot(a.x - p.x, a.y - p.y) < HOSTILE_RANGE) { this.battleT = HOLD_BATTLE; break; }
        }
      }
      this.battleT = Math.max(0, this.battleT - dt); this.hurtT = Math.max(0, this.hurtT - dt);
      const stormy = weather.lightning > 0.25 || weather.rain > 0.85 || weather.wind > 0.8;
      this.stormT = stormy ? HOLD_STORM : Math.max(0, this.stormT - dt);
      if (kind === 'cave' || kind === 'dungeon' || this.battleT > 0 || this.hurtT > 0) return 'battle';
      return this.stormT > 0 ? 'storm' : 'calm';
    }

    /** The title of the tune playing now. */
    get title() { return THEMES[this.theme].title; }

    /** Called every frame with the game and the weather layers being shown. */
    update(game, weather) {
      if (!this.ctx || !this.fade) return;
      const now = this.ctx.currentTime, dt = Math.min(0.25, now - (this.last || now)); this.last = now;
      const hour = game.hour(), kind = game.map.kind, m = this.mood;
      m.night = hour >= 21 || hour < 5.5 ? 1 : 0; m.indoors = kind === 'room' ? 1 : 0; m.cave = kind === 'cave' || kind === 'dungeon' ? 1 : 0;
      const want = this._sense(game, weather, dt);
      if (want !== this.theme) this._switchTo(want, now);
      const level = (1 - weather.rain * 0.15) * (m.night && this.theme === 'calm' ? 0.8 : 1);
      this.fade.gain.setTargetAtTime(0.45 * level, now, 1.2);
      this.room.frequency.setTargetAtTime(m.cave ? 4200 : m.indoors ? 2800 : 20000, now, 0.6);
    }

    _switchTo(name, now) {
      const from = THEMES[this.theme], to = THEMES[name];
      this.buses[this.theme].gain.setTargetAtTime(0, now, from.fadeOut / 3);
      this.buses[name].gain.setTargetAtTime(to.level, now + 0.05, to.fadeIn / 3);
      this.theme = name; this.bus = this.buses[name];
      this.step = 0; this.bar = 0; this.phrase = []; this.lead = 4; this.nextTime = Math.max(this.nextTime, now + 0.2);      // (the new tune starts on its first bar)
    }

    /* ---- the players ---- */
    /** A slow vibrato on a pitch (fades in after `delay`), as a player's hand or breath would add. */
    _vibrato(t, params, hz, depth, rate, delay, stop) {
      const ctx = this.ctx, lfo = ctx.createOscillator(), amt = ctx.createGain();
      lfo.frequency.value = rate; amt.gain.setValueAtTime(0, t); amt.gain.setValueAtTime(0, t + delay); amt.gain.linearRampToValueAtTime(hz * depth, t + delay + 0.5);
      lfo.connect(amt); for (const p of params) amt.connect(p); lfo.start(t); lfo.stop(stop);
    }
    /** The flute: a soft sine with a puff of breath at the start and a little vibrato on longer notes. `breath` makes it huskier. */
    _flute(t, note, len, vel, breath = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), hz = midi(note), end = t + len + 0.3, short = len < 0.5;
      o.setPeriodicWave(fluteWave(ctx)); o.frequency.setValueAtTime(hz * 0.985, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.07);       // (a breath-onset scoop)
      const attack = short ? 0.03 : 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + attack); g.gain.setTargetAtTime(0.075 * vel, t + attack + 0.01, 0.25); g.gain.setTargetAtTime(0.0001, t + len, short ? 0.04 : 0.09);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(end); if (!short) this._vibrato(t, [o.frequency], hz, 0.0045, 5.3, 0.25, end);
      const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();                                                    // the breath
      n.buffer = GameAudio.noise(); nf.type = 'bandpass'; nf.frequency.value = Math.min(hz * 2.5, 9000); nf.Q.value = 1.2;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05 * vel * breath, t + 0.04); ng.gain.setTargetAtTime(0.008 * vel * breath, t + 0.06, 0.12); ng.gain.setTargetAtTime(0.0001, t + len, 0.08);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, len + 0.5);
    }
    /** One harp string: a bright pluck that rings and fades; lower strings ring longer. `ringScale` lengthens or shortens the ring. */
    _harp(t, note, vel, ringScale = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), ring = clamp(2.8 - (note - 40) / 30, 0.8, 2.6) * ringScale;
      o.setPeriodicWave(harpWave(ctx)); o.frequency.value = midi(note);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.4); f.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, ring / 5);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + ring + 0.2);
    }
    /** The cello: a bowed sawtooth pair through a low-pass that opens as the bow swells, with a slow vibrato. Short notes are sharp, bitten strokes. */
    _cello(t, note, len, vel) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.8, oscs = [], short = len < 0.6;
      for (const detune of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o); }
      f.type = 'lowpass'; f.Q.value = 0.8;
      if (short) { f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(500, t + len); } else { f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(900, t + len * 0.5); f.frequency.linearRampToValueAtTime(420, t + len); }
      const peak = 0.055 * vel, attack = short ? 0.015 : 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, len - 0.2)); g.gain.setTargetAtTime(0.0001, t + len, short ? 0.05 : 0.25);
      f.connect(g); g.connect(this.bus); if (!short) this._vibrato(t, oscs.map(o => o.frequency), hz, 0.004, 4.6, 0.6, end);
    }
    /** Strings holding a chord: sawtooths behind a low-pass, swelling in, shivering with a tremolo (faster = more urgent). */
    _pad(t, notes, len, vel, { cutoff = 1200, tremolo = 6, depth = 0.35, attack = 0.7 } = {}) {
      const ctx = this.ctx, f = ctx.createBiquadFilter(), env = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), end = t + len + 1;
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
      for (const n of notes) for (const detune of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); }
      env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.022 * vel, t + attack); env.gain.setValueAtTime(0.022 * vel, t + Math.max(attack, len - 0.3)); env.gain.setTargetAtTime(0.0001, t + len, 0.3);
      trem.gain.value = 1 - depth / 2; lfo.frequency.value = tremolo; lg.gain.value = depth / 2; lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(end);
      f.connect(env); env.connect(trem); trem.connect(this.bus);
    }
    /** A war drum: a pitched thump that falls, with a puff of skin. */
    _drum(t, vel, deep = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      o.frequency.setValueAtTime(115 / deep, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.006); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.11 * deep);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.9);
      n.buffer = GameAudio.noise(); nf.type = 'lowpass'; nf.frequency.value = 420; ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.12 * vel, t + 0.004); ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.04);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, 0.3);
    }
    /** A snare-like rattle: a short burst of mid noise. */
    _snare(t, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = GameAudio.noise(); nf.type = 'bandpass'; nf.frequency.value = 1900; nf.Q.value = 0.7;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.1 * vel, t + 0.004); ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.04);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, 0.3);
    }

    /* ---- the composer ---- */
    /** A new four-bar phrase as eighth-note slots (null = rest): a short motif, then a varied answer, with room to breathe. Positions are indices
     *  into the tune's pentatonic over two octaves (0-8); it starts where the last phrase ended. Each note is held until the next begins (a little
     *  overlapped) so the calm flute sings legato; the battle flute plays short, bitten notes. */
    _compose(theme) {
      const rnd = Math.random, B = theme.bar, total = B * 4, slots = new Array(total).fill(null), night = this.theme === 'calm' && this.mood.night;
      const motifLen = 4 + (rnd() * 3 | 0), motif = []; let pos = this.lead;
      for (let i = 0; i < motifLen; i++) {
        let d = [-2, -1, -1, 0, 1, 1, 2][rnd() * 7 | 0];
        if ((pos >= 7 && d > 0) || (pos <= 1 && d < 0)) d = -d;                                                                // (it turns back before the ends of its range, so the tune stays in the middle)
        pos = clamp(pos + d, 0, 8); motif.push(pos);
      }
      const rh = theme.rhythms[rnd() * theme.rhythms.length | 0], fast = this.theme === 'battle';
      for (let bar = 0; bar < 4; bar++) {
        if (night && bar % 2 === 1) continue;                                                                                  // (the lullaby rests every other bar)
        if (bar === 3 && !fast && rnd() < 0.5) { slots[bar * B] = { p: motif[0], len: B }; continue; }                         // a long closing note
        const base = bar % 2 === 0 ? motif : motif.map(p => clamp(p + (rnd() < 0.5 ? 1 : -1), 1, 7));                          // (the second bar of each pair answers with the motif nudged)
        rh.forEach((off, i) => { if (i < base.length && (rnd() < 0.9 || i === 0)) slots[bar * B + off] = { p: base[i], len: 3 }; });
      }
      let next = total;                                                                                                        // hold each note to the next, with a little overlap
      for (let i = total - 1; i >= 0; i--) if (slots[i]) { slots[i].len = fast ? 0.8 : Math.min(slots[i].len, next - i) + 0.3; next = i; }
      return slots;
    }

    _schedule() {
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.2); return; }
      const theme = THEMES[this.theme], name = this.theme, B = theme.bar, quiet = this.mood.cave && name !== 'battle' ? 0.6 : 1;
      while (this.nextTime < ctx.currentTime + 0.6) {
        const eighth = theme.eighth, s = this.step % B, chord = theme.prog[Math.floor(this.bar / 4) % theme.prog.length][this.bar % 4], root = theme.key + chord[0], minor = chord[1] === 'm';
        if (s === 0 && this.bar % 4 === 0) this.phrase = this._compose(theme);
        const third = root + (minor ? 3 : 4), fifth = root + 7, t = this.nextTime, slot = this.phrase[(this.bar % 4) * B + s];
        const night = name === 'calm' && this.mood.night, tones = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72];
        const note = p => 60 + theme.key + theme.scale[p % 5] + Math.floor(p / 5) * 12;
        if (name === 'calm') {
          if (s === 0) {                                                                                                       // the cello holds the whole bar: the root, with its fifth an octave up
            this._cello(t, 36 + root, eighth * 8, (night ? 0.7 : 1) * quiet);
            this._cello(t + 0.12, 36 + fifth + 12, eighth * 8 - 0.12, 0.45 * (night ? 0.7 : 1) * quiet);
          }
          if (!night || s % 2 === 0) this._harp(t, tones[[0, 1, 2, 3, 4, 3, 2, 1][s]], (s === 0 ? 1 : 0.65) * (night ? 0.6 : 1) * quiet);      // the harp rolls the chord up and down
          if (slot) this._flute(t, note(slot.p), eighth * slot.len, (night ? 0.6 : 0.9) * quiet);
        } else if (name === 'storm') {
          if (s === 0) {
            this._cello(t, 36 + root, eighth * 8, 1.2);                                                                        // a deep drone under the bar
            this._pad(t, [root + 48, third + 48, fifth + 48], eighth * 8, 1, { cutoff: 900, tremolo: 5.5, depth: 0.5, attack: 1.2 });
            this._drum(t, 0.7, 1.6);                                                                                           // a distant roll
          } else if (s === 5 && this.bar % 2 === 1) this._drum(t, 0.4, 1.8);
          const toll = [4, null, 3, null, 2, null, 1, null][s];                                                                // the harp tolls low and slow, one string a beat
          if (toll !== null) this._harp(t, tones[toll] - (toll > 2 ? 12 : 0), 0.8, 1.5);
          if (slot) this._flute(t, note(slot.p), eighth * slot.len, 0.75, 1.8);                                                          // a husky, lonely flute
        } else {
          if (s === 0) {
            this._pad(t, [root + 48, third + 48, fifth + 48], eighth * 6, 1, { cutoff: 1700, tremolo: 9, depth: 0.5, attack: 0.12 });
            this._drum(t, 1);
          } else if (s === 3) { this._drum(t, 0.75); this._snare(t, 0.7); }
          else if (s === 2 || s === 5) this._snare(t, 0.35);
          if (s !== 3 || this.bar % 2 === 1) this._cello(t, 36 + (s === 2 || s === 5 ? fifth : root), eighth * 0.9, s === 0 || s === 3 ? 1.2 : 0.9);      // the cello gallops: root, root, fifth, root, root, fifth
          this._harp(t, tones[[0, 2, 4, 3, 4, 2][s]] + 12 * (s % 2), 0.55, 0.45);                                              // a quick harp run over the top
          if (slot) this._flute(t, note(slot.p) + (slot.p < 5 ? 12 : 0), eighth * slot.len, 1, 0.8);
        }
        if (slot) this.lead = slot.p;
        this.nextTime += eighth; this.step++;
        if (this.step % B === 0) this.bar++;
      }
    }
  }
  Music.TITLES = Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.title]));
  return Music;
})();
