'use strict';
/* CLIENT - the Coin Poster window (opened at the poster on your home's wall, shared/ponyPoster.js): a parchment board with a slot for the collector coin of
 * every pony variety (pony coins are dropped by wild ponies when you lasso them, data/items/ponyCoins.js). Opening it also opens your COIN BAG beside it
 * (as the shop does), where the pony coins you carry tumble about with the money: DRAG one out of the bag and let go over the poster to pin it in its own
 * slot (a tap on the poster does nothing). The server decides (ponyPoster.js). Pony coins are ordinary bag items too: they take a bag slot. */
class PosterUI {
  constructor({ panel, body, closeButton, game, coinBag }) {
    this.panel = panel; this.body = body; this.game = game; this.coinBag = coinBag; this.grid = '';
    closeButton.addEventListener('click', () => this.close());
    game.events.on('varietiesChanged', () => this.isOpen && this._refreshSoon());
    game.events.on('posterCoin', () => this.isOpen && this.refresh());
  }
  get isOpen() { return !this.panel.hidden; }
  open() {
    this.panel.hidden = false; this.panel.classList.add('posting'); this.grid = this.game.grid; this.refresh();
    this.coinBag.startPoster({ zone: this.panel, onClose: () => this.close() });
  }
  close() {
    if (this.panel.hidden) return;
    this.panel.hidden = true; this.panel.classList.remove('posting');
    this.coinBag.endPoster(); this.coinBag.close();
  }
  _refreshSoon() {
    const sig = JSON.stringify((this.game.varieties || []).map(v => v.coin ? 1 : 0));
    if (sig !== this.sig) this.refresh();
  }
  /** Walked out of the house: close. */
  tick() { if (this.isOpen && this.game.grid !== this.grid) this.close(); }

  refresh() {
    const placed = new Set((this.game.varieties || []).filter(v => v.coin).map(v => v.id));
    this.sig = JSON.stringify((this.game.varieties || []).map(v => v.coin ? 1 : 0));
    const names = Object.fromEntries(PonyVariantTable.all().map(v => [v.id, v.name]));
    const slots = PonyCoins.ids.map(id => `<div class="pslot${placed.has(id) ? ' have' : ''}" data-v="${id}"><canvas width="48" height="48"></canvas>${names[id]}</div>`).join('');
    this.body.innerHTML = `<div id="posterBoard">${slots}</div><div id="posterHint">${placed.size} of ${PonyCoins.ids.length} coins pinned. Drag a pony coin out of your coin bag onto this poster.</div>`;
    this.body.querySelectorAll('.pslot canvas').forEach(cv => {
      const g = cv.getContext('2d'), id = cv.parentElement.dataset.v; g.imageSmoothingEnabled = false;
      if (placed.has(id)) CoinArt.draw(g, 24, 25, 19, 0.9, { pony: id });
      else { g.fillStyle = 'rgba(29,18,10,0.5)'; for (let j = -19; j <= 19; j++) { const w = Math.round(Math.sqrt(361 - j * j)); g.fillRect(24 - w, 24 + j, w * 2 + 1, 1); } g.fillStyle = 'rgba(90,70,45,0.35)'; for (let j = -17; j <= 17; j++) { const w = Math.round(Math.sqrt(289 - j * j)); g.fillRect(24 - w, 24 + j, w * 2 + 1, 1); } }
    });
  }
}
