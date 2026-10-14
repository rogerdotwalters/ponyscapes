'use strict';
/* SERVER-SIDE - the SKY PONIES (data/ponies/skyPonies.js): water ponies in the rain, lightning ponies in thunderstorms, sun ponies under a full noon sun, star ponies at the peak of a clear night.
 * Like the moon pony (nightEvents.js) one steps out `spawnMin`..`spawnMax` tiles from a player and fades when its sky ends unless somebody has caught it (a caught one is theirs, and can be bred:
 * a foal of a sky variety is a sky pony of that kind, see SkyPonies.kindOfVariant). Each player gets ONE roll per sky episode (a weather spell, a day, a night): `chance` of the entry. */
const SkyPonies = {
  /** The pony kind a variety (an index into PonyVariants) belongs to, or null for an ordinary one: the moon and the sky varieties are tied to their kinds. */
  kindOfVariant(index) {
    const id = (PonyVariants[index | 0] || {}).id, entry = SkyPonyTable.get(id);
    return entry ? entry.kind : id === 'moon' ? 'pony_moon' : null;
  },
  /** Is this kind of pony tied to a variety (the moon and the sky ponies)? */
  isBound(kind) { return kind === 'pony_moon' || SkyPonyTable.all().some(e => e.kind === kind); },
  /** Is the entry's sky out right now? (the weather type, and the hour of the day when it has hours) */
  matches(entry, weatherType, hour) {
    if (!entry.weather.includes(weatherType)) return false;
    if (!entry.hours) return true;
    const [from, to] = entry.hours;
    return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
  },
  /** How strong the sky is, 0..1 (what the entry's `intensity` measures). */
  strength(entry, weather, hour) {
    switch (entry.intensity) {
      case 'rain': return weather.cur.rain;
      case 'lightning': return weather.cur.lightning;
      case 'sun': return clamp(1 - Math.abs(hour - 13) / 2.5, 0, 1);                      // the sun is highest at one o'clock
      case 'night': return clamp(1 - Math.min(hour, 24 - hour), 0, 1);                      // the deepest dark is midnight
      default: return 0;
    }
  },
  /** One rarity higher (never past legendary). */
  better(rarity) { return RarityOrder[Math.min(RarityOrder.length - 1, rarityOf(rarity).order + 1)]; }
};

class SkyEvents {
  constructor(server) { this.s = server; this.rolled = {}; this.won = {}; }

  isWild(a, kind) { return !!a && a.type === kind && !a.owner && !a.captor && !a.rider && !a.grid; }
  wildOf(kind) { return Object.values(this.s.animals.animals).filter(a => this.isWild(a, kind)); }
  /** Which sky episode this is (one value for the whole spell / day / night, so each player rolls once). */
  episode(entry, tick) {
    const hours = GameSettings.totalHours(tick);
    return entry.episode === 'weather' ? 'w' + this.s.weather.rev : entry.episode === 'night' ? 'n' + Math.floor((hours - 12) / 24) : 'd' + Math.floor(hours / 24);
  }

  /** Called every tick; the work happens every two seconds. */
  update(tick) {
    if (tick % 60 !== 0) return;
    const s = this.s, hour = DayCycle.hourAt(tick);
    for (const entry of SkyPonyTable.all()) {
      const wild = this.wildOf(entry.kind);
      if (!SkyPonies.matches(entry, s.weather.type, hour) || (entry.intensity === 'night' && !LightSources.isDark(tick))) {   // the sky has changed: the ones nobody caught are gone
        for (const a of wild) delete s.animals.animals[a.id];
        continue;
      }
      if (wild.length >= CONFIG.sim.sky.maxAtOnce) continue;
      const ep = this.episode(entry, tick);
      for (const id of s.humanIds()) {
        const h = s.players[id], key = (s.playerKeys[id] || 'seat:' + id) + '|' + entry.id;
        if (gridOf(h)) continue;                                                              // (the sky is the overworld's)
        if (this.rolled[key] !== ep) { this.rolled[key] = ep; if (s.rng() < entry.chance * CONFIG.sim.sky.chanceScale) this.won[key] = ep; }
        if (this.won[key] === ep && this._appear(id, h, entry, SkyPonies.strength(entry, s.weather, hour))) delete this.won[key];
      }
    }
  }

  /** A sky pony steps out near a player (on open ground they cannot see it arrive). A strong sky may make it a rarity better. */
  _appear(id, h, entry, strength) {
    const s = this.s, S = CONFIG.sim.sky, map = s.map, variant = PonyVariants.findIndex(v => v.id === entry.variant), opts = { variant };
    if (strength >= 0.85 && s.rng() < 0.25) opts.rarity = SkyPonies.better(AnimalDefs[entry.kind].rarity);
    for (let n = 0; n < 24; n++) {
      const angle = s.rng() * Math.PI * 2, dist = S.spawnMin + s.rng() * (S.spawnMax - S.spawnMin);
      const x = h.x + Math.cos(angle) * dist, y = h.y + Math.sin(angle) * dist, tx = Math.floor(x), ty = Math.floor(y), tile = map.tile(tx, ty);
      if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || map.navBlocked(tx, ty) || Village.influence(tx, ty) >= 1) continue;
      s.animals.spawn(entry.kind, x, y, undefined, opts);
      s._notice(id, entry.notice);
      return true;
    }
    return false;
  }
}
