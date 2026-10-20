'use strict';
/* CLIENT - what a pony POWER looks like. The server sends one 'ability' event when a power is fired (ability, where, facing, who, and `hits`: the creatures and friends it
 * reached). Every Effect the power is made of (shared/rarity.js: damage, slow, scare, heal, speed, light, gift) is drawn as its own picture, the way its data describes it:
 *   shape   circle: a ring spreads out to the radius      cone: a wedge sweeps out ahead      self: an aura round the rider
 *   look    what it is made of: leaves, petals, stars, hearts, drops, waves, bolts, rays, notes, mist, flames, frost ... (LOOKS below; any other effect gets one from its kind)
 *   a power that LASTS (a slow, a speed-up) keeps showing: a zone on the ground for its duration, snow orbiting each slowed creature, streaks behind the rider.
 * And every creature it reached is marked: a slash where it was hurt, a ring of frost while it is slowed, a "!" when it bolts, a rising plus on someone healed.
 * All of it is drawn in world space with the same 2D calls as the rest of the effects (so it works in both renderers). */
const POWER_LOOKS = Object.freeze({
  leaf_damage: 'leaf', leaf_scare: 'leaf', star_damage: 'star', star_fall: 'starfall', star_heal: 'star', heart_heal: 'heart', flower_slow: 'petal', moon_dash: 'streak', cloud_scare: 'mist',
  apple_gift: 'apple', drop_heal: 'drop', tide_heal: 'wave', tide_slow: 'wave', bolt_damage: 'bolt', bolt_scare: 'bolt', sun_damage: 'sun', sun_glow: 'sun', note_slow: 'note',
  fire_damage: 'flame', fire_scare: 'flame', frost_damage: 'frost', frost_slow: 'frost', dash_speed: 'streak', night_glow: 'sun'
});
const POWER_LOOK_BY_KIND = Object.freeze({ damage: 'burst', slow: 'frost', scare: 'shock', heal: 'plus', speed: 'streak', light: 'sun', gift: 'sparkle' });
const POWER_LIFT = 20;                  // px: the middle of a pony's body above its feet

const powerRand = (a, b) => a + Math.random() * (b - a);
const powerEase = t => 1 - (1 - t) * (1 - t);
const powerAlpha = (t, fadeFrom = 0.6) => t < fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / (1 - fadeFrom));

/** The little shapes powers are made of. All are drawn at (x, y) in iso space, `s` px across, in the current fillStyle / strokeStyle. */
const PowerShapes = {
  leaf(ctx, x, y, s, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.8, s, 0); ctx.quadraticCurveTo(0, s * 0.8, -s, 0); ctx.fill(); ctx.strokeStyle = 'rgba(20,60,20,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke(); ctx.restore(); },
  petal(ctx, x, y, s, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); },
  star(ctx, x, y, s, rot = 0) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? s * 0.28 : s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); },
  heart(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35); ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); ctx.fill(); },
  plus(ctx, x, y, s) { const t = s * 0.38; ctx.fillRect(x - s, y - t, s * 2, t * 2); ctx.fillRect(x - t, y - s, t * 2, s * 2); },
  drop(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.quadraticCurveTo(x + s, y, x, y + s * 0.8); ctx.quadraticCurveTo(x - s, y, x, y - s * 1.3); ctx.fill(); },
  flake(ctx, x, y, s, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(-Math.cos(a) * s, -Math.sin(a) * s); } ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore(); },
  note(ctx, x, y, s, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.3); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.6, s * 0.42, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(s * 0.4, -s * 1.5, 1.8, s * 1.5); ctx.fillRect(s * 0.4, -s * 1.5, s * 0.9, 2); ctx.restore(); },
  flame(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.quadraticCurveTo(x + s, y - s * 0.2, x, y + s * 0.7); ctx.quadraticCurveTo(x - s, y - s * 0.2, x, y - s * 1.5); ctx.fill(); },
  apple(ctx, x, y, s) { ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#4f9a3a'; ctx.fillRect(x - 1, y - s - 3, 2, 4); ctx.fillRect(x + 1, y - s - 3, 4, 2.5); },
  /** A jagged bolt from (x0, y0) to (x1, y1), thick and glowing. */
  bolt(ctx, x0, y0, x1, y1, color, width) {
    const n = 7, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const j = (Math.random() - 0.5) * 16; pts.push([x0 + dx * i / n + nx * j, y0 + dy * i / n + ny * j]); }
    pts.push([x1, y1]);
    for (const [w, c] of [[width * 3.2, color + '55'], [width, '#ffffff']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  },
  /** A ring on the ground (a circle in the world is a 2:1 ellipse on screen). */
  ring(ctx, x, y, radiusTiles, width, color, alpha) {
    const k = TILE_HALF_W * Math.SQRT2 * radiusTiles;
    ctx.globalAlpha = Math.max(0, alpha); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, k), Math.max(0.25, k / 2), 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  },
  disc(ctx, x, y, radiusTiles, color, alpha) {
    const k = TILE_HALF_W * Math.SQRT2 * radiusTiles;
    ctx.globalAlpha = Math.max(0, alpha); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, k), Math.max(0.25, k / 2), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
};

class PowerFx {
  constructor(game) { this.game = game; this.items = []; this.marks = []; this.trail = []; }

  /** The look of one effect: its own entry, else one that suits its kind (hybrid powers bring their colour). */
  static lookOf(effect) { return POWER_LOOKS[effect.id] || POWER_LOOK_BY_KIND[effect.kind] || 'sparkle'; }

  /** A power was fired. `e`: { ability, x, y, facing, by, hits: [{ id, x, y, kind, fx }] }. */
  add(e) {
    const ability = abilityDef(e.ability);
    if (!ability) return;
    const mine = e.by === this.game.myId;
    for (const fx of ability.effectDefs) this.items.push(this._make(fx, e, mine));
    for (const h of (e.hits || []).slice(0, 14)) this._mark(h);
    if (this.items.length > 40) this.items.splice(0, this.items.length - 40);
  }

  _make(fx, e, mine) {
    const look = PowerFx.lookOf(fx), lasting = fx.duration > 0 || fx.kind === 'light' && look === 'sun';
    const radius = fx.radius || (fx.shape === 'self' ? 1.3 : 3), base = fx.kind === 'light' ? 3 : look === 'starfall' ? 1.5 : fx.shape === 'cone' ? 0.9 : 1.0;
    const life = Math.min(6, lasting ? Math.max(base, fx.duration || 0) : base);
    const count = look === 'bolt' ? 4 : Math.round(10 + radius * (fx.shape === 'cone' ? 4 : 5));
    const parts = Array.from({ length: count }, () => ({ a: Math.random(), r: Math.random(), d: Math.random() * 0.45, s: powerRand(0.7, 1.3), ph: Math.random() * 6.28 }));
    return { fx, look, color: fx.color, shape: fx.shape, radius, x: e.x, y: e.y, facing: e.facing, follow: mine, age: 0, life, lasting, parts, kind: fx.kind };
  }

  /** What an effect did to one creature or friend. */
  _mark(h) {
    const fx = effectDef(h.fx), look = fx ? PowerFx.lookOf(fx) : 'burst';
    const life = h.kind === 'slow' ? Math.min(6, (fx && fx.duration) || 3) : h.kind === 'heal' ? 1.2 : h.kind === 'scare' ? 1.4 : 0.6;
    this.marks.push({ id: h.id, x: h.x, y: h.y, kind: h.kind, look, color: fx ? fx.color : '#ffffff', age: 0, life, ph: Math.random() * 6.28 });
  }

  /** Where something is now: the rider while it is you (the power follows you), an animal where it has run to, else where it was. */
  _where(o) {
    const g = this.game;
    if (o.follow && g.local) return { x: g.local.x, y: g.local.y };
    if (o.id !== undefined && g.latestAnimals) { const a = g.latestAnimals()[o.id]; if (a && Number.isFinite(a.x)) return { x: a.x, y: a.y }; }
    return { x: o.x, y: o.y };
  }

  /** One frame (iso space; `dt` seconds). */
  draw(ctx, dt) {
    if (!this.items.length && !this.marks.length) return;
    this.items = this.items.filter(o => (o.age += dt) < o.life);
    this.marks = this.marks.filter(m => (m.age += dt) < m.life);
    ctx.save(); ctx.lineCap = 'round';
    for (const o of this.items) this._item(ctx, o);
    for (const m of this.marks) this._markDraw(ctx, m);
    ctx.restore();
  }

  /* ---------------------------------------- a power's picture ---------------------------------------- */
  _item(ctx, o) {
    const t = o.age / o.life, at = o.follow ? this._where(o) : o, cx = isoX(at.x, at.y), cy = isoY(at.x, at.y), c = o.color;
    const spread = o.lasting && o.kind !== 'speed' ? Math.min(1, o.age / 0.4) : Math.min(1, o.age / Math.min(o.life, 0.45)), reach = o.radius * powerEase(spread);
    ctx.fillStyle = c; ctx.strokeStyle = c;
    this._field(ctx, o, at, cx, cy, t, spread, reach);
    const look = o.look;
    if (look === 'bolt') return this._bolts(ctx, o, at, cx, cy, t);
    if (look === 'streak') return this._streaks(ctx, o, at, cx, cy, t);
    if (look === 'sun') return this._rays(ctx, o, cx, cy, t);
    if (look === 'wave') this._waves(ctx, o, cx, cy, t, reach);
    for (const p of o.parts) {
      const u = (o.lasting ? (o.age / Math.min(o.life, 1.6) + p.d) % 1 : (o.age / o.life - p.d) / (1 - p.d));
      if (u <= 0 || u >= 1) continue;
      const q = this._particle(o, at, p, u, reach);
      if (!q) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, q.alpha)); ctx.fillStyle = q.color || c; ctx.strokeStyle = q.color || c;
      this._shape(ctx, look, q);
      if (q.ring) PowerShapes.ring(ctx, q.x, q.y, q.ring, 1.5, o.color, q.alpha);                       // (a starfall star lands in a ring)
    }
    ctx.globalAlpha = 1;
  }

  /** The ground: what the power covers. */
  _field(ctx, o, at, cx, cy, t, spread, reach) {
    const c = o.color, fade = o.lasting ? (o.age > o.life - 0.5 ? (o.life - o.age) / 0.5 : 1) : powerAlpha(t, 0.3);
    if (o.shape === 'circle') {
      if (o.lasting) {                                                                                  // a zone that stays: breathing fill, a marching edge
        PowerShapes.disc(ctx, cx, cy, reach, c, (0.13 + 0.05 * Math.sin(o.age * 4)) * fade);
        PowerShapes.ring(ctx, cx, cy, reach, 2, c, 0.75 * fade);
        PowerShapes.ring(ctx, cx, cy, reach * (0.55 + 0.1 * Math.sin(o.age * 3)), 1.4, c, 0.35 * fade);
      } else {
        PowerShapes.disc(ctx, cx, cy, reach, c, 0.22 * (1 - t));
        PowerShapes.ring(ctx, cx, cy, reach, 3.5 * (1 - t) + 1, c, 0.9 * (1 - t));
        PowerShapes.ring(ctx, cx, cy, reach * 0.62, 2, '#ffffff', 0.6 * (1 - t));
      }
    } else if (o.shape === 'cone') {                                                                      // a wedge sweeping out ahead
      const half = Effect.CONE_HALF_ANGLE, pts = [];
      for (let i = 0; i <= 12; i++) { const a = o.facing - half + (half * 2) * i / 12; pts.push([isoX(at.x + Math.cos(a) * reach, at.y + Math.sin(a) * reach), isoY(at.x + Math.cos(a) * reach, at.y + Math.sin(a) * reach)]); }
      ctx.globalAlpha = 0.26 * powerAlpha(t, 0.25); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, cy); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8 * powerAlpha(t, 0.25); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (o.kind !== 'speed') {                                                                      // self: an aura at the rider's feet, and a column of light that rises
      PowerShapes.ring(ctx, cx, cy, 0.5 + 1.1 * powerEase(Math.min(1, o.age / 0.5)), 3, c, 0.85 * powerAlpha(t, 0.2));
      PowerShapes.disc(ctx, cx, cy, 0.9, c, 0.2 * powerAlpha(t, 0.2));
      if (o.kind === 'heal' || o.kind === 'gift') { ctx.globalAlpha = 0.22 * powerAlpha(t, 0.3); ctx.fillStyle = c; ctx.fillRect(cx - 14, cy - 70 * Math.min(1, o.age / 0.3), 28, 70 * Math.min(1, o.age / 0.3)); ctx.globalAlpha = 1; }
    }
  }

  /** Where one piece of a power is at `u` (0..1 through its flight): { x, y (iso), s, rot, alpha, color? }. */
  _particle(o, at, p, u, reach) {
    const half = Effect.CONE_HALF_ANGLE, look = o.look, cone = o.shape === 'cone';
    const ang = cone ? o.facing + (p.a - 0.5) * 2 * half : o.shape === 'self' ? p.a * Math.PI * 2 + u * 3 : p.a * Math.PI * 2;
    let d = (cone ? 0.25 + p.r * 0.75 : o.shape === 'self' ? 0.35 + p.r * 0.7 : 0.15 + p.r * 0.85) * (look === 'starfall' ? o.radius : (o.lasting ? o.radius : reach)), lift = POWER_LIFT * 0.5, s = 4 * p.s, rot = p.ph + u * 5, color = null;
    const out = (dd, h) => ({ x: isoX(at.x + Math.cos(ang) * dd, at.y + Math.sin(ang) * dd), y: isoY(at.x + Math.cos(ang) * dd, at.y + Math.sin(ang) * dd) - h, s, rot, alpha: 1 });
    let q;
    switch (look) {
      case 'leaf': { const wob = Math.sin(u * 9 + p.ph) * 0.22, a2 = ang + wob; d = (0.2 + p.r * 0.8) * o.radius * powerEase(u); q = out(0, 0); q.x = isoX(at.x + Math.cos(a2) * d, at.y + Math.sin(a2) * d); q.y = isoY(at.x + Math.cos(a2) * d, at.y + Math.sin(a2) * d) - (14 + Math.sin(u * Math.PI) * 10); q.s = 6 * p.s; q.alpha = powerAlpha(u, 0.6); break; }
      case 'petal': q = out(d * (0.4 + u * 0.6), 6 + u * 24 + Math.sin(u * 8 + p.ph) * 4); q.s = 5 * p.s; q.alpha = Math.sin(u * Math.PI) * 0.95; break;
      case 'star': q = out(d * 0.9, 8 + u * 38); q.s = (3 + 5 * Math.sin(u * Math.PI)) * p.s; q.alpha = Math.sin(u * Math.PI); q.color = p.r > 0.6 ? '#ffffff' : null; break;
      case 'starfall': { const land = 0.55, h = u < land ? (1 - u / land) * 150 : 0; q = out(d, h); q.s = u < land ? 5 * p.s : 5 * p.s * (1 - (u - land) / (1 - land)); q.alpha = u < land ? 1 : 1 - (u - land) / (1 - land); if (u >= land) q.ring = 0.25 + (u - land) * 1.2; break; }
      case 'heart': q = out(d * 0.8, 6 + u * 54); q.s = 5 * p.s; q.alpha = powerAlpha(u, 0.55); break;
      case 'plus': q = out(d * 0.8, 4 + u * 50); q.s = 4 * p.s; q.alpha = powerAlpha(u, 0.55); break;
      case 'drop': { const h = (1 - u) * 90; q = out(d * 0.9, h); q.s = 3.2 * p.s; q.alpha = u > 0.9 ? (1 - u) * 10 : 0.95; break; }
      case 'wave': q = out(d * (0.5 + u * 0.5), 4 + Math.sin(u * Math.PI) * 18); q.s = 3 * p.s; q.alpha = Math.sin(u * Math.PI); break;
      case 'note': q = out(d * (0.3 + u * 0.7), 14 + u * 40 + Math.sin(u * 9 + p.ph) * 6); q.s = 6 * p.s; q.alpha = Math.sin(u * Math.PI); break;
      case 'mist': q = out(d * (0.2 + u * 0.8), 8 + u * 12); q.s = (10 + 26 * u) * p.s; q.alpha = 0.32 * Math.sin(u * Math.PI); break;
      case 'flame': { const dd = (0.2 + p.r * 0.8) * o.radius * powerEase(u); const a2 = ang; q = out(0, 0); q.x = isoX(at.x + Math.cos(a2) * dd, at.y + Math.sin(a2) * dd); q.y = isoY(at.x + Math.cos(a2) * dd, at.y + Math.sin(a2) * dd) - (14 + u * 12 + Math.sin(u * 20 + p.ph) * 3); q.s = (7 - 4 * u) * p.s; q.alpha = powerAlpha(u, 0.5); q.color = u < 0.3 ? '#fff2b0' : u < 0.65 ? '#ffb34a' : '#e2431a'; break; }
      case 'frost': q = out(d * (0.4 + u * 0.6), 60 - u * 54 + Math.sin(u * 7 + p.ph) * 4); q.s = 4.5 * p.s; q.alpha = powerAlpha(u, 0.7); q.color = p.r > 0.5 ? '#ffffff' : null; break;
      case 'shock': { const dd = d * powerEase(u); q = out(dd, 10); q.s = 2.5 * p.s; q.alpha = 1 - u; break; }
      case 'apple': { const dd = d * 0.3; q = out(dd, Math.sin(u * Math.PI) * 46 + 4); q.s = 4.5; q.alpha = powerAlpha(u, 0.8); q.color = '#d9382b'; break; }
      case 'sparkle': q = out(d * 0.7, 6 + u * 40); q.s = 3.5 * p.s; q.alpha = Math.sin(u * Math.PI); break;
      default: { const dd = d * powerEase(u); q = out(dd, 14); q.s = 3.2 * p.s * (1 - u * 0.5); q.alpha = 1 - u; q.color = p.r > 0.7 ? '#ffffff' : null; }      // 'burst': sparks fly out
    }
    return q;
  }

  _shape(ctx, look, q) {
    switch (look) {
      case 'leaf': return PowerShapes.leaf(ctx, q.x, q.y, q.s, q.rot);
      case 'petal': return PowerShapes.petal(ctx, q.x, q.y, q.s, q.rot);
      case 'star': case 'starfall': case 'sparkle': return PowerShapes.star(ctx, q.x, q.y, q.s, q.rot * 0.4);
      case 'heart': return PowerShapes.heart(ctx, q.x, q.y, q.s);
      case 'plus': return PowerShapes.plus(ctx, q.x, q.y, q.s);
      case 'drop': case 'wave': return PowerShapes.drop(ctx, q.x, q.y, q.s);
      case 'note': return PowerShapes.note(ctx, q.x, q.y, q.s, q.rot);
      case 'frost': return PowerShapes.flake(ctx, q.x, q.y, q.s, q.rot);
      case 'flame': return PowerShapes.flame(ctx, q.x, q.y, q.s);
      case 'apple': return PowerShapes.apple(ctx, q.x, q.y, q.s);
      case 'mist': ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2); return ctx.fill();
      case 'shock': ctx.beginPath(); ctx.arc(q.x, q.y, q.s + 1, 0, Math.PI * 2); return ctx.fill();
      default: ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2); return ctx.fill();
    }
  }

  /** Waves: rings with a ripple in them, running out from the middle. */
  _waves(ctx, o, cx, cy, t, reach) {
    for (let i = 0; i < 3; i++) {
      const u = (o.age * 1.3 + i / 3) % 1, k = TILE_HALF_W * Math.SQRT2 * reach * (0.25 + 0.75 * u);
      ctx.globalAlpha = 0.75 * (1 - u) * powerAlpha(t, 0.7); ctx.strokeStyle = i % 2 ? '#ffffff' : o.color; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let a = 0; a <= 48; a++) { const ang = a / 48 * Math.PI * 2, r = 1 + Math.sin(ang * 7 + o.age * 9) * 0.05; const x = cx + Math.cos(ang) * k * r, y = cy + Math.sin(ang) * k * r / 2; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Lightning: jagged bolts from above (circle) or out from the rider (cone), flashing, and a white flash over the field. */
  _bolts(ctx, o, at, cx, cy, t) {
    const flash = t < 0.5 ? 1 : powerAlpha(t, 0.5);
    if (o.shape === 'cone') {
      for (const p of o.parts) {
        if (Math.sin(o.age * 40 + p.ph * 9) < -0.4) continue;                                                // flicker
        const a = o.facing + (p.a - 0.5) * 2 * Effect.CONE_HALF_ANGLE, d = o.radius * (0.55 + p.r * 0.45), ex = isoX(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), ey = isoY(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
        ctx.globalAlpha = flash; PowerShapes.bolt(ctx, cx, cy - POWER_LIFT, ex, ey, o.color, 2); PowerShapes.star(ctx, ex, ey, 6 * flash, o.age * 5);
      }
    } else {
      for (const p of o.parts) {
        const a = p.a * Math.PI * 2, d = o.radius * (0.2 + p.r * 0.8), ex = isoX(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d), ey = isoY(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
        if (Math.sin(o.age * 36 + p.ph * 7) < -0.2) continue;
        ctx.globalAlpha = flash; PowerShapes.bolt(ctx, ex + (p.s - 1) * 30, ey - 120, ex, ey, o.color, 2);
      }
    }
    ctx.globalAlpha = 0.18 * flash; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, cy, TILE_HALF_W * Math.SQRT2 * o.radius, TILE_HALF_W * Math.SQRT2 * o.radius / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  /** Sun: a glow and rays turning slowly round the rider; Daylight stays on for its time. */
  _rays(ctx, o, cx, cy, t) {
    const fade = o.age > o.life - 0.6 ? (o.life - o.age) / 0.6 : Math.min(1, o.age / 0.3), k = TILE_HALF_W * Math.SQRT2 * o.radius * Math.min(1, 0.4 + o.age);
    for (const [m, a] of [[1, 0.1], [0.7, 0.12], [0.4, 0.16]]) PowerShapes.disc(ctx, cx, cy - POWER_LIFT, o.radius * m * Math.min(1, 0.4 + o.age) * 0.9, o.color, a * fade);
    ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = o.color; ctx.lineWidth = 2.4;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + o.age * 0.9, r0 = k * 0.3, r1 = k * (i % 2 ? 0.62 : 0.85);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy - POWER_LIFT + Math.sin(a) * r0 / 2); ctx.lineTo(cx + Math.cos(a) * r1, cy - POWER_LIFT + Math.sin(a) * r1 / 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; PowerShapes.star(ctx, cx, cy - POWER_LIFT - 6, 7 * fade, o.age);
  }

  /** Speed: wind streaks laid behind the rider (against its heading), a burst of dust where it set off, and afterimages that fade. */
  _streaks(ctx, o, at, cx, cy, t) {
    const back = o.facing + Math.PI;
    ctx.lineWidth = 2.4;
    for (const p of o.parts) {
      const u = (o.age * 2.2 + p.d * 2) % 1, side = (p.r - 0.5) * 1.1, d = 0.3 + u * 2.6 * p.s;
      const px = at.x + Math.cos(back) * d - Math.sin(back) * side, py = at.y + Math.sin(back) * d + Math.cos(back) * side;
      const x0 = isoX(px, py), y0 = isoY(px, py) - 8 - p.a * 22, x1 = isoX(px + Math.cos(back) * 0.9, py + Math.sin(back) * 0.9), y1 = isoY(px + Math.cos(back) * 0.9, py + Math.sin(back) * 0.9) - 8 - p.a * 22;
      ctx.globalAlpha = 0.85 * (1 - u) * powerAlpha(t, 0.75); ctx.strokeStyle = p.r > 0.5 ? '#ffffff' : o.color; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    PowerShapes.ring(ctx, cx, cy, 0.4 + 1.6 * powerEase(Math.min(1, o.age / 0.4)), 3, o.color, 0.8 * (1 - Math.min(1, o.age / 0.4)));
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------- what it did to somebody ---------------------------------------- */
  _markDraw(ctx, m) {
    const at = this._where(m), x = isoX(at.x, at.y), y = isoY(at.x, at.y) - POWER_LIFT, t = m.age / m.life, c = m.color;
    ctx.fillStyle = c; ctx.strokeStyle = c;
    if (m.kind === 'damage') {                                                                              // a slash across it and a spark
      const g = Math.min(1, m.age / 0.16), a = powerAlpha(t, 0.4);
      ctx.globalAlpha = a; ctx.lineWidth = 4 * (1 - t) + 1.5; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x - 13, y - 13); ctx.lineTo(x - 13 + 26 * g, y - 13 + 26 * g); ctx.moveTo(x + 13, y - 13); ctx.lineTo(x + 13 - 26 * g, y - 13 + 26 * g); ctx.stroke();
      ctx.fillStyle = c; PowerShapes.star(ctx, x, y, 10 * (1 - t) + 3, m.age * 6);
    } else if (m.kind === 'slow') {                                                                         // a ring on the ground and flakes (or whatever it is) orbiting while it lasts
      const fade = m.age > m.life - 0.4 ? (m.life - m.age) / 0.4 : 1;
      PowerShapes.ring(ctx, x, y + POWER_LIFT, 0.6 + 0.08 * Math.sin(m.age * 6), 2.2, c, 0.85 * fade);
      for (let i = 0; i < 3; i++) {
        const a = m.age * 2.4 + i * Math.PI * 2 / 3, ox = x + Math.cos(a) * 15, oy = y - 14 + Math.sin(a) * 6 - 4;
        ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.strokeStyle = c;
        if (m.look === 'frost') PowerShapes.flake(ctx, ox, oy, 4.5, a); else if (m.look === 'petal') PowerShapes.petal(ctx, ox, oy, 4, a); else if (m.look === 'note') PowerShapes.note(ctx, ox, oy, 5, a); else if (m.look === 'wave') PowerShapes.drop(ctx, ox, oy, 3); else { ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (m.kind === 'scare') {                                                                        // a startled "!" bobbing over its head
      const bob = Math.sin(m.age * 14) * 2, a = powerAlpha(t, 0.6), by = y - 26 - Math.min(1, m.age / 0.15) * 6 + bob;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = 'rgba(30,20,10,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d3321f'; ctx.fillRect(x - 1.5, by - 6, 3, 7); ctx.fillRect(x - 1.5, by + 3, 3, 3);
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(x + s * 15, y - 4); ctx.lineTo(x + s * 22, y - 8); ctx.moveTo(x + s * 15, y + 3); ctx.lineTo(x + s * 22, y + 5); } ctx.stroke();
    } else if (m.kind === 'heal') {                                                                         // plus signs and a glow rising off them
      const a = powerAlpha(t, 0.5);
      PowerShapes.ring(ctx, x, y + POWER_LIFT, 0.5 + 0.7 * powerEase(Math.min(1, m.age / 0.5)), 2.5, c, 0.8 * a);
      for (let i = 0; i < 4; i++) { const u = (m.age * 1.4 + i / 4) % 1; ctx.globalAlpha = a * Math.sin(u * Math.PI); ctx.fillStyle = i % 2 ? '#ffffff' : c; if (m.look === 'heart') PowerShapes.heart(ctx, x + (i - 1.5) * 8, y + 4 - u * 38, 4); else PowerShapes.plus(ctx, x + (i - 1.5) * 8, y + 4 - u * 38, 4); }
    }
    ctx.globalAlpha = 1;
  }
}
