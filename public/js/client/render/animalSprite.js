'use strict';
/* CLIENT - creatures. Each is drawn facing one of four screen directions (SpriteRegistry.dirOf): up, down, left, right.
 *   - If you gave the creature images (editor.html), those are drawn.
 *   - Otherwise the procedural artwork (CreatureSprites, from the creature's data): a profile mirrored for left / right. The UP and DOWN views
 *     are boilerplate for now (_drawUp / _drawDown reuse the profile) until they are drawn, either as images or here.
 * (sx, sy) is the animal's footprint. Legs swing and rabbits hop with the animal's speed. */
class AnimalSprite {
  constructor(g) { this.g = g; this.state = {}; this.looks = new LruCache(400); this.specs = new WeakMap(); }

  /** A pony's drawn look (PonyLook.describe), worked out once per set of numbers rather than once per frame. */
  _look(numbers) {
    const k = numbers ? numbers.join() : '';
    let look = this.looks.get(k);
    if (!look) { look = PonyLook.describe(numbers); this.looks.set(k, look); }
    return look;
  }
  /** A creature's sprite spec (its data's sprite, defaulting to a sheep), made once per creature type. */
  _spec(def) {
    let spec = this.specs.get(def);
    if (!spec) { spec = Object.assign({ kind: 'sheep' }, def.sprite || {}); this.specs.set(def, spec); }
    return spec;
  }

  /** @param {{near:boolean, ref:number}} [view] how close the local player is, and their own level for colouring a threat
   *  @param {{procedural?:boolean}} [opts] procedural: ignore images (the editor's previews of the built-in art) */
  draw(animal, id, sx, sy, now, view, opts = {}) {
    const ctx = this.g.ctx;
    const st = this.state[id] || (this.state[id] = { phase: 0, last: now, flip: 1 });
    const speed = isoLength(animal.vx || 0, animal.vy || 0);                  // legs follow how fast it looks like it is moving
    st.phase += speed * Math.min(0.1, (now - st.last) / 1000) * 7; st.last = now;
    const [ux] = IsoProjection.worldDeltaToScreen(Math.cos(animal.facing), Math.sin(animal.facing));
    if (Math.abs(ux) > 8) st.flip = ux > 0 ? 1 : -1;                         // keep the last side when facing straight up / down the screen
    const dir = SpriteRegistry.dirOf(animal.facing), seed = id.charCodeAt(id.length - 1);
    const def = AnimalDefs[animal.type], scale = (def.sprite && def.sprite.scale) || 1;

    const drawn = !opts.procedural && SpriteRegistry.drawCreature(ctx, animal.type, animal.look, dir, sx, sy, speed > 0.2, now);
    if (!drawn && PixelPony.covers(animal.type)) this._drawPixelPony(animal, st, dir, sx, sy, speed, now, seed);
    else if (!drawn && PixelCreatures.has((def.sprite && def.sprite.kind) || 'sheep')) {                // the retro pixel-art creatures (pixelCreatures.js)
      const spec = this._spec(def);
      PixelCreatures.draw(ctx, spec, sx, sy, st.flip, { moving: speed > 0.2, phase: st.phase, now, seed: (seed % 7) * 0.13, hunting: animal.state === 'chase',
        extra: spec.kind === 'deer' && seed % 2 === 0 ? 'stag' : animal.shorn ? 'shorn' : '' });
    }
    else if (!drawn) { ctx.save(); ctx.translate(sx, sy); this._drawFacing(dir, animal, st, speed, now, seed); ctx.restore(); }
    const tagY = drawn ? drawn.h + 10 : def.pony ? 64 : 40 * Math.max(1, scale);
    if (!animal.rider && ((animal.owner || animal.captor) || (view && view.near))) this._nameTag(animal, sx, sy, view, tagY);   // your pets carry their name; every animal shows its level up close
    const hearts = !animal.rider && view && (view.friend || view.invite);
    if (hearts) HeartMeter.draw(ctx, sx, sy - tagY - 16, view.friend || null, now);        // your hearts with it (or three faint empty ones, inviting you to make friends)
    if (animal.want && view && view.wantNear) WantBubble.draw(ctx, sx, sy - tagY - (hearts ? 30 : 10), animal.want, animal.wantN, now, view.holding === animal.want || (Wants.of(animal.type) || { items: [] }).items.includes(view.holding));   // what it is asking for
  }

  /** The retro pixel-art pony (pixelPony.js): its kind's wings and horn, its biome's effects, and a soft glow / magic aura behind it. */
  _drawPixelPony(animal, st, dir, sx, sy, speed, now, seed) {
    const ctx = this.g.ctx, def = AnimalDefs[animal.type], look = this._look(animal.look);
    if (look.glow || def.mystical) {                                                              // (only a glowing or magical pony needs the shifted origin)
      ctx.save(); ctx.translate(sx, sy);
      if (look.glow) this._glow(look.glow, now);
      if (def.mystical) this.g.ellipse(0, -22, 30, 24, `rgba(255,240,255,${0.10 + 0.04 * Math.sin(now / 500)})`);
      ctx.restore();
    }
    PixelPony.draw(ctx, look, dir, sx, sy, { moving: speed > 0.2, phase: st.phase, now, seed: seed * 0.13, lift: animal.lift, flying: !!animal.flying,
      kind: { wings: !!def.wings, horn: !!def.horn, mystical: !!def.mystical } });
  }

  /** The procedural artwork for one screen direction. */
  _drawFacing(dir, animal, st, speed, now, seed) {
    if (dir === 'up') return this._drawUp(animal, st, speed, now, seed);
    if (dir === 'down') return this._drawDown(animal, st, speed, now, seed);
    return this._drawSide(animal, st, speed, now, seed);
  }
  /** BOILERPLATE - the back view (walking away, up the screen). Until it is drawn, the profile stands in for it. */
  _drawUp(animal, st, speed, now, seed) { this._drawSide(animal, st, speed, now, seed); }
  /** BOILERPLATE - the front view (walking towards the camera, down the screen). Until it is drawn, the profile stands in for it. */
  _drawDown(animal, st, speed, now, seed) { this._drawSide(animal, st, speed, now, seed); }

  /** The profile, drawn facing right and mirrored when the animal faces left. What to draw comes from the creature's DATA (its `sprite`). */
  _drawSide(animal, st, speed, now, seed) {
    const ctx = this.g.ctx, def = AnimalDefs[animal.type], spec = def.sprite || {}, scale = spec.scale || 1;
    const impl = CreatureSprites.get(spec.kind || (def.pony ? 'pony' : 'sheep')) || CreatureSprites.get('sheep');
    if (!impl) return;                                                    // (the smooth drawings load a moment after the game starts: Loader)
    ctx.save(); ctx.scale(st.flip * scale, scale);
    impl.draw(this, { animal, def, sprite: spec, phase: st.phase, speed, now, seed, hunting: animal.state === 'chase' });
    ctx.restore();
  }

  /** Name (for your own animals) and a coloured LEVEL badge: green = easy for you, yellow = even, orange = hard, red = deadly. A wild pony shows its rarity. */
  _nameTag(animal, sx, sy, view, height) {
    const g = this.g, ctx = g.ctx, def = AnimalDefs[animal.type], lv = animal.level || 1, mine = !!(animal.owner || animal.captor);
    const look = def.pony ? this._look(animal.look) : null, rarity = look ? look.rarity : rarityOf(def.rarity);
    let label = '';
    const boss = def.boss ? '\u2605 ' : '';
    if (mine) label = animal.captor ? '\u2022 ' + look.name + ' (wild)' : (animal.main ? '\u2605 ' : animal.leashed ? '\u2665 ' : '') + (look ? look.name : def.name);
    else label = boss + (rarity.order ? rarity.name + ' ' : '') + (look ? `${look.variantName} ${def.name}` : def.name);
    const threat = AnimalLevels.threat(lv, view ? view.ref : 1), color = { easy: '#8be28b', even: '#ffe08a', hard: '#ffab6b', deadly: '#ff6b6b' }[threat];
    const font = 'bold 11px Georgia, serif', badge = 'Lv ' + lv, bw = SpriteCache.textWidth(font, badge) + 8, tw = SpriteCache.textWidth(font, label) + 8, width = tw + bw + 4, y = sy - height;
    const textColor = rarity.order ? rarity.color : '#ffd6e8';
    SpriteCache.stamp(ctx, `a|${label}|${badge}|${color}|${textColor}`, width, 14, width / 2, 7, g2 => {                // (the tag is painted once, then stamped)
      const c = g2.ctx, x0 = -width / 2;
      c.font = font; c.textAlign = 'left'; c.textBaseline = 'middle';
      g2.roundRect(x0, -7, width, 14, 6); c.fillStyle = 'rgba(10,18,28,.62)'; c.fill();
      g2.roundRect(x0 + tw + 2, -6, bw, 12, 5); c.fillStyle = color; c.fill();
      c.fillStyle = textColor; c.fillText(label, x0 + 4, 0);
      c.fillStyle = '#10202f'; c.fillText(badge, x0 + tw + 6, 0);
    }, sx, y);
  }

  /** A pony in profile: round head with a big shiny eye, flowing striped mane and tail, a cutie mark on the flank, wings for
   *  pegasi, a horn for unicorns (alicorns have both). Mystical ones sit in a soft glow with drifting sparkles. */
  _pony(animal, phase, speed, now) {
    const g = this.g, ctx = g.ctx, def = AnimalDefs[animal.type], look = PonyLook.describe(animal.look);
    const moving = speed > 0.2, stride = moving ? Math.sin(phase) * 4.5 : 0, bob = moving ? Math.abs(Math.sin(phase)) * 1.3 : Math.sin(now / 700) * 0.5;
    const coat = look.coat, shadeDark = g.shade(coat, 0.8), shadeLight = g.shade(coat, 1.14), manes = look.mane;
    const sway = Math.sin(now / 380) * 2;
    const flying = !!animal.flying, wingScale = flying ? 1.45 : 1;                       // in the air the wings spread wide and beat
    const flapFar = flying ? Math.sin(now / 85) : moving ? Math.sin(now / 70) : Math.sin(now / 500) * 0.35, flapNear = flying ? Math.sin(now / 85 + 0.7) : moving ? Math.sin(now / 70 + 1) : Math.sin(now / 500) * 0.35;

    if (look.glow) this._glow(look.glow, now);                                  // biome ponies shimmer in their own colour
    if (def.mystical) {                                                         // aura + drifting sparkles
      g.ellipse(0, -20, 30, 24, `rgba(255,240,255,${0.10 + 0.04 * Math.sin(now / 500)})`);
      for (let i = 0; i < 4; i++) {
        const a = now / 800 + i * 1.6, x = Math.cos(a) * 25, y = -22 + Math.sin(a * 1.3) * 18, r = 2 + Math.abs(Math.sin(now / 300 + i)) * 1.8;
        this._sparkle(x, y, r, manes[i % manes.length]);
      }
    }
    if (!animal.lift) g.ellipse(1, 3, 20, 7, 'rgba(0,0,0,.24)');                     // (a flying pony's shadow is drawn on the ground by the renderer)

    if (def.wings) this._wing(-1, -26 - bob, shadeDark, manes, flapFar, 0.8 * wingScale);   // far wing
    if (look.accessory === 'flames') this._flames(now, bob, sway);                                  // an ember pony's mane and tail are fire (drawn under the body)

    // tail
    ctx.lineCap = 'round';
    manes.forEach((c, i) => {
      ctx.strokeStyle = c; ctx.lineWidth = 5 - i;
      ctx.beginPath(); ctx.moveTo(-14, -23 - bob); ctx.bezierCurveTo(-24, -27, -28 + i * 2 + sway, -14, -24 + i * 3 + sway * 1.5, -3 + i * 2); ctx.stroke();
    });
    // legs: far pair darker, near pair lighter, dark hooves
    const leg = (x, swing, c) => { ctx.strokeStyle = c; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(x, -16 - bob); ctx.lineTo(x + swing, -3); ctx.stroke(); g.ellipse(x + swing, -2, 2.8, 2, '#5a4a52'); };
    leg(6, -stride, shadeDark); leg(-9, stride, shadeDark);
    g.ellipse(0, -20 - bob, 16, 8.5, coat); g.ellipse(2, -16 - bob, 11, 4.2, shadeLight);          // body + belly
    leg(10, stride, coat); leg(-13, -stride, coat);
    this._cutieMark(look.mark, -5, -20 - bob, manes[0]);
    this._bodyAccessory(look.accessory, now, bob, moving, coat);

    // neck, head
    g.polygon([8, -24 - bob, 15, -24 - bob, 23, -34 - bob, 15, -38 - bob], coat);
    manes.forEach((c, i) => {                                                                       // mane down the neck
      ctx.strokeStyle = c; ctx.lineWidth = 5 - i;
      ctx.beginPath(); ctx.moveTo(14 - i * 1.2, -41 - bob); ctx.bezierCurveTo(7 + sway * 0.5, -36, 5 - i, -29, 9 - i * 2, -22 - bob); ctx.stroke();
    });
    g.ellipse(20, -33 - bob, 9, 8, coat);                                                           // head
    g.ellipse(27, -30 - bob, 4.6, 3.6, shadeLight); g.ellipse(29.5, -30.5 - bob, 0.9, 0.9, shadeDark);   // muzzle + nostril
    ctx.strokeStyle = shadeDark; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(27, -27.5 - bob); ctx.quadraticCurveTo(29, -27, 30, -28.5 - bob); ctx.stroke();
    g.ellipse(21.5, -34 - bob, 3.8, 4.6, '#ffffff'); g.ellipse(22.3, -33.6 - bob, 2.8, 3.6, manes[0]);   // big eye
    g.ellipse(22.6, -33.4 - bob, 1.5, 2.3, '#2a1830'); g.ellipse(21.6, -35 - bob, 1.1, 1.1, '#ffffff');
    ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(19, -37 - bob); ctx.lineTo(18, -39.5 - bob); ctx.stroke();   // lash
    g.ellipse(24.5, -29.5 - bob, 2, 1.2, 'rgba(255,120,150,.35)');                                  // blush
    g.polygon([14, -39 - bob, 16.5, -47 - bob, 20.5, -40 - bob], coat);                             // ear
    g.polygon([15.5, -40 - bob, 16.8, -45 - bob, 18.5, -41 - bob], 'rgba(240,150,170,.6)');
    manes.forEach((c, i) => {                                                                       // forelock
      ctx.strokeStyle = c; ctx.lineWidth = 4 - i * 0.8;
      ctx.beginPath(); ctx.moveTo(15 + i, -41 - bob); ctx.quadraticCurveTo(20, -43, 25 - i, -36 - bob); ctx.stroke();
    });
    ctx.lineCap = 'butt';

    if (def.horn) this._horn(21, -40 - bob, now, look.accessory === 'crystals');
    this._headAccessory(look.accessory, now, bob);
    if (def.wings) this._wing(1, -26 - bob, shadeLight, manes, flapNear, 1 * wingScale);        // near wing
  }

  _wing(side, y, color, manes, flap, scale) {
    const g = this.g, ctx = g.ctx;
    ctx.save(); ctx.translate(side * 3, y); ctx.scale(scale, scale); ctx.rotate(-0.35 + flap * 0.55);
    g.polygon([0, 0, -6, -16, -18, -24, -27, -19, -20, -13, -24, -8, -15, -5, -9, -1], color);
    ctx.strokeStyle = manes[0]; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(-9, -8); ctx.lineTo(-23, -18); ctx.moveTo(-8, -4); ctx.lineTo(-20, -9); ctx.moveTo(-5, -12); ctx.lineTo(-17, -22); ctx.stroke();
    ctx.restore();
  }

  _horn(x, y, now, crystal) {
    const g = this.g, ctx = g.ctx;
    g.polygon([x - 2.4, y, x + 2.6, y - 0.5, x + 7, y - 14], crystal ? '#bff3ff' : '#f6d56f');       // a crystal pony's horn is a gem
    ctx.strokeStyle = 'rgba(180,130,30,.6)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(x - 2 + i * 1.1, y - i * 3.2); ctx.lineTo(x + 3 + i * 0.9, y - i * 3.6 - 0.8); }
    ctx.stroke();
    this._sparkle(x + 7, y - 16, 2.5 + Math.abs(Math.sin(now / 250)) * 2, '#fff2a8');
  }

  /** A soft coloured glow all round the pony. */
  _glow(color, now) {
    const ctx = this.g.ctx, pulse = 0.5 + 0.5 * Math.sin(now / 650);
    const grad = ctx.createRadialGradient(4, -22, 4, 4, -22, 40); grad.addColorStop(0, this._rgba(color, 0.30 + 0.12 * pulse)); grad.addColorStop(1, this._rgba(color, 0));
    ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(4, -22, 40, 32, 0, 0, Math.PI * 2); ctx.fill();
  }
  _rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  /** Ember ponies: a mane and tail of licking flames. */
  _flames(now, bob, sway) {
    const g = this.g, ctx = g.ctx, flick = i => Math.sin(now / 90 + i * 1.7);
    const flame = (x, y, h, w, i) => {                                                    // one flame: orange body, yellow core
      const lean = flick(i) * 2.2 + sway * 0.4;
      for (const [k, col] of [[1, '#ff6a00'], [0.62, '#ffb300'], [0.3, '#fff3a0']]) {
        ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.moveTo(x - w * k, y);
        ctx.quadraticCurveTo(x - w * k * 0.7, y - h * k * 0.55, x + lean * k, y - h * k); ctx.quadraticCurveTo(x + w * k * 0.7, y - h * k * 0.5, x + w * k, y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 5; i++) flame(-15 - i * 2.4 + sway * 0.2, -22 + i * 4.2 - bob, 11 + (i % 2) * 4, 3.2, i);        // tail
    for (let i = 0; i < 4; i++) flame(12 - i * 1.5, -30 - i * 1.2 - bob, 10 + (i % 2) * 4, 3, i + 5);                    // neck mane
    for (let i = 0; i < 3; i++) { const t = ((now / 700) + i / 3) % 1; this.g.ellipse(-18 + Math.sin(i * 2 + now / 400) * 5, -26 - t * 26, 1.3, 1.3, `rgba(255,${160 + i * 30},60,${(1 - t).toFixed(2)})`); }   // rising embers
  }

  /** Effects drawn over the body: gem shards, stars, leaves, bubbles, dust, frost. */
  _bodyAccessory(kind, now, bob, moving, coat) {
    if (!kind) return;
    const g = this.g, ctx = g.ctx;
    if (kind === 'crystals') {
      [[-9, -28, '#8ef0ff'], [-2, -29.5, '#c7a8ff'], [5, -28.5, '#8ef0ff'], [-14, -22, '#bff3ff']].forEach(([x, y, c], i) => {
        const tw = 0.7 + 0.3 * Math.sin(now / 300 + i * 2); ctx.globalAlpha = 0.9;
        g.polygon([x - 2.2, y - bob + 2, x, y - bob - 6 * tw, x + 2.2, y - bob + 2], c); g.polygon([x, y - bob - 6 * tw, x + 2.2, y - bob + 2, x + 0.4, y - bob + 2], 'rgba(255,255,255,.55)'); ctx.globalAlpha = 1;
      });
      this._sparkle(-22, -8, 1.6 + Math.abs(Math.sin(now / 280)) * 1.4, '#e0f9ff');
    } else if (kind === 'stars') {
      for (let i = 0; i < 8; i++) { const a = 0.35 + 0.65 * Math.abs(Math.sin(now / 520 + i * 1.3)); ctx.globalAlpha = a; this.g.ellipse(-12 + (i * 5.3) % 24, -26 + ((i * 7) % 11) - bob, 1 + (i % 3) * 0.45, 1 + (i % 3) * 0.45, '#ffffff'); }
      ctx.globalAlpha = 1; this._sparkle(-4 + Math.sin(now / 700) * 6, -33 - bob, 1.6 + Math.abs(Math.sin(now / 340)), '#fff5b0');
    } else if (kind === 'leaves') {
      g.ellipse(-2, -27.5 - bob, 8, 2.6, 'rgba(60,110,55,.85)'); g.ellipse(2, -28.5 - bob, 4, 1.6, 'rgba(110,160,80,.9)');           // moss on the back
      [[-8, -29], [3, -30], [11, -33]].forEach(([x, y], i) => { ctx.save(); ctx.translate(x, y - bob); ctx.rotate(-0.6 + i * 0.5 + Math.sin(now / 600 + i) * 0.1); g.ellipse(0, -3, 1.9, 4.4, i % 2 ? '#5fae4e' : '#3f8a3c'); ctx.restore(); });
    } else if (kind === 'bubbles') {
      for (let i = 0; i < 4; i++) { const t = ((now / 1800) + i * 0.25) % 1; ctx.strokeStyle = `rgba(210,250,255,${(0.8 * (1 - t)).toFixed(2)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-10 + i * 7 + Math.sin(now / 500 + i) * 2, -14 - t * 26, 1.8 + (i % 2) * 1.2, 0, Math.PI * 2); ctx.stroke(); }
    } else if (kind === 'dust' && moving) {
      for (let i = 0; i < 4; i++) { const t = ((now / 500) + i * 0.25) % 1; this.g.ellipse(-16 - t * 14, -4 - t * 5, 2.4 + t * 3, 1.6 + t * 2, `rgba(225,195,140,${(0.55 * (1 - t)).toFixed(2)})`); }
    } else if (kind === 'frost') {
      for (let i = 0; i < 4; i++) { const t = ((now / 2200) + i * 0.25) % 1; ctx.globalAlpha = 1 - t; this.g.ellipse(-14 + i * 9 + Math.sin(now / 600 + i) * 2, -40 + t * 36, 1.2, 1.2, '#ffffff'); }
      ctx.globalAlpha = 1; this._sparkle(-22, -5 - bob, 1.3 + Math.abs(Math.sin(now / 300)) * 1.2, '#e6f4ff'); this._sparkle(8, -30 - bob, 1.1 + Math.abs(Math.sin(now / 410)), '#ffffff');
    }
  }

  /** Effects drawn on the head: the Blossom pony's flower crown. */
  _headAccessory(kind, now, bob) {
    if (kind !== 'crown') return;
    const g = this.g, ctx = g.ctx, cols = ['#ff7eb6', '#ffffff', '#ffd54f', '#ff9ec7', '#ffffff'];
    [[13.5, -40.5], [16.8, -43.6], [20.6, -43.4], [24, -40.4], [10, -36]].forEach(([x, y, ], i) => {
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4 + now / 3000; g.ellipse(x + Math.cos(a) * 2, y - bob + Math.sin(a) * 2, 1.5, 1.5, cols[i % cols.length]); }
      g.ellipse(x, y - bob, 1.2, 1.2, '#f9a825');
    });
    for (let i = 0; i < 2; i++) { const t = ((now / 2400) + i * 0.5) % 1; ctx.globalAlpha = 1 - t; g.ellipse(14 + i * 9 + Math.sin(now / 500 + i * 3) * 3, -42 - bob + t * 40, 1.8, 1, '#ffb3d1'); }     // drifting petals
    ctx.globalAlpha = 1;
  }

  /** The symbol on a pony's flank. */
  _sparkle(x, y, r, color) {
    const ctx = this.g.ctx;
    ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.beginPath();
    ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 2, y); ctx.lineTo(x + r * 0.5, y + r * 0.5);
    ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * 0.5, y - r * 0.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The symbol on a pony's flank. */
  _cutieMark(kind, x, y, color) {
    const g = this.g, ctx = g.ctx;
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    ctx.beginPath();
    switch (kind) {
      case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2 : 4.4; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
      case 'heart': ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 6, y - 1, x - 3, y - 5, x, y - 2); ctx.bezierCurveTo(x + 3, y - 5, x + 6, y - 1, x, y + 4); ctx.fill(); break;
      case 'flower': for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; ctx.moveTo(x + Math.cos(a) * 3.2 + 1.8, y + Math.sin(a) * 3.2); ctx.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 1.8, 0, Math.PI * 2); } ctx.fill(); g.ellipse(x, y, 1.4, 1.4, '#fff3b0'); break;
      case 'moon': ctx.arc(x, y, 4, 0.5, Math.PI * 2 - 0.5); ctx.arc(x + 1.8, y, 3.2, Math.PI * 2 - 0.9, 0.9, true); ctx.fill(); break;
      case 'cloud': ctx.arc(x - 2.4, y + 1, 2.2, 0, Math.PI * 2); ctx.arc(x + 0.4, y - 0.8, 2.8, 0, Math.PI * 2); ctx.arc(x + 3, y + 1, 2.2, 0, Math.PI * 2); ctx.fill(); break;
      case 'apple': ctx.arc(x, y + 1, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3f7a3a'; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 1.5, y - 4.5); ctx.stroke(); break;
      case 'leaf': ctx.moveTo(x - 4, y + 3); ctx.quadraticCurveTo(x - 3, y - 4, x + 4, y - 4); ctx.quadraticCurveTo(x + 3, y + 3, x - 4, y + 3); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x + 2, y - 2.5); ctx.stroke(); break;
      case 'sun': ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4); ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); } ctx.stroke(); break;
      case 'flame': ctx.moveTo(x, y - 5); ctx.bezierCurveTo(x + 4, y - 1, x + 4.5, y + 3, x, y + 4.5); ctx.bezierCurveTo(x - 4.5, y + 3, x - 3, y - 1, x, y - 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 1.3, 2, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'snow': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.moveTo(x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4); ctx.lineTo(x - Math.cos(a) * 4.4, y - Math.sin(a) * 4.4); } ctx.stroke(); break;
      case 'gem': ctx.moveTo(x - 4, y - 1); ctx.lineTo(x - 2, y - 4); ctx.lineTo(x + 2, y - 4); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x, y + 4.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y - 1); ctx.moveTo(x - 2, y - 4); ctx.lineTo(x, y + 4.5); ctx.moveTo(x + 2, y - 4); ctx.lineTo(x, y + 4.5); ctx.stroke(); break;
      case 'drop': ctx.moveTo(x, y - 4.5); ctx.bezierCurveTo(x + 4.5, y + 1, x + 3, y + 4.5, x, y + 4.5); ctx.bezierCurveTo(x - 3, y + 4.5, x - 4.5, y + 1, x, y - 4.5); ctx.fill(); break;
      default: ctx.arc(x - 1.8, y + 2.4, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 0.2, y + 2.2); ctx.lineTo(x - 0.2, y - 4.5); ctx.lineTo(x + 3, y - 3); ctx.stroke();   // a music note
    }
  }

}

/** A world facing angle that shows each screen direction (for portraits and the editor's previews). */
const FACING_FOR_DIR = Object.freeze({ right: Math.PI / 4 - Math.PI / 2, left: Math.PI * 3 / 4, up: -Math.PI * 3 / 4, down: Math.PI / 4 });

/** Draws one animal into a small canvas (the Pony Book portraits, the editor). `dir` picks the screen direction. */
function renderAnimalPortrait(canvas, type, look, dir = 'right', opts = {}) {
  const ctx = canvas.getContext('2d'), sprite = new AnimalSprite(new Gfx(ctx));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.height / 70;
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - 2 * scale, canvas.height - 6 * scale);
  const facing = dir === 'right' ? 0 : FACING_FOR_DIR[dir];
  if (dir === 'up' || dir === 'down') sprite.state.portrait = { phase: 0, last: 1234, flip: 1 };          // (front / back views stand in as the profile facing right)
  sprite.draw({ type, look, facing, vx: 0, vy: 0, owner: '', state: 'idle' }, 'portrait', 0, 0, 1234, null, opts);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
