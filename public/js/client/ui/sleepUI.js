'use strict';
/* CLIENT - asleep: the screen dims under a "Zzz" and says how to get up (you wake by yourself once your energy is full). Everything else is decided by the server (sleepSystem.js). */
class SleepUI {
  constructor({ game }) {
    this.game = game; this.shown = '';
    const el = this.root = document.createElement('div');
    el.id = 'sleepOverlay'; el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="slZ">Zzz</div><div class="slText"></div>';
    document.body.appendChild(el);
    this.text = el.querySelector('.slText');
  }

  update() {
    const p = this.game.local, asleep = !!(p && p.asleep);
    const text = !asleep ? '' : `${p.camping ? 'Camping' : 'Resting'}: energy ${Math.round(p.energy)}% \u00B7 press E to get up`;
    if (text === this.shown) return;
    this.shown = text;
    this.root.classList.toggle('on', asleep);
    if (text) this.text.textContent = text;
  }
}
