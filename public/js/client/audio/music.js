'use strict';
/* CLIENT - the soundtrack: three tunes for three moods, each made live from oscillators and filtered noise (no files), played by a small chamber
 * ensemble in a stone hall. None ever repeats exactly: every four bars the flute sings a fresh phrase.
 *   CALM    "Meadowlight Reverie": flute melody, rolling harp arpeggios and a bowed cello, in a bright major key (D) at a slow 70 bpm. At night the harp and flute thin out.
 *   TEMPEST "Duel at Stormcrown": for the fiercest storms (thunderstorms), a long piece in E minor, about three minutes, then it loops:
 *           a suspenseful build-up (heartbeat drums, a drone, trembling strings, a violin climbing, a snare roll) whose last note drops away,
 *           a very fast chorus where two violins duel, one in each ear, then join; an interlude that slows to a lone cello and builds again;
 *           and the duel once more, two rounds, with the violins' roles swapped in the second.
 *   BALLAD  "The Ballad of Hollowmere": one long piece (about four minutes) that carries every mood in turn: a soft intro, a casual farm interlude,
 *           cheery glee, dreaded anticipation, a somber realization, rising hope and victory. One ensemble throughout: strings, a cello and war
 *           drums as the body, a flute and high brass for accents. Tempo, loudness and key glide from mood to mood (no jumps). It never plays by
 *           itself: pick it in the Soundtrack player.
 *   STORM   "Thunder Over Hollowmere": dark and slow, in C minor: a deep cello drone, tremolo strings, tolling low harp, distant drum swells and a lonely flute.
 *           Plays under a heavy downpour or a gale.
 *   BATTLE  "Ironhoof Gallop": fast and driving, in D minor, in a galloping 6/8: an ostinato cello, rapid harp, tremolo strings, war drums and a staccato flute.
 *           Plays when something hostile is near (or just was), when you are hurt, and in any cave or dungeon.
 * Changing mood crossfades: the old tune fades out while the new one begins on its first bar. In a room the music is muffled.
 * Volume: Menu > Controls > Mouse & touch (0 switches it off). */
const PonyMusic = (() => {
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const MAJOR_PENT = [0, 2, 4, 7, 9], MINOR_PENT = [0, 3, 5, 7, 10];
  const THEMES = {
    calm: {
      title: 'Meadowlight Reverie', blurb: 'Calm and bright. Flute, harp and cello.', key: 2, scale: MAJOR_PENT, eighth: 60 / 70 / 2, bar: 8, level: 1, fadeIn: 2.2, fadeOut: 3,                                       // D
      prog: [[[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']]],                                      // D A Bm G, then Bm G D A
      rhythms: [[0, 3, 4, 6], [0, 2, 4, 6], [0, 4, 6], [0, 3, 6], [0, 4]]
    },
    storm: {
      title: 'Thunder Over Hollowmere', blurb: 'Slow and dark, for heavy rain and gales.', key: 0, scale: MINOR_PENT, eighth: 60 / 54 / 2, bar: 8, level: 1, fadeIn: 3, fadeOut: 3.5,                                       // C minor
      prog: [[[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], [[0, 'm'], [5, 'm'], [7, 'm'], [0, 'm']]],                                     // Cm Ab Eb Bb, then Cm Fm Gm Cm
      rhythms: [[0, 5], [0, 4], [2, 6], [0], [0, 3, 6]]
    },
    tempest: { title: 'Duel at Stormcrown', blurb: 'Build-up, a duel of violins, a cello interlude, the duel again. Thunderstorms.', key: 4, bar: 8, level: 1, fadeIn: 2, fadeOut: 2.5 },                                     // E minor (harmonic); its sections and chords are TEMPEST below
    ballad: { title: 'The Ballad of Hollowmere', blurb: 'Every mood in one piece, for strings, cello and war drums with flute and brass. Intro, farm, glee, dread, grief, hope, victory.', key: 2, bar: 8, level: 1, fadeIn: 2, fadeOut: 2.5 },
    battle: {
      title: 'Ironhoof Gallop', blurb: 'Fast and galloping. Battles and caves.', key: 2, scale: MINOR_PENT, eighth: 0.19, bar: 6, level: 0.9, fadeIn: 0.5, fadeOut: 1.1,                                          // D minor, 6/8 (two dotted-quarter beats a bar)
      prog: [[[0, 'm'], [8, 'M'], [10, 'M'], [0, 'm']], [[0, 'm'], [5, 'm'], [7, 'm'], [0, 'm']]],                                     // Dm Bb C Dm, then Dm Gm Am Dm
      rhythms: [[0, 1, 3, 4], [0, 2, 3, 5], [0, 3, 4, 5], [0, 1, 2, 4], [0, 2, 3, 4, 5]]
    }
  };
  /** The tempest, section by section: a hush, a rise and a surge of suspense (each faster than the last), then the duel. dur = seconds per step (8 a bar). */
  const HARMONIC = [0, 2, 3, 5, 7, 8, 11];                                                     // E harmonic minor (E F# G A B C D#), from the key
  const TEMPEST = (() => {
    const E = [0, 'm'], C = [8, 'M'], A = [5, 'm'], B = [7, 'M'];                              // Em C Am B (B major: the D# is the "leading tone" that makes it ache)
    const P1 = [E, C, A, B], P2 = [A, C, B, E];
    const sections = [
      { id: 'hush', bars: 8, dur: 0.45 }, { id: 'rise', bars: 8, dur: 0.33 }, { id: 'surge', bars: 8, dur: 0.22 },        // the build-up
      { id: 'duel', bars: 16, dur: 0.115 },                                                                              // the first duel: one round
      { id: 'slow', bars: 4, dur: 0.115, dur1: 0.5 },                                                                   // the interlude: it slows to a crawl (dur1: the last bar's step)...
      { id: 'cello', bars: 8, dur: 0.5 },                                                                               // ...a cello alone in the dark...
      { id: 'rebuild', bars: 8, dur: 0.5, dur1: 0.12 },                                                                 // ...and builds again, faster each bar
      { id: 'duel', bars: 32, dur: 0.115 }                                                                              // the duel again: two rounds
    ];
    const chords = [E, E, E, E, C, E, A, B,   E, A, E, B, E, C, A, B,   E, E, A, A, C, C, B, B,
      ...P1, ...P2, ...P1, ...P2,                                                                                       // first duel
      E, E, A, A,   E, A, E, B, C, A, B, E,   E, E, A, A, C, C, B, B,                                                   // slow, cello, rebuild
      ...P1, ...P2, ...P1, ...P2, ...P1, ...P2, ...P1, ...P2];                                                          // second duel
    /** The seconds each step lasts in bar `idx` of a section (a section can speed up or slow down bar by bar). */
    const durOf = (sec, idx) => sec.dur1 ? sec.dur * Math.pow(sec.dur1 / sec.dur, idx / (sec.bars - 1)) : sec.dur;
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    return { sections, chords, durOf, where, bars: chords.length, stepDur: bi => { const w = where(bi); return durOf(w.sec, w.idx); } };
  })();
  /** The ballad: seven moods joined end to end. chords are [degree, quality, key]. Each section ends on a chord that leads smoothly into the next key
   *  (D is the V of G; D the IV of A; E major turns to E minor; B major is the V of E minor; E minor is the vi of G; D is the V of G and the I of D),
   *  and the pace and the loudness are curves through the whole piece, not per-section values, so nothing jumps. */
  const BALLAD = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const sections = [
      { id: 'intro', bars: 8 },                                  // soft intro, D major
      { id: 'farm', bars: 16 },                                  // casual farm vibes, G major
      { id: 'glee', bars: 12 },                                  // cheery glee, A major
      { id: 'dread', bars: 12 },                                 // dreaded anticipation, E minor
      { id: 'somber', bars: 10 },                                // somber realization, E minor
      { id: 'hope', bars: 12 },                                  // rising hope, G major
      { id: 'victory', bars: 16 },                               // victory, D major
      { id: 'end', bars: 1 }                                     // the last chord, left to ring
    ];
    const chords = [
      M(2, 0), m(2, 9), M(2, 5), M(2, 7),  M(2, 0), m(2, 9), M(2, 5), M(2, 0),
      M(7, 0), M(7, 5), M(7, 0), M(7, 7),  M(7, 0), M(7, 5), M(7, 7), M(7, 0),  M(7, 0), M(7, 5), M(7, 0), M(7, 7),  M(7, 0), M(7, 5), M(7, 7), M(7, 7),
      M(9, 0), M(9, 5), M(9, 7), M(9, 0),  M(9, 0), m(9, 9), M(9, 5), M(9, 7),  M(9, 0), M(9, 5), M(9, 7), M(9, 7),
      m(4, 0), m(4, 0), m(4, 5), M(4, 7),  m(4, 0), M(4, 8), m(4, 5), M(4, 7),  m(4, 0), m(4, 5), M(4, 7), M(4, 7),
      m(4, 0), m(4, 5), m(4, 0), M(4, 7), M(4, 8), m(4, 5), M(4, 7), m(4, 5), M(4, 7), m(4, 0),
      M(7, 0), M(7, 7), m(7, 9), M(7, 5),  M(7, 0), M(7, 7), m(7, 9), M(7, 5),  M(7, 5), M(7, 7), M(7, 7), M(7, 7),
      M(2, 0), M(2, 7), m(2, 9), M(2, 5),  M(2, 0), M(2, 5), M(2, 7), M(2, 0),  M(2, 0), M(2, 7), m(2, 9), M(2, 5),  M(2, 5), M(2, 7), M(2, 0), M(2, 0),
      M(2, 0)
    ];
    // [bar, value] keyframes. Between two the value eases smoothly (smoothstep; the pace in the log domain), so a change takes several bars.
    const PACE = [[0, 0.5], [5, 0.5], [11, 0.32], [21, 0.3], [28, 0.24], [33, 0.22], [39, 0.34], [46, 0.26], [53, 0.55], [56, 0.55], [66, 0.26], [72, 0.17], [78, 0.17], [87, 0.5]];     // seconds per step
    const LOUD = [[0, 0.3], [7, 0.45], [12, 0.5], [23, 0.55], [30, 0.8], [35, 0.8], [38, 0.45], [47, 0.95], [52, 0.4], [57, 0.4], [69, 0.9], [72, 1], [80, 1], [87, 0.7]];              // 0..1
    const ease = (keys, x, geo) => {
      if (x <= keys[0][0]) return keys[0][1];
      for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) {
        const [a, va] = keys[i - 1], [b, vb] = keys[i], f = (x - a) / (b - a), k = f * f * (3 - 2 * f);
        return geo ? va * Math.pow(vb / va, k) : va + (vb - va) * k;
      }
      return keys[keys.length - 1][1];
    };
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    return { sections, chords, where, bars: chords.length, stepDur: bi => ease(PACE, bi + 0.5, true), level: bi => ease(LOUD, bi + 0.5, false) };
  })();
  const FORMS = { tempest: TEMPEST, ballad: BALLAD };
  /** A pentatonic position (0 = the key's tonic above middle C, five to the octave) as a MIDI note. */
  const nm = (p, key, sc) => 60 + key + sc[((p % 5) + 5) % 5] + 12 * Math.floor(p / 5);                                              // the long, sectioned pieces
  /** A scale position (0 = E4, seven to the octave) as a MIDI note. */
  const posNote = p => 64 + 12 * Math.floor(p / 7) + HARMONIC[((p % 7) + 7) % 7];
  const HOSTILE_RANGE = 11, HOLD_BATTLE = 7, HOLD_STORM = 5, HOLD_TEMPEST = 8;                           // tiles; seconds the mood lingers after the cause is gone

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
      Music.current = this; this.forced = '';                                              // forced: a track picked in the Soundtrack player ('' = follow the game)
      this.theme = 'calm'; this.mood = { night: 0, indoors: 0, cave: 0 }; this.hurtT = 0; this.lastHp = null; this.battleT = 0; this.stormT = 0; this.tempestT = 0; this.lines = { a: [], b: [] }; this.vpos = { a: 12, b: 9 }; this.cpos = -3; this.mp = 4; this.cp = -5; this.marks = []; this.paused = false; this.pausePos = 0; this.last = 0;
      GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
    }

    _build() {
      const ctx = this.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 20000;                // muffled indoors
      this.gate = g(1); this.fade = g(0); this.room.connect(this.gate); this.gate.connect(this.fade); this.fade.connect(GameAudio.buses.music);            // (the gate is the player's pause)
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
      if (this.forced) return this.forced;
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
      const fierce = weather.lightning > 0.5 || (weather.rain > 0.8 && weather.wind > 0.6);                          // a thunderstorm
      this.tempestT = fierce ? HOLD_TEMPEST : Math.max(0, this.tempestT - dt);
      if (kind === 'cave' || kind === 'dungeon' || this.battleT > 0 || this.hurtT > 0) return 'battle';
      return this.tempestT > 0 ? 'tempest' : this.stormT > 0 ? 'storm' : 'calm';
    }

    /** The Soundtrack player: play one track until told otherwise (it starts from its beginning), or give the choice back to the game. */
    play(id) { if (!THEMES[id]) return; this.forced = id; if (this.paused) this.resume(); if (this.ctx && this.fade) this._switchTo(id, this.ctx.currentTime); }
    auto() { this.forced = ''; }
    /* ---- the player: skip, scrub, pause. Every tune is a cycle of bars (the calm, storm and battle tunes: 8 bars; the tempest: its whole form),
     * so a position in it is seconds into the cycle, and seeking starts the bar that second falls in. ---- */
    _table(name = this.theme) {
      const th = THEMES[name], starts = []; let at = 0;
      const form = FORMS[name], bars = form ? form.bars : 8;
      for (let i = 0; i < bars; i++) { starts.push(at); if (form) at += 8 * form.stepDur(i); else at += th.bar * th.eighth; }
      return { starts, total: at, bars };
    }
    /** Length of the playing tune's cycle, in seconds. */
    length() { return this._table().total; }
    /** Seconds into the cycle that is sounding now. */
    position() {
      if (!this.ctx) return 0; if (this.paused) return this.pausePos;
      const now = this.ctx.currentTime, tbl = this._table();
      for (let i = this.marks.length - 1; i >= 0; i--) { const m = this.marks[i]; if (m.t <= now) return Math.min(tbl.total, tbl.starts[m.bar] + now - m.t); }
      return 0;
    }
    /** Jump to a second of the cycle (it begins at the start of that bar). */
    seek(sec) {
      if (!this.ctx || !this.fade) return;
      const tbl = this._table(), name = this.theme, th = THEMES[name], B = th.bar, now = this.ctx.currentTime;
      let bi = 0; for (let i = 0; i < tbl.bars; i++) if (tbl.starts[i] <= sec) bi = i;
      this.step = bi * B; this.bar = bi; this.lead = 4; this.mp = 4; this.cp = -5; this.marks = []; this.pausePos = tbl.starts[bi];
      if (!FORMS[name]) this.phrase = this._compose(th);
      const level = th.level; this.bus.gain.cancelScheduledValues(now); this.bus.gain.setTargetAtTime(0, now, 0.03); this.bus.gain.setTargetAtTime(level, now + 0.22, 0.05);       // (a quick dip hides the cut)
      this.nextTime = now + 0.3;
    }
    /** Skip to the next (dir 1) or previous (dir -1) track; it starts from its beginning and stays until Auto. */
    skip(dir) {
      const ids = Music.TRACKS.map(t => t.id), i = Math.max(0, ids.indexOf(this.forced || this.theme));
      this.play(ids[(i + dir + ids.length) % ids.length]);
    }
    pause() { if (!this.ctx || this.paused) return; this.pausePos = this.position(); this.paused = true; this.gate.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04); }
    resume() { if (!this.ctx || !this.paused) return; this.paused = false; this.marks = []; this.gate.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05); this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.25); }
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
      this.step = 0; this.bar = 0; this.phrase = []; this.lead = 4; this.mp = 4; this.cp = -5; this.marks = []; this.pausePos = 0; this.nextTime = Math.max(this.nextTime, now + 0.2);      // (the new tune starts on its first bar)
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
    /** A violin: two slightly detuned sawtooths behind a low-pass, bowed (slow attack) or spiccato (short), panned to one side; `dark` is the lower, huskier one. */
    _violin(t, note, len, vel, pan = 0, dark = false, glide = false) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.4, oscs = [], short = len < 0.35;
      for (const detune of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o);
        if (glide) { o.frequency.setValueAtTime(hz, t + len * 0.15); o.frequency.exponentialRampToValueAtTime(hz * 0.5, t + len); } }                    // (a note that drops away: it sags an octave as it fades)
      f.type = 'lowpass'; f.frequency.setValueAtTime(dark ? 2300 : 3600, t); f.Q.value = 0.9;
      const peak = 0.05 * vel, attack = short ? 0.012 : 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, glide ? len * 0.5 : len - 0.05)); g.gain.setTargetAtTime(0.0001, t + (glide ? len * 0.98 : len), short ? 0.03 : glide ? 0.2 : 0.12);
      f.connect(g); let tail = g;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
      tail.connect(this.bus); if (!short) this._vibrato(t, oscs.map(o => o.frequency), hz, 0.006, 6.1, 0.2, end);
    }
    /** High brass: a bright sawtooth pair behind a low-pass that opens as the player leans in (a swell for long notes, a sharp blat for stabs). */
    _brass(t, note, len, vel) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.5, stab = len < 0.5;
      for (const detune of [-5, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); }
      const attack = stab ? 0.02 : 0.09;
      f.type = 'lowpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3600, t + attack + 0.06); f.frequency.setTargetAtTime(stab ? 1200 : 2200, t + attack + 0.1, 0.25);
      const peak = 0.042 * vel;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setTargetAtTime(peak * 0.75, t + attack + 0.02, 0.2); g.gain.setValueAtTime(peak * 0.75, t + Math.max(attack + 0.1, len - 0.1)); g.gain.setTargetAtTime(0.0001, t + len, stab ? 0.05 : 0.12);
      f.connect(g); g.connect(this.bus);
    }
    /** A cymbal crash: a long wash of bright noise. */
    _crash(t, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = GameAudio.noise(); nf.type = 'highpass'; nf.frequency.value = 4200;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.1 * vel, t + 0.005); ng.gain.setTargetAtTime(0.0001, t + 0.02, 0.35);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 0.5, 1.8);
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

    /** One bar (8 racing sixteenths) for a duelling violin, as scale positions (null = a breath), walking up and down inside lo..hi and landing
     *  on a chord tone on each beat. Remembers where the voice ended so the next bar carries on from there. */
    _duelLine(voice, pcs, lo, hi, ending, noteOf = posNote) {
      const rnd = Math.random, out = []; let p = this.vpos[voice], dir = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i < 8; i++) {
        if (rnd() < 0.18) dir = -dir;
        p += dir * (rnd() < 0.72 ? 1 : 2);
        if (p > hi) { p = hi; dir = -1; } else if (p < lo) { p = lo; dir = 1; }
        if (i % 4 === 0) for (const d of [0, 1, -1, 2, -2]) if (pcs.includes(noteOf(p + d) % 12) && p + d >= lo && p + d <= hi) { p += d; break; }             // (a chord tone on the beat)
        out.push(i % 2 === 1 && rnd() < 0.08 ? null : p);
      }
      if (ending) out[7] = null;
      this.vpos[voice] = p; return out;
    }

    /** The tempest, step by step. See TEMPEST for the form. */
    _scheduleTempest() {
      const ctx = this.ctx, KEY = THEMES.tempest.key, total = TEMPEST.bars;
      while (this.nextTime < ctx.currentTime + 0.6) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx, first } = TEMPEST.where(bi);
        const dur = TEMPEST.durOf(sec, idx), chord = TEMPEST.chords[bi], root = KEY + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const pcs = [root % 12, third % 12, fifth % 12], chordTones = [root + 48, third + 48, fifth + 48];
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        const skipRest = () => { this.nextTime += dur; this.step++; };
        if (sec.id === 'hush' || sec.id === 'rise' || sec.id === 'surge') {
          const e = (bi + s / 8) / 24;                                                                                          // e: how far the build-up has climbed, 0..1
          if (sec.id === 'hush') {
            if (s === 0) {
              this._cello(t, 36 + root, dur * 8, 0.6 + 0.4 * e);                                                              // the drone
              if (idx % 2 === 0) this._pad(t, [root + 48, fifth + 48], dur * 16, 0.7, { cutoff: 650, tremolo: 4.5, depth: 0.4, attack: 2.2 });
              this._drum(t, 0.4 + 0.4 * e, 1.8); this._drum(t + 0.27, 0.28 + 0.3 * e, 2);                                      // a heartbeat
              if (idx % 2 === 1) this._harp(t, root + 48, 0.5, 1.6);
              if (idx === 2 || idx === 6) this._violin(t, posNote(idx === 2 ? 11 : 12), dur * 8, 0.45, -0.3, true);            // one long, aching note, then a half-step higher
            }
          } else if (sec.id === 'rise') {
            if (s === 0) this._pad(t, chordTones, dur * 8, 0.8, { cutoff: 1100, tremolo: 7, depth: 0.5, attack: 1.4 });
            if (s % 2 === 0) this._drum(t, 0.35 + 0.35 * e, 1.4);
            this._cello(t, 36 + root, dur * 0.8, 0.45 + 0.4 * e);                                                              // a pulse in the dark
            if (s === 0 || s === 4) this._harp(t, [root + 48, fifth + 48][s / 4], 0.5, 0.9);
            this._violin(t, posNote(9 + idx), dur * 0.9, 0.2 + 0.25 * e, 0.3, true);                                           // a violin trembling higher with every bar
          } else {
            if (bi === 23 && s >= 4) { skipRest(); continue; }                                                                // a held breath before the storm breaks
            if (s === 0) this._pad(t, chordTones, bi === 23 ? dur * 4 : dur * 8, 1, { cutoff: 1500, tremolo: 8.5, depth: 0.5, attack: 0.5 });
            this._drum(t, 0.3 + 0.6 * e, 1.1);
            if (idx >= 6) this._snare(t, 0.35 + 0.45 * (s / 8)); else if (s % 4 === 2) this._snare(t, 0.4 + 0.3 * e);        // a snare roll into the drop
            this._cello(t, 36 + root + (s % 2 ? 12 : 0), dur * 0.85, 0.6 + 0.5 * e);
            this._harp(t, [root + 48, third + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72][s], 0.45 + 0.3 * e, 0.5);
            if (bi === 23 && s === 3) this._violin(t, posNote(17), dur * 5, 0.9, -0.4, false, true);                         // the climb's last note does not land: it drops away
            else this._violin(t, posNote(10 + idx), dur * 0.9, 0.25 + 0.4 * e, -0.4);
            if (idx >= 4 && !(bi === 23 && s === 3)) this._violin(t, posNote(8 + idx), dur * 0.9, 0.2 + 0.3 * e, 0.4, true);   // a second joins, answering from the other side
          }
        } else if (sec.id === 'duel') {
          const cb = idx, rd = Math.floor(cb / 16), cc = cb % 16, boost = rd ? 1.1 : 1;                                       // rd: which round (the second duel has two)
          if (cc === 0 && s === 0) { this._crash(t, rd ? 0.7 : 1); this._drum(t, rd ? 1 : 1.3, 1.6); }
          if (s === 0 || s === 4) this._drum(t, s === 0 ? 1 : 0.8, 1); else if (s === 6 && cc % 2) this._drum(t, 0.5, 1);
          if (s === 2 || s === 6) this._snare(t, 0.8);
          if (cc % 4 === 0 && s === 0) this._drum(t, 0.9, 2.2);                                                              // thunder under the phrase
          if (s % 2 === 0) this._cello(t, 36 + root + (s % 4 === 2 ? 12 : 0), dur * 1.7, 1);
          if (s === 0) this._pad(t, chordTones, dur * 8, 1, { cutoff: 2000, tremolo: 10, depth: 0.5, attack: 0.05 });
          this._harp(t, [root + 60, fifth + 60, root + 72, third + 72, fifth + 72, third + 72, root + 72, fifth + 60][s], 0.42, 0.35);
          if (s === 0) {                                                                                                     // who plays this bar? they trade 2 bars each, then bar by bar, then join (the roles swap in the second round)
            const x = cc < 8 ? cc % 4 < 2 : cc < 12 ? cc % 2 === 0 : true, y = cc < 8 ? cc % 4 >= 2 : cc < 12 ? cc % 2 === 1 : true;
            const a = rd ? y : x, b = rd ? x : y, lift = rd ? 1 : 0;
            this.lines.a = a ? this._duelLine('a', pcs, 7 + lift, 16 + lift, cc === 15) : [];
            this.lines.b = b ? (cc >= 12 ? this.lines.a.map(p => p === null ? null : p - 2) : this._duelLine('b', pcs, 3 + lift, 12 + lift, false)) : [];                      // (at the end B shadows A a third below)
          }
          const pa = this.lines.a[s], pb = this.lines.b[s];
          if (pa != null) this._violin(t, posNote(pa), dur * 0.95, 0.95 * boost, -0.5);
          if (pb != null) this._violin(t, posNote(pb), dur * 0.95, 0.85 * boost, 0.5, true);
        } else if (sec.id === 'slow') {                                                                                      // the storm spends itself: everything slows and thins
          const e1 = 1 - (idx + s / 8) / 4;
          if (s === 0) this._pad(t, chordTones, dur * 8, 0.8 * e1, { cutoff: 1200, tremolo: 6, depth: 0.4, attack: 0.1 });
          if (s === 0 || (s === 4 && idx < 2)) this._drum(t, 0.6 * e1 + 0.1, 1.2);
          this._cello(t, 36 + root, dur * 0.85, 0.25 + 0.7 * e1);
          this._harp(t, [root + 72, fifth + 60, third + 60, root + 60, fifth + 48, third + 48, root + 48, root + 36][s], 0.1 + 0.4 * e1, 0.6);          // the harp falls, one string at a time
          if (idx === 3 && s === 0) this._violin(t, posNote(14), dur * 8, 0.7, -0.4, false, true);                           // one violin's last cry, falling
        } else if (sec.id === 'cello') {                                                                                     // a cello alone, in the back of a dark hall
          const k = idx / 8;
          if (s === 0 && idx % 2 === 0) {
            this._pad(t, [root + 48, fifth + 48], dur * 16, 0.6, { cutoff: 520, tremolo: 3.5, depth: 0.3, attack: 2 });
            this._cello(t, 36 + root, dur * 16, 0.5);                                                                         // a pedal under the line
          }
          if (s === 0 || s === 4) {                                                                                           // the melody: two long notes a bar, drifting towards the chord tones
            let p = this.cpos + [-2, -1, -1, 0, 1, 1, 2][Math.random() * 7 | 0];
            if (p > 0) p = -1; if (p < -7) p = -6;
            for (const d of [0, 1, -1, 2, -2]) if (pcs.includes(posNote(p + d) % 12) && p + d >= -7 && p + d <= 0) { p += d; break; }
            this.cpos = p; this._cello(t, posNote(p), dur * 3.9, 0.7 + 0.4 * k);
          }
          if (s === 0 && idx % 2 === 1) this._harp(t, root + 48, 0.4, 2);
          if (s === 0 && idx >= 5) { this._drum(t, 0.25, 2); this._drum(t + 0.3, 0.18, 2.2); }                               // a faint heartbeat returns
        } else {                                                                                                             // rebuild: the build-up again, from the cello's low light, faster each bar
          const e2 = (idx + s / 8) / 8;
          if (idx === 7 && s >= 4) { skipRest(); continue; }
          if (s === 0) this._pad(t, chordTones, idx === 7 ? dur * 4 : dur * 8, 0.6 + 0.4 * e2, { cutoff: 900 + 900 * e2, tremolo: 5 + 4 * e2, depth: 0.5, attack: 0.4 });
          this._cello(t, 36 + root, dur * 0.8, 0.4 + 0.7 * e2);
          if (idx >= 4 || s % 2 === 0) this._drum(t, 0.2 + 0.7 * e2, 1.3);
          if (idx >= 6) this._snare(t, 0.3 + 0.5 * (s / 8)); else if (idx >= 3 && s % 4 === 2) this._snare(t, 0.3 + 0.3 * e2);
          if (s % 2 === 0) this._harp(t, [root + 48, third + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72][s], 0.3 + 0.35 * e2, 0.6);
          if (idx === 7 && s === 3) this._violin(t, posNote(16), dur * 5, 0.9, -0.4, false, true);                         // and again the last note drops away
          else this._violin(t, posNote(6 + idx), dur * 0.9, 0.15 + 0.4 * e2, 0.3, true);
          if (idx >= 3 && !(idx === 7 && s === 3)) this._violin(t, posNote(8 + idx), dur * 0.9, 0.15 + 0.3 * e2, -0.3);
        }
        this.nextTime += dur; this.step++;
      }
    }

    /** Move a melody one step (a walk of up to two scale steps) inside lo..hi; on a strong beat (snap) settle on a chord tone. */
    _tune(p, lo, hi, key, sc, pcs, snap) {
      p = clamp(p + [-2, -1, -1, 0, 1, 1, 2][Math.random() * 7 | 0], lo, hi);
      if (snap) for (const k of [0, 1, -1, 2, -2]) if (p + k >= lo && p + k <= hi && pcs.includes(nm(p + k, key, sc) % 12)) { p += k; break; }
      return p;
    }

    /** The ballad, step by step. See BALLAD for the form. The ensemble never changes: strings (violins, a pad), a cello, war drums, and a flute and
     *  high brass for accents; only what they play (and how much) does. */
    _scheduleBallad() {
      const ctx = this.ctx, total = BALLAD.bars, rnd = Math.random;
      const brassNote = pc => 72 + ((pc - 72) % 12 + 12) % 12;                                                             // a chord tone in the high register (C5-B5)
      while (this.nextTime < ctx.currentTime + 0.6) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = BALLAD.where(bi);
        const dur = BALLAD.stepDur(bi), V = 0.3 + 0.7 * BALLAD.level(bi);                                                   // V: how loud the piece is at this bar (a smooth curve)
        const chord = BALLAD.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const pcs = [root % 12, third % 12, fifth % 12], chordTones = [root + 48, third + 48, fifth + 48], id = sec.id;
        const sc = id === 'dread' || id === 'somber' ? MINOR_PENT : MAJOR_PENT, side = s % 2 ? 0.35 : -0.35;
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (id === 'intro') {                                                                                                // a soft intro: strings swelling, a solo violin, a cello that wakes, a far-off drum
          if (s === 0 && idx % 2 === 0) this._pad(t, [root + 48, fifth + 48], dur * 16, 0.55 * V + 0.2, { cutoff: 650, tremolo: 4, depth: 0.3, attack: 2 });
          if (s === 0 && idx >= 2) this._cello(t, 36 + root, dur * 8, 0.55 * V + 0.15);
          if (s === 0 && idx >= 1) { this.mp = this._tune(this.mp, 3, 8, key, sc, pcs, true); this._violin(t, nm(this.mp, key, sc), dur * 7, 0.5 * V + 0.15, -0.3); }
          if (s === 0 && idx >= 3) this._drum(t, 0.25 * V + 0.1, 2);
          if (s === 4 && idx >= 5) { this.mp = this._tune(this.mp, 4, 8, key, sc, pcs, true); this._flute(t, nm(this.mp, key, sc), dur * 3.5, 0.45 * V + 0.1); }
        } else if (id === 'farm') {                                                                                          // casual farm vibes: a fiddle, a boom-chick cello, a hand-drum
          const tt = t + (s % 2 ? dur * 0.12 : 0), pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0);
          if (s === 0) this._cello(tt, low, dur * 0.9, 1.3 * V); else if (s === 4) this._cello(tt, low + 7, dur * 0.9, V);                                  // boom
          if (s === 2 || s === 6) chordTones.forEach((n, i) => this._violin(tt + i * 0.02, n + 12, dur * 0.5, 0.4 * V, i % 2 ? 0.3 : -0.3, true));        // chick
          if (s === 0) this._drum(tt, 0.5 * V, 0.9); else if (s === 4) this._drum(tt, 0.35 * V, 0.9); else if (s === 2 || s === 6) this._drum(tt, 0.16 * V, 0.7);
          if (s === 0 && idx % 4 === 0) this._pad(t, chordTones, dur * 16, 0.4 * V, { cutoff: 1200, tremolo: 4, depth: 0.25, attack: 0.5 });
          if (idx >= 2 && [0, 3, 4, 6].includes(s) && (s === 0 || rnd() < 0.75)) { this.mp = this._tune(this.mp, 3, 9, key, sc, pcs, s === 0 || s === 4); this._violin(tt, nm(this.mp, key, sc), dur * 0.8, 0.8 * V, 0.3); }   // the fiddle tune
          if (s === 0 && idx % 4 === 3) this._violin(t, nm(clamp(this.mp + 3, 6, 11), key, sc), dur * 7, 0.5 * V, -0.2, true);                           // a held note
          if (s === 0 && idx % 4 === 1 && idx >= 4) this._flute(t, nm(clamp(this.mp + 2, 5, 10), key, sc), dur * 3, 0.5 * V);                            // a whistle
          if (idx === 15 && s === 0) this._brass(t, brassNote(pcs[0]), dur * 6, 0.4 * V);                                                              // a far horn, leaning towards the glee
        } else if (id === 'glee') {                                                                                          // cheery glee: staccato strings, a bouncing cello, lively drums, bright brass stabs
          if (s === 0) { this._drum(t, 0.8 * V, 1); this._pad(t, chordTones, dur * 8, 0.7 * V, { cutoff: 2000, tremolo: 7, depth: 0.3, attack: 0.08 }); }
          else if (s === 4) this._drum(t, 0.6 * V, 1); else if (s === 2 || s === 6) this._drum(t, 0.3 * V, 0.8);
          if (s % 2 === 0) this._cello(t, 36 + root + (s % 4 === 2 ? 12 : 0), dur * 0.8, 0.9 * V);
          if (rnd() < 0.85) { this.mp = this._tune(this.mp, 4, 11, key, sc, pcs, s % 4 === 0); this._violin(t, nm(this.mp, key, sc), dur * 0.85, 0.8 * V, -0.4); if (s % 2 === 0) this._violin(t, nm(this.mp - 2, key, sc), dur * 0.85, 0.5 * V, 0.4, true); }
          if (s === 4 && idx % 2 === 0) this._flute(t, nm(clamp(this.mp + 2, 6, 12), key, sc), dur * 2, 0.7 * V);
          if (s === 0 && idx % 4 === 0) this._brass(t, brassNote(pcs[0]), dur * 2.5, 0.7 * V); else if (s === 4 && idx % 4 === 2) this._brass(t, brassNote(pcs[2]), dur * 2.5, 0.6 * V);
        } else if (id === 'dread') {                                                                                         // dreaded anticipation: a heartbeat, a drone, strings trembling higher, a distant horn
          const e = (idx + s / 8) / 12;
          if (s === 0) {
            this._cello(t, 36 + root, dur * 8, (0.6 + 0.4 * e) * V);
            this._pad(t, chordTones, dur * 8, (0.6 + 0.4 * e) * V, { cutoff: 800 + 600 * e, tremolo: 5 + 3 * e, depth: 0.5, attack: 1 });
            this._drum(t, (0.4 + 0.4 * e) * V, 1.8); this._drum(t + 0.25, (0.28 + 0.3 * e) * V, 2);
          }
          if (e > 0.3 && s % 2 === 0) this._drum(t, (0.25 + 0.5 * e) * V, 1.4);
          if (e > 0.45) this._cello(t, 36 + root, dur * 0.8, (0.4 + 0.6 * e) * V);
          if (e > 0.15) {
            if (idx === 11 && s === 3) this._violin(t, nm(11, key, sc), dur * 5, 0.9 * V, -0.4, false, true);                // the climb's last note drops away
            else this._violin(t, nm(3 + Math.floor(e * 8), key, sc), dur * 0.9, (0.12 + 0.4 * e) * V, 0.3, true);
          }
          if (s === 0 && idx % 4 === 2) { this.mp = this._tune(clamp(this.mp, 2, 5), 2, 5, key, sc, pcs, true); this._flute(t, nm(this.mp, key, sc), dur * 5, 0.4 * V, 1.8); }       // a husky flute
          if (s === 0 && (idx === 5 || idx === 9)) this._brass(t, brassNote(pcs[2]), dur * 6, 0.45 * V);                    // a distant horn call
          if (s === 0 && idx === 11) this._brass(t, brassNote(pcs[0]), dur * 8, 0.8 * V);                                  // and one that rises as the dark closes in
        } else if (id === 'somber') {                                                                                        // a somber realization: a lone cello, a slow drum, a husky flute, one violin's falling cry
          const k = idx / 10;
          if (s === 0) { this._pad(t, [root + 48, fifth + 48], dur * 8, 0.6 * V + 0.15, { cutoff: 500, tremolo: 3.5, depth: 0.3, attack: 1.2 }); this._cello(t, 36 + root, dur * 8, 0.9 * V); }
          if (s === 0 && idx % 2 === 0) this._drum(t, 0.4 * V, 2.2);
          if (s === 0 || s === 4) { this.cp = this._tune(this.cp, -8, -2, key, sc, pcs, true); this._cello(t, nm(this.cp, key, sc), dur * 3.9, (0.7 + 0.4 * k) * V); }
          if (s === 0 && idx >= 2 && idx % 2 === 0) { this.mp = this._tune(clamp(this.mp, 3, 6), 3, 6, key, sc, pcs, true); this._flute(t, nm(this.mp, key, sc), dur * 5, 0.5 * V, 1.8); }
          if (s === 4 && idx === 6) this._brass(t, brassNote(pcs[0]), dur * 4, 0.3 * V);                                    // a mournful, far-off horn
          if (idx === 9 && s === 0) this._violin(t, nm(10, key, sc), dur * 8, 0.7 * V, -0.4, false, true);
        } else if (id === 'hope') {                                                                                          // rising hope: strings climbing and swelling, a flute lifting, a drum finding its feet, a horn waking
          const e = (idx + s / 8) / 12;
          if (s === 0) this._pad(t, chordTones, dur * 8, (0.3 + 0.6 * e) * V, { cutoff: 900 + 1200 * e, tremolo: 4 + 3 * e, depth: 0.3, attack: 0.6 });
          if (s === 0 && idx % 2 === 0) this._cello(t, 36 + root, dur * 16, (0.6 + 0.4 * e) * V);
          if (idx >= 6 && s % 2 === 0) this._cello(t, 36 + root + (s % 4 === 2 ? 12 : 0), dur * 0.8, (0.5 + 0.5 * e) * V);
          if (idx >= 2 && (s === 0 || s === 4)) { this.mp = this._tune(clamp(3 + Math.floor(idx * 0.6) + (s === 4 ? 1 : 0), 3, 10), 3, 10, key, sc, pcs, true); this._violin(t, nm(this.mp, key, sc), dur * 3.8, (0.3 + 0.5 * e) * V, s ? 0.3 : -0.3); }
          if ((s === 0 || s === 4) && idx >= 3) this._flute(t, nm(clamp(this.mp + 2, 5, 11), key, sc), dur * 3.8, (0.4 + 0.5 * e) * V);
          if (idx >= 3 && s === 0) this._drum(t, (0.3 + 0.4 * e) * V, 1.4); else if (idx >= 8 && s === 4) this._drum(t, (0.4 + 0.5 * e) * V, 1.1); else if (idx >= 10 && s % 2 === 0) this._drum(t, (0.3 + 0.5 * e) * V, 1.2);
          if (idx >= 6 && s === 0) this._brass(t, brassNote(pcs[idx % 3]), dur * 8, (0.3 + 0.5 * e) * V);
        } else if (id === 'victory') {                                                                                       // victory: the gallop in the major, two violins in harmony, war drums, brass fanfares
          if (s === 0) this._drum(t, V, 1); else if (s === 3) this._drum(t, 0.8 * V, 1); else if (s === 6) this._drum(t, 0.7 * V, 1);
          if (s === 4 || s === 7) this._drum(t, 0.5 * V, 1.5);
          if (idx % 4 === 0 && s === 0) this._drum(t, 0.9 * V, 2.2);
          if (s % 2 === 0) this._cello(t, 36 + root + (s % 4 === 2 ? 12 : 0), dur * 1.7, V);
          if (s === 0) this._pad(t, chordTones, dur * 8, 1.1 * V, { cutoff: 2600, tremolo: 9, depth: 0.3, attack: 0.05 });
          if (s === 0) { this.lines.a = this._duelLine('a', pcs, 5, 13, idx === 15, (p) => nm(p, key, sc)); this.lines.b = this.lines.a.map(p => p === null ? null : p - 2); }     // (B sings a third below: they no longer duel, they soar together)
          const pa = this.lines.a[s], pb = this.lines.b[s];
          if (pa != null) this._violin(t, nm(pa, key, sc), dur * 0.95, 0.95 * V, -0.5);
          if (pb != null) this._violin(t, nm(pb, key, sc), dur * 0.95, 0.8 * V, 0.5, true);
          if (s === 0 || s === 4) { this.mp = this._tune(clamp(this.mp, 8, 12), 8, 12, key, sc, pcs, true); this._flute(t, nm(this.mp, key, sc), dur * 3.5, 0.7 * V); }
          if (s === 0) pcs.forEach((pc, i) => this._brass(t + i * 0.015, brassNote(pc), dur * 3, 0.55 * V));                                           // the fanfare: a chord of horns
          else if (s === 4 && idx % 2 === 1) this._brass(t, brassNote(pcs[2]), dur * 1.5, 0.7 * V);
        } else {                                                                                                             // the last chord: everything lands together and is left to ring
          if (s === 0) {
            this._pad(t, [root + 36, root + 48, third + 48, fifth + 48, root + 60], dur * 8, 1.2, { cutoff: 2200, tremolo: 5, depth: 0.2, attack: 0.1 });
            this._cello(t, 36 + root, dur * 8, 1.1); this._drum(t, 1.2, 1.5);
            this._violin(t, nm(10, key, sc), dur * 8, 0.9, -0.4); this._violin(t, nm(8, key, sc), dur * 8, 0.8, 0.4, true);
            pcs.forEach((pc, i) => this._brass(t + i * 0.02, brassNote(pc), dur * 7, 0.7)); this._flute(t, nm(12, key, sc), dur * 7, 0.6);
          }
        }
        this.nextTime += dur; this.step++;
      }
    }

    _schedule() {
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.2); return; }
      if (this.paused) { this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.3); return; }
      if (this.theme === 'tempest') return this._scheduleTempest();
      if (this.theme === 'ballad') return this._scheduleBallad();
      const theme = THEMES[this.theme], name = this.theme, B = theme.bar, quiet = this.mood.cave && name !== 'battle' ? 0.6 : 1;
      while (this.nextTime < ctx.currentTime + 0.6) {
        const eighth = theme.eighth, s = this.step % B, chord = theme.prog[Math.floor(this.bar / 4) % theme.prog.length][this.bar % 4], root = theme.key + chord[0], minor = chord[1] === 'm';
        if (s === 0 && this.bar % 4 === 0) this.phrase = this._compose(theme);
        if (s === 0) { this.marks.push({ t: this.nextTime, bar: this.bar % 8 }); if (this.marks.length > 16) this.marks.shift(); }
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
  Music.TRACKS = ['calm', 'storm', 'tempest', 'battle', 'ballad'].map(id => ({ id, title: THEMES[id].title, blurb: THEMES[id].blurb }));
  Music.TITLES = Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.title]));
  return Music;
})();
