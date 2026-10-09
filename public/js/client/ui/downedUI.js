'use strict';
/* CLIENT - down on your knees in a dungeon: the view darkens from the edges, with the seconds left and how
 * to hurry. Everything else is decided by the server (downed.js). */
class DownedUI {
  constructor({ game }) {
    this.game = game; this.shown = '';
    const el = this.root = document.createElement('div');
    el.id = 'downedOverlay'; el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="dnTitle">You are down</div><div class="dnTime"></div><div class="dnHint"></div><div class="dnBar"><i></i></div>';
    document.body.appendChild(el);
    this.time = el.querySelector('.dnTime'); this.hint = el.querySelector('.dnHint'); this.fill = el.querySelector('.dnBar i');
  }

  update() {
    const p = this.game.local, down = !!(p && p.down > 0);
    const text = !down ? '' : `${Math.ceil(p.down)}|${p.downHp > 0 ? Math.round(p.downHp) : 0}|${Math.round(100 * p.down / (p.downMax || 1))}`;
    if (text === this.shown) return;
    this.shown = text;
    this.root.classList.toggle('on', down);
    if (!down) return;
    this.time.textContent = `Getting up in ${Math.ceil(p.down)}s`;
    this.hint.textContent = p.downHp > 0 ? `Resting: you will get up with ${Math.round(Math.max(p.downHp, p.maxHp * Downed.rules().reviveFraction))} hp` : 'Eat a snack to get up sooner, or wait for a friend to pick you up';
    this.fill.style.width = (100 - 100 * p.down / (p.downMax || 1)) + '%';
  }
}
