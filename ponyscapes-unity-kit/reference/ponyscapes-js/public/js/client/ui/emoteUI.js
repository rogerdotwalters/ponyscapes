'use strict';
/* CLIENT - the emote wheel. The round emote button in the middle of the bottom bar opens a ring of bubbles; pick one and it
 * pops up above your head for everyone nearby. The middle of the wheel is a shortcut to trade with the nearest player. */
class EmoteWheelUI {
  constructor({ root, button, game, onTrade }) {
    this.root = root; this.game = game; this.onTrade = onTrade;
    button.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.toggle(); });
    root.addEventListener('pointerdown', e => { if (e.target === root) { e.preventDefault(); this.close(); } });
    this._build();
  }
  get isOpen() { return !this.root.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this._layout(); this.root.hidden = false; }
  close() { this.root.hidden = true; }

  _build() {
    this.root.innerHTML = '';
    this.items = EmoteDefs.map(def => {
      const b = document.createElement('button');
      b.className = 'ebubble'; b.textContent = def.glyph; b.title = def.name;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.game.emote(def.id); this.close(); });
      this.root.appendChild(b); return b;
    });
    this.tradeButton = document.createElement('button');
    this.tradeButton.className = 'ebubble etrade'; this.tradeButton.textContent = 'Trade';
    this.tradeButton.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.close(); this.onTrade(); });
    this.root.appendChild(this.tradeButton);
  }

  /** Bubbles on a ring around the middle of the screen, sized to fit it. */
  _layout() {
    const w = window.innerWidth, h = window.innerHeight, size = clamp(Math.min(w, h) / 7, 38, 56);
    const radius = Math.min(size * 2.0, Math.min(w, h) / 2 - size * 0.7), cx = w / 2, cy = h / 2;
    this.items.forEach((b, i) => {
      const a = -Math.PI / 2 + i / this.items.length * Math.PI * 2;
      Object.assign(b.style, { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.55) + 'px', left: (cx + Math.cos(a) * radius - size / 2) + 'px', top: (cy + Math.sin(a) * radius - size / 2) + 'px' });
    });
    Object.assign(this.tradeButton.style, { width: size * 1.1 + 'px', height: size * 1.1 + 'px', fontSize: Math.round(size * 0.28) + 'px', left: (cx - size * 0.55) + 'px', top: (cy - size * 0.55) + 'px' });
  }
}
