'use strict';
/* CLIENT - responsive UI layout.
 *
 * computeUiLayout() is PURE: screen size in, a rectangle for every control out. Because nothing is positioned by
 * hand-tuned CSS, it can be tested for overlaps on any screen size (see tools/ or the test suite), and the same
 * rules serve phones and tablets held in LANDSCAPE, and desktop. Portrait is not supported (a rotate-your-phone notice shows instead).
 *
 *   ┌ day / season / time ┐   [Menu Coins Pony coins Map ⛶ DBG]   ┌ mini map ┐
 *   │  panels (bag, crafting...) open over the middle, under the top row, over the thumb controls (they are modal)  │
 *   └ left thumb: stick       health | hunger | thirst | energy / TOOL BAR (bottom centre) / emote       right thumb: [Let go Ride Rot Board] / [Apple Leash Power] / [Bag Tool] ┘
 */
const SYSTEM_BUTTONS = [{ id: 'btnMenu', w: 62 }, { id: 'btnCoins', w: 62 }, { id: 'btnPonyCoins', w: 90 }, { id: 'btnMap', w: 46 }, { id: 'btnFs', w: 36 }, { id: 'btnDbg', w: 40 }];
const MIN_TOUCH_SLOT = 34, MAX_SLOT = 46, MIN_PANEL_SLOT = 30;

const INV_ACTIONS_H = 22 + 36;                      // what you picked, and the Wear / To pony / Drop / Destroy row
const INV_CHROME = 6 + 16, MIN_INV_SLOT = 26;       // the panel's two 3px borders + the bag's scroll handle (16px) eat into the width the nine columns get
const INV_COLS = 9, INV_ROWS = 6;                    // the bag panel: rows of nine like Minecraft (belt + 40-slot bag = five rows; the pony's pack follows), scrolling past that
const makeRect = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const unionRect = rects => {
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
  return makeRect(x0, y0, Math.max(...rects.map(r => r.x + r.w)) - x0, Math.max(...rects.map(r => r.y + r.h)) - y0);
};

/** The two thumb clusters: joystick (left) and action buttons (right), sized by scale `k`. */
function layoutTouchControls({ k, left, right, bottom, m, w, h, topUsed }) {
  const use = Math.round(84 * k), bagSize = Math.round(66 * k), small = Math.round(50 * k), g = Math.round(8 * k);
  const useRect = makeRect(right - use, bottom - use, use, use);
  const bag = makeRect(useRect.x - g - bagSize, bottom - bagSize, bagSize, bagSize);   // the backpack, where Run used to be (everyone always moves at full speed)
  const rowY = useRect.y - g - small;                          // second row, above Use
  const board = makeRect(right - small, rowY, small, small);
  const rot = makeRect(board.x - g - small, rowY, small, small);
  const ride = makeRect(rot.x - g - small, rowY, small, small);            // Ride: its own button, so many actions never pile onto the Board button
  const release = makeRect(ride.x - g - small, rowY, small, small);        // Let go / Untie: the far end of the row, away from the action button, so it is never hit by accident
  const ability = makeRect(right - small, rowY - g - small, small, small);   // the ridden pony's ability, above Board
  const lasso = makeRect(ability.x - g - small, ability.y, small, small);    // throw the lasso in the lasso slot, beside it
  const leash = makeRect(lasso.x - g - small, ability.y, small, small);      // put your own pony on a leash (a lasso for a pony that is already yours)
  const apple = makeRect(leash.x - g - small, ability.y, small, small);      // the Apple button (give your pony an apple), at the end of that row
  const stall = makeRect(right - small * 2 - g, ability.y - g - small, small * 2 + g, small);   // the stall button: wears the stall's name, above the ability row
  const cluster = unionRect([useRect, bag, board, rot, ride, release, ability, lasso, leash, apple, stall]);
  const baseSize = Math.round(108 * k);
  const base = makeRect(left + Math.round(6 * k), bottom - baseSize - Math.round(4 * k), baseSize, baseSize);
  const zoneTop = Math.max(h * 0.38, topUsed);
  const zoneRight = Math.min(Math.max(w * 0.42, base.x + base.w + m), cluster.x - m);
  const zone = makeRect(0, zoneTop, zoneRight, h - zoneTop);
  return { use: useRect, bag, board, rot, ride, release, ability, lasso, leash, apple, stall, cluster, base, zone, baseRadius: Math.round(baseSize * 0.5) };
}

/**
 * @param {{w:number, h:number, insets?:{top,right,bottom,left}, touch:boolean, host?:boolean}} screen  CSS pixels
 * @returns {{k, topButtons, toolbar, health, hunger, thirst, energy, clock, season, emote, touch, panels, debug, hint}} every rect is { x, y, w, h }
 */
function computeUiLayout({ w, h, insets = { top: 0, right: 0, bottom: 0, left: 0 }, touch, host = false }) {
  const k = clamp(Math.min(w, h) / 380, 0.8, 1.25);          // phones ~1, tablets / desktop a little larger
  const m = Math.round(10 * k), gap = Math.round(6 * k);
  const left = insets.left + m, right = w - insets.right - m, top = insets.top + m, bottom = h - insets.bottom - m;

  /* ---- LANDSCAPE ONLY. The top row, left to right: the day / season / time bar, the system buttons, the mini map (upper right).
   *      The tool bar sits bottom centre, the vitals just above it; touch controls take the two bottom corners. ---- */
  const miniSize = Math.round(clamp(h * 0.3, 96, 200));
  const minimap = makeRect(right - miniSize, top, miniSize, miniSize);
  const seasonH = Math.round(36 * k);
  const season = makeRect(left, top, Math.min(Math.round(340 * k), Math.round(w * 0.36)), seasonH);
  season.compact = season.w < 400 * k; season.tiny = season.w < 300 * k;   // (shorter day text; then the clock shows its picture only)

  /* ---- system buttons: a row between the season bar and the mini map (shrinking to fit, wrapping onto a second row on the narrowest screens) ---- */
  const buttons = SYSTEM_BUTTONS.filter(b => host || !b.hostOnly);
  const rowLeft = season.x + season.w + m, rowRight = minimap.x - m;
  const placeButtons = shrink => {
    const bh = Math.round(34 * k * shrink), out = {};
    let x = rowRight, y = top, rows = 1;
    for (const b of [...buttons].reverse()) {
      const bw = Math.round(b.w * k * shrink);
      if (x - bw < rowLeft && x !== rowRight) { x = rowRight; y += bh + gap; rows++; }                 // out of room: next row
      x -= bw; out[b.id] = makeRect(x, y, bw, bh); x -= gap;
    }
    const rects = Object.values(out), x0 = Math.min(...rects.map(r => r.x)), y1 = Math.max(...rects.map(r => r.y + r.h));
    return { out, rows, bar: makeRect(x0, top, rowRight - x0, y1 - top), shrink, bh };
  };
  let sys = placeButtons(1);
  for (const shrink of [1, 0.9, 0.8, 0.7, 0.62]) { sys = placeButtons(shrink); if (sys.rows === 1) break; }
  const topButtons = sys.out, systemBar = sys.bar;
  const topUsed = Math.max(season.y + season.h, systemBar.y + systemBar.h) + m;   // y where free space starts (the mini map is a corner: panels may lie over it)

  /* ---- sizing of the tool bar ---- */
  const slots = CONFIG.sim.inventory.hotbarSlots, slotGap = Math.round(4 * k), pad = Math.round(5 * k);
  const barW = s => slots * s + (slots - 1) * slotGap + 2 * pad, barH = s => s + 2 * pad;
  const maxSlot = Math.round(MAX_SLOT * Math.max(k, 1)), minSlot = Math.round(MIN_TOUCH_SLOT * k);
  const fitSlot = space => Math.floor((space - 2 * pad - (slots - 1) * slotGap) / slots);

  /* ---- touch controls: both thumbs' controls must fit side by side, so they shrink on narrow screens ---- */
  let touchLayout = null;
  if (touch) {
    for (const shrink of [1, 0.9, 0.8, 0.7, 0.6]) {
      touchLayout = layoutTouchControls({ k: k * shrink, left, right, bottom, m, w, h, topUsed });
      if (touchLayout.base.x + touchLayout.base.w + 2 * m <= touchLayout.cluster.x) break;
    }
  }
  const freeLeft = touch ? touchLayout.base.x + touchLayout.base.w + m : left, freeRight = touch ? touchLayout.bag.x - m : right;      // the bottom row between the thumbs

  /* ---- the tool bar: bottom centre, as wide as the room between the thumbs allows ---- */
  const slot = touch ? clamp(fitSlot(2 * Math.min(w / 2 - freeLeft, freeRight - w / 2)), Math.round(MIN_TOUCH_SLOT * 0.75), maxSlot) : maxSlot;
  const toolbar = makeRect(w / 2 - barW(slot) / 2, bottom - barH(slot), barW(slot), barH(slot));

  /* ---- the vitals row (health | hunger | thirst | energy), just above the tool bar ---- */
  const vitalsH = Math.round(16 * k), barW4 = Math.floor((toolbar.w - 3 * gap) / 4), clockW = 0;
  const vitalsY = toolbar.y - gap - vitalsH;
  const health = makeRect(toolbar.x, vitalsY, barW4, vitalsH);
  let hunger = makeRect(toolbar.x + (barW4 + gap), vitalsY, barW4, vitalsH);
  let thirst = makeRect(toolbar.x + 2 * (barW4 + gap), vitalsY, barW4, vitalsH);
  const energy = makeRect(toolbar.x + 3 * (barW4 + gap), vitalsY, barW4, vitalsH);                       // (energy is always there: health | hunger | thirst | energy)
  if (!CONFIG.sim.vitals) { const half = Math.floor((toolbar.w - gap) / 2); health.w = half; energy.x = toolbar.x + half + gap; energy.w = toolbar.w - half - gap; hunger = thirst = null; }       // hunger and thirst are off: health and energy share the row
  const clock = makeRect(toolbar.x + toolbar.w, vitalsY, clockW, vitalsH);

  /* ---- the emote button: beside the tool bar (right, else left, else above the vitals) ---- */
  const ub = Math.round(44 * Math.max(k, 0.85));
  let emote, stackedAbove = false;
  const rightX = toolbar.x + toolbar.w + gap, leftX = toolbar.x - gap - ub, rowY = toolbar.y + toolbar.h - ub;
  if (rightX + ub <= freeRight) emote = makeRect(rightX, rowY, ub, ub);
  else if (leftX >= freeLeft) emote = makeRect(leftX, rowY, ub, ub);
  else { emote = makeRect(toolbar.x, vitalsY - gap - ub, ub, ub); stackedAbove = true; }
  const utilityAtBottom = true;
  if (touch) touchLayout.zone = makeRect(0, touchLayout.zone.y, Math.min(touchLayout.zone.w, Math.max(60, toolbar.x - 4)), touchLayout.zone.h);       // (the stick's zone stops short of the tool bar)

  /* ---- desktop: the ridden pony's abilities, in a strip above the vitals (touch screens have the ability button instead) ---- */
  const abilityH = Math.round(22 * k);
  const abilityBar = touch ? null : makeRect(toolbar.x, (stackedAbove ? emote.y - gap - ub : vitalsY) - gap - abilityH, toolbar.w, abilityH);   // (above the Fly button when it all stacks up)

  /* ---- overlay panels: they are modal (a click-off backdrop sits over the thumb controls), so they may cover those, but never the HUD that stays usable above the backdrop ---- */
  const pp = Math.round(12 * k), pg = Math.round(5 * k), ig = Math.round(3 * k), header = Math.round(34 * k);
  const invSlotFor = r => Math.min(maxSlot, Math.floor((r.w - 2 * pp - INV_CHROME - (INV_COLS - 1) * ig) / INV_COLS), Math.floor((r.h - header - 2 * pp - 3 * pg) / 4));
  let region;
  if (touch) {
    region = makeRect(left, topUsed, right - left, bottom - topUsed);     // the panels are modal, so they take the full height under the top row (over the thumb controls)
  } else {
    region = makeRect(left, topUsed, right - left, abilityBar.y - m - topUsed);
  }
  /* tiny screens: if the HUD stack leaves no room for the panels, they may sit OVER the top HUD (never over the thumb controls) */
  const needH = header + 4 * MIN_PANEL_SLOT + 3 * pg + 2 * pp, regionBottomY = region.y + region.h;
  const coversHud = region.h < needH;
  if (coversHud) region = makeRect(region.x, top, region.w, regionBottomY - top);
  const invRegion = region;
  const invSlot = Math.max(MIN_INV_SLOT, invSlotFor(invRegion)), sectionH = Math.round(20 * k);
  const invW = Math.min(invRegion.w, Math.max(INV_COLS * invSlot + (INV_COLS - 1) * ig + 2 * pp + INV_CHROME, Math.round(300 * k)));
  const invH = Math.min(invRegion.h, header + 2 * pp + INV_ACTIONS_H + INV_ROWS * (invSlot + ig) + 3 * sectionH);         // (the sections scroll inside when there is more)
  const craftW = Math.min(Math.round(350 * k), region.w);
  const sidePanel = makeRect(region.x + (region.w - craftW) / 2, region.y, craftW, region.h);   // crafting, gear, trade and host settings share one rect
  const mapW = Math.min(right - left, 720), mapH = Math.min(bottom - top, 470);                 // the map is view-only, so it may cover the thumb controls: a big window in the middle
  const mapRect = makeRect(Math.round((w - mapW) / 2), Math.round((h - mapH) / 2), mapW, mapH);
  const confW = Math.min(right - left, 360), confH = Math.min(bottom - top, 190);
  const confirmRect = makeRect(Math.round((w - confW) / 2), Math.round((h - confH) / 2), confW, confH);
  const panels = {
    region, slot: invSlot, gap: pg, invGap: ig, pad: pp, header, coversHud,
    inventory: makeRect(invRegion.x + (invRegion.w - invW) / 2, invRegion.y + Math.max(0, (invRegion.h - invH) / 2), invW, invH),
    crafting: sidePanel, settings: sidePanel, gear: sidePanel, trade: sidePanel, map: mapRect, confirm: confirmRect,
    craftListMaxHeight: Math.max(60, region.h - header - 2 * pp),
    invBodyMaxHeight: Math.max(invSlot + 10, invH - header - 2 * pp - INV_ACTIONS_H - INV_CHROME)         // (less the borders and gaps the panel adds around the body)
  };

  /* ---- text overlays ---- */
  const debug = { x: left, y: season.y + season.h + gap };
  const hintWidth = touch ? 0 : toolbar.x - m - left;
  const hint = hintWidth >= 220 ? { x: left, bottom: h - bottom, w: hintWidth } : null;

  /* ---- the Apple button: touch has its own place in the thumb cluster; on desktop it sits beside the emote button ---- */
  const appleRect = touch ? touchLayout.apple : [emote.x + ub + gap, emote.x - ub - gap].map(x => makeRect(x, emote.y, ub, ub)).find(r => r.x >= left && r.x + r.w <= right) || makeRect(emote.x, emote.y - 2 * (gap + ub), ub, ub);
  return { k, w, h, minimap, buttonScale: sys.shrink, apple: appleRect, topButtons, systemBar, toolbar: Object.assign(toolbar, { slot, gap: slotGap, pad }), health, hunger, thirst, energy, clock, season, emote, abilityBar, fly: touchLayout ? touchLayout.rot : makeRect(emote.x, emote.y - gap - ub, ub, ub), touch: touchLayout, panels, debug, hint };
}

/** Applies a computed layout to the DOM and re-computes it whenever the screen changes. */
class UiLayout {
  constructor({ dom, touchControls }) {
    this.dom = dom; this.touchControls = touchControls;
    const update = () => this.update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 150));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
    this.update();
  }

  get touchActive() { return !this.dom.touchRoot.hidden; }
  get isHost() { return !!this.dom.isHost(); }

  update() {
    this.layout = computeUiLayout({ w: window.innerWidth, h: window.innerHeight, insets: this._readSafeInsets(), touch: this.touchActive, host: this.isHost });
    this._apply(this.layout);
  }

  _readSafeInsets() {                                          // notches / rounded corners via env(safe-area-inset-*)
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe), px = v => parseFloat(v) || 0;
    const insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    probe.remove();
    return insets;
  }

  _apply(L) {
    const { dom } = this, place = (el, r) => { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; };

    if (dom.miniMap) place(dom.miniMap, L.minimap);
    for (const id in L.topButtons) { place(dom[id], L.topButtons[id]); dom[id].style.fontSize = Math.round(12 * L.k * (L.buttonScale || 1)) + 'px'; }

    const bar = dom.toolbar, t = L.toolbar;
    bar.style.left = t.x + 'px'; bar.style.top = t.y + 'px';
    bar.style.setProperty('--slot', t.slot + 'px'); bar.style.setProperty('--gap', t.gap + 'px'); bar.style.setProperty('--pad', t.pad + 'px');

    const P = L.panels;
    for (const [el, r] of [[dom.inventoryPanel, P.inventory], [dom.craftPanel, P.crafting], [dom.settingsPanel, P.settings], [dom.gearPanel, P.inventory], [dom.ponyPanel, P.gear], [dom.posterPanel, P.gear], [dom.journalPanel, P.gear], [dom.menuPanel, P.gear], [dom.sessionPanel, P.gear], [dom.townPanel, P.gear], [dom.shopPanel, P.gear], [dom.controlsPanel, P.gear], [dom.dialoguePanel, P.gear], [dom.puzzlePanel, P.gear], [dom.stablePanel, P.gear], [dom.mapPanel, P.map], [dom.coinPanel, P.gear], [dom.confirmPanel, P.confirm], [dom.tradePanel, P.trade]]) {
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
      el.style.setProperty('--slot', P.slot + 'px'); el.style.setProperty('--gap', P.gap + 'px'); el.style.setProperty('--pad', P.pad + 'px');
    }
    for (const el of [dom.coinPanel, dom.craftPanel, dom.settingsPanel, dom.gearPanel, dom.ponyPanel, dom.posterPanel, dom.journalPanel, dom.menuPanel, dom.sessionPanel, dom.townPanel, dom.shopPanel, dom.tradePanel, dom.controlsPanel, dom.dialoguePanel, dom.puzzlePanel, dom.stablePanel]) el.style.width = P.crafting.w + 'px';
    for (const el of [dom.craftList, dom.settingsList, dom.gearBody, dom.ponyBody, dom.posterBody, dom.townBody, dom.shopBody, dom.tradeBody, dom.stableBody]) el.style.maxHeight = P.craftListMaxHeight + 'px';
    dom.controlsBody.style.maxHeight = Math.max(60, P.craftListMaxHeight - 38) + 'px';
    dom.journalBody.style.maxHeight = Math.max(60, P.craftListMaxHeight - 38) + 'px';
    dom.menuBody.style.maxHeight = dom.sessionBody.style.maxHeight = P.craftListMaxHeight + 'px';
    dom.gearPanel.style.width = P.inventory.w + 'px'; dom.gearBody.style.maxHeight = P.invBodyMaxHeight + 'px';       // (Gear is a tab of the Bag window: the same place and size)
    dom.inventoryPanel.style.setProperty('--gap', P.invGap + 'px'); dom.inventoryPanel.style.width = P.inventory.w + 'px'; if (dom.invBody) dom.invBody.style.maxHeight = P.invBodyMaxHeight + 'px';
    dom.confirmPanel.style.width = P.confirm.w + 'px';
    dom.mapPanel.style.width = P.map.w + 'px'; dom.mapBody.style.maxHeight = Math.max(80, P.map.h - P.header - 2 * P.pad - 6) + 'px';        // the tab row takes some of the room

    place(dom.health, L.health); place(dom.clock, L.clock); if (dom.energy) place(dom.energy, L.energy);
    if (dom.season) { place(dom.season, L.season); dom.season.style.fontSize = Math.round(12 * L.k) + 'px'; dom.season.classList.toggle('compact', L.season.compact); dom.season.classList.toggle('tiny', L.season.tiny); }
    for (const [el, r] of [[dom.hunger, L.hunger], [dom.thirst, L.thirst]]) { el.style.display = r ? '' : 'none'; if (r) place(el, r); }
    place(dom.btnEmote, L.emote); dom.btnEmote.style.fontSize = Math.round(L.emote.w * 0.5) + 'px';
    if (dom.btnApple && L.apple) { place(dom.btnApple, L.apple); dom.btnApple.style.fontSize = Math.max(11, Math.round(L.apple.w * 0.26)) + 'px'; }
    if (dom.btnFly) { place(dom.btnFly, L.fly); dom.btnFly.style.fontSize = Math.max(10, Math.round(L.fly.w * 0.24)) + 'px'; }       // (on touch it takes the Rotate button's place: you cannot build from a saddle)
    dom.clock.style.fontSize = Math.round(11 * L.k) + 'px';
    dom.abilityBar.classList.toggle('touch', !L.abilityBar);
    if (L.abilityBar) { place(dom.abilityBar, L.abilityBar); dom.abilityBar.style.fontSize = Math.round(11 * L.k) + 'px'; }
    dom.debug.style.left = L.debug.x + 'px'; dom.debug.style.top = L.debug.y + 'px';
    if (dom.hint) {
      dom.hint.style.display = L.hint ? '' : 'none';
      if (L.hint) { dom.hint.style.left = L.hint.x + 'px'; dom.hint.style.bottom = L.hint.bottom + 'px'; dom.hint.style.maxWidth = L.hint.w + 'px'; }
    }

    if (L.touch) {
      const T = L.touch;
      for (const [id, r] of [['btnAct', T.use], ['btnBag', T.bag], ['btnBoard', T.board], ['btnRot', T.rot], ['btnRelease', T.release], ['btnAbility', T.ability], ['btnLasso', T.lasso], ['btnLeash', T.leash], ['btnRide', T.ride], ['btnStall', T.stall]]) {
        place(dom[id], r); dom[id].style.fontSize = Math.max(11, Math.round(r.w * 0.19)) + 'px';
      }
      this.touchControls.applyLayout(T);
    }
  }
}
