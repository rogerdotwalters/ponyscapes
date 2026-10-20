'use strict';
/* CLIENT - the thought bubble over a creature that wants something (wantSystem.js): the item's icon, and for a boss how many it still needs
 * ("1/3"). It bobs gently; when you hold what it wants, it glows so you know the interact key will give it. */
const WantBubble = {
  draw(ctx, x, y, item, count, now, ready) {
    if (typeof ctx.cut === 'function') ctx.cut();                                  // (the Pixi backend: the bubble is a picture of its own)
    const img = ItemIcons.image(item), bob = Math.sin(now / 380 + x * 0.05) * 1.6, w = count ? 46 : 30, h = 26, top = y - h - 6 + bob;
    ctx.save();
    if (ready) { ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = 10 + 4 * Math.sin(now / 160); }
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 8, top); ctx.arcTo(x + w / 2, top, x + w / 2, top + h, 9); ctx.arcTo(x + w / 2, top + h, x - w / 2, top + h, 9);
    ctx.arcTo(x - w / 2, top + h, x - w / 2, top, 9); ctx.arcTo(x - w / 2, top, x + w / 2, top, 9); ctx.closePath();
    ctx.fillStyle = 'rgba(255,252,240,.95)'; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.strokeStyle = ready ? '#d9a63a' : 'rgba(60,40,20,.65)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,252,240,.95)';                                       // the little thought puffs leading down to its head
    for (const [dx, dy, r] of [[-3, h + 5, 3], [-6, h + 10, 2]]) { ctx.beginPath(); ctx.arc(x + dx, top + dy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (img) ctx.drawImage(img, x - w / 2 + 4, top + 2, 22, 22);
    if (count) { ctx.fillStyle = '#3a2a18'; ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(count, x - w / 2 + 27, top + h / 2 + 0.5); }
    ctx.restore();
    if (typeof ctx.cut === 'function') ctx.cut();
  }
};
