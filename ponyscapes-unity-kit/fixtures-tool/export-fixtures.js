'use strict';
/* Dumps golden fixtures from the reference JS game for the C# parity tests.
 *   node export-fixtures.js [outDir]        (default: ../fixtures)
 * Add a new section here for every system you port (see docs/PORTING_CONVENTIONS.md). */
const fs = require('fs'), path = require('path');
const { run } = require('../reference/ponyscapes-js/tools/headless')();
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'fixtures'));
fs.mkdirSync(out, { recursive: true });
const write = (name, data) => { fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(data)); console.log('wrote', name, JSON.stringify(data).length, 'bytes'); };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));

const SEEDS = [1, 7, 42, 1337, 123456, 2147483647, -5];

// 1. mulberry32: first 64 outputs per seed (doubles; compare with exact equality)
write('rng', SEEDS.map(seed => ({ seed, values: J(`(() => { const r = mulberry32(${seed}); return Array.from({ length: 64 }, () => r()); })()`) })));

// 2. Perlin noise: a grid of samples and fractal samples per seed
write('noise', SEEDS.map(seed => ({ seed, samples: J(`(() => { const n = new PerlinNoise(${seed}); const o = [];
  for (let y = -8; y < 8; y++) for (let x = -8; x < 8; x++) o.push({ x: x * 3.17, y: y * 2.71, v: n.sample(x * 3.17, y * 2.71), f: n.fractal(x * 3.17, y * 2.71, 4) }); return o; })()`) })));

// 3. World tiles: a 64x64 window around the origin and around the village, per seed
write('world', SEEDS.slice(0, 5).map(seed => ({ seed, windows: [[-32, -32], [0, 0], [96, 96]].map(([x0, y0]) => ({ x0, y0, w: 64, h: 64, tiles: J(`(() => { const w = new World(${seed}); const t = [];
  for (let y = ${y0}; y < ${y0} + 64; y++) for (let x = ${x0}; x < ${x0} + 64; x++) t.push([w.tile(x, y), w.isSolid(x, y) ? 1 : 0]); return t; })()`) })) })));

console.log('done ->', out);
