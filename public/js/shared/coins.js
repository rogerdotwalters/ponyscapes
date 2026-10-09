'use strict';
/* SHARED - the coin system. Ten kinds of coin: copper, silver, gold, platinum and titanium (each worth TEN of the one below), then the gem coins
 * (ruby, sapphire, emerald, amethyst, diamond), each worth FIVE of the one below. Gold is the unit everything in the game is priced in, so a gold
 * coin is worth 100 copper. The purse (Inventory.purse) holds real coins, a count of each kind: an Inventory keeps `coins` (an array of counts, one per
 * kind, copper first) and `purse` is their total in COPPER. Gaining coins adds that kind and merges any kind that reaches its ratio up into the next
 * (10 silver become 1 gold); paying works out change; "break" and "merge" are the player's own exchange (the coin bag, coinBagUI.js). */
const Coins = (() => {
  const TIERS = [
    { id: 'copper_coin',   name: 'Copper',   letter: 'C', ratio: 1,  face: ['#f0a872', '#c97a3c', '#8a4f22'], edge: ['#a85f2c', '#6f3d18'] },
    { id: 'silver_coin',   name: 'Silver',   letter: 'S', ratio: 10, face: ['#f4f6fa', '#c3c8d2', '#868d9a'], edge: ['#a2a8b4', '#6a707c'] },
    { id: 'gold_coin',     name: 'Gold',     letter: 'G', ratio: 10, face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
    { id: 'platinum_coin', name: 'Platinum', letter: 'P', ratio: 10, face: ['#f2fbff', '#cfe3ee', '#8fa9bb'], edge: ['#a6c0d0', '#68808f'] },
    { id: 'titanium_coin', name: 'Titanium', letter: 'T', ratio: 10, face: ['#c9d2e4', '#7f8ba6', '#4d566e'], edge: ['#6a7590', '#3e465a'] },
    { id: 'ruby_coin',     name: 'Ruby',     letter: '', ratio: 5,  gem: '#d42a4a', face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
    { id: 'sapphire_coin', name: 'Sapphire', letter: '', ratio: 5,  gem: '#2f62d6', face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
    { id: 'emerald_coin',  name: 'Emerald',  letter: '', ratio: 5,  gem: '#2fb45e', face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
    { id: 'amethyst_coin', name: 'Amethyst', letter: '', ratio: 5,  gem: '#9a4ad6', face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
    { id: 'diamond_coin',  name: 'Diamond',  letter: '', ratio: 5,  gem: '#bdf0ff', face: ['#fff0a8', '#e8b030', '#b07a10'], edge: ['#c38a14', '#7a5208'] },
  ];
  let v = 1; for (const t of TIERS) { v *= t.ratio; t.value = v; }                        // value in COPPER: 1, 10, 100, 1000, 10000, 50000, 250000 ...
  const index = Object.freeze(Object.fromEntries(TIERS.map((t, i) => [t.id, i])));
  const N = TIERS.length, MAX_TOTAL = 1e12;                                               // (the purse holds at most a trillion copper)

  const api = {
    TIERS, N, MAX_TOTAL, GOLD: index.gold_coin,
    isCoin: id => Object.prototype.hasOwnProperty.call(index, id),
    tierOf: id => (api.isCoin(id) ? index[id] : -1),
    value: id => (api.isCoin(id) ? TIERS[index[id]].value : 0),
    empty: () => new Array(N).fill(0),
    /** A clean array of N counts (from anything the network or a save hands us). */
    sanitize(arr) { const out = api.empty(); if (Array.isArray(arr)) for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(MAX_TOTAL, Math.floor(+arr[i]) || 0)); return out; },
    total: arr => arr.reduce((s, n, i) => s + n * TIERS[i].value, 0),
    /** The fewest coins worth `copper`: the biggest kinds first. */
    fromTotal(copper) {
      const out = api.empty(); let left = Math.max(0, Math.floor(copper) || 0);
      for (let i = N - 1; i >= 0; i--) { out[i] = Math.floor(left / TIERS[i].value); left -= out[i] * TIERS[i].value; }
      return out;
    },
    /** Merge up: every kind that has reached its ratio turns into the next kind, from copper to diamond. Returns arr. */
    merge(arr) { for (let i = 0; i < N - 1; i++) { const r = TIERS[i + 1].ratio, k = Math.floor(arr[i] / r); if (k) { arr[i] -= k * r; arr[i + 1] += k; } } return arr; },
    /** Add `n` coins of kind `t` and merge up from there (10 copper -> 1 silver ...). */
    add(arr, t, n) { arr[t] += n; for (let i = t; i < N - 1; i++) { const r = TIERS[i + 1].ratio, k = Math.floor(arr[i] / r); if (!k) break; arr[i] -= k * r; arr[i + 1] += k; } return arr; },
    /** Break one coin of kind `t` (t > 0) into the kind below. False if there is none. */
    breakCoin(arr, t) { if (!(t > 0 && t < N) || arr[t] < 1) return false; arr[t]--; arr[t - 1] += TIERS[t].ratio; return true; },
    /** Pay `copper` out of the coins, small coins first, with change in smaller coins when a bigger one has to be given. False (nothing changed) if there is not enough. */
    pay(arr, copper) {
      copper = Math.floor(copper); if (copper <= 0) return true;
      if (api.total(arr) < copper) return false;
      let left = copper;
      for (let i = 0; i < N && left > 0; i++) { const k = Math.min(arr[i], Math.floor(left / TIERS[i].value)); arr[i] -= k; left -= k * TIERS[i].value; }
      if (left > 0) {                                                                      // a bigger coin has to be broken: it is given whole and the change comes back
        const i = arr.findIndex((n, t) => n > 0 && TIERS[t].value > left);
        arr[i]--; const change = api.fromTotal(TIERS[i].value - left);
        for (let t = 0; t < N; t++) arr[t] += change[t];
      }
      return true;
    },
    /** "3 Gold, 4 Silver" (the biggest kinds first) for an array of counts, or a total in copper. */
    format(arrOrTotal, short = false) {
      const arr = Array.isArray(arrOrTotal) ? arrOrTotal : api.fromTotal(arrOrTotal), out = [];
      for (let i = N - 1; i >= 0; i--) if (arr[i]) out.push(arr[i].toLocaleString() + (short ? ' ' + (TIERS[i].letter || TIERS[i].name.slice(0, 3)) : ' ' + TIERS[i].name));
      return out.length ? out.join(short ? ' \u00b7 ' : ', ') : (short ? '0' : 'no coins');
    },
  };
  return api;
})();
