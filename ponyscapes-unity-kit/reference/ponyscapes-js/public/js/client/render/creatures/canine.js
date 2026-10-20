'use strict';
/* CLIENT - creature sprite: the dog family and cats. sprite.variant = 'dog' | 'fox' | 'wolf' | 'cat' | 'panther'. They differ in size, colours, ears, snout and tail. */
CreatureSprites.register({
  id: 'canine',
  draw(s, { phase, speed, now, sprite, seed, hunting }) {
    const g = s.g, ctx = g.ctx, v = sprite.variant || 'dog', walk = speed > 0.2, swing = walk ? Math.sin(phase) * 3.4 : 0;
    const P = {
      dog:  { k: 1.0,  body: '#c49a62', belly: '#e4cfa6', leg: '#a9814d', ear: 'floppy', snout: 3.4, tail: 'up',   tip: null,       nose: '#2a1c14' },
      fox:  { k: 0.95, body: '#d9742b', belly: '#f6efe2', leg: '#3a2a22', ear: 'point',  snout: 4.4, tail: 'bush', tip: '#f6efe2',  nose: '#1a1410' },
      wolf: { k: 1.25, body: '#8b8f96', belly: '#c9ccd1', leg: '#6b6f76', ear: 'point',  snout: 4.8, tail: 'low',  tip: null,       nose: '#1a1410' },
      cat:  { k: 0.72, body: '#9a9a9a', belly: '#e8e4dc', leg: '#808080', ear: 'point',  snout: 2,   tail: 'curl', tip: null,       nose: '#d98a8a' },
      panther: { k: 1.2, body: '#25222b', belly: '#34303b', leg: '#1d1a22', ear: 'point', snout: 2,  tail: 'curl', tip: null,       nose: '#4a4450' }
    }[v], k = P.k, bob = walk ? Math.abs(Math.sin(phase)) * 0.8 : Math.sin(now / 800 + seed) * 0.4;
    g.ellipse(0, 2.5, 13 * k, 4.4 * k, 'rgba(0,0,0,.25)');
    ctx.strokeStyle = P.leg; ctx.lineWidth = 2.6 * k; ctx.beginPath();                                       // four legs
    [[-7, swing], [-3.5, -swing], [4, -swing], [7.5, swing]].forEach(([x, w]) => { ctx.moveTo(x * k, -7 * k); ctx.lineTo((x + w) * k, 0); }); ctx.stroke();
    const wag = Math.sin(now / (v === 'dog' ? 110 : 400) + seed) * 3;                                       // tail
    ctx.strokeStyle = P.body; ctx.lineWidth = (P.tail === 'bush' ? 5 : 2.6) * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-11 * k, (-11 - bob) * k);
    if (P.tail === 'up') ctx.quadraticCurveTo(-16 * k, (-17 + wag * 0.3) * k, (-14 + wag * 0.4) * k, -20 * k);
    else if (P.tail === 'bush') ctx.quadraticCurveTo(-17 * k, -8 * k, -19 * k, (-5 + wag * 0.2) * k);
    else if (P.tail === 'low') ctx.quadraticCurveTo(-15 * k, -8 * k, -16 * k, -3 * k);
    else ctx.bezierCurveTo(-16 * k, (-14 + wag) * k, -12 * k, -22 * k, -17 * k, -21 * k);                    // cat: a curling tail
    ctx.stroke(); ctx.lineCap = 'butt';
    if (P.tip) g.ellipse(-19 * k, -5 * k, 2.6 * k, 2.4 * k, P.tip);
    g.ellipse(-1 * k, (-11 - bob) * k, 11.5 * k, 6 * k, P.body); g.ellipse(1 * k, (-8.4 - bob) * k, 8 * k, 3 * k, P.belly);   // body + belly
    if (v === 'wolf') g.ellipse(4 * k, (-15.5 - bob) * k, 7 * k, 2.4 * k, '#6b6f76');                           // a darker ruff on the back
    const hx = 11 * k, hy = (-14 - bob) * k;
    g.ellipse(hx, hy, 5.4 * k, 4.8 * k, P.body); g.ellipse(hx + P.snout * k * 0.7, hy + 1.4 * k, (P.snout + 1) * k * 0.8, 2.5 * k, P.belly);   // head + muzzle
    g.ellipse(hx + (P.snout + 2.4) * k, hy + 0.8 * k, 1.4 * k, 1.2 * k, P.nose);
    if (P.ear === 'floppy') { g.ellipse(hx - 2.6 * k, hy - 1 * k, 2 * k, 4 * k, '#8c6a3c'); }
    else { g.polygon([hx - 3.6 * k, hy - 3 * k, hx - 2.4 * k, hy - 9.5 * k, hx - 0.2 * k, hy - 3.6 * k], P.body); g.polygon([hx - 0.6 * k, hy - 3.8 * k, hx + 1.4 * k, hy - 9.5 * k, hx + 3 * k, hy - 3 * k], P.body); g.polygon([hx - 2.4 * k, hy - 4 * k, hx - 2.3 * k, hy - 7.6 * k, hx - 0.9 * k, hy - 4.2 * k], '#e8b3b3'); }
    g.ellipse(hx + 2 * k, hy - 0.8 * k, 0.9 * k, 1.1 * k, hunting ? '#ff4d4d' : '#1a1410');                    // eye (a hunter's glows red)
    if (v === 'cat') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (const dy of [0.6, 1.8]) { ctx.moveTo(hx + 4 * k, hy + dy * k); ctx.lineTo(hx + 8 * k, hy + (dy - 0.8) * k); } ctx.stroke(); }   // whiskers
  }
});
