'use strict';
/* CLIENT - the Menu: one big, labelled button for every section of the game, so nothing hides behind a tiny icon. */
const MENU_SECTIONS = [
  { id: 'inventory', glyph: '\uD83C\uDF92', label: 'Inventory', sub: 'Your pack and tool bar', key: 'I' },
  { id: 'crafting',  glyph: '\uD83D\uDD28', label: 'Crafting',  sub: 'Make tools, outfits, buildings', key: 'Q' },
  { id: 'gear',      glyph: '\uD83D\uDC51', label: 'Wardrobe',  sub: 'Crown, outfit and cape', key: 'G' },
  { id: 'skills',    glyph: '\uD83D\uDCD6', label: 'Journal',   sub: 'Skills and attributes', key: 'J' },
  { id: 'treasure',  glyph: '\uD83D\uDDFA', label: 'Treasure',  sub: 'Maps you have read', key: '' },
  { id: 'map',       glyph: '\uD83E\uDDED', label: 'Map',       sub: 'The land around you', key: 'M' },
  { id: 'ponies',    glyph: '\uD83D\uDC0E', label: 'Ponies',    sub: 'Pony Book and your herd', key: 'P' },
  { id: 'town',      glyph: '\uD83C\uDFD8', label: 'Town',      sub: 'Stockpiles and upgrades', key: 'T' },
  { id: 'session',   glyph: '\uD83C\uDF10', label: 'Session',   sub: 'Room code, players, saving', key: '', needsSession: true },
  { id: 'settings',  glyph: '\u2699',       label: 'Admin',      sub: 'Host: testing tools and game settings (code)', key: '', hostOnly: true }
];

class MenuUI {
  /** @param {{panel, body, closeButton, game, onPick:(sectionId)=>void}} opts */
  constructor({ panel, body, closeButton, game, onPick }) {
    this.panel = panel; this.body = body; this.game = game; this.onPick = onPick;
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.section) this.onPick(b.dataset.section); });
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  refresh() {
    const sections = MENU_SECTIONS.filter(s => (!s.hostOnly || this.game.isHost) && (!s.needsSession || this.game.session));
    const maps = this.game.treasureMaps.length;
    this.body.innerHTML = '<div class="menugrid">' + sections.map(s =>
      `<button data-section="${s.id}"><span class="mg">${s.glyph}</span><span class="mt"><b>${s.label}</b><i>${s.id === 'treasure' && maps ? `${maps} map${maps === 1 ? '' : 's'} read` : s.sub}</i></span>${s.key ? `<kbd>${s.key}</kbd>` : ''}</button>`).join('') + '</div>' +
      '<label class="menuSlide"><span><b>Night darkness</b><small>How dark the night looks on your screen.</small></span><input type="range" id="nightDark" min="0" max="100" step="1"><output id="nightDarkOut"></output></label>' +
      '<label class="menuSlide"><span><b>Your own light</b><small>How much light you carry at night. Torches and fires add to it.</small></span><input type="range" id="ownLight" min="0" max="100" step="1"><output id="ownLightOut"></output></label>' +
      '<div class="menunote">Tap outside a window to close it.</div>';
    for (const [id, setting] of [['nightDark', NightSetting], ['ownLight', PlayerLightSetting]]) {
      const slider = this.body.querySelector('#' + id), out = this.body.querySelector('#' + id + 'Out');
      const show = () => { out.textContent = Math.round(slider.value) + '%'; };
      slider.value = Math.round((setting.value - setting.MIN) / (setting.MAX - setting.MIN) * 100); show();
      slider.addEventListener('input', () => { setting.set(setting.MIN + slider.value / 100 * (setting.MAX - setting.MIN)); show(); });
      slider.addEventListener('keydown', e => e.stopPropagation());                              // (arrow keys must not walk the pony)
    }
  }
}
