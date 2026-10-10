'use strict';
/* CLIENT - the Apple button: an apple picture and how many you carry (it drops to 0 when you have none). Press it (or C) to give that apple to your pony (appleSystem.js); hold it
 * (or Shift+C) to switch to another kind of apple you carry. It gives the plainest apple unless you have chosen another. */
class AppleButton {
  constructor({ root, game, bus }) {
    this.root = root; this.game = game; this.choice = ''; this.shown = ''; this.holdTimer = 0; this.held = false;
    this.img = root.querySelector('img'); this.count = root.querySelector('.aCount');
    root.addEventListener('pointerdown', e => { e.preventDefault(); this.held = false; this.holdTimer = setTimeout(() => { this.held = true; this.cycle(); }, 450); });
    const release = e => { clearTimeout(this.holdTimer); if (e && e.type === 'pointerup' && !this.held) this.use(); };
    root.addEventListener('pointerup', release); root.addEventListener('pointerleave', () => clearTimeout(this.holdTimer)); root.addEventListener('pointercancel', () => clearTimeout(this.holdTimer));
    bus.on('useApple', () => this.use()); bus.on('cycleApple', () => this.cycle());
  }

  /** What the button would give now: { carried: [{ item, count }], item ('' if none), count }. */
  info() {
    const inv = this.game.inventory, carried = AppleRules.carried(item => inv.count(item)), item = AppleRules.pick(carried, this.choice);
    return { carried, item, count: item ? inv.count(item) : 0 };
  }
  use() {
    const { item } = this.info();
    if (!item) { this.game.events.emit('notice', { to: this.game.myId, text: 'You have no apples' }); return; }
    this.game.useApple(item);
  }
  /** The next kind of apple you carry. */
  cycle() {
    const { carried, item } = this.info();
    if (carried.length < 2) { this.game.events.emit('notice', { to: this.game.myId, text: carried.length ? 'That is the only kind of apple you carry' : 'You have no apples' }); return; }
    this.choice = carried[(carried.findIndex(a => a.item === item) + 1) % carried.length].item;
    const rule = AppleRules.of(this.choice);
    this.game.events.emit('notice', { to: this.game.myId, text: `${ItemDefs[this.choice].name}: heals ${Math.round(rule.heal * 100)}%` + (rule.speed ? `, speed +${rule.speed[0]}%` : '') + (rule.cooldowns ? ', refreshes powers' : '') + (rule.xp ? ', trains your pony' : '') });
  }
  update() {
    const { item, count } = this.info(), key = item + '|' + count;
    if (key === this.shown) return;
    this.shown = key;
    this.img.src = ItemIcons.url(item || 'apple'); this.count.textContent = String(count);
    this.root.classList.toggle('empty', !count); this.root.title = item ? `Give your pony ${ItemDefs[item].name} (C). Hold to change kind` : 'No apples (C)';
  }
}
