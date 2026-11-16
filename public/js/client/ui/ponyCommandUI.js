'use strict';
/* CLIENT - tap one of your own ponies and a small bar appears above the tool bar: its name and Follow / Stay buttons (the server does it: serverOwned.js _ponyCmd). It closes after a few
 * seconds, when you walk away from the pony or when the pony is gone. The same buttons are on every pony's card in the Pony Book. */
class PonyCommandUI {
  constructor({ game, bus }) {
    this.game = game; this.id = null; this.until = 0;
    const el = this.root = document.createElement('div');
    el.id = 'ponyCmd'; el.hidden = true;
    el.innerHTML = '<span class="pcName"></span><button data-mode="follow" tabindex="-1">\u{1F43E} Follow</button><button data-mode="stay" tabindex="-1">\u{1F6D1} Stay</button><button data-mode="close" tabindex="-1" aria-label="Close">×</button>';
    document.body.appendChild(el);
    this.name = el.querySelector('.pcName');
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]'); if (!b || !this.id) return;
      if (b.dataset.mode !== 'close') this.game.ponyCmd(this.id, b.dataset.mode);
      this.until = performance.now() + (b.dataset.mode === 'close' ? 0 : 2500);                    // (a moment to see the answer, then it goes)
    });
    el.addEventListener('pointerdown', e => e.stopPropagation());                                   // (a tap on the bar is not a tap on the world behind it)
    bus.on('ponyCommand', id => { this.id = id; this.until = performance.now() + 8000; this.update(); });
    game.events.on('petsChanged', () => this.update());
  }
  /** The pet record of the pony being commanded, or null. */
  pet() { return this.id ? this.game.pets.find(p => p.id === this.id) || null : null; }
  update() {
    const pet = this.pet(), me = this.game.local;
    const away = pet && me ? Math.hypot(pet.x - me.x, pet.y - me.y) > 14 : false;
    const on = !!pet && !pet.stalled && performance.now() < this.until && !away;
    this.root.hidden = !on;
    if (!on) { if (!pet || performance.now() >= this.until) this.id = null; return; }
    this.name.textContent = (pet.look ? PonyLook.describe(pet.look).name : AnimalDefs[pet.type].name) + (pet.follow ? ' · following' : pet.stay ? ' · staying' : '');
    this.root.querySelector('[data-mode=follow]').classList.toggle('on', !!pet.follow);
    this.root.querySelector('[data-mode=stay]').classList.toggle('on', !!pet.stay);
  }
}
