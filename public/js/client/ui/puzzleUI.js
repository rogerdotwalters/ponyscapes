'use strict';
/* CLIENT - the puzzle screen. Study a puzzle node (a rune stone, a sunken dial, a broken tablet) while a quest asks for it and this opens. The server
 * only says WHICH node; the puzzle itself is made here from the node's data and the world seed (js/shared/puzzles.js), played here, and when it is
 * solved the list of moves is sent to the host, which replays it to check. Each mechanic (kind) draws itself below. */
const RUNE_GLYPHS = ['◆', '▲', '●', '■', '★', '✦', '✹', '✶'], RUNE_COLORS = ['#e86a6a', '#6ac1e8', '#8de86a', '#e8c86a', '#c06ae8', '#e88f6a', '#6ae8c9', '#e86ac0'];
class PuzzleUI {
  constructor({ panel, title, body, closeButton, game, requestOpen }) {
    this.panel = panel; this.title = title; this.body = body; this.game = game; this.node = null; this.puzzle = null; this.state = null; this.moves = [];
    this.solvedAt = 0; this.timers = []; this.showing = false; this.lit = -1; this.message = '';
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'reset') this._start(); else if (b.dataset.act === 'watch') this._playSequence(); else if (b.dataset.act === 'move') this._move(Number(b.dataset.i));
    });
    game.events.on('puzzle', e => { requestOpen(); this._load(e.node); });           // (opening a window closes the others, this one too: so load the puzzle after)
    game.events.on('puzzleSolved', () => { if (this.isOpen) this.close(); });
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this._render(); }
  close() { this.panel.hidden = true; this._clearTimers(); this.node = null; }

  _clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; this.showing = false; this.lit = -1; }
  _load(nodeId) { this.node = PuzzleNodes.get(nodeId); this.puzzle = this.node && this.node.puzzle; if (this.node) this._start(); }
  _start() {
    this._clearTimers();
    this.state = Puzzles.make(this.puzzle, this.game.worldMap.seed); this.moves = []; this.solvedAt = 0; this.message = '';
    if (this.puzzle.kind === 'sequence') this._playSequence(); else this._render();
  }

  /** Rune Echo: light the runes one after another, then hand the turn over. */
  _playSequence() {
    this._clearTimers(); this.showing = true; this.message = 'Watch...';
    this._render();
    this.state.seq.forEach((rune, k) => {
      this.timers.push(setTimeout(() => { this.lit = rune; this._render(); }, 700 + k * 800));
      this.timers.push(setTimeout(() => { this.lit = -1; this._render(); }, 700 + k * 800 + 520));
    });
    this.timers.push(setTimeout(() => { this.showing = false; this.message = 'Your turn'; this._render(); }, 700 + this.state.seq.length * 800));
  }

  _move(i) {
    if (!this.state || this.solvedAt || this.showing || !Number.isInteger(i)) return;
    const next = Puzzles.step(this.puzzle, this.state, i);
    if (next === this.state) return;                                                       // (an illegal move changes nothing: not counted)
    const wrong = this.puzzle.kind === 'sequence' && next.input.length === 0;
    this.moves.push(i);
    this.state = next;
    if (wrong) { this.message = 'Not that one: watch again'; this._render(); this.timers.push(setTimeout(() => this._playSequence(), 900)); return; }
    if (Puzzles.solved(this.puzzle, this.state)) {
      this.solvedAt = performance.now(); this.message = 'Solved!';
      this.game.puzzleSolve(this.node.id, this.moves);
      this._render();
      this.timers.push(setTimeout(() => this.close(), 1600));
      return;
    }
    this.message = ''; this._render();
  }

  _render() {
    if (!this.node || !this.state) return;
    const kind = PuzzleKinds[this.puzzle.kind], S = this.state, locked = this.solvedAt || this.showing;
    this.title.textContent = this.node.name;
    let grid = '';
    if (this.puzzle.kind === 'lights') {
      grid = `<div class="pzGrid" style="--n:${S.n}">` + S.cells.map((c, i) => `<button class="pzCell lamp${c ? ' on' : ''}" data-act="move" data-i="${i}" tabindex="-1"${locked ? ' disabled' : ''}><span></span></button>`).join('') + '</div>';
    } else if (this.puzzle.kind === 'slide') {
      grid = `<div class="pzGrid" style="--n:${S.n}">` + S.cells.map((c, i) => c ? `<button class="pzCell tile${c === i + 1 ? ' home' : ''}" data-act="move" data-i="${i}" tabindex="-1"${locked ? ' disabled' : ''}>${c}</button>` : '<div class="pzCell gap"></div>').join('') + '</div>';
    } else if (this.puzzle.kind === 'sequence') {
      const runes = Array.from({ length: S.symbols }, (_, i) => `<button class="pzRune${this.lit === i ? ' lit' : ''}" style="--c:${RUNE_COLORS[i]}" data-act="move" data-i="${i}" tabindex="-1"${locked ? ' disabled' : ''}>${RUNE_GLYPHS[i]}</button>`).join('');
      const dots = S.seq.map((_, k) => `<i class="${k < S.input.length ? 'got' : ''}"></i>`).join('');
      grid = `<div class="pzRunes">${runes}</div><div class="pzDots">${dots}</div>`;
    }
    this.body.innerHTML = `<div class="pzHint">${kind.hint}</div>${grid}<div class="pzMsg${this.solvedAt ? ' ok' : ''}">${this.message || '&nbsp;'}</div>`
      + `<div class="pzBar"><span>Moves: ${this.moves.length}</span>` + (this.puzzle.kind === 'sequence' ? `<button data-act="watch" tabindex="-1"${locked ? ' disabled' : ''}>Watch again</button>` : '') + `<button data-act="reset" tabindex="-1"${this.solvedAt ? ' disabled' : ''}>Start over</button></div>`;
  }

  /** Walked away from the stone: close. */
  tick(frameMs) {
    if (!this.isOpen || !this.node) return;
    const me = this.game.local;
    if (Math.hypot(this.node.x - me.x, this.node.y - me.y) > 4) this.close();
  }
}
