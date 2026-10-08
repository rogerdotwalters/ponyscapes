'use strict';
/* CLIENT - the villager dialogue window: a tap or click on a person. If they have something to offer (a shop, quests, a gift they would like
 * from your hand) it lists the choices; if not, they simply say hello and no window opens. The server does the talking and the selling
 * (talkTo / buy commands); this only decides what to offer. */
const OPEN_GUARD_MS = 450;
class DialogueUI {
  constructor({ panel, title, body, closeButton, game, requestOpen, openShop }) {
    this.panel = panel; this.title = title; this.body = body; this.game = game; this.npc = null; this.requestOpen = requestOpen; this.openShop = openShop; this.since = 0; this.openedAt = 0;
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-opt]');
      if (b && performance.now() - this.openedAt > OPEN_GUARD_MS) this._choose(b.dataset.opt);       // (the click that follows the tap which opened this window lands on a button under the finger: ignore it)
    });
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.openedAt = performance.now(); this._render(); }
  close() { this.panel.hidden = true; this.npc = null; }

  /** A villager was tapped: say hello straight away when there is nothing to choose, else open the window. */
  talk(npc) {
    this.npc = npc;
    if (!this._options().length) { this.game.talkTo(npc.id); this.npc = null; return; }
    this.requestOpen();                                  // (opening a window closes the others, this one too: so remember who it is after)
    this.npc = npc; this._render();
  }

  _def() { return this.npc && Npcs.get(this.npc.type); }
  /** [{ id, label }] of what this villager offers right now (excluding "say hello", which is always there once the window is open). */
  _options() {
    const def = this._def(), game = this.game, out = [];
    if (!def) return out;
    const site = def.works ? BuildingSites.list.find(s => s.id === def.works) : null;
    if (site && Shops.stock(site).length) out.push({ id: 'shop', label: 'Shop' });
    for (const q of def.quests || []) out.push({ id: 'quest:' + q.id, label: q.title });
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
      const q = (def.quests || []).find(x => 'quest:' + x.id === opt);
      this.body.innerHTML = `<div class="dlgLine">${q ? q.text : '...'}</div><div class="dlgOpts"><button data-opt="back" tabindex="-1">Back</button></div>`;
      return;
    }
    if (opt === 'back') this._render();
  }

  _render() {
    const npc = this.npc; if (!npc) return;
    const def = this._def();
    this.title.textContent = `${npc.name}${def && def.role ? ' - ' + def.role : ''}`;
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
