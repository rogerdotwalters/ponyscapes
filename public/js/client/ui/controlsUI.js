'use strict';
/* CLIENT - the Controls window (Menu > Controls): a KEYS tab to rebind every keyboard action (click a key, press the new one; Backspace clears it;
 * a key already used by another action moves to this one) and a MOUSE & TOUCH tab with what clicks and taps do and the tap-to-walk switch. */
class ControlsUI {
  constructor({ panel, tabs, body, closeButton }) {
    this.panel = panel; this.tabs = tabs; this.body = body; this.tab = 'keys'; this.waiting = null; this.tick = 0; this.note = ''; this.scrubbing = false;       // waiting: { id, index } while a key is awaited
    tabs.innerHTML = '<button data-tab="keys">Keys</button><button data-tab="pointer">Mouse &amp; touch</button><button data-tab="music">Soundtrack</button>';
    tabs.addEventListener('click', e => { const t = e.target.closest('button'); if (t) this.show(t.dataset.tab); });
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => this._click(e));
    body.addEventListener('change', e => {
      if (e.target.id === 'trackScrub') { const m = PonyMusic.current; if (m) m.seek(Number(e.target.value)); this.scrubbing = false; return; }
      const set = { ctlTapMove: 'setTapToMove', ctlFixedStick: 'setFixedJoystick', ctlWalkToAct: 'setWalkToAct' }[e.target.id];
      if (set) { Controls[set](e.target.checked); this.refresh(); }
    });
    body.addEventListener('input', e => {
      if (e.target.id === 'trackScrub') { this.scrubbing = true; this._setTimes(Number(e.target.value)); return; }                  // (dragging the scrub bar: show the time, seek on release)
      const kind = { ctlWeatherVol: 'weather', ctlMusicVol: 'music', ctlSfxVol: 'sfx' }[e.target.id];
      if (kind) { GameAudio.setVolume(kind, e.target.value / 100); e.target.parentNode.querySelector('output').textContent = e.target.value + '%'; }
    });
    window.addEventListener('keydown', e => this._onKey(e), true);
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.show(this.tab); }
  close() { this._stopWaiting(); this.panel.hidden = true; }
  show(tab) {
    this.tab = tab; this.note = ''; this._stopWaiting();
    for (const b of this.tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    this.refresh();
  }
  _stopWaiting() { this.waiting = null; Controls.capturing = false; }

  _click(e) {
    const key = e.target.closest('button[data-bind]');
    if (key) {
      const [id, index] = key.dataset.bind.split(':');
      this.waiting = { id, index: Number(index) }; Controls.capturing = true; this.refresh();
      return;
    }
    const act = e.target.closest('button[data-act]');
    if (act) {
      const m = PonyMusic.current;
      if (m && GameAudio.ctx) { if (act.dataset.act === 'next') m.skip(1); else if (act.dataset.act === 'prev') m.skip(-1); else if (m.paused) m.resume(); else m.pause(); }
      else this.note = 'Tap or press a key once to start the sound.';
      this.refresh(); return;
    }
    const track = e.target.closest('button[data-track]');
    if (track) { const m = PonyMusic.current; if (m) { if (track.dataset.track === 'auto') m.auto(); else m.play(track.dataset.track); } if (!GameAudio.ctx) this.note = 'Tap or press a key once to start the sound.'; this.refresh(); return; }
    const reset = e.target.closest('button[data-reset]');
    if (reset) { this._stopWaiting(); if (reset.dataset.reset === 'all') Controls.resetAll(); else Controls.resetAction(reset.dataset.reset); this.refresh(); }
  }

  /** The key the player pressed while a binding is waiting. */
  _onKey(e) {
    if (!this.waiting || !this.isOpen) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { id, index } = this.waiting;
    if (e.code === 'Escape') { this._stopWaiting(); this.refresh(); return; }                                 // changed my mind
    if (e.code === 'Backspace' || e.code === 'Delete') { const old = Controls.keysOf(id)[index]; if (old) Controls.unbind(id, old); this._stopWaiting(); this.refresh(); return; }
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(e.code)) return;   // (modifiers on their own do not count)
    if (Controls.reserved(e.code)) { this.note = `${Controls.label(e.code)} is fixed and cannot be used`; this.refresh(); return; }
    Controls.bind(id, index, e.code); this.note = ''; this._stopWaiting(); this.refresh();
  }

  refresh() {
    clearInterval(this.tick); this.tick = 0;
    this.body.innerHTML = this.tab === 'keys' ? this._keys() : this.tab === 'music' ? this._music() : this._pointer();
    if (this.tab === 'music') this._nowPlaying();
    if (this.tab === 'music') this.tick = setInterval(() => { if (!this.isOpen || this.tab !== 'music') { clearInterval(this.tick); return; } this._nowPlaying(); }, 250);
  }

  /** The Soundtrack player: skip back / forward through the tracks, pause, scrub through the tune, or pick any track (it plays from its beginning).
   *  Auto lets the game choose by weather, danger and place. */
  _music() {
    const m = PonyMusic.current, forced = m ? m.forced : '', paused = !!(m && m.paused), len = m ? Math.floor(m.length()) : 0;
    const row = (t) => `<button class="trackRow${forced === t.id ? ' on' : ''}" data-track="${t.id}" tabindex="-1"><span class="mg">${forced === t.id ? '\u25A0' : '\u25B6'}</span><span class="mt"><b>${t.title}</b><i>${t.blurb}</i></span></button>`;
    this._musicKey = m ? [m.theme, forced, paused].join('|') : '';
    return (this.note ? `<div class="ctlNote">${this.note}</div>` : '') +
      '<div id="trackNow" class="trackNow"></div>' +
      `<div class="scrubRow"><span id="trackTime">0:00</span><input type="range" id="trackScrub" min="0" max="${len}" step="1" value="0"><span id="trackLen">${this._fmt(len)}</span></div>` +
      '<div class="transport">' +
        '<button data-act="prev" tabindex="-1" title="Previous track">\u23EE</button>' +
        `<button data-act="pause" tabindex="-1" title="${paused ? 'Play' : 'Pause'}">${paused ? '\u25B6' : '\u23F8'}</button>` +
        '<button data-act="next" tabindex="-1" title="Next track">\u23ED</button>' +
        `<button data-track="auto" class="autoBtn${forced ? '' : ' on'}" tabindex="-1" title="Let the game choose the music">Auto</button>` +
      '</div>' +
      '<div class="gtitle">Tracks</div>' + PonyMusic.TRACKS.map(row).join('') +
      '<div class="gtitle">Volume</div>' +
      `<label class="admSlide"><span><b>Music</b></span><input type="range" id="ctlMusicVol" min="0" max="100" step="5" value="${Math.round(GameAudio.volume('music') * 100)}"><output>${Math.round(GameAudio.volume('music') * 100)}%</output></label>` +
      '<div class="menunote">Skip or pick a track and it keeps playing, whatever the weather, until you press Auto. Drag the bar to jump to another part of the tune.</div>';
  }
  _fmt(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  _setTimes(sec) { const t = this.body.querySelector('#trackTime'); if (t) t.textContent = this._fmt(sec); }
  /** Keep the player's title, time and scrub bar current (a few times a second); rebuild it if the tune, the pick or the pause changed. */
  _nowPlaying() {
    const el = this.body.querySelector('#trackNow'), m = PonyMusic.current; if (!el || !m) return;
    if ([m.theme, m.forced, m.paused].join('|') !== this._musicKey) { this.refresh(); return; }
    el.textContent = '\u266A ' + m.title + (m.forced ? ' (your pick)' : ' (auto)') + (m.paused ? ' \u2013 paused' : '');
    if (this.scrubbing) return;
    const pos = m.position(), bar = this.body.querySelector('#trackScrub'); if (bar) bar.value = Math.floor(pos);
    this._setTimes(pos);
  }

  _keys() {
    let group = '', html = '';
    for (const a of Controls.actions) {
      if (a.group !== group) { group = a.group; html += `<div class="gtitle">${group}</div>`; }
      const keys = Controls.keysOf(a.id), cells = [0, 1].map(i => {
        const waiting = this.waiting && this.waiting.id === a.id && this.waiting.index === i;
        return `<button class="ctlKey${waiting ? ' wait' : ''}" data-bind="${a.id}:${i}" tabindex="-1">${waiting ? 'press a key...' : Controls.label(keys[i])}</button>`;
      }).join('');
      const changed = !!Controls.map[a.id];
      html += `<div class="ctlRow"><span>${a.label}</span>${cells}<button class="ctlReset" data-reset="${a.id}" tabindex="-1" title="Back to the default"${changed ? '' : ' disabled'}>&#8634;</button></div>`;
    }
    return (this.note ? `<div class="ctlNote">${this.note}</div>` : '') +
      '<div class="ctlHelp">Click a key, then press the one you want. <b>Backspace</b> clears it, <b>Esc</b> cancels. Tool bar slots <b>1-9</b> and <b>Esc</b> are fixed.</div>' +
      html + `<div class="admRow"><button data-reset="all" tabindex="-1"${Controls.isDefault() ? ' disabled' : ''}>Reset all keys</button></div>`;
  }

  _pointer() {
    const slider = (id, name, hint, kind) => { const pct = Math.round(GameAudio.volume(kind) * 100); return `<label class="admSlide"><span><b>${name}</b><small>${hint}</small></span><input type="range" id="${id}" min="0" max="100" step="5" value="${pct}"><output>${pct}%</output></label>`; };
    const rows = CONTROL_POINTER_HELP.map(([what, does]) => `<div class="ctlHelpRow"><b>${what}</b><span>${does}</span></div>`).join('');
    return '<div class="gtitle">Joystick</div>' +
      `<label class="chk"><input type="checkbox" id="ctlFixedStick"${Controls.fixedJoystick ? ' checked' : ''}><span><b>Fixed joystick</b><small>On: the stick stays put and only moves when you drag it, so taps never move it. Off: it floats to wherever your thumb lands.</small></span></label>` +
      '<div class="gtitle">Taps</div>' +
      `<label class="chk"><input type="checkbox" id="ctlWalkToAct"${Controls.walkToAct ? ' checked' : ''}><span><b>Walk to it, then act</b><small>Tap a villager, animal, door, stockpile, crop or shop counter out of reach: walk there and do the action. Off: nothing happens when it is out of reach.</small></span></label>` +
      `<label class="chk"><input type="checkbox" id="ctlTapMove"${Controls.tapToMove ? ' checked' : ''}><span><b>Tap the ground to walk there</b><small>On by default. A tap on bare ground walks there (the joystick and keys still steer). Off: a tap near you uses your tool or interacts instead.</small></span></label>` +
      '<div class="gtitle">Sound</div>' +
      slider('ctlMusicVol', 'Music', `Flute, harp and cello: ${PonyMusic.TITLES.calm} by day, ${PonyMusic.TITLES.storm} in storms, ${PonyMusic.TITLES.battle} in battle and caves. 0 is off.`, 'music') +
      slider('ctlSfxVol', 'Footsteps &amp; bag', 'Your steps, hoofbeats and the bag opening and closing. 0 is off.', 'sfx') +
      slider('ctlWeatherVol', 'Weather sounds', 'Rain, wind and thunder. 0 is off. Browsers only start sound after you tap or press a key.', 'weather') +
      '<div class="gtitle">What clicks and taps do</div>' + rows;
  }
}
