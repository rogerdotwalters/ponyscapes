'use strict';
/* CLIENT - orchestrates a frame. Reads state, never mutates it. */
const WALL_CHUNKS = 4;

const FLY_HEIGHT = 46;                                    // pixels a flying pegasus and its rider are drawn above the ground at full height

class Renderer {
  constructor({ canvas, game, effects, getTapMarker }) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.g = new Gfx(this.ctx); this.game = game; this.effects = effects; this.getTapMarker = getTapMarker;
    this.camera = new Camera(); this.playerSprite = new PlayerSprite(this.g); this.boatSprite = new BoatSprite(this.g); this.animalSprite = new AnimalSprite(this.g); this.lighting = new Lighting(); this.builtItems = [];
    game.events.on('builtChanged', () => this.rebuildBuilt());
    game.events.on('gridChanged', () => this.rebuildBuilt());                       // (another grid: its own buildings, or none)
  }

  resize() {
    const { pixelW, pixelH } = this.camera.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    this.canvas.width = pixelW; this.canvas.height = pixelH;
  }

  /** Structures and props of one chunk, built once and kept on the chunk (they are dropped with it). */
  _chunkItems(chunk) {
    if (chunk.renderItems) return chunk.renderItems;
    const items = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const o = chunk.obj[(ly << CHUNK_SHIFT) | lx];
      if (!o) continue;
      const tx = chunk.cx * CHUNK_SIZE + lx, ty = chunk.cy * CHUNK_SIZE + ly, item = { kind: 'structure', depth: tx + ty + 1, o, tx, ty, gx: (tx - ty) * TILE_HALF_W, gy: (tx + ty + 1) * TILE_HALF_H };
      const plan = this.game.map.plan;
      if (o >= INTERIOR_OBJ_BASE && plan && plan.wallIsLow) {                           // a room's wall: low at the front, a window on the side facing in
        Object.assign(item, { low: plan.wallIsLow(tx, ty), windowS: plan.isFloor(tx, ty + 1), windowE: plan.isFloor(tx + 1, ty) });
      }
      items.push(item);
    }
    for (const prop of chunk.props) {
      items.push({ kind: 'prop', depth: prop.x + prop.y, prop, key: tileKey(Math.floor(prop.x), Math.floor(prop.y)), gx: isoX(prop.x, prop.y), gy: isoY(prop.x, prop.y) });
    }
    return (chunk.renderItems = items);
  }

  /** Player-built walls change at runtime, so they live in their own list. A long slab is cut into short
   *  chunks so the painter's algorithm can slot players in front of / behind each part of it correctly. */
  rebuildBuilt() {
    const map = this.game.map;
    this.builtItems = [];
    for (const key of Object.keys(map.built)) {
      const tx = keyTileX(key), ty = keyTileY(key);
      for (const slot of Object.keys(map.built[key])) {
        const type = map.built[key][slot];
        if (slot === 'c') { this.builtItems.push({ kind: 'station', depth: tx + ty + 1, type, tx, ty, gx: (tx - ty) * TILE_HALF_W, gy: (tx + ty + 1) * TILE_HALF_H }); continue; }
        if (type === 'wood_door_open' || type === 'wood_gate_open') {      // an open door / gate is a single leaf, not a chunked slab
          const box = StructureSprites.openDoorLeafBox(tx, ty, slot), cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
          this.builtItems.push({ kind: 'doorLeaf', depth: cx + cy, box, low: type === 'wood_gate_open', gx: isoX(cx, cy), gy: isoY(cx, cy) });
          continue;
        }
        const [x0, y0, x1, y1] = slabBox(tx, ty, slot), alongX = slot === 'n' || slot === 's';
        for (let c = 0; c < WALL_CHUNKS; c++) {
          const f0 = c / WALL_CHUNKS, f1 = (c + 1) / WALL_CHUNKS;
          const box = alongX ? [lerp(x0, x1, f0), y0, lerp(x0, x1, f1), y1] : [x0, lerp(y0, y1, f0), x1, lerp(y0, y1, f1)];
          const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
          this.builtItems.push({ kind: 'built', depth: cx + cy, structure: type, slot, index: c, box, gx: isoX(cx, cy), gy: isoY(cx, cy) });
        }
      }
    }
  }

  render(state, frameMs, now) {
    this.players = state.players;
    const me = state.players[this.game.myId], ctx = this.ctx;
    this.camera.follow(isoX(me.x, me.y), isoY(me.x, me.y) - 18, frameMs);

    const indoors = this.game.map.kind !== 'world';                                  // a room or a cave: darkness all round
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = indoors ? '#0b0d12' : OCEAN_COLOR; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.camera.applyTransform(ctx);
    const bounds = this.camera.bounds();

    const tiles = this.camera.visibleTiles();
    const date = Seasons.at(this.game.clockTick);                                   // the season colours the grass and the trees; watered soil stays dark today
    TerrainRenderer.setDate(date.season.id, date.day); PropSprites.seasonTint = date.season.treeTint;
    TerrainRenderer.setScale(this.camera.scale); TerrainRenderer.draw(this.g, this.game.map, bounds, tiles, now);
    this._drawTapMarker(now);
    for (const item of this._sortedWorldItems(state, bounds, tiles)) this._drawItem(item, now);
    if (!indoors) this._drawBuildingNames(me);
    this._drawLighting(me, state);
    this.effects.draw(this.g, frameMs);              // particles and floating text sit above the night overlay
  }

  /** Time-of-day overlay, centred on the player, with pools of light from torches and campfires. */
  _drawLighting(me, state) {
    const cam = this.camera, s = cam.scale, toScreen = (wx, wy, lift = 0) => [(isoX(wx, wy) - cam.x + cam.w / 2) * s, (isoY(wx, wy) - lift - cam.y + cam.h / 2) * s];
    const [px, py] = toScreen(me.x, me.y, 18);
    const dark = DayCycle.daylight(this.game.hour()) < CONFIG.sim.light.darkBelow;
    const lights = LightSources.collect(this.game.map, Object.values(state.players), state.animals, dark).map(l => {
      const [x, y] = toScreen(l.x, l.y, l.kind === 'torch' ? 24 : l.kind === 'pony' ? 22 : 6);
      const flicker = 1 + Math.sin(performance.now() / 140 + l.x * 3) * 0.03;
      return { x, y, radius: l.radius * TILE_TO_SCREEN * TILE_HALF_W * s * flicker, kind: l.kind };
    });
    this.lighting.draw(this.ctx, this.canvas.width, this.canvas.height, this.game.map.kind === 'cave' ? 0 : this.game.map.kind === 'room' ? 12 : this.game.hour(), px, py, s, lights);
    this.camera.applyTransform(this.ctx);
  }

  /** The name of each building near you, on a little banner above its door. */
  _drawBuildingNames(me) {
    const ctx = this.ctx;
    for (const site of BuildingSites.list) {
      const f = BuildingSites.doorFront(site);
      if (Math.hypot(f.x - me.x, f.y - me.y) > 14) continue;
      const x = isoX(site.doorX + 0.5, site.doorY + 1), y = isoY(site.doorX + 0.5, site.doorY + 1) - CONFIG.view.houseH - 34;
      ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(site.def.name).width + 16;
      this.g.roundRect(x - w / 2, y - 10, w, 20, 8); ctx.fillStyle = 'rgba(20,28,40,.78)'; ctx.fill();
      ctx.fillStyle = site.def.exterior.sign || '#f4e6c1'; ctx.fillText(site.def.name, x, y + 0.5);
    }
  }

  /** A speech bubble above someone's head, its text wrapped to a few short lines. */
  _drawBubble(g, sx, bottom, text) {
    const ctx = g.ctx; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > 150 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = 14, width = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14, height = lines.length * lh + 8, x0 = sx - width / 2, y0 = bottom - height;
    g.roundRect(x0, y0, width, height, 8); ctx.fillStyle = 'rgba(255,252,240,.96)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(60,40,20,.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 5, bottom - 0.5); ctx.lineTo(sx + 1, bottom + 7); ctx.lineTo(sx + 5, bottom - 0.5); ctx.closePath(); ctx.fillStyle = 'rgba(255,252,240,.96)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1c10'; lines.forEach((l, i) => ctx.fillText(l, x0 + 7, y0 + 4 + lh / 2 + i * lh));
  }

  _sortedWorldItems(state, b, tiles) {
    const visible = s => s.gx > b.minX - 70 && s.gx < b.maxX + 70 && s.gy > b.minY - 20 && s.gy < b.maxY + 230;
    const items = this.builtItems.filter(visible);
    for (let cy = tiles.ty0 >> CHUNK_SHIFT; cy <= tiles.ty1 >> CHUNK_SHIFT; cy++) for (let cx = tiles.tx0 >> CHUNK_SHIFT; cx <= tiles.tx1 >> CHUNK_SHIFT; cx++) {
      for (const item of this._chunkItems(this.game.map.chunk(cx, cy))) if (visible(item)) items.push(item);
    }
    const target = this.game.buildTarget;
    if (target) items.push({ kind: 'ghost', depth: target.tx + target.ty + 1, target, gx: (target.tx - target.ty) * TILE_HALF_W, gy: (target.tx + target.ty + 1) * TILE_HALF_H });
    for (const id in state.animals) { const a = state.animals[id]; items.push({ kind: 'animal', depth: a.x + a.y - (a.rider ? 0.05 : 0) + (a.lift || 0) * 4, id, animal: a }); }   // a ridden pony is drawn just under its rider
    for (const id in (state.npcs || {})) { const n = state.npcs[id]; items.push({ kind: 'npc', depth: n.x + n.y, id, npc: n }); }
    const farm = this.game.map.farm;                                                 // crops growing in the fields (farming.js)
    if (farm) for (const key in farm) {
      const plot = farm[key]; if (!plot.c) continue;
      const i = key.indexOf(','), wx = (+key.slice(0, i) + 0.5) / 2, wy = (+key.slice(i + 1) + 0.5) / 2, tx = Math.floor(wx), ty = Math.floor(wy);
      if (tx < tiles.tx0 || tx > tiles.tx1 || ty < tiles.ty0 || ty > tiles.ty1) continue;
      items.push({ kind: 'crop', depth: wx + wy - 0.1, gx: isoX(wx, wy), gy: isoY(wx, wy), plot });
    }
    for (const id in (state.drops || {})) { const d = state.drops[id]; items.push({ kind: 'drop', depth: d.x + d.y - 0.3, gx: isoX(d.x, d.y), gy: isoY(d.x, d.y), drop: d }); }   // items dropped on the ground
    for (const id in state.boats) { const boat = state.boats[id]; items.push({ kind: 'boat', depth: boat.x + boat.y - 0.25, id, boat }); }   // under its rider
    for (const id in state.players) { const p = state.players[id]; items.push({ kind: 'player', depth: p.x + p.y + (p.lift || 0) * 4, id, p }); }
    return items.sort((a, b2) => a.depth - b2.depth);        // painter's algorithm on x + y
  }

  _drawItem(item, now) {
    const g = this.g;
    if (item.kind === 'structure') return StructureSprites.draw(g, item, item.gx, item.gy);
    if (item.kind === 'built') return StructureSprites.drawBuiltChunk(g, item);
    if (item.kind === 'station') return StructureSprites.drawStation(g, item.type, item.tx, item.ty, this._stationInfo(item));
    if (item.kind === 'doorLeaf') return StructureSprites.drawDoorLeaf(g, item);
    if (item.kind === 'ghost') return StructureSprites.drawGhost(g, item.target, item.gx, item.gy);
    if (item.kind === 'animal') {
      const a = item.animal, sx = isoX(a.x, a.y), sy = isoY(a.x, a.y);
      const me = this.game.local, lvs = me.lv ? me.lv.s : {}, def = AnimalDefs[a.type];
      const close = Math.hypot(a.x - me.x, a.y - me.y), friend = this.game.friendOf(item.id);
      const view = { friend, invite: !friend && close < 2.8 && canBefriendAnimal(a.type) && !a.captor && a.state !== 'flee', near: close < 9, wantNear: close < (def.boss ? 16 : 9), holding: this.game.heldItemId(), ref: def.pony || def.tameable ? (lvs.horsemanship || 1) : (lvs.hunting || 1) };   // level colours compare with the skill you would use on it
      const lift = a.lift || 0;
      if (lift > 0) g.ellipse(sx, sy + 3, 20 * (1 - 0.3 * lift), 7 * (1 - 0.3 * lift), `rgba(0,0,0,${(0.3 * (1 - 0.4 * lift)).toFixed(2)})`);        // the shadow stays on the ground as the pair climbs
      this.animalSprite.draw(a, item.id, sx, sy - lift * FLY_HEIGHT, now, view);
      const holder = a.owner || a.captor;
      if (a.leashed && holder && this.players && this.players[holder]) this._drawLeash(sx, sy, a, this.players[holder]);
      return;
    }
    if (item.kind === 'npc') {                                                           // a villager: drawn with the same sprite as a player
      const n = item.npc, sx = isoX(n.x, n.y), sy = isoY(n.x, n.y), def = Npcs.get(n.type), friend = this.game.friendOf(item.id), close = Math.hypot(n.x - this.game.local.x, n.y - this.game.local.y);
      const pose = this.playerSprite.draw({ id: item.id, slot: [...item.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 8, name: `${n.name} \u00b7 ${def ? def.role : ''}`, appearance: n.look, gear: n.gear, x: n.x, y: n.y, vx: n.vx, vy: n.vy, facing: n.facing, state: n.state === 'walk' ? 'walk' : 'idle', held: '', swingT: 0, hurtT: 0, mount: '', boat: '', emote: '', emoteT: 0 }, item.id, sx, sy, false, now, 0, false);
      const top = pose.headY - 40;
      if (friend || close < 2.8) HeartMeter.draw(g.ctx, sx, top, friend, now);
      if (n.say) this._drawBubble(g, sx, top - 44, n.say);                          // (above the floating +hearts / +xp text that rises from the head)
      return;
    }
    if (item.kind === 'drop') return this._drawDrop(item.gx, item.gy, item.drop, now);
    if (item.kind === 'crop') return PixelCrops.draw(this.ctx, item.gx, item.gy, item.plot);
    if (item.kind === 'boat') return this.boatSprite.draw(item.boat, item.id, isoX(item.boat.x, item.boat.y), isoY(item.boat.x, item.boat.y), now);
    if (item.kind === 'player') {
      const p = item.p, rowPhase = p.boat ? this.boatSprite.phaseOf(p.boat) : 0;
      const wading = !p.boat && !p.mount && this.game.map.tile(Math.floor(p.x), Math.floor(p.y)) === TILE.SHALLOW;
      return this.playerSprite.draw(p, item.id, isoX(p.x, p.y), isoY(p.x, p.y) - (p.lift || 0) * FLY_HEIGHT, item.id === this.game.myId, now, rowPhase, wading);
    }
    const prop = item.prop;
    if (prop.t === 'tree') {
      if (prop.alive) PropSprites.drawTree(g, item.gx, item.gy, prop.v, this.effects.treeShakeX(item.key, now), prop.forage ? prop : null, this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y)));
      else {
        PropSprites.drawStump(g, item.gx, item.gy);
        const fall = this.effects.fall(item.key, now);                                  // just felled: the tree topples, then breaks into logs
        if (fall) PropSprites.drawFallingTree(g, item.gx, item.gy, prop.v, fall.angle, fall.alpha, this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y)));
      }
    } else if (prop.t === 'bush') PropSprites.drawBush(g, item.gx, item.gy, prop);
    else if (prop.t === 'stone') { if (prop.ripe) PropSprites.drawStone(g, item.gx, item.gy, prop.v); }
    else if (prop.t === 'flax') PropSprites.drawFlax(g, item.gx, item.gy, prop);
    else if (prop.t === 'chest') PropSprites.drawChest(g, item.gx, item.gy, !!(this.game.local && this.game.local.looted));
    else if (prop.t === 'clay') { if (prop.ripe) PropSprites.drawClay(g, item.gx, item.gy, prop.v); }
    else if (prop.t === 'mound') { if (prop.ripe) PropSprites.drawMound(g, item.gx, item.gy, prop.v, now); }
    else if (prop.t === 'bottle') { if (prop.ripe) PropSprites.drawBottle(g, item.gx, item.gy, prop.v, now); }
    else if (prop.t === 'barrel') PropSprites.drawBarrel(g, item.gx, item.gy);
    else if (prop.t === 'loot') { if (prop.ripe) this._drawLoot(item.gx, item.gy, prop, now); }
    else if (prop.t === 'cave') PropSprites.drawCave(g, item.gx, item.gy, prop.ring, now);
    else if (prop.t === 'portal') PropSprites.drawPortal(g, item.gx, item.gy, now);
    else if (prop.t === 'furniture') {
      const def = FurnitureDefs.get(prop.id);
      if (def && def.store) {                                                               // a bin: how full it is, and a label with its count
        const key = HomeCrafts.storeKey(this.game.grid, { x: Math.round(prop.x - prop.w / 2), y: Math.round(prop.y - prop.h / 2) }), n = HomeCrafts.storeCount(this.game.worldMap, key), cap = def.store.capacity || 500;
        prop.fill = n / cap;
        InteriorSprites.furniture(g, prop, now);
        const ctx = this.ctx, label = `${ItemDefs[def.store.item].name} ${n} / ${cap}`, x = isoX(prop.x, prop.y), y = isoY(prop.x, prop.y) - (def.height || 20) - 26;
        ctx.font = '600 11px Georgia, serif'; ctx.textAlign = 'center'; const w = ctx.measureText(label).width + 12;
        g.roundRect(x - w / 2, y - 8, w, 16, 6); ctx.fillStyle = 'rgba(10,18,28,.62)'; ctx.fill(); ctx.fillStyle = '#f2efe6'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y);
      } else InteriorSprites.furniture(g, prop, now);
    }
    else if (prop.t === 'tracks') { if (!(this.game.defeated || []).includes(prop.ring)) this._drawTracks(item.gx, item.gy, prop, now); }   // (gone once the young are home)
    else PropSprites.drawWell(g, item.gx, item.gy);
  }

  /** The rope between a leashed animal's neck and its owner's hand. */
  /** How full a stockpile is and which level it (or any upgraded building) is at. */
  _stationInfo(item) {
    const map = this.game.map, key = tileKey(item.tx, item.ty), pile = map.stockpiles[key];
    const fill = pile ? Stockpiles.total(pile) / Math.max(1, Stockpiles.capacity(map, key)) : 0;
    return { fill, level: Buildings.level(map, key) };
  }

  /** An item lying in the world: its `ground` image, or its icon, bobbing gently over a glow in its rarity's colour. */
  _drawLoot(gx, gy, prop, now) {
    const ctx = this.ctx, rarity = ItemDB.rarity(prop.drop), bob = Math.sin(now / 420 + prop.x * 3) * 2;
    const img = SpriteRegistry.itemImage(prop.drop, 'ground') || ItemIcons.image(prop.drop);
    this.g.ellipse(gx, gy, 11, 5, rarity.order ? rarity.color + '66' : 'rgba(0,0,0,.25)');
    if (img) { const size = 26, h = size * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, gx - size / 2, gy - h - 2 + bob, size, h); }
    if (rarity.order) { ctx.fillStyle = rarity.color; ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(now / 300)); ctx.beginPath(); ctx.arc(gx + 9, gy - 22 + bob, 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  }

  /** Small glowing paw prints in a cave (a lost cub's trail): two little prints, pulsing one after the other along the trail. */
  _drawTracks(gx, gy, prop, now) {
    const ctx = this.ctx, wave = 0.5 + 0.5 * Math.sin(now / 420 - prop.v * 0.9);
    for (const [dx, dy, k] of [[-7, -3, 0], [6, 3, 1]]) {
      const x = gx + dx, y = gy + dy, a = 0.35 + 0.55 * (k ? 1 - wave : wave);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 14); glow.addColorStop(0, `rgba(150,230,255,${(a * 0.55).toFixed(2)})`); glow.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.fillStyle = `rgba(210,250,255,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(x, y, 3.4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      for (let t = 0; t < 4; t++) { ctx.beginPath(); ctx.ellipse(x - 3.6 + t * 2.4, y - 3.4 - (t === 1 || t === 2 ? 0.8 : 0), 1, 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  /** A pile someone dropped: the item bobbing on the ground like loot, with its count. */
  /** A pile on the ground. A new one arcs in and bounces (dropped from a hand, or a log off a felled tree); logs lie flat as pixel logs. */
  _drawDrop(gx, gy, d, now) {
    const seen = this.dropSeen || (this.dropSeen = new Map());
    if (!seen.has(d.id)) { if (seen.size > 600) seen.clear(); seen.set(d.id, now); }
    const t = (now - seen.get(d.id)) / 380, lift = t < 1 ? Math.abs(Math.sin(t * Math.PI * 1.5)) * 16 * (1 - t) : 0;
    if (PixelGround[d.item]) PixelGround[d.item](this.ctx, gx, gy, parseInt(d.id.slice(1), 10) || 0, lift);       // a log, a tuft of wool: pixel art lying on the ground
    else { this.ctx.save(); this.ctx.translate(0, -lift); this._drawLoot(gx, gy, { drop: d.item, x: d.x }, now); this.ctx.restore(); }
    if (d.count > 1) { const ctx = this.ctx; ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('x' + d.count, gx + 11, gy - 2); ctx.fillStyle = '#fff'; ctx.fillText('x' + d.count, gx + 11, gy - 2); }
  }

  _drawLeash(sx, sy, animal, owner) {
    const ctx = this.ctx, def = AnimalDefs[animal.type], ox = isoX(owner.x, owner.y), oy = isoY(owner.x, owner.y);
    const ax = sx, ay = sy - (def.pony ? 30 : 18), bx = ox, by = oy - 20, sag = 6 + Math.hypot(bx - ax, by - ay) * 0.12;
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + sag, bx, by); ctx.stroke();
    ctx.strokeStyle = '#c9a66a'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  _drawTapMarker(now) {
    const marker = this.getTapMarker(now);
    if (!marker) return;
    const ctx = this.ctx, pulse = 1 + Math.sin(now / 150) * 0.12;
    ctx.strokeStyle = 'rgba(255,240,170,.9)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.ellipse(isoX(marker.x, marker.y), isoY(marker.x, marker.y), 16 * TILE_SCALE * pulse, 8 * TILE_SCALE * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
