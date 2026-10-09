'use strict';
/* EDITOR - the lock: the editor sits behind the same developer code as Dev settings (shared/devLock.js). Until it is entered, only a code box shows. */
(() => {
  if (DevLock.unlocked) return;
  const root = document.documentElement;
  root.classList.add('devLocked');
  const gate = document.createElement('div');
  gate.id = 'devGate';
  gate.innerHTML = '<h1>Editor</h1><p>Enter the developer code to open the editor.</p><div class="gateRow"><input id="gateCode" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Code"><button id="gateGo" class="primary">Unlock</button></div><div id="gateErr" class="error"></div><p><a href="index.html">← Back to the game</a></p>';
  document.body.prepend(gate);
  const input = gate.querySelector('#gateCode'), err = gate.querySelector('#gateErr');
  const go = () => { if (DevLock.tryCode(input.value)) { root.classList.remove('devLocked'); gate.remove(); } else { err.textContent = 'That is not the code.'; input.select(); } };
  gate.querySelector('#gateGo').addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  setTimeout(() => input.focus(), 50);
})();
