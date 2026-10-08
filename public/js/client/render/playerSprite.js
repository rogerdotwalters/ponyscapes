'use strict';
/* CLIENT - draws a player: shadow, facing arrow, body, held axe with swing animation, name tag.
 * The body faces one of four screen directions (SpriteRegistry.dirOf). With images for the body type (editor.html > Characters) those are
 * drawn; otherwise the procedural body below, which already turns (no face when walking away). Worn items with images of their own are
 * drawn as overlays in the same direction, and replace the procedural look of that piece of gear. */
const WORN_ORDER = ['cape', 'outfit', 'crown'];                 // wardrobe overlays are layered in this order
const SWING_WINDUP_ANGLE = -1.6, SWING_CARRY_ANGLE = -0.9, SWING_FOLLOW_THROUGH = 0.35;
const TOOL_LENGTH = { sickle: 12, axe: 17, hammer: 17, knife: 11, spear: 28, rod: 30, bow: 12, sword: 22, shovel: 24, leash: 8, brush: 9, shears: 10, hoe: 22, water: 6 };
/** Each lasso's look: rope, braid highlight, outline, the ring (honda) the loop runs through, its ribbon tails (none: a plain rope end)
 *  and whether it is old and frayed (the starter). A lasso made in the editor uses its item colour. Shared with the item icons and the throw effect. */
const LASSO_LOOKS = {
  leash:      { rope: '#7a5a32', braid: '#a8844f', dark: '#3e2c16', honda: '#6e665a', tails: null, tip: '#c9a874', worn: true },
  lasso_silk: { rope: '#cfc3e6', braid: '#ffffff', dark: '#5c4f7a', honda: '#c4ccd6', tails: ['#e8b8d8', '#ffffff'], tip: '#c4ccd6' },
  lasso_gold: { rope: '#c9962a', braid: '#ffe9a0', dark: '#5e3f0a', honda: '#f2c94c', tails: ['#d8433a', '#f2c94c'], tip: '#fff1b8' },
  lasso_star: { rope: '#8a3fd0', braid: '#3fd8f2', dark: '#2a0f4a', honda: '#f2c230', tails: ['#9a4ae0', '#36c8ee'], tip: '#f2c230' },
};
const lassoLook = id => LASSO_LOOKS[id] || { rope: (ItemDefs[id] && ItemDefs[id].color) || '#8a6a3c', braid: '#f0e0b0', dark: '#3a2a18', honda: '#b0b6bf', tails: null, tip: '#f0e0b0' };
const BEHIND_LIFT = 20;                          // riding towards the camera the rider sits further back, so higher up the screen, and peeks over the pony's head
const SADDLE_HEIGHT = 15;                        // how far above the pony's footprint a rider sits

class PlayerSprite {
  constructor(g) { this.g = g; this.walkPhase = {}; this.looks = new LruCache(100); }

  /** A character's drawn look (CharacterLook.describe), worked out once per set of numbers rather than once per frame. */
  _look(appearance) {
    const k = appearance ? appearance.join() : '';
    let look = this.looks.get(k);
    if (!look) { look = CharacterLook.describe(appearance); this.looks.set(k, look); }
    return look;
  }

  draw(p, id, sx, sy, isMe, now, rowPhase = 0, wading = false, opts = {}) {
    const mounted = !!p.mount, riding = !!p.boat || mounted;
    if (mounted) { sy -= SADDLE_HEIGHT + (opts.behind ? BEHIND_LIFT : 0); rowPhase = now / 140; }                       // up in the saddle, arms swinging with the gait
    if (wading) this._drawRipples(sx, sy, now);
    const pose = this._computePose(p, id, sx, sy, now, riding, rowPhase);
    if (!riding) this._drawGroundMarkers(p, sx, sy, pose);
    this._drawBody(p, sx, sy, pose, riding, now, opts);
    if (!p.boat) this._drawHeldItem(p, sx, pose);                                  // the rider swings the lasso / spear from the saddle too
    if (wading) { this.g.ellipse(sx, sy - 2, 12, 5.5, 'rgba(110,185,215,.55)'); }     // the water line over the lower legs
    this._drawNameTag(p, isMe, sx, pose);
    this._drawEmote(p, sx, pose);
    return pose;
  }

  /** Expanding rings round the feet while wading. */
  _drawRipples(sx, sy, now) {
    const ctx = this.g.ctx;
    for (let i = 0; i < 2; i++) {
      const t = ((now / 900) + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(235,248,255,${(0.7 * (1 - t)).toFixed(2)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, 10 + t * 14, 4.5 + t * 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /** The body for the pose's direction: your images if the body type has them, else the procedural body. Then worn-item overlays. */
  _drawBody(p, sx, sy, pose, riding, now, opts) {
    const L = this._look(p.appearance), body = L.princess ? 'princess' : 'prince', moving = p.state !== 'idle';
    const drawn = !opts.procedural && SpriteRegistry.drawCharacter(this.g.ctx, body, pose.dir, sx, sy - pose.crouch * 0.5, moving, now);
    if (drawn) pose.headY = sy - drawn.h + 6;                                           // (the name tag and emote sit above the picture)
    else if (PIXEL_BODIES[body]) this._drawPixel(p, sx, sy, pose, riding, now, L);
    else if (pose.dir === 'up') this._drawUp(p, sx, sy, pose, riding);
    else if (pose.dir === 'down') this._drawDown(p, sx, sy, pose, riding);
    else this._drawSide(p, sx, sy, pose, riding);
    if (!opts.procedural) this._drawWorn(p, sx, sy, pose, moving, now);
  }
  /** The procedural body. It turns with the facing by itself, so all four directions share it; _drawUp / _drawDown are the place
   *  for dedicated back / front views (BOILERPLATE: they use the same body for now). */
  _drawSide(p, sx, sy, pose, riding) { if (!p.boat) this._drawLegs(p, sx, sy, pose); this._drawTorsoAndHead(p, sx, pose); }
  _drawUp(p, sx, sy, pose, riding) { this._drawSide(p, sx, sy, pose, riding); }
  _drawDown(p, sx, sy, pose, riding) { this._drawSide(p, sx, sy, pose, riding); }

  /** The retro pixel-art body (pixelCharacter.js): it walks with the stride, breathes and blinks when idle, and sits lower when riding. */
  _drawPixel(p, sx, sy, pose, riding, now, L) {
    const moving = p.state !== 'idle' && !riding;
    if (p.mount) this._drawRiderLegs(sx, sy, pose, L);
    const at = PixelCharacter.draw(this.g.ctx, L, this._wardrobe(p, pose.gear), pose.dir, sx, sy, {
      moving, phase: pose.phase, now, seed: (p.slot | 0) * 0.37, hurt: p.hurtT > 0,
      crouch: riding ? pose.crouch : pose.crouch * 0.5, cut: riding ? 11 : pose.crouch ? 2 : 0 });   // (the sprite's own legs are hidden when seated: a rider's legs straddle the pony, see _drawRiderLegs)
    pose.headY = at.headY; pose.torsoTop = at.torsoTop;
  }

  /** A rider's legs astride the pony: splayed out either side of its back seen from the front or behind, one each side of the barrel (the far one darker) in profile. */
  _drawRiderLegs(sx, sy, pose, L) {
    const ctx = this.g.ctx, hipY = sy - 5, cloth = L.princess ? '#3b3542' : '#34343f', boot = '#5a3a22', dark = c => (c === cloth ? '#26242c' : '#3e2a18');
    const leg = (hx, fx, fy, col, bcol) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = col; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(hx, hipY); ctx.lineTo(fx, fy - 4); ctx.stroke();               // the thigh and shin
      ctx.strokeStyle = bcol; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(fx, fy - 5); ctx.lineTo(fx + (fx >= hx ? 1.5 : -1.5), fy); ctx.stroke();   // the boot
    };
    if (pose.dir === 'up' || pose.dir === 'down') { leg(sx - 3, sx - 12, sy + 7, cloth, boot); leg(sx + 3, sx + 12, sy + 7, cloth, boot); return; }
    const f = pose.dir === 'right' ? 1 : -1;                                                                                                // (the far leg is drawn before the pony: farLeg)
    leg(sx + f * 1, sx + f * 4, sy + 9, cloth, boot);                                                                                       // the near leg, knee forward
    ctx.lineCap = 'butt';
  }

  /** The far leg of a rider seen in profile: drawn BEFORE the pony, so the pony's body hides it and only the lower leg shows beneath the belly. */
  drawFarLeg(p, sx, sy) {
    const ctx = this.g.ctx, L = this._look(p.appearance), f = SpriteRegistry.dirOf(p.facing) === 'right' ? 1 : -1, hipY = sy - SADDLE_HEIGHT - 5;
    const cloth = L.princess ? '#26222c' : '#26242c', x = sx - f * 2;
    ctx.lineCap = 'round'; ctx.strokeStyle = cloth; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(x - f * 1, hipY + 14); ctx.stroke();
    ctx.strokeStyle = '#3e2a18'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - f * 1, hipY + 13); ctx.lineTo(x - f * 1, hipY + 17); ctx.stroke(); ctx.lineCap = 'butt';
  }

  /** Worn items that have images: full-body overlays for the facing direction. */
  _drawWorn(p, sx, sy, pose, moving, now) {
    const gear = p.gear || {};
    for (const slot of WORN_ORDER) {
      const item = gear[slot], picked = item && SpriteRegistry.wornImage(item, pose.dir);
      if (picked) SpriteRegistry.drawSheet(this.g.ctx, picked, ItemDefs[item].sprites.worn, sx, sy - pose.crouch * 0.5, moving, now);
    }
  }

  _computePose(p, id, sx, sy, now, riding, rowPhase) {
    const walk = this.walkPhase[id] || (this.walkPhase[id] = { phase: 0, lastX: p.x, lastY: p.y });
    const dxw = p.x - walk.lastX, dyw = p.y - walk.lastY, moved = Math.hypot(dxw, dyw);
    if (moved < 1) walk.phase += isoLength(dxw, dyw) * 4.5 / TILE_SCALE;      // stride length stays constant in PIXELS ON SCREEN, whichever way you walk
    walk.lastX = p.x; walk.lastY = p.y;

    const moving = p.state !== 'idle', run = p.state === 'run';
    const crouch = riding ? 12 : 0;                                                  // seated in the boat
    const bob = riding ? 0 : moving ? Math.abs(Math.sin(walk.phase)) * (run ? 3 : 1.8) : Math.sin(now / 500 + p.slot) * 0.6;
    const legSwing = riding ? Math.sin(rowPhase) * 5 : moving ? Math.sin(walk.phase) * (run ? 5 : 3.5) : 0;   // arms follow the oars
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    const [px, py] = IsoProjection.worldDeltaToScreen(fx, fy), len = Math.hypot(px, py) || 1;
    const torsoTop = sy - 33 + crouch - bob, dir = SpriteRegistry.dirOf(p.facing);
    const gear = Object.assign({}, p.gear || {});                                   // gear with its own worn images is not drawn procedurally
    for (const slot of WORN_ORDER) if (gear[slot] && SpriteRegistry.wornImage(gear[slot], dir)) gear[slot] = '';
    return { crouch, legSwing, fx, fy, ux: px / len, uy: py / len, torsoTop, headY: torsoTop - 6, sy, dir, gear, phase: walk.phase };
  }

  _drawGroundMarkers(p, sx, sy, pose) {
    const g = this.g, ctx = g.ctx, { fx, fy } = pose;
    SpriteCache.shadow(ctx, sx, sy, 12, 5.5, 0.28);
    // the facing arrow: one picture per 4 degrees of facing, painted once and stamped
    const step = Math.round(Math.atan2(fy, fx) / (Math.PI / 45)), a = step * Math.PI / 45;
    SpriteCache.stamp(ctx, 'arrow' + step, 96, 56, 48, 28, g2 => {
      const c = g2.ctx, world = IsoProjection.worldDeltaToScreen, k = 1 / TILE_SCALE, ax = Math.cos(a), ay = Math.sin(a);   // (the arrow keeps its pixel size)
      const tip = world(ax * 0.85 * k, ay * 0.85 * k);
      const left = world((ax * 0.5 - ay * 0.22) * k, (ay * 0.5 + ax * 0.22) * k), right = world((ax * 0.5 + ay * 0.22) * k, (ay * 0.5 - ax * 0.22) * k);
      g2.polygon([tip[0], tip[1], left[0], left[1], right[0], right[1]], 'rgba(255,255,255,.75)');
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.stroke();
    }, sx, sy);
  }

  /** What this character is wearing: the drawn "look" of the item in each wardrobe slot (or null). Nothing else is ever worn. */
  _wardrobe(p, gear = p.gear || {}) {
    const look = id => (id && ItemDefs[id] ? ItemDefs[id].look : null);
    return { crown: look(gear.crown), outfit: look(gear.outfit), cape: look(gear.cape) };
  }
  /** The outfit's style and colours: its own, or the ones chosen on the character screen (a null colour means "yours"). */
  _palette(L, outfit) { return { style: outfit ? outfit.style : 'plain', col: (outfit && outfit.color) || L.outfit, trim: (outfit && outfit.trim) || L.trim }; }

  _drawLegs(p, sx, sy, pose) {
    const ctx = this.g.ctx, { crouch, legSwing } = pose, L = CharacterLook.describe(p.appearance);
    const y1 = sy - 13 + crouch * 0.5 - Math.max(0, legSwing) * 0.5, y2 = sy - 13 + crouch * 0.5 - Math.max(0, -legSwing) * 0.5, h = 13 - crouch * 0.5;
    ctx.fillStyle = L.princess ? L.skin : '#34343f';
    ctx.fillRect(sx - 6, y1, 5, h); ctx.fillRect(sx + 1, y2, 5, h);
    if (L.princess) { ctx.fillStyle = L.trim; ctx.fillRect(sx - 6.5, y1 + h - 3, 6, 3.4); ctx.fillRect(sx + 0.5, y2 + h - 3, 6, 3.4); }       // slippers
  }

  _drawTorsoAndHead(p, sx, pose) {
    const g = this.g, ctx = g.ctx, { crouch, legSwing, torsoTop, headY, ux, uy } = pose, L = CharacterLook.describe(p.appearance), away = uy < -0.3;
    const W = this._wardrobe(p, pose.gear), O = this._palette(L, W.outfit);         // (a piece with its own worn pictures is drawn by _drawWorn instead)
    if (W.cape && !away) this._cape(sx, pose, W.cape, false);                           // a cape hangs behind you when you face the camera...
    if (!away) this._hairBack(p, sx, pose, L);                                          // long hair, a ponytail or a braid hangs BEHIND you when you face the camera...
    g.roundRect(sx - 8.5, torsoTop, 17, 22 - crouch * 0.5, 4); ctx.fillStyle = O.col; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(sx + 2, torsoTop + 2, 6, 18 - crouch * 0.5);
    this._outfit(sx, pose, L, O);                                                       // the cut of the dress or garb: sash, skirt, collar, buttons...
    if (W.cape && away) this._cape(sx, pose, W.cape, true);                             // ...and drapes over your back when you face away
    const sleeve = g.shade(O.col, 0.8);
    g.ellipse(sx - 10, torsoTop + 8 - legSwing * 0.4, 3.2, 3.2, L.skin); g.ellipse(sx + 10, torsoTop + 8 + legSwing * 0.4, 3.2, 3.2, L.skin);
    g.ellipse(sx - 8.6, torsoTop + 6 - legSwing * 0.3, 2.2, 3.4, sleeve); g.ellipse(sx + 8.6, torsoTop + 6 + legSwing * 0.3, 2.2, 3.4, sleeve);
    if (W.cape && !away) this._capeCollar(sx, pose, W.cape);
    if (p.hurtT > 0) { g.roundRect(sx - 8.5, torsoTop, 17, 22 - crouch * 0.5, 4); ctx.fillStyle = `rgba(255,50,50,${Math.min(0.7, p.hurtT * 2).toFixed(2)})`; ctx.fill(); }

    if (away) this._hairBack(p, sx, pose, L);
    g.ellipse(sx, headY, 6.8, 6.8, L.skin);
    this._hairFront(p, sx, pose, L);
    if (!away) {                                                                        // a face: two eyes, a little blush
      const ex = sx + ux * 3.4, ey = headY + 0.8 + uy * 1.2, spread = 2.1 * (1 - Math.abs(ux) * 0.55);
      ctx.fillStyle = '#2a1c14'; ctx.beginPath(); ctx.ellipse(ex - spread, ey, 1.05, 1.5, 0, 0, Math.PI * 2); ctx.ellipse(ex + spread, ey, 1.05, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,.28)'; ctx.beginPath(); ctx.ellipse(ex - spread - 1.2, ey + 2.4, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.ellipse(ex + spread + 1.2, ey + 2.4, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (W.crown) this._crown(sx, headY, L, W.crown);
  }

  /** The cut of the outfit: the belt or sash, and the skirt (a dress) or the tunic's hem (prince garb), per style. */
  _outfit(sx, pose, L, O) {
    const g = this.g, ctx = g.ctx, { crouch, torsoTop } = pose, style = O.style, col = O.col, trim = O.trim, waist = torsoTop + 15 - crouch * 0.3, fold = 'rgba(0,0,0,.16)';
    const belt = (color, buckle) => { ctx.fillStyle = color; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 3); if (buckle) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(sx - 2, torsoTop + 12.5 - crouch * 0.3, 4, 4); } };
    const skirt = (hem, hemHalf, color) => { g.polygon([sx - 8.5, waist, sx + 8.5, waist, sx + hemHalf, hem, sx - hemHalf, hem], color); g.polygon([sx + 1, waist, sx + 8.5, waist, sx + hemHalf, hem, sx + 4, hem], 'rgba(0,0,0,.14)'); };
    const folds = (hem, spread) => { ctx.strokeStyle = fold; ctx.lineWidth = 1; ctx.beginPath(); for (const d of [-1, 1]) { ctx.moveTo(sx + d * 3, waist + 1); ctx.lineTo(sx + d * spread, hem - 2); } ctx.stroke(); };
    const scales = (y0, y1, x0, x1) => { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 0.9; for (let r = 0, y = y0; y < y1; r++, y += 4) for (let x = x0 + (r % 2) * 2.2; x < x1; x += 4.4) { ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI); ctx.stroke(); } };
    if (L.princess) {
      const hemBase = pose.sy - 6 + crouch * 0.4;
      if (style === 'sundress') {                                                        // light and short, a ruffle at the hem and a bow at the chest
        const hem = pose.sy - 8 + crouch * 0.4; ctx.fillStyle = trim; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 2);
        skirt(hem, 11.5, col); folds(hem, 5); for (let i = -2; i <= 2; i++) g.ellipse(sx + i * 4.6, hem - 0.5, 2.6, 2, trim);
        g.ellipse(sx - 2, torsoTop + 3, 2.4, 1.8, trim); g.ellipse(sx + 2, torsoTop + 3, 2.4, 1.8, trim); g.ellipse(sx, torsoTop + 3, 1, 1, g.shade(trim, 0.7));
      } else if (style === 'ball' || style === 'scaled') {                               // a wide gown to the floor, layered, with a trimmed hem
        const hem = pose.sy - 2 + crouch * 0.4;
        ctx.fillStyle = trim; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 3);
        skirt(hem, 17, col); folds(hem, 8);
        ctx.fillStyle = g.shade(col, 1.18); ctx.beginPath(); ctx.moveTo(sx - 12.5, waist + 9); ctx.quadraticCurveTo(sx, waist + 13, sx + 12.5, waist + 9); ctx.lineTo(sx + 13.4, waist + 11); ctx.quadraticCurveTo(sx, waist + 15.5, sx - 13.4, waist + 11); ctx.closePath(); ctx.fill();   // a flounce
        ctx.fillStyle = trim; ctx.fillRect(sx - 17, hem - 2.6, 34, 2.8);
        ctx.fillStyle = trim; ctx.fillRect(sx - 4.5, torsoTop + 0.5, 9, 1.8);            // the neckline
        if (style === 'scaled') scales(waist + 3, hem - 3, sx - 14, sx + 14);
        else for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(sx - 13 + (i * 7) % 26, waist + 4 + ((i * 5) % 9), 1.6, 1.6); }     // sparkles
      } else {                                                                           // plain: a sash and a simple skirt
        ctx.fillStyle = trim; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 3);
        skirt(hemBase, 13, col); ctx.fillStyle = trim; ctx.fillRect(sx - 13, hemBase - 2, 26, 2.2); folds(hemBase, 6);
      }
      return;
    }
    const knee = torsoTop + 27 - crouch * 0.4;                                           // ---- prince garb
    if (style === 'tunic') {                                                              // a long tunic to the knees, gold at the collar and hem
      g.polygon([sx - 8.5, waist - 1, sx + 8.5, waist - 1, sx + 10.5, knee, sx - 10.5, knee], col); g.polygon([sx + 1, waist, sx + 8.5, waist, sx + 10.5, knee, sx + 4, knee], 'rgba(0,0,0,.14)');
      ctx.fillStyle = trim; ctx.fillRect(sx - 10.5, knee - 2.2, 21, 2.2); g.polygon([sx - 4.6, torsoTop, sx, torsoTop + 5.4, sx + 4.6, torsoTop], trim);
      belt('#4a3624', true);
    } else if (style === 'doublet') {                                                     // a fitted jacket: epaulettes, buttons, a flared skirt
      g.polygon([sx - 8.5, waist - 1, sx + 8.5, waist - 1, sx + 11, torsoTop + 24 - crouch * 0.4, sx - 11, torsoTop + 24 - crouch * 0.4], col);
      g.ellipse(sx - 8.6, torsoTop + 2.4, 3.6, 2.4, trim); g.ellipse(sx + 8.6, torsoTop + 2.4, 3.6, 2.4, trim);
      ctx.fillStyle = trim; for (const y of [3.5, 7.5, 11.5]) ctx.fillRect(sx - 1, torsoTop + y, 2.2, 2.2);
      ctx.fillStyle = trim; ctx.fillRect(sx - 11, torsoTop + 22.5 - crouch * 0.4, 22, 1.8); belt(g.shade(col, 0.6), false);
    } else if (style === 'hunter') {                                                      // laced leather, a strap across the chest, a short skirt
      g.polygon([sx - 8.5, waist - 1, sx + 8.5, waist - 1, sx + 10, torsoTop + 22 - crouch * 0.4, sx - 10, torsoTop + 22 - crouch * 0.4], g.shade(col, 0.92));
      ctx.strokeStyle = trim; ctx.lineWidth = 1.3; ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = torsoTop + 2 + i * 3; ctx.moveTo(sx - 3, y); ctx.lineTo(sx + 3, y + 3); ctx.moveTo(sx + 3, y); ctx.lineTo(sx - 3, y + 3); } ctx.stroke();
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(sx - 8, torsoTop + 1); ctx.lineTo(sx + 8, torsoTop + 17); ctx.stroke(); belt('#3a2a1a', true);
    } else {                                                                             // plain clothes: a belt with a buckle
      belt('#4a3624', true);
    }
  }

  /** A cape: behind the body when you face the camera, over the back when you face away. */
  _cape(sx, pose, look, front) {
    const g = this.g, ctx = g.ctx, { torsoTop, crouch } = pose, col = look.color, trim = look.trim, hemY = torsoTop + 28 - crouch * 0.4, top = torsoTop + (front ? 1 : 2), half = front ? 9.5 : 9;
    g.polygon([sx - half, top, sx + half, top, sx + 13, hemY, sx - 13, hemY], front ? col : g.shade(col, 0.78));
    if (front) g.polygon([sx + 1, top, sx + half, top, sx + 13, hemY, sx + 4, hemY], 'rgba(0,0,0,.2)');
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 3, top + 2); ctx.lineTo(sx - 5.5, hemY - 1); ctx.moveTo(sx + 3, top + 2); ctx.lineTo(sx + 5.5, hemY - 1); ctx.stroke();
    if (look.style === 'royal') { ctx.fillStyle = trim; ctx.fillRect(sx - 13, hemY - 3, 26, 3); }
    else if (look.style === 'fur') for (let i = 0; i < 6; i++) { g.ellipse(sx - 11 + i * 4.4, hemY - 0.5, 2.8, 2.4, trim); }
    else if (look.style === 'scaled') { ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 0.9; for (let r = 0, y = top + 4; y < hemY - 1; r++, y += 4) for (let x = sx - 10 + (r % 2) * 2.2; x < sx + 11; x += 4.4) { ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI); ctx.stroke(); } }
    else if (look.style === 'star') for (const [dx, dy] of [[-6, 6], [3, 9], [-2, 15], [7, 19], [-8, 21]]) { ctx.fillStyle = trim; ctx.fillRect(sx + dx - 1, top + dy - 1, 2.2, 2.2); }
    else { ctx.fillStyle = trim; ctx.fillRect(sx - 13, hemY - 2, 26, 2); }
    if (front) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(sx - 4, torsoTop + 1, 8, 2); g.ellipse(sx, torsoTop + 2, 2.2, 2.2, '#f2c14e'); }      // a gold clasp at the neck
  }
  /** What shows of a cape from the front: its collar across the shoulders and the clasp. */
  _capeCollar(sx, pose, look) {
    const g = this.g, ctx = g.ctx, { torsoTop } = pose;
    if (look.style === 'royal' || look.style === 'fur') { for (let i = -2; i <= 2; i++) g.ellipse(sx + i * 3.6, torsoTop + 1.4, 2.8, 2.6, look.trim); }
    else { ctx.fillStyle = g.shade(look.color, 0.8); ctx.fillRect(sx - 8.5, torsoTop, 17, 2); }
    g.ellipse(sx, torsoTop + 2, 1.9, 1.9, '#f2c14e');
  }

  /** Hair that hangs behind the head and shoulders. */
  _hairBack(p, sx, pose, L) {
    const g = this.g, ctx = g.ctx, { headY, torsoTop, ux } = pose, kind = L.hairKind, dark = g.shade(L.hair, 0.82), behind = -(Math.abs(ux) < 0.25 ? 0 : Math.sign(ux));
    if (kind === 'long' || kind === 'medium') {                                          // a curtain down the back: to the waist (long) or just to the shoulders (shoulder-length)
      const hem = kind === 'long' ? torsoTop + 17 : torsoTop + 5, half = kind === 'long' ? 9.5 : 8.6;
      g.polygon([sx - 8, headY - 1, sx + 8, headY - 1, sx + half, hem, sx - half, hem], dark);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 3, headY + 3); ctx.lineTo(sx - 4.5, hem - 2); ctx.moveTo(sx + 3, headY + 3); ctx.lineTo(sx + 4.5, hem - 2); ctx.stroke();
    } else if (kind === 'ponytail' || kind === 'tied') {                                  // swings out from the back of the head (facing the camera it shows at the side)
      const side = behind || 1, tx = sx + side * 7.5, small = kind === 'tied' ? 0.72 : 1, low = kind === 'tied' ? 5 : 0;
      g.ellipse(tx, headY - 2 + low, 3.4 * small, 3.4 * small, L.hair); g.ellipse(tx + side * 2, headY + 3 + low, 3.2 * small, 5 * small, L.hair); g.ellipse(tx + side * 3, headY + 10 * small + low, 2.4 * small, 4.6 * small, dark);
      g.ellipse(tx, headY - 2 + low, 1.5, 1.5, kind === 'tied' ? '#3a2a1a' : L.trim);
    } else if (kind === 'braid') {                                                        // linked segments over the shoulder
      const bx = sx + behind * 5.5 + (behind === 0 ? 5 : 0);
      for (let i = 0; i < 6; i++) g.ellipse(bx + (i % 2 ? 0.9 : -0.9), headY + 5 + i * 3.6, 2.5, 2.2, i % 2 ? L.hair : dark);
      g.ellipse(bx, headY + 5 + 6 * 3.6, 1.8, 1.8, L.trim);
    }
  }

  /** Hair on the head itself: the cap, and what makes each style different. */
  _hairFront(p, sx, pose, L) {
    const g = this.g, ctx = g.ctx, { headY, uy, ux, torsoTop } = pose, kind = L.hairKind, away = uy < -0.3, color = L.hair, light = g.shade(L.hair, 1.12), dark = g.shade(L.hair, 0.82);
    if (kind === 'curly') for (let i = 0; i < 7; i++) { const a = (-175 + i * 28) * Math.PI / 180; g.ellipse(sx + Math.cos(a) * 7.2, headY - 0.5 + Math.sin(a) * 6.6, 3.6, 3.6, i % 2 ? L.hair : dark); }
    if (kind === 'spiky') for (const [dx, h] of [[-6, 6], [-3, 9], [0, 11], [3, 9], [6, 6]]) g.polygon([sx + dx - 2.4, headY - 4.4, sx + dx * 1.15, headY - 4.4 - h, sx + dx + 2.4, headY - 4.4], dx % 2 ? light : L.hair);   // spikes standing up from the crown
    if (away) { g.ellipse(sx, headY, 7.2, 7.2, color); }                                  // the back of the head is all hair
    else { ctx.beginPath(); ctx.arc(sx, headY - 0.5, 7.2, Math.PI, 0); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
    if (!away) { g.ellipse(sx - 6.8, headY + 1.5, 1.7, 3, color); g.ellipse(sx + 6.8, headY + 1.5, 1.7, 3, color); }          // sideburns
    if (!away && kind === 'short') { g.ellipse(sx - 1, headY - 5.4, 6, 2.6, light); g.ellipse(sx + 4.2, headY - 3.2, 2.4, 3, L.hair); g.ellipse(sx - 5.5, headY - 2.6, 2.4, 2, L.hair); g.ellipse(sx + 5.5, headY - 2.6, 2.4, 2, L.hair); }   // neat, with a side parting
    if (!away && kind === 'swept') {                                                      // a swept-back quiff: volume on top, combed to one side
      g.ellipse(sx + 1, headY - 8.2, 7.8, 3.6, light); g.ellipse(sx + 6, headY - 6, 4, 3.2, L.hair);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 5, headY - 8); ctx.quadraticCurveTo(sx, headY - 11, sx + 6, headY - 8); ctx.stroke();
    }
    if (!away && kind === 'tied') { g.ellipse(sx - 1, headY - 5, 6.4, 2.4, light); }     // scraped back from the forehead
    if (!away && kind === 'medium') {                                                     // falls over the ears and down to the collar on both sides
      for (const side of [-1, 1]) g.polygon([sx + side * 6, headY - 1, sx + side * 8.6, headY + 1, sx + side * 8.4, headY + 9, sx + side * 5.6, headY + 8], dark);
      g.ellipse(sx - 2, headY - 5.4, 5, 2.2, light);
    }
    if (!away && kind === 'bob') {                                                        // chin-length, rounded under
      for (const side of [-1, 1]) { g.ellipse(sx + side * 7, headY + 3.4, 3, 5.4, dark); g.ellipse(sx + side * 6.6, headY + 7, 2.6, 2, L.hair); }
      g.ellipse(sx, headY - 5.2, 7, 2.6, light);
    }
    if (!away && kind === 'long') for (const side of [-1, 1]) g.polygon([sx + side * 6, headY + 1, sx + side * 9.8, headY + 3, sx + side * 10.4, torsoTop + 17, sx + side * 6.4, torsoTop + 17], dark);   // falls over both shoulders
    if (!away && kind === 'braid') { const bx = sx - 8.5; for (let i = 0; i < 6; i++) g.ellipse(bx + (i % 2 ? 0.8 : -0.8), headY + 5 + i * 3.4, 2.5, 2.2, i % 2 ? L.hair : dark); g.ellipse(bx, headY + 5 + 6 * 3.4, 1.8, 1.8, L.trim); }
    if (kind === 'bun') { const bx = sx + (Math.abs(ux) < 0.25 ? -7.6 : -Math.sign(ux) * 7.2), by = headY - 5.6; g.ellipse(bx, by, 4.6, 4.2, L.hair); g.ellipse(bx, by, 2, 1.8, g.shade(L.hair, 0.8)); g.ellipse(bx + 1, by - 3, 1.6, 1.4, L.trim); }
  }

  /** A crown, tiara, circlet or spiked crown, in the item's colour and gem. The "royal" style suits the body: a prince's crown or a princess's tiara. */
  _crown(sx, headY, L, look) {
    const g = this.g, ctx = g.ctx, gold = look.color, dark = g.shade(gold, 0.78), style = look.style === 'royal' ? (L.princess ? 'tiara' : 'crown') : look.style;
    if (style === 'crown') {
      ctx.fillStyle = gold; ctx.fillRect(sx - 5.2, headY - 8.6, 10.4, 2.4);
      for (const dx of [-4.2, 0, 4.2]) g.polygon([sx + dx - 1.7, headY - 8.6, sx + dx, headY - (dx === 0 ? 13.4 : 12), sx + dx + 1.7, headY - 8.6], gold);
      ctx.fillStyle = dark; ctx.fillRect(sx - 5.2, headY - 6.7, 10.4, 0.8); g.ellipse(sx, headY - 7.4, 1.1, 1.1, look.gem || L.outfit);
    } else if (style === 'tiara') {
      ctx.strokeStyle = gold; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.arc(sx, headY - 0.5, 7.7, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      for (const dx of [-3.6, 3.6]) g.polygon([sx + dx - 1, headY - 7.4, sx + dx, headY - 10.2, sx + dx + 1, headY - 7.4], gold);
      g.polygon([sx - 1.6, headY - 7.9, sx, headY - 12, sx + 1.6, headY - 7.9], gold); g.ellipse(sx, headY - 8.9, 1.6, 1.8, look.gem || L.trim);
    } else if (style === 'circlet') {                                                     // a thin band with small curved points
      ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, headY - 0.5, 7.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      for (const dx of [-5.5, -2, 2, 5.5]) g.polygon([sx + dx - 0.9, headY - 6.8, sx + dx * 1.2, headY - 10, sx + dx + 0.9, headY - 6.8], gold);
    } else {                                                                              // spiked: a tall, jagged crown
      ctx.fillStyle = gold; ctx.fillRect(sx - 5.6, headY - 8, 11.2, 2.4);
      for (const [dx, h] of [[-5, 6], [-2.5, 9], [0, 11.5], [2.5, 9], [5, 6]]) g.polygon([sx + dx - 1.4, headY - 8, sx + dx, headY - 8 - h, sx + dx + 1.4, headY - 8], gold);
      ctx.fillStyle = dark; ctx.fillRect(sx - 5.6, headY - 6.2, 11.2, 0.8); if (look.gem) g.ellipse(sx, headY - 7, 1.3, 1.3, look.gem);
    }
  }

  /** Just the body, for the character screen's preview. */
  drawPortrait(p, sx, sy, now, opts = {}) {
    const pose = this._computePose(p, 'portrait', sx, sy, now, false, 0);
    this._drawBody(p, sx, sy, pose, false, now, opts);
  }

  /* ---- held item (axe) ---- */
  _drawHeldItem(p, sx, pose) {
    if (this._drawHeldImage(p, sx, pose)) return;
    if (p.held === 'torch') { this._drawTorch(sx, pose); return; }
    const tool = ItemDB.getTool(p.held);
    if (!tool) return;
    const ctx = this.g.ctx, { ux, uy, torsoTop } = pose;
    const side = ux >= 0 ? 1 : -1, faceAngle = Math.atan2(uy, ux);
    const angle = faceAngle + this._axeOffset(p, tool) * side;
    const handX = sx + ux * 7, handY = torsoTop + 12 + uy * 3;
    const dirX = Math.cos(angle), dirY = Math.sin(angle), perpX = -dirY * side, perpY = dirX * side;
    const length = TOOL_LENGTH[tool.kind] || 17, tipX = handX + dirX * length, tipY = handY + dirY * length;

    ctx.lineCap = 'round';
    if (tool.kind === 'bow') this._drawBow(handX, handY, dirX, dirY, perpX, perpY);
    else if (tool.kind === 'leash') this._drawLassoInHand(handX, handY, dirX, dirY, perpX, perpY, p.swingT > 0, lassoLook(p.held));
    else if (tool.kind === 'brush') this._drawBrush(handX, handY, dirX, dirY, perpX, perpY, p.held);
    else if (tool.kind === 'shears') this._drawShears(handX, handY, dirX, dirY, perpX, perpY, p.swingT > 0 ? Math.abs(Math.sin(p.swingT * 18)) : 0);
    else if (tool.kind === 'water') this._drawWateringCan(handX, handY, side, p.swingT > 0);
    else {
      ctx.strokeStyle = tool.kind === 'rod' ? '#a07a45' : '#7a5230'; ctx.lineWidth = tool.kind === 'rod' ? 1.8 : 2.5;
      ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(tipX, tipY); ctx.stroke();
      if (tool.kind === 'hammer') this._drawHammerHead(tipX, tipY, dirX, dirY, perpX, perpY);
      else if (tool.kind === 'knife') this.g.polygon([handX + dirX * 4, handY + dirY * 4, tipX + dirX * 8, tipY + dirY * 8, handX + dirX * 4 + perpX * 4, handY + dirY * 4 + perpY * 4], '#d3d8df');
      else if (tool.kind === 'spear') this.g.polygon([tipX - dirX * 2 + perpX * 3, tipY - dirY * 2 + perpY * 3, tipX + dirX * 9, tipY + dirY * 9, tipX - dirX * 2 - perpX * 3, tipY - dirY * 2 - perpY * 3], '#c9ced6');
      else if (tool.kind === 'shovel') this._drawShovelHead(tipX, tipY, dirX, dirY, perpX, perpY);
      else if (tool.kind === 'sickle') { ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tipX + perpX * 5, tipY + perpY * 5, 6, Math.atan2(-perpY, -perpX) - 1.6, Math.atan2(-perpY, -perpX) + 1.6); ctx.stroke(); }   // the crescent blade
      else if (tool.kind === 'hoe') this.g.polygon([tipX - dirX * 1, tipY - dirY * 1, tipX + dirX * 2, tipY + dirY * 2, tipX + dirX * 2 + perpX * 7, tipY + dirY * 2 + perpY * 7, tipX - dirX * 2 + perpX * 6, tipY - dirY * 2 + perpY * 6], '#9aa2ad');
      else if (tool.kind === 'sword') this._drawSwordBlade(handX, handY, tipX, tipY, dirX, dirY, perpX, perpY, p.held);
      else if (tool.kind === 'rod') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + dirX * 6, tipY + dirY * 6 + 12); ctx.stroke(); }
      else this._drawAxeHead(tipX, tipY, dirX, dirY, perpX, perpY);
    }
    ctx.lineCap = 'butt';
  }

  /** An item with a `held` image: grip at the image's bottom centre, turned to point where the tool points (and swinging with it). */
  _drawHeldImage(p, sx, pose) {
    const img = p.held && SpriteRegistry.itemImage(p.held, 'held');
    if (!img) return false;
    const ctx = this.g.ctx, { ux, uy, torsoTop } = pose, tool = ItemDB.getTool(p.held), side = ux >= 0 ? 1 : -1;
    const angle = Math.atan2(uy, ux) + (tool ? this._axeOffset(p, tool) : SWING_CARRY_ANGLE) * side;
    const h = (tool ? TOOL_LENGTH[tool.kind] || 17 : 14) + 10, w = h * img.naturalWidth / img.naturalHeight;
    ctx.save(); ctx.translate(sx + ux * 7, torsoTop + 12 + uy * 3); ctx.rotate(angle + Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
    return true;
  }

  _drawSwordBlade(hx, hy, tx, ty, dx, dy, px, py, item) {
    const g = this.g, ctx = g.ctx, blade = item === 'stone_sword' ? '#9a9aa2' : '#d6b07a', edge = item === 'stone_sword' ? '#cfcfd6' : '#f0d9ae';
    g.polygon([hx + dx * 6 + px * 2.2, hy + dy * 6 + py * 2.2, tx + dx * 8, ty + dy * 8, hx + dx * 6 - px * 2.2, hy + dy * 6 - py * 2.2], blade);
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + dx * 7, hy + dy * 7); ctx.lineTo(tx + dx * 7, ty + dy * 7); ctx.stroke();
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hx + px * 5 + dx * 5, hy + py * 5 + dy * 5); ctx.lineTo(hx - px * 5 + dx * 5, hy - py * 5 + dy * 5); ctx.stroke();   // crossguard
  }

  /** A torch: a stick with a flickering flame, held up beside the head. */
  _drawTorch(sx, pose) {
    const g = this.g, ctx = g.ctx, { ux, torsoTop } = pose, hx = sx + (ux >= 0 ? 9 : -9), hy = torsoTop + 9, t = Date.now() / 110, flick = Math.sin(t) * 1.5;
    ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + (ux >= 0 ? 2 : -2), hy - 16); ctx.stroke(); ctx.lineCap = 'butt';
    const fx = hx + (ux >= 0 ? 2 : -2), fy = hy - 16;
    g.ellipse(fx, fy - 4, 14, 11, 'rgba(255,170,70,.18)');
    g.polygon([fx - 4, fy, fx - 1 + flick * 0.4, fy - 11 - flick, fx + 1.5, fy - 5, fx + 4, fy - 12 + flick * 0.5, fx + 5, fy], '#ff8a2a');
    g.polygon([fx - 2, fy, fx + flick * 0.3, fy - 7, fx + 3, fy], '#ffd24a');
  }

  /** The emote bubble: pops in, floats above the name tag, fades out. */
  _drawEmote(p, sx, pose) {
    if (!p.emote || !(p.emoteT > 0)) return;
    const def = EmoteDefs.find(e => e.id === p.emote);
    if (!def) return;
    const g = this.g, ctx = g.ctx, age = CONFIG.sim.emoteSeconds - p.emoteT;
    const pop = Math.min(1, 0.4 + age / 0.18), fade = Math.min(1, p.emoteT / 0.5), y = pose.headY - 50 - Math.min(6, age * 12);
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(sx, y); ctx.scale(pop, pop);
    g.roundRect(-17, -17, 34, 30, 11); ctx.fillStyle = '#fffdf5'; ctx.fill(); ctx.strokeStyle = 'rgba(40,30,20,.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    g.polygon([-5, 12, 5, 12, 0, 20], '#fffdf5');
    ctx.font = '20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#222';
    ctx.fillText(def.glyph, 0, -1.5);
    ctx.restore();
  }

  _drawBow(x, y, dx, dy, px, py) {
    const ctx = this.g.ctx, tipA = [x + px * 13 + dx * 3, y + py * 13 + dy * 3], tipB = [x - px * 13 + dx * 3, y - py * 13 + dy * 3];
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(tipA[0], tipA[1]); ctx.quadraticCurveTo(x + dx * 11, y + dy * 11, tipB[0], tipB[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,230,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipA[0], tipA[1]); ctx.lineTo(tipB[0], tipB[1]); ctx.stroke();
  }

  /** A coil of braided rope in the hand, with the loop swung out in front while throwing (an old rope shows a frayed end). */
  _drawLassoInHand(x, y, dx, dy, px, py, throwing, look = LASSO_LOOKS.leash) {
    const ctx = this.g.ctx, cx = x + dx * 4, cy = y + dy * 4 + 2;
    ctx.strokeStyle = look.dark; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, 5.2, 0, 0, Math.PI * 2); ctx.stroke();      // outline, then the coil
    ctx.strokeStyle = look.rope; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, 5.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = look.braid; ctx.lineWidth = 1.2; ctx.beginPath();                                                                      // the braid: little twists round the coil
    for (let k = 0; k < 8; k++) { if (look.worn && k % 3 === 2) continue; const a = k / 8 * Math.PI * 2, ex = cx + Math.cos(a) * 6.5, ey = cy + Math.sin(a) * 5.2; ctx.moveTo(ex - 1, ey - 1); ctx.lineTo(ex + 1, ey + 1); }
    ctx.stroke();
    ctx.fillStyle = look.honda; ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 1.8, 0, Math.PI * 2); ctx.fill();                                // the ring
    const ex = x - px * 3, ey = y + 15;
    ctx.strokeStyle = look.tails ? look.tails[0] : look.rope; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + dx * 2, y + dy * 2 + 3); ctx.quadraticCurveTo(x - px * 6, y + 12, ex, ey); ctx.stroke();   // the loose end
    if (look.tails) { ctx.strokeStyle = look.tails[1]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + dx * 2, y + dy * 2 + 3); ctx.quadraticCurveTo(x - px * 4, y + 13, ex + 2, ey + 1); ctx.stroke(); }
    if (look.worn) { ctx.strokeStyle = look.braid; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 2, ey + 2); ctx.moveTo(ex, ey); ctx.lineTo(ex + 1, ey + 3); ctx.moveTo(ex, ey); ctx.lineTo(ex + 2.5, ey + 1); ctx.stroke(); }
    if (throwing) {
      ctx.strokeStyle = look.dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x + dx * 17, y + dy * 17 - 4, 9, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = look.rope; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x + dx * 17, y + dy * 17 - 4, 9, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  /** Shears: two blades pivoting at a rivet, with loop handles in the hand; they open and snap shut while snipping (open 0..1). */
  _drawShears(x, y, dx, dy, px, py, open) {
    const ctx = this.g.ctx, a = 0.12 + open * 0.38, piv = [x + dx * 3, y + dy * 3];
    for (const s of [-1, 1]) {
      const c = Math.cos(a * s), sn = Math.sin(a * s), bx = dx * c - dy * sn, by = dx * sn + dy * c;     // each blade turned a little off the line
      ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(piv[0], piv[1]); ctx.lineTo(piv[0] + bx * 9, piv[1] + by * 9); ctx.stroke();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(piv[0] - bx * 3.2 + px * s * 1.6, piv[1] - by * 3.2 + py * s * 1.6, 1.8, 0, Math.PI * 2); ctx.stroke();   // the finger loops
    }
    ctx.fillStyle = '#4a4148'; ctx.fillRect(piv[0] - 0.8, piv[1] - 0.8, 1.6, 1.6);
  }

  /** A watering can held by its handle; tipped forward (pouring) while in use. */
  _drawWateringCan(x, y, side, pouring) {
    const ctx = this.g.ctx;
    ctx.save(); ctx.translate(x, y + 2); ctx.scale(side, 1); if (pouring) ctx.rotate(0.55);
    ctx.fillStyle = '#6f9fc8'; ctx.strokeStyle = '#2c4a66'; ctx.lineWidth = 1;
    ctx.fillRect(-4, 0, 8, 7); ctx.strokeRect(-4, 0, 8, 7);
    ctx.beginPath(); ctx.moveTo(4, 5); ctx.lineTo(9, 0); ctx.stroke();                                // the spout
    ctx.strokeStyle = '#41698f'; ctx.beginPath(); ctx.arc(0, 0, 3, Math.PI, 0); ctx.stroke();           // the handle
    ctx.fillStyle = '#a9cdea'; ctx.fillRect(-3, 1, 1.5, 5);
    if (pouring) { ctx.fillStyle = 'rgba(159,208,242,.9)'; for (let i = 0; i < 4; i++) ctx.fillRect(9 + i * 0.8, 1 + i * 2.2, 1.2, 1.4); }   // water falling
    ctx.restore();
  }

  /** A grooming brush: a short wooden handle and a block of bristles (a soft brush has pale ones). */
  _drawBrush(x, y, dx, dy, px, py, itemId) {
    const ctx = this.g.ctx, tipX = x + dx * 9, tipY = y + dy * 9;
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tipX, tipY); ctx.stroke();
    this.g.polygon([tipX + px * 4, tipY + py * 4, tipX + px * 4 + dx * 5, tipY + py * 4 + dy * 5, tipX - px * 4 + dx * 5, tipY - py * 4 + dy * 5, tipX - px * 4, tipY - py * 4], '#a8763f');
    ctx.strokeStyle = itemId === 'soft_brush' ? '#f4ead8' : '#4a3424'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = -3; k <= 3; k += 1.5) { ctx.moveTo(tipX + px * k + dx * 5, tipY + py * k + dy * 5); ctx.lineTo(tipX + px * k + dx * 8, tipY + py * k + dy * 8); }
    ctx.stroke();
  }


  _drawShovelHead(x, y, dx, dy, px, py) {                                    // a rounded spade at the end of the handle
    this.g.polygon([x - dx * 2 + px * 4.5, y - dy * 2 + py * 4.5, x + dx * 9 + px * 3.5, y + dy * 9 + py * 3.5, x + dx * 12, y + dy * 12, x + dx * 9 - px * 3.5, y + dy * 9 - py * 3.5, x - dx * 2 - px * 4.5, y - dy * 2 - py * 4.5], '#aab1ba');
  }

  _drawAxeHead(x, y, dx, dy, px, py) {
    this.g.polygon([x - dx * 3, y - dy * 3, x + dx * 5, y + dy * 5, x + dx * 6 + px * 7, y + dy * 6 + py * 7, x - dx * 4 + px * 7, y - dy * 4 + py * 7], '#c9ced6');
  }

  _drawHammerHead(x, y, dx, dy, px, py) {
    this.g.polygon([x - dx * 3 - px * 6, y - dy * 3 - py * 6, x + dx * 4 - px * 6, y + dy * 4 - py * 6, x + dx * 4 + px * 6, y + dy * 4 + py * 6, x - dx * 3 + px * 6, y - dy * 3 + py * 6], '#8d939c');
  }

  /** Angle offset relative to facing: carried low, raised during wind-up, then a fast strike. */
  _axeOffset(p, tool) {
    if (p.swingT <= 0) return SWING_CARRY_ANGLE;
    const progress = 1 - p.swingT / tool.swingTime, impact = tool.impactTime / tool.swingTime;
    if (progress < impact) return lerp(SWING_CARRY_ANGLE, SWING_WINDUP_ANGLE, progress / impact);
    const strike = (progress - impact) / (1 - impact);
    return lerp(SWING_WINDUP_ANGLE, SWING_FOLLOW_THROUGH, 1 - (1 - strike) * (1 - strike));
  }

  _drawNameTag(p, isMe, sx, pose) {
    const ctx = this.g.ctx, y = pose.headY, font = 'bold 11px Georgia, serif';
    const label = (p.name || 'P' + (p.slot + 1)) + (isMe ? ' (you)' : '');
    const width = SpriteCache.textWidth(font, label) + 10;
    SpriteCache.stamp(ctx, `p|${label}|${isMe ? 1 : 0}`, width, 14, width / 2, 24, g2 => {              // (painted once, then stamped)
      const c = g2.ctx;
      c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      g2.roundRect(-width / 2, -24, width, 14, 6); c.fillStyle = 'rgba(10,18,28,.6)'; c.fill();
      c.fillStyle = isMe ? '#ffe9a8' : '#f2f2f2'; c.fillText(label, 0, -17);
    }, sx, y);
  }
}

/** Draws a character into a canvas (the lobby's preview, the wardrobe, the character card). `facing` turns them: pi/4 faces the camera.
 *  The pixel bodies are drawn crisp: a whole number of screen pixels per art pixel, lined up on the pixel grid. opts: { dir (overrides facing),
 *  moving, phase (walk phase), crop (art rows to show from the top: a head-and-shoulders picture), procedural (skip image bodies) }. */
function renderCharacterPortrait(canvas, appearance, facing = Math.PI / 4, now = 0, gear = { crown: 'crown_simple' }, opts = {}) {
  const ctx = canvas.getContext('2d'), L = CharacterLook.describe(appearance), body = L.princess ? 'princess' : 'prince';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const images = !opts.procedural && ContentPack.character(body);
  if (!PIXEL_BODIES[body] || (images && SpriteRegistry.pick(images, 'down'))) {                       // a body drawn in the editor (or the smooth one)
    const sprite = new PlayerSprite(new Gfx(ctx)), scale = canvas.height / 66;
    ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height - 9 * scale);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    sprite.drawPortrait({ x: 0, y: 0, vx: 0, vy: 0, facing, state: 'idle', slot: 0, color: '#888', appearance, gear, held: '', swingT: 0, hurtT: 0 }, 0, 0, now, opts);
    ctx.setTransform(1, 0, 0, 1, 0, 0); return;
  }
  const PC = PixelCharacter, rows = opts.crop || PC.H, n = Math.max(1, Math.floor(Math.min(canvas.width / (PC.W + 2), canvas.height / (rows + (opts.crop ? 0 : 3)))));
  const k = n / PC.PX, cx = Math.round(canvas.width / 2 / n) * n, base = opts.crop ? rows * n + Math.round((canvas.height - rows * n) / 2) : canvas.height - 2 * n;
  const dir = opts.dir || SpriteRegistry.dirOf(facing), look = id => (id && ItemDefs[id] ? ItemDefs[id].look : null), g = gear || {};
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (!opts.crop) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cx / k, (base - n) / k, 11, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
  const y = opts.crop ? (base + (PC.H - rows) * n) / k : base / k;                                       // (cropped: the feet go below the canvas)
  PC.draw(ctx, L, { crown: look(g.crown), outfit: look(g.outfit), cape: look(g.cape) }, dir, cx / k, y, { moving: !!opts.moving, phase: opts.phase || 0, now, seed: 0.5, hurt: false });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
