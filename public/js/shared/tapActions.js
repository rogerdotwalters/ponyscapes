'use strict';
/* SERVER-SIDE - what a click or tap on a person or an animal does (the client works out WHAT was clicked and sends the id; the server checks it
 * is really within reach and decides). Added to GameServer.
 *   talkTo     a villager: they say hello (the client opens the dialogue window first when they have a shop or something to offer)
 *   animalAct  an animal: feed it (what you hold), give it what it asks for, feed a caught pony its apple, else pet it */
const TAP_TALK_SLACK = 0.6;                       // a little more than the talking reach: the villager may be walking
Object.assign(GameServer.prototype, {
  _talkTo(id, npcId, act = 'talk') {
    const p = this.players[id], npc = typeof npcId === 'string' ? this.npcs.visible()[npcId] : null;
    if (!p || !npc || !sameGrid(npc, p)) return;
    if (Math.hypot(npc.x - p.x, npc.y - p.y) > CONFIG.sim.friendship.reach + TAP_TALK_SLACK) { this._notice(id, `Get closer to talk to ${npc.name}`); return; }
    if (act === 'gift') { if (p.held) this.friendship.act(id, npc, 'gift', p.held); return; }
    const result = this.friendship.act(id, npc, 'talk');
    this.quests.onTalk(id, npc);                                                       // (a quest may be waiting for someone to speak to them)
    if (!result || result.cooling) this.npcs.speak(npc, npc.lineFor(id, p.name || 'friend'));        // (hearts come once in a while; a hello is always answered)
  },

  _animalAct(id, animalId, act) {
    const p = this.players[id], a = typeof animalId === 'string' ? this.animals.animals[animalId] : null;
    if (!p || !a || !sameGrid(a, p) || p.boat) return;
    const def = AnimalDefs[a.type], reach = CONFIG.sim.friendship.petReach + def.radius + 0.3, held = p.held, inventory = this.inventories[id];
    if (Math.hypot(a.x - p.x, a.y - p.y) > reach) { this._notice(id, `Get closer to the ${def.name.toLowerCase()}`); return; }
    if (a.captor === id) { if (ItemDB.isApple(held)) this._feedPony(id, a); else this._notice(id, 'Hold an apple to feed it'); return; }
    if (held && Wants.accepts(a, held) && InteractionHandlers.give) { InteractionHandlers.give(this, id, p, { animal: a }); return; }
    if (!canBefriendAnimal(a.type) || a.rider) return;
    const food = held && inventory.has(held, 1) && ItemDefs[held] && ItemDefs[held].food;
    if (act === 'feed' && food) this._treat(id, p, { animal: a });                 // (a disliked treat says so itself)
    else this.friendship.act(id, a, 'pet');
  }
});
