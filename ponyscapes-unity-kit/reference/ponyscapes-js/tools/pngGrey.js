'use strict';
/* TOOLS - a tiny greyscale PNG reader / writer (Node only, no packages). Reads 8- and 16-bit greyscale (also 8-bit grey+alpha and RGB / RGBA where
 * every pixel is a shade of grey), never interlaced. Writes 8- or 16-bit greyscale.
 *   decode(buffer) -> { width, height, depth, grey: Uint16Array (one value per pixel, row-major) }
 *   encode(width, height, grey, depth) -> Buffer */
const zlib = require('zlib');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function decode(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let pos = 8, header = null, palette = null;
  const data = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'PLTE') palette = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  if (!header || !data.length) throw new Error('the PNG has no image data');
  const { width, height, depth, color, interlace } = header;
  if (interlace) throw new Error('interlaced PNGs are not supported: save it without interlacing');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || ![8, 16].includes(depth)) throw new Error(`unsupported PNG (colour type ${color}, ${depth}-bit): save it as 8-bit or 16-bit greyscale`);
  const bpp = channels * depth / 8, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(data)), out = Buffer.alloc(stride * height);
  if (raw.length < (stride + 1) * height) throw new Error('the PNG data is cut short');
  for (let y = 0; y < height; y++) {                                              // undo each row's filter
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter > 4) throw new Error('bad PNG row filter');
      out[dst + x] = v & 255;
    }
  }
  const grey = new Uint16Array(width * height), sample = (i, ch) => (depth === 16 ? out.readUInt16BE((i * channels + ch) * 2) : out[i * channels + ch]);
  for (let i = 0; i < grey.length; i++) {
    if (color === 3) { const k = out[i]; grey[i] = palette[k * 3]; if (palette[k * 3] !== palette[k * 3 + 1] || palette[k * 3] !== palette[k * 3 + 2]) throw new Error('the picture must be greyscale (a palette colour is not grey)'); }
    else if (color === 0 || color === 4) grey[i] = sample(i, 0);
    else { const r = sample(i, 0), g = sample(i, 1), b = sample(i, 2); if (r !== g || g !== b) throw new Error('the picture must be greyscale (a pixel is coloured)'); grey[i] = r; }
  }
  return { width, height, depth, grey };
}

function chunk(type, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

function encode(width, height, grey, depth = 8) {
  const bytes = depth / 8, stride = width * bytes, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = grey[y * width + x], at = y * (stride + 1) + 1 + x * bytes;
    if (depth === 16) raw.writeUInt16BE(v, at); else raw[at] = v;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = 0;        // colour type 0: greyscale
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decode, encode };
