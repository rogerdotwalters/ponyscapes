'use strict';
/* SHARED (browser + Cloudflare Worker + tests) - the wire format spoken through the relay.
 *
 * Topology: ONE host (whose browser runs the whole game) and up to three clients, all connected to a Durable Object "room" that only
 * copies frames between them. Frames are plain text so the relay never has to parse (or pay to re-encode) a big game message:
 *
 *   client -> relay   any text frame.                          relay -> host:   "<cid>|<frame>"            (cid = c1..c3)
 *   host   -> relay   "<cid>|<frame>"    one client            relay -> client: "<frame>"
 *                     "*|<frame>"        every client
 *                     "#<cid>,<len>,<frame><cid>,<len>,<frame>..."   several clients, one frame each (one socket message instead of N)
 *                     "{...json...}"     a control message to the relay: { t:'kick', cid } | { t:'end' }
 *   relay -> anyone   {"t":"relay","ev":"hosting|joined|peer_join|peer_leave|host_left|kicked|ended|error", ...}
 *   either end        the literal text "ping" is answered "pong" by the relay itself (keep-alive, costs nothing).
 *
 * A message bigger than the 1 MiB WebSocket limit travels as {"t":"part","id":n,"i":k,"n":total,"d":"..."} pieces. */
const RelayProtocol = (() => {
  const P = {
    VERSION: 1, MAX_PLAYERS: 4,
    MAX_CLIENT_FRAME: 16384,                 // clients only send inputs and commands: small
    PART_SIZE: 600000, MAX_PARTS: 64,        // large host messages are cut into pieces of this many characters
    CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_LENGTH: 5,
    MAX_NAME: 16,

    makeCode(rng = Math.random) { let s = ''; for (let i = 0; i < P.CODE_LENGTH; i++) s += P.CODE_ALPHABET[Math.floor(rng() * P.CODE_ALPHABET.length)]; return s; },
    normalizeCode: text => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    isCode: text => typeof text === 'string' && text.length === P.CODE_LENGTH && [...text].every(c => P.CODE_ALPHABET.includes(c)),
    cleanName: text => String(text || '').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, P.MAX_NAME),
    isClientId: text => /^c[1-3]$/.test(text),

    /* ---- building frames ---- */
    toClient: (cid, body) => cid + '|' + body,
    broadcast: body => '*|' + body,
    multi: items => '#' + items.map(i => i.cid + ',' + i.body.length + ',' + i.body).join(''),
    fromClient: (cid, raw) => cid + '|' + raw,

    /* ---- reading frames ---- */
    /** What the host sent the relay: { control } | { items: [{ to, body }] } | null (garbage). */
    parseHostFrame(raw) {
      const first = raw.charCodeAt(0);
      if (first === 123) { try { return { control: JSON.parse(raw) }; } catch (e) { return null; } }       // '{'
      if (first === 35) {                                                                                  // '#'
        const items = []; let at = 1;
        while (at < raw.length) {
          const a = raw.indexOf(',', at); if (a < 0) return null;
          const b = raw.indexOf(',', a + 1); if (b < 0) return null;
          const len = parseInt(raw.slice(a + 1, b), 10); if (!(len >= 0)) return null;
          const body = raw.substr(b + 1, len); if (body.length !== len) return null;
          items.push({ to: raw.slice(at, a), body }); at = b + 1 + len;
        }
        return { items };
      }
      const bar = raw.indexOf('|');
      return bar < 1 ? null : { items: [{ to: raw.slice(0, bar), body: raw.slice(bar + 1) }] };
    },
    /** What the relay forwarded to the host: { cid, body } | null. */
    parseClientFrame(raw) { const bar = raw.indexOf('|'); return bar < 1 ? null : { cid: raw.slice(0, bar), body: raw.slice(bar + 1) }; },

    /* ---- big messages ---- */
    /** One message -> a list of frames: [body] if it fits, else part-envelopes. */
    split(body, id) {
      if (body.length <= P.PART_SIZE) return [body];
      const n = Math.ceil(body.length / P.PART_SIZE), out = [];
      for (let i = 0; i < n; i++) out.push(JSON.stringify({ t: 'part', id, i, n, d: body.slice(i * P.PART_SIZE, (i + 1) * P.PART_SIZE) }));
      return out;
    }
  };

  /** Puts pieces back together. push() takes a parsed {t:'part'} and returns the whole message once the last piece arrives. */
  P.Reassembler = class {
    constructor() { this.id = null; this.parts = []; this.have = 0; }
    push(msg) {
      if (!Number.isInteger(msg.n) || msg.n < 1 || msg.n > P.MAX_PARTS || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= msg.n || typeof msg.d !== 'string') return null;
      if (msg.id !== this.id || this.parts.length !== msg.n) { this.id = msg.id; this.parts = new Array(msg.n).fill(null); this.have = 0; }
      if (this.parts[msg.i] === null) { this.parts[msg.i] = msg.d; this.have++; }
      if (this.have < msg.n) return null;
      const whole = this.parts.join(''); this.parts = []; this.have = 0; this.id = null;
      return whole;
    }
  };
  return P;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RelayProtocol;
