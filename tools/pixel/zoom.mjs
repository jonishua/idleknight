#!/usr/bin/env node
/* =========================================================================
   zoom.mjs — crop and nearest-neighbour magnify any PNG.

   The pixel-art equivalent of a loupe. Used to read the reference captures
   at a magnification where individual pixels and ramp steps are legible, and
   to eyeball our own sprites at the same scale so the two can be compared
   like for like.

   Usage:
     node tools/pixel/zoom.mjs <in.png> <out.png> [--rect x,y,w,h] [--scale 8] [--grid 8]

     --rect   crop region in source pixels (default: whole image)
     --scale  integer magnification (default 8)
     --grid   draw an N-pixel guide grid over the magnified result
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { decode, encode } from "./png.mjs";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};

const [inFile, outFile] = positional;
if (!inFile || !outFile) {
  console.error("usage: node tools/pixel/zoom.mjs <in.png> <out.png> [--rect x,y,w,h] [--scale 8] [--grid 8]");
  process.exit(2);
}

const src = decode(readFileSync(resolve(inFile)));
const scale = Number(flag("scale", 8));
const grid = flag("grid", null) ? Number(flag("grid")) : 0;

const rect = flag("rect", null);
const [rx, ry, rw, rh] = rect
  ? rect.split(",").map(Number)
  : [0, 0, src.width, src.height];

const W = rw * scale;
const H = rh * scale;
const out = new Uint8Array(W * H * 4);

for (let y = 0; y < H; y++) {
  const sy = ry + Math.floor(y / scale);
  for (let x = 0; x < W; x++) {
    const sx = rx + Math.floor(x / scale);
    const o = (y * W + x) * 4;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
      out[o] = 24; out[o + 1] = 24; out[o + 2] = 32; out[o + 3] = 255;
      continue;
    }
    const s = (sy * src.width + sx) * 4;
    // Composite onto a mid checker so transparent regions are visible.
    const a = src.data[s + 3] / 255;
    const chk = (Math.floor(x / (scale * 2)) + Math.floor(y / (scale * 2))) % 2 ? 96 : 64;
    out[o]     = Math.round(src.data[s] * a + chk * (1 - a));
    out[o + 1] = Math.round(src.data[s + 1] * a + chk * (1 - a));
    out[o + 2] = Math.round(src.data[s + 2] * a + chk * (1 - a));
    out[o + 3] = 255;
  }
}

if (grid > 0) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = (rx + Math.floor(x / scale)) % grid === 0 && x % scale === 0;
      const gy = (ry + Math.floor(y / scale)) % grid === 0 && y % scale === 0;
      if (!gx && !gy) continue;
      const o = (y * W + x) * 4;
      out[o] = 248; out[o + 1] = 0; out[o + 2] = 128; out[o + 3] = 255;
    }
  }
}

const path = resolve(outFile);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, encode(W, H, out));
console.log(`${path}  ${W}x${H}  (source ${src.width}x${src.height}, crop ${rw}x${rh} @${scale}x)`);
