'use strict';
/* CLIENT - HOST ONLY: the Admin page (Menu > Admin). Locked with a code so younger testers leave it alone (not real security: the code is in
 * this file). Behind it:
 *   Testing      a flying test pony; hostile mobs off
 *   Players      hunger and thirst per player (only when vitals are switched on)
 *   World        one movement speed for everything (1-100, 100 = as built), the day / night split, how fast in-game time runs
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
      '<div class="admRow"><button data-preset="day">50% / 50%</button><button data-preset="asBuilt">As built</button></div>';
    for (const input of el.querySelectorAll('input[data-k]')) {
      const k = input.dataset.k;
      input.addEventListener('input', () => this._setLive(k, Number(input.value), input.type === 'range'));
      input.addEventListener('change', () => this._setLive(k, Number(input.value), false));
      input.addEventListener('keydown', e => e.stopPropagation());
    }
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
    this._refreshWorld(); this._refreshExport();
  }
  _refreshWorld() {
    const d = this.draft;
    for (const input of this.worldBox.querySelectorAll('input[data-k]')) if (document.activeElement !== input || input.type === 'range') input.value = d[input.dataset.k];
    const o = k => this.worldBox.querySelector(`[data-o=${k}]`);
    o('globalSpeed').textContent = d.globalSpeed + '%';
    o('dayShare').textContent = `${d.dayShare}% day · ${100 - d.dayShare}% night`;
    const dayMinutes = 24 * 60 / d.gameHoursPerRealHour;
    o('gameHoursPerRealHour').textContent = 'a day = ' + (dayMinutes >= 1 ? +dayMinutes.toFixed(1) + ' real min' : Math.round(dayMinutes * 60) + ' real s');
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
  /** Take a whole set of values: the live ones go to the server now, the trees wait for the next world. */
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
    this._refreshWorld(); this._refreshTrees(); this._refreshExport();
  }
}
