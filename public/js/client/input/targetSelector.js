'use strict';
/* CLIENT - which of the things around you the buttons act on, and the bubble shows.
 *
 * Everything you could interact with within reach (a door, a pony, a villager, a tree to pick...) is scored from where you stand and which way you face:
 *     score = distance + (1 - cos(angle between your facing and the thing)) * FACING_WEIGHT + a small bias (petting loses to picking up, camping loses to everything)
 * The lowest score is selected on its own (AUTO), and the whole list is kept in that order (`list`, best first).
 * D-pad up / down step through the list (cycle): that is a HARD select. The selection then stays put - nothing is re-chosen as you shuffle about or the
 * animals wander - until you start moving again (after SELECT_LOCK_MS, so the press that chose it is not itself undone), and then auto picks again.
 *
 * `current` is the selected candidate: { key, action, target, score } (action: the interaction as Interactions.list gives it; target: where it is, for the bubble).
 * The `key` (Interactions.keyOf) is what the server is told (input.pick), so it does exactly the thing whose bubble you see. */
const SELECT_FACING_WEIGHT = 0.9;           // tiles of "distance" a thing straight behind you costs (a thing you face costs nothing extra)
const SELECT_LOCK_MS = 500;                 // a hard select holds at least this long, then until the player moves
const SELECT_KEEP_MARGIN = 0.35;            // in auto, the current pick stays unless another beats it by this much (no flicker between two close things)
const SELECT_EVERY_MS = 80;
const SELECT_KIND_BIAS = { pet: 0.4, drink: 0.3, fill: 0.3, camp: 1.5, sleep: 0.2 };

class TargetSelector {
  /** @param {{game, targetOf:(action)=>{x,y,kind,id,lift}, isMoving:()=>boolean}} opts */
  constructor({ game, targetOf, isMoving }) {
    this.game = game; this.targetOf = targetOf; this.isMoving = isMoving;
    this.list = [];                         // best first
    this.key = '';                          // the selected candidate's key
    this.locked = false;                    // a hard select is in force (auto is off)
    this.lockedAt = 0;
    this.since = 1e9;
  }

  /** The selected candidate, or null when nothing is in reach. */
  get current() { return this.list.find(c => c.key === this.key) || null; }
  /** 1-based place of the selection in the list, and the list's length (for the "2 / 3" next to the arrows). */
  get position() { const i = this.list.findIndex(c => c.key === this.key); return { index: i + 1, count: this.list.length }; }

  /** Step through the list: +1 next, -1 previous. Turns auto off until the player moves again. */
  cycle(dir, now = performance.now()) {
    if (this.list.length < 2) { this.lock(now); return; }
    const i = Math.max(0, this.list.findIndex(c => c.key === this.key));
    this.key = this.list[(i + dir + this.list.length) % this.list.length].key;
    this.lock(now);
  }
  lock(now = performance.now()) { this.locked = true; this.lockedAt = now; }

  /** Call every frame. Re-scores the things around you a dozen times a second. */
  update(ms, now = performance.now()) {
    this.since += ms;
    if (this.locked && now - this.lockedAt >= SELECT_LOCK_MS && this.isMoving()) this.locked = false;       // moving again: auto takes over
    if (this.since < SELECT_EVERY_MS) return;
    this.since = 0;
    this.list = this._score();
    const best = this.list[0];
    if (this.locked) {
      if (this.list.some(c => c.key === this.key)) return;                                              // (the hard pick is still there: keep it)
      this.locked = false;                                                                              // (it is gone: out of reach, picked, or walked off)
    }
    const kept = this.list.find(c => c.key === this.key);
    if (kept && best && kept.score <= best.score + SELECT_KEEP_MARGIN) return;
    this.key = best ? best.key : '';
  }

  /** Every interaction in reach with a score, best first. */
  _score() {
    const g = this.game, me = g.local;
    if (!me) return [];
    const out = [], seen = new Set();
    for (const action of g.interactCandidates()) {
      const key = Interactions.keyOf(action);
      if (seen.has(key)) continue;
      seen.add(key);
      const target = this.targetOf(action);
      let score;
      if (!target || target.kind === 'me') score = (action.dist || 0) + SELECT_FACING_WEIGHT * 0.5;        // (no place to point at: judged by the reach it reports)
      else {
        const dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy);
        const cos = dist < 0.05 ? 1 : Math.cos(wrapAngle(Math.atan2(dy, dx) - me.facing));
        score = dist + (1 - cos) * SELECT_FACING_WEIGHT;
      }
      out.push({ key, action, target, score: score + (SELECT_KIND_BIAS[action.kind] || 0) });
    }
    return out.sort((a, b) => a.score - b.score);
  }
}
