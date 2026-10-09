'use strict';
/* SHARED - how far the WORLD has got (not any one player): which zone guardians have been defeated, and which gateways have been opened or shut by hand.
 * Defeating the guardian of a zone opens the gateways of every zone that lists it as `unlockedBy` (js/data/zones/); setGate() is the plain on/off switch for
 * anything else (a story beat, a script, a lever). This is the only place that knows the rule; the zone layer just holds the resulting gates. Saved with the world. */
class WorldProgress {
  constructor(rings) { this.rings = rings; this.defeated = new Set(); this.manual = {}; this.rev = 1; }
  isDefeated(ring) { return this.defeated.has(ring); }
  /** The zones whose gateway this zone's guardian opens. */
  opens(ring) { const id = this.rings.def(ring).id; return Zones.all().filter(z => z.unlockedBy === id); }
  /** Returns true if this was news. */
  defeatBoss(ring) {
    if (this.defeated.has(ring)) return false;
    this.defeated.add(ring);
    this._apply();
    this.rev++;
    return true;
  }
  /** Open (true) or shut (false) the gateway into a zone, whatever its guardian rule says. */
  setGate(zone, open) {
    if (!this.rings.def(zone) || zone === 0) return false;
    this.manual[zone] = !!open;
    this._apply();
    this.rev++;
    return true;
  }
  /** Every gateway from the rules: open at the start, opened by a fallen guardian, then the hand-set ones on top. */
  _apply() {
    this.rings.setUnlocked([...this.defeated].flatMap(r => this.opens(r).map(z => z.index)));
    for (const [zone, open] of Object.entries(this.manual)) { if (open) this.rings.unlock(Number(zone)); else this.rings.lock(Number(zone)); }
  }
  /** Put the saved state back: the defeated guardians (which reopens what they guarded) and the hand-set gateways. */
  restore(list, manual) {
    this.defeated = new Set(list); this.manual = Object.assign({}, manual || {});
    this._apply();
    this.rev++;
  }
  /** What a client needs: which zones are open and which guardians are down. */
  toWire() { return { unlocked: this.rings.unlockedList(), defeated: [...this.defeated].sort() }; }
}
