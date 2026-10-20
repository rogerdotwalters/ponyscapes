'use strict';
/* SHARED - puzzle mechanics. Pure functions: the client plays a puzzle on its own screen, then sends the LIST OF MOVES it made, and the server REPLAYS
 * them from the same seed to see whether the puzzle is really solved (so nobody can claim a solve they did not play). Nothing here touches the world.
 *
 * A puzzle is { kind, seed, ...options } (a puzzle node's data, js/data/puzzles/). Each KIND is one small object:
 *   make(seed, opts)      the starting state (plain JSON; always solvable)
 *   step(state, move)     the state after one move (a NEW state; an illegal move changes nothing)
 *   solved(state)         is it done?
 * Add a mechanic by adding a kind here and a way to draw it in client/ui/puzzleUI.js.
 *
 *   lights    Lantern Lights  a grid of lanterns: pressing one flips it and its four neighbours. Put them all out.   move: cell index
 *   sequence  Rune Echo       watch the runes light up in order, then repeat the order. A wrong rune starts you over. move: rune index
 *   slide     Tumbled Tablet  sliding tiles in a frame with one gap: put the numbers back in order.                   move: the index of the tile to slide into the gap */
const MAX_PUZZLE_MOVES = 400;

const PuzzleKinds = {
  lights: {
    name: 'Lantern Lights', hint: 'Pressing a lantern flips it and the ones next to it. Put every light out.',
    make(seed, o) {
      const n = clamp(o.size | 0 || 3, 2, 6), rng = mulberry32(seed), cells = new Array(n * n).fill(0);
      let state = { n, cells };
      const presses = Math.max(3, Math.round(n * n * 0.55));
      for (let i = 0; i < presses; i++) state = PuzzleKinds.lights.step(state, Math.floor(rng() * n * n));
      if (state.cells.every(c => !c)) state = PuzzleKinds.lights.step(state, 0);
      return state;
    },
    step(state, move) {
      const n = state.n;
      if (!Number.isInteger(move) || move < 0 || move >= n * n) return state;
      const cells = state.cells.slice(), x = move % n, y = Math.floor(move / n);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < n && cy < n) cells[cy * n + cx] ^= 1; }
      return { n, cells };
    },
    solved: state => state.cells.every(c => !c)
  },

  sequence: {
    name: 'Rune Echo', hint: 'Watch the order the runes glow, then touch them in the same order.',
    make(seed, o) {
      const symbols = clamp(o.symbols | 0 || 4, 3, 8), length = clamp(o.length | 0 || 5, 3, 12), rng = mulberry32(seed), seq = [];
      for (let i = 0; i < length; i++) seq.push(Math.floor(rng() * symbols));
      return { symbols, seq, input: [] };
    },
    step(state, move) {
      if (!Number.isInteger(move) || move < 0 || move >= state.symbols || PuzzleKinds.sequence.solved(state)) return state;
      const input = state.input.concat(move);
      return { symbols: state.symbols, seq: state.seq, input: input[input.length - 1] === state.seq[input.length - 1] ? input : [] };
    },
    solved: state => state.input.length === state.seq.length
  },

  slide: {
    name: 'Tumbled Tablet', hint: 'Slide the pieces into the gap until the numbers run in order.',
    make(seed, o) {
      const n = clamp(o.size | 0 || 3, 2, 5), rng = mulberry32(seed), cells = [];
      for (let i = 1; i < n * n; i++) cells.push(i);
      cells.push(0);                                                                                  // 0 is the gap
      let state = { n, cells }, last = -1;
      for (let i = 0; i < n * n * 14; i++) {                                                          // shuffle by legal moves, so it can always be undone
        const gap = state.cells.indexOf(0), options = PuzzleKinds.slide.neighbours(n, gap).filter(c => c !== last);
        const pick = options[Math.floor(rng() * options.length)];
        last = gap; state = PuzzleKinds.slide.step(state, pick);
      }
      if (PuzzleKinds.slide.solved(state)) state = PuzzleKinds.slide.step(state, PuzzleKinds.slide.neighbours(n, state.cells.indexOf(0))[0]);
      return state;
    },
    neighbours(n, i) {
      const x = i % n, y = Math.floor(i / n), out = [];
      if (x > 0) out.push(i - 1); if (x < n - 1) out.push(i + 1); if (y > 0) out.push(i - n); if (y < n - 1) out.push(i + n);
      return out;
    },
    step(state, move) {
      const n = state.n;
      if (!Number.isInteger(move) || move < 0 || move >= n * n) return state;
      const gap = state.cells.indexOf(0);
      if (!PuzzleKinds.slide.neighbours(n, gap).includes(move)) return state;
      const cells = state.cells.slice(); cells[gap] = cells[move]; cells[move] = 0;
      return { n, cells };
    },
    solved: state => state.cells.every((c, i) => c === (i === state.cells.length - 1 ? 0 : i + 1))
  }
};

const Puzzles = {
  has: kind => !!PuzzleKinds[kind],
  /** The starting state of a puzzle node's puzzle. `worldSeed` makes the same node a different puzzle in every world. */
  make(puzzle, worldSeed = 0) {
    const kind = PuzzleKinds[puzzle.kind];
    return kind ? kind.make(((puzzle.seed | 0) ^ (worldSeed | 0)) >>> 0, puzzle) : null;
  },
  step: (puzzle, state, move) => PuzzleKinds[puzzle.kind].step(state, move),
  solved: (puzzle, state) => PuzzleKinds[puzzle.kind].solved(state),
  /** Replay a list of moves from the start: did they solve it? (the server's check) */
  verify(puzzle, worldSeed, moves) {
    if (!Puzzles.has(puzzle.kind) || !Array.isArray(moves) || moves.length > MAX_PUZZLE_MOVES) return false;
    let state = Puzzles.make(puzzle, worldSeed);
    for (const m of moves) { state = Puzzles.step(puzzle, state, m); if (Puzzles.solved(puzzle, state)) return true; }
    return false;
  }
};
