'use strict';
/* CLIENT - the controller guide: a picture of the pad with what every button does, printed with the names of the pad in use (Switch by default).
 * It is the top of Menu > Controls > Controller, and it is the ONE pop-up shown the first time a controller is used (GamepadIntro; reopen it from that tab).
 * Where the Switch layout is positional, so is this picture: A is the right face button, B the bottom one, X the top, Y the left. */
const PAD_GUIDE = {
  // button: [x, y of the button, route of the leader line (flat x,y list), label x, label y, 'start'|'end'|'middle', what it does]
  ZL:     { at: [295, 92],  route: [262, 92, 205, 60],                      label: [200, 60],  anchor: 'end',   text: 'Pony power' },
  L:      { at: [295, 121], route: [262, 121, 205, 100],                    label: [200, 100], anchor: 'end',   text: 'Fly / land' },
  LSTICK: { at: [290, 205], route: [262, 205, 205, 205],                    label: [200, 205], anchor: 'end',   text: 'Move  (press: Bag)' },
  DPAD:   { at: [330, 292], route: [310, 292, 262, 292, 205, 300],          label: [200, 300], anchor: 'end',   text: 'Tool · Select' },
  MINUS:  { at: [355, 170], route: [355, 162, 355, 52],                     label: [355, 40],  anchor: 'middle', text: 'Map' },
  PLUS:   { at: [445, 170], route: [445, 162, 445, 52],                     label: [445, 40],  anchor: 'middle', text: 'Menu' },
  ZR:     { at: [505, 92],  route: [538, 92, 595, 60],                      label: [600, 60],  anchor: 'start', text: 'Use tool' },
  R:      { at: [505, 121], route: [538, 121, 595, 100],                    label: [600, 100], anchor: 'start', text: 'Stall menu / Town' },
  X:      { at: [510, 178], route: [523, 178, 595, 150],                    label: [600, 150], anchor: 'start', text: 'Mount / dismount' },
  A:      { at: [537, 205], route: [550, 205, 595, 200],                    label: [600, 200], anchor: 'start', text: 'Talk · Enter · Pet' },
  B:      { at: [510, 232], route: [523, 232, 595, 245],                    label: [600, 245], anchor: 'start', text: 'Pick · Feed · Board' },
  Y:      { at: [483, 205], route: [483, 218, 483, 256, 560, 256, 595, 285], label: [600, 285], anchor: 'start', text: 'Untie / leash' },
  RSTICK: { at: [470, 300], route: [494, 305, 595, 330],                    label: [600, 330], anchor: 'start', text: 'Pointer (press: Journal)' }
};

/** The picture, as an SVG string. `pad` supplies the printed button names. */
function padGuideSvg(pad) {
  const name = b => pad.label(b), faces = ['X', 'Y', 'A', 'B'];
  const lines = Object.values(PAD_GUIDE).map(g => `<polyline points="${g.route.join(' ')}" fill="none" stroke="#d9a441" stroke-width="1.5" stroke-dasharray="3 3"/>`).join('');
  const labels = Object.entries(PAD_GUIDE).map(([b, g]) => {
    const key = b === 'LSTICK' ? 'LSTICK' : b;
    return `<text x="${g.label[0]}" y="${g.label[1] + 4}" text-anchor="${g.anchor}" font-size="14" font-weight="700" fill="#f1e0b4"><tspan fill="#f2cf7a">${padGuideEscape(name(key))}</tspan>  ${padGuideEscape(g.text)}</text>`;
  }).join('');
  const dot = (b, r) => `<circle cx="${PAD_GUIDE[b].at[0]}" cy="${PAD_GUIDE[b].at[1]}" r="${r}" fill="#f6e7bb" stroke="#1d120a" stroke-width="2"/>`;
  const face = b => dot(b, 13) + `<text x="${PAD_GUIDE[b].at[0]}" y="${PAD_GUIDE[b].at[1] + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#2a170c">${padGuideEscape(name(b))}</text>`;
  const dpad = '<path d="M322 270h16v14h14v16h-14v14h-16v-14h-14v-16h14z" fill="#9aa3b2" stroke="#1d120a" stroke-width="2"/>';
  return `<svg class="padGuide" viewBox="0 0 800 400" role="img" aria-label="Controller button guide">` +
    '<rect x="220" y="140" width="360" height="200" rx="84" fill="#3b3f4a" stroke="#1d120a" stroke-width="3"/>' +
    '<rect x="250" y="106" width="90" height="28" rx="12" fill="#5a5f6c" stroke="#1d120a" stroke-width="2"/><rect x="262" y="78" width="66" height="24" rx="10" fill="#6b7080" stroke="#1d120a" stroke-width="2"/>' +
    '<rect x="460" y="106" width="90" height="28" rx="12" fill="#5a5f6c" stroke="#1d120a" stroke-width="2"/><rect x="472" y="78" width="66" height="24" rx="10" fill="#6b7080" stroke="#1d120a" stroke-width="2"/>' +
    lines +
    '<circle cx="290" cy="205" r="26" fill="#22252c" stroke="#1d120a" stroke-width="2"/><circle cx="290" cy="205" r="15" fill="#6b7080"/>' +
    '<circle cx="470" cy="300" r="26" fill="#22252c" stroke="#1d120a" stroke-width="2"/><circle cx="470" cy="300" r="15" fill="#6b7080"/>' +
    dpad + '<circle cx="355" cy="170" r="8" fill="#9aa3b2" stroke="#1d120a" stroke-width="2"/><circle cx="445" cy="170" r="8" fill="#9aa3b2" stroke="#1d120a" stroke-width="2"/>' +
    faces.map(face).join('') + labels + '</svg>';
}
function padGuideEscape(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** The one pop-up: the first time a controller is used, the guide appears (A or B puts it away). */
const PAD_INTRO_KEY = 'ponyscapes.padIntro.v1';
class GamepadIntro {
  constructor({ pad }) {
    this.pad = pad;
    const el = this.panel = document.createElement('div');
    el.id = 'padIntroPanel'; el.hidden = true;
    el.innerHTML = '<header><span>Controller</span><button class="padIntroX" tabindex="-1">✕</button></header><div class="padIntroBody"></div>' +
      '<div class="padIntroNote">Little bubbles above doors, trees, villagers and animals tell you which button to press. Find this picture again in Menu &gt; Controls &gt; Controller.</div>' +
      '<div class="padIntroGo"><button class="tbig" tabindex="-1"></button></div>';
    document.body.appendChild(el);
    el.querySelector('.padIntroX').addEventListener('click', () => this.close());
    el.querySelector('.padIntroGo button').addEventListener('click', () => this.close());
  }
  get isOpen() { return !this.panel.hidden; }
  open() {
    this.panel.querySelector('.padIntroBody').innerHTML = padGuideSvg(this.pad);
    this.panel.querySelector('.padIntroGo button').textContent = `Got it (${this.pad.label('A')})`;
    this.panel.hidden = false;
  }
  close() { this.panel.hidden = true; }
  /** Has the player seen it already? (kept in this browser) */
  static seen() { try { return localStorage.getItem(PAD_INTRO_KEY) === '1'; } catch (e) { return false; } }
  static markSeen() { try { localStorage.setItem(PAD_INTRO_KEY, '1'); } catch (e) { /* shown again next visit */ } }
}
