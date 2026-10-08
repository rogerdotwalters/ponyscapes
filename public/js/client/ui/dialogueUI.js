'use strict';
/* CLIENT - the villager dialogue window: a tap or click on a person. If they have something to offer (a shop, quests, a gift they would like
 * from your hand) it lists the choices; if not, they simply say hello and no window opens. The server does the talking and the selling
 * (talkTo / buy commands); this only decides what to offer. */
const OPEN_GUARD_MS = 450;
class DialogueUI {
  constructor({ panel, title, body, closeButton, game, requestOpen, openShop }) {
    this.panel = panel; this.title = title; this.body = body; this.game = game; this.npc = null; this.requestOpen = requestOpen; this.openShop = openShop; this.since = 0; this.openedAt = 0; this.view = '';
    closeButton.addEventListener('click', () => this.close());
    for (const ev of ['questsChanged', 'inventoryChanged']) game.events.on(ev, () => { if (this.isOpen && this.npc) this._render(); });
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-opt]');
      if (b && performance.now() - this.openedAt > OPEN_GUARD_MS) this._choose(b.dataset.opt);       // (the click that follows the tap which opened this window lands on a button under the finger: ignore it)
    });
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.openedAt = performance.now(); this._render(); }
  close() { this.panel.hidden = true; this.npc = null; this.view = ''; }

  /** A villager was tapped: say hello straight away when there is nothing to choose, else open the window. */
  talk(npc) {
    this.npc = npc;
    if (!this._options().length) { this.game.talkTo(npc.id); this.npc = null; return; }
    this.requestOpen();                                  // (opening a window closes the others, this one too: so remember who it is after)
    this.npc = npc; this.view = ''; this._render();
  }

  _def() { return this.npc && Npcs.get(this.npc.type); }
  /** [{ id, label }] of what this villager offers right now (excluding "say hello", which is always there once the window is open). */
  _options() {
    const def = this._def(), game = this.game, out = [];
    if (!def) return out;
    const site = def.works ? BuildingSites.list.find(s => s.id === def.works) : null;
    if (site && Shops.stock(site).length) out.push({ id: 'shop', label: 'Shop' });
    for (const q of def.quests || []) out.push({ id: 'quest:' + q.id, label: q.title });
    for (const q of QuestLog.forGiver(def.id)) {                                   // the world's quests this villager gives (questSystem.js)
      const status = QuestLog.status(game.questLog, q);
      if (status === 'available') out.push({ id: 'quest:' + q.id, label: `\u2757 ${q.title}` });
      else if (status === 'active') out.push({ id: 'quest:' + q.id, label: `\u2753 ${q.title}` });
    }
    const held = game.heldItemId();
    if (held && def.tastes && Friendship.opinion(def.tastes, held) !== 'neutral') out.push({ id: 'gift', label: `Give ${ItemDefs[held].name}` });
    return out;
  }

  _choose(opt) {
    const game = this.game, npc = this.npc, def = this._def();
    if (!npc) return;
    if (opt === 'hi') { game.talkTo(npc.id); this.close(); return; }
    if (opt === 'gift') { game.talkTo(npc.id, 'gift'); this.close(); return; }
    if (opt === 'shop') {
      const near = Shops.counterNear(game.map, game.local);
      this.close();
      if (near) game.events.emit('shop', { site: near.site.index, items: Shops.stock(near.site) });
      else game.events.emit('notice', { to: game.myId, text: `${npc.name} sells things at the shop counter inside ${def && def.works ? 'their shop' : 'the shop'}` });
      return;
    }
    if (opt.startsWith('quest:')) {
      const old = (def.quests || []).find(x => 'quest:' + x.id === opt);
      if (old) { this.body.innerHTML = `<div class="dlgLine">${old.text}</div><div class="dlgOpts"><button data-opt="back" tabindex="-1">Back</button></div>`; return; }
      this.view = opt; this._render(); return;
    }
    if (opt.startsWith('qa:')) { game.questAccept(opt.slice(3)); return; }
    if (opt.startsWith('qd:')) { game.questDeliver(opt.slice(3)); return; }
    if (opt === 'back') { this.view = ''; this._render(); }
  }

  /** One quest's page: what is asked (before you take it up), or how it stands (and a button to hand things over). Returns html, or '' if it is gone. */
  _questView() {
    const q = QuestDefs.get(this.view.slice(6)), game = this.game, me = game.local.name;
    if (!q) return '';
    const status = QuestLog.status(game.questLog, q), cur = QuestLog.current(game.questLog, q), opts = [];
    let text;
    if (status === 'available') { text = QuestLog.line(q.offer, me); opts.push(`<button data-opt="qa:${q.id}" tabindex="-1">Accept</button>`); }
    else if (status === 'active' && cur) {
      text = QuestLog.line(q.progress || q.offer, me) + `<div class="dlgStep">Now: ${cur.step.text}${cur.step.type === 'deliver' ? ` (${cur.progress}/${cur.step.count})` : ''}</div>`;
      if (cur.step.type === 'deliver') {
        const have = game.inventory.count(cur.step.item), name = ItemDefs[cur.step.item].name.toLowerCase();
        opts.push(`<button data-opt="qd:${q.id}" tabindex="-1"${have ? '' : ' disabled'}>Hand over ${name} (you have ${have})</button>`);
      }
    } else return '';
    return `<div class="dlgLine">${text}</div><div class="dlgOpts">${opts.join('')}<button data-opt="back" tabindex="-1">Back</button></div>`;
  }

  _render() {
    const npc = this.npc; if (!npc) return;
    const def = this._def();
    this.title.textContent = `${npc.name}${def && def.role ? ' - ' + def.role : ''}`;
    if (this.view) { const html = this._questView(); if (html) { this.body.innerHTML = html; return; } this.view = ''; }
    const opts = this._options().concat([{ id: 'hi', label: 'Say hello' }]);
    this.body.innerHTML = `<div class="dlgLine">${npc.say ? npc.say : 'Hello there.'}</div><div class="dlgOpts">` + opts.map(o => `<button data-opt="${o.id}" tabindex="-1">${o.label}</button>`).join('') + '</div>';
  }

  /** Walked away: close. */
  tick(frameMs) {
    if (!this.isOpen || (this.since += frameMs) < 300) return;
    this.since = 0;
    const me = this.game.local, n = this.npc && this.game.npcs[this.npc.id];
    if (!n || Math.hypot(n.x - me.x, n.y - me.y) > CONFIG.sim.friendship.reach + 2.5) this.close();
  }
}
