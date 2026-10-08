'use strict';
/* CLIENT (Pixi backend) - a stand-in for CanvasRenderingContext2D that RECORDS what is drawn instead of drawing it.
 *
 * The game's items (buildings, props, furniture, people, animals...) are drawn by canvas code. The Pixi backend runs that same code against a
 * CanvasRecorder, which gives back
 *   - a HASH of the picture, independent of where on the map the item stands (all points are hashed relative to the item's anchor, through the
 *     current transform), so identical-looking items share one picture, and an item that looks the same as last frame finds its picture again;
 *   - the bounding box of what was painted, relative to the anchor;
 *   - the calls themselves, which CanvasRecorder.replay() can repeat on a real canvas, once, when the hash is new.
 * Replaying them gives the same pixels the canvas backend would have painted (the only approximation: numbers are hashed to 1/32 of a pixel
 * (1/4 for things that move: begin(.., true)) and angles to 1/1024 rad (1/64), so a picture a hair different from one already made reuses it).
 *
 * It implements the part of the 2D API the game's draw code uses; anything else throws, so a gap shows up at once rather than as a wrong picture. */
const CanvasRecorder = (() => {
  const OP = { SAVE: 0, RESTORE: 1, TRANSLATE: 2, SCALE: 3, ROTATE: 4, TRANSFORM: 5, BEGIN: 6, CLOSE: 7, MOVE: 8, LINE: 9, QUAD: 10, BEZ: 11, ARC: 12, ELLIPSE: 13, ARCTO: 14, RECT: 15, ROUNDRECT: 16, FILL: 17, STROKE: 18, CLIP: 19, FILLRECT: 20, STROKERECT: 21, CLEARRECT: 22, FILLTEXT: 23, STROKETEXT: 24, DRAWIMAGE: 25, ATTR: 26, DASH: 27 };
  const DEFAULTS = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', shadowOffsetX: 0, shadowOffsetY: 0, lineDashOffset: 0, filter: 'none' };
  const ATTR_ID = {}; Object.keys(DEFAULTS).forEach((k, i) => { ATTR_ID[k] = i; });
  const ATTR_NAME = Object.keys(DEFAULTS);

  const strIds = new Map(); let nextStr = 1;                                                // strings (colours, fonts, text) -> small numbers, for hashing
  const strId = s => { let id = strIds.get(s); if (id === undefined) { if (strIds.size > 20000) strIds.clear(); id = nextStr++; strIds.set(s, id); } return id; };
  const imgIds = new WeakMap(); let nextImg = 1;
  const imgId = im => { let id = imgIds.get(im); if (id === undefined) { id = nextImg++; imgIds.set(im, id); } return id; };

  class RecGradient {
    constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
    addColorStop(o, c) { this.stops.push(o, c); }
    make(ctx) {
      const g = this.kind === 'linear' ? ctx.createLinearGradient(...this.args) : ctx.createRadialGradient(...this.args);
      for (let i = 0; i < this.stops.length; i += 2) g.addColorStop(this.stops[i], this.stops[i + 1]);
      return g;
    }
    hash(q) { let h = this.kind === 'linear' ? 7 : 11; for (const a of this.args) h = Math.imul(h ^ q(a), 16777619); for (let i = 0; i < this.stops.length; i += 2) h = Math.imul(h ^ Math.round(this.stops[i] * 100), 16777619) ^ strId(this.stops[i + 1]); return h; }
  }

  class Recorder {
    constructor() {
      this.ops = []; this.stack = []; this.attrs = Object.assign({}, DEFAULTS); this.U = [1, 0, 0, 1, 0, 0];
      this.canvas = { width: 8192, height: 8192 };                                           // (a few draw functions read ctx.canvas.width / height)
      this._ruler = document.createElement('canvas').getContext('2d'); this._rulerFont = '';
      this.result = { h1: 0, h2: 0, x0: 0, y0: 0, x1: 0, y1: 0, empty: true, ops: this.ops };
    }

    /** Start a recording for an item standing at world (ax, ay). `moving`: its picture changes all the time (people, animals), so hash it coarsely. */
    begin(ax, ay, moving = false) {
      this.kl = moving ? 4 : 32; this.ka = moving ? 64 : 1024;
      this.ops.length = 0; this.stack.length = 0; Object.assign(this.attrs, DEFAULTS);
      this.U[0] = 1; this.U[1] = 0; this.U[2] = 0; this.U[3] = 1; this.U[4] = 0; this.U[5] = 0;
      this.ax = ax; this.ay = ay; this.alx = ax; this.aly = ay;                               // the anchor, in current local coordinates
      this.h1 = 0x811c9dc5 | 0; this.h2 = 0x2545F491 | 0;
      this.minX = this.minY = Infinity; this.maxX = this.maxY = -Infinity; this.pad = 1.5;
      this.pMinX = this.pMinY = Infinity; this.pMaxX = this.pMaxY = -Infinity;
      return this;
    }

    /** Finish: the hash, and the extents of what was painted relative to the anchor (world pixels; `pad` is the margin to add all round). */
    end() {
      const r = this.result;
      r.h1 = this.h1 >>> 0; r.h2 = this.h2 >>> 0; r.ops = this.ops;
      r.empty = !(this.minX <= this.maxX);
      r.minX = this.minX; r.minY = this.minY; r.maxX = this.maxX; r.maxY = this.maxY; r.pad = this.pad;
      return r;
    }

    /* ---- hashing ---- */
    _q(v) { return Math.round(v * this.kl) | 0; }
    _qa(v) { return Math.round(v * this.ka) | 0; }
    _h(v) { this.h1 = Math.imul(this.h1 ^ v, 16777619); this.h2 = (Math.imul(this.h2 + v, 0x5bd1e995) ^ (this.h2 >>> 13)) | 0; }
    _hp(x, y) { this._h(this._q(x - this.alx)); this._h(this._q(y - this.aly)); }                              // a point, relative to the anchor
    _anchor() {                                                                                    // the anchor in the new local space (inverse of U applied to it)
      const [a, b, c, d, e, f] = this.U, det = a * d - b * c;
      if (Math.abs(det) < 1e-9) { this.alx = this.aly = 0; return; }
      const X = this.ax - e, Y = this.ay - f;
      this.alx = (d * X - c * Y) / det; this.aly = (-b * X + a * Y) / det;
    }

    /* ---- extents ---- */
    _w(x, y) { const U = this.U; return [U[0] * x + U[2] * y + U[4] - this.ax, U[1] * x + U[3] * y + U[5] - this.ay]; }
    _bbox(x, y) { const [wx, wy] = this._w(x, y); if (wx < this.minX) this.minX = wx; if (wx > this.maxX) this.maxX = wx; if (wy < this.minY) this.minY = wy; if (wy > this.maxY) this.maxY = wy; }
    _pbox(x, y) { const [wx, wy] = this._w(x, y); if (wx < this.pMinX) this.pMinX = wx; if (wx > this.pMaxX) this.pMaxX = wx; if (wy < this.pMinY) this.pMinY = wy; if (wy > this.pMaxY) this.pMaxY = wy; }
    _rectBox(x, y, w, h, path) { const f = path ? this._pbox : this._bbox; f.call(this, x, y); f.call(this, x + w, y); f.call(this, x, y + h); f.call(this, x + w, y + h); }
    _scaleOf() { const U = this.U; return Math.max(Math.abs(U[0]), Math.abs(U[1]), Math.abs(U[2]), Math.abs(U[3])); }
    _flushPath(extra) {
      if (!(this.pMinX <= this.pMaxX)) return;
      const k = extra + (this.attrs.shadowBlur > 0 ? this.attrs.shadowBlur * 2 : 0);
      if (k > this.pad) this.pad = k;
      for (const [x, y] of [[this.pMinX, this.pMinY], [this.pMaxX, this.pMaxY]]) { if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x; if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y; }
    }

    /* ---- state ---- */
    save() { this.stack.push([this.U.slice(), Object.assign({}, this.attrs)]); this.ops.push(OP.SAVE); this._h(1); }
    restore() {
      const s = this.stack.pop(); if (!s) return;                                                  // (a restore with nothing saved does nothing, as on a canvas: it is not recorded either)
      this.ops.push(OP.RESTORE); this._h(2);
      this.U = s[0]; this.attrs = s[1]; this._anchor();
    }
    translate(x, y) { const U = this.U; U[4] += U[0] * x + U[2] * y; U[5] += U[1] * x + U[3] * y; this._anchor(); this.ops.push(OP.TRANSLATE, x, y); this._h(3); }   // (only the effect on later points is hashed: the item's position is not)
    scale(x, y) { const U = this.U; U[0] *= x; U[1] *= x; U[2] *= y; U[3] *= y; this._anchor(); this.ops.push(OP.SCALE, x, y); this._h(4); this._h(this._qa(x)); this._h(this._qa(y)); }
    rotate(t) { const U = this.U, c = Math.cos(t), s = Math.sin(t), a = U[0], b = U[1]; U[0] = a * c + U[2] * s; U[1] = b * c + U[3] * s; U[2] = -a * s + U[2] * c; U[3] = -b * s + U[3] * c; this._anchor(); this.ops.push(OP.ROTATE, t); this._h(5); this._h(this._qa(t)); }
    transform(a, b, c, d, e, f) {
      const U = this.U, [A, B, C, D, E, F] = U;
      U[0] = A * a + C * b; U[1] = B * a + D * b; U[2] = A * c + C * d; U[3] = B * c + D * d; U[4] = A * e + C * f + E; U[5] = B * e + D * f + F;
      this._anchor(); this.ops.push(OP.TRANSFORM, a, b, c, d, e, f); this._h(6); for (const v of [a, b, c, d]) this._h(this._qa(v));
    }
    setTransform() { throw new Error('CanvasRecorder: setTransform is not supported in item drawing'); }
    resetTransform() { this.setTransform(); }
    getTransform() { throw new Error('CanvasRecorder: getTransform is not supported'); }

    /* ---- paths ---- */
    beginPath() { this.ops.push(OP.BEGIN); this._h(7); this.pMinX = this.pMinY = Infinity; this.pMaxX = this.pMaxY = -Infinity; }
    closePath() { this.ops.push(OP.CLOSE); this._h(8); }
    moveTo(x, y) { this.ops.push(OP.MOVE, x, y); this._h(9); this._hp(x, y); this._pbox(x, y); }
    lineTo(x, y) { this.ops.push(OP.LINE, x, y); this._h(10); this._hp(x, y); this._pbox(x, y); }
    quadraticCurveTo(cx, cy, x, y) { this.ops.push(OP.QUAD, cx, cy, x, y); this._h(11); this._hp(cx, cy); this._hp(x, y); this._pbox(cx, cy); this._pbox(x, y); }
    bezierCurveTo(a, b, c, d, x, y) { this.ops.push(OP.BEZ, a, b, c, d, x, y); this._h(12); this._hp(a, b); this._hp(c, d); this._hp(x, y); this._pbox(a, b); this._pbox(c, d); this._pbox(x, y); }
    arc(x, y, r, a0, a1, ccw = false) { this.ops.push(OP.ARC, x, y, r, a0, a1, ccw); this._h(13); this._hp(x, y); this._h(this._q(r)); this._h(this._qa(a0)); this._h(this._qa(a1)); this._h(ccw ? 1 : 0); this._rectBox(x - r, y - r, 2 * r, 2 * r, true); }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) { this.ops.push(OP.ELLIPSE, x, y, rx, ry, rot, a0, a1, ccw); this._h(14); this._hp(x, y); this._h(this._q(rx)); this._h(this._q(ry)); this._h(this._qa(rot)); this._h(this._qa(a0)); this._h(this._qa(a1)); this._h(ccw ? 1 : 0); const m = Math.max(rx, ry); this._rectBox(x - m, y - m, 2 * m, 2 * m, true); }
    arcTo(x1, y1, x2, y2, r) { this.ops.push(OP.ARCTO, x1, y1, x2, y2, r); this._h(15); this._hp(x1, y1); this._hp(x2, y2); this._h(this._q(r)); this._pbox(x1, y1); this._pbox(x2, y2); }
    rect(x, y, w, h) { this.ops.push(OP.RECT, x, y, w, h); this._h(16); this._hp(x, y); this._h(this._q(w)); this._h(this._q(h)); this._rectBox(x, y, w, h, true); }
    roundRect(x, y, w, h, r) { this.ops.push(OP.ROUNDRECT, x, y, w, h, r); this._h(17); this._hp(x, y); this._h(this._q(w)); this._h(this._q(h)); this._h(this._q(typeof r === 'number' ? r : 0)); this._rectBox(x, y, w, h, true); }
    fill() { this.ops.push(OP.FILL); this._h(18); this._flushPath(1.5); }
    stroke() { this.ops.push(OP.STROKE); this._h(19); this._flushPath(this.attrs.lineWidth * this._scaleOf() * 0.75 + 1.5); }
    clip() { this.ops.push(OP.CLIP); this._h(20); }

    /* ---- painting ---- */
    fillRect(x, y, w, h) { this.ops.push(OP.FILLRECT, x, y, w, h); this._h(21); this._hp(x, y); this._h(this._q(w)); this._h(this._q(h)); this._rectBox(x, y, w, h, false); }
    strokeRect(x, y, w, h) { this.ops.push(OP.STROKERECT, x, y, w, h); this._h(22); this._hp(x, y); this._h(this._q(w)); this._h(this._q(h)); this._rectBox(x, y, w, h, false); const k = this.attrs.lineWidth * this._scaleOf() * 0.75; if (k > this.pad - 1.5) this.pad = k + 1.5; }
    clearRect(x, y, w, h) { this.ops.push(OP.CLEARRECT, x, y, w, h); this._h(23); this._hp(x, y); this._h(this._q(w)); this._h(this._q(h)); }
    _text(op, hashCode, text, x, y, maxW) {
      this.ops.push(op, text, x, y, maxW); this._h(hashCode); this._h(strId(String(text))); this._hp(x, y); if (maxW !== undefined) this._h(this._q(maxW));
      const font = this.attrs.font; if (font !== this._rulerFont) { this._ruler.font = font; this._rulerFont = font; }
      const w = this._ruler.measureText(String(text)).width, m = /([\d.]+)px/.exec(font), size = m ? +m[1] : 12, al = this.attrs.textAlign;
      const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
      this._rectBox(x0, y - size * 1.25, w, size * 1.9, false);
      if (op === OP.STROKETEXT) { const k = this.attrs.lineWidth * this._scaleOf() + 1.5; if (k > this.pad) this.pad = k; }
    }
    fillText(t, x, y, maxW) { this._text(OP.FILLTEXT, 24, t, x, y, maxW); }
    strokeText(t, x, y, maxW) { this._text(OP.STROKETEXT, 25, t, x, y, maxW); }
    measureText(t) { if (this.attrs.font !== this._rulerFont) { this._ruler.font = this.attrs.font; this._rulerFont = this.attrs.font; } return this._ruler.measureText(t); }
    drawImage(im, a, b, c, d, e, f, g, h) {
      const n = arguments.length;
      if (!im) return;
      const ready = im instanceof HTMLImageElement ? (im.complete && im.naturalWidth > 0) : (im.width > 0 && im.height > 0);
      this._h(26); this._h(imgId(im) * 2 + (ready ? 1 : 0));
      if (!ready) return;                                                                          // (a picture still loading draws nothing; its hash changes once it has)
      let dx, dy, dw, dh;
      if (n === 3) { dx = a; dy = b; dw = im.naturalWidth || im.width; dh = im.naturalHeight || im.height; }
      else if (n === 5) { dx = a; dy = b; dw = c; dh = d; }
      else { dx = e; dy = f; dw = g; dh = h; for (const v of [a, b, c, d]) this._h(this._q(v)); }
      this.ops.push(OP.DRAWIMAGE, im, n, ...(n === 3 ? [a, b] : n === 5 ? [a, b, c, d] : [a, b, c, d, e, f, g, h]));
      this._hp(dx, dy); this._h(this._q(dw)); this._h(this._q(dh)); this._rectBox(dx, dy, dw, dh, false);
    }
    setLineDash(list) { this.ops.push(OP.DASH, list.slice()); this._h(27); for (const v of list) this._h(this._q(v)); }
    createLinearGradient(...a) { return new RecGradient('linear', a); }
    createRadialGradient(...a) { return new RecGradient('radial', a); }
    createPattern() { throw new Error('CanvasRecorder: createPattern is not supported'); }
    getImageData() { throw new Error('CanvasRecorder: getImageData is not supported'); }
  }

  /* attributes: a setter records the assignment; the getter returns what was set (code reads imageSmoothingEnabled and font back) */
  for (const name of ATTR_NAME) {
    Object.defineProperty(Recorder.prototype, name, {
      get() { return this.attrs[name]; },
      set(v) {
        this.attrs[name] = v; this.ops.push(OP.ATTR, name, v); this._h(28); this._h(ATTR_ID[name]);
        if (typeof v === 'number') this._h(this._q(v)); else if (v instanceof RecGradient) this._h(v.hash(x => this._q(x))); else if (typeof v === 'boolean') this._h(v ? 1 : 0); else this._h(strId(String(v)));
        if (name === 'shadowBlur' && v * 2 > this.pad) this.pad = v * 2;
      },
    });
  }

  /** Repeat recorded calls on a real context (already transformed so that the recording's world coordinates land where they should). */
  function replay(ctx, ops) {
    let i = 0, depth = 0; const n = ops.length;
    while (i < n) {
      switch (ops[i++]) {
        case OP.SAVE: ctx.save(); depth++; break;
        case OP.RESTORE: ctx.restore(); depth--; break;
        case OP.TRANSLATE: ctx.translate(ops[i], ops[i + 1]); i += 2; break;
        case OP.SCALE: ctx.scale(ops[i], ops[i + 1]); i += 2; break;
        case OP.ROTATE: ctx.rotate(ops[i++]); break;
        case OP.TRANSFORM: ctx.transform(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5]); i += 6; break;
        case OP.BEGIN: ctx.beginPath(); break;
        case OP.CLOSE: ctx.closePath(); break;
        case OP.MOVE: ctx.moveTo(ops[i], ops[i + 1]); i += 2; break;
        case OP.LINE: ctx.lineTo(ops[i], ops[i + 1]); i += 2; break;
        case OP.QUAD: ctx.quadraticCurveTo(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.BEZ: ctx.bezierCurveTo(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5]); i += 6; break;
        case OP.ARC: ctx.arc(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5]); i += 6; break;
        case OP.ELLIPSE: ctx.ellipse(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], ops[i + 7]); i += 8; break;
        case OP.ARCTO: ctx.arcTo(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]); i += 5; break;
        case OP.RECT: ctx.rect(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.ROUNDRECT: ctx.roundRect(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]); i += 5; break;
        case OP.FILL: ctx.fill(); break;
        case OP.STROKE: ctx.stroke(); break;
        case OP.CLIP: ctx.clip(); break;
        case OP.FILLRECT: ctx.fillRect(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.STROKERECT: ctx.strokeRect(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.CLEARRECT: ctx.clearRect(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.FILLTEXT: ctx.fillText(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.STROKETEXT: ctx.strokeText(ops[i], ops[i + 1], ops[i + 2], ops[i + 3]); i += 4; break;
        case OP.DRAWIMAGE: {
          const im = ops[i], n3 = ops[i + 1]; i += 2;
          if (n3 === 3) ctx.drawImage(im, ops[i], ops[i + 1]);
          else if (n3 === 5) ctx.drawImage(im, ops[i], ops[i + 1], ops[i + 2], ops[i + 3]);
          else ctx.drawImage(im, ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], ops[i + 7]);
          i += n3 === 3 ? 2 : n3 === 5 ? 4 : 8; break;
        }
        case OP.ATTR: { const name = ops[i], v = ops[i + 1]; ctx[name] = v instanceof RecGradient ? v.make(ctx) : v; i += 2; break; }
        case OP.DASH: ctx.setLineDash(ops[i++]); break;
        default: throw new Error('CanvasRecorder.replay: bad op ' + ops[i - 1]);
      }
    }
    while (depth-- > 0) ctx.restore();                                                              // (a save the drawing never restored)
  }

  return { Recorder, replay, OP };
})();
