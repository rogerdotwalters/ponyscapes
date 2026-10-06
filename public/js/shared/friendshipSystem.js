'use strict';
/* SHARED (server) - every friendly act goes through here: petting, feeding and talking and giving gifts. It checks the cooldown, works out how much the act
 * is worth (a loved gift is worth more than a neutral one), adds it under the cap that the player's Friendship (people) or Animal Friendship (animals) skill allows,
 * trains that skill, and tells the player. Friendship is per player AND per being, so two players have separate hearts with the same animal. */
class FriendshipSystem {
  /** @param {GameServer} server */
  constructor(server) { this.s = server; this.rev = {}; this.sent = {}; }

  being(id) { return this.s.animals.animals[id] || this.s.npcs.npcs[id] || null; }
  _bump(pid) { this.rev[pid] = (this.rev[pid] || 0) + 1; }

  /** @param act 'pet' | 'talk' | 'feed' | 'gift'   @returns { points, ups, capped } or null if nothing happened */
  act(pid, being, act, itemId = '') {
    const S = this.s, C = CONFIG.sim.friendship, p = S.players[pid], inv = S.inventories[pid];
    if (!p || !being || !being.befriendable) return null;
    const name = being.name || being.def.name, person = being.kind === 'person', cool = C.cooldowns[act === 'feed' ? 'feed' : act];
    let points, spend = false, line = '';
    if (act === 'talk') { line = being.lineFor(pid, p.name || 'friend'); S.npcs.speak(being, line); points = C.gains.talk; }
    else if (act === 'pet') points = C.gains.pet;
    else if (act === 'groom') points = C.gains.groom;                  // a brush (serverOwned.js)
    else if (act === 'feed' || act === 'gift') {
      if (!itemId || !inv.has(itemId, 1)) return null;
      const op = being.opinionOf(itemId), item = ItemDefs[itemId].name;
      if (act === 'feed' && op === 'disliked') { S._notice(pid, `${name} sniffs the ${item} and turns away`); return null; }
      points = act === 'feed' ? { loved: C.gains.feedLoved, liked: C.gains.feedLiked, neutral: C.gains.feed }[op] : { loved: C.gains.giftLoved, liked: C.gains.giftLiked, disliked: C.gains.giftDisliked, neutral: C.gains.gift }[op];
      spend = true;
      line = act === 'gift' ? { loved: `${name} is overjoyed with the ${item}!`, liked: `${name} likes the ${item}`, disliked: `${name} does not like the ${item}...`, neutral: `${name} thanks you for the ${item}` }[op] : '';
    }
    if (being.coolingDown(pid, act, S.tick, cool)) { if (act !== 'talk') S._notice(pid, `${name} has had enough for now`); return { points: 0, ups: 0, capped: false, cooling: true }; }
    if (spend) { inv.remove(itemId, 1); S.inventoryRev[pid]++; }
    const skillLevel = Skills._s(p.lv, being.skill), cap = Friendship.capFor(skillLevel), before = being.bond(pid), wasCapped = before.level >= cap && before.into >= Friendship.levelCost(before.level), result = being.befriend(pid, points, skillLevel);
    if (points > 0) S.progress.award(pid, being.skill, Math.max(C.minXp, Math.round(points * C.xpPerPoint)));       // it trains the skill even when you are at the cap
    this._bump(pid);
    const info = Friendship.info(result.bond.level);
    S.pendingEvents.push({ type: 'friend', to: pid, id: being.id, x: being.x, y: being.y, level: result.bond.level, hearts: Friendship.hearts(result.bond), gain: points, up: result.ups > 0, capped: result.capped, name });
    if (line && act === 'gift') S._notice(pid, line);
    if (result.ups > 0) S._notice(pid, `${name} is now ${info.name} friends with you!`);
    else if (result.capped && points > 0 && !wasCapped) S._notice(pid, `You cannot grow closer to ${name} until your ${SkillDefs[being.skill].name} improves`);
    return { points, ups: result.ups, capped: result.capped };
  }

  /** Pets near their owner (or being ridden) slowly grow fonder: once every `togetherSeconds`. */
  update(tick) {
    const C = CONFIG.sim.friendship, every = Math.round(C.togetherSeconds * CONFIG.sim.tickRate);
    if (tick % every !== 0) return;
    for (const id in this.s.animals.animals) {
      const a = this.s.animals.animals[id], o = a.owner && this.s.players[a.owner];
      if (!o || !a.befriendable || !sameGrid(o, a) || (!a.rider && Math.hypot(o.x - a.x, o.y - a.y) > C.togetherRange)) continue;
      const result = a.befriend(a.owner, C.gains.together, Skills._s(o.lv, 'animal_friendship'));
      if (result.gained > 0) this._bump(a.owner);
      if (result.ups > 0) this.s._notice(a.owner, `${a.def.name} is now ${Friendship.info(result.bond.level).name} friends with you!`);
    }
  }

  /** { beingId: [level, points] } for everything this player has a bond with. */
  bondsFor(pid) {
    const out = {};
    for (const set of [this.s.animals.animals, this.s.npcs.npcs]) for (const id in set) { const b = set[id].friends[pid]; if (Friendship.hasBond(b)) out[id] = Friendship.encode(b); }
    return out;
  }
  /** Everything, for a player who has just joined (and marks it as sent). */
  fullFor(pid) { this.sent[pid] = this.rev[pid] || 0; return this.bondsFor(pid); }
  /** Only when something changed since the last time (else null). */
  updateFor(pid) {
    if (this.sent[pid] === this.rev[pid] && this.sent[pid] !== undefined) return null;
    this.sent[pid] = this.rev[pid] || 0; return this.bondsFor(pid);
  }

  /** A person left: their slot id will be reused by someone else, so forget everything tied to it. */
  forget(pid) {
    for (const set of [this.s.animals.animals, this.s.npcs.npcs]) for (const id in set) set[id].forget(pid);
    delete this.rev[pid]; delete this.sent[pid];
  }
  /** The villagers' friendship, for the character save. */
  exportFor(pid) { const out = {}; for (const id in this.s.npcs.npcs) { const b = this.s.npcs.npcs[id].friends[pid]; if (Friendship.hasBond(b)) out[id] = Friendship.encode(b); } return out; }
  restore(pid, saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const id of Object.keys(saved)) {
      const raw = saved[id], b = Array.isArray(raw) ? Friendship.decode(raw) : raw && Number.isFinite(raw.level) && Number.isFinite(raw.into) ? Friendship.decode([raw.level, raw.into]) : null, n = this.s.npcs.npcs[id];   // (a saved character holds { level, into }; the wire form is [level, into])
      if (n && b) n.friends[pid] = b;
    }
    this._bump(pid);
  }
}
