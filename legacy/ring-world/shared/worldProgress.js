'use strict';
/* SHARED - how far the WORLD has got (not any one player): which ring guardians have been defeated. Defeating the boss of ring N opens the barrier to
 * ring N+1. This is the only place that knows the rule; the ring layer just holds the resulting locks. Saved with the world. */
class WorldProgress {
  constructor(rings) { this.rings = rings; this.defeated = new Set(); this.rev = 1; }
  isDefeated(ring) { return this.defeated.has(ring); }
  /** Returns true if this was news. */
  defeatBoss(ring) {
    if (this.defeated.has(ring)) return false;
    this.defeated.add(ring);
    if (ring + 1 < this.rings.count) this.rings.unlock(ring + 1);
    this.rev++;
    return true;
  }
  /** Put a saved list of defeated bosses back (which also reopens the rings they guarded). */
  restore(list) {
    this.defeated = new Set(); this.rings.setUnlocked([]);
    for (const ring of list) { this.defeated.add(ring); if (ring + 1 < this.rings.count) this.rings.unlock(ring + 1); }
    this.rev++;
  }
  /** What a client needs: which rings are open and which guardians are down. */
  toWire() { return { unlocked: this.rings.unlockedList(), defeated: [...this.defeated].sort() }; }
}
