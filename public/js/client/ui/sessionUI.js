'use strict';
/* CLIENT - the Session panel (and its small helpers) for hosted games: who is playing, the room code, when the game was last saved,
 * and the buttons to save now, remove a player, or end the session. A friend sees the same panel with a Leave button. */
class Toasts {
  constructor(root) { this.root = root; }
  show(text, kind = 'info', ms = 4200) {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text; this.root.appendChild(el);
    while (this.root.children.length > 4) this.root.removeChild(this.root.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }
}

class SessionUI {
  /** @param {{panel, body, closeButton, badge, endOverlay, adapter, toasts, confirm}} o  confirm: ConfirmUI */
  constructor(o) {
    Object.assign(this, o); this.since = 1e9; this.finished = false;
    o.closeButton.addEventListener('click', () => this.close());
    o.body.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) this._act(b.dataset.act, b.dataset); });
    o.adapter.onSession(ev => this._onEvent(ev));
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.structure = null; this.render(); }
  close() { this.panel.hidden = true; }
  tick(ms) {
    if ((this.since += ms) < 1000) return;
    this.since = 0; this.updateBadge(); if (this.isOpen) this.render();
  }

  get isHost() { return this.adapter instanceof HostAdapter; }
  static mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  updateBadge() {
    const info = this.adapter.getSessionInfo(); if (!info) return;
    const n = info.players.length, saved = info.lastSavedAt ? ' &middot; saved ' + LobbyUI.ago(info.lastSavedAt) : '';
    this.badge.innerHTML = info.online ? `<i></i>${info.code} &middot; ${n}/${CONFIG.sim.maxPlayers}${this.isHost ? saved : ''}` : `<i class="off"></i>offline${saved}`;
    this.badge.hidden = false;
  }

  render() {
    const info = this.adapter.getSessionInfo(), host = this.isHost, E = LobbyUI.escape;
    const key = JSON.stringify([host, info.online, info.code, info.persistent, info.worldName, info.hostName, info.you, info.players.map(p => [p.id, p.name, p.slot, p.host, p.cid])]);
    if (key === this.structure && this.body.firstChild) { this._live(info); return; }      // nothing structural changed: only the ticking text moves
    this.structure = key;
    const players = info.players.map(p => {
      const you = host ? p.host : p.id === info.you, ping = p.rtt != null ? Math.round(p.rtt) + ' ms' : (you ? '' : '...');
      return `<div class="splayer"><i style="background:${CONFIG.sim.slotColors[p.slot]}"></i><span class="sn">${E(p.name)}</span><em>${p.host ? 'host' : ''}${you ? (p.host ? ', you' : 'you') : ''}</em><span class="sping" data-ping="${p.id}">${ping}</span>` +
        `${host && !p.host && p.cid ? `<button data-act="kick" data-cid="${p.cid}" data-name="${E(p.name)}">Remove</button>` : ''}</div>`;
    }).join('');
    let html = '';
    if (info.online) html += `<div class="scodeRow"><span class="scode">${info.code}</span>${host ? '<button data-act="copylink">Copy invite link</button>' : ''}<button data-act="copycode">Copy code</button></div>` +
      `<div class="shint">${host ? 'Up to 3 friends can join with this code.' : `Playing in ${E(info.hostName || 'the host')}'s game.`}</div>`;
    else html += `<div class="soffline">${host ? 'Offline: friends cannot join right now.' : 'You are disconnected.'}</div>${host ? '<button class="sbig" data-act="online">Invite friends online</button>' : ''}`;
    html += `<div class="sheader">Players (${info.players.length}/${CONFIG.sim.maxPlayers})</div><div class="splayers">${players}</div>`;
    if (host) {
      html += `<div class="sheader">${E(info.worldName)}</div><div class="ssave"><div data-live="saved"></div><div class="sdim" data-live="next"></div></div>` +
        `<div class="sdim">Everyone's character is saved to <b>your</b> browser's database: when they leave, on every auto-save, and when you end the session.</div>` +
        (info.persistent ? '' : '<div class="swarn">This browser cannot keep saves after you close the page.</div>') +
        '<div class="srowbtns"><button data-act="save">Save now</button><button class="danger" data-act="end">End session &amp; save</button></div>';
    } else {
      html += `<div class="sdim"><span data-live="rtt"></span>The host keeps your character: it is saved when you leave, and restored when you come back with this device.</div>` +
        '<div class="srowbtns"><button class="danger" data-act="leave">Leave game</button></div>';
    }
    this.body.innerHTML = html;
    this._live(info);
  }

  /** The text that changes every second, updated in place: the buttons around it are never rebuilt (a rebuild in the middle of a tap loses the tap). */
  _live(info) {
    const set = (name, text) => { const el = this.body.querySelector('[data-live="' + name + '"]'); if (el && el.textContent !== text) el.textContent = text; };
    set('saved', info.saving ? 'Saving...' : info.lastSavedAt ? 'Last saved ' + LobbyUI.ago(info.lastSavedAt) : 'Not saved yet');
    set('next', 'Next auto-save in ' + SessionUI.mmss((info.nextAutoSaveAt || 0) - Date.now()) + ' (every ' + CONFIG.net.autosaveMinutes + ' min)');
    set('rtt', info.rtt != null ? 'Your delay to the host: ' + Math.round(info.rtt) + ' ms. ' : '');
    for (const p of info.players) { const el = this.body.querySelector('[data-ping="' + p.id + '"]'); if (el) { const text = p.rtt != null ? Math.round(p.rtt) + ' ms' : (p.host || p.id === info.you ? '' : '...'); if (el.textContent !== text) el.textContent = text; } }
  }

  _act(act, data) {
    const a = this.adapter;
    if (act === 'copycode' || act === 'copylink') {
      const text = act === 'copycode' ? a.getSessionInfo().code : a.shareLink();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => this.toasts.show(act === 'copycode' ? 'Code copied' : 'Invite link copied', 'ok'), () => window.prompt('Copy this:', text));
    } else if (act === 'save') a.saveAll('manual');
    else if (act === 'kick') this.confirm.askCustom({ title: `Remove ${data.name}?`, text: `${data.name} will be disconnected. Their character is saved first, and they can rejoin with the code.`, goLabel: 'Remove', keepLabel: 'Keep', onGo: () => a.kick(data.cid, 'Removed by the host') });
    else if (act === 'online') a.startOnline().then(() => this.render(), e => this.toasts.show(RemoteAdapter.explain(e.reason, e) , 'bad'));
    else if (act === 'end') this.confirm.askCustom({ title: 'End the session?', text: 'Everyone is disconnected. The world and every player\'s character are saved to your browser first.', goLabel: 'End & save', keepLabel: 'Keep playing', onGo: () => this._endHost() });
    else if (act === 'leave') this.confirm.askCustom({ title: 'Leave the game?', text: 'The host keeps your character. You can come back with the same code while the host is online.', goLabel: 'Leave', keepLabel: 'Stay', onGo: () => { a.disconnect(); this._ended('You left the game. The host keeps your character.'); } });
  }

  async _endHost() { await this.adapter.endSession(); this._ended('Session ended. The world and every player\'s character were saved to your browser.'); }

  _onEvent(ev) {
    const T = this.toasts;
    if (ev.type === 'joined') T.show(ev.name + (ev.restored ? ' rejoined' : ' joined') + ' the game', 'ok');
    else if (ev.type === 'left') T.show(ev.name + (ev.why === 'kicked' ? ' was removed' : ' left') + '. Their character was saved', 'info');
    else if (ev.type === 'saved') { if (ev.reason !== 'created' && ev.reason !== 'background') T.show(ev.reason === 'autosave' ? 'Game auto-saved' : 'Game saved', 'ok', 2200); }
    else if (ev.type === 'saveFailed') T.show('Could not save: ' + ev.error, 'bad', 7000);
    else if (ev.type === 'relayLost') T.show('Lost the connection to the relay. Friends were disconnected; your game continues offline and was saved.', 'bad', 9000);
    else if (ev.type === 'online') T.show('Room ' + ev.code + ' is open', 'ok');
    else if (ev.type === 'ended' && !this.isHost) this._ended(ev.text);
    if (this.isOpen) this.render();
    this.updateBadge();
  }

  _ended(text) {
    if (this.finished) return; this.finished = true;
    this.endOverlay.querySelector('#endText').textContent = text; this.endOverlay.hidden = false;
    this.endOverlay.querySelector('#endBack').onclick = () => { location.href = location.pathname; };
  }
}
