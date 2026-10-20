'use strict';
/* TOOLS - checks saving and the host <-> friend handshake in Node (no browser):  node tools/test-saves.js
 * a character and its home are kept by the host AND copied to the friend; coming back, host and friend check they mean the same character; a mismatch
 * is never guessed at (the friend may start a new one, which clears their home); the homes are dealt out, saved with the world, and can be cleared. */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { ctx, run } = require('./headless')();
let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// the browser pieces the net scripts touch
const mem = new Map();
ctx.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
ctx.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
ctx.clearInterval = clearInterval; ctx.setInterval = setInterval;
ctx.window.addEventListener = ctx.window.removeEventListener = () => {};
for (const f of ['netAdapters', 'saveStore', 'clientSaves', 'hostAdapter', 'remoteAdapter']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'net', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
run(`HostAdapter.prototype._startTicker = function () {};   // (the tests step nothing: no clock needed)
globalThis.sent = []; globalThis.makeHost = async (store, world, extra) => {
  const h = new HostAdapter(Object.assign({ store, world, key: 'hostkey12345', name: 'Host', online: false }, extra));
  await h.connect(); h._sendJson = (cid, obj) => sent.push({ cid, obj: JSON.parse(JSON.stringify(obj)) }); h._sendFrames = () => {};
  return h;
};
globalThis.join = async (h, cid, key, name, msg) => {
  sent.length = 0; h.remotes[cid] = { cid, name, state: 'joining', ready: false, errors: 0, rtt: null };
  await h._onHello(h.remotes[cid], Object.assign({ v: RelayProtocol.VERSION, key, name, claims: [] }, msg));
  return { denied: (sent.find(s => s.obj.t === 'denied') || {}).obj, welcome: (sent.find(s => s.obj.t === 'welcome') || {}).obj, copy: (sent.find(s => s.obj.t === 'charsave') || {}).obj };
};`);
const world = id => `{ id: '${id}', name: 'Test world', seed: 4242, createdAt: 1 }`;

test('the host begins a world: a character with an id, and the starter home', async () => {
  const r = run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w1')}); const s = h.server;
    const out = { cid: s.charIds[h.id], home: s.players[h.id].home, saved: !!(await st.getCharacter('w1', 'hostkey12345')), w: !!(await st.getWorld('w1')) }; h.disconnect(); return out; })()`);
  return r.then(o => { assert(/^[a-z0-9]{20}$/.test(o.cid)); assert.strictEqual(o.home, run('BuildingSites.list.find(s => s.def.id === "player_home").index')); assert(o.saved && o.w, 'saved at once'); });
});

test('a friend joins: gets a home and a copy; leaves; comes back as the same character in the same home', async () => {
  const o = await run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w2')});
    const a = await join(h, 'c1', 'beekey12345', 'Bee', {});
    const ra = new RemoteAdapter({ code: 'ABCDE', name: 'Bee', key: 'beekey12345' }); ra.welcomed = true; ra._onCharacterSave(a.copy);
    const claims = ClientSaves.claims();
    { const inv = h.server.inventories[h.server.humanIds().find(i => h.keys[i] === 'beekey12345')]; inv.slots[inv.slots.length - 1] = null; inv.add('apple', 3); }            // something to carry back (the starter pack is full: one slot is freed)
    await h._dropRemote('c1', 'left');
    const b = await join(h, 'c2', 'beekey12345', 'Bee', { claims });
    const inv = h.server.inventories[h.server.humanIds().find(i => h.keys[i] === 'beekey12345')];
    const out = { first: a.welcome.character, again: b.welcome && b.welcome.character, denied: b.denied, claims, copyCid: a.copy.cid, apples: inv.count('apple') };
    h.disconnect(); return out; })()`);
  assert(o.first.cid && !o.first.restored && o.first.home >= 0 && o.first.home !== run('BuildingSites.list.find(s => s.def.id === "player_home").index'));
  assert.strictEqual(o.copyCid, o.first.cid, 'the copy is of that character');
  assert.strictEqual(JSON.stringify(o.claims.map(c => [c.world, c.cid])), JSON.stringify([['w2', o.first.cid]]));
  assert(!o.denied, JSON.stringify(o.denied));
  assert.strictEqual(o.again.cid, o.first.cid); assert.strictEqual(o.again.home, o.first.home); assert(o.again.restored);
  assert.strictEqual(o.apples >= 3, true, 'what they carried came back');
});

test('a different character on the device is NOT guessed at: the host asks, and a new character clears the old home', async () => {
  const o = await run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w3')});
    const a = await join(h, 'c1', 'beekey12345', 'Bee', {}); const site = a.welcome.character.home, n = h.server.interiors.homes['beekey12345'];
    h.server.interiors.chests['room:' + site + ':' + n + '|2,2'] = new Inventory(4); h.server.interiors.chests['room:' + site + ':' + n + '|2,2'].add('apple', 2);
    await h._dropRemote('c1', 'left');
    const wrong = [{ world: 'w3', cid: 'someoneelse0000000', savedAt: 5 }];
    const clash = await join(h, 'c2', 'beekey12345', 'Bee', { claims: wrong });
    const stillThere = !!(await st.getCharacter('w3', 'beekey12345')) && h.server.interiors.homeOf('beekey12345') === site;
    const fresh = await join(h, 'c3', 'beekey12345', 'Bee', { claims: wrong, fresh: true });
    const out = { clash: clash.denied, stillThere, first: a.welcome.character, fresh: fresh.welcome.character, chestLeft: Object.keys(h.server.interiors.chests).length, newRoom: h.server.interiors.homes['beekey12345'] !== n }; h.disconnect(); return out; })()`);
  assert.strictEqual(o.clash.reason, 'character_mismatch'); assert(o.stillThere, 'nothing was changed by the question');
  assert(o.fresh && o.fresh.fresh && o.fresh.cid !== o.first.cid && !o.fresh.restored);
  assert.strictEqual(o.chestLeft, 0, 'the old home was emptied'); assert(o.newRoom, 'and they were given a new room');
});

test('the host has lost the character: the friend is told, not silently given a blank one', async () => {
  const o = await run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w4')});
    const a = await join(h, 'c1', 'beekey12345', 'Bee', {}); await h._dropRemote('c1', 'left'); await st.deleteCharacter('w4', 'beekey12345');
    const r = await join(h, 'c2', 'beekey12345', 'Bee', { claims: [{ world: 'w4', cid: a.welcome.character.cid, savedAt: 1 }] });
    const other = await join(h, 'c3', 'otherkey1234', 'Cee', { claims: [{ world: 'some-other-world', cid: 'abcdefghijkl', savedAt: 1 }] });   // a claim for ANOTHER world means nothing here
    h.disconnect(); return { denied: r.denied, other: !!other.welcome }; })()`);
  assert.strictEqual(o.denied.reason, 'character_missing'); assert(o.other);
});

test('only as many homes as the village has: the next newcomer waits until the host clears one', async () => {
  const o = await run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w5')}); const keys = ['k1aaaaaaaa', 'k2aaaaaaaa', 'k3aaaaaaaa'];
    for (const [i, k] of keys.entries()) { await join(h, 'c' + i, k, 'P' + i, {}); await h._dropRemote('c' + i, 'left'); }
    const full = await join(h, 'cx', 'k4aaaaaaaa', 'Dee', {});
    const online = await h.clearHome('k1aaaaaaaa'); const after = await join(h, 'cy', 'k4aaaaaaaa', 'Dee', {});
    const back = await join(h, 'cz', 'k1aaaaaaaa', 'P0', {});
    h.disconnect(); return { full: full.denied && full.denied.reason, online, after: !!after.welcome, backDenied: back.denied && back.denied.reason, homes: h.getSessionInfo().homes.map(x => x.owner) }; })()`);
  assert.strictEqual(o.full, 'no_home'); assert(o.online && o.after, 'cleared home goes to the newcomer'); assert.strictEqual(o.backDenied, 'no_home', 'the one who lost the home waits in turn');
});

test('homes are saved with the world and come back; a world saved before owners existed is dealt out in order', async () => {
  const o = await run(`(async () => { const st = new MemorySaveStore(), h = await makeHost(st, ${world('w6')}); await join(h, 'c1', 'beekey12345', 'Bee', {}); await h.saveAll('test'); const before = h.getSessionInfo().homes.map(x => x.owner); h.disconnect();
    const rec = await st.getWorld('w6'), h2 = await makeHost(st, Object.assign({}, rec.meta, { data: rec.data })); const after = h2.getSessionInfo().homes.map(x => x.owner); h2.disconnect();
    const old = JSON.parse(JSON.stringify(rec.data)); delete old.interiors.owners; old.interiors.homes = { hostkey12345: 0, beekey12345: 1 };
    const h3 = await makeHost(new MemorySaveStore(), { id: 'w7', name: 'Old', seed: 4242, createdAt: 1, data: old }); const legacy = h3.getSessionInfo().homes.map(x => x.owner); h3.disconnect();
    return { before, after, legacy: legacy.map(Boolean) }; })()`);
  assert.strictEqual(JSON.stringify(o.after), JSON.stringify(o.before)); assert(o.before.includes('Bee'), 'the friend lives in a home'); assert.strictEqual(JSON.stringify(o.legacy), '[true,true,false,false]');
});

test('the friend\'s copy is only kept when it is a real character, and old copies make way when the device is full', () => {
  const ok = run(`ClientSaves.put({ world: 'wx', cid: 'abcdefghijkl', data: { not: 'a character' } })`); assert.strictEqual(ok, false);
  const good = run(`(() => { const s = new GameServer(1), id = s.joinHuman(null, 'A', null, 'akey12345'); return SaveData.exportCharacter(s, id); })()`);
  ctx.__good = good;
  for (let i = 0; i < 15; i++) run(`ClientSaves.put({ world: 'w${i}', cid: 'abcdefghij${i}k', name: 'A', savedAt: ${1000 + i}, data: __good })`);
  assert.strictEqual(run('ClientSaves.list().length'), 12, 'at most 12 worlds are remembered, newest first');
  assert.strictEqual(run('ClientSaves.list()[0].world'), 'w14');
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 5).join('\n       ')); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
