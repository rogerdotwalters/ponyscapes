'use strict';
/* SHARED - weather. The server (WeatherSystem, below) picks the weather from a table of each season's chances; everyone is sent it, so all the
 * players see and hear the same sky. Weather is made of independent LAYERS, each an intensity 0..1:
 *   rain       falls on the overworld and WATERS every crop that is not covered (heavier rain waters faster); it puts fires out
 *   wind       a strength and a direction (Weather direction `dir`, radians in world space): sways grass, trees and crops, slants the rain, pushes particles
 *   lightning  random strikes: a flash everywhere, thunder that reaches each player after a delay by their distance, and (optionally) damage and a short fire
 *   snow       falls in winter; does not water anything
 * A storm is simply rain + wind + lightning at once. A weather TYPE (clear, drizzle, thunderstorm...) is a named mix of layers; the SEASON TABLE gives
 * every type its weight in each season. Tunables are in CONFIG.sim.weather (shared/config.js).
 * The look and sound are the client's job (client/render/weatherFx.js, client/audio/weatherAudio.js). */
const Weather = (() => {
  const type = (id, name, icon, layers) => Object.freeze(Object.assign({ id, name, icon, rain: 0, wind: 0, lightning: 0, snow: 0 }, layers));
  const TYPES = Object.freeze({
    clear:        type('clear',        'Clear',         '☀️',   { wind: 0.06 }),
    breeze:       type('breeze',       'Breezy',        '\u{1F343}',      { wind: 0.32 }),
    gale:         type('gale',         'Heavy wind',    '\u{1F32C}️', { wind: 0.9 }),
    drizzle:      type('drizzle',      'Light rain',    '\u{1F326}️', { rain: 0.25, wind: 0.1 }),
    rain:         type('rain',         'Rain',          '\u{1F327}️', { rain: 0.55, wind: 0.2 }),
    downpour:     type('downpour',     'Heavy rain',    '\u{1F327}️', { rain: 0.95, wind: 0.4 }),
    thunderstorm: type('thunderstorm', 'Thunderstorm',  '⛈️',   { rain: 0.8, wind: 0.65, lightning: 0.8 }),
    snow:         type('snow',         'Snow',          '\u{1F328}️', { snow: 0.45, wind: 0.1 }),
    heavy_snow:   type('heavy_snow',   'Heavy snow',    '❄️',   { snow: 0.9, wind: 0.5 })
  });
  /** Each season's chances (relative weights; a type that is missing never happens then). */
  const TABLE = Object.freeze({
    spring: Object.freeze({ clear: 22, breeze: 8, drizzle: 32, rain: 24, downpour: 6, thunderstorm: 4, gale: 4 }),       // frequent light rain
    summer: Object.freeze({ clear: 38, breeze: 8, drizzle: 6, rain: 10, downpour: 8, thunderstorm: 30 }),                 // thunderstorms
    autumn: Object.freeze({ clear: 20, breeze: 16, gale: 28, drizzle: 10, rain: 14, downpour: 6, thunderstorm: 6 }),      // heavy wind
    winter: Object.freeze({ clear: 48, snow: 36, heavy_snow: 16 })                                                        // snow, or nothing
  });
  const cfg = () => CONFIG.sim.weather;

  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  return {
    TYPES, TABLE,
    LAYERS: Object.freeze(['rain', 'wind', 'lightning', 'snow']),
    get: id => TYPES[id] || TYPES.clear,
    allowed: (id, seasonId) => !!(TABLE[seasonId] && TABLE[seasonId][id] > 0),
    /** A type picked from a season's table by weight. `r` is a number 0..1 from the caller's random generator. */
    roll(seasonId, r) {
      const table = TABLE[seasonId] || TABLE.spring, ids = Object.keys(table);
      let total = 0; for (const id of ids) total += table[id];
      let at = r * total;
      for (const id of ids) { at -= table[id]; if (at < 0) return id; }
      return ids[ids.length - 1];
    },
    /** The layers of a type, each nudged by `jitter` (0.85..1.15) so two thunderstorms are not identical. */
    layersOf(id, jitter = 1) {
      const t = Weather.get(id), out = {};
      for (const k of Weather.LAYERS) out[k] = clamp(t[k] * (t[k] > 0.2 ? jitter : 1), 0, 1);
      return out;
    },
    angleDiff,
    /** A hook list: anything that puts a roof over a spot adds a function (map, tx, ty) -> true here. Built floors and walls, and the buildings, already do. */
    coverFns: [(map, tx, ty) => !!((map.floors && map.floors[tileKey(tx, ty)]) || (map.built && map.built[tileKey(tx, ty)]) || BuildingSites.at(tx, ty))],
    /** Is this tile covered (a roof, a floor) so that rain and snow never reach the ground? Rooms and caves always are. */
    covered(map, tx, ty) {
      if (!map || map.grid || (map.kind && map.kind !== 'world')) return true;
      for (const f of Weather.coverFns) if (f(map, tx, ty)) return true;
      return false;
    },
    /** Rain in this weather waters a plot by this much each second (a plot is watered when it reaches 1): heavier rain is faster. */
    waterRate: rain => rain * cfg().waterPerSecond,
    /** What the client keeps as the sky: set by ClientGame each snapshot { type, rain, wind, lightning, snow, dir }; null on the server. */
    view: null
  };
})();

/** The server's weather: the current type, the layers easing towards it, strikes, fires, and the watering of the fields. */
class WeatherSystem {
  constructor(server) {
    this.server = server;
    this.type = 'clear'; this.target = Weather.layersOf('clear'); this.cur = Object.assign({}, this.target);
    this.dir = 0.8; this.until = -1; this.rev = 1; this.sentRev = {};
    this.nextStrike = 0; this.fires = []; this.wet = { day: -1, plots: {} };
    this.forced = false;
  }

  /** What every player is told (the target; the client eases towards it the same way the server does). */
  wire() { return { t: this.type, rain: this.target.rain, wind: this.target.wind, lightning: this.target.lightning, snow: this.target.snow, dir: this.dir, rev: this.rev }; }
  updateFor(id) {
    if (this.sentRev[id] === this.rev) return null;
    this.sentRev[id] = this.rev;
    return this.wire();
  }

  /** Switch to a type now (the host's weather control; `id` 'auto' goes back to the table). */
  force(id) {
    if (id === 'auto') { this.forced = false; this.until = -1; return; }
    if (!Weather.TYPES[id]) return;
    this._set(id, 1); this.forced = true;
    this.until = GameSettings.totalHours(this.server.tick) + 8;
  }

  _set(id, jitter) {
    const rng = this.server.rng;
    this.type = id; this.target = Weather.layersOf(id, jitter);
    const calm = this.target.wind < 0.15;
    if (!calm) this.dir = this.dir + (rng() - 0.5) * 2.4;                                     // the wind shifts a little between spells, never a full turn-around
    this.dir = ((this.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.rev++;
  }

  _pick() {
    const s = this.server, rng = s.rng, c = CONFIG.sim.weather, season = Seasons.at(s.tick).season.id;
    let id = Weather.roll(season, rng());
    if (id === this.type && rng() < 0.5) id = Weather.roll(season, rng());                   // (not the same sky again and again)
    this._set(id, 0.85 + rng() * 0.3);
    this.until = GameSettings.totalHours(s.tick) + c.minHours + rng() * (c.maxHours - c.minHours);
  }

  /** Every tick. */
  update() {
    const s = this.server, c = CONFIG.sim.weather, hours = GameSettings.totalHours(s.tick);
    if (!this.forced) {
      const season = Seasons.at(s.tick).season.id;
      if (this.until < 0 || hours >= this.until || this.until - hours > c.maxHours + 12 || !Weather.allowed(this.type, season)) this._pick();      // (a new spell; the season changed under us; the clock moved)
    } else if (hours >= this.until || this.until - hours > 24) { this.forced = false; this.until = -1; }
    const step = c.rampPerSecond * TICK_DT;
    for (const k of Weather.LAYERS) {
      const d = this.target[k] - this.cur[k];
      if (d) this.cur[k] = Math.abs(d) <= step ? this.target[k] : this.cur[k] + Math.sign(d) * step;
    }
    if (this.cur.lightning > 0.12 && s.tick >= this.nextStrike) this._strike();
    if (this.fires.length && s.tick % 15 === 0) this._fires();
    if (this.cur.rain > 0.02 && s.tick % 15 === 0) this._water(15 * TICK_DT);
  }

  /* ---- lightning ---- */
  _strike() {
    const s = this.server, rng = s.rng, c = CONFIG.sim.weather, L = this.cur.lightning;
    this.nextStrike = s.tick + secondsToTicks((c.strikeSecondsMax - (c.strikeSecondsMax - c.strikeSecondsMin) * L) * (0.4 + rng() * 1.2));
    const outside = s._humans().filter(p => !gridOf(p));
    const anchor = outside.length ? outside[Math.floor(rng() * outside.length)] : null;
    if (!anchor && !s._humans().length) return;
    const base = anchor || s._humans()[0];
    const near = anchor && rng() < c.nearChance, ang = rng() * Math.PI * 2, dist = near ? 1 + rng() * 3 : c.strikeMin + rng() * (c.strikeMax - c.strikeMin);
    const x = base.x + Math.cos(ang) * dist, y = base.y + Math.sin(ang) * dist;
    const double = rng() < 0.3;
    s.pendingEvents.push({ type: 'lightning', wx: x, wy: y, bolt: true, double });            // no x / y: every player gets it, indoors too (the flash is dimmer there)
    s.pendingEvents.push({ type: 'strike', x, y, grid: '' });                                  // the scorch and sparks, for those out in the open
    if (c.strikeDamage > 0) this._hurtAround(x, y);
    if (c.fires) this.fires.push({ x, y, until: s.tick + secondsToTicks(c.fireSeconds * (0.7 + rng() * 0.6)) });
  }
  _hurtAround(x, y) {
    const s = this.server, c = CONFIG.sim.weather;
    for (const id in s.players) {
      const p = s.players[id];
      if (gridOf(p) || p.hp <= 0 || Math.hypot(p.x - x, p.y - y) > c.strikeRadius || Weather.covered(s.map, Math.floor(p.x), Math.floor(p.y))) continue;
      s._damagePlayer(id, c.strikeDamage);
    }
    for (const id in s.animals.animals) {                                                      // animals are shaken, never killed: they bolt
      const a = s.animals.animals[id];
      if (gridOf(a) || Math.hypot(a.x - x, a.y - y) > c.strikeRadius) continue;
      const def = AnimalDefs[a.type];
      a.hp = Math.max(1, a.hp - c.strikeDamage * 0.5); a.hurt = true; a.state = 'flee'; a.fleeT = def ? def.fleeSeconds : 3;
    }
  }
  _fires() {
    const s = this.server, c = CONFIG.sim.weather, heavy = this.cur.rain > 0.5;
    this.fires = this.fires.filter(f => f.until > s.tick);
    for (const f of this.fires) {
      if (heavy) f.until -= 15;                                                                // heavy rain puts it out twice as fast
      s.pendingEvents.push({ type: 'burn', x: f.x, y: f.y, grid: '' });
      if (!c.fireDamage) continue;
      for (const id in s.players) { const p = s.players[id]; if (!gridOf(p) && p.hp > 0 && Math.hypot(p.x - f.x, p.y - f.y) < 0.9) s._damagePlayer(id, c.fireDamage); }
    }
  }

  /* ---- rain waters the fields ---- */
  /** `dt` seconds of the current rain. Every crop plot (tilled soil, planted or not) in the open fills a little; a full one is watered for today. */
  _water(dt) {
    const s = this.server, farm = s.map.farm, today = s._today(), rate = Weather.waterRate(this.cur.rain);
    if (!farm) return;
    if (this.wet.day !== today) this.wet = { day: today, plots: {} };                           // (a new day: the soil starts to dry)
    let changed = false;
    for (const key in farm) {
      if (Groves.isKey(key) || Grass.isKey(key) || Hedges.isKey(key)) continue;                                      // saplings and cut grass are not fields
      const plot = farm[key];
      if (plot.w === today) continue;
      const i = key.indexOf(','), cx = +key.slice(0, i), cy = +key.slice(i + 1);
      if (Weather.covered(s.map, cx >> 1, cy >> 1)) continue;
      const wet = (this.wet.plots[key] || 0) + rate * dt;
      if (wet >= 1) { delete this.wet.plots[key]; plot.w = today; plot.idle = 0; changed = true; } else this.wet.plots[key] = wet;
    }
    if (changed) s._farmChanged();
  }

  /* ---- saving ---- */
  exportState() { return { t: this.type, dir: this.dir, until: this.until }; }
  static sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Weather.TYPES[raw.t]) return null;
    return { t: raw.t, dir: Number.isFinite(raw.dir) ? raw.dir : 0.8, until: Number.isFinite(raw.until) ? raw.until : -1 };
  }
  restore(w) {
    if (!w) return;
    this.type = w.t; this.target = Weather.layersOf(w.t); this.cur = Object.assign({}, this.target); this.dir = w.dir; this.until = w.until; this.rev++;
  }
}
