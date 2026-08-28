#!/usr/bin/env node
/* =========================================================================
   make-sprite.mjs — generates the original placeholder pixel-art sprites.

   Zero dependencies: encodes PNG by hand (zlib is in Node core). These are
   ORIGINAL 16x16 sprites drawn in our own token palette — nothing is traced
   from or copied out of any reference screenshot.

   They exist to prove the pixel pipeline end to end: authored at 1x, shipped
   at 1x, scaled to 3x/4x by CSS with image-rendering: pixelated. Never
   pre-scale a sprite in the file, and never scale by a fractional factor.

   Usage:  node tools/make-sprite.mjs
   ========================================================================= */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "src/assets/sprites");

/* ---- palette -------------------------------------------------------------
   THESE TWO SPRITES ARE PIXEL ART, so §0 applies to them and not the chrome
   tokens. The critic caught exactly this: cog.png and aether-shard.png were
   drawn straight out of tokens.css — #050A10, #44169E, #FFFFFF — and shipped
   152 and 118 pixels off the 5-bit grid, in the one tab that links to the
   page certifying the grid. The tokens are correct for CSS and wrong here.

   So every value below is quantised through snes() at load, and the two icons
   are redrawn with the same discipline the atelier certifies: four-step ramps
   on the mass that owns the most pixels, one tinted outline that is never
   #000000, and #F8F8F8 where a lesser sprite would put white.
   ------------------------------------------------------------------------ */

const snes = (v) => Math.min(248, Math.max(0, Math.round(v / 8) * 8));
const q = (hex) => {
  const n = hex.replace("#", "");
  return (
    "#" +
    [0, 2, 4]
      .map((i) => snes(parseInt(n.slice(i, i + 2), 16)).toString(16).padStart(2, "0"))
      .join("")
  );
};

const PAL = {
  ".": null,
  k: q("#100810"),         // tinted outline, never black
  D: q("#280850"),         // violet, four steps
  d: q("#481898"),
  c: q("#7038C8"),
  b: q("#A878E8"),
  l: q("#D8C0F8"),         // the crystal's lit facet
  G: q("#584018"),         // gold, four steps
  H: q("#8A6828"),
  g: q("#D0A048"),
  y: q("#F0D8A0"),
  w: q("#F8F8F8"),
};

/* ---- sprites ------------------------------------------------------------
   Authored as character grids. Width is taken from the widest row; short
   rows are padded with transparent, and every row is validated.
   ------------------------------------------------------------------------ */

/* Aether Shard — the violet currency crystal. Light upper-left: the two
   left facets carry the top of the ramp, the right facet its foot, and one
   lit edge runs the length of the crystal's spine. */
const SHARD = [
  "................",
  ".......kk.......",
  "......klbk......",
  ".....klblck.....",
  "....klbbldck....",
  "....klbbldcDk...",
  "...klbbbldcDk...",
  "...klbbbldcDk...",
  "..klbbbcldcDDk..",
  "..klbbbcldcDDk..",
  "..klbbcclddDDk..",
  "...kbbccldDDk...",
  "....kbcclDDk....",
  ".....kcclDk.....",
  "......kcDk......",
  ".......kk.......",
];

/* Cog — the gold currency. Same idea: the upper-left teeth are lit, the
   lower-right ones sit in the ramp's foot, and the bore is cut in outline so
   the ring reads as a solid object with a hole rather than as a stamp. */
const COG = [
  "................",
  "....k.kyyk.k....",
  "....kkyyygkk....",
  "..kkkyyyyggkkk..",
  "..kyyygHHgggHk..",
  "..kyyHHkkHHggk..",
  ".kkygHkkkkHgGkk.",
  ".kyygHk..kHgGGk.",
  ".kyggHk..kHGGGk.",
  ".kkyggkkkkGGGkk.",
  "..kyggHHGGGGHk..",
  "..kgggHGGgGGHk..",
  "..kkkgggGGGkkk..",
  "....kkgGGGkk....",
  "....k.kGGk.k....",
  "................",
];
/* ---- PNG encoder -------------------------------------------------------- */

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

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Encode a character grid as an 8-bit RGBA PNG at exactly 1x. */
function encodeSprite(name, grid) {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));

  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));

  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0 (None) — smallest sprites compress fine
    const row = grid[y].padEnd(w, ".");
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (!(ch in PAL)) {
        throw new Error(`${name}: unknown palette char "${ch}" at row ${y}, col ${x}`);
      }
      const hex = PAL[ch];
      const o = rowStart + 1 + x * 4;
      if (hex === null) {
        raw[o] = raw[o + 1] = raw[o + 2] = raw[o + 3] = 0;
      } else {
        const [r, g, b] = hexToRgb(hex);
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  return { png, w, h };
}

/* ---- run ---------------------------------------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

const sprites = [
  ["aether-shard", SHARD],
  ["cog", COG],
];

for (const [name, grid] of sprites) {
  const { png, w, h } = encodeSprite(name, grid);
  const path = resolve(OUT_DIR, `${name}.png`);
  writeFileSync(path, png);
  console.log(`  ${name}.png  ${w}x${h}  ${png.length} bytes`);
}

console.log(`\nWrote ${sprites.length} sprites to src/assets/sprites/`);
