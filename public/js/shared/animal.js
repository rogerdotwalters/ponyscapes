'use strict';
/* SHARED - Animal: wildlife, ponies and monsters. A Being plus everything an animal needs (health, a mood, a pen, a rope...). */
const DEFAULT_ANIMAL_TASTES = Object.freeze({ likes: ['apple', 'raspberry', 'blackberry', 'blueberry', 'cranberry', 'lingonberry'], loves: [], dislikes: [] });

class Animal extends Being {
  constructor(id, type, x, y, { level, maxHp, facing, timer, look }) {
    super(id, type, x, y);
    Object.assign(this, {
      level, maxHp, facing, hp: maxHp, timer, tx: x, ty: y, fleeT: 0, fx: 0, fy: 0, hurt: false, stuckT: 0, attackT: 0, look,
      owner: '', leashed: false, rider: '', penTick: -999, pen: { enclosed: false, area: 0 },
      captor: '', trust: 0, captureT: 0, warned: false, shelter: null, shelterTick: -999        // a CAUGHT wild pony: who holds it, apples eaten, time outside shelter
    });
  }
  get kind() { return 'animal'; }
  get def() { return AnimalDefs[this.type]; }
  get tastes() { const d = this.def; return d.friend || (d.pony ? { likes: ['apple'], loves: [], dislikes: [] } : DEFAULT_ANIMAL_TASTES); }
  get befriendable() { const d = this.def; return !!d && d.befriend !== false && !d.hostile && !d.boss; }
}
/** Can people make friends with this kind of animal? (usable on a client's plain state objects too) */
const canBefriendAnimal = type => { const d = AnimalDefs[type]; return !!d && d.befriend !== false && !d.hostile && !d.boss; };
const animalTastes = type => { const d = AnimalDefs[type]; return !d ? {} : d.friend || (d.pony ? { likes: ['apple'], loves: [], dislikes: [] } : DEFAULT_ANIMAL_TASTES); };
