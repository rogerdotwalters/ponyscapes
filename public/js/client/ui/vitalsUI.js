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

class ClockUI {
  constructor({ root }) { this.root = root; this.shown = ''; }

  update(hour) {
    const phase = DayCycle.phase(hour), icon = phase === 'night' ? '\u263E' : phase === 'day' ? '\u2600' : '\u25D0';
    const text = icon + ' ' + DayCycle.format(hour);
    if (text === this.shown) return;
    this.shown = text; this.root.textContent = text; this.root.dataset.phase = phase;
  }
}
