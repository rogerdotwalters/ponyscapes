'use strict';
/* SHARED - the developer code. Dev settings (Menu > Dev settings) and the Editor (main menu > Editor, editor.html) sit behind the same code. Unlocking is remembered for this
 * browser tab, so going from the main menu to the editor and back asks once. (It keeps friends out of the testing tools; it is not security.) */
const DevLock = (() => {
  const CODE = 'pnkpi', KEY = 'ponyscapes.adminUnlocked';
  let memory = false;
  return {
    /** Is this what the person typed the code? */
    check: typed => String(typed || '').trim().toLowerCase() === CODE,
    get unlocked() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return memory; } },
    set unlocked(on) { memory = !!on; try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch (e) { /* remembered in memory only */ } },
    /** Unlock if the code is right. Returns whether it is now unlocked. */
    tryCode(typed) { if (DevLock.check(typed)) DevLock.unlocked = true; return DevLock.unlocked; }
  };
})();
