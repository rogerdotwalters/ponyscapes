'use strict';
/* CLIENT - the sky you see. WeatherFx keeps the weather layers the server sent (rain, wind, lightning, snow) and eases the ones it draws towards
 * them, then paints on top of the finished picture, in screen space: a grey veil under clouds, rain streaks slanted by the wind with splashes on
 * the ground, snowflakes, leaves blown about in a strong wind, and the white flash of lightning. It also tells the sound (weatherAudio.js) what is
 * happening, schedules each clap of thunder by how far the strike was, and answers "how far do things sway?" for the plants (sway()) and the
 * particles (Effects). Rooms and caves are shielded: no weather in a cave, a muffled and dimmer storm through a window. */
const WEATHER_RAMP = 0.12;                                                       // layers per second (the same as the server's: CONFIG.sim.weather.rampPerSecond)
const THUNDER_TILES_PER_SECOND = 14;                                              // how far thunder travels in a second, in game tiles
const GUST_LEAF_COLORS = { spring: ['#6fbf5a', '#9fd06a'], summer: ['#4f9a3c', '#78b24a'], autumn: ['#d9772a', '#c0502a', '#e8b13a'], winter: ['#b9a98a', '#8c7b5e'] };

class WeatherFx {
  constructor(game) {
    this.game = game; this.audio = null;
    this.cur = { rain: 0, wind: 0, lightning: 0, snow: 0, dir: 0 };              // what is drawn (eased)
    this.gust = 1;                                                              // the wind swells and drops around its strength
    this.t = 0; this.drops = []; this.flakes = []; this.leaves = []; this.splashes = []; this.pulses = []; this.thunders = [];
    this.flash = 0; this.w = 0; this.h = 0;
    Weather.view = this.cur;
    game.events.on('lightning', e => this.onLightning(e));
  }

  /** The wind as a push on the screen, left (-1) to right (+1), times its strength (and gusts). */
  windX() { const c = this.cur; return ((Math.cos(c.dir) - Math.sin(c.dir)) * Math.SQRT1_2) * c.wind * this.gust; }
  /** How far a plant leans, in pixels (a whole number, so a cached picture of it is only one of a few): `key` makes each plant sway on its own beat. */
  sway(key, now, amount = 3) {
    const c = this.cur; if (c.wind < 0.12) return 0;
    const k = typeof key === 'number' ? key : (String(key).length * 7 + (String(key).charCodeAt(0) | 0));
    const lean = this.windX() * amount * 0.9, flutter = Math.sin(now * 0.004 * (0.6 + c.wind) + k * 1.7) * amount * c.wind * 0.7;
    return Math.round(lean + flutter);
  }

  /* ---- lightning ---- */
  /** A strike at (wx, wy): the flash is at once (brighter and sharper the closer it is), the thunder follows by how far away it was. */
  onLightning(e) {
    const me = this.game.local; if (!me) return;
    const dist = Math.hypot(e.wx - me.x, e.wy - me.y), amp = clamp(1.15 - dist / 70, 0.3, 1);
    const kind = this.game.map.kind, shield = kind === 'cave' ? 0 : kind === 'room' ? 0.35 : 1;      // a cave sees nothing; a room, a flicker at the window
    if (shield > 0) {
      this.pulses.push({ t0: this.t, amp: amp * shield, k: 9 });
      if (e.double) this.pulses.push({ t0: this.t + 0.14, amp: amp * shield * 0.7, k: 7 });
      this.pulses.push({ t0: this.t + 0.05, amp: amp * shield * 0.35, k: 3 });                                 // the afterglow
    }
    this.thunders.push({ at: this.t + clamp(dist / THUNDER_TILES_PER_SECOND, 0.25, 6), amp, dist });
  }

  /** Ease the layers and the flash by dt seconds, then tell the sound. */
  update(dt) {
    this.t += dt;
    const target = this.game.weather || this.cur, step = WEATHER_RAMP * dt;
    if (!this.started && this.game.weather) { this.started = true; Object.assign(this.cur, this.game.weather); }     // joining in the middle of a storm: it is already raging
    for (const k of Weather.LAYERS) { const d = (target[k] || 0) - this.cur[k]; this.cur[k] = Math.abs(d) <= step ? (target[k] || 0) : this.cur[k] + Math.sign(d) * step; }
    const dd = Weather.angleDiff(target.dir || 0, this.cur.dir); this.cur.dir += Math.abs(dd) <= step * 3 ? dd : Math.sign(dd) * step * 3;       // (the wind turns slowly)
    this.gust = 1 + Math.sin(this.t * 0.9) * 0.18 + Math.sin(this.t * 2.3 + 1) * 0.1 + Math.sin(this.t * 0.31) * 0.12;
    let flash = 0;
    this.pulses = this.pulses.filter(p => this.t - p.t0 < 1.2);
    for (const p of this.pulses) if (this.t >= p.t0) flash = Math.max(flash, p.amp * Math.exp(-(this.t - p.t0) * p.k));
    this.flash = flash;
    const kind = this.game.map.kind, indoors = kind === 'world' ? 0 : kind === 'room' ? 0.7 : 1;
    for (let i = this.thunders.length - 1; i >= 0; i--) {
      const th = this.thunders[i];
      if (this.t < th.at) continue;
      this.thunders.splice(i, 1);
      if (this.audio) this.audio.thunder(th.amp, indoors, th.dist);
    }
    if (this.audio) this.audio.update(this.cur, indoors, this.gust, dt);
  }

  /** Draw over the finished picture (ctx is the screen canvas; w and h its size in device pixels; dpr = device pixels per CSS pixel). */
  draw(ctx, w, h, dt, dpr = 1) {
    this.update(dt);
    const c = this.cur, kind = this.game.map.kind;
    if (kind === 'cave') return;
    const outdoors = kind === 'world';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (outdoors) {
      const day = DayCycle.daylight(this.game.hour()), veil = Math.min(0.46, c.rain * 0.36 + c.snow * 0.12 + c.lightning * 0.14 + c.wind * 0.04) * (0.4 + 0.6 * day);
      if (veil > 0.005) { ctx.fillStyle = `rgba(34,46,70,${veil.toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
      if (c.rain > 0.02) this._rain(ctx, w, h, dt, dpr);
      if (c.snow > 0.02) this._snow(ctx, w, h, dt, dpr);
      if (c.wind > 0.35) this._leaves(ctx, w, h, dt, dpr);
    }
    if (this.flash > 0.01) { ctx.fillStyle = `rgba(228,236,255,${Math.min(0.85, this.flash * 0.8).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
  }

  /** Rain: streaks that fall faster and thicker as it gets heavier, slanted by the wind; splashes where they land. */
  _rain(ctx, w, h, dt, dpr) {
    const c = this.cur, want = Math.min(520, Math.round(c.rain * 260 * (w * h) / (1280 * 720 * dpr * dpr))), slant = this.windX() * 0.55;
    while (this.drops.length < want) this.drops.push({ x: Math.random() * (w + h * 0.6) - h * 0.3, y: Math.random() * h, v: 0.8 + Math.random() * 0.5, len: 0.7 + Math.random() * 0.6 });
    if (this.drops.length > want) this.drops.length = want;
    const fall = (700 + c.rain * 600) * dpr, long = (9 + c.rain * 12) * dpr;
    ctx.lineWidth = Math.max(1, dpr * (c.rain > 0.6 ? 1.6 : 1.1)); ctx.strokeStyle = `rgba(196,218,242,${(0.28 + c.rain * 0.3).toFixed(2)})`; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of this.drops) {
      const vy = fall * d.v, vx = vy * slant;
      d.x += vx * dt; d.y += vy * dt;
      if (d.y > h) { if (Math.random() < 0.35 && this.splashes.length < 90) this.splashes.push({ x: d.x, y: h * (0.35 + Math.random() * 0.65), age: 0 }); d.y -= h + long; d.x = Math.random() * (w + h * 0.6) - h * 0.3; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - slant * long * d.len, d.y - long * d.len);
    }
    ctx.stroke();
    this.splashes = this.splashes.filter(s => (s.age += dt) < 0.28);
    ctx.lineWidth = dpr; ctx.strokeStyle = 'rgba(210,228,248,.4)';
    for (const s of this.splashes) { const r = (2 + s.age * 22) * dpr; ctx.globalAlpha = 1 - s.age / 0.28; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  _snow(ctx, w, h, dt, dpr) {
    const c = this.cur, want = Math.min(420, Math.round(c.snow * 220 * (w * h) / (1280 * 720 * dpr * dpr))), drift = this.windX() * 170 * dpr;
    while (this.flakes.length < want) this.flakes.push({ x: Math.random() * w, y: Math.random() * h, s: 1.6 + Math.random() * 2.2, ph: Math.random() * 6.28, v: 0.6 + Math.random() * 0.7 });
    if (this.flakes.length > want) this.flakes.length = want;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const f of this.flakes) {
      f.y += (50 + 55 * c.snow) * f.v * dpr * dt; f.x += (drift * f.v + Math.sin(this.t * 1.3 + f.ph) * 18 * dpr) * dt;
      if (f.y > h) { f.y = -4; f.x = Math.random() * w; } if (f.x > w + 4) f.x = -4; else if (f.x < -4) f.x = w + 4;
      ctx.fillRect(f.x, f.y, f.s * dpr, f.s * dpr);
    }
  }

  /** A strong wind carries leaves across the screen. */
  _leaves(ctx, w, h, dt, dpr) {
    const c = this.cur, want = Math.round((c.wind - 0.3) * 40), season = Seasons.at(this.game.clockTick).season.id, colors = GUST_LEAF_COLORS[season], dir = Math.sign(this.windX() || 1);
    while (this.leaves.length < want) this.leaves.push({ x: dir > 0 ? -10 : w + 10, y: Math.random() * h, ph: Math.random() * 6.28, v: 0.7 + Math.random() * 0.7, c: colors[(Math.random() * colors.length) | 0], s: 2 + Math.random() * 2 });
    if (this.leaves.length > want + 6) this.leaves.length = want + 6;
    const speed = (120 + Math.abs(this.windX()) * 520) * dpr;
    for (const l of this.leaves) {
      l.x += dir * speed * l.v * dt; l.y += (Math.sin(this.t * 3 + l.ph) * 50 + 22) * dpr * dt;
      if (l.x > w + 12 || l.x < -12 || l.y > h + 8) { l.x = dir > 0 ? -10 : w + 10; l.y = Math.random() * h; }
      ctx.fillStyle = l.c; ctx.fillRect(l.x, l.y, l.s * dpr * (1.3 + Math.sin(this.t * 6 + l.ph) * 0.4), l.s * dpr);
    }
  }
}
