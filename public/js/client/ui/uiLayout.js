'use strict';
/* CLIENT - responsive UI layout.
 *
 * computeUiLayout() is PURE: screen size in, a rectangle for every control out. Because nothing is positioned by
 * hand-tuned CSS, it can be tested for overlaps on any screen size (see tools/ or the test suite), and the same
 * rules serve phones in landscape or portrait, tablets and desktop.
 *
 *   touch layout            ┌ toolbar (beside the system buttons, or on its own row if the screen is narrow) ┐ [Craft Bag ⛶ DBG]
 *                           │  panels (inventory / crafting) open in the free space between the two thumbs  │
 *                           └ left thumb: floating joystick      right thumb: [Sneak Rot Board] / [Run Use] ┘
 */
const SYSTEM_BUTTONS = [{ id: 'btnMenu', w: 62 }, { id: 'btnMap', w: 46 }, { id: 'btnFs', w: 36 }, { id: 'btnDbg', w: 40 }];
const MIN_TOUCH_SLOT = 34, MAX_SLOT = 46, MIN_PANEL_SLOT = 30;

const INV_ACTIONS_H = 38;
const makeRect = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const unionRect = rects => {
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
  return makeRect(x0, y0, Math.max(...rects.map(r => r.x + r.w)) - x0, Math.max(...rects.map(r => r.y + r.h)) - y0);
};

/** The two thumb clusters: joystick (left) and action buttons (right), sized by scale `k`. */
function layoutTouchControls({ k, left, right, bottom, m, w, h, topUsed }) {
  const use = Math.round(84 * k), run = Math.round(66 * k), small = Math.round(50 * k), g = Math.round(8 * k);
  const useRect = makeRect(right - use, bottom - use, use, use);
  const runRect = makeRect(useRect.x - g - run, bottom - run, run, run);
  const rowY = useRect.y - g - small;                          // second row, above Use
  const board = makeRect(right - small, rowY, small, small);
  const rot = makeRect(board.x - g - small, rowY, small, small);
  const sneak = makeRect(rot.x - g - small, rowY, small, small);
  const release = makeRect(sneak.x - g - small, rowY, small, small);        // Let go / Untie: the far end of the row, away from the action button, so it is never hit by accident
  const ability = makeRect(right - small, rowY - g - small, small, small);   // the ridden pony's ability, above Board
  const lasso = makeRect(ability.x - g - small, ability.y, small, small);    // throw the lasso in the lasso slot, beside it
  const cluster = unionRect([useRect, runRect, board, rot, sneak, release, ability, lasso]);
  const baseSize = Math.round(108 * k);
  const base = makeRect(left + Math.round(6 * k), bottom - baseSize - Math.round(4 * k), baseSize, baseSize);
  const zoneTop = Math.max(h * 0.38, topUsed);
  const zoneRight = Math.min(Math.max(w * 0.42, base.x + base.w + m), cluster.x - m);
  const zone = makeRect(0, zoneTop, zoneRight, h - zoneTop);
  return { use: useRect, run: runRect, board, rot, sneak, release, ability, lasso, cluster, base, zone, baseRadius: Math.round(baseSize * 0.5) };
}

/**
 * @param {{w:number, h:number, insets?:{top,right,bottom,left}, touch:boolean, host?:boolean}} screen  CSS pixels
 * @returns {{k, topButtons, toolbar, health, hunger, thirst, clock, emote, touch, panels, debug, hint}} every rect is { x, y, w, h }
 */
function computeUiLayout({ w, h, insets = { top: 0, right: 0, bottom: 0, left: 0 }, touch, host = false }) {
  const k = clamp(Math.min(w, h) / 380, 0.8, 1.25);          // phones ~1, tablets / desktop a little larger
  const m = Math.round(10 * k), gap = Math.round(6 * k);
  const left = insets.left + m, right = w - insets.right - m, top = insets.top + m, bottom = h - insets.bottom - m;

  /* ---- toolbar sizing (needed to decide how much room the system buttons may take) ---- */
  const slots = CONFIG.sim.inventory.hotbarSlots, slotGap = Math.round(4 * k), pad = Math.round(5 * k);
  const barW = s => slots * s + (slots - 1) * slotGap + 2 * pad, barH = s => s + 2 * pad;
  const maxSlot = Math.round(MAX_SLOT * Math.max(k, 1)), minSlot = Math.round(MIN_TOUCH_SLOT * k);
  const fitSlot = space => Math.floor((space - 2 * pad - (slots - 1) * slotGap) / slots);

  /* ---- system buttons, top right: shrink until the toolbar fits beside them; on the very narrowest screens they wrap to a second row ---- */
  const buttons = SYSTEM_BUTTONS.filter(b => host || !b.hostOnly);
  const placeButtons = shrink => {
    const bh = Math.round(34 * k * shrink), out = {};
    let x = right, y = top, rows = 1;
    for (const b of [...buttons].reverse()) {
      const bw = Math.round(b.w * k * shrink);
      if (x - bw < left && x !== right) { x = right; y += bh + gap; rows++; }                 // out of room: next row
      x -= bw; out[b.id] = makeRect(x, y, bw, bh); x -= gap;
    }
    const rects = Object.values(out), x0 = Math.min(...rects.map(r => r.x)), y1 = Math.max(...rects.map(r => r.y + r.h));
    return { out, rows, bar: makeRect(x0, top, right - x0, y1 - top), shrink, bh };
  };
  let sys = placeButtons(1);
  if (touch) for (const shrink of [1, 0.9, 0.8, 0.7]) { sys = placeButtons(shrink); if (sys.rows === 1 && fitSlot(sys.bar.x - m - left) >= minSlot) break; }
  const topButtons = sys.out, systemBar = sys.bar, buttonH = sys.bh;

  /* ---- toolbar ---- */
  let toolbar, slot;
  if (touch) {
    const besideSlot = sys.rows === 1 ? fitSlot(systemBar.x - m - left) : -1;
    if (besideSlot >= minSlot) {                               // beside the system buttons, centred on screen if there is room
      slot = Math.min(maxSlot, besideSlot);
      toolbar = makeRect(clamp(w / 2 - barW(slot) / 2, left, systemBar.x - m - barW(slot)), top, barW(slot), barH(slot));
    } else {                                                   // narrow screen: its own row under the buttons
      slot = Math.min(maxSlot, fitSlot(right - left));
      toolbar = makeRect(clamp(w / 2 - barW(slot) / 2, left, right - barW(slot)), systemBar.y + systemBar.h + gap, barW(slot), barH(slot));
    }
  } else {                                                     // desktop: bottom centre
    slot = maxSlot;
    toolbar = makeRect(w / 2 - barW(slot) / 2, bottom - barH(slot), barW(slot), barH(slot));
  }

  /* ---- the vitals row (health | hunger | thirst | clock) ---- */
  const vitalsH = Math.round(16 * k), clockW = Math.round(62 * k), barW4 = Math.floor((toolbar.w - clockW - 3 * gap) / 3);
  const vitalsY = touch ? toolbar.y + toolbar.h + gap : toolbar.y - gap - vitalsH;
  const health = makeRect(toolbar.x, vitalsY, barW4, vitalsH);
  let hunger = makeRect(toolbar.x + (barW4 + gap), vitalsY, barW4, vitalsH);
  let thirst = makeRect(toolbar.x + 2 * (barW4 + gap), vitalsY, barW4, vitalsH);
  if (!CONFIG.sim.vitals) { health.w = toolbar.w - clockW - gap; hunger = thirst = null; }       // hunger and thirst are off: health takes their room
  const clock = makeRect(toolbar.x + 3 * (barW4 + gap), vitalsY, toolbar.w - 3 * (barW4 + gap), vitalsH);
  let topUsed = (touch ? Math.max(vitalsY + vitalsH, systemBar.y + systemBar.h) : systemBar.y + systemBar.h) + m;   // y where free space starts

  /* ---- touch controls: both thumbs' controls must fit side by side, so they shrink on narrow screens ---- */
  let touchLayout = null;
  if (touch) {
    for (const shrink of [1, 0.9, 0.8, 0.7, 0.6]) {
      touchLayout = layoutTouchControls({ k: k * shrink, left, right, bottom, m, w, h, topUsed });
      if (touchLayout.base.x + touchLayout.base.w + 2 * m <= touchLayout.cluster.x) break;
    }
  }

  /* ---- the emote button ---- */
  const ub = Math.round(44 * Math.max(k, 0.85)), rowW = ub;
  let emote, utilityAtBottom = false;
  const place2 = (x0, y0) => { emote = makeRect(x0, y0, ub, ub); };
  let stackedAbove = false;
  if (!touch) {                                                // desktop: beside the toolbar, else above the bars on very narrow windows
    const rightX = toolbar.x + toolbar.w + gap, leftX = toolbar.x - gap - ub, rowY = toolbar.y + toolbar.h - ub;
    if (rightX + ub <= right) place2(rightX, rowY);
    else if (leftX >= left) place2(leftX, rowY);
    else { place2(toolbar.x, vitalsY - gap - ub); stackedAbove = true; }
  } else {
    const freeLeft = touchLayout.base.x + touchLayout.base.w + m, freeRight = touchLayout.cluster.x - m;
    if (freeRight - freeLeft >= rowW + 8) {                    // room at the bottom centre between the thumbs
      const x0 = freeLeft + (freeRight - freeLeft - rowW) / 2;
      place2(x0, bottom - ub); utilityAtBottom = true;
      touchLayout.zone = makeRect(0, touchLayout.zone.y, Math.min(touchLayout.zone.w, emote.x - 4), touchLayout.zone.h);
    } else {                                                   // narrow (portrait): a small row under the vitals instead
      place2(toolbar.x, vitalsY + vitalsH + gap);
      topUsed = Math.max(topUsed, emote.y + emote.h + m);
      touchLayout.zone = makeRect(0, Math.max(h * 0.38, topUsed), touchLayout.zone.w, h - Math.max(h * 0.38, topUsed));
    }
  }

  /* ---- desktop: the ridden pony's abilities, in a strip above the vitals (touch screens have the ability button instead) ---- */
  const abilityH = Math.round(22 * k);
  const abilityBar = touch ? null : makeRect(toolbar.x, (stackedAbove ? emote.y - gap - ub : vitalsY) - gap - abilityH, toolbar.w, abilityH);   // (above the Fly button when it all stacks up)

  /* ---- overlay panels: they are modal (a click-off backdrop sits over the thumb controls), so they may cover those, but never the HUD that stays usable above the backdrop ---- */
  const pp = Math.round(12 * k), pg = Math.round(5 * k), header = Math.round(34 * k);
  const invSlotFor = r => Math.min(maxSlot, Math.floor((r.w - 2 * pp - 5 * pg) / 6), Math.floor((r.h - header - 2 * pp - 3 * pg) / 4));
  let region;
  if (touch) {
    const regionBottom = utilityAtBottom ? emote.y - m : bottom;
    const between = makeRect(touchLayout.base.x + touchLayout.base.w + m, topUsed, touchLayout.cluster.x - m - (touchLayout.base.x + touchLayout.base.w + m), regionBottom - topUsed);
    const above = makeRect(left, topUsed, right - left, touchLayout.cluster.y - m - topUsed);
    region = invSlotFor(between) >= MIN_PANEL_SLOT || invSlotFor(between) >= invSlotFor(above) ? between : above;
  } else {
    region = makeRect(left, topUsed, right - left, abilityBar.y - m - topUsed);
  }
  /* tiny screens: if the HUD stack leaves no room for the panels, they may sit OVER the top HUD (never over the thumb controls) */
  const needH = header + 4 * MIN_PANEL_SLOT + 3 * pg + 2 * pp, regionBottomY = region.y + region.h;
  const coversHud = region.h < needH;
  if (coversHud) region = makeRect(region.x, top, region.w, regionBottomY - top);
  const invSlot = Math.max(MIN_PANEL_SLOT, invSlotFor(region)), invW = 6 * invSlot + 5 * pg + 2 * pp, invH = header + 4 * invSlot + 3 * pg + 2 * pp + INV_ACTIONS_H;   // (+ the Drop / Destroy row)
  const craftW = Math.min(Math.round(350 * k), region.w);
  const sidePanel = makeRect(region.x + (region.w - craftW) / 2, region.y, craftW, region.h);   // crafting, gear, trade and host settings share one rect
  const mapW = Math.min(right - left, 720), mapH = Math.min(bottom - top, 470);                 // the map is view-only, so it may cover the thumb controls: a big window in the middle
  const mapRect = makeRect(Math.round((w - mapW) / 2), Math.round((h - mapH) / 2), mapW, mapH);
  const confW = Math.min(right - left, 360), confH = Math.min(bottom - top, 190);
  const confirmRect = makeRect(Math.round((w - confW) / 2), Math.round((h - confH) / 2), confW, confH);
  const panels = {
    region, slot: invSlot, gap: pg, pad: pp, header, coversHud,
    inventory: makeRect(region.x + (region.w - invW) / 2, region.y + Math.max(0, (region.h - invH) / 2), invW, invH),
    crafting: sidePanel, settings: sidePanel, gear: sidePanel, trade: sidePanel, map: mapRect, confirm: confirmRect,
    craftListMaxHeight: Math.max(60, region.h - header - 2 * pp)
  };

  /* ---- text overlays ---- */
  const debug = { x: left, y: touch ? (emote && !utilityAtBottom ? emote.y + emote.h : vitalsY + vitalsH) + gap : top };
  const hintWidth = touch ? 0 : toolbar.x - m - left;
  const hint = hintWidth >= 220 ? { x: left, bottom: h - bottom, w: hintWidth } : null;

  return { k, w, h, buttonScale: sys.shrink, topButtons, systemBar, toolbar: Object.assign(toolbar, { slot, gap: slotGap, pad }), health, hunger, thirst, clock, emote, abilityBar, fly: touchLayout ? touchLayout.rot : makeRect(emote.x, emote.y - gap - ub, ub, ub),
    mainPony: touchLayout ? makeRect(touchLayout.lasso.x, touchLayout.lasso.y - (touchLayout.lasso.y - touchLayout.ability.y) - touchLayout.lasso.h - 8, touchLayout.lasso.w * 2 + 8, touchLayout.lasso.h) : makeRect(emote.x - ub * 0.6, emote.y - 2 * (gap + ub), ub * 1.6, ub), touch: touchLayout, panels, debug, hint };
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

    for (const id in L.topButtons) { place(dom[id], L.topButtons[id]); dom[id].style.fontSize = Math.round(12 * L.k * (L.buttonScale || 1)) + 'px'; }

    const bar = dom.toolbar, t = L.toolbar;
    bar.style.left = t.x + 'px'; bar.style.top = t.y + 'px';
    bar.style.setProperty('--slot', t.slot + 'px'); bar.style.setProperty('--gap', t.gap + 'px'); bar.style.setProperty('--pad', t.pad + 'px');

    const P = L.panels;
    for (const [el, r] of [[dom.inventoryPanel, P.inventory], [dom.craftPanel, P.crafting], [dom.settingsPanel, P.settings], [dom.gearPanel, P.gear], [dom.ponyPanel, P.gear], [dom.journalPanel, P.gear], [dom.menuPanel, P.gear], [dom.sessionPanel, P.gear], [dom.townPanel, P.gear], [dom.mapPanel, P.map], [dom.confirmPanel, P.confirm], [dom.tradePanel, P.trade]]) {
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
      el.style.setProperty('--slot', P.slot + 'px'); el.style.setProperty('--gap', P.gap + 'px'); el.style.setProperty('--pad', P.pad + 'px');
    }
    for (const el of [dom.craftPanel, dom.settingsPanel, dom.gearPanel, dom.ponyPanel, dom.journalPanel, dom.menuPanel, dom.sessionPanel, dom.townPanel, dom.tradePanel]) el.style.width = P.crafting.w + 'px';
    for (const el of [dom.craftList, dom.settingsList, dom.gearBody, dom.ponyBody, dom.townBody, dom.tradeBody]) el.style.maxHeight = P.craftListMaxHeight + 'px';
    dom.journalBody.style.maxHeight = Math.max(60, P.craftListMaxHeight - 38) + 'px';
    dom.menuBody.style.maxHeight = dom.sessionBody.style.maxHeight = P.craftListMaxHeight + 'px';
    dom.confirmPanel.style.width = P.confirm.w + 'px';
    dom.mapPanel.style.width = P.map.w + 'px'; dom.mapBody.style.maxHeight = Math.max(80, P.map.h - P.header - 2 * P.pad - 6) + 'px';        // the tab row takes some of the room

    place(dom.health, L.health); place(dom.clock, L.clock);
    for (const [el, r] of [[dom.hunger, L.hunger], [dom.thirst, L.thirst]]) { el.style.display = r ? '' : 'none'; if (r) place(el, r); }
    place(dom.btnEmote, L.emote); dom.btnEmote.style.fontSize = Math.round(L.emote.w * 0.5) + 'px';
    if (dom.btnMainPony) { place(dom.btnMainPony, L.mainPony); dom.btnMainPony.style.fontSize = Math.max(10, Math.round(L.mainPony.h * 0.26)) + 'px'; }
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
      for (const [id, r] of [['btnAct', T.use], ['btnRun', T.run], ['btnBoard', T.board], ['btnRot', T.rot], ['btnSneak', T.sneak], ['btnRelease', T.release], ['btnAbility', T.ability], ['btnLasso', T.lasso]]) {
        place(dom[id], r); dom[id].style.fontSize = Math.max(11, Math.round(r.w * 0.19)) + 'px';
      }
      this.touchControls.applyLayout(T);
    }
  }
}
