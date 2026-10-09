'use strict';
/* CLIENT - the sound of the weather, made on the fly with the Web Audio API (no sound files): rain is filtered noise (a patter and a hiss that grow with
 * its strength), wind is low noise that swells and drops with the gusts, snow only hushes the world, and thunder is a burst of rumble whose length and
 * depth follow how far away the strike was. Indoors everything is muffled and quieter; in a cave only the deepest thunder gets through.
 * Browsers keep sound off until the person has touched the page, so the audio starts on the first tap, click or key. The volume (Menu > Controls >
 * Mouse & touch) is kept in this browser; 0 switches it off. */
class WeatherAudio {
  static get volume() { return GameAudio.volume('weather'); }
  static setVolume(v) { GameAudio.setVolume('weather', v); }

  constructor() {
    this.ctx = null; this.nodes = null;
    WeatherAudio.current = this;
    GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
  }

  /** A looping buffer of noise: white, or 'brown' (deep, for wind and rumble). */
  _noise(seconds, brown) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return buf;
  }
  _loop(buffer, chain) {
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    let node = src; for (const n of chain) { node.connect(n); node = n; }
    src.start(); return node;
  }

  _build() {
    const ctx = this.ctx, filter = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }, gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const master = gain(1), room = filter('lowpass', 20000);                       // room: the muffling indoors (the volume itself lives on GameAudio's weather bus)
    room.connect(master); master.connect(GameAudio.buses.weather);
    const white = this._noise(3, false), brown = this._noise(4, true);
    const patterG = gain(0), patter = this._loop(white, [filter('lowpass', 1500, 0.5), filter('bandpass', 1000, 0.5), patterG]); patterG.connect(room);          // the body of the rain
    const hissG = gain(0); this._loop(white, [filter('highpass', 5200), hissG]); hissG.connect(room);                                 // the sparkle of the drops
    const windG = gain(0), windF = filter('lowpass', 300, 1.2); this._loop(brown, [windF, windG]); windG.connect(room);              // the wind
    const howlG = gain(0), howlF = filter('bandpass', 520, 4); this._loop(white, [howlF, howlG]); howlG.connect(room);                // the whistle of a gale
    this.nodes = { master, room, patterG, hissG, windG, windF, howlG, howlF, white, brown };
  }

  /** Called every frame with the weather layers being drawn. indoors: 0 outside, 0.7 in a room, 1 in a cave. */
  update(w, indoors, gust, dt) {
    if (!this.nodes || !this.ctx || this.ctx.state !== 'running') return;
    const n = this.nodes, now = this.ctx.currentTime, to = (param, v, tc = 0.25) => param.setTargetAtTime(v, now, tc);
    const quiet = 1 - indoors * 0.8, snowHush = 1 - w.snow * 0.5;                              // (a cave is nearly silent; snow deadens the world)
    to(n.room.frequency, indoors > 0 ? 1100 - indoors * 700 : 20000, 0.4);
    to(n.patterG.gain, w.rain * w.rain * 0.16 * quiet);
    to(n.hissG.gain, Math.max(0, w.rain - 0.3) * 0.05 * quiet * (1 - indoors));
    const windPower = Math.max(w.wind, w.snow * 0.35) * gust;
    to(n.windG.gain, windPower * windPower * 0.6 * quiet * snowHush);
    to(n.windF.frequency, 180 + windPower * 700, 0.3);
    to(n.howlG.gain, Math.max(0, w.wind - 0.55) * 0.25 * quiet * gust * gust);
    to(n.howlF.frequency, 380 + w.wind * 520 + (gust - 1) * 400, 0.3);
  }

  /** A clap of thunder: amp 0..1 (how loud), indoors 0..1, dist in tiles (far strikes rumble longer and lower). */
  thunder(amp, indoors, dist) {
    if (!this.nodes || !this.ctx || this.ctx.state !== 'running' || WeatherAudio.volume <= 0) return;
    const ctx = this.ctx, now = ctx.currentTime, far = clamp(dist / 60, 0, 1), loud = amp * (1 - indoors * 0.6);
    const src = ctx.createBufferSource(); src.buffer = Math.random() < 0.5 ? this.nodes.brown : this.nodes.white; src.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(900 - far * 600 - indoors * 300, now); low.frequency.exponentialRampToValueAtTime(70, now + 2.5 + far * 2);
    const g = ctx.createGain(), len = 1.6 + far * 3.2 + Math.random();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, loud * 1.4), now + 0.04 + far * 0.25);                // a near crack is sudden, a far one swells
    for (let i = 1; i <= 3; i++) g.gain.exponentialRampToValueAtTime(Math.max(0.001, loud * (0.9 - i * 0.2) * (0.5 + Math.random() * 0.5)), now + 0.1 + i * (0.35 + far * 0.3) + Math.random() * 0.2);   // the roll
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    src.connect(low); low.connect(g); g.connect(this.nodes.room);
    src.start(now, Math.random() * 2); src.stop(now + len + 0.1);
  }
}
