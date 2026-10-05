'use strict';
/* CLIENT - draws a player: shadow, facing arrow, body, held axe with swing animation, name tag. */
const SWING_WINDUP_ANGLE = -1.6, SWING_CARRY_ANGLE = -0.9, SWING_FOLLOW_THROUGH = 0.35;
const TOOL_LENGTH = { axe: 17, hammer: 17, knife: 11, spear: 28, rod: 30, bow: 12, sword: 22, shovel: 24, leash: 8 };
const SADDLE_HEIGHT = 15;                        // how far above the pony's footprint a rider sits

class PlayerSprite {
  constructor(g) { this.g = g; this.walkPhase = {}; }

  draw(p, id, sx, sy, isMe, now, rowPhase = 0, wading = false) {
    const mounted = !!p.mount, riding = !!p.boat || mounted;
    if (mounted) { sy -= SADDLE_HEIGHT; rowPhase = now / 140; }                       // up in the saddle, arms swinging with the gait
    if (wading) this._drawRipples(sx, sy, now);
    const pose = this._computePose(p, id, sx, sy, now, riding, rowPhase);
    if (!riding) { this._drawGroundMarkers(p, sx, sy, pose); this._drawLegs(p, sx, sy, pose); }
    this._drawTorsoAndHead(p, sx, pose);
    if (!riding) this._drawHeldItem(p, sx, pose);
    if (wading) { this.g.ellipse(sx, sy - 2, 12, 5.5, 'rgba(110,185,215,.55)'); }     // the water line over the lower legs
    this._drawNameTag(p, isMe, sx, pose);
    this._drawEmote(p, sx, pose);
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

  _computePose(p, id, sx, sy, now, riding, rowPhase) {
    const walk = this.walkPhase[id] || (this.walkPhase[id] = { phase: 0, lastX: p.x, lastY: p.y });
    const moved = Math.hypot(p.x - walk.lastX, p.y - walk.lastY);
    if (moved < 1) walk.phase += moved * 4.5 / TILE_SCALE;      // stride length stays constant in pixels
    walk.lastX = p.x; walk.lastY = p.y;

    const moving = p.state !== 'idle', run = p.state === 'run';
    const crouch = riding ? 12 : p.state === 'sneak' ? 6 : 0;                       // seated in the boat
    const bob = riding ? 0 : moving ? Math.abs(Math.sin(walk.phase)) * (run ? 3 : 1.8) : Math.sin(now / 500 + p.slot) * 0.6;
    const legSwing = riding ? Math.sin(rowPhase) * 5 : moving ? Math.sin(walk.phase) * (run ? 5 : 3.5) : 0;   // arms follow the oars
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    const [px, py] = IsoProjection.worldDeltaToScreen(fx, fy), len = Math.hypot(px, py) || 1;
    const torsoTop = sy - 33 + crouch - bob;
    return { crouch, legSwing, fx, fy, ux: px / len, uy: py / len, torsoTop, headY: torsoTop - 6, sy };
  }

  _drawGroundMarkers(p, sx, sy, pose) {
    const g = this.g, ctx = g.ctx, { fx, fy } = pose;
    g.ellipse(sx, sy, 12, 5.5, 'rgba(0,0,0,.28)');
    const world = IsoProjection.worldDeltaToScreen;
    const k = 1 / TILE_SCALE;                                        // arrow keeps its pixel size
    const tip = world(fx * 0.85 * k, fy * 0.85 * k);
    const left = world((fx * 0.5 - fy * 0.22) * k, (fy * 0.5 + fx * 0.22) * k), right = world((fx * 0.5 + fy * 0.22) * k, (fy * 0.5 - fx * 0.22) * k);
    g.polygon([sx + tip[0], sy + tip[1], sx + left[0], sy + left[1], sx + right[0], sy + right[1]], 'rgba(255,255,255,.75)');
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();
  }

  _drawLegs(p, sx, sy, pose) {
    const ctx = this.g.ctx, { crouch, legSwing } = pose, gear = p.gear || {}, L = CharacterLook.describe(p.appearance);
    const y1 = sy - 13 + crouch * 0.5 - Math.max(0, legSwing) * 0.5, y2 = sy - 13 + crouch * 0.5 - Math.max(0, -legSwing) * 0.5, h = 13 - crouch * 0.5;
    ctx.fillStyle = gear.legs ? '#8a5a33' : L.princess ? L.skin : '#34343f';
    ctx.fillRect(sx - 6, y1, 5, h); ctx.fillRect(sx + 1, y2, 5, h);
    if (gear.legs) { ctx.fillStyle = '#6b4727'; ctx.fillRect(sx - 6, y1 + 3, 5, 1.5); ctx.fillRect(sx + 1, y2 + 3, 5, 1.5); }
    if (L.princess && !gear.feet) { ctx.fillStyle = L.trim; ctx.fillRect(sx - 6.5, y1 + h - 3, 6, 3.4); ctx.fillRect(sx + 0.5, y2 + h - 3, 6, 3.4); }       // slippers
    if (gear.feet) { ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx - 6.5, y1 + h - 4, 6, 4.5); ctx.fillRect(sx + 0.5, y2 + h - 4, 6, 4.5); }
  }

  _drawTorsoAndHead(p, sx, pose) {
    const g = this.g, ctx = g.ctx, { crouch, legSwing, torsoTop, headY, ux, uy } = pose, L = CharacterLook.describe(p.appearance), away = uy < -0.3;
    if (!L.princess) g.polygon([sx - 9, torsoTop + 2, sx + 9, torsoTop + 2, sx + 12, torsoTop + 27 - crouch * 0.4, sx - 12, torsoTop + 27 - crouch * 0.4], g.shade(L.trim, 0.82));   // a prince's cape, behind him
    if (!away) this._hairBack(p, sx, pose, L);                                          // long hair, a ponytail or a braid hangs BEHIND you when you face the camera...
    g.roundRect(sx - 8.5, torsoTop, 17, 22 - crouch * 0.5, 4); ctx.fillStyle = L.outfit; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(sx + 2, torsoTop + 2, 6, 18 - crouch * 0.5);
    ctx.fillStyle = L.princess ? L.trim : '#4a3624'; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 3);                          // belt / sash
    if (!L.princess) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(sx - 2, torsoTop + 12.5 - crouch * 0.3, 4, 4); }                              // buckle
    else {                                                                              // the skirt: from the waist down to the knees, with a trimmed hem
      const waist = torsoTop + 15 - crouch * 0.3, hem = pose.sy - 6 + crouch * 0.4;
      g.polygon([sx - 8.5, waist, sx + 8.5, waist, sx + 13, hem, sx - 13, hem], L.outfit);
      g.polygon([sx + 1, waist, sx + 8.5, waist, sx + 13, hem, sx + 4, hem], 'rgba(0,0,0,.14)');
      ctx.fillStyle = L.trim; ctx.fillRect(sx - 13, hem - 2, 26, 2.2);
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 3, waist + 1); ctx.lineTo(sx - 6, hem - 2); ctx.moveTo(sx + 3, waist + 1); ctx.lineTo(sx + 6, hem - 2); ctx.stroke();
    }
    const sleeve = g.shade(L.outfit, 0.8);
    const gear = p.gear || {}, glove = gear.hands ? '#6b4727' : L.skin;
    g.ellipse(sx - 10, torsoTop + 8 - legSwing * 0.4, 3.2, 3.2, glove); g.ellipse(sx + 10, torsoTop + 8 + legSwing * 0.4, 3.2, 3.2, glove);
    g.ellipse(sx - 8.6, torsoTop + 6 - legSwing * 0.3, 2.2, 3.4, sleeve); g.ellipse(sx + 8.6, torsoTop + 6 + legSwing * 0.3, 2.2, 3.4, sleeve);
    if (gear.chest) {                                                                   // hide vest over the shirt
      g.roundRect(sx - 8.5, torsoTop, 17, 18 - crouch * 0.5, 4); ctx.fillStyle = '#9a6b3d'; ctx.fill();
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, torsoTop + 1); ctx.lineTo(sx, torsoTop + 17); ctx.stroke();
    }
    if (gear.belt) {                                                                    // tool belt with a pouch
      ctx.fillStyle = '#4a3624'; ctx.fillRect(sx - 8.5, torsoTop + 13 - crouch * 0.3, 17, 3.5);
      ctx.fillStyle = '#d9b45a'; ctx.fillRect(sx - 1.5, torsoTop + 13.5 - crouch * 0.3, 3, 2.5);
      g.roundRect(sx + 3, torsoTop + 15 - crouch * 0.3, 6, 6, 1.5); ctx.fillStyle = '#6b4727'; ctx.fill();
    }
    if (gear.back) {                                                                    // scabbard / sling across the back, hilt at the shoulder when a sword is sheathed
      ctx.strokeStyle = gear.back === 'sling' ? '#8a6a3d' : '#5a3a20'; ctx.lineWidth = gear.back === 'sling' ? 1.6 : 3; ctx.beginPath();
      ctx.moveTo(sx + 7, torsoTop + 1); ctx.lineTo(sx - 8, torsoTop + 21 - crouch * 0.3); ctx.stroke();
      if (gear.weapon && !p.drawn) { ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 7, torsoTop + 1); ctx.lineTo(sx + 10, torsoTop - 4); ctx.stroke(); ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + 5.5, torsoTop + 2); ctx.lineTo(sx + 9, torsoTop - 1); ctx.stroke(); }
    }
    if (p.hurtT > 0) { g.roundRect(sx - 8.5, torsoTop, 17, 22 - crouch * 0.5, 4); ctx.fillStyle = `rgba(255,50,50,${Math.min(0.7, p.hurtT * 2).toFixed(2)})`; ctx.fill(); }

    if (away) this._hairBack(p, sx, pose, L);                                           // ...and falls over your back when you face away
    g.ellipse(sx, headY, 6.8, 6.8, L.skin);
    this._hairFront(p, sx, pose, L, gear);
    if (!away) {                                                                        // a face: two eyes, a little blush
      const ex = sx + ux * 3.4, ey = headY + 0.8 + uy * 1.2, spread = 2.1 * (1 - Math.abs(ux) * 0.55);
      ctx.fillStyle = '#2a1c14'; ctx.beginPath(); ctx.ellipse(ex - spread, ey, 1.05, 1.5, 0, 0, Math.PI * 2); ctx.ellipse(ex + spread, ey, 1.05, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,.28)'; ctx.beginPath(); ctx.ellipse(ex - spread - 1.2, ey + 2.4, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.ellipse(ex + spread + 1.2, ey + 2.4, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (!gear.head) this._crown(sx, headY, L);
    if (gear.shield) {                                                                // a round wooden shield on the arm
      const shx = sx + (ux >= 0 ? -12 : 12), shy = torsoTop + 11;
      g.ellipse(shx, shy, 7, 7.5, '#a97a45'); g.ellipse(shx, shy, 7, 7.5, 'rgba(0,0,0,0)');
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(shx, shy, 7, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
      g.ellipse(shx, shy, 2.4, 2.6, '#c9ced6');
    }
  }

  /** Hair that hangs behind the shoulders: long, ponytail, braid. */
  _hairBack(p, sx, pose, L) {
    const g = this.g, ctx = g.ctx, { headY, torsoTop, ux } = pose, style = L.hairStyle, dark = g.shade(L.hair, 0.82), behind = -(Math.abs(ux) < 0.25 ? 0 : Math.sign(ux));
    if (style === 1) {                                                                  // long: a curtain of hair down the back
      g.polygon([sx - 8, headY - 1, sx + 8, headY - 1, sx + 9.5, torsoTop + 17, sx - 9.5, torsoTop + 17], dark);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 3, headY + 3); ctx.lineTo(sx - 4.5, torsoTop + 15); ctx.moveTo(sx + 3, headY + 3); ctx.lineTo(sx + 4.5, torsoTop + 15); ctx.stroke();
    } else if (style === 2) {                                                           // ponytail: swings out from the back of the head
      const tx = sx + behind * 7.5; g.ellipse(tx, headY - 1, 3.2, 3.2, L.hair); g.ellipse(tx + behind * 1.5, headY + 4, 3, 4.6, L.hair); g.ellipse(tx + behind * 2.2, headY + 10, 2.3, 4.4, dark);
      g.ellipse(tx, headY - 1, 1.4, 1.4, L.trim);
    } else if (style === 3) {                                                           // braid: linked segments over the shoulder
      const bx = sx + behind * 5.5 + (behind === 0 ? 5 : 0);
      for (let i = 0; i < 6; i++) g.ellipse(bx + (i % 2 ? 0.9 : -0.9), headY + 5 + i * 3.6, 2.5, 2.2, i % 2 ? L.hair : dark);
      g.ellipse(bx, headY + 5 + 6 * 3.6, 1.8, 1.8, L.trim);
    }
  }

  /** Hair on the head itself: the cap, and what makes each style: tufts, curls, a bun. A hide cap (worn gear) replaces the cap but not the long hair. */
  _hairFront(p, sx, pose, L, gear) {
    const g = this.g, ctx = g.ctx, { headY, uy, ux } = pose, style = L.hairStyle, away = uy < -0.3, color = gear.head ? '#8a5a33' : L.hair;
    if (style === 4 && !gear.head) for (let i = 0; i < 7; i++) { const a = (-175 + i * 28) * Math.PI / 180; g.ellipse(sx + Math.cos(a) * 7.2, headY - 0.5 + Math.sin(a) * 6.6, 3.6, 3.6, i % 2 ? L.hair : g.shade(L.hair, 0.88)); }    // curls
    if (away) { g.ellipse(sx, headY, 7.2, 7.2, color); }                                // the back of the head is all hair
    else { ctx.beginPath(); ctx.arc(sx, headY - 0.5, 7.2, Math.PI, 0); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
    if (gear.head) { ctx.fillStyle = '#6b4727'; ctx.fillRect(sx - 7.2, headY - 1.5, 14.4, 2); return; }
    if (!away) { g.ellipse(sx - 6.8, headY + 1.5, 1.7, 3, color); g.ellipse(sx + 6.8, headY + 1.5, 1.7, 3, color); }          // side locks
    if (style === 5) { g.ellipse(sx - ux * 0.8, headY - 9.5, 3.9, 3.5, L.hair); g.ellipse(sx - ux * 0.8, headY - 9.5, 1.5, 1.4, L.trim); }   // bun
    if (style === 0 && !away) { g.ellipse(sx - 5.5, headY - 2.6, 2.4, 2, L.hair); g.ellipse(sx + 5.5, headY - 2.6, 2.4, 2, L.hair); }       // short, tousled
  }

  /** A prince's crown / a princess's tiara (not worn with a cap). */
  _crown(sx, headY, L) {
    const g = this.g, ctx = g.ctx, gold = '#f2c14e', dark = '#c99722';
    if (!L.princess) {
      ctx.fillStyle = gold; ctx.fillRect(sx - 5.2, headY - 8.6, 10.4, 2.4);
      for (const dx of [-4.2, 0, 4.2]) g.polygon([sx + dx - 1.7, headY - 8.6, sx + dx, headY - (dx === 0 ? 13.4 : 12), sx + dx + 1.7, headY - 8.6], gold);
      ctx.fillStyle = dark; ctx.fillRect(sx - 5.2, headY - 6.7, 10.4, 0.8); g.ellipse(sx, headY - 7.4, 1.1, 1.1, L.outfit);
    } else {
      ctx.strokeStyle = gold; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.arc(sx, headY - 0.5, 7.7, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      for (const dx of [-3.6, 3.6]) g.polygon([sx + dx - 1, headY - 7.4, sx + dx, headY - 10.2, sx + dx + 1, headY - 7.4], gold);
      g.polygon([sx - 1.6, headY - 7.9, sx, headY - 12, sx + 1.6, headY - 7.9], gold); g.ellipse(sx, headY - 8.9, 1.6, 1.8, L.trim);
    }
  }

  /** Just the body, for the character screen's preview. */
  drawPortrait(p, sx, sy, now) {
    const pose = this._computePose(p, 'portrait', sx, sy, now, false, 0);
    this._drawLegs(p, sx, sy, pose); this._drawTorsoAndHead(p, sx, pose);
  }

  /* ---- held item (axe) ---- */
  _drawHeldItem(p, sx, pose) {
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
    else if (tool.kind === 'leash') this._drawLassoInHand(handX, handY, dirX, dirY, perpX, perpY, p.swingT > 0);
    else {
      ctx.strokeStyle = tool.kind === 'rod' ? '#a07a45' : '#7a5230'; ctx.lineWidth = tool.kind === 'rod' ? 1.8 : 2.5;
      ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(tipX, tipY); ctx.stroke();
      if (tool.kind === 'hammer') this._drawHammerHead(tipX, tipY, dirX, dirY, perpX, perpY);
      else if (tool.kind === 'knife') this.g.polygon([handX + dirX * 4, handY + dirY * 4, tipX + dirX * 8, tipY + dirY * 8, handX + dirX * 4 + perpX * 4, handY + dirY * 4 + perpY * 4], '#d3d8df');
      else if (tool.kind === 'spear') this.g.polygon([tipX - dirX * 2 + perpX * 3, tipY - dirY * 2 + perpY * 3, tipX + dirX * 9, tipY + dirY * 9, tipX - dirX * 2 - perpX * 3, tipY - dirY * 2 - perpY * 3], '#c9ced6');
      else if (tool.kind === 'shovel') this._drawShovelHead(tipX, tipY, dirX, dirY, perpX, perpY);
      else if (tool.kind === 'sword') this._drawSwordBlade(handX, handY, tipX, tipY, dirX, dirY, perpX, perpY, p.held);
      else if (tool.kind === 'rod') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + dirX * 6, tipY + dirY * 6 + 12); ctx.stroke(); }
      else this._drawAxeHead(tipX, tipY, dirX, dirY, perpX, perpY);
    }
    ctx.lineCap = 'butt';
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

  /** A coil of rope in the hand, with the loop swung out in front while throwing. */
  _drawLassoInHand(x, y, dx, dy, px, py, throwing) {
    const ctx = this.g.ctx;
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x + dx * 4, y + dy * 4 + 2, 6.5, 5.2, 0, 0, Math.PI * 2); ctx.stroke();                 // the coil
    ctx.strokeStyle = '#d8b66a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x + dx * 4, y + dy * 4 + 2, 6.5, 5.2, 0, 0.5, Math.PI * 1.7); ctx.stroke();
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + dx * 2, y + dy * 2 + 3); ctx.quadraticCurveTo(x - px * 6, y + 12, x - px * 3, y + 15); ctx.stroke();   // the loose end
    if (throwing) { ctx.strokeStyle = '#d8b66a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + dx * 17, y + dy * 17 - 4, 9, 5.5, 0, 0, Math.PI * 2); ctx.stroke(); }
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
    const g = this.g, ctx = g.ctx, y = pose.headY;
    const label = (p.name || 'P' + (p.slot + 1)) + (isMe ? ' (you)' : '');
    ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width + 10;
    g.roundRect(sx - width / 2, y - 24, width, 14, 6); ctx.fillStyle = 'rgba(10,18,28,.6)'; ctx.fill();
    ctx.fillStyle = isMe ? '#ffe9a8' : '#f2f2f2'; ctx.fillText(label, sx, y - 17);
  }
}

/** Draws a character into a canvas (the lobby's preview). `facing` turns them: pi/4 faces the camera. */
function renderCharacterPortrait(canvas, appearance, facing = Math.PI / 4, now = 0) {
  const ctx = canvas.getContext('2d'), sprite = new PlayerSprite(new Gfx(ctx));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.height / 66;
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height - 9 * scale);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  sprite.drawPortrait({ x: 0, y: 0, vx: 0, vy: 0, facing, state: 'idle', slot: 0, color: '#888', appearance, gear: {}, held: '', swingT: 0, hurtT: 0, drawn: false }, 0, 0, now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
