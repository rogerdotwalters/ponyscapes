'use strict';
/* CLIENT - HOST ONLY: the Admin page (Menu > Admin). Locked with a code so younger testers leave it alone (not real security: the code is in
 * this file). Behind it:
 *   Testing      a flying test pony; hostile mobs off
 *   Players      hunger and thirst per player (only when vitals are switched on)
 *   World        one movement speed for everything (1-100, 100 = as built), the day / night split, how fast in-game time runs
 *   Animals      how far animals notice you (their senses, sharper with level; your Dexterity and Animal Friendship), how fast they flee
 *   Biomes       per biome: how common it is and the nearest to the village it appears (in rings); used from the next world start
 *   Trees        per biome: how many (% of normal) and the most there can be (% of grass tiles); used from the next world start
 *   Export       the values as JSON for js/content/gameSettings.js (download, copy, or paste some back in)
 * Changes are kept in this browser (GameSettings) until they are exported into the game folder. */
const ADMIN_CODE = '112298', ADMIN_UNLOCK_KEY = 'ponyscapes.adminUnlocked';

class SettingsUI {
  constructor({ panel, list, closeButton, game }) {
    this.panel = panel; this.list = list; this.game = game; this.selects = []; this.sendTimer = null; this.pending = {};
    this.draft = GameSettings.readOverride() || GameSettings.sanitize(GameSettings.values);         // what the page shows (trees may be waiting for the next world)
    this._createLock();
    this.body = document.createElement('div'); this.body.className = 'adminBody'; list.appendChild(this.body);
    this._createTesting();
    if (CONFIG.sim.vitals) { this.body.insertAdjacentHTML('beforeend', '<div class="gtitle">Players</div>'); for (let slot = 0; slot < CONFIG.sim.maxPlayers; slot++) this._createRow(slot); }
    this._createWorld();
    this._createFarming();
    this._createAnimals();
    this._createBiomes();
    this._createTrees();
    this._createExport();
    game.events.on('settingsChanged', () => this.isOpen && this.refresh());
    game.events.on('adminChanged', () => this.isOpen && this.refresh());
    closeButton.addEventListener('click', () => this.close());
    this._showLocked();
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this._showLocked(); this.refresh(); }
  close() { this.panel.hidden = true; }

  /* ---- the lock ---- */
  get unlocked() { try { return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1'; } catch (e) { return !!this._unlocked; } }
  set unlocked(on) { this._unlocked = on; try { if (on) sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1'); else sessionStorage.removeItem(ADMIN_UNLOCK_KEY); } catch (e) { /* remembered in memory only */ } }
  _createLock() {
    const el = document.createElement('div'); el.className = 'adminLock';
    el.innerHTML = '<div class="gtitle">Admin</div><p>Enter the admin code to change testing tools and game settings.</p>' +
      '<div class="admRow"><input id="adminCode" type="password" inputmode="numeric" autocomplete="off" placeholder="Code"><button id="adminUnlock">Unlock</button></div><div class="admErr" id="adminErr"></div>';
    this.list.appendChild(el); this.lockBox = el;
    const input = el.querySelector('#adminCode'), err = el.querySelector('#adminErr');
    const tryCode = () => {
      if (input.value.trim() === ADMIN_CODE) { this.unlocked = true; input.value = ''; err.textContent = ''; this._showLocked(); this.refresh(); }
      else { err.textContent = 'That is not the code.'; input.select(); }
    };
    el.querySelector('#adminUnlock').addEventListener('click', tryCode);
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') tryCode(); });       // (typing digits must not move the hotbar)
  }
  _showLocked() { const open = this.unlocked; this.lockBox.hidden = open; this.body.hidden = !open; }

  /* ---- testing aids (host only; the server enforces it) ---- */
  _createTesting() {
    const el = document.createElement('div'); el.className = 'testBox';
    el.innerHTML =
      '<div class="admHead"><div class="gtitle">Testing</div><button class="admLock">Lock</button></div>' +
      '<label class="chk"><input type="checkbox" data-setting="testPony"><span><b>Flying test pony</b><small>A level 12 pegasus appears beside you. Ride it with no Horsemanship needed, then press B (or tap Fly).</small></span></label>' +
      '<label class="chk"><input type="checkbox" data-setting="hostilesOff"><span><b>Hostile mobs off</b><small>Monsters and guardians stop attacking. They still wander around.</small></span></label>';
    for (const box of el.querySelectorAll('input')) box.addEventListener('change', () => this.game.setSetting(box.dataset.setting, box.checked));
    el.querySelector('.admLock').addEventListener('click', () => { this.unlocked = false; this._showLocked(); });
    this.body.appendChild(el); this.testBox = el;
  }

  _createRow(slot) {
    const id = 'p' + (slot + 1), el = document.createElement('div');
    el.className = 'playerRow'; el.dataset.slot = slot;
    const options = Object.entries(CONFIG.sim.vitalModes).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join('');
    el.innerHTML =
      `<div class="who"><i style="background:${CONFIG.sim.slotColors[slot]}"></i>${this.game.playerName(id)}${slot === 0 ? ' (you, host)' : ''}</div>` +
      `<label>Hunger <select data-vital="hunger">${options}</select></label><label>Thirst <select data-vital="thirst">${options}</select></label>`;
    for (const select of el.querySelectorAll('select')) {
      select.addEventListener('change', () => {
        const vital = select.dataset.vital;
        this.game.setVitalModes(id, vital === 'hunger' ? select.value : undefined, vital === 'thirst' ? select.value : undefined);
      });
      this.selects.push({ id, vital: select.dataset.vital, select });
    }
    this.body.appendChild(el);
  }

  /* ---- world: speed, day / night, time ---- */
  _createWorld() {
    const L = GameSettings.LIMITS, el = document.createElement('div'); el.className = 'admBox';
    el.innerHTML = '<div class="gtitle">World <small>(changes right away, for everyone)</small></div>' +
      `<label class="admSlide"><span><b>Global speed</b><small>Everything that moves: players, ponies, animals, villagers, boats. 100 = as built.</small></span><input type="range" data-k="globalSpeed" min="${L.globalSpeed[0]}" max="${L.globalSpeed[1]}" step="1"><output data-o="globalSpeed"></output></label>` +
      `<label class="admSlide"><span><b>Day / night</b><small>How much of each day is daylight. 54 = as built.</small></span><input type="range" data-k="dayShare" min="${L.dayShare[0]}" max="${L.dayShare[1]}" step="1"><output data-o="dayShare"></output></label>` +
      `<label class="admSlide"><span><b>Game time</b><small>In-game hours per real hour. 180 = as built (a day takes 8 real minutes).</small></span><input type="number" data-k="gameHoursPerRealHour" min="${L.gameHoursPerRealHour[0]}" max="${L.gameHoursPerRealHour[1]}" step="1"><output data-o="gameHoursPerRealHour"></output></label>` +
      `<label class="admSlide"><span><b>Time of day</b><small>Jump the clock to an hour of today, for testing. Time then carries on (set Game time to 1 to nearly freeze it).</small></span><input type="range" id="admHour" min="0" max="24" step="0.25"><output id="admHourOut"></output></label>` +
      '<div class="admRow"><button data-hour="6.25">Dawn</button><button data-hour="12">Noon</button><button data-hour="19.25">Dusk</button><button data-hour="23">Night</button><button data-hour="2">Deep night</button></div>' +
      '<div class="admRow"><button data-preset="day">50% / 50%</button><button data-preset="asBuilt">As built</button></div>';
    for (const input of el.querySelectorAll('input[data-k]')) {
      const k = input.dataset.k;
      input.addEventListener('input', () => this._setLive(k, Number(input.value), input.type === 'range'));
      input.addEventListener('change', () => this._setLive(k, Number(input.value), false));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
    const hourInput = el.querySelector('#admHour');
    let hourTimer = null;
    const sendHour = h => { this.hourDragging = false; this.game.setTimeOfDay(h); };
    hourInput.addEventListener('input', () => { this.hourDragging = true; this._showHour(Number(hourInput.value)); if (!hourTimer) hourTimer = setTimeout(() => { hourTimer = null; sendHour(Number(hourInput.value)); }, 100); });
    hourInput.addEventListener('change', () => { clearTimeout(hourTimer); hourTimer = null; sendHour(Number(hourInput.value)); });
    hourInput.addEventListener('keydown', e => e.stopPropagation());
    for (const b of el.querySelectorAll('[data-hour]')) b.addEventListener('click', () => { const h = Number(b.dataset.hour); this._showHour(h); sendHour(h); });
    el.querySelector('[data-preset=day]').addEventListener('click', () => this._setLive('dayShare', 50, false));
    el.querySelector('[data-preset=asBuilt]').addEventListener('click', () => { for (const k of GameSettings.LIVE) this._setLive(k, GameSettings.DEFAULTS[k], false); });
    this.body.appendChild(el); this.worldBox = el;
  }
  /** A live value changed: keep it, and tell the server (a dragged slider sends at most ten times a second). */
  _setLive(k, value, dragging) {
    if (!Number.isFinite(value)) return;
    const [lo, hi] = GameSettings.LIMITS[k];
    this.draft[k] = clamp(Math.round(value), lo, hi);
    GameSettings.saveOverride(this.draft);
    this.pending[k] = this.draft[k];
    const send = () => { this.sendTimer = null; const values = this.pending; this.pending = {}; this.game.setAdmin(values); };
    if (!dragging) { clearTimeout(this.sendTimer); send(); } else if (!this.sendTimer) this.sendTimer = setTimeout(send, 100);
    this._refreshWorld(); this._refreshFarming(); this._refreshAnimals(); this._refreshExport();
  }
  _showHour(h) { const m = Math.round(h * 60) % 1440; this.worldBox.querySelector('#admHourOut').textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  _refreshWorld() {
    const d = this.draft;
    if (!this.hourDragging) { const h = this.game.hour(); this.worldBox.querySelector('#admHour').value = h; this._showHour(h); }
    for (const input of this.worldBox.querySelectorAll('input[data-k]')) if (document.activeElement !== input || input.type === 'range') input.value = d[input.dataset.k];
    const o = k => this.worldBox.querySelector(`[data-o=${k}]`);
    o('globalSpeed').textContent = d.globalSpeed + '%';
    o('dayShare').textContent = `${d.dayShare}% day · ${100 - d.dayShare}% night`;
    const dayMinutes = 24 * 60 / d.gameHoursPerRealHour;
    o('gameHoursPerRealHour').textContent = 'a day = ' + (dayMinutes >= 1 ? +dayMinutes.toFixed(1) + ' real min' : Math.round(dayMinutes * 60) + ' real s');
  }

  /* ---- animals: their senses (how far they notice you) and how you get closer; everyone always moves at full speed ---- */
  _createAnimals() {
    const L = GameSettings.LIMITS, el = document.createElement('div'); el.className = 'admBox';
    const row = (k, name, help) => `<label class="admSlide"><span><b>${name}</b><small>${help} ${GameSettings.DEFAULTS[k]} = as built.</small></span><input type="range" data-k="${k}" min="${L[k][0]}" max="${L[k][1]}" step="1"><output data-o="${k}"></output></label>`;
    el.innerHTML = '<div class="gtitle">Animals &amp; getting close <small>(changes right away, for everyone)</small></div>' +
      '<p class="admNote">There is no running or sneaking: everyone moves at full speed. How close you get before an animal bolts depends on its senses (sharper the higher its level) against your Dexterity and Animal Friendship.</p>' +
      row('animalSense', 'Animal senses', 'How far animals notice you, % of their own senses.') +
      row('senseLevelScale', 'Senses per level', '% farther an animal notices you for each level above 1.') +
      row('fleeLevelScale', 'Flee speed per level', '% faster a fleeing animal runs for each level above 1 (ponies have their own speeds).') +
      row('stealthDex', 'Dexterity', '% closer you get for every 10 levels of Dexterity.') +
      row('stealthFriend', 'Animal Friendship', '% closer you get for every 10 levels of Animal Friendship.') +
      row('stealthCap', 'Most you can get closer', 'The cap on Dexterity and Animal Friendship together, % of an animal\'s senses.') +
      '<p class="admNote" data-o="preview"></p>' +
      '<div class="admRow"><button data-animals-reset>As built</button></div>';
    for (const input of el.querySelectorAll('input[data-k]')) {
      const k = input.dataset.k;
      input.addEventListener('input', () => this._setLive(k, Number(input.value), true));
      input.addEventListener('change', () => this._setLive(k, Number(input.value), false));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
    el.querySelector('[data-animals-reset]').addEventListener('click', () => { for (const k of ['animalSense', 'senseLevelScale', 'fleeLevelScale', 'stealthDex', 'stealthFriend', 'stealthCap']) this._setLive(k, GameSettings.DEFAULTS[k], false); });
    this.body.appendChild(el); this.animalsBox = el;
    this._refreshAnimals();
  }
  _refreshAnimals() {
    if (!this.animalsBox) return;
    const d = this.draft, o = k => this.animalsBox.querySelector(`[data-o=${k}]`);
    for (const input of this.animalsBox.querySelectorAll('input[data-k]')) input.value = d[input.dataset.k];
    o('animalSense').textContent = d.animalSense + '%';
    o('senseLevelScale').textContent = '+' + d.senseLevelScale + '% / level';
    o('fleeLevelScale').textContent = '+' + d.fleeLevelScale + '% / level';
    o('stealthDex').textContent = d.stealthDex + '% / 10 lv';
    o('stealthFriend').textContent = d.stealthFriend + '% / 10 lv';
    o('stealthCap').textContent = 'up to ' + d.stealthCap + '%';
    // a worked example: a deer (moving past it) at level 1 and 10, for a new player and one with 30 Dexterity and Animal Friendship
    const deer = AnimalDefs.deer, base = deer ? deer.detect.walk : 6, sharp = lv => (d.animalSense / 100) * (1 + d.senseLevelScale / 100 * (lv - 1));
    const stealth = n => Math.min(d.stealthCap / 100, ((n - 1) * d.stealthDex + (n - 1) * d.stealthFriend) / 1000), t = v => v.toFixed(1);
    o('preview').textContent = `A deer notices you from: level 1 \u2192 ${t(base * sharp(1))} tiles (new player), ${t(base * sharp(1) * (1 - stealth(30)))} (Dexterity and Animal Friendship 30) \u00b7 level 10 \u2192 ${t(base * sharp(10))} / ${t(base * sharp(10) * (1 - stealth(30)))} tiles`;
  }

  /* ---- seasons and farming: how long a season lasts, and how many days each crop takes to grow (changes right away) ---- */
  _createFarming() {
    const L = GameSettings.LIMITS, el = document.createElement('div'); el.className = 'admBox';
    el.innerHTML = '<div class="gtitle">Seasons &amp; farming <small>(changes right away, for everyone)</small></div>' +
      `<label class="admSlide"><span><b>Season length</b><small>In-game days in each season (spring, summer, autumn, winter). 20 = as built.</small></span><input type="number" data-k="seasonDays" min="${L.seasonDays[0]}" max="${L.seasonDays[1]}" step="1"><output data-o="seasonDays"></output></label>` +
      '<details class="admBiome"><summary><b>Days to grow</b> <small>(watered days until each crop is ripe)</small></summary>' +
      Crops.all().map(c => `<label class="admSlide"><span><b>${c.name}</b><small>${c.seasons.map(s => Seasons.byId(s).name).join(', ')} \u00B7 as built ${c.days}${c.regrow ? ', fruits again in ' + c.regrow : ''}</small></span><input type="number" min="1" max="120" step="1" data-crop="${c.id}"><output data-oc="${c.id}"></output></label>`).join('') +
      '<div class="admRow"><button data-crops-reset>All as built</button></div></details>';
    const season = el.querySelector('[data-k=seasonDays]');
    season.addEventListener('change', () => this._setLive('seasonDays', Number(season.value), false));
    season.addEventListener('keydown', e => e.stopPropagation());
    for (const input of el.querySelectorAll('input[data-crop]')) {
      input.addEventListener('change', () => this._setCrop(input.dataset.crop, Number(input.value)));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
    el.querySelector('[data-crops-reset]').addEventListener('click', () => { this.draft.crops = {}; this._sendCrops(); });
    this.body.appendChild(el); this.farmBox = el;
    this._refreshFarming();
  }
  _setCrop(id, days) {
    const c = Crops.get(id); if (!c || !Number.isFinite(days)) return;
    this.draft.crops = Object.assign({}, this.draft.crops || {});
    if (Math.round(days) === c.days) delete this.draft.crops[id]; else this.draft.crops[id] = clamp(Math.round(days), 1, 120);
    this._sendCrops();
  }
  _sendCrops() { GameSettings.saveOverride(this.draft); this.game.setAdmin({ crops: this.draft.crops }); this._refreshFarming(); this._refreshExport(); }
  _refreshFarming() {
    if (!this.farmBox) return;
    const d = this.draft, season = this.farmBox.querySelector('[data-k=seasonDays]');
    if (document.activeElement !== season) season.value = d.seasonDays;
    this.farmBox.querySelector('[data-o=seasonDays]').textContent = 'a year = ' + (d.seasonDays * 4) + ' days';
    for (const c of Crops.all()) {
      const input = this.farmBox.querySelector(`[data-crop="${c.id}"]`), days = (d.crops || {})[c.id] || c.days;
      if (document.activeElement !== input) input.value = days;
      this.farmBox.querySelector(`[data-oc="${c.id}"]`).textContent = (d.crops || {})[c.id] ? days + ' days (changed)' : days + ' days';
    }
  }

  /* ---- biomes: how common, and how far out they start (nested, folded away) ---- */
  /** "The Heartland, 70% of the way out" for a `from` in rings. */
  static ringSpot(from, short) {
    if (!(from > 0)) return 'everywhere';
    const index = Math.min(Rings.size - 1, Math.floor(from)), ring = Rings.all().find(r => r.index === index), pct = Math.round((from - index) * 100), name = ring ? ring.name : 'ring ' + index;
    return short ? name.replace(/^The /, '') + ' ' + pct + '%' : 'from ' + name + (pct ? `, ${pct}% of the way out` : '');
  }
  _createBiomes() {
    const el = document.createElement('details'); el.className = 'admBox admTrees';
    const rarities = GameSettings.BIOME_RARITIES.map(r => `<option value="${r}">${r[0].toUpperCase() + r.slice(1)}</option>`).join('');
    el.innerHTML = '<summary><b>Biomes</b> <small>(used from the next time a world is started or continued)</small></summary>' +
      '<p class="admNote">Rarity: how often a region of the map is this biome (Never = not at all). Starts: the nearest to the village it appears, in rings ' +
      '(0.7 = the outer edge of the Heartland, 2.5 = halfway through the Deepwood); from there outward it can turn up anywhere. The village is always meadow. New land only.</p>' +
      this._biomes().map(id => `<details class="admBiome" data-bb="${id}"><summary>${Biomes.get(id).name}<small data-bsum="${id}"></small></summary>` +
        `<label class="admSlide"><span><b>Rarity</b></span><select data-bb="${id}" data-f="rarity">${rarities}</select><output></output></label>` +
        `<label class="admSlide"><span><b>Starts</b></span><input type="range" min="0" max="${Rings.size}" step="0.05" data-bb="${id}" data-f="from"><output data-bo="${id}"></output></label>` +
        `<div class="admRow"><button data-breset="${id}">As built</button></div></details>`).join('') +
      '<div class="admPending" hidden>Biome changes are saved: they apply when you next start or continue a world.</div>';
    for (const input of el.querySelectorAll('[data-bb][data-f]')) {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => this._setBiome(input.dataset.bb, input.dataset.f, input.dataset.f === 'from' ? Number(input.value) : input.value));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
    for (const b of el.querySelectorAll('[data-breset]')) b.addEventListener('click', () => { delete this.draft.biomes[b.dataset.breset]; this._saveBiomes(); });
    this.body.appendChild(el); this.biomesBox = el;
  }
  _setBiome(id, field, value) {
    const def = Biomes.get(id), b = Object.assign({}, (this.draft.biomes || {})[id] || {});
    const asBuilt = field === 'rarity' ? value === def.rarity : Math.abs(value - (def.from || 0)) < 1e-6;
    if (asBuilt) delete b[field]; else b[field] = value;
    this.draft.biomes = this.draft.biomes || {};
    if (Object.keys(b).length) this.draft.biomes[id] = b; else delete this.draft.biomes[id];
    this._saveBiomes();
  }
  _saveBiomes() { this.draft.biomes = GameSettings.sanitizeBiomes(this.draft.biomes); GameSettings.saveOverride(this.draft); this._refreshBiomes(); this._refreshExport(); }
  _refreshBiomes() {
    if (!this.biomesBox) return;
    const changed = this.draft.biomes || {};
    for (const id of this._biomes()) {
      const def = Biomes.get(id), s = Object.assign({ rarity: def.rarity, from: def.from || 0 }, changed[id] || {}), box = this.biomesBox.querySelector(`details[data-bb="${id}"]`);
      box.querySelector('[data-f=rarity]').value = s.rarity;
      const range = box.querySelector('[data-f=from]'); if (document.activeElement !== range) range.value = s.from;
      box.querySelector(`[data-bo="${id}"]`).textContent = SettingsUI.ringSpot(s.from, true);
      box.querySelector(`[data-bsum="${id}"]`).textContent = ` ${s.rarity} · ${SettingsUI.ringSpot(s.from)}` + (changed[id] ? ' (changed)' : '');
      box.classList.toggle('changed', !!changed[id]);
    }
    this.biomesBox.querySelector('.admPending').hidden = JSON.stringify(changed) === JSON.stringify(GameSettings.values.biomes || {});
  }

  /* ---- trees per biome (nested, folded away) ---- */
  _biomes() { return Biomes.ids().filter(id => !Biomes.get(id).terrainOnly); }
  _createTrees() {
    const el = document.createElement('details'); el.className = 'admBox admTrees';
    const max = Math.round(TERRAIN.treeMax * 100);
    el.innerHTML = '<summary><b>Trees per biome</b> <small>(used from the next time a world is started or continued)</small></summary>' +
      '<p class="admNote">Amount: % of the normal number of trees. Max: the most tree cover there can be, as % of grass tiles (the game\'s own cap is ' + max + '%). New land only: places already seen keep their trees.</p>' +
      this._biomes().map(id => `<details class="admBiome" data-b="${id}"><summary>${Biomes.get(id).name}<small data-sum="${id}"></small></summary>` +
        `<label class="admSlide"><span><b>Amount</b></span><input type="range" min="0" max="300" step="5" data-b="${id}" data-f="amount"><output data-o="${id}-amount"></output></label>` +
        `<label class="admSlide"><span><b>Max</b></span><input type="range" min="0" max="100" step="1" data-b="${id}" data-f="max"><output data-o="${id}-max"></output></label>` +
        `<div class="admRow"><button data-reset="${id}">As built</button></div></details>`).join('') +
      '<div class="admPending" hidden>Tree changes are saved: they apply when you next start or continue a world.</div>';
    for (const input of el.querySelectorAll('input[data-b]')) {
      input.addEventListener('input', () => this._setTree(input.dataset.b, input.dataset.f, Number(input.value)));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
    for (const b of el.querySelectorAll('[data-reset]')) b.addEventListener('click', () => { delete this.draft.trees[b.dataset.reset]; this._saveTrees(); });
    this.body.appendChild(el); this.treesBox = el;
  }
  _setTree(biome, field, value) {
    const t = Object.assign({}, this.draft.trees[biome] || {});
    const asBuilt = field === 'amount' ? value === 100 : value === Math.round(TERRAIN.treeMax * 100);
    if (asBuilt) delete t[field]; else t[field] = value;
    if (Object.keys(t).length) this.draft.trees[biome] = t; else delete this.draft.trees[biome];
    this._saveTrees();
  }
  _saveTrees() { GameSettings.saveOverride(this.draft); this._refreshTrees(); this._refreshExport(); }
  _refreshTrees() {
    const max = Math.round(TERRAIN.treeMax * 100);
    for (const id of this._biomes()) {
      const t = this.draft.trees[id] || {}, amount = t.amount === undefined ? 100 : t.amount, cap = t.max === undefined ? max : t.max;
      const box = this.treesBox.querySelector(`details[data-b="${id}"]`);
      box.querySelector('[data-f=amount]').value = amount; box.querySelector('[data-f=max]').value = cap;
      box.querySelector(`[data-o="${id}-amount"]`).textContent = amount + '%';
      box.querySelector(`[data-o="${id}-max"]`).textContent = cap + '%';
      box.querySelector(`[data-sum="${id}"]`).textContent = this.draft.trees[id] ? ` amount ${amount}% · max ${cap}%` : ' as built';
      box.classList.toggle('changed', !!this.draft.trees[id]);
    }
    this.treesBox.querySelector('.admPending').hidden = JSON.stringify(this.draft.trees) === JSON.stringify(GameSettings.values.trees);
  }

  /* ---- export / import ---- */
  _createExport() {
    const el = document.createElement('div'); el.className = 'admBox';
    el.innerHTML = '<div class="gtitle">Save into the game folder</div>' +
      '<p class="admNote">These settings live in <code>public/js/content/gameSettings.js</code>. Your changes here are kept in this browser; export them and paste the JSON into that file (or replace the file with the download) so everyone gets them.</p>' +
      '<div class="admRow"><button data-x="json" class="primary">Export JSON</button><button data-x="js">Download gameSettings.js</button><button data-x="copy">Copy</button></div>' +
      '<textarea class="admJson" spellcheck="false" rows="8"></textarea>' +
      '<div class="admRow"><button data-x="apply">Use the JSON above</button><button data-x="reset">Back to the file\'s values</button><span class="admMsg"></span></div>';
    const text = el.querySelector('textarea'), msg = el.querySelector('.admMsg'), say = t => { msg.textContent = t; clearTimeout(this.msgTimer); this.msgTimer = setTimeout(() => { msg.textContent = ''; }, 3000); };
    text.addEventListener('keydown', e => e.stopPropagation());
    const download = (name, body, type) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-x]'); if (!b) return;
      const json = GameSettings.toJSON(this.draft);
      if (b.dataset.x === 'json') { text.value = json; download('gameSettings.json', json + '\n', 'application/json'); say('Downloaded gameSettings.json'); }
      else if (b.dataset.x === 'js') { download('gameSettings.js', SettingsUI.fileText(json), 'text/javascript'); say('Put it at public/js/content/gameSettings.js'); }
      else if (b.dataset.x === 'copy') { text.value = json; text.select(); try { navigator.clipboard.writeText(json).then(() => say('Copied'), () => say('Select the text and copy it')); } catch (err) { say('Select the text and copy it'); } }
      else if (b.dataset.x === 'apply') {
        let raw; try { raw = JSON.parse(text.value.slice(text.value.indexOf('{'), text.value.lastIndexOf('}') + 1)); } catch (err) { say('That is not JSON'); return; }
        this._replace(GameSettings.sanitize(raw)); say('Applied');
      } else if (b.dataset.x === 'reset') { if (confirm('Go back to the values in js/content/gameSettings.js?')) { GameSettings.clearOverride(); this._replace(GameSettings.sanitize(GameSettings.file), true); say('Back to the file'); } }
    });
    this.body.appendChild(el); this.exportBox = el;
  }
  /** Take a whole set of values: the live ones go to the server now, the trees and biomes wait for the next world. */
  _replace(values, fromFile) {
    this.draft = values;
    if (!fromFile) GameSettings.saveOverride(values);
    const live = {}; for (const k of GameSettings.LIVE) live[k] = values[k];
    this.game.setAdmin(live);
    this.refresh();
  }
  _refreshExport() { this.exportBox.querySelector('textarea').value = GameSettings.toJSON(this.draft); }
  static fileText(json) {
    return "'use strict';\n/* GAME SETTINGS - written by the Admin page (Menu > Admin > Download gameSettings.js). See the comments in the original file for what each value means. */\n" +
      'window.PONYSCAPES_SETTINGS = ' + json + ';\n';
  }

  /** Show what everything is now (from the latest snapshot; slots nobody has joined yet show the default). */
  refresh() {
    const players = this.game.latestPlayers();
    for (const row of this.panel.querySelectorAll('.playerRow')) {            // names can change as people join and leave
      const slot = Number(row.dataset.slot), who = row.querySelector('.who');
      if (who) who.innerHTML = `<i style="background:${CONFIG.sim.slotColors[slot]}"></i>${LobbyUI.escape(this.game.playerName('p' + (slot + 1)))}${slot === 0 ? ' (you, host)' : ''}`;
    }
    for (const box of (this.testBox ? this.testBox.querySelectorAll('input') : [])) box.checked = !!(this.game.settings && this.game.settings[box.dataset.setting]);
    for (const { id, vital, select } of this.selects) {
      const p = players[id];
      select.value = p ? p[vital + 'Mode'] : 'normal';
    }
    for (const k of GameSettings.LIVE) if (!(k in this.pending)) this.draft[k] = GameSettings.values[k];      // (the server's values win, unless we are mid-drag)
    this.draft.crops = Object.assign({}, GameSettings.values.crops || {});
    this._refreshWorld(); this._refreshFarming(); this._refreshAnimals(); this._refreshBiomes(); this._refreshTrees(); this._refreshExport();
  }
}
