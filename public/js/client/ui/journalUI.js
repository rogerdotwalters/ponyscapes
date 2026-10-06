'use strict';
/* CLIENT - the Journal.
 *   SKILLS tab: every skill with its level and progress, and under each one the attributes it trains "under the surface".
 *   TREASURE MAP tab: the mini map of the area around where a treasure map you read leads, with an X on the spot. */
const SKILL_GLYPH = { woodcutting: '\u2692', foraging: '\u2740', fishing: '\u224B', hunting: '\u27B6', building: '\u2302', crafting: '\u270E', digging: '\u26CF', horsemanship: '\u265E', friendship: '\u2665', animal_friendship: '\u2766' };
const MINIMAP_RADIUS = 24, MINIMAP_TILE_PX = 4;
const MINIMAP_COLORS = { [TILE.GRASS]: '#6aa84f', [TILE.DIRT]: '#a98258', [TILE.STONE]: '#a9a59c', [TILE.WATER]: '#2c6b99', [TILE.SAND]: '#dccb94', [TILE.CLAY]: '#b8734a', [TILE.SHALLOW]: '#7bc3dc' };
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];      // world axes: +x east, +y south

class JournalUI {
  constructor({ panel, tabs, body, closeButton, game }) {
    this.panel = panel; this.tabs = tabs; this.body = body; this.game = game; this.tab = 'skills'; this.mapCache = {}; this.sinceRefresh = 0;
    closeButton.addEventListener('click', () => this.close());
    tabs.innerHTML = '<button data-tab="skills">Skills</button><button data-tab="friends">Friends</button><button data-tab="map">Treasure Maps</button>';
    tabs.addEventListener('click', e => { const t = e.target.closest('button'); if (t) this.show(t.dataset.tab); });
    game.events.on('progressChanged', () => this.isOpen && this.tab === 'skills' && this.refresh());
    game.events.on('treasureChanged', () => this.isOpen && this.refresh());
    game.events.on('levelup', () => this.isOpen && this.tab === 'skills' && this.refresh());
    game.events.on('friendsChanged', () => this.isOpen && this.tab === 'friends' && this.refresh());
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  show(tab) { this.tab = tab; this.refresh(); }
  openTab(tab) { this.tab = tab; this.open(); }
  /** The map tab keeps your marker moving while it is open. */
  tick(frameMs) {
    if (!this.isOpen) return;
    if (this.tab === 'map' && (this.sinceRefresh += frameMs) > 400) { this.sinceRefresh = 0; this._drawMapOverlay(); }
    else if (this.tab === 'friends' && (this.sinceRefresh += frameMs) > 70) { this.sinceRefresh = 0; this._paintHearts(); }       // the metallic gleam and electric sparks move
  }

  refresh() {
    this.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    if (this.tab === 'skills') this._renderSkills(); else if (this.tab === 'friends') this._renderFriends(); else this._renderMap();
  }

  /* ---------------- friends ---------------- */
  _renderFriends() {
    const g = this.game, lv = g.local.lv || defaultLevels(), E = LobbyUI.escape;
    const limit = (skill, who) => { const level = lv.s[skill] || 1, cap = Friendship.capFor(level), info = Friendship.info(cap), next = cap < Friendship.MAX_LEVEL ? ` &middot; <small>next colour at ${SkillDefs[skill].name} ${Friendship.skillFor(cap + 1)}</small>` : ' &middot; <small>the highest colour</small>';
      return `<div class="flimit"><span class="sglyph">${SKILL_GLYPH[skill]}</span><b>${SkillDefs[skill].name} ${level}</b> lets you be <i style="color:${info.color}">${info.name}</i> friends with ${who}${next}</div>`; };
    const row = (id, name, sub, bond) => `<div class="frow"><canvas class="fheart" data-id="${E(id)}" width="240" height="56"></canvas><div class="finfo"><b>${E(name)}</b><small>${sub || (bond ? Friendship.info(bond.level).name + ' friends' : 'not met yet')}</small></div></div>`;
    const people = Object.values(g.npcs).map(n => { const def = Npcs.get(n.type); const b = g.friendOf(n.id); return row(n.id, n.name, (def ? def.role : '') + ' &middot; ' + (b ? Friendship.info(b.level).name + ' friends' : 'not met yet'), b); }).join('');
    const animals = Object.keys(g.friends).filter(id => !g.npcs[id] && g.beingTypes[id]).map(id => { const d = AnimalDefs[g.beingTypes[id]], b = g.friendOf(id); return row(id, d ? d.name : 'Animal', b ? Friendship.info(b.level).name + ' friends' : '', b); }).join('');
    this.body.innerHTML = `<div class="jhead">How close can you get? <small>the colour is set by your skills</small></div>${limit('friendship', 'people')}${limit('animal_friendship', 'animals')}` +
      `<div class="jhead">People</div>${people || '<div class="gnone">Nobody in sight yet.</div>'}` +
      `<div class="jhead">Animals</div>${animals || '<div class="gnone">Pet, feed or spend time with an animal to make a friend. Monsters cannot be befriended.</div>'}`;
    this._paintHearts();
  }
  _paintHearts() {
    const now = performance.now();
    for (const canvas of this.body.querySelectorAll('canvas.fheart')) {
      if (typeof canvas.getContext !== 'function') continue;
      const ctx = canvas.getContext('2d'), bond = this.game.friendOf(canvas.dataset.id);
      const k = 1.7; ctx.setTransform(2 * k, 0, 0, 2 * k, 0, 0); ctx.clearRect(0, 0, 120 / k, 28 / k); HeartMeter.draw(ctx, 31, 8.3, bond, now, { faint: !bond });      // (a bigger meter than the one over a head)
    }
  }

  /* ---------------- skills ---------------- */
  _renderSkills() {
    const g = this.game, lv = g.local.lv || defaultLevels(), xp = g.progress || { s: {}, a: {} };
    const bar = (level, points) => `<div class="bar"><i style="width:${Math.round(100 * Skills.progress(points).fraction)}%"></i></div>`;
    const attrs = Object.keys(AttributeDefs).map(k => {
      const d = AttributeDefs[k];
      return `<div class="arow" title="${d.effect}"><span class="aname">${d.short}</span><span class="alvl">${lv.a[k]}</span>${bar(lv.a[k], (xp.a || {})[k] || 0)}<span class="aeff">${d.effect}</span></div>`;
    }).join('');
    const skills = Object.keys(SkillDefs).map(k => {
      const d = SkillDefs[k], points = (xp.s || {})[k] || 0, pr = Skills.progress(points);
      const tags = Object.entries(d.attrs).map(([a, share]) => `<b>${AttributeDefs[a].short}</b> ${Math.round(share * 100)}%`).join(' &middot; ');
      return `<div class="srow"><span class="sglyph">${SKILL_GLYPH[k] || '*'}</span><span class="sname">${d.name}</span><span class="slvl">${lv.s[k]}</span>${bar(lv.s[k], points)}` +
             `<span class="sxp">${pr.need ? `${pr.into} / ${pr.need} xp` : 'max'}</span><span class="stags">trains ${tags}</span></div>`;
    }).join('');
    const total = Object.values(lv.s).reduce((a, b) => a + b, 0);
    this.body.innerHTML = `<div class="jsum">Total skill level <b>${total}</b></div>` +
      `<div class="jhead">Attributes <small>every skill trains these under the surface</small></div><div class="jattrs">${attrs}</div>` +
      `<div class="jhead">Skills</div><div class="jskills">${skills}</div>`;
  }

  /* ---------------- treasure map ---------------- */
  _renderMap() {
    const g = this.game, maps = g.treasureMaps;
    if (!maps.length) {
      this.body.innerHTML = '<div class="gempty">No treasure maps yet.<br>Find a <b>message in a bottle</b> (buried under a sand mound: dig it up with the shovel, or floating in the shallows), hold it and press Use to open it, then use the <b>treasure map</b> to add it here.</div>';
      return;
    }
    const entry = maps[Math.min(g.mapIndex, maps.length - 1)], size = (2 * MINIMAP_RADIUS + 1) * MINIMAP_TILE_PX;
    this.body.innerHTML = `<div class="mapwrap"><canvas id="miniMap" width="${size}" height="${size}"></canvas></div>` +
      `<div class="mapinfo" id="mapInfo">${entry.kind === 'dungeon' ? `<b>Cave in ${g.map.layers.rings.def(entry.ring).name}</b>: the guardian waits inside. Defeat it to open the next ring.` : ''}</div>` +
      `<div class="mapnav">${maps.length > 1 ? `<button id="mapNext">Next map (${g.mapIndex + 1}/${maps.length})</button>` : ''}</div>`;
    const next = this.body.querySelector('#mapNext');
    if (next) next.addEventListener('click', () => { g.mapIndex = (g.mapIndex + 1) % maps.length; this._renderMap(); });
    this._drawMapOverlay();
  }

  /** Terrain around the treasure, drawn once per map and cached (it uses the pure terrain function: no chunks are generated). */
  _terrainLayer(entry) {
    if (this.mapCache[entry.key]) return this.mapCache[entry.key];
    const R = Math.ceil(MINIMAP_RADIUS * 1.5) + 3, px = MINIMAP_TILE_PX, size = (2 * R + 1) * px, layer = document.createElement('canvas');      // (bigger than the view: it is turned 45 degrees)
    layer.width = layer.height = size; layer.R = R;
    const ctx = layer.getContext('2d'), T = this.game.map.terrain;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const tx = entry.tx + dx, ty = entry.ty + dy, tile = T.tile(tx, ty), x = (dx + R) * px, y = (dy + R) * px;
      ctx.fillStyle = MINIMAP_COLORS[tile] || '#6aa84f'; ctx.fillRect(x, y, px, px);
      if (tile === TILE.GRASS && T.hasTree(tx, ty, tile)) { ctx.fillStyle = '#2f6a35'; ctx.fillRect(x + 1, y + 1, px - 2, px - 2); }
    }
    return (this.mapCache[entry.key] = layer);
  }

  _drawMapOverlay() {
    const canvas = this.body.querySelector('#miniMap'), g = this.game, maps = g.treasureMaps;
    if (!canvas || !maps.length) return;
    const entry = maps[Math.min(g.mapIndex, maps.length - 1)], R = MINIMAP_RADIUS, px = MINIMAP_TILE_PX, size = canvas.width, ctx = canvas.getContext('2d');
    const layer = this._terrainLayer(entry);
    ctx.fillStyle = '#2c6b99'; ctx.fillRect(0, 0, size, size);
    const K1 = 1.0, K2 = 0.5;                                                                  // the same 2:1 isometric projection as the world and the main map
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.transform(K1, K2, -K1, K2, 0, 0);
    ctx.drawImage(layer, -(layer.R + 0.5) * px, -(layer.R + 0.5) * px); ctx.restore();
    ctx.strokeStyle = 'rgba(70,45,20,.9)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
    const c = (R + 0.5) * px, pulse = 1 + 0.15 * Math.sin(performance.now() / 300);
    if (entry.kind === 'dungeon') {                                                              // a cave scroll marks a cave mouth, not buried treasure
      ctx.fillStyle = '#3a1f5a'; ctx.strokeStyle = '#e8d0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c, c, 9, Math.PI, 0); ctx.lineTo(c + 9, c + 7); ctx.lineTo(c - 9, c + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#07070c'; ctx.beginPath(); ctx.arc(c, c + 2, 4, Math.PI, 0); ctx.lineTo(c + 4, c + 7); ctx.lineTo(c - 4, c + 7); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3.2; ctx.beginPath();                          // the X marks the spot
      ctx.moveTo(c - 7 * pulse, c - 7 * pulse); ctx.lineTo(c + 7 * pulse, c + 7 * pulse); ctx.moveTo(c + 7 * pulse, c - 7 * pulse); ctx.lineTo(c - 7 * pulse, c + 7 * pulse); ctx.stroke();
    }

    const me = g.local, dx = me.x - (entry.tx + 0.5), dy = me.y - (entry.ty + 0.5);
    const sx = (dx - dy) * K1 * px, sy = (dx + dy) * K2 * px, inside = Math.abs(sx) <= size / 2 - 6 && Math.abs(sy) <= size / 2 - 6;     // you, as the screen sees it
    if (inside) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c + sx, c + sy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else {                                                                                       // off the map: an arrow on the border pointing at you
      const a = Math.atan2(sy, sx), r = size / 2 - 9, ex = size / 2 + Math.cos(a) * r, ey = size / 2 + Math.sin(a) * r;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    MapUI.compass(ctx, size - 20, 20, K1, K2);                                                  // north is up-right
    const dist = Math.hypot(dx, dy), heading = COMPASS[(Math.round(Math.atan2(-sy, -sx) / (Math.PI / 4)) + 8) % 8];      // north is UP ON SCREEN
    const info = this.body.querySelector('#mapInfo');
    if (info) info.innerHTML = entry.kind === 'dungeon' ? (dist < 3 ? '<b>You are at the cave mouth.</b> Press Use to go in.' : `The <b>cave</b> in <b>${g.map.layers.rings.def(entry.ring).name}</b> is about <b>${Math.round(dist)}</b> tiles <b>${heading}</b> of you. Its guardian waits inside.`) : dist < 3 ? '<b>You are right on top of it!</b> Dig with the shovel.' : `The X is about <b>${Math.round(dist)}</b> tiles <b>${heading}</b> of you. The white dot is you.`;
  }
}
