'use strict';
/* SHARED - Npc: a villager. A Being (so it has the same friendship hearts as an animal) plus a name, a look and a few lines to say. */
class Npc extends Being {
  constructor(id, def, x, y) {
    super(id, def.id, x, y);
    Object.assign(this, {
      name: def.name, look: def.look.slice(), gear: Object.assign({ crown: '', outfit: '', cape: '' }, def.gear || {}),
      timer: 1 + Math.random() * 3, tx: x, ty: y, say: '', sayT: 0, lineAt: {}
    });
  }
  get kind() { return 'person'; }
  get def() { return Npcs.get(this.type); }
  get tastes() { return this.def.tastes || {}; }

  /** What it says to this player: the highest band they have reached, one line after another. `friend` fills {friend}. */
  lineFor(playerId, friendName = 'friend') {
    const level = this.bond(playerId).level;
    let band = this.def.talk[0];
    for (const b of this.def.talk) if (level >= b.min) band = b;
    const key = playerId + ':' + band.min, i = (this.lineAt[key] = ((this.lineAt[key] === undefined ? -1 : this.lineAt[key]) + 1) % band.lines.length);
    return band.lines[i].replace(/\{friend\}/g, friendName);
  }
}
