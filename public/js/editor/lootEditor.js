'use strict';
/* EDITOR - the Loot tab: what each creature drops and what each dungeon's chests hold (shared/lootTables.js). Pick a table on the left; every change is SAVED AT ONCE on this
 * device (this phone's or computer's browser storage), so it is there the next time you open the game here. Download lootTables.js puts the same tables in a file to
 * keep, move to another device (Import) or commit as the game's own (public/js/content/lootTables.js).
 * Drops are rolled by whoever hosts the game, so for a game with friends the host's device decides what drops. */
const LootEditor = (() => {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v; else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v; else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const SOURCE = { device: 'Saved on this device', file: 'From lootTables.js', 'built-in': 'Built into the game' };
  const itemOptions = () => Object.values(ItemDefs).filter(d => d.name).sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = id => (ItemDefs[id] && ItemDefs[id].name) || id;
  let note = '';                                                  // the last thing the page told you ("Saved", "Imported 3 tables")

  /** The left side: the file buttons, then every table. */
  function renderList(list, { q = '', selected, select, rerender }) {
    list.innerHTML = '';
    const file = h('input', { type: 'file', accept: '.js,.json', hidden: true, onchange: e => { if (e.target.files[0]) importFile(e.target.files[0], rerender); e.target.value = ''; } });
    list.append(h('div', { class: 'lootTools' },
      h('button', { class: 'primary', onclick: () => download() }, 'Download lootTables.js'),
      h('button', { onclick: () => file.click() }, 'Import…'), file));
    const query = q.trim().toLowerCase(), tables = LootTables.all().filter(t => !query || t.name.toLowerCase().includes(query) || t.id.includes(query));
    let kind = '';
    for (const t of tables) {
      if (t.kind !== kind) { kind = t.kind; list.append(h('div', { class: 'lootGroup' }, kind === 'chest' ? 'Chests' : 'Creatures')); }
      const src = LootTables.source(t.key), n = LootTables.current(t.key).length;
      list.append(h('button', { class: 'entry' + (t.key === selected ? ' on' : ''), onclick: () => select(t.key) },
        h('span', { class: 'en' }, h('b', {}, t.name), h('small', {}, `${n} ${n === 1 ? 'item' : 'items'} · ${t.id}`)),
        src !== 'built-in' ? h('span', { class: 'tag edited' }, src === 'device' ? 'edited' : 'file') : null));
    }
    if (!tables.length) list.append(h('div', { class: 'empty' }, 'Nothing matches.'));
  }

  /** The right side: one table, its rows, and what it is worth. */
  function renderDetail(box, key, rerender) {
    box.innerHTML = '';
    const info = LootTables.all().find(t => t.key === key);
    if (!info) { box.append(h('div', { class: 'empty' }, 'Pick a creature or a chest on the left. Slimes, the Slime King and the Slime Warren’s chests are at the top.')); return; }
    const rows = LootTables.current(key), src = LootTables.source(key);
    const commit = (next, again = false) => {
      const ok = LootTables.save(key, next);
      note = ok ? 'Saved on this device' : 'This browser would not store it (private window?). Use Download lootTables.js to keep it.';
      if (again) rerender(); else { const el = box.querySelector('.lootNote'); if (el) el.textContent = note; }
    };
    const field = (label, input) => h('label', { class: 'lootField' }, h('span', {}, label), input);
    const rowEl = (e, i) => {
      const edit = patch => { rows[i] = Object.assign({}, rows[i], patch); commit(rows); };
      const select = h('select', { onchange: ev => edit({ item: ev.target.value }) }, itemOptions().map(d => h('option', { value: d.id, selected: d.id === e.item }, d.name)));
      const min = h('input', { type: 'number', min: 1, max: 9999, step: 1, value: e.min, onchange: ev => { const v = Math.max(1, Math.round(+ev.target.value || 1)); ev.target.value = v; edit({ min: v, max: Math.max(v, rows[i].max) }); max.value = rows[i].max; } });
      const max = h('input', { type: 'number', min: 1, max: 9999, step: 1, value: e.max, onchange: ev => { const v = Math.max(rows[i].min, Math.round(+ev.target.value || 1)); ev.target.value = v; edit({ max: v }); } });
      const chance = h('input', { type: 'number', min: 0, max: 100, step: 1, value: Math.round((e.chance === undefined ? 1 : e.chance) * 100), onchange: ev => { const v = Math.min(100, Math.max(0, +ev.target.value || 0)); ev.target.value = v; const c = v / 100; const next = Object.assign({}, rows[i]); if (c >= 1) delete next.chance; else next.chance = c; rows[i] = next; commit(rows); } });
      return h('div', { class: 'lootRow' }, field('Item', select), field('Min', min), field('Max', max), field('Chance %', chance),
        h('button', { class: 'danger', title: 'Remove this item', onclick: () => { rows.splice(i, 1); commit(rows, true); } }, '×'));
    };
    const results = h('div', { class: 'lootSample' });
    const roll = n => {
      const totals = LootTables.sample(rows, n), entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      results.replaceChildren(h('b', {}, `${n} ${info.kind === 'chest' ? 'chests' : 'kills'}:`), ' ', entries.length ? entries.map(([item, c]) => `${nameOf(item)} ${c} (${(c / n).toFixed(2)} each)`).join(' · ') : 'nothing drops');
    };
    box.append(
      h('div', { class: 'formHead' }, h('h2', {}, info.name), h('span', { class: 'tag' + (src === 'device' ? ' edited' : '') }, SOURCE[src])),
      h('p', { class: 'note' }, info.kind === 'chest' ? 'Each row is rolled once for every chest opened: the chance it is in the chest, then a number from Min to Max.' : 'Each row is rolled once for every one of these creatures that dies: the chance it drops, then a number from Min to Max. No rows = it drops nothing. Coins are worth more from a higher-level creature (+20% per level above 1) and vary a little each time.'),
      h('div', { class: 'lootRows' }, rows.map(rowEl)),
      h('div', { class: 'lootButtons' },
        h('button', { class: 'primary', onclick: () => { rows.push({ item: 'gold_coin', min: 1, max: 1 }); commit(rows, true); } }, '+ Add item'),
        h('button', { onclick: () => roll(100) }, 'Try 100'),
        src !== 'built-in' ? h('button', { onclick: () => { if (confirm(`Put ${info.name} back to its original table?`)) { LootTables.reset(key); note = 'Back to the original table'; rerender(); } } }, 'Reset') : null),
      results,
      h('div', { class: 'lootNote' }, note),
      h('p', { class: 'note' }, 'Changes are saved on this device as you make them. Drops are decided by whoever hosts the game, so friends get the host’s tables. Download lootTables.js to keep a copy or move it to another device.'));
  }

  function download() {
    const a = h('a', { href: URL.createObjectURL(new Blob([LootTables.exportText()], { type: 'text/javascript' })), download: 'lootTables.js' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    note = 'Downloaded lootTables.js: put it at public/js/content/lootTables.js to make these the game’s own, or keep it and use Import on another device.';
  }
  function importFile(file, rerender) {
    const reader = new FileReader();
    reader.onload = () => { const n = LootTables.importText(String(reader.result)); note = n < 0 ? 'That is not a loot tables file.' : `Imported ${n} ${n === 1 ? 'table' : 'tables'} onto this device.`; rerender(); };
    reader.readAsText(file);
  }
  return { renderList, renderDetail };
})();
