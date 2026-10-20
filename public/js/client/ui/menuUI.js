'use strict';
/* CLIENT - the Menu: a small window in the middle of the screen. At the top the room and its code (or "offline" and a button to go online); then Inventory,
 * Character (tools, clothes, bag), Pony Book, Journal, Map and Options; at the bottom Save, Load and Exit.
 * Options (the Controls window) holds Controls, Sound, Soundtrack, Graphics and, for the host, Dev settings. */
const MENU_SECTIONS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'gear',      label: 'Character' },
  { id: 'ponies',    label: 'Pony Book' },
  { id: 'skills',    label: 'Journal' },
  { id: 'map',       label: 'Map' },
  { id: 'options',   label: 'Options' }
];

class MenuUI {
  /** @param {{panel, body, title, closeButton, game, onPick:(sectionId)=>void, onAction:(act)=>void}} opts  act: 'online' | 'save' | 'load' | 'exit' */
  constructor({ panel, body, title, closeButton, game, onPick, onAction }) {
    this.panel = panel; this.body = body; this.title = title; this.game = game; this.onPick = onPick; this.onAction = onAction;
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.section) this.onPick(b.dataset.section);
      else if (b.dataset.act) this.onAction(b.dataset.act);
    });
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  /** The room line: "Room · ABCDE" when the game is open to friends, "Offline" (with a Go online button for the host) when it is not. */
  _room() {
    const s = this.game.session, info = s && s.getSessionInfo(), host = s instanceof HostAdapter;
    if (info && info.online) return { text: `Room · ${info.code}`, online: true, host };
    return { text: 'Room · offline', online: false, host, canGo: !!s && host };
  }

  refresh() {
    const room = this._room(), hasSession = !!this.game.session;
    this.title.textContent = room.text;
    this.body.innerHTML =
      (room.canGo ? '<div class="menuOnline"><button data-act="online" tabindex="-1">Go online</button><small>Let up to 3 friends join with a room code</small></div>' : '') +
      '<div class="menuList">' + MENU_SECTIONS.map(s => `<button data-section="${s.id}" tabindex="-1">${s.label}</button>`).join('') + '</div>' +
      '<div class="menuFoot">' +
        `<button data-act="save" tabindex="-1"${hasSession ? '' : ' disabled'}>Save</button>` +
        `<button data-act="load" tabindex="-1"${hasSession ? '' : ' disabled'}>Load</button>` +
        '<button data-act="exit" class="danger" tabindex="-1">Exit</button></div>';
  }
}
