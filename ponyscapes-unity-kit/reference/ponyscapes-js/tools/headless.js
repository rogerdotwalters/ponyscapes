'use strict';
/* TOOLS - loads the game's SHARED code (everything index.html loads before the network and client scripts) into one Node context, so the world,
 * the grids and the GameServer can be run and tested without a browser:   const { ctx, run } = require('./headless')();   run('Village.tile(3, 3)') */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', 'public');

module.exports = function load() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]).filter(s => !/^js\/(net|client)\//.test(s));
  const sandbox = { console, Math, Date, JSON, setTimeout, clearTimeout, performance: { now: () => Date.now() }, TextEncoder, TextDecoder };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  // every script is one top-level `const` / `class` scope in the browser: concatenate them so they share it (as <script> tags do)
  const code = scripts.map(s => `/* ${s} */\n` + fs.readFileSync(path.join(ROOT, s), 'utf8')).join('\n;\n');
  vm.runInContext(code + '\n;globalThis.__scope = (src) => eval(src);', ctx, { filename: 'game.js' });
  return { ctx, scripts, run: src => ctx.__scope(src) };
};
