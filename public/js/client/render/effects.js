'use strict';
/* CLIENT - purely visual feedback driven by server events: wood chips, falling leaves, floating "+2 Log", tree shake. */
const SHAKE_MS = 320, SHAKE_PIXELS = 5;
const CHIP_COLORS = ['#c9a06a', '#8a5a33', '#b58a55'], LEAF_COLORS = ['#468a40', '#5ea24a', '#3f7a3a'], DUST_COLORS = ['#d8cfb8', '#b9ae92', '#e9e2d0'], GOLD_COLORS = ['#ffe08a', '#ffc94a', '#fff2c2'], HEART_COLORS = ['#ff7ab6', '#ffd1e8', '#ff9ec7', '#fff3b0'], FUR_COLORS = ['#e8dcc4', '#b79a72', '#8d6a45'], SPLASH_COLORS = ['#e8f6ff', '#9fd0f2', '#5aa6dc'];

class Effects {
  constructor(bus, game) {
    this.game = game; this.arrows = []; this.ropes = []; this.particles = []; this.floaters = []; this.shakeStart = {};
    game.events.on('chop', e => this._onChop(e));
    game.events.on('fell', e => this._onFell(e));
    game.events.on('gain', e => this._onGain(e));
    game.events.on('pick', e => this._burst(e.x, e.y, 9, e.prop === 'stone' ? DUST_COLORS : LEAF_COLORS, 12));
    game.events.on('eat', e => this._float(e, `Yum! +${e.hunger} hunger`));
    game.events.on('drink', e => this._float(e, `+${e.thirst} thirst`));
    game.events.on('fill', e => this._float(e, 'Jug filled'));
    game.events.on('arrow', e => this.arrows.push({ x0: isoX(e.x0, e.y0), y0: isoY(e.x0, e.y0) - 24, x1: isoX(e.x1, e.y1), y1: isoY(e.x1, e.y1) - 14, age: 0 }));
    game.events.on('fish', e => { this._burst(e.x, e.y, 10, SPLASH_COLORS, 6); this._float(e, 'Caught a fish!'); });
    game.events.on('hurt', e => this._float(e, `-${e.amount} hp`));
    game.events.on('died', e => this._float(e, 'Knocked out! Back at the village'));
    game.events.on('loot', e => this._float(e, 'Chest opened!'));
    game.events.on('tradeDone', e => this._float(e, 'Trade complete'));
    game.events.on('bite', e => this._burst(e.x, e.y, 8, ['#4a3a5a', '#2b2233', '#a24a4a'], 12));
    game.events.on('friend', ev => {                                                                           // hearts pop up when you make friends (a colour burst when you level up)
      const info = Friendship.info(ev.level), up = ev.up, loss = ev.gain < 0;
      this._float(ev, up ? `${info.name}!` : loss ? `\u2665 ${ev.gain}` : `\u2665 +${ev.gain}`);
      this._burst(ev.x, ev.y, up ? 24 : loss ? 4 : 8, loss ? ['#9aa7b5'] : up ? [info.color, '#ffffff', info.color] : [info.color, '#ffd6e8'], up ? 30 : 24);
    });
    game.events.on('fly', ev => this._burst(ev.x, ev.y, 12, ['#ffffff', '#bfe8ff', '#fff2b0'], 14));            // feathers and sparkles at take-off
    game.events.on('landed', ev => this._burst(ev.x, ev.y, 9, ['#d8cba8', '#efe6cc', '#b9ad8a'], 6));          // a puff of dust on landing
    game.events.on('breath', e => { for (let i = 0; i < 4; i++) this._burst(e.x + (e.tx - e.x) * (0.25 + i * 0.22), e.y + (e.ty - e.y) * (0.25 + i * 0.22), 5, ['#ff9a2a', '#ffd24a', '#ff5a1a'], 10); });
    game.events.on('hit', e => this._burst(e.x, e.y, 7, FUR_COLORS, 14));
    game.events.on('kill', e => this._burst(e.x, e.y, 16, FUR_COLORS, 14));
    game.events.on('tamed', e => { this._burst(e.x, e.y, 14, HEART_COLORS, 26); this._float(e, `Tamed ${this._petName(e)}!`); });
    game.events.on('untied', e => this._float(e, 'Untied'));
    game.events.on('carried', e => { this._burst(e.x, e.y, 6, HEART_COLORS, 12); this._float(e, 'Picked up'); });
    game.events.on('released', e => { this._burst(e.x, e.y, 8, HEART_COLORS, 12); this._float(e, 'Released'); });
    game.events.on('lasso', e => this.ropes.push({ x0: isoX(e.x0, e.y0), y0: isoY(e.x0, e.y0) - 22, x1: isoX(e.x1, e.y1), y1: isoY(e.x1, e.y1) - 16, hit: e.hit, age: 0 }));
    game.events.on('caught', e => this._burst(e.x, e.y, 12, HEART_COLORS, 24));        // (the server's notice already says what to do next)
    game.events.on('fed', e => { this._burst(e.x, e.y, 10, HEART_COLORS, 26); this._float(e, `Apple ${e.have}/${e.need}`); });
    game.events.on('letGo', e => { this._burst(e.x, e.y, 8, DUST_COLORS, 12); this._float(e, 'It ran off'); });
    game.events.on('brokeFree', e => { this._burst(e.x, e.y, 10, DUST_COLORS, 12); this._float(e, 'It broke free!'); });
    game.events.on('xp', e => this._float(e, `+${e.amount} ${SkillDefs[e.skill].name} XP`, 'xp'));
    game.events.on('levelup', e => { this._float(e, `${e.name} level ${e.level}!`, 'levelup'); this._burst(this.game.local.x, this.game.local.y, 14, GOLD_COLORS, 40); });
    game.events.on('treasure', e => { this._burst(e.x, e.y, 30, GOLD_COLORS, 22); this._float(e, 'Treasure!', 'levelup'); });
    game.events.on('opened', e => this._float(e, 'The bottle holds a map'));
    game.events.on('mapAdded', e => this._float(e, e.kind === 'dungeon' ? `A cave in ${e.ringName} is marked on your map` : 'Map added to your journal'));
    game.events.on('mounted', e => this._float(e, 'Giddy up!'));
    game.events.on('ponyLevel', e => this._burst(e.x, e.y, 22, GOLD_COLORS, 34));                      // (the notice says the new level and speed)
    game.events.on('groomed', e => { this._burst(e.x, e.y, 10, ['#fff6d8', '#ffd1e8', '#e8dcc4'], 20); this._float(e, `${e.name} looks lovely`); });
    game.events.on('dropped', e => { const def = ItemDB.get(e.item); this._float(e, `Dropped ${e.count} ${def ? def.name : e.item}`); });
    game.events.on('destroyed', e => { const def = ItemDB.get(e.item); this._float(e, `Destroyed ${e.count} ${def ? def.name : e.item}`); });
    game.events.on('built', e => this._onBuilt(e));
    game.events.on('demolished', e => this._onBuilt(e, true));
    game.events.on('notice', e => this._float(e, e.text));
    game.events.on('ability', e => this._onAbility(e));
    game.events.on('deposit', e => { this._burst(e.x, e.y, 10, DUST_COLORS, 16); this._float(e, 'Delivered ' + Object.entries(e.moved).map(([item, n]) => `${n} ${ItemDefs[item] ? ItemDefs[item].name : item}`).join(', ') + (e.full ? ' (now full)' : '')); });
    game.events.on('upgraded', e => { this._burst(e.tx + 0.5, e.ty + 0.5, 22, GOLD_COLORS, 30); if (e.by === this.game.myId) this._float({ to: e.by }, `${e.name} is now level ${e.level}!`, 'levelup'); });
  }

  /** A pony ability: a jet of fire, a ring of frost, a puff of dust behind a dash. */
  _onAbility(e) {
    const ability = AbilityDefs[e.ability];
    if (!ability) return;
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing), colors = { flame_breath: ['#ff7a1a', '#ffb34a', '#ffe08a', '#d6331a'], frost_nova: ['#9fe3ff', '#d6f4ff', '#ffffff', '#6fc3ff'], dash: DUST_COLORS }[e.ability] || GOLD_COLORS;
    if (e.ability === 'flame_breath') for (let d = 0.8; d <= 3.2; d += 0.6) this._burst(e.x + fx * d, e.y + fy * d, 6, colors, 26 - d * 2);
    else if (e.ability === 'frost_nova') for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this._burst(e.x + Math.cos(a) * 2.4, e.y + Math.sin(a) * 2.4, 3, colors, 10); }
    else this._burst(e.x - fx * 0.6, e.y - fy * 0.6, 12, colors, 6);
    if (e.by === this.game.myId) this._float({ to: e.by }, ability.glyph + ' ' + ability.name);
  }

  treeShakeX(treeIndex, now) {
    const age = now - (this.shakeStart[treeIndex] || -Infinity);
    return age < SHAKE_MS ? Math.sin(age * 0.06) * SHAKE_PIXELS * (1 - age / SHAKE_MS) : 0;
  }

  _petName(e) {
    const a = this.game.latestAnimals()[e.id], def = AnimalDefs[e.animal];
    return a && a.look ? PonyLook.describe(a.look).name : (def ? def.name : 'it');
  }

  _onChop(e) { this.shakeStart[e.key] = performance.now(); this._burst(e.x, e.y, 7, CHIP_COLORS, 34); }
  _onFell(e) { this._burst(e.x, e.y, 20, LEAF_COLORS, 70); this._burst(e.x, e.y, 8, CHIP_COLORS, 14); }
  _onBuilt(e, demolished) { this._burst(e.tx + 0.5, e.ty + 0.5, demolished ? 12 : 9, demolished ? CHIP_COLORS : DUST_COLORS, 22); }
  _onGain(e) { const def = ItemDB.get(e.item); this._float(e, `+${e.count} ${def ? def.name : e.item}`); }

  /** Floating text above the local player, only for events addressed to us. */
  _float(e, text, style = '') {
    if (e.to !== this.game.myId) return;
    const me = this.game.local;
    const stacked = this.floaters.filter(f => f.age < 0.6).length;          // stack messages that arrive together
    this.floaters.push({ x: isoX(me.x, me.y), y: isoY(me.x, me.y) - 62 - stacked * 18, age: 0, text, style });
  }

  _burst(worldX, worldY, count, colors, height) {
    const x = isoX(worldX, worldY), y = isoY(worldX, worldY) - height;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 90, age: 0, life: 0.5 + Math.random() * 0.4,
        size: 2 + Math.random() * 2.5, color: colors[(Math.random() * colors.length) | 0]
      });
    }
  }

  draw(g, frameMs) {
    const ctx = g.ctx, dt = frameMs / 1000;
    this.particles = this.particles.filter(p => (p.age += dt) < p.life);
    for (const p of this.particles) {
      p.vy += 320 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.arrows = this.arrows.filter(a => (a.age += dt) < 0.28);          // an arrow in flight: a short bright streak
    for (const a of this.arrows) {
      const t = Math.min(1, a.age / 0.18), hx = a.x0 + (a.x1 - a.x0) * t, hy = a.y0 + (a.y1 - a.y0) * t, tx = a.x0 + (a.x1 - a.x0) * Math.max(0, t - 0.25), ty = a.y0 + (a.y1 - a.y0) * Math.max(0, t - 0.25);
      ctx.strokeStyle = 'rgba(255,245,210,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    }
    this.ropes = this.ropes.filter(r => (r.age += dt) < 0.7);                                       // a thrown lasso: a rope flying out with a loop that closes on a catch
    for (const r of this.ropes) {
      const t = Math.min(1, r.age / 0.28), x = r.x0 + (r.x1 - r.x0) * t, y = r.y0 + (r.y1 - r.y0) * t - Math.sin(t * Math.PI) * 14;
      ctx.strokeStyle = '#d8b66a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.quadraticCurveTo((r.x0 + x) / 2, Math.min(r.y0, y) - 10 + (1 - t) * 10, x, y); ctx.stroke();
      const loop = r.hit && r.age > 0.28 ? Math.max(3, 11 - (r.age - 0.28) * 30) : 11;                 // the loop tightens round the neck
      ctx.strokeStyle = r.hit ? '#f0d58a' : '#b9a06a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(x, y, loop, loop * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
    this.floaters = this.floaters.filter(f => (f.age += dt) < (f.style === 'levelup' ? 2.4 : 1.4));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const life = f.style === 'levelup' ? 2.4 : 1.4;
      ctx.font = f.style === 'levelup' ? 'bold 20px Georgia, serif' : f.style === 'xp' ? '600 11px Georgia, serif' : 'bold 14px Georgia, serif';
      ctx.globalAlpha = Math.min(1, (life - f.age) * 2);
      const y = f.y - f.age * (f.style === 'levelup' ? 18 : 26);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,18,28,.8)'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.style === 'levelup' ? '#ffd24a' : f.style === 'xp' ? '#bfe3ff' : '#ffe9a8'; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
