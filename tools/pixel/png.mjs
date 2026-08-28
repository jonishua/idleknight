/* =========================================================================
   png.mjs — a complete, zero-dependency PNG codec.

   Node's zlib is the only thing this leans on. It exists because the whole
   pixel pipeline has to be auditable: we encode our own sprites, and we
   decode them again (plus the reference captures) to PROVE the 5-bit rule,
   the per-sprite colour budget and the dither ratio. A pipeline you cannot
   read back is a pipeline you cannot verify.

   decode()  handles bit depth 8 and 16, colour types 0/2/3/4/6, tRNS,
             interlace 0, and all five scanline filters.
   encode()  writes 8-bit RGBA (colour type 6). Small images, level-9
             deflate, filter chosen per scanline by the standard heuristic.
   ========================================================================= */

import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* ---- decode ------------------------------------------------------------- */

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function unfilter(raw, w, h, bpp, stride) {
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride;
    const p = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[p + x] : 0;
      const c = y > 0 && x >= bpp ? out[p + x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      out[o + x] = v;
    }
  }
  return out;
}

/**
 * Decode a PNG buffer to { width, height, data } where data is RGBA8.
 * Interlaced (Adam7) images are rejected — we never produce them and the
 * reference captures are all non-interlaced.
 */
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");

  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;

    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colour: data[9],
        interlace: data[12],
      };
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
  }

  if (!ihdr) throw new Error("PNG has no IHDR");
  if (ihdr.interlace) throw new Error("interlaced PNG not supported");

  const { width: w, height: h, depth, colour } = ihdr;
  const nch = CHANNELS[colour];
  if (!nch) throw new Error(`unsupported PNG colour type ${colour}`);

  const bitsPerPixel = nch * depth;
  const stride = Math.ceil((w * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));

  const raw = unfilter(inflateSync(Buffer.concat(idat)), w, h, bpp, stride);
  const out = new Uint8Array(w * h * 4);

  const sample = (row, i) => {
    if (depth === 16) return raw[row * stride + i * 2];       // take the high byte
    if (depth === 8) return raw[row * stride + i];
    const per = 8 / depth;
    const byte = raw[row * stride + Math.floor(i / per)];
    const shift = 8 - depth * ((i % per) + 1);
    const max = (1 << depth) - 1;
    return Math.round((((byte >> shift) & max) / max) * 255);
  };
  const rawIndex = (row, i) => {
    if (depth === 8) return raw[row * stride + i];
    const per = 8 / depth;
    const byte = raw[row * stride + Math.floor(i / per)];
    const shift = 8 - depth * ((i % per) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (colour === 3) {
        const idx = rawIndex(y, x);
        out[o] = palette[idx * 3];
        out[o + 1] = palette[idx * 3 + 1];
        out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colour === 0 || colour === 4) {
        const g = sample(y, x * nch);
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = colour === 4 ? sample(y, x * nch + 1) : 255;
      } else {
        out[o] = sample(y, x * nch);
        out[o + 1] = sample(y, x * nch + 1);
        out[o + 2] = sample(y, x * nch + 2);
        out[o + 3] = colour === 6 ? sample(y, x * nch + 3) : 255;
      }
    }
  }

  return { width: w, height: h, data: out };
}

/* ---- encode ------------------------------------------------------------- */

function filterRow(cur, prev, bpp, stride) {
  // Standard minimum-sum-of-absolute-differences heuristic across all five
  // filters. On art this small the win is modest, but it costs nothing.
  let best = null;
  for (let f = 0; f < 5; f++) {
    const line = Buffer.alloc(stride);
    let sum = 0;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = cur[x]; break;
        case 1: v = cur[x] - a; break;
        case 2: v = cur[x] - b; break;
        case 3: v = cur[x] - ((a + b) >> 1); break;
        default: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v = cur[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      }
      line[x] = v & 0xff;
      sum += Math.min(line[x], 256 - line[x]);
    }
    if (!best || sum < best.sum) best = { sum, f, line };
  }
  return best;
}

/** Encode RGBA8 pixels as a PNG buffer. `data` is a Uint8Array of w*h*4. */
export function encode(width, height, data) {
  const stride = width * 4;
  const rows = [];
  let prev = null;
  for (let y = 0; y < height; y++) {
    const cur = Buffer.from(data.buffer, data.byteOffset + y * stride, stride);
    const { f, line } = filterRow(cur, prev, 4, stride);
    rows.push(Buffer.concat([Buffer.from([f]), line]));
    prev = cur;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
