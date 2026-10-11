'use strict';
/* CLIENT - the Coin Poster window (opened at the poster on your home's wall, shared/ponyPoster.js): a parchment board with a slot for the collector coin of
 * every pony variety (pony coins are dropped by wild ponies when you lasso them, data/items/ponyCoins.js). The pony coins you carry sit in a tray under
 * the board: DRAG one onto the poster (or tap it, then tap the poster) and it is pinned in its own slot. The server decides (ponyPoster.js). */
class PosterUI {
  constructor({ panel, body, closeButton, game }) {
    this.panel = panel; this.body = body; this.game = game; this.picked = null; this.grid = '';
    closeButton.addEventListener('click', () => this.close());
    for (const ev of ['inventoryChanged', 'varietiesChanged']) game.events.on(ev, () => this.isOpen && this._refreshSoon());
    game.events.on('posterCoin', () => this.isOpen && this.refresh());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.picked = null; this.grid = this.game.grid; this.refresh(); }
  close() { this.panel.hidden = true; this.picked = null; }
  _coins() {
    const have = [];
    for (const id of PonyCoins.ids) { const n = this.game.inventory.count(PonyCoins.itemOf(id)); if (n > 0) have.push({ id, n }); }
    return have;
  }
  _refreshSoon() {
    const sig = JSON.stringify([this._coins(), (this.game.varieties || []).map(v => v.coin ? 1 : 0)]);
    if (sig !== this.sig) this.refresh();
  }
  /** Walked out of the house: close. */
  tick() { if (this.isOpen && this.game.grid !== this.grid) this.close(); }

  refresh() {
    const placed = new Set((this.game.varieties || []).filter(v => v.coin).map(v => v.id)), have = this._coins();
    this.sig = JSON.stringify([have, (this.game.varieties || []).map(v => v.coin ? 1 : 0)]);
    const names = Object.fromEntries(PonyVariantTable.all().map(v => [v.id, v.name]));
    const slots = PonyCoins.ids.map(id => `<div class="pslot${placed.has(id) ? ' have' : ''}" data-v="${id}"><canvas width="26" height="26"></canvas>${names[id]}</div>`).join('');
    const tray = have.length ? have.map(c => `<div class="pcoin${this.picked === c.id ? ' sel' : ''}" data-v="${c.id}" title="${names[c.id]} Pony Coin"><img alt="" src="${ItemIcons.url(PonyCoins.itemOf(c.id))}">${c.n > 1 ? `<span>${c.n}</span>` : ''}</div>`).join('')
      : '<span class="empty">No pony coins in your bag. Lasso a wild pony and it drops the coin of its kind.</span>';
    this.body.innerHTML = `<div id="posterBoard">${slots}</div><div id="posterHint">${placed.size} of ${PonyCoins.ids.length} coins pinned. Drag a coin from your bag onto the poster.</div><div id="posterTray">${tray}</div>`;
    this.body.querySelectorAll('.pslot canvas').forEach(cv => {
      const g = cv.getContext('2d'), id = cv.parentElement.dataset.v; g.imageSmoothingEnabled = false;
      PonyCoinArt.draw(g, 13, 13, 11, id, !placed.has(id));
    });
    this.body.querySelectorAll('.pcoin').forEach(el => el.addEventListener('pointerdown', e => this._down(e, el.dataset.v)));
    this.body.querySelector('#posterBoard').addEventListener('pointerup', e => {                 // tap a coin, then tap the poster
      if (this.picked && !this.dragging) { this.game.posterCoin(PonyCoins.itemOf(this.picked)); this.picked = null; }
    });
  }

  _down(e, variety) {
    e.preventDefault(); e.stopPropagation();
    const st = { x: e.clientX, y: e.clientY, drag: false, ghost: null }, board = () => this.body.querySelector('#posterBoard');
    const move = ev => {
      if (!st.drag) {
        if (Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < 6) return;
        st.drag = true; this.dragging = true;
        const g = document.createElement('div'); g.className = 'invGhost'; g.innerHTML = `<img alt="" src="${ItemIcons.url(PonyCoins.itemOf(variety))}">`;
        document.body.appendChild(g); st.ghost = g;
      }
      st.ghost.style.left = ev.clientX + 'px'; st.ghost.style.top = ev.clientY + 'px';
      const b = board(), r = b && b.getBoundingClientRect();
      if (b) b.classList.toggle('over', !!r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
    };
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.ghost) st.ghost.remove();
      const b = board(), r = b && b.getBoundingClientRect();
      if (b) b.classList.remove('over');
      if (!st.drag) { this.picked = this.picked === variety ? null : variety; this.dragging = false; this.refresh(); return; }
      if (ev.type === 'pointerup' && r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) this.game.posterCoin(PonyCoins.itemOf(variety));
      setTimeout(() => { this.dragging = false; }, 0);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
}
