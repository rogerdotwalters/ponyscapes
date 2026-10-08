'use strict';
/* CLIENT - the look of quests in the world: the gold "!" over a villager who has a quest to give, the silver "?" over one a quest is waiting on,
 * and the puzzle nodes themselves (a humming rune stone, a stone dial ring, a cracked tablet). A node glows while a quest is asking for it. */
const QuestSprites = {
  /** The mark over a head. kind: '!' | '?'. (x, y) is the point just above the head. */
  marker(ctx, x, y, kind, now) {
    if (typeof ctx.cut === 'function') ctx.cut();                                   // (the Pixi backend: drawn as a picture of its own)
    const bob = Math.sin(now / 300 + x * 0.03) * 2.2, cy = y - 10 + bob, gold = kind === '!';
    ctx.save();
    ctx.shadowColor = gold ? '#ffd24a' : '#bfe4ff'; ctx.shadowBlur = 8 + 3 * Math.sin(now / 200);
    ctx.beginPath(); ctx.arc(x, cy, 9, 0, Math.PI * 2); ctx.fillStyle = gold ? '#f6c640' : '#cfe7f7'; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.6; ctx.strokeStyle = gold ? '#8a5a12' : '#52728a'; ctx.stroke();
    ctx.fillStyle = gold ? '#4a2c06' : '#23394a'; ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind, x, cy + 0.5);
    ctx.restore();
    if (typeof ctx.cut === 'function') ctx.cut();
  },

  /** A puzzle node standing at (gx, gy) on the ground. `awake`: a quest wants it right now. */
  node(ctx, gx, gy, node, awake, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 420), glow = awake ? 0.45 + 0.4 * pulse : 0.12;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(gx, gy, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (node.look === 'rune') {                                                     // a tall standing stone with a glowing rune
      ctx.fillStyle = '#7d8590'; ctx.beginPath(); ctx.moveTo(gx - 13, gy); ctx.lineTo(gx - 9, gy - 44); ctx.lineTo(gx - 1, gy - 52); ctx.lineTo(gx + 9, gy - 45); ctx.lineTo(gx + 13, gy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9aa2ad'; ctx.beginPath(); ctx.moveTo(gx - 1, gy - 52); ctx.lineTo(gx + 9, gy - 45); ctx.lineTo(gx + 13, gy); ctx.lineTo(gx + 2, gy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(150,235,255,${glow.toFixed(2)})`; ctx.lineWidth = 2.4; ctx.shadowColor = '#8fe6ff'; ctx.shadowBlur = awake ? 12 : 3;
      ctx.beginPath(); ctx.moveTo(gx - 4, gy - 36); ctx.lineTo(gx + 3, gy - 28); ctx.lineTo(gx - 3, gy - 22); ctx.lineTo(gx + 4, gy - 12); ctx.stroke();
    } else if (node.look === 'dial') {                                              // a flat ring of rune stones with a gem at the centre
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, px = gx + Math.cos(a) * 17, py = gy - 2 + Math.sin(a) * 8;
        ctx.fillStyle = '#868e99'; ctx.fillRect(px - 3, py - 9, 6, 10);
        ctx.fillStyle = `rgba(255,214,120,${(glow * (0.6 + 0.4 * Math.sin(now / 300 + i))).toFixed(2)})`; ctx.fillRect(px - 1.5, py - 7, 3, 3);
      }
      ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = awake ? 14 : 3; ctx.fillStyle = `rgba(255,215,106,${(0.35 + glow).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(gx, gy - 14); ctx.lineTo(gx + 5, gy - 6); ctx.lineTo(gx, gy + 1); ctx.lineTo(gx - 5, gy - 6); ctx.closePath(); ctx.fill();
    } else {                                                                        // a cracked slab leaning on the ground
      ctx.fillStyle = '#8d939b'; ctx.beginPath(); ctx.moveTo(gx - 20, gy); ctx.lineTo(gx - 18, gy - 36); ctx.lineTo(gx + 18, gy - 42); ctx.lineTo(gx + 20, gy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6e747c'; ctx.fillRect(gx - 20, gy - 4, 40, 4);
      ctx.strokeStyle = '#3f444b'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(gx - 18, gy - 36); ctx.lineTo(gx - 3, gy - 22); ctx.lineTo(gx - 9, gy - 12); ctx.lineTo(gx + 2, gy - 4); ctx.stroke();
      ctx.shadowColor = '#a8ff9c'; ctx.shadowBlur = awake ? 12 : 2; ctx.strokeStyle = `rgba(168,255,156,${(glow + 0.1).toFixed(2)})`; ctx.lineWidth = 2.4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(gx + 4, gy - 34 + i * 9); ctx.lineTo(gx + 14, gy - 35 + i * 9); ctx.stroke(); }
    }
    ctx.restore();
    if (awake) QuestSprites.marker(ctx, gx, gy - (node.look === 'rune' ? 66 : 58), '!', now);
  }
};
