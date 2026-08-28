#!/usr/bin/env node
/* =========================================================================
   make-skill-sprites.mjs — the item sprites used by the skill screen.

   Run:  node src/assets/icons/skills/make-skill-sprites.mjs

   Zero dependencies; PNG encoded by hand (zlib is Node core). Every sprite
   here is ORIGINAL — nothing traced, sampled or copied from any reference.

   THE RULES THIS FILE OBEYS (reference/ffvi-art.md):

   1. 5-bit colour. The SNES stores BGR555, so every channel of every colour
      below is a multiple of 8. The script asserts it at build time — a
      colour off the /8 grid fails the build rather than shipping.
   2. Authored at 1x, shipped at 1x. CSS scales by whole numbers only
      (x2 in list rows, x3 in the action panel). Never pre-scale a file.
   3. Three-step ramps with hue-shifted shadows — shadows rotate warmer and
      more saturated as they darken, they are not the body colour multiplied.
   4. Outlines are tinted toward the scene, never #000000.
   5. Light from the upper-left, everywhere, always.
   6. No dithering. FFVI's real dither coverage is 1-4% of pixels; at 16x16
      there is no budget for it and faking it reads as noise.

   PALETTE DISCIPLINE. reference/ui-bar.md allows exactly two accents, gold
   and violet. Item sprites are content rather than chrome, but they sit in a
   dense chrome-heavy screen, so every ramp here stays inside
   {gold family, violet family, neutral stone} with ember used only as a 1-2px
   accent inside the coalstone. No third hue enters the screen.

   STRUCTURE. Silhouettes are authored once as generic templates using ramp
   slots (0 darkest .. 3 lightest, plus `*` accent and `w` specular), then
   palette-swapped per item. That is literally how the SNES did it — one
   sprite, many 15-colour palettes — and it keeps fourteen icons visually
   related instead of fourteen separate drawings.
   ========================================================================= */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)));
const SIZE = 16;

/* =========================================================================
   TEMPLATES — silhouettes on a 16x16 grid.
     .  transparent      k  outline
     0  darkest ramp     1  shadow      2  body      3  lit
     *  accent           w  specular highlight
   ========================================================================= */

/* Trapezoidal bar seen three-quarters from above: narrow back face at the
   top, full-width front face below, so it reads as a solid object rather
   than a rectangle. */
const INGOT = [
  "................",
  "................",
  ".....kkkkkk.....",
  "....k333333k....",
  "...k33w33333k...",
  "..k3333333333k..",
  ".k333333333333k.",
  "k33333333333333k",
  "k22222222222222k",
  "k22222222*11111k",
  "k11111111*11110k",
  "k11110000000000k",
  "k00000000000000k",
  ".kkkkkkkkkkkkkk.",
  "................",
  "................",
];

/* Irregular chunk with a mineral vein running through it. */
const ORE = [
  "................",
  "................",
  "......kkkk......",
  ".....k3332k.....",
  "...kk333222kk...",
  "..k33332*2221k..",
  ".k3333*22*22110k",
  ".k333*2222*2110k",
  ".k33222222*1110k",
  ".k2222222211100k",
  ".k2222211111000k",
  "..k2211111000k..",
  "...k11110000k...",
  "....kkkkkkkk....",
  "................",
  "................",
];

/* Shield-shaped armour plate with two rivets. */
const PLATE = [
  "................",
  "................",
  "...kkkkkkkkkk...",
  "..k3333333333k..",
  ".k333w33333333k.",
  ".k333333322222k.",
  ".k333*22222*22k.",
  ".k222222222221k.",
  ".k222222222111k.",
  ".k221111111110k.",
  ".k111111111000k.",
  "..k1110000000k..",
  "...k00000000k...",
  "....kkkkkkkk....",
  "................",
  "................",
];

/* A domed stud. Small, round, obviously a fastener next to the bars. */
const RIVET = [
  "................",
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "...kk333333kk...",
  "..k3w33322222k..",
  ".k33333*2222211k",
  ".k3332222222110k",
  ".k2222222211100k",
  "..k22111110000k.",
  "...kk1100000kk..",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
];

/* Cut octahedron — the faceted-gem silhouette. */
const CORE = [
  "................",
  ".......kk.......",
  "......k33k......",
  ".....k3333k.....",
  "....k3w3322k....",
  "...k33333222k...",
  "..k3333322221k..",
  ".k33333*2222211k",
  ".k3333*22222111k",
  "..k33222222110k.",
  "...k3222211100k.",
  "....k22211000k..",
  ".....k21100k....",
  "......k100k.....",
  ".......kk.......",
  "................",
];

/* Small kite crystal — the loose currency-scale drop. */
const MOTE = [
  "................",
  "................",
  "................",
  ".......kk.......",
  "......k33k......",
  ".....k3ww3k.....",
  "....k33ww22k....",
  "...k333ww221k...",
  "...k333w2221k...",
  "....k33w221k....",
  ".....k3w21k.....",
  "......k21k......",
  ".......kk.......",
  "................",
  "................",
  "................",
];

/* Wound coil: three banded turns, each with its own lit top row. */
const FILAMENT = [
  "................",
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  "..k33333333w2k..",
  "..k2111111110k..",
  "..kkkkkkkkkkkk..",
  "..k3333333332k..",
  "..k2111111110k..",
  "..kkkkkkkkkkkk..",
  "..k333*333332k..",
  "..k2111111110k..",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
];

/* Square rune tablet. The etched mark is cut in the accent slot so a sigil
   never reads as a recoloured armour plate. */
const SIGIL = [
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  "..k3333w33332k..",
  "..k33*******2k..",
  "..k3333**3332k..",
  "..k333****332k..",
  "..k33*3**3*22k..",
  "..k333****321k..",
  "..k2333**3211k..",
  "..k22*******1k..",
  "..k2211111100k..",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
];

/* Ground lens: a disc with a three-pixel specular in the upper-left and a
   rim catch on the right, so glass reads as glass at 32px. */
const LENS = [
  "................",
  "................",
  ".....kkkkkk.....",
  "...kk333333kk...",
  "..k3www333322k..",
  ".k3www33333222k.",
  "k3www333332222*k",
  "k33w3333322222*k",
  "k3333322222211*k",
  "k3322222211111*k",
  ".k222221111100k.",
  "..k2211111000k..",
  "...kk111000kk...",
  ".....kkkkkk.....",
  "................",
  "................",
];

/* The largest silhouette in the set — a deep-cut heart-stone, reserved for
   the capstone recipe so the top of the ladder looks like the top. */
const HEART = [
  "................",
  "................",
  "....kkkkkkkk....",
  "...k33333322k...",
  "..k3w33332222k..",
  ".k333333*222221k",
  "k33333*22222211k",
  "k3333*222222111k",
  "k33322222221110k",
  ".k2222222211100k",
  "..k222221111000k",
  "...k2211110000k.",
  "....k11100000k..",
  ".....k110000k...",
  "......kkkk......",
  "................",
];

/* =========================================================================
   RAMPS — 4 values + accent + specular, all on the /8 grid.
   Shadows rotate hue as they darken (warmer for metal, deeper violet for
   arcane) instead of being the body colour scaled down.
   ========================================================================= */

const OUTLINE = "#080810"; // cool-tinted near-black, never pure black

const RAMPS = {
  /* Gold family */
  sunwrought: { 0: "#785018", 1: "#A87830", 2: "#D8A848", 3: "#F8D8A0", "*": "#F8F8F8", w: "#F8F8F8" },
  palegilt:   { 0: "#786040", 1: "#B09868", 2: "#E0C890", 3: "#F8E8C0", "*": "#F8F8F8", w: "#F8F8F8" },
  vergebrass: { 0: "#583818", 1: "#906830", 2: "#C89848", 3: "#F0C878", "*": "#B098D8", w: "#F8F8F8" },
  cinder:     { 0: "#301008", 1: "#703020", 2: "#A85838", 3: "#D89060", "*": "#F8C060", w: "#F8C060" },

  /* Violet family */
  gravebrand: { 0: "#280840", 1: "#501898", 2: "#7838C0", 3: "#B098D8", "*": "#F8D8A0", w: "#F8F8F8" },
  stormcast:  { 0: "#301848", 1: "#603098", 2: "#9868D8", 3: "#D8C0F8", "*": "#F8F8F8", w: "#F8F8F8" },
  aether:     { 0: "#380860", 1: "#6028B0", 2: "#9860D8", 3: "#D0B8F0", "*": "#F8F8F8", w: "#F8F8F8" },
  duskweave:  { 0: "#201828", 1: "#403850", 2: "#686078", 3: "#9890A8", "*": "#B098D8", w: "#D8D0E8" },

  /* Neutral stone. Deliberately lighter than a rock "should" be: these
     render at 16 CSS px against a #13171B panel, and a literal dark stone
     collapses into the surface at that size. Value contrast against the
     ground beats local realism. */
  verge:      { 0: "#283040", 1: "#485068", 2: "#788098", 3: "#B0B8C8", "*": "#C0A8F0", w: "#E0E8F0" },
  coal:       { 0: "#202028", 1: "#404048", 2: "#686870", 3: "#989898", "*": "#F8C060", w: "#F89038" },
};

/* =========================================================================
   ITEMS — id -> [template, ramp]. Ids match ITEMS in skill-fixtures.js.
   ========================================================================= */

const ITEMS = [
  /* raw — Emberdelving and Aetherdrawing */
  ["cinder-ore",         ORE,      "cinder"],
  ["palegilt-ore",       ORE,      "palegilt"],
  ["verge-ore",          ORE,      "verge"],
  ["coalstone",          ORE,      "coal"],
  ["veil-shard",         CORE,     "stormcast"],
  ["aether-mote",        MOTE,     "aether"],
  ["bound-aether",       MOTE,     "gravebrand"],
  ["pale-ichor",         MOTE,     "palegilt"],

  /* Sunforging */
  ["cinderbloom-ingot",  INGOT,    "cinder"],
  ["palegilt-ingot",     INGOT,    "palegilt"],
  ["vergebrass-ingot",   INGOT,    "vergebrass"],
  ["emberglass-rivet",   RIVET,    "palegilt"],
  ["sunwrought-ingot",   INGOT,    "sunwrought"],
  ["duskweave-plate",    PLATE,    "duskweave"],
  ["gravebrand-core",    CORE,     "gravebrand"],
  ["stormcast-filament", FILAMENT, "stormcast"],
  ["veilforged-heart",   HEART,    "gravebrand"],

  /* Sigilbinding */
  ["ward-sigil",         SIGIL,    "cinder"],
  ["kindle-sigil",       SIGIL,    "palegilt"],
  ["verge-sigil",        SIGIL,    "vergebrass"],
  ["grave-sigil",        SIGIL,    "gravebrand"],
  ["veil-sigil",         SIGIL,    "stormcast"],

  /* Glasswrighting */
  ["ember-lens",         LENS,     "cinder"],
  ["pale-prism",         LENS,     "palegilt"],
  ["verge-lens",         LENS,     "vergebrass"],
  ["deep-prism",         LENS,     "duskweave"],
  ["veil-lens",          LENS,     "aether"],
];

/* =========================================================================
   PNG encoder
   ========================================================================= */

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

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Rule 1, enforced: every channel of every colour must be a multiple of 8. */
function assertFiveBit(where, hex) {
  for (const c of rgb(hex)) {
    if (c % 8 !== 0) throw new Error(`${where}: ${hex} is off the 5-bit grid (channel ${c})`);
  }
}

function encode(name, grid, rampName) {
  const ramp = RAMPS[rampName];
  if (!ramp) throw new Error(`${name}: unknown ramp "${rampName}"`);

  const pal = { ".": null, k: OUTLINE, ...ramp };
  for (const [slot, hex] of Object.entries(pal)) {
    if (hex) assertFiveBit(`${name}/${rampName}[${slot}]`, hex);
  }

  if (grid.length !== SIZE) throw new Error(`${name}: ${grid.length} rows, expected ${SIZE}`);
  grid.forEach((row, y) => {
    if (row.length !== SIZE) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${SIZE}`);
  });

  const stride = SIZE * 4;
  const raw = Buffer.alloc(SIZE * (stride + 1));

  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < SIZE; x++) {
      const ch = grid[y][x];
      if (!(ch in pal)) throw new Error(`${name}: unknown slot "${ch}" at ${x},${y}`);
      const o = rowStart + 1 + x * 4;
      const hex = pal[ch];
      if (hex === null) continue; // already zeroed = fully transparent
      const [r, g, b] = rgb(hex);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* =========================================================================
   run
   ========================================================================= */

mkdirSync(OUT_DIR, { recursive: true });

let bytes = 0;
for (const [id, grid, ramp] of ITEMS) {
  const png = encode(id, grid, ramp);
  writeFileSync(resolve(OUT_DIR, `${id}.png`), png);
  bytes += png.length;
  console.log(`  ${id}.png  ${SIZE}x${SIZE}  ${ramp.padEnd(10)} ${png.length} bytes`);
}

console.log(`\n${ITEMS.length} sprites, ${(bytes / 1024).toFixed(1)} KB total, all on the 5-bit grid.`);
