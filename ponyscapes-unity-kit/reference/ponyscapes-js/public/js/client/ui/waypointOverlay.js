'use strict';
/* CLIENT - on-screen waypoints. A canvas laid over the game (screen space, under the buttons) draws, for every waypoint that is switched on (shared/waypoints.js: quests,
 * things of interest, home), a dashed line from your pony or feet to the place, with a pin and a label ("Eggs for the Oven - 23") where it is. A place off screen gets
 * the line up to the edge of the view and an arrow there instead. The three groups are switched on and off from the Map (WaypointPrefs, kept in this browser). */
const WAYPOINT_STORAGE_KEY = 'ponyscapes.waypoints.v1';

class WaypointPrefs {
  constructor() { this.on = { quest: true, interest: false, home: false }; this._load(); }
  _load() {
    try { const raw = JSON.parse(localStorage.getItem(WAYPOINT_STORAGE_KEY) || 'null'); if (raw) for (const g of Waypoints.GROUPS) if (typeof raw[g] === 'boolean') this.on[g] = raw[g]; } catch (e) { /* defaults */ }
  }
  set(group, value) {
    this.on[group] = !!value;
    try { localStorage.setItem(WAYPOINT_STORAGE_KEY, JSON.stringify(this.on)); } catch (e) { /* kept for this visit only */ }
  }
}

class WaypointOverlay {
  constructor({ game, camera, prefs }) {
    this.game = game; this.camera = camera; this.prefs = prefs;
    const canvas = this.canvas = document.createElement('canvas');
    canvas.id = 'waypointLayer'; canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    this.ctx = canvas.getContext('2d'); this.w = this.h = 0; this.dpr = 1;
  }

  _fit() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr; this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  }

  /** Where a world spot is on the screen, in CSS pixels (the camera follows the player in iso space). */
  toScreen(wx, wy, lift = 0) {
    const cam = this.camera, z = cam.zoom;
    return [(isoX(wx, wy) - cam.x + cam.w / 2) * z, (isoY(wx, wy) - lift - cam.y + cam.h / 2) * z];
  }

  /** The point where the ray from (x0, y0) through (x1, y1) leaves the rectangle (a point inside it). */
  static exit(x0, y0, x1, y1, left, top, right, bottom) {
    const dx = x1 - x0, dy = y1 - y0;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (right - x0) / dx); else if (dx < 0) t = Math.min(t, (left - x0) / dx);
    if (dy > 0) t = Math.min(t, (bottom - y0) / dy); else if (dy < 0) t = Math.min(t, (top - y0) / dy);
    return [x0 + dx * t, y0 + dy * t];
  }

  /** One frame. `now` in ms. */
  draw(now) {
    this._fit();
    const ctx = this.ctx, g = this.game, me = g.local;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!me || !g.worldMap || g.grid || g.map.kind !== 'world' || !this.camera.w) return;
    const list = Waypoints.collect(g).filter(wp => this.prefs.on[wp.group]);
    if (!list.length) return;
    const [px, py] = this.toScreen(me.x, me.y, 8), pad = 26, top = 70, bottom = this.h - 90;     // (room kept for the bars at the top and the buttons below)
    list.sort((a, b) => Math.hypot(b.x - me.x, b.y - me.y) - Math.hypot(a.x - me.x, a.y - me.y));          // far ones first: the near ones are drawn on top
    const labels = [];
    for (const wp of list) {
      const dist = Math.hypot(wp.x - me.x, wp.y - me.y), arrived = dist <= (wp.near || Waypoints.ARRIVED), [tx, ty] = this.toScreen(wp.x, wp.y, 4);
      const inside = tx > pad && tx < this.w - pad && ty > top && ty < bottom;
      let ex = tx, ey = ty;
      if (!inside) [ex, ey] = WaypointOverlay.exit(px, py, tx, ty, pad, top, this.w - pad, bottom);
      if (!arrived) this._line(ctx, px, py, ex, ey, wp.color, now);
      if (inside) this._pin(ctx, tx, ty, wp, now, arrived);
      else this._arrow(ctx, ex, ey, Math.atan2(ty - py, tx - px), wp);
      labels.push({ wp, x: ex, y: ey, inside, dist, arrived });
    }
    for (const l of labels) this._label(ctx, l);
  }

  /** A dashed line that marches toward the place: dark underneath so it reads on grass, sand and water. */
  _line(ctx, x0, y0, x1, y1, color, now) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 24) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, dash = 9, gap = 8, step = dash + gap, off = (now / 28) % step;
    ctx.lineCap = 'round';
    for (const [width, style, a] of [[5, 'rgba(10,18,28,.55)', 1], [2.6, color, 0.95]]) {
      ctx.lineWidth = width; ctx.strokeStyle = style; ctx.beginPath();
      for (let s = off - step; s < len; s += step) {
        const a0 = Math.max(s, 16), a1 = Math.min(s + dash, len - 4);                       // (it leaves your feet and stops short of the pin)
        if (a1 <= a0) continue;
        ctx.moveTo(x0 + ux * a0, y0 + uy * a0); ctx.lineTo(x0 + ux * a1, y0 + uy * a1);
      }
      ctx.stroke();
    }
  }

  /** A pin: a bobbing teardrop with the group's glyph, a ring on the ground beneath it. */
  _pin(ctx, x, y, wp, now, arrived) {
    const bob = Math.sin(now / 280 + wp.x) * 3, r = 11, ring = 1 + 0.25 * Math.sin(now / 350);
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = wp.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 6, 15 * ring, 7 * ring, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.translate(0, -16 + bob);
    ctx.fillStyle = wp.color; ctx.strokeStyle = 'rgba(10,18,28,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.8, Math.PI * 0.2 + Math.PI * 2); ctx.lineTo(0, r + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(10,18,28,.9)'; ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(wp.glyph, 0, 1);
    ctx.restore();
  }

  /** An arrow on the edge of the view, pointing out at the place. */
  _arrow(ctx, x, y, angle, wp) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = wp.color; ctx.strokeStyle = 'rgba(10,18,28,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** "Eggs for the Oven  23" in a dark tag beside the pin (above it) or the edge arrow (inward of it). */
  _label(ctx, { wp, x, y, inside, dist, arrived }) {
    const text = arrived ? `${wp.label}: you are here` : `${wp.label}  ${Math.round(dist)}`, sub = !arrived && wp.sub ? wp.sub : '';
    ctx.font = 'bold 11px Georgia, serif'; ctx.textBaseline = 'middle';
    const w1 = ctx.measureText(text).width; ctx.font = '10px Georgia, serif';
    const w2 = sub ? ctx.measureText(sub).width : 0, w = Math.max(w1, w2) + 12, h = sub ? 30 : 17;
    let lx = x - w / 2, ly = inside ? y - 56 - h / 2 : y - h / 2;
    if (!inside) { const cx = this.w / 2, cy = this.h / 2, d = Math.hypot(cx - x, cy - y) || 1; lx += (cx - x) / d * (w / 2 + 20); ly += (cy - y) / d * (h / 2 + 14); }
    lx = Math.max(4, Math.min(this.w - w - 4, lx)); ly = Math.max(4, Math.min(this.h - h - 4, ly));
    ctx.fillStyle = 'rgba(10,18,28,.82)'; ctx.strokeStyle = wp.color; ctx.lineWidth = 1.2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(lx, ly, w, h, 6); else ctx.rect(lx, ly, w, h); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = wp.color; ctx.font = 'bold 11px Georgia, serif'; ctx.fillText(text, lx + w / 2, ly + (sub ? 9 : h / 2 + 0.5));
    if (sub) { ctx.fillStyle = '#e9eef5'; ctx.font = '10px Georgia, serif'; ctx.fillText(sub, lx + w / 2, ly + 21); }
  }
}
