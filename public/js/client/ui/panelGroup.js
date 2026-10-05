'use strict';
/* CLIENT - only one overlay panel (inventory / crafting / ...) is open at a time. */
class PanelGroup {
  constructor() { this.panels = {}; }
  register(name, panel) { this.panels[name] = panel; }
  toggle(name) {
    const wasOpen = this.panels[name].isOpen;
    this.closeAll();
    if (!wasOpen) this.panels[name].open();
  }
  open(name) { this.closeAll(); this.panels[name].open(); }
  closeAll() { Object.values(this.panels).forEach(p => p.close()); }
  anyOpen() { return Object.values(this.panels).some(p => p.isOpen); }
}
