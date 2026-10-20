'use strict';
/* CLIENT - tiny publish/subscribe bus. Systems talk through events instead of holding references to each other. */
class EventBus {
  constructor() { this.handlers = new Map(); }
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.off(type, handler);                      // returns an unsubscribe function
  }
  off(type, handler) { const set = this.handlers.get(type); if (set) set.delete(handler); }
  emit(type, payload) { const set = this.handlers.get(type); if (set) for (const h of [...set]) h(payload); }
}
