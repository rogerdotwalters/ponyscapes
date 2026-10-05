'use strict';
/* CLIENT - the "Let go?" confirmation. Letting go of a wild pony you caught loses it, so the game always asks first.
 * The safe answer is the big one: "Keep it". Tapping outside the window or pressing Esc also keeps it. */
class ConfirmUI {
  /** @param {{panel, title, text, keepButton, goButton, game, requestOpen:()=>void}} opts */
  constructor({ panel, title, text, keepButton, goButton, game, requestOpen }) {
    Object.assign(this, { panel, title, text, game, requestOpen, keepButton, goButton }); this.animalId = ''; this.kind = 'release'; this.onGo = null;
    keepButton.addEventListener('click', () => this.close());
    goButton.addEventListener('click', () => {
      const id = this.animalId, onGo = this.onGo, kind = this.kind;
      this.close();
      if (kind === 'custom') { if (onGo) onGo(); } else if (id) this.game.confirmRelease(id);
    });
  }
  get isOpen() { return !this.panel.hidden; }
  /** @param {{id, name, need}} what */
  /** Any yes/no question: { title, text, goLabel, keepLabel, onGo }. The safe answer (keepLabel) is the big green button. */
  askCustom({ title, text, goLabel = 'OK', keepLabel = 'Cancel', onGo }) {
    this.requestOpen();
    this.kind = 'custom'; this.onGo = onGo; this.animalId = '';
    this.title.textContent = title; this.text.textContent = text; this.goButton.textContent = goLabel; this.keepButton.textContent = keepLabel;
  }
  ask({ id, name, need }) {
    this.requestOpen();
    this.kind = 'release'; this.onGo = null; this.goButton.textContent = 'Let go'; this.keepButton.textContent = 'Keep it';                                  // (opening closes every panel, this one included: so fill in the details AFTER)
    this.animalId = id;
    this.title.textContent = `Let ${name} go?`;
    this.text.textContent = `${name} is still wild. If you let go it will bolt and you will have to catch it all over again.` +
      (need ? ` Lead it to a stable and feed it ${need} apples to keep it.` : '');
  }
  open() { this.panel.hidden = false; }
  close() { this.panel.hidden = true; this.animalId = ''; if (this.kind === 'custom') this.onGo = null; }
}
