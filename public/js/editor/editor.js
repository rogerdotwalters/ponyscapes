'use strict';
/* EDITOR - items, creatures and characters: their stats, rarity, where they spawn, and a slot for every picture.
 *
 * The editor keeps a DRAFT (only what differs from the built-in game, plus anything new) in this browser's localStorage, and turns it
 * into js/content/customContent.js when you press Download. Copy that file over public/js/content/customContent.js (and your pictures
 * into public/assets/) to put it in the game for everyone. "Play-test draft" opens the game with the draft without saving anything. */
(() => {
  const DRAFT_AT_KEY = 'ponyscapes.contentDraftAt';
  const $ = id => document.getElementById(id);
  const isPlain = ContentPack.isPlain, clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const DIRS = ['up', 'down', 'left', 'right'], DIR_LABEL = { up: 'Up (walking away)', down: 'Down (towards you)', left: 'Left', right: 'Right' };
  const DIR_FALLBACK = { up: ['right', 'left'], down: ['left', 'right'], left: ['right'], right: ['left'] };
  const BIOMES = Biomes.ids(), CHARACTER_IDS = ['prince', 'princess'];
  const FILE_HEADER = `'use strict';
/* YOUR CONTENT, written by editor.html. Loaded before the game's own definitions: everything here is merged over (or added to)
 * the built-in items, creatures and characters. Put this file at public/js/content/customContent.js and your pictures in public/assets/.
 * See the comments in the original customContent.js (or editor.html) for what each field means. */
`;

  /* ------------------------------------------------------------ state ------------------------------------------------------------ */
  const fileData = clone(ContentPack.data);
  let draft = normalize(fileData), tab = 'items', selected = null, search = '', pickMode = 'path';
  const previews = {};                                   // path -> data URL of a picture chosen this session that is not in public/assets yet
  const variantChoice = {};                              // creature id -> which pony variety's sprite set is being edited ('' = all)

  function normalize(data) {
    const out = { version: 1 };
    for (const s of ContentPack.SECTIONS) out[s] = isPlain(data && data[s]) ? clone(data[s]) : {};
    return out;
  }
  function loadDraft() {
    try { const raw = localStorage.getItem(ContentPack.DRAFT_KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function saveDraft() {
    try { localStorage.setItem(ContentPack.DRAFT_KEY, JSON.stringify(draft)); localStorage.setItem(DRAFT_AT_KEY, String(Date.now())); } catch (e) { setStatus('Could not save the draft in this browser: ' + e.message); return; }
    setStatus();
  }
  const sameAsFile = () => JSON.stringify(draft) === JSON.stringify(normalize(fileData));
  function setStatus(text) {
    $('status').textContent = text || (sameAsFile() ? 'Matches js/content/customContent.js' : 'Draft saved in this browser · Download to put it in the game');
  }

  /* ------------------------------------------------------------ the data model ------------------------------------------------------------ */
  /** What an entry's override is measured against: its built-in, or (for something new) the built-in it copies. */
  function baseOf(section, id) {
    if (section === 'characters') return {};
    const builtIn = ContentPack.builtIn[section][id];
    if (builtIn) return Object.assign(clone(builtIn), section === 'items' ? { spawns: clone(builtIn.spawns || []) } : {});
    const entry = draft[section][id], from = entry && entry.base && ContentPack.builtIn[section][entry.base];
    return from ? Object.assign(clone(from), section === 'items' ? { spawns: [] } : {}) : null;
  }
  const isBuiltIn = (section, id) => section === 'characters' || !!ContentPack.builtIn[section][id];
  /** The entry as the game will see it (base + override), as a free copy to edit. */
  function working(section, id) {
    const base = baseOf(section, id), over = draft[section][id];
    return clone(base ? ContentPack.deepMerge(base, over || {}) : over || {});
  }
  /** Only what differs from `base` (objects key by key, arrays whole). */
  function diff(base, cur) {
    const out = {};
    for (const [k, v] of Object.entries(cur)) {
      const b = base ? base[k] : undefined;
      if (isPlain(v) && isPlain(b)) { const d = diff(b, v); if (Object.keys(d).length) out[k] = d; }
      else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = clone(v);
    }
    return out;
  }
  /** Drops empty objects left behind by cleared fields ({ sprites: {} }). */
  function prune(o) {
    for (const [k, v] of Object.entries(o)) if (isPlain(v)) { prune(v); if (!Object.keys(v).length) delete o[k]; }
    return o;
  }
  function commit(section, id, cur) {
    prune(cur);
    const base = baseOf(section, id);
    const over = isBuiltIn(section, id) || section === 'characters' ? diff(base, cur) : Object.assign(diff(base, cur), draft[section][id] && draft[section][id].base ? { base: draft[section][id].base } : {});
    delete over.id;
    if (Object.keys(over).length || !isBuiltIn(section, id)) draft[section][id] = over; else delete draft[section][id];
    saveDraft(); renderList();
  }
  const getPath = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
  function setPath(o, path, value) {
    const keys = path.split('.'); let t = o;
    for (const k of keys.slice(0, -1)) { if (!isPlain(t[k])) t[k] = {}; t = t[k]; }
    const last = keys[keys.length - 1];
    if (value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) delete t[last]; else t[last] = value;
  }

  /** Every id in a tab: built-ins and new ones. */
  function idsOf(section) {
    if (section === 'characters') return CHARACTER_IDS.slice();
    return [...new Set([...Object.keys(ContentPack.builtIn[section]), ...Object.keys(draft[section])])];
  }

  /* ------------------------------------------------------------ DOM helpers ------------------------------------------------------------ */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  /** A labelled input bound to `cur[path]`; every change is committed straight away. */
  function field(label, cur, path, opts = {}) {
    const type = opts.type || 'text', commitNow = () => commit(opts.section, opts.id, cur);
    let input;
    if (type === 'select') {
      input = h('select', {}, (opts.options || []).map(o => (Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o))));
      input.value = getPath(cur, path) === undefined ? (opts.blank !== undefined ? opts.blank : '') : String(getPath(cur, path));
      input.addEventListener('change', () => { setPath(cur, path, input.value === '' ? undefined : input.value); commitNow(); if (opts.rerender) renderDetail(); });
    } else if (type === 'check') {
      input = h('input', { type: 'checkbox' }); input.checked = !!getPath(cur, path);
      input.addEventListener('change', () => { setPath(cur, path, input.checked || undefined); commitNow(); if (opts.rerender) renderDetail(); });
      return h('label', { class: 'field check' }, input, label);
    } else {
      input = h('input', { type, step: opts.step || 'any', min: opts.min, max: opts.max, placeholder: opts.placeholder || '' });
      const v = getPath(cur, path); input.value = v === undefined ? '' : v;
      input.addEventListener('input', () => { setPath(cur, path, type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value); commitNow(); });
    }
    return h('label', { class: 'field' }, label, input, opts.note ? h('small', {}, opts.note) : null);
  }
  const rarityOptions = () => RarityOrder.map(r => [r, RarityDefs[r].name]);
  const biomeOptions = () => BIOMES.map(b => [b, Biomes.get(b).name]);
  const ringOptions = () => Rings.all().sort((a, b) => a.index - b.index).map(r => [String(r.index), `${r.index}: ${r.name} (Lv ${r.levelMin}-${r.levelMax})`]);
  /** Which looks the game can draw for a wardrobe slot (taken from the built-in wardrobe). */
  const styleOptions = slot => [...new Set(WardrobeItems.where(w => w.slot === slot).map(w => w.look.style))].map(s => [s, s]);

  /* ------------------------------------------------------------ previews ------------------------------------------------------------ */
  const imageCache = {};
  /** Load a picture for a preview (a path in public/, a data URL, or a picture chosen this session). Resolves to an Image or null. */
  function loadImage(src) {
    const real = previews[src] || src;
    if (!imageCache[real]) imageCache[real] = new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = real; });
    return imageCache[real];
  }
  /** Draws a sheet's first frame, fitted into the canvas, feet at the bottom (or centred for icons). */
  function drawFitted(canvas, img, frames = 1, mirror = false, centred = false) {
    const ctx = canvas.getContext('2d'), fw = img.naturalWidth / Math.max(1, frames), fh = img.naturalHeight;
    const k = Math.min(canvas.width / fw, canvas.height / fh) * 0.92, w = fw * k, hh = fh * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(canvas.width / 2, centred ? (canvas.height + hh) / 2 : canvas.height - 4); if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, fw, fh, -w / 2, -hh, w, hh); ctx.restore();
  }
  function drawText(canvas, text) {
    const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#b9ab88'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    text.split('\n').forEach((line, i, all) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (all.length - 1) / 2) * 15));
  }
  /** An item's icon for lists: your picture, the built-in painter, or a lettered badge. */
  function itemIconInto(canvas, id, cur) {
    const src = cur && cur.sprites && cur.sprites.icon;
    if (src) { loadImage(src).then(img => (img ? drawFitted(canvas, img, 1, false, true) : drawText(canvas, 'missing'))); return; }
    if (ContentPack.builtIn.items[id] || ItemDefs[id]) { loadImage(ItemIcons.proceduralUrl(id)).then(img => img && drawFitted(canvas, img, 1, false, true)); return; }
    const ctx = canvas.getContext('2d'), color = (cur && cur.color) || rarityOf(cur && cur.rarity).color;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(canvas.width * 0.42)}px Georgia`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(((cur && cur.name) || id)[0].toUpperCase(), canvas.width / 2, canvas.height / 2 + 1);
  }
  const ponyLookFor = (cur, variantId = '') => PonyLook.fromGene(4242, Math.max(0, PonyVariants.findIndex(v => v.id === variantId)), (cur && cur.rarity) || 'common');
  /** The game's own drawing of a creature (for a direction with no picture). */
  function creatureArtInto(canvas, id, cur, dir, variantId) {
    const type = AnimalDefs[id] ? id : (cur.base || 'sheep'), def = AnimalDefs[type];
    renderAnimalPortrait(canvas, type, def && def.pony ? ponyLookFor(cur, variantId) : null, dir, { procedural: true });
  }
  function characterArtInto(canvas, id, dir) {
    const look = CharacterLook.defaultFor(id === 'princess' ? 1 : 0); look[0] = id === 'princess' ? 1 : 0;
    renderCharacterPortrait(canvas, look, FACING_FOR_DIR[dir], 0, undefined, { procedural: true });
  }

  /* ------------------------------------------------------------ picture slots ------------------------------------------------------------ */
  /**
   * One picture slot. `set` is the object holding it (cur.sprites, cur.sprites.worn ...), `key` its name in there.
   * opts: { folder, note, frames, centred, fallback(canvas) -> note text, sibling(dir) -> {src, mirror} for directional fallbacks }
   */
  function spriteSlot(title, cur, path, opts) {
    const canvas = h('canvas', { width: 96, height: 96 }), note = h('div', { class: 'snote' }), value = getPath(cur, path);
    const text = h('input', { type: 'text', placeholder: 'assets/' + opts.folder + '/picture.png', value: value && value.startsWith('data:') ? '' : value || '' });
    if (value && value.startsWith('data:')) text.placeholder = '(embedded picture)';
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const apply = v => { setPath(cur, path, v || undefined); commit(opts.section, opts.id, cur); renderDetail(); };
    text.addEventListener('change', () => apply(text.value.trim()));
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (pickMode === 'embed') apply(reader.result);
        else { const p = `assets/${opts.folder}/${f.name.replace(/[^\w.\-]+/g, '_')}`; previews[p] = reader.result; apply(p); }
      };
      reader.readAsDataURL(f);
    });
    const slot = h('div', { class: 'slot' + (value ? ' set' : '') }, canvas,
      h('div', { class: 'sbody' }, h('div', { class: 'sname' }, title, opts.hint ? h('small', {}, ' ' + opts.hint) : null), text,
        h('div', { class: 'sbtns' }, h('label', { class: 'btn' }, 'Choose picture…', file), value ? h('button', { onclick: () => apply('') }, 'Clear') : null), note));
    if (value) {
      loadImage(value).then(img => {
        if (img) { drawFitted(canvas, img, opts.frames || 1, false, opts.centred); note.textContent = previews[value] ? `Copy ${value.split('/').pop()} into public/${value.slice(0, value.lastIndexOf('/'))}/` : value.startsWith('data:') ? 'Embedded in the content file' : ''; if (previews[value]) note.className = 'snote warn'; }
        else { drawText(canvas, 'not found'); note.textContent = `public/${value} does not exist yet: copy the picture there`; note.className = 'snote warn'; }
      });
    } else {
      const sib = opts.sibling && opts.sibling();
      if (sib) loadImage(sib.src).then(img => { if (img) { drawFitted(canvas, img, opts.frames || 1, sib.mirror, opts.centred); note.textContent = `Empty: uses ${sib.label}`; } else note.textContent = 'Empty'; });
      else note.textContent = opts.fallback ? opts.fallback(canvas) || 'Empty: the game draws it' : 'Empty';
    }
    return slot;
  }

  /** Four directional slots (+ frames / fps / scale / anchor) for a creature or character sprite set at `path`. */
  function directionSlots(cur, path, opts) {
    const set = () => getPath(cur, path) || {};
    const slots = DIRS.map(dir => spriteSlot(DIR_LABEL[dir], cur, `${path}.${dir}`, Object.assign({}, opts, {
      frames: getPath(cur, opts.framesPath || path + '.frames') || 1,
      sibling: () => {                                                         // an empty direction shows what the game will use instead
        const s = set();
        for (const d of DIR_FALLBACK[dir]) if (s[d]) { const mirror = (dir === 'left' && d === 'right') || (dir === 'right' && d === 'left'); return { src: s[d], mirror, label: d + (mirror ? ' (mirrored)' : '') }; }
        return null;
      },
      fallback: canvas => { opts.art(canvas, dir); return (dir === 'up' || dir === 'down') && !opts.turns ? 'Empty: the game draws its side view here for now' : 'Empty: the game draws it'; }
    })));
    return [h('div', { class: 'slots' }, slots)];
  }
  function animationFields(cur, path, opts) {
    return h('div', { class: 'grid' },
      field('Frames (walk cycle, side by side)', cur, `${path}.frames`, Object.assign({ type: 'number', min: 1, step: 1, placeholder: '1' }, opts)),
      field('Frames per second', cur, `${path}.fps`, Object.assign({ type: 'number', min: 1, placeholder: '8' }, opts)),
      field('Scale', cur, `${path}.scale`, Object.assign({ type: 'number', min: 0.05, step: 0.05, placeholder: '1' }, opts)),
      field('Feet offset (px from the bottom)', cur, `${path}.anchorY`, Object.assign({ type: 'number', step: 1, placeholder: '0' }, opts)));
  }

  /** Editable rows (spawns, drops). columns: [{ key, label, type, options, step, min }] */
  function rowsTable(cur, key, columns, blank, opts, emptyText) {
    const list = Array.isArray(cur[key]) ? cur[key] : [];
    const save = () => { cur[key] = list; commit(opts.section, opts.id, cur); };
    const body = h('tbody', {}, list.map((row, i) => h('tr', {},
      columns.map(c => {
        let input;
        if (c.type === 'select') { input = h('select', {}, c.options().map(([v, l]) => h('option', { value: v }, l))); input.value = row[c.key]; input.addEventListener('change', () => { row[c.key] = input.value; save(); }); }
        else { input = h('input', { type: 'number', step: c.step || 'any', min: c.min, value: row[c.key] === undefined ? '' : row[c.key] }); input.addEventListener('input', () => { if (input.value === '') delete row[c.key]; else row[c.key] = Number(input.value); save(); }); }
        return h('td', {}, input);
      }),
      h('td', {}, h('button', { onclick: () => { list.splice(i, 1); save(); renderDetail(); } }, 'Remove')))));
    return [list.length ? h('table', { class: 'rows' }, h('thead', {}, h('tr', {}, columns.map(c => h('th', {}, c.label)), h('th'))), body) : h('div', { class: 'note' }, emptyText),
      h('button', { onclick: () => { list.push(clone(blank)); save(); renderDetail(); } }, '+ Add')];
  }

  /** A creature's home: its ring, how common it is there, the herd size, and (optionally) the only biomes it lives in. */
  function spawnFieldset(cur, o) {
    const save = () => commit(o.section, o.id, cur);
    const group = Array.isArray(cur.group) ? cur.group : [1, 1], groupInput = i => {
      const input = h('input', { type: 'number', min: 1, step: 1, value: group[i] });
      input.addEventListener('input', () => { const g = (Array.isArray(cur.group) ? cur.group : [1, 1]).slice(); g[i] = Math.max(1, Number(input.value) || 1); cur.group = g; save(); });
      return h('label', { class: 'field' }, i ? 'Herd size max' : 'Herd size min', input);
    };
    const biomes = Array.isArray(cur.biomes) ? cur.biomes : [];
    const boxes = BIOMES.map(b => h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: biomes.includes(b), onchange: e => {
      const set = new Set(Array.isArray(cur.biomes) ? cur.biomes : []); if (e.target.checked) set.add(b); else set.delete(b);
      if (set.size) cur.biomes = [...set]; else delete cur.biomes; save();
    } }), Biomes.get(b).name));
    return h('fieldset', {}, h('legend', {}, 'Where it spawns'),
      h('div', { class: 'grid' },
        field('Ring (distance from the village)', cur, 'ring', Object.assign({ type: 'select', options: ringOptions() }, o)),
        field('Weight (0 = never by itself)', cur, 'weight', Object.assign({ type: 'number', min: 0, step: 0.1 }, o)),
        groupInput(0), groupInput(1)),
      h('div', { class: 'note' }, 'Only in these biomes (none ticked = any biome of its ring):'), h('div', { class: 'grid' }, boxes),
      h('p', { class: 'note' }, 'About half of all chunks hold one herd; within a ring, the weight decides how often it is this creature compared with the others living there.'));
  }

  /** An item's crafting recipe: [[itemId, count], ...] made at the crafting table. */
  function craftTable(cur, o) {
    const list = Array.isArray(cur.craft) ? cur.craft : [], save = () => { if (list.length) cur.craft = list; else delete cur.craft; commit(o.section, o.id, cur); };
    const items = () => idsOf('items').map(i => [i, working('items', i).name || i]);
    const rows = list.map((pair, i) => {
      const sel = h('select', {}, items().map(([v, l]) => h('option', { value: v }, l))); sel.value = pair[0];
      sel.addEventListener('change', () => { pair[0] = sel.value; save(); });
      const n = h('input', { type: 'number', min: 1, step: 1, value: pair[1] }); n.addEventListener('input', () => { pair[1] = Math.max(1, Number(n.value) || 1); save(); });
      return h('tr', {}, h('td', {}, sel), h('td', {}, n), h('td', {}, h('button', { onclick: () => { list.splice(i, 1); save(); renderDetail(); } }, 'Remove')));
    });
    return [rows.length ? h('table', { class: 'rows' }, h('thead', {}, h('tr', {}, h('th', {}, 'Ingredient'), h('th', {}, 'Count'), h('th'))), h('tbody', {}, rows)) : h('div', { class: 'note' }, 'Not craftable.'),
      h('button', { onclick: () => { list.push(['plank', 1]); save(); renderDetail(); } }, '+ Add ingredient')];
  }

  /* ------------------------------------------------------------ the list ------------------------------------------------------------ */
  function renderList() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('btnNew').disabled = tab === 'characters';
    const list = $('list'); list.innerHTML = '';
    const q = search.trim().toLowerCase();
    const rows = idsOf(tab).map(id => ({ id, cur: working(tab, id) })).filter(r => !q || r.id.includes(q) || String(r.cur.name || '').toLowerCase().includes(q));
    rows.sort((a, b) => (!isBuiltIn(tab, b.id) - !isBuiltIn(tab, a.id)) || String(a.cur.name || a.id).localeCompare(String(b.cur.name || b.id)));
    for (const { id, cur } of rows) {
      const canvas = h('canvas', { width: 64, height: 64 }), custom = !isBuiltIn(tab, id), edited = !custom && !!draft[tab][id];
      if (tab === 'items') itemIconInto(canvas, id, cur);
      else if (tab === 'creatures') { const src = cur.sprites && (cur.sprites.right || cur.sprites.left || cur.sprites.down || cur.sprites.up); if (src) loadImage(src).then(img => img && drawFitted(canvas, img, cur.sprites.frames || 1)); else creatureArtInto(canvas, id, cur, 'right', ''); }
      else { const src = cur.sprites && (cur.sprites.down || cur.sprites.right || cur.sprites.left); if (src) loadImage(src).then(img => img && drawFitted(canvas, img, cur.sprites.frames || 1)); else characterArtInto(canvas, id, 'down'); }
      const rarity = tab === 'characters' ? null : rarityOf(cur.rarity);
      const btn = h('button', { class: 'entry' + (id === selected ? ' on' : ''), onclick: () => { selected = id; renderList(); renderDetail(); } }, canvas,
        h('span', { class: 'en' }, h('b', {}, tab === 'characters' ? CharacterPalette.bodies[id === 'princess' ? 1 : 0] : cur.name || id), h('small', {}, id)),
        rarity ? h('span', { class: 'rdot', style: `background:${rarity.color}`, title: rarity.name }) : null,
        custom ? h('span', { class: 'tag custom' }, 'new') : edited ? h('span', { class: 'tag edited' }, 'edited') : null);
      list.append(btn);
    }
    if (!rows.length) list.append(h('div', { class: 'empty' }, 'Nothing matches.'));
  }

  /* ------------------------------------------------------------ item form ------------------------------------------------------------ */
  function itemForm(id) {
    const section = 'items', cur = working(section, id), o = { section, id }, custom = !isBuiltIn(section, id), placeable = !!(cur.placeable && cur.placeable.structure);
    const toolKinds = ToolKinds.map(k => [k, k]);
    const parts = [];
    parts.push(h('fieldset', {}, h('legend', {}, 'Basics'), h('div', { class: 'grid' },
      field('Name', cur, 'name', o),
      field('Kind (a label)', cur, 'kind', Object.assign({ type: 'select', options: [['', '(none)'], ...[...new Set(['material', 'berry', 'fruit', 'meat', 'jug', 'weapon', 'wardrobe', 'light', 'treasure', 'tool-item', 'building', cur.kind].filter(Boolean))].map(k => [k, k])] }, o)),
      field('Max stack', cur, 'maxStack', Object.assign({ type: 'number', min: 1, max: 999, step: 1 }, o)),
      field('Rarity', cur, 'rarity', Object.assign({ type: 'select', options: rarityOptions(), blank: 'common' }, o)),
      field('Resource (carry limit, stockpiles)', cur, 'resource', Object.assign({ type: 'select', options: [['', 'none'], ...Object.values(ResourceTypes).map(r => [r.id, r.name])] }, o)),
      field('Colour (badge icon, berries)', cur, 'color', Object.assign({ type: 'color' }, o)))));

    const isFood = !!cur.food, isTool = !!cur.tool, isGear = !!cur.equip;
    const base = baseOf(section, id) || {};                                  // switching off what a built-in item has is stored as null
    const toggle = (label, key, value) => h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: !!cur[key], onchange: e => { if (e.target.checked) cur[key] = base[key] ? clone(base[key]) : value; else if (base[key]) cur[key] = null; else delete cur[key]; commit(section, id, cur); renderDetail(); } }), label);
    parts.push(h('fieldset', {}, h('legend', {}, 'What it does'), h('div', { class: 'grid' },
      toggle('Food (eat it: hold E)', 'food', { hunger: 10, thirst: 0 }),
      toggle('Tool or weapon (swing it)', 'tool', { kind: 'axe', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 }),
      toggle('Wardrobe (crown, outfit or cape)', 'equip', { slot: 'cape', body: 'any', power: 0, def: 0 })),
      isFood ? h('div', { class: 'grid' }, field('Hunger restored', cur, 'food.hunger', Object.assign({ type: 'number', min: 0, max: 100 }, o)), field('Thirst restored', cur, 'food.thirst', Object.assign({ type: 'number', min: 0, max: 100 }, o))) : null,
      isTool ? h('div', { class: 'grid' },
        field('Works like', cur, 'tool.kind', Object.assign({ type: 'select', options: toolKinds, note: 'axe chops, hammer demolishes, knife / spear / sword hunt, bow shoots, rod fishes, shovel digs, leash lassos' }, o)),
        field('Damage', cur, 'tool.damage', Object.assign({ type: 'number', min: 0 }, o)), field('Reach (tiles)', cur, 'tool.reach', Object.assign({ type: 'number', min: 0.5, step: 0.1 }, o)),
        field('Swing time (s)', cur, 'tool.swingTime', Object.assign({ type: 'number', min: 0.15, step: 0.05 }, o)), field('Hits at (s into the swing)', cur, 'tool.impactTime', Object.assign({ type: 'number', min: 0.05, step: 0.05 }, o))) : null,
      isGear ? h('div', { class: 'grid' },
        field('Wardrobe slot', cur, 'equip.slot', Object.assign({ type: 'select', options: ItemEquipSlots.map(s => [s, s]) }, o, { rerender: true })),
        field('Who can wear it', cur, 'equip.body', Object.assign({ type: 'select', options: [['any', 'anyone'], ['princess', 'princesses (a dress)'], ['prince', 'princes (garb)']] }, o)),
        cur.equip.slot === 'cape' ? field('Power (x the pony\'s ability, 0.15 = +15%)', cur, 'equip.power', Object.assign({ type: 'number', min: 0, max: 2, step: 0.05 }, o)) : null,
        cur.equip.slot === 'cape' ? field('Def (each point soaks 2% of damage)', cur, 'equip.def', Object.assign({ type: 'number', min: 0, step: 1 }, o)) : null,
        field('Drawn as (until it has worn pictures)', cur, 'look.style', Object.assign({ type: 'select', options: styleOptions(cur.equip.slot) }, o)),
        field('Main colour', cur, 'look.color', Object.assign({ type: 'color' }, o)),
        cur.equip.slot === 'crown' ? field('Gem colour', cur, 'look.gem', Object.assign({ type: 'color' }, o)) : field('Trim colour', cur, 'look.trim', Object.assign({ type: 'color' }, o))) : null,
      placeable ? h('p', { class: 'note' }, `Builds: ${StructureDefs[cur.placeable.structure] ? StructureDefs[cur.placeable.structure].name : cur.placeable.structure} (new items cannot build structures).`) : null));

    parts.push(h('fieldset', {}, h('legend', {}, 'Where it lies about ', h('small', {}, '(picked up with F; another turns up later)')),
      ...rowsTable(cur, 'spawns', [{ key: 'biome', label: 'Biome', type: 'select', options: biomeOptions }, { key: 'rate', label: 'Per 1000 open tiles', min: 0, step: 0.1 }], { biome: 'normal', rate: 1 }, o, 'Nowhere: it only comes from crafting, hunting, trading ...'),
      h('p', { class: 'note' }, 'A rate of 1 puts about one on every thousand open tiles of that biome (a chunk is 256 tiles). All items in a biome together are capped at 50 per 1000.')));
    if (!placeable) parts.push(h('fieldset', {}, h('legend', {}, 'Crafting ', h('small', {}, '(gives it a recipe at the crafting table: "make_' + id + '")')), ...craftTable(cur, o)));

    const sp = (title, key, extra = {}) => spriteSlot(title, cur, 'sprites.' + key, Object.assign({ folder: 'items', centred: true }, o, extra));
    const slots = [
      sp('Icon', 'icon', { hint: '(inventory, toolbar)', fallback: canvas => { itemIconInto(canvas, id, Object.assign({}, cur, { sprites: {} })); return 'Empty: the game\'s own icon'; } }),
      sp('On the ground', 'ground', { hint: '(lying in the world)', sibling: () => cur.sprites && cur.sprites.icon ? { src: cur.sprites.icon, label: 'the icon' } : null, fallback: canvas => { itemIconInto(canvas, id, cur); return 'Empty: uses the icon'; } }),
      sp('In the hand', 'held', { hint: '(grip at the bottom, pointing up)', fallback: () => isTool || id === 'torch' ? 'Empty: the game draws it' : 'Empty: not shown in the hand' })
    ];
    if (placeable) slots.push(sp('Built', 'placed', { hint: '(fills one tile, bottom at the tile\'s front corner)', fallback: () => 'Empty: the game draws it' }));
    parts.push(h('fieldset', {}, h('legend', {}, 'Pictures'), h('div', { class: 'slots' }, slots)));
    if (isGear) parts.push(h('fieldset', {}, h('legend', {}, 'Worn ', h('small', {}, '(a full-body overlay the size of the character picture, feet at the bottom centre)')),
      ...directionSlots(cur, 'sprites.worn', Object.assign({ folder: 'items', art: canvas => drawText(canvas, 'drawn by\nthe game') }, o)), animationFields(cur, 'sprites.worn', o)));
    return { cur, parts, custom };
  }

  /* ------------------------------------------------------------ creature form ------------------------------------------------------------ */
  function creatureForm(id) {
    const section = 'creatures', cur = working(section, id), o = { section, id }, custom = !isBuiltIn(section, id);
    const pony = !!cur.pony;
    const parts = [];
    parts.push(h('fieldset', {}, h('legend', {}, 'Basics'), h('div', { class: 'grid' },
      field('Name', cur, 'name', o),
      field(pony ? 'Lowest rarity (each pony rolls its own at birth)' : 'Rarity', cur, 'rarity', Object.assign({ type: 'select', options: rarityOptions(), blank: 'common' }, o)),
      field('Health', cur, 'hp', Object.assign({ type: 'number', min: 1 }, o)),
      field('Base level', cur, 'levelBase', Object.assign({ type: 'number', min: 1, step: 1 }, o)),
      field('Wander speed', cur, 'wanderSpeed', Object.assign({ type: 'number', min: 0, step: 0.1 }, o)),
      field('Flee speed', cur, 'fleeSpeed', Object.assign({ type: 'number', min: 0, step: 0.1 }, o)),
      cur.followSpeed !== undefined || cur.tameable ? field('Follow speed (on a leash)', cur, 'followSpeed', Object.assign({ type: 'number', min: 0, step: 0.1 }, o)) : null,
      cur.hostile ? field('Chase speed', cur, 'chaseSpeed', Object.assign({ type: 'number', min: 0, step: 0.1 }, o)) : null,
      pony ? field('Apples to tame', cur, 'tameApples', Object.assign({ type: 'number', min: 1, step: 1 }, o)) : null),
      h('p', { class: 'note' }, `Behaves like: ${[pony && 'a pony (shy, tameable, rideable, never hunted)', cur.hostile && 'a hostile night hunter', cur.tameable && !pony && 'a tameable animal', cur.carry && 'something you can pick up'].filter(Boolean).join(', ') || 'a wild animal'}` + (custom ? ` (copied from ${(ContentPack.builtIn.creatures[cur.base] || {}).name || cur.base})` : ''))));
    if (pony) {
      const lines = RarityOrder.map(r => { const d = RarityDefs[r]; return `${d.name}: ${d.buffs ? d.buffs + ' buff' + (d.buffs > 1 ? 's' : '') : 'basic'}${d.abilities ? ', ' + d.abilities + ' abilit' + (d.abilities > 1 ? 'ies' : 'y') : ''}`; });
      parts.push(h('fieldset', {}, h('legend', {}, 'Rarity & traits ', h('small', {}, '(rolled per pony)')),
        h('p', { class: 'note' }, lines.join(' · ')),
        h('p', { class: 'note' }, 'Buffs: ' + Object.values(BuffDefs).map(b => `${b.name} (${b.label}${b.affectsOthers ? ', also others within ' + b.range + ' tiles' : ''})`).join(', ')),
        h('p', { class: 'note' }, 'Abilities: ' + Object.values(AbilityDefs).map(a => `${a.glyph} ${a.name}: ${a.description}`).join(' · '))));
    }
    if (!pony) parts.push(h('fieldset', {}, h('legend', {}, 'Drops ', h('small', {}, '(when hunted)')),
      ...rowsTable(cur, 'drops', [{ key: 'item', label: 'Item', type: 'select', options: () => idsOf('items').map(i => [i, working('items', i).name || i]) }, { key: 'min', label: 'Min', min: 0, step: 1 }, { key: 'max', label: 'Max', min: 0, step: 1 }, { key: 'chance', label: 'Chance 0-1', min: 0, step: 0.05 }],
        { item: 'hide', min: 1, max: 1 }, o, 'Drops nothing.')));
    parts.push(spawnFieldset(cur, o));

    const variants = pony ? [['', 'Every pony of this kind'], ...PonyVariants.map(v => [v.id, v.name + ' variety'])] : [];
    const variant = variantChoice[id] || '', setPath2 = variant ? `sprites.variants.${variant}` : 'sprites';
    const variantPick = pony ? h('label', { class: 'field' }, 'Picture set', (() => { const s = h('select', { onchange: e => { variantChoice[id] = e.target.value; renderDetail(); } }, variants.map(([v, l]) => h('option', { value: v }, l))); s.value = variant; return s; })(),
      h('small', {}, 'A biome variety\'s own pictures win over the kind\'s.')) : null;
    parts.push(h('fieldset', {}, h('legend', {}, 'Pictures ', h('small', {}, '(feet at the bottom centre; a walk cycle is frames side by side)')), variantPick,
      ...directionSlots(cur, setPath2, Object.assign({ folder: 'creatures', framesPath: 'sprites.frames', art: (canvas, dir) => creatureArtInto(canvas, id, cur, dir, variant) }, o)),
      animationFields(cur, 'sprites', o)));
    return { cur, parts, custom };
  }

  /* ------------------------------------------------------------ character form ------------------------------------------------------------ */
  function characterForm(id) {
    const section = 'characters', cur = working(section, id), o = { section, id };
    const parts = [h('fieldset', {}, h('legend', {}, 'Pictures ', h('small', {}, '(the whole body, feet at the bottom centre; the game\'s body is about 30 x 66 px)')),
      ...directionSlots(cur, 'sprites', Object.assign({ folder: 'characters', turns: true, art: (canvas, dir) => characterArtInto(canvas, id, dir) }, o)), animationFields(cur, 'sprites', o),
      h('p', { class: 'note' }, 'With pictures, every player of this body type uses them (hair and outfit colours are part of the procedural body only). Clothes with "worn" pictures are drawn over them.'))];
    return { cur, parts, custom: false };
  }

  /* ------------------------------------------------------------ detail ------------------------------------------------------------ */
  function renderDetail() {
    const box = $('detail'); box.innerHTML = '';
    if (!selected || !idsOf(tab).includes(selected)) { box.append(h('div', { class: 'empty' }, 'Pick something on the left, or press ', h('b', {}, '+ New'), '.')); return; }
    const id = selected, form = tab === 'items' ? itemForm(id) : tab === 'creatures' ? creatureForm(id) : characterForm(id);
    const edited = !form.custom && !!draft[tab][id];
    const title = tab === 'characters' ? CharacterPalette.bodies[id === 'princess' ? 1 : 0] : form.cur.name || id;
    box.append(h('div', { class: 'dhead' }, h('h2', {}, title), h('code', {}, id), h('span', { class: 'spacer' }),
      form.custom ? h('button', { class: 'danger', onclick: () => { if (confirm(`Delete ${title}? Recipes, drops or saves that use "${id}" will no longer find it.`)) { delete draft[tab][id]; selected = null; saveDraft(); renderList(); renderDetail(); } } }, 'Delete')
        : edited ? h('button', { onclick: () => { if (confirm(`Put ${title} back the way the game built it?`)) { delete draft[tab][id]; saveDraft(); renderList(); renderDetail(); } } }, 'Reset to built-in') : null),
      ...(!form.custom && tab !== 'characters' ? [h('p', { class: 'note' }, 'Built into the game: you can change it (only what you change is saved) but not delete it, because recipes and saves depend on it.')] : []));
    box.append(...form.parts.filter(Boolean));
  }

  /* ------------------------------------------------------------ new entries ------------------------------------------------------------ */
  const ITEM_TEMPLATES = {
    material: { kind: 'material', maxStack: 20 },
    food: { kind: 'food', maxStack: 10, food: { hunger: 10, thirst: 0 } },
    tool: { kind: 'tool', maxStack: 1, tool: { kind: 'axe', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
    weapon: { kind: 'weapon', maxStack: 1, tool: { kind: 'sword', damage: 4, reach: 1.3, swingTime: 0.5, impactTime: 0.25 } },
    cape: { kind: 'wardrobe', maxStack: 1, equip: { slot: 'cape', body: 'any', power: 0.05, def: 1 }, look: { style: 'plain', color: '#7a5a3a', trim: '#5a3f26' } },
    crown: { kind: 'wardrobe', maxStack: 1, equip: { slot: 'crown', body: 'any', power: 0, def: 0 }, look: { style: 'royal', color: '#f2c14e', gem: '#e53935' } },
    dress: { kind: 'wardrobe', maxStack: 1, equip: { slot: 'outfit', body: 'princess', power: 0, def: 0 }, look: { style: 'ball', color: '#d94f8a', trim: '#ffffff' } },
    garb: { kind: 'wardrobe', maxStack: 1, equip: { slot: 'outfit', body: 'prince', power: 0, def: 0 }, look: { style: 'doublet', color: '#7b1fa2', trim: '#f2c14e' } }
  };
  function openNew() {
    const d = $('newDialog'), sel = $('newTemplate');
    $('newTitle').textContent = tab === 'items' ? 'New item' : 'New creature';
    $('newId').value = ''; $('newName').value = ''; $('newError').textContent = '';
    sel.innerHTML = '';
    if (tab === 'items') {
      for (const k of Object.keys(ITEM_TEMPLATES)) sel.append(h('option', { value: 't:' + k }, 'Blank ' + k));
      for (const k of Object.keys(ContentPack.builtIn.items)) if (!ContentPack.builtIn.items[k].placeable) sel.append(h('option', { value: 'c:' + k }, 'Copy of ' + ContentPack.builtIn.items[k].name));
    } else for (const k of Object.keys(ContentPack.builtIn.creatures)) sel.append(h('option', { value: k }, 'Like the ' + ContentPack.builtIn.creatures[k].name));
    d.showModal();
  }
  $('newDialog').addEventListener('close', () => {
    if ($('newDialog').returnValue !== 'ok') return;
    const id = $('newId').value.trim(), name = $('newName').value.trim() || id, t = $('newTemplate').value;
    let entry;
    if (tab === 'items') entry = t.startsWith('t:') ? Object.assign(clone(ITEM_TEMPLATES[t.slice(2)]), { name }) : { base: t.slice(2), name };
    else entry = { base: t, name, weight: 0 };                                  // (it lives nowhere until you give it a weight)
    draft[tab][id] = entry; selected = id; saveDraft(); renderList(); renderDetail();
  });
  $('newCreate').addEventListener('click', e => {
    const id = $('newId').value.trim(), err = $('newError');
    if (!ContentPack.ID_PATTERN.test(id)) { e.preventDefault(); err.textContent = 'Use lower case letters, digits and _ (starting with a letter).'; return; }
    if (idsOf(tab).includes(id) || (tab === 'items' && StructureDefs[id])) { e.preventDefault(); err.textContent = `"${id}" is already taken.`; }
  });

  /* ------------------------------------------------------------ file in / out ------------------------------------------------------------ */
  function download() {
    const text = FILE_HEADER + 'window.PONYSCAPES_CONTENT = ' + JSON.stringify(draft, null, 2) + ';\n';
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })), download: 'customContent.js' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    const waiting = Object.keys(previews).filter(p => JSON.stringify(draft).includes(JSON.stringify(p)));
    showBanner(`Saved customContent.js: put it at <code>public/js/content/customContent.js</code>.` + (waiting.length ? ` Also copy these pictures into <code>public/</code>: ${waiting.map(p => `<code>${p}</code>`).join(', ')}.` : ''), [['OK', hideBanner]]);
  }
  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result), at = text.indexOf('{', text.indexOf('PONYSCAPES_CONTENT') + 1);
        const json = text.trim().startsWith('{') ? text : text.slice(at, text.lastIndexOf('}') + 1);
        draft = normalize(JSON.parse(json)); selected = null; saveDraft(); renderList(); renderDetail();
        showBanner(`Imported ${file.name}.`, [['OK', hideBanner]]);
      } catch (e) { showBanner(`Could not read ${file.name}: it is not a content file written by this editor (${e.message}).`, [['OK', hideBanner]]); }
    };
    reader.readAsText(file);
  }
  function showBanner(html, buttons) {
    const b = $('banner'); b.hidden = false; b.innerHTML = `<span>${html}</span>`;
    for (const [label, fn] of buttons) b.append(h('button', { onclick: fn }, label));
  }
  const hideBanner = () => { $('banner').hidden = true; };

  /* ------------------------------------------------------------ start ------------------------------------------------------------ */
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; selected = null; renderList(); renderDetail(); });
  $('search').addEventListener('input', e => { search = e.target.value; renderList(); });
  $('btnNew').addEventListener('click', openNew);
  $('btnDownload').addEventListener('click', download);
  $('importFile').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  $('btnPlay').addEventListener('click', () => { saveDraft(); window.open('index.html?solo=1&content=draft', '_blank'); });
  $('btnDiscard').addEventListener('click', () => { if (!confirm('Throw the draft away and go back to what js/content/customContent.js holds?')) return; draft = normalize(fileData); try { localStorage.removeItem(ContentPack.DRAFT_KEY); } catch (e) { /* nothing to remove */ } selected = null; setStatus(); renderList(); renderDetail(); });
  document.querySelectorAll('input[name=pickMode]').forEach(r => r.addEventListener('change', () => { pickMode = r.value; }));

  const saved = loadDraft();
  if (saved && JSON.stringify(saved) !== JSON.stringify(normalize(fileData))) {
    draft = saved;
    let at = ''; try { at = new Date(Number(localStorage.getItem(DRAFT_AT_KEY))).toLocaleString(); } catch (e) { /* unknown */ }
    showBanner(`Continuing your draft${at ? ' from ' + at : ''}, which differs from js/content/customContent.js.`, [['Keep the draft', hideBanner], ['Use the file instead', () => { draft = normalize(fileData); saveDraft(); hideBanner(); renderList(); renderDetail(); }]]);
  }
  setStatus(); renderList(); renderDetail();
})();
