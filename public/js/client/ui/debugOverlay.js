'use strict';
/* CLIENT - FPS / position / network debug text. */
class DebugOverlay {
  constructor({ element, button, game, input, camera }) {
    this.el = element; this.button = button; this.game = game; this.input = input; this.camera = camera;
    this.fps = 60; this.sinceUpdate = 0;
  }
  toggle() { this.el.hidden = !this.el.hidden; this.button.classList.toggle('on', !this.el.hidden); }

  update(frameMs) {
    this.fps = lerp(this.fps, 1000 / Math.max(frameMs, 1), 0.05);
    if (this.el.hidden || (this.sinceUpdate += frameMs) < 200) return;
    this.sinceUpdate = 0;
    const g = this.game, p = g.local, i = this.input.last, net = CONFIG.net;
    this.el.textContent =
      `fps ${this.fps.toFixed(0)}   zoom ${this.camera.zoom.toFixed(2)} dpr ${this.camera.dpr}\n` +
      `server tick ${g.serverTick}   client seq ${g.seq}\n` +
      `pos  ${p.x.toFixed(2)}, ${p.y.toFixed(2)}   v ${Math.hypot(p.vx, p.vy).toFixed(2)} t/s\n` +
      `face ${(p.facing * 180 / Math.PI).toFixed(0)}deg  state ${p.state}\n` +
      `input ${i.moveX.toFixed(2)}, ${i.moveY.toFixed(2)}  act ${+i.action}\n` +
      `tile ${Math.floor(p.x)}, ${Math.floor(p.y)}   chunks loaded ${g.map.chunks.size}\n` +
      `art pack ${ArtPack.loaded ? 'on' : 'off'}  ${ArtPack.stats.packed} taken, ${ArtPack.stats.painted} painted, ${ArtPack.stats.atlasMB} MB\n` +
      `hunger ${p.hunger.toFixed(0)}  thirst ${p.thirst.toFixed(0)}  time ${DayCycle.format(g.hour())}\n` +
      `held ${g.heldItemId() || '-'}  logs ${g.inventory.count('log')}\n` +
      `pending ${g.pending.length}  ack ${g.lastAck}  err ${g.lastError.toFixed(4)}\n` +
      `lag sim ${net.fakeLatencyMs}ms (+${net.fakeJitterMs} jitter)`;
  }
}
