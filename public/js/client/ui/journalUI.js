'use strict';
/* CLIENT - the Journal.
 *   SKILLS tab: every skill with its level and progress, and under each one the attributes it trains "under the surface".
 *   TREASURE MAP tab: the mini map of the area around where a treasure map you read leads, with an X on the spot. */
const SKILL_GLYPH = { woodcutting: '\u2692', foraging: '\u2740', fishing: '\u224B', hunting: '\u27B6', building: '\u2302', crafting: '\u270E', digging: '\u26CF', horsemanship: '\u265E' };
const MINIMAP_RADIUS = 24, MINIMAP_TILE_PX = 4;
const MINIMAP_COLORS = { [TILE.GRASS]: '#6aa84f', [TILE.DIRT]: '#a98258', [TILE.STONE]: '#a9a59c', [TILE.WATER]: '#2c6b99', [TILE.SAND]: '#dccb94', [TILE.CLAY]: '#b8734a', [TILE.SHALLOW]: '#7bc3dc' };
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];      // world axes: +x east, +y south

class JournalUI {
  constructor({ panel, tabs, body, closeButton, game }) {
    this.panel = panel; this.tabs = tabs; this.body = body; this.game = game; this.tab = 'skills'; this.mapCache = {}; this.sinceRefresh = 0;
    closeButton.addEventListener('click', () => this.close());
    tabs.innerHTML = '<button data-tab="skills">Skills</button><button data-tab="map">Treasure Maps</button>';
    tabs.addEventListener('click', e => { const t = e.target.closest('button'); if (t) this.show(t.dataset.tab); });
    game.events.on('progressChanged', () => this.isOpen && this.tab === 'skills' && this.refresh());
    game.events.on('treasureChanged', () => this.isOpen && this.refresh());
    game.events.on('levelup', () => this.isOpen && this.tab === 'skills' && this.refresh());
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  show(tab) { this.tab = tab; this.refresh(); }
  openTab(tab) { this.tab = tab; this.open(); }
  /** The map tab keeps your marker moving while it is open. */
  tick(frameMs) { if (this.isOpen && this.tab === 'map' && (this.sinceRefresh += frameMs) > 400) { this.sinceRefresh = 0; this._drawMapOverlay(); } }

  refresh() {
    this.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    if (this.tab === 'skills') this._renderSkills(); else this._renderMap();
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
      `<div class="mapinfo" id="mapInfo"></div>` +
      `<div class="mapnav">${maps.length > 1 ? `<button id="mapNext">Next map (${g.mapIndex + 1}/${maps.length})</button>` : ''}</div>`;
    const next = this.body.querySelector('#mapNext');
    if (next) next.addEventListener('click', () => { g.mapIndex = (g.mapIndex + 1) % maps.length; this._renderMap(); });
    this._drawMapOverlay();
  }

  /** Terrain around the treasure, drawn once per map and cached (it uses the pure terrain function: no chunks are generated). */
  _terrainLayer(entry) {
    if (this.mapCache[entry.key]) return this.mapCache[entry.key];
    const R = MINIMAP_RADIUS, px = MINIMAP_TILE_PX, size = (2 * R + 1) * px, layer = document.createElement('canvas');
    layer.width = layer.height = size;
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
    ctx.drawImage(this._terrainLayer(entry), 0, 0);
    ctx.strokeStyle = 'rgba(70,45,20,.9)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
    const c = (R + 0.5) * px, pulse = 1 + 0.15 * Math.sin(performance.now() / 300);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3.2; ctx.beginPath();                          // the X marks the spot
    ctx.moveTo(c - 7 * pulse, c - 7 * pulse); ctx.lineTo(c + 7 * pulse, c + 7 * pulse); ctx.moveTo(c + 7 * pulse, c - 7 * pulse); ctx.lineTo(c - 7 * pulse, c + 7 * pulse); ctx.stroke();
    const me = g.local, dx = me.x - (entry.tx + 0.5), dy = me.y - (entry.ty + 0.5), inside = Math.abs(dx) <= R && Math.abs(dy) <= R;
    if (inside) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c + dx * px, c + dy * px, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else {                                                                                       // off the map: an arrow on the border pointing at you
      const a = Math.atan2(dy, dx), r = size / 2 - 9, ex = size / 2 + Math.cos(a) * r, ey = size / 2 + Math.sin(a) * r;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = 'rgba(40,25,10,.85)'; ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.fillText('N', size / 2, 14);      // world north is up
    const dist = Math.hypot(dx, dy), heading = COMPASS[(Math.round(Math.atan2(-dy, -dx) / (Math.PI / 4)) + 8) % 8];
    const info = this.body.querySelector('#mapInfo');
    if (info) info.innerHTML = dist < 3 ? '<b>You are right on top of it!</b> Dig with the shovel.' : `The X is about <b>${Math.round(dist)}</b> tiles <b>${heading}</b> of you. The white dot is you.`;
  }
}
