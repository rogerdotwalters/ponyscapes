'use strict';
/* SERVER-SIDE - the test bot (Settings > Act 1 > Bot player). A real player seat that nobody sits in: the server writes its inputs. It carries a stone sword, follows the host (and is carried
 * after them when they change grid, or fall too far behind), walks up to the nearest hostile creature and swings, and picks up a downed host. So party rules (waves, revives, shared rooms)
 * can be tried alone. It is not saved, and it goes when switched off or when the host leaves. */
const BOT_NAME = 'Bot', BOT_FOLLOW = 3, BOT_HUNT = 16, BOT_SWING = 1.15, BOT_LOST_SECONDS = 4;

class BotSystem {
  constructor(server) { this.s = server; this.id = ''; this.seq = 0; this.lostT = 0; this.liftT = 0; }

  get on() { return !!this.id && !!this.s.players[this.id]; }

  /** Switch the bot on (true) or off (false). Returns whether it is on afterwards. */
  set(on) {
    if (on === this.on) return this.on;
    if (!on) { this.s.leaveHuman(this.id); this.id = ''; return false; }
    const s = this.s, host = s.players[s.hostId];
    if (!host) return false;
    const id = s.joinHuman(null, BOT_NAME);
    if (!id) { s._notice(s.hostId, 'No free seat for the bot'); return false; }
    this.id = id; this.seq = 0; this.lostT = 0;
    const p = s.players[id], inv = s.inventories[id];
    p.bot = true;
    inv.remove('knife', 1); inv.add('stone_sword', 1); s.inventoryRev[id]++;
    s._moveToGrid(id, p, gridOf(host), host.x + 1, host.y);
    return true;
  }

  /** The hotbar slot holding the sword. */
  _swordSlot() {
    const inv = this.s.inventories[this.id];
    for (let i = 0; i < CONFIG.sim.inventory.hotbarSlots; i++) if (inv.itemIdAt(i) === 'stone_sword') return i;
    return 0;
  }

  /** Once a tick: decide this tick's input and queue it. */
  update() {
    const s = this.s;
    if (!this.id) return;
    const p = s.players[this.id], host = s.players[s.hostId];
    if (!p || !host) { if (p) s.leaveHuman(this.id); this.id = ''; return; }
    const input = { moveX: 0, moveY: 0, action: false, interact: false, slot: this._swordSlot(), seq: ++this.seq };
    if (p.down > 0 || p.asleep) { s.receiveInput(this.id, input); return; }
    const toward = (x, y) => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1; input.moveX = dx / d; input.moveY = dy / d; };

    if (gridOf(host) !== gridOf(p) || Math.hypot(host.x - p.x, host.y - p.y) > 40) { s._moveToGrid(this.id, p, gridOf(host), host.x + 1, host.y); this.lostT = 0; s.receiveInput(this.id, input); return; }

    const hostDist = Math.hypot(host.x - p.x, host.y - p.y);
    if (host.down > 0) {                                                                                 // pick the host up
      if (hostDist > 1.1) toward(host.x, host.y); else input.interact = true;
      this._stuck(p, host, hostDist, input);
      s.receiveInput(this.id, input); return;
    }

    let prey = null, best = BOT_HUNT;
    for (const a of Object.values(s.animals.animals)) {
      const def = AnimalDefs[a.type];
      if (!def || !def.hostile || a.hp <= 0 || gridOf(a) !== gridOf(p)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < best) { best = d; prey = a; }
    }
    if (prey && Math.hypot(prey.x - host.x, prey.y - host.y) < BOT_HUNT * 1.5) {                           // fight (but never wander far from the host)
      input.aim = true; input.ax = prey.x; input.ay = prey.y;
      if (best > BOT_SWING) toward(prey.x, prey.y); else input.action = true;
    } else if (hostDist > BOT_FOLLOW) toward(host.x, host.y);
    this._stuck(p, host, hostDist, input);
    s.receiveInput(this.id, input);
  }

  /** Walking into rock for BOT_LOST_SECONDS while the host is far: carried to the host's side. */
  _stuck(p, host, hostDist, input) {
    const walking = Math.hypot(input.moveX, input.moveY) > 0.1;
    this.lostT = walking && hostDist > 8 && Math.hypot(p.vx, p.vy) < 0.3 ? this.lostT + TICK_DT : 0;
    if (this.lostT > BOT_LOST_SECONDS) { this.lostT = 0; this.s._moveToGrid(this.id, p, gridOf(host), host.x + 1, host.y); }
  }
}
