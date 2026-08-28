/* =========================================================================
   scene.mjs — THE SLAGFEN, our battle ground: 192 x 110, painted.

   §4: "The background is a full-bleed painted scene, not a flat color. Even
   the desert in ffvi-battle-native-a.png has 98 unique colors in the top 145
   lines." So this is painted, in bands, with structure — but painted to the
   measured budget rather than to taste:

     median 4-6 colours per 8x8 tile          (§2, per-tile budget)
     dithering 1-4% of pixels, three jobs only (§2, the dithering myth)
     everything on the /8 grid                (§0)

   The dither here is doing job one, verbatim: fading a sky gradient across a
   band it cannot afford more palette steps for. One checkerboard row sits at
   each band boundary and nowhere else, which is why the audit reports a
   fraction of a percent rather than a texture.

   Warm ground under a cold sky is the §5f relationship: the background
   carries the mood, the sprites stay neutral. The violet in the upper sky is
   ours, not FFVI's — it is the one place the cabinet's accent is allowed to
   leak into the pixel layer, and it is what stops the stage reading as a
   borrowed desert.
   ========================================================================= */

import { Surface, rng, noise2 } from "./raster.mjs";
import { SLAGFEN as P, fromHex } from "./palette.mjs";

export const STAGE = { w: 192, h: 168 };
export const FIELD = { w: 192, h: 110 };
export const HORIZON = 58;

/** Ground line for a sprite standing at depth t (0 = far, 1 = near). */
export const groundY = (t) => Math.round(HORIZON + 6 + t * 44);

export function slagfen() {
  const { w: W } = FIELD;
  const H = FIELD.h;
  const s = new Surface(W, H);
  const r = rng(0x5f0f);

  /* Two octaves of value noise do all the work the round-1 scene was missing.
     `wob` wanders every band boundary so no edge is a straight line across
     192 px; `mot` mottles the fill so no band is a flat field. */
  const wob = noise2(0x77a1);
  const mot = noise2(0x2c3f);
  const grit = noise2(0x91b5);

  /* ---- sky ------------------------------------------------------------
     Twelve steps down 58 rows, but the step boundary is a wandering line
     rather than a ruled one, and the dither lands only where the boundary
     actually falls. §2's dithering job one — fading a gradient across a band
     the palette cannot afford another step for — without the tiling read. */
  const bands = P.sky.length;
  for (let x = 0; x < W; x++) {
    const wave = (wob(x / 34, 0.5) - 0.5) * 5 + (wob(x / 11, 3.5) - 0.5) * 2;
    for (let y = 0; y < HORIZON; y++) {
      const t = (y + wave) / HORIZON;
      const k = Math.min(bands - 1, Math.max(0, Math.floor(t * bands)));
      const frac = t * bands - Math.floor(t * bands);
      // One row of checkerboard where two steps meet, and only there.
      const edge = k > 0 && frac < 0.16 && ((x + y) & 1) === 0;
      s.px(x, y, P.sky[edge ? k - 1 : k]);
    }
  }

  /* ---- cloud shelves --------------------------------------------------
     Each is a stack of overlapping lobes, not a dash: a body value, a lit
     upper rim one step brighter, and a bottom edge eroded by noise so the
     underside is ragged the way a real cloud's is. Four masses instead of
     eight strokes — the sky reads as weather rather than as scan lines. */
  const cloud = (lobes, body, lit) => {
    const layer = new Surface(W, H);
    for (const [cx, cy, rx, ry] of lobes) layer.ellipse(cx, cy, rx, ry, body);
    for (let y = 0; y < HORIZON; y++) {
      for (let x = 0; x < W; x++) {
        if (!layer.opaque(x, y)) continue;
        // Erode the underside: the lower a pixel sits in its lobe, the more
        // likely the noise cuts it, which frays the bottom edge only.
        const below = layer.opaque(x, y + 1) ? 0 : 1;
        if (below && grit(x / 3.5, y / 2.5) > 0.56) continue;
        s.px(x, y, layer.opaque(x, y - 1) ? body : lit);
      }
    }
  };
  cloud([[26, 12, 26, 3], [48, 14, 18, 3], [8, 15, 14, 2]], P.sky[3], P.sky[6]);
  cloud([[132, 9, 34, 3], [162, 12, 22, 2], [108, 12, 16, 2]], P.sky[2], P.sky[5]);
  cloud([[78, 24, 34, 4], [110, 27, 22, 3], [52, 27, 20, 3]], P.sky[6], P.sky[8]);
  cloud([[164, 30, 30, 3], [140, 33, 20, 2]], P.sky[7], P.sky[9]);
  cloud([[36, 41, 40, 4], [78, 44, 28, 3], [4, 44, 18, 3]], P.sky[9], P.sky[11]);
  cloud([[144, 46, 52, 3], [104, 48, 26, 2]], P.sky[10], P.sky[11]);

  /* ---- far ridge ------------------------------------------------------ */
  const ridge = [];
  let rx0 = -4;
  let ry0 = 46;
  ridge.push([rx0, HORIZON]);
  while (rx0 < W + 6) {
    ridge.push([rx0, ry0]);
    rx0 += 8 + Math.floor(r() * 10);
    ry0 = 38 + Math.floor(r() * 14);
  }
  ridge.push([W + 6, HORIZON]);
  s.poly(ridge, P.ridgeFar[1]);
  // Lit upper-left rim, one pixel, in the next step up.
  for (let x = 0; x < W; x++) {
    for (let y = 30; y < HORIZON; y++) {
      if (sameAt(s, x, y, P.ridgeFar[1]) && !sameAt(s, x, y - 1, P.ridgeFar[1])) {
        s.px(x, y, P.ridgeFar[2]);
        break;
      }
    }
  }

  /* ---- the dead refinery ----------------------------------------------
     Our steampunk skyline. Round 1 drew flat black rectangles with a yellow
     pixel on each, and that is exactly what it looked like. A stack is a
     TAPERED tube: a wider footing, a lit left edge, iron banding rings every
     six rows, a capping flange, and lit windows in clusters of two and three
     rather than evenly spaced dots. Those ember pixels are the only warm
     accent above the horizon and they are what makes the place a place. */
  const stacks = [
    [104, 26, 8], [114, 34, 10], [127, 19, 6], [134, 32, 12],
    [149, 27, 8], [159, 39, 13], [173, 23, 7], [182, 33, 9],
  ];
  for (const [x, h, w] of stacks) {
    const top = HORIZON - h;
    for (let y = top; y < HORIZON; y++) {
      // The tube widens toward its footing by a pixel a side.
      const grow = y > HORIZON - 5 ? 1 : 0;
      s.rect(x - grow, y, w + grow * 2, 1, P.stack[1]);
      s.px(x - grow, y, P.stack[2]);                    // lit left edge
      s.px(x + w - 1 + grow, y, P.stack[0]);            // shadowed right
    }
    for (let y = top + 5; y < HORIZON - 2; y += 6) s.hline(x, y, w, P.stack[0]);
    for (let y = top + 6; y < HORIZON - 2; y += 6) s.hline(x, y, w, P.stack[2]);
    s.rect(x - 1, top - 2, w + 2, 2, P.stack[0]);       // capping flange
    s.hline(x - 1, top - 2, w + 2, P.stack[2]);
    // A ladder up the lit face of the taller stacks.
    if (h > 28) for (let y = top + 4; y < HORIZON - 2; y += 3) s.px(x + 2, y, P.stack[2]);
  }
  // Gantry between the two tallest, with its own hand-rail.
  s.hline(134, HORIZON - 30, 26, P.stack[0]);
  s.hline(134, HORIZON - 31, 26, P.stack[2]);
  s.hline(134, HORIZON - 34, 26, P.stack[0]);
  for (let x = 136; x < 158; x += 5) s.vline(x, HORIZON - 34, 3, P.stack[0]);
  // Lit windows, in clusters. A refinery is not lit one porthole at a time.
  for (const [x, y, n] of [
    [106, 44, 2], [106, 47, 1], [116, 40, 3], [117, 43, 2],
    [129, 48, 2], [136, 34, 2], [136, 37, 3], [137, 41, 1],
    [151, 42, 2], [161, 32, 3], [161, 35, 2], [162, 39, 2],
    [175, 46, 1], [184, 40, 2], [184, 43, 1],
  ]) {
    for (let i = 0; i < n; i++) s.px(x + i * 2, y, i === 0 ? P.ember[1] : P.ember[0]);
  }
  s.px(160, 22, P.ember[2]);   // the beacon on the cracking tower
  s.px(160, 23, P.ember[1]);

  /* ---- ground ---------------------------------------------------------
     Six steps from the lit haze at the horizon down into the warm
     foreground. Same treatment as the sky: the boundary wanders, the dither
     lands only on the boundary, and then a mottling pass moves individual
     pixels one step either way so no band is a flat field. Perspective is
     carried by value and by the size of the debris, never by a gradient. */
  const gr = [P.groundLit[2], P.groundLit[1], P.groundLit[0], P.ground[5], P.ground[4], P.ground[3]];
  const stops = [0, 0.05, 0.12, 0.22, 0.38, 0.56];
  for (let x = 0; x < W; x++) {
    // Enough amplitude to actually break the top band, which is only two
    // rows tall: a ruled two-pixel highlight across 192 px is the single
    // most artificial thing a painted horizon can do.
    const wave = (wob(x / 26, 8.5) - 0.5) * 0.07 + (wob(x / 8, 12.5) - 0.5) * 0.026;
    for (let y = HORIZON; y < H; y++) {
      const t = (y - HORIZON) / (H - HORIZON) + wave;
      let k = 0;
      while (k + 1 < stops.length && t >= stops[k + 1]) k++;
      const prev = stops[k];
      const next = k + 1 < stops.length ? stops[k + 1] : 1;
      const frac = (t - prev) / Math.max(1e-6, next - prev);
      const edge = k > 0 && frac < 0.1 && ((x + y) & 1) === 0;
      let idx = edge ? k - 1 : k;
      // Mottle. Two thresholds on a fine noise field, so the ground reads as
      // trodden ash rather than as painted card.
      const m = mot(x / 6.5, y / 3.5) * 0.65 + grit(x / 2.2, y / 1.6) * 0.35;
      if (m > 0.615) idx = Math.max(0, idx - 1);
      else if (m < 0.375) idx = Math.min(gr.length - 1, idx + 1);
      s.px(x, y, gr[idx]);
    }
  }

  /* ---- ground detail --------------------------------------------------
     Cracks branch and thin; rocks come in three sizes and each gets a lit
     top edge and a dark contact under it. Everything is drawn from the
     ground ramp so the scene stays inside its palette. */
  const crack = (x0, y0, len, dir) => {
    let cx = x0, cy = y0;
    for (let k = 0; k < len; k++) {
      s.px(cx, cy, P.crack);
      if (k > 2 && r() < 0.10) crack(cx, cy, Math.floor(len * 0.4), -dir);
      cx += r() < 0.78 ? dir : 0;
      cy += r() < 0.30 ? (r() < 0.5 ? 1 : -1) : 0;
    }
  };
  for (let i = 0; i < 16; i++) {
    const y = HORIZON + 10 + Math.floor(r() * (H - HORIZON - 14));
    const x = Math.floor(r() * W);
    crack(x, y, 4 + Math.floor(r() * 16 * ((y - HORIZON) / 50 + 0.3)), r() < 0.5 ? 1 : -1);
  }
  for (let i = 0; i < 54; i++) {
    const y = HORIZON + 4 + Math.floor(r() * (H - HORIZON - 8));
    const x = Math.floor(r() * W);
    const near = (y - HORIZON) / (H - HORIZON);
    const size = near > 0.55 && r() < 0.4 ? 2 : near > 0.25 && r() < 0.55 ? 1 : 0;
    const w = 2 + size * 2, h = 1 + size;
    s.rect(x, y, w, h, P.ground[1 + size]);
    s.hline(x, y - 1, w - (size ? 1 : 0), P.groundLit[Math.min(2, size)]);
    s.hline(x, y + h, w, P.ground[0]);                    // contact under it
  }
  /* Drifts of fine ash. Drawn in the ground's own lit step rather than in
     the cool grey the round-1 scene used, which read as puddles on a desert.
     Six of them, two rows each — enough to be a texture the eye finds and not
     enough to register as dithering. */
  for (let i = 0; i < 6; i++) {
    const y = HORIZON + 18 + Math.floor(r() * (H - HORIZON - 22));
    const x = Math.floor(r() * W);
    const w = 10 + Math.floor(r() * 16);
    s.dither(x, y, w, 2, P.groundLit[0], (x + y) & 1);
  }

  return s;
}

function sameAt(s, x, y, c) {
  const g = s.get(x, y);
  return !!g && g[0] === c[0] && g[1] === c[1] && g[2] === c[2];
}

/* =========================================================================
   The drifting ash layer.

   §6: an idle game runs unattended, so movement has to be free. This is a
   192-wide tileable strip of ash motes that the runtime scrolls one pixel at
   a time across the sky. The stage is otherwise composed of single frames,
   and this plus the ATB gauges is the entire motion budget — which is the
   trade FFVI made and the reason its battles feel alive at zero cost.
   ========================================================================= */

export function ashDrift() {
  const s = new Surface(192, 34);
  const r = rng(0x0a5d);
  for (let i = 0; i < 54; i++) {
    const x = Math.floor(r() * 192);
    const y = Math.floor(r() * 34);
    s.px(x, y, r() < 0.4 ? P.ash[1] : P.ash[0]);
    if (r() < 0.25) s.px(x + 1, y, P.ash[0]);
  }
  return s;
}

export const SLAGFEN_META = {
  id: "slagfen",
  name: "The Slagfen",
  region: "Emberveil Basin",
  blurb: "Where the refinery dumped what it could not use. The ground is still warm eleven years on.",
  horizon: HORIZON,
  contactShadow: fromHex("#180F08"),
};
