'use strict';
/* CLIENT - the hunger / thirst bars and the clock. Bars turn orange when low and red + pulsing at zero. */
class VitalBar {
  /** @param {{root, fill, label, config:{max,lowThreshold}, words:{ok,low,empty}}} opts */
  constructor({ root, fill, label, config, words }) { Object.assign(this, { root, fill, label, config, words }); this.shown = -1; }

  update(value, mode = 'normal') {
    const key = Math.ceil(value) + '/' + this.config.max + mode;
    if (key === this.shown) return;
    this.shown = key;
    this.root.style.display = mode === 'off' ? 'none' : '';                        // 'off' hides the bar
    this.root.classList.toggle('superficial', mode === 'cosmetic');               // 'superficial' shows it, dashed: it never hurts
    const { max, lowThreshold } = this.config;
    this.fill.style.width = (100 * value / max) + '%';
    const hurts = (CONFIG.sim.vitalModes[mode] || CONFIG.sim.vitalModes.normal).penalty;
    this.root.classList.toggle('low', value > 0 && value <= lowThreshold);
    this.root.classList.toggle('starving', value <= 0 && hurts);
    this.label.textContent = value <= 0 ? this.words.empty : value <= lowThreshold ? this.words.low : this.words.ok;
  }
}

/** The season bar at the top: the season's name and icon, the day in it, a bar that fills as it passes (a notch per day), and a word when a new one begins. */
class SeasonUI {
  constructor({ root }) { this.root = root; this.shown = ''; this.season = null; }
  update(info) {
    const s = info.season, text = `${s.id}|${info.dayInSeason}|${info.length}|${info.year}|${Math.round(info.progress * 400)}`;
    if (text === this.shown) return;
    this.shown = text;
    const q = sel => this.root.querySelector(sel);
    this.root.style.setProperty('--season', s.color); this.root.style.setProperty('--dayw', (100 / info.length) + '%');
    q('.sbIcon').textContent = s.icon; q('.sbName').textContent = s.name;
    q('.sbDay').textContent = `\u00B7 Day ${info.dayInSeason} of ${info.length} \u00B7 Year ${info.year}`;
    q('.sbFill').style.width = (info.progress * 100).toFixed(2) + '%';
    if (this.season && this.season !== s.id) {                                       // a new season: say so for a moment
      const news = q('.sbNews'); news.hidden = false; news.textContent = `${s.icon} ${s.name} has begun!`;
      news.style.animation = 'none'; void news.offsetWidth; news.style.animation = '';
    }
    this.season = s.id;
  }
}

/** The time of day as a picture, not a number: the sun climbing and setting, the moon at night (next to the season bar).
 *  Phases follow the day length on the Admin page (dawn and dusk from GameSettings.dayHours). */
const DayPhases = (() => {
  const LIST = [
    { id: 'predawn',  name: 'Pre-Dawn',        art: 'moon',  color: '#f2c94c' },
    { id: 'morning',  name: 'Morning',         art: 'rise',  color: '#f2c94c' },
    { id: 'noon',     name: 'Noon',            art: 'sun',   color: '#f5c242', ray: '#e8862a' },
    { id: 'highnoon', name: 'High Noon',       art: 'blaze', color: '#f8d548' },
    { id: 'evening',  name: 'Evening',         art: 'sun',   color: '#ee8a2e', ray: '#e0762e' },
    { id: 'glow',     name: "Sun's Last Glow", art: 'rise',  color: '#d8433a' },
    { id: 'night',    name: 'Night',           art: 'night', color: '#e8e0b0' }
  ];
  /** The phase at an hour (0..24). */
  function at(hour) {
    const { dawn, dusk } = GameSettings.dayHours(), mid = (dawn + dusk) / 2, h = hour;
    const id = h >= dawn - 2.5 && h < dawn ? 'predawn' : h >= dawn && h < mid - 2 ? 'morning' : h >= mid - 2 && h < mid - 0.5 ? 'noon'
      : h >= mid - 0.5 && h < mid + 1.25 ? 'highnoon' : h >= mid + 1.25 && h < dusk - 1 ? 'evening' : h >= dusk - 1 && h < dusk + 1.25 ? 'glow' : 'night';
    return LIST.find(p => p.id === id);
  }
  /** Paints a phase's 20 x 20 pixel icon into a canvas (drawn scaled up with hard edges by CSS). */
  function paint(canvas, ph) {
    const g = canvas.getContext('2d'), N = 20, C = 10; canvas.width = N; canvas.height = N; g.clearRect(0, 0, N, N);
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); }, { shade, light } = PixelCharacter.util;
    const disc = (cx, cy, r, fill, cut) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r && (!cut || cut(x, y))) px(x, y, fill(x, y, d)); } };
    const rays = (cx, cy, r, col, dirs) => { for (const a of dirs) { const dx = Math.cos(a), dy = Math.sin(a); for (let k = 0; k < 2; k++) px(Math.round(cx - 0.5 + dx * (r + 2 + k)), Math.round(cy - 0.5 + dy * (r + 2 + k)), col); } };
    const all8 = [0, 1, 2, 3, 4, 5, 6, 7].map(i => i * Math.PI / 4);
    if (ph.art === 'moon' || ph.art === 'night') {                                             // a crescent
      disc(C - 1, C, 6.5, (x, y) => (x < C - 4 ? light(ph.color, 0.2) : ph.color), (x, y) => Math.hypot(x + 0.5 - (C + 2.5), y + 0.5 - (C - 2)) > 5.6);
      if (ph.art === 'night') for (const [x, y] of [[15, 4], [16, 12], [13, 16]]) { px(x, y, '#ffffff'); }
    } else if (ph.art === 'rise') {                                                          // half a sun on the horizon, rays above
      disc(C, 13, 6, (x, y) => (y < 10 ? light(ph.color, 0.18) : ph.color), (x, y) => y < 13);
      rays(C, 13, 6, ph.color, [-Math.PI / 2, -Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 8 * 7 + Math.PI, -Math.PI / 8 * 9 + Math.PI].slice(0, 3));
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) px(C - 0.5 + s * (9 + k) | 0, 12, ph.color);
    } else if (ph.art === 'sun') {                                                           // a round sun with rays all round
      disc(C, C, 5.2, (x, y, d) => (d > 4.2 ? shade(ph.color, 0.9) : ph.color));
      rays(C, C, 5.2, ph.ray || ph.color, all8);
    } else {                                                                                 // high noon: big and blazing, white-hot in the middle
      disc(C, C, 6, (x, y, d) => (d < 2 ? '#fffbe0' : d < 3.6 ? '#fff0a0' : d > 5 ? shade(ph.color, 0.9) : ph.color));
      rays(C, C, 6, ph.color, all8);
    }
  }
  return { LIST, at, paint };
})();

class ClockUI {
  constructor({ root }) { this.root = root; this.shown = ''; this.canvas = root.querySelector('canvas'); this.label = root.querySelector('.sbPhase'); }
  update(hour) {
    const ph = DayPhases.at(hour);
    if (ph.id === this.shown) return;
    this.shown = ph.id; DayPhases.paint(this.canvas, ph);
    this.label.textContent = ph.name; this.root.dataset.phase = ph.id; this.root.title = ph.name;
  }
}
