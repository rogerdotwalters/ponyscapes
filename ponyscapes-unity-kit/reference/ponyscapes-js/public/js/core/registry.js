'use strict';
/* CORE - the one table type the whole game uses for its data.
 *
 * A Registry is a named, validated, read-only table of definitions keyed by `id`: foods, weapons, ponies, creatures, biomes, rings...
 * Each kind of thing lives in ITS OWN registry, and each entry is registered from ITS OWN small data file. Systems never hard-code a
 * list of things: they ask a registry. So adding a pony, a food or a monster means adding one entry (usually one file): no system changes.
 *
 *   const Foods = new Registry('foods', { required: ['name', 'hunger'] });
 *   Foods.register({ id: 'pear', name: 'Pear', hunger: 9, thirst: 3 });
 *   Foods.get('pear');   Foods.all();   Foods.where(f => f.hunger > 8);   Foods.toObject();
 */
class Registry {
  /** @param {string} name  @param {{required?: string[], check?: (def)=>string|null}} [rules] required fields; check returns an error message or null */
  constructor(name, rules = {}) { this.name = name; this.rules = rules; this.entries = new Map(); }

  register(def) {
    if (!def || typeof def.id !== 'string' || !def.id) throw new Error(`${this.name}: every entry needs a string id`);
    if (this.entries.has(def.id)) throw new Error(`${this.name}: duplicate id "${def.id}"`);
    for (const field of this.rules.required || []) if (def[field] === undefined) throw new Error(`${this.name}: "${def.id}" is missing "${field}"`);
    const problem = this.rules.check ? this.rules.check(def) : null;
    if (problem) throw new Error(`${this.name}: "${def.id}" ${problem}`);
    this.entries.set(def.id, Object.freeze(Object.assign({}, def)));
    return this;
  }
  registerAll(defs) { for (const def of defs) this.register(def); return this; }

  get(id) { return this.entries.get(id) || null; }
  has(id) { return this.entries.has(id); }
  /** Like get(), but a missing id is a programming error. */
  require(id) { const def = this.entries.get(id); if (!def) throw new Error(`${this.name}: unknown id "${id}"`); return def; }
  all() { return [...this.entries.values()]; }
  ids() { return [...this.entries.keys()]; }
  where(predicate) { return this.all().filter(predicate); }
  get size() { return this.entries.size; }
  /** A frozen { id: def } object (how the older, global tables are exposed). */
  toObject() { return Object.freeze(Object.fromEntries(this.entries)); }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { Registry };
