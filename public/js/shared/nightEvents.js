'use strict';
/* SERVER-SIDE - things that only happen at night. Fireflies are just a picture on the client (client/render/fireflies.js); the one event the server runs is the MOON PONY: super rare
 * (CONFIG.sim.night.moonPonyChance for each player each night), a pale pony that comes out of the dark, `spawnMin`..`spawnMax` tiles from a player, and is gone with the dawn unless
 * somebody has caught it (a caught one is theirs to keep, like any other pony). The nightly roll is made once for every player at the first dark moment of the night. */
class NightEvents {
  constructor(server) { this.s = server; this.rolled = {}; this.won = {}; }

  /** Which night it is (one number for the whole night, either side of midnight). */
  nightIndex(tick) { return Math.floor((GameSettings.totalHours(tick) - 12) / 24); }
  /** A moon pony nobody has caught: it belongs to the night. */
  isWildMoon(a) { return !!a && a.type === 'pony_moon' && !a.owner && !a.captor && !a.rider && !a.grid; }
  moonPonies() { return Object.values(this.s.animals.animals).filter(a => this.isWildMoon(a)); }

  /** Called every tick; the work happens every two seconds. */
  update(tick) {
    if (tick % 60 !== 0) return;
    const s = this.s, animals = s.animals.animals;
    if (!LightSources.isDark(tick)) {                                          // the dawn takes the moon ponies nobody caught
      for (const a of this.moonPonies()) delete animals[a.id];
      return;
    }
    const N = CONFIG.sim.night, night = this.nightIndex(tick);
    if (this.moonPonies().length >= 2) return;
    for (const id of s.humanIds()) {
      const h = s.players[id], key = s.playerKeys[id] || 'seat:' + id;
      if (gridOf(h)) continue;                                                 // (the moon shines on the overworld)
      if (this.rolled[key] !== night) { this.rolled[key] = night; if (s.rng() < N.moonPonyChance) this.won[key] = night; }
      if (this.won[key] === night && this._appear(id, h)) delete this.won[key];                // (a night that was won keeps looking for room until the pony is out)
    }
  }

  /** A moon pony steps out of the dark near a player (somewhere on open ground they cannot see it arrive). */
  _appear(id, h) {
    const s = this.s, N = CONFIG.sim.night, map = s.map, variant = PonyVariants.findIndex(v => v.id === 'moon');
    for (let n = 0; n < 24; n++) {
      const angle = s.rng() * Math.PI * 2, dist = N.spawnMin + s.rng() * (N.spawnMax - N.spawnMin);
      const x = h.x + Math.cos(angle) * dist, y = h.y + Math.sin(angle) * dist, tx = Math.floor(x), ty = Math.floor(y), tile = map.tile(tx, ty);
      if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || map.navBlocked(tx, ty) || Village.influence(tx, ty) >= 1) continue;
      s.animals.spawn('pony_moon', x, y, undefined, { variant });
      s._notice(id, 'A pale glimmer moves through the dark...');
      return true;
    }
    return false;
  }
}
