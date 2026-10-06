'use strict';
/* SHARED - Being: the one base class for everything you can make friends with. Animals and people (NPCs) both extend it, so the friendship meter
 * (three hearts, then a colour level) is written ONCE and works the same on a rabbit and on the baker.
 *
 *   Being           a position, a facing, and a friendship BOND with each player (`friends[playerId] = { level, into }`)
 *   ├─ Animal       (animal.js)   wildlife, pets and monsters: grows Animal Friendship
 *   └─ Npc          (npc.js)      the villagers: grows Friendship
 *
 * A subclass supplies `kind`, `def` (its data table row) and `tastes` (what it likes). Everything else is shared. */
class Being {
  constructor(id, type, x, y) {
    this.id = id; this.type = type; this.x = x; this.y = y;
    this.vx = 0; this.vy = 0; this.facing = 0; this.state = 'idle'; this.home = { x, y };
    this.friends = {};                    // playerId -> { level, into }
    this.cool = {};                       // `${playerId}:${act}` -> tick before which that act does not count again
  }

  /** 'animal' or 'person': which friendship skill this being trains. */
  get kind() { throw new Error('Being.kind: a subclass must say what it is'); }
  /** This being's row in its data table. */
  get def() { throw new Error('Being.def: a subclass must supply its data'); }
  /** { likes, loves, dislikes }: item ids it has an opinion about. */
  get tastes() { return this.def.tastes || {}; }
  get skill() { return Friendship.skillOf(this.kind); }
  /** Can people make friends with it? (Monsters and guardians cannot.) */
  get befriendable() { return true; }

  /** The bond with this player (a fresh one if they have not met). */
  bond(playerId) { return this.friends[playerId] || Friendship.fresh(); }
  hearts(playerId) { return Friendship.hearts(this.bond(playerId)); }
  isFriendOf(playerId) { return Friendship.isFriend(this.friends[playerId]); }
  opinionOf(itemId) { return Friendship.opinion(this.tastes, itemId); }

  /** Add points under the cap this player's skill allows. @returns { bond, ups, capped, gained } */
  befriend(playerId, points, skillLevel) {
    const result = Friendship.apply(this.friends[playerId], points, Friendship.capFor(skillLevel));
    this.friends[playerId] = result.bond;
    return result;
  }

  /** Has this player done `act` with it too recently? Otherwise records it. (Cooldowns are in ticks.) */
  coolingDown(playerId, act, tick, seconds) {
    const key = playerId + ':' + act;
    if (tick < (this.cool[key] || 0)) return true;
    this.cool[key] = tick + Math.round(seconds * CONFIG.sim.tickRate);
    return false;
  }
  forget(playerId) { delete this.friends[playerId]; for (const k of Object.keys(this.cool)) if (k.startsWith(playerId + ':')) delete this.cool[k]; }
}
