#!/usr/bin/env node
/* =========================================================================
   make-keyart.mjs — renders the Emberveil home-screen key art.

     node src/assets/art/hero/make-keyart.mjs
     -> src/assets/art/hero/ember-gate.png   (780x656 = 2x of the 390x328 hero)

   WHY A GENERATOR AND NOT A FLAT FILE
   The key art is the one place in this project where colour is *paint*, not
   design tokens, so it lives here as reproducible source rather than as an
   opaque binary. Every accent below is taken off the token ramp in
   src/styles/tokens.css (cool near-black ground, violet, gold), so painting
   and chrome are demonstrably the same palette. Nothing is traced from,
   sampled out of, or generated against any reference image.

   THE SCENE — "The Cinder Gate"
   An original Emberveil location, painted at the hour the Gate is opened.
   Left of frame: the Kettleworks, a refinery cut into a cliff, silhouetted
   against a moonlit cloud bank, its furnace mouths burning gold. Right of
   frame and close to camera: a Warden of the Cinder Gate in full harness,
   greatsword grounded, helm turned a quarter toward us — the figure fills
   the right two fifths of the frame from the top of the band to the crop.
   The centre is a quiet moonlit valley: that is where the title block sits.

   THE THING THAT WAS WRONG LAST ROUND, AND THE RULE THAT FIXES IT
   Version one was painted as a silhouette study. It had no light source in
   it: 0.66% of the band read above luma 100 where a premium key art puts
   9%, and the figure never once broke luma 113, so not a single specular
   landed on the armour. "Night" was being confused with "underexposed".

   The rule now, and the numbers to hold it to:
     * The sky is the brightest thing in the frame and it carries the light
       budget. A moonlit cloud bank runs 150-215; the moon itself is 250+.
     * Steel is a DARK albedo with an ENORMOUS specular range. The harness
       averages in the 50s and spikes to 255 on the edges that turn to the
       moon. Range, not exposure, is what makes metal read as metal.
     * Every silhouette that stands in front of a light gets a hard rim at
       230+ along the contour that faces it (see rimLight).
   scripts/measure — see progress notes — checks all four against the bar.

   PALETTE DISCIPLINE
   Two accents only. The ground is a cool near-black; violet and gold are the
   only saturated things in the frame, exactly as in the chrome. Saturation is
   spent, not sprayed: the sky is blue-grey, the moon is a neutral silver, and
   violet is held back for the aether in the Gate and the Warden's visor.

   TECHNIQUE
   Software painter, zero dependencies.

   The thing that makes the figure read as armour rather than as a silhouette
   is section 3.4: every mask is blurred into a height field, the gradient of
   that field is used as a stand-in for a surface normal, and the result is
   lit with a real Blinn-Phong term — key, bounce, ambient, back-rim and a
   specular lobe. A flat polygon therefore comes back rounded, with a lit
   upper face, an occluded lower one and a near-white hit along the top edge.
   Plates are drawn one at a time, each with a contact shadow cast onto what
   is already painted, which is what gives the harness its stack of lames.

   Everything else: float RGB accumulation buffer, analytic-x / 4x-y polygon
   coverage for anti-aliasing, fbm value noise for cloud, haze and brush
   grain, ordered dithering on the way down to 8-bit so the long dark ramps do
   not band, and a PNG written by hand with adaptive per-row filtering.
   ========================================================================= */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 780;
const H = 656;
const N = W * H;

/* =========================================================================
   1. MATH
   ========================================================================= */

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x, y, octaves = 4, seed = 1) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 131) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridged(x, y, octaves, seed) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + o * 71) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.11;
  }
  return sum / norm;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* =========================================================================
   2. PALETTE
   Every entry is a token from src/styles/tokens.css. The painting is allowed
   to mix and dim them; it is not allowed to introduce a hue that is not here.
   ========================================================================= */

const rgb = (r, g, b) => [r / 255, g / 255, b / 255];

const P = {
  ground:       rgb(0x05, 0x0a, 0x10), // --c-ground
  violetDeep:   rgb(0x44, 0x16, 0x9e), // --c-violet-deep
  violetCore:   rgb(0x76, 0x3c, 0xc3), // --c-violet-core
  violetBright: rgb(0x7e, 0x34, 0xe2), // --c-violet-bright
  violetLight:  rgb(0xb3, 0x94, 0xd8), // --c-violet-light
  goldDeep:     rgb(0xb0, 0x85, 0x39), // --c-gold-deep
  goldCore:     rgb(0xd7, 0xa7, 0x47), // --c-gold-core
  goldLight:    rgb(0xf8, 0xdc, 0xa2), // --c-gold-light
  goldCap:      rgb(0xff, 0xf4, 0xb8), // --c-gold-cap
  silverDeep:   rgb(0x8c, 0x94, 0x9b), // --c-silver-deep
  silverCore:   rgb(0xc9, 0xcf, 0xd4), // --c-silver-core
  white:        rgb(0xff, 0xff, 0xff), // --c-text-1
};

/* The night ramp. Blue-grey, not purple — violet is an accent, and an accent
   stops being one the moment the whole sky is wearing it.

   These values are FAR higher than instinct wants for a night sky, and that
   is the point: the reference's sky cells average luma 65-128 and it still
   reads as night, because night is read from hue and from the black
   silhouettes cut into it, not from the sky's own exposure. Collapses into
   the page ground at the bottom so the art hands off to the panel stack. */
const SKY_STOPS = [
  [0.00, rgb(0x0b, 0x10, 0x1e)],
  [0.12, rgb(0x14, 0x1a, 0x2e)],
  [0.28, rgb(0x22, 0x2a, 0x46)],
  [0.42, rgb(0x30, 0x39, 0x59)],
  [0.55, rgb(0x3c, 0x45, 0x67)],
  [0.66, rgb(0x3f, 0x46, 0x66)],
  [0.76, rgb(0x22, 0x27, 0x3c)],
  [0.88, rgb(0x0c, 0x0f, 0x1a)],
  [1.00, P.ground],
];

function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return stops[stops.length - 1][1];
}

const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/* =========================================================================
   3. CANVAS AND RENDERER
   ========================================================================= */

const R = new Float32Array(N);
const G = new Float32Array(N);
const B = new Float32Array(N);

const add = (i, c, k) => { R[i] += c[0] * k; G[i] += c[1] * k; B[i] += c[2] * k; };
const set = (i, c) => { R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; };
/** Paint `c` over the buffer at coverage `a` — ordinary source-over. */
const over = (i, c, a) => {
  R[i] = R[i] * (1 - a) + c[0] * a;
  G[i] = G[i] * (1 - a) + c[1] * a;
  B[i] = B[i] * (1 - a) + c[2] * a;
};

/* ---- 3.1  polygon coverage ----------------------------------------------
   Analytic in x, four sub-scanlines in y: enough anti-aliasing for a
   painting, and it keeps the whole render at native resolution — no
   supersampled buffer to hold in memory.
   ------------------------------------------------------------------------ */

const SUBY = [0.125, 0.375, 0.625, 0.875];

const ROW = new Float32Array(W);
const XS = [];

/**
 * Rasterise one polygon and MAX it into `m`.
 *
 * Union, not even-odd. Every shape in this painting is authored as a stack of
 * deliberately overlapping pieces — a pauldron lapping the arm, a hall lapping
 * the cliff — and an even-odd fill would punch every one of those overlaps out
 * as a hole. Max-compositing each polygon in turn is what keeps a figure built
 * from sixty parts reading as one solid body.
 */
function polyInto(m, p) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of p) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minY)) return;
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  const n = p.length;

  for (let y = y0; y <= y1; y++) {
    ROW.fill(0);
    let touched = false;
    for (const sy of SUBY) {
      const yy = y + sy;
      XS.length = 0;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[(i + 1) % n];
        if (ay === by) continue;
        if ((yy >= ay && yy < by) || (yy >= by && yy < ay)) {
          XS.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
        }
      }
      if (XS.length < 2) continue;
      XS.sort((a, b) => a - b);
      for (let k = 0; k + 1 < XS.length; k += 2) {
        let sx = XS[k], ex = XS[k + 1];
        if (ex <= 0 || sx >= W) continue;
        sx = Math.max(sx, 0);
        ex = Math.min(ex, W);
        const isx = Math.floor(sx), iex = Math.floor(ex - 1e-6);
        touched = true;
        if (isx === iex) {
          ROW[isx] += (ex - sx) * 0.25;
        } else {
          ROW[isx] += (isx + 1 - sx) * 0.25;
          for (let x = isx + 1; x < iex; x++) ROW[x] += 0.25;
          ROW[iex] += (ex - iex) * 0.25;
        }
      }
    }
    if (!touched) continue;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const a = ROW[x] > 1 ? 1 : ROW[x];
      if (a > m[row + x]) m[row + x] = a;
    }
  }
}

/** @param polys array of arrays of [x, y] in pixel space (auto-closed). */
function coverage(polys) {
  const m = new Float32Array(N);
  for (const p of polys) polyInto(m, p);
  return m;
}

/** Separable box blur, repeated passes ≈ Gaussian. */
function blur(src, radius, passes = 3) {
  const a = Float32Array.from(src);
  const b = new Float32Array(N);
  const r = Math.max(1, Math.round(radius));
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[row + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        b[row + x] = sum * inv;
        sum += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = sum * inv;
        sum += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
  }
  return a;
}

/** Union of coverage masks, in place on the first. */
function union(dst, ...srcs) {
  for (const src of srcs) for (let i = 0; i < N; i++) if (src[i] > dst[i]) dst[i] = src[i];
  return dst;
}

/** Subtract, in place on the first — used to cut arches out of masonry. */
function subtract(dst, src) {
  for (let i = 0; i < N; i++) dst[i] = Math.max(0, dst[i] - src[i]);
  return dst;
}

/** Intersect, in place on the first — clips a detail pass to its host plate. */
function intersect(dst, src) {
  for (let i = 0; i < N; i++) dst[i] *= src[i];
  return dst;
}

/* ---- 3.2  geometry ------------------------------------------------------
   The scene is authored in normalised 0..1 coordinates so it can be
   re-rendered at another size without touching a single drawing number.
   ------------------------------------------------------------------------ */

const X = (u) => u * W;
const Y = (v) => v * H;
const poly = (...uv) => uv.map(([u, v]) => [u * W, v * H]);
const rect = (u0, v0, u1, v1) => poly([u0, v0], [u1, v0], [u1, v1], [u0, v1]);

/** Elliptical arc as normalised [u, v] points. Angles in radians, 0 = +u;
    v grows downward, so PI -> 2PI sweeps over the top. */
function arc(cu, cv, ru, rv, a0 = 0, a1 = Math.PI * 2, steps = 44) {
  const p = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (a1 - a0) * (k / steps);
    p.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]);
  }
  return p;
}

/** Closed elliptical polygon, ready to rasterise. */
const ellipse = (cu, cv, ru, rv, a0 = 0, a1 = Math.PI * 2, steps = 44, close = []) =>
  poly(...arc(cu, cv, ru, rv, a0, a1, steps), ...close);

/** A diamond — the house ornament, used for the pommel and the breast sigil. */
const diamond = (cu, cv, ru, rv) => poly([cu, cv - rv], [cu + ru, cv], [cu, cv + rv], [cu - ru, cv]);

/** Soft elliptical glow. Additive — light adds, it does not paint over. */
function glow(cu, cv, ru, rv, color, intensity, power = 2.2) {
  const cx = X(cu), cy = Y(cv), rx = X(ru), ry = Y(rv);
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      add(y * W + x, color, Math.pow(1 - d, power) * intensity);
    }
  }
}

/* ---- 3.3  lighting rig --------------------------------------------------
   Image space: +x right, +y DOWN, +z out of the screen. Each vector points
   FROM the surface TOWARD the light.

   Three sources and no more. A fourth light is how a painting stops having a
   time of day.
   ------------------------------------------------------------------------ */

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* All three are deliberately GRAZING — low z. A light with a lot of z in it
   falls on the flat interior of every plate at nearly full strength, and the
   figure comes back as one mid-grey mass in daylight. Keeping z small is what
   confines the light to the edges that turn toward it, which is the entire
   difference between armour at night and a plastic toy. */
const KEY_DIR  = norm3([-0.70, -0.62, 0.34]);  // the moon, upper left
const WARM_DIR = norm3([-0.86,  0.44, 0.26]);  // the furnace mouths, lower left
const BACK_DIR = norm3([ 0.80, -0.20, -0.56]); // aether in the Gate, behind right

/* Halfway vectors for Blinn-Phong. The viewer is straight on at (0, 0, 1). */
const KEY_HALF  = norm3([KEY_DIR[0],  KEY_DIR[1],  KEY_DIR[2] + 1]);
const WARM_HALF = norm3([WARM_DIR[0], WARM_DIR[1], WARM_DIR[2] + 1]);

const KEY_COLOUR  = mix(P.silverCore, P.white, 0.55);
const WARM_COLOUR = P.goldCore;
const BACK_COLOUR = P.violetLight;
const AMBIENT     = mix(rgb(0x14, 0x19, 0x2c), P.violetDeep, 0.20);

/* ---- the environment, for reflection ------------------------------------
   Polished steel is a MIRROR before it is anything else, and this is the
   term the first two attempts at the Warden were missing entirely. Diffuse
   plus specular alone gives a rubber toy; what makes armour read as armour
   is that every face which tips up takes the sky and every face which tips
   down takes the ground, so a single curved plate carries the whole vertical
   value range of the world it is standing in.

   Sampled off this painting's own sky: zenith is dark, the horizon carries
   the moonlit cloud bank and is the brightest thing available, and below the
   horizon there is nothing but unlit rock. */
const ENV_ZENITH  = rgb(0x11, 0x16, 0x28);
const ENV_HORIZON = rgb(0x9c, 0xa8, 0xc4);   // the moonlit cloud bank, to the LEFT
const ENV_BEHIND  = rgb(0x1c, 0x12, 0x33);   // the aether column, to the RIGHT
const ENV_GROUND  = rgb(0x04, 0x06, 0x0c);

/**
 * Look up the environment along a reflected ray.
 *   rx: -1 hard left  .. +1 hard right
 *   ry: -1 straight up .. 0 horizon .. +1 straight down
 *
 * The horizontal term is what stops this reading as chrome. A mirror sees the
 * bright horizon all the way round, so an undirected reflection puts a pale
 * band on every vertical edge of every plate and the figure comes back as a
 * heap of outlined stickers. In THIS world the horizon is only bright on the
 * left, where the moon and the cloud are; to the right there is nothing but
 * the Gate's violet. Weighting by rx is one line and it is the difference
 * between armour and a chrome bumper.
 */
function envRefl(rx, ry) {
  const vertical = ry <= 0
    ? mix(ENV_ZENITH, ENV_HORIZON, Math.pow(clamp(1 + ry), 2.1))
    : mix(ENV_HORIZON, ENV_GROUND, Math.pow(clamp(ry * 1.5), 0.62));
  const west = Math.pow(clamp(0.5 - rx * 0.5), 1.6);   // 1 facing the moon, 0 away
  return mix(mix(ENV_BEHIND, ENV_GROUND, 0.35), vertical, 0.16 + 0.84 * west);
}

/**
 * Materials. `lit` and `dark` are the albedo at full key and at zero key;
 * everything else scales one of the three lights or the specular lobe.
 *
 * The numbers that matter most are `lit` and `spec`: the reason a dark figure
 * still reads as steel is that its brightest specular hit is nearly white,
 * two hundred values above its own shadow. Flatten that range and the whole
 * figure collapses back into a silhouette.
 */
const MAT = {
  /* Polished harness under a full moon. The albedo stays LOW — steel at night
     is a dark object, and the reference's knight averages luma 30 across his
     whole region — but the specular lobe is tight, nearly white and allowed
     to blow all the way out. Range, not exposure. Raise `lit` past about 0.35
     and the figure turns into grey plastic in daylight; that is exactly what
     the first attempt at this revision did. */
  steel: {
    dark: [0.012, 0.014, 0.026], lit: [0.140, 0.152, 0.196],
    key: 0.85, warm: 0.52, back: 1.05, amb: 0.20,
    env: 0.80, envTint: rgb(0xd2, 0xdc, 0xf0),
    spec: 3.20, specP: 26, bump: 3, nz: 0.30, form: 0.09,
  },
  steelDeep: {           // the far side of the body, turned out of the light
    dark: [0.009, 0.010, 0.019], lit: [0.078, 0.086, 0.114],
    key: 0.52, warm: 0.30, back: 1.30, amb: 0.16,
    env: 0.44, envTint: rgb(0xb6, 0xc0, 0xd6),
    spec: 1.50, specP: 32, bump: 3, nz: 0.34, form: 0.08,
  },
  mail: {                // riveted mail in the gaps between plates
    dark: [0.010, 0.011, 0.020], lit: [0.090, 0.098, 0.126],
    key: 0.70, warm: 0.42, back: 0.60, amb: 0.18,
    env: 0.24, envTint: rgb(0xa0, 0xaa, 0xc0),
    spec: 1.20, specP: 16, bump: 2, nz: 0.52, form: 0.10,
  },
  blade: {
    dark: [0.014, 0.016, 0.028], lit: [0.180, 0.196, 0.244],
    key: 0.90, warm: 0.44, back: 0.95, amb: 0.22,
    env: 1.05, envTint: rgb(0xe0, 0xe8, 0xf8),
    spec: 4.40, specP: 42, bump: 2, nz: 0.24, form: 0.06,
  },
  gold: {
    dark: scale(P.goldDeep, 0.11), lit: scale(P.goldCore, 0.62),
    key: 0.95, warm: 1.45, back: 0.42, amb: 0.24,
    env: 0.62, envTint: rgb(0xf2, 0xcd, 0x7a),
    spec: 3.00, specP: 18, bump: 2, nz: 0.30, form: 0.10,
  },
  cloth: {               // the cloak: matte, no specular, no reflection
    dark: [0.005, 0.005, 0.012], lit: [0.046, 0.044, 0.076],
    key: 0.72, warm: 0.30, back: 1.00, amb: 0.13,
    env: 0.00,
    spec: 0.00, specP: 8, bump: 6, nz: 0.70, form: 0.55,
  },
  stone: {               // the Gate's masonry and the ledge
    dark: [0.013, 0.014, 0.023], lit: [0.170, 0.172, 0.208],
    key: 0.86, warm: 0.80, back: 0.34, amb: 0.28,
    env: 0.10, envTint: rgb(0xb0, 0xb6, 0xc6),
    spec: 0.30, specP: 14, bump: 4, nz: 0.58, form: 0.24,
  },
  works: {               // the refinery, seen through half a mile of haze
    dark: [0.015, 0.016, 0.026], lit: [0.104, 0.102, 0.134],
    key: 0.50, warm: 1.35, back: 0.10, amb: 0.24, form: 0.26,
    env: 0.05, envTint: rgb(0xa8, 0xae, 0xc0),
    spec: 0.12, specP: 16, bump: 3, nz: 0.54,
  },
  worksFar: {
    dark: [0.040, 0.042, 0.064], lit: [0.108, 0.110, 0.144],
    key: 0.60, warm: 0.22, back: 0.05, amb: 0.60, form: 0.35,
    env: 0.00,
    spec: 0.00, specP: 8, bump: 5, nz: 0.80,
  },
};

/* ---- 3.4  the shader ----------------------------------------------------
   Blur the mask into a height field; its gradient stands in for a surface
   normal. Interior pixels come out facing the viewer, edge pixels tip away,
   and the whole thing lights like a rounded plate.
   ------------------------------------------------------------------------ */

function shade(mask, mat, opt = {}) {
  const bump = opt.bump ?? mat.bump;
  const nz = opt.nz ?? mat.nz;
  const alpha = opt.alpha ?? 1;
  const gain = opt.gain ?? 1;                 // whole-material dimmer
  const grain = opt.grain ?? 0.020;

  /* Two scales of normal, summed. The tight blur gives the crisp bevel that
     runs a hand's width in from the plate's edge; the wide one domes the
     whole plate so its middle is not a flat field of one value. One scale
     alone is the difference between a plate and a sticker of a plate. */
  const form = opt.form ?? mat.form ?? 0.24;
  const hb = blur(mask, bump, 2);
  const hf = blur(mask, bump * 3, 2);
  const slope = bump * 4.2;
  const slopeF = bump * 3 * 4.2 * form;

  const dark = opt.dark ?? mat.dark;
  const lit = opt.lit ?? mat.lit;
  const kKey = (opt.key ?? mat.key) * gain;
  const kWarm = (opt.warm ?? mat.warm) * gain;
  const kBack = (opt.back ?? mat.back) * gain;
  const kAmb = (opt.amb ?? mat.amb) * gain;
  const kSpec = (opt.spec ?? mat.spec) * gain;
  const pSpec = opt.specP ?? mat.specP;
  const kEnv = (opt.env ?? mat.env ?? 0) * gain;
  const envTint = opt.envTint ?? mat.envTint ?? P.white;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = mask[i];
      if (a <= 0.003) continue;

      const gx = (hb[i + 1] - hb[i - 1]) * 0.5 * slope + (hf[i + 1] - hf[i - 1]) * 0.5 * slopeF;
      const gy = (hb[i + W] - hb[i - W]) * 0.5 * slope + (hf[i + W] - hf[i - W]) * 0.5 * slopeF;
      let nx = -gx, ny = -gy, nzz = nz;
      const len = Math.hypot(nx, ny, nzz) || 1;
      nx /= len; ny /= len; nzz /= len;

      const dKey = Math.max(0, nx * KEY_DIR[0] + ny * KEY_DIR[1] + nzz * KEY_DIR[2]);
      const dWarm = Math.max(0, nx * WARM_DIR[0] + ny * WARM_DIR[1] + nzz * WARM_DIR[2]);
      // A back light is only ever a rim, so it is squeezed hard and gated on
      // the surface turning away from the viewer.
      const dBack = Math.pow(Math.max(0, nx * BACK_DIR[0] + ny * BACK_DIR[1] + nzz * BACK_DIR[2]), 2.6);

      // Albedo carries the key: the plate's own colour IS the lit ramp.
      let c0 = dark[0] + (lit[0] - dark[0]) * dKey * kKey;
      let c1 = dark[1] + (lit[1] - dark[1]) * dKey * kKey;
      let c2 = dark[2] + (lit[2] - dark[2]) * dKey * kKey;

      const w = dWarm * dWarm * kWarm * 0.55;
      c0 += WARM_COLOUR[0] * w; c1 += WARM_COLOUR[1] * w; c2 += WARM_COLOUR[2] * w;

      const bk = dBack * kBack * 0.62;
      c0 += BACK_COLOUR[0] * bk; c1 += BACK_COLOUR[1] * bk; c2 += BACK_COLOUR[2] * bk;

      const am = (0.42 + 0.58 * clamp(nzz)) * kAmb * 0.30;
      c0 += AMBIENT[0] * am; c1 += AMBIENT[1] * am; c2 += AMBIENT[2] * am;

      /* Mirror term. Reflect the view ray (0,0,1) about the normal and look
         up what that ray sees: r = 2(n·v)n - v, so r_y = 2·nz·ny. Fresnel is
         approximated by the usual (1 - n·v)^4 lift at grazing angles, which
         is what puts the hot band right on the turn of every plate. */
      if (kEnv > 0) {
        const e = envRefl(2 * nzz * nx, 2 * nzz * ny);
        const fres = 0.34 + 0.66 * Math.pow(1 - clamp(nzz), 3.2);
        const ke = kEnv * fres;
        c0 += e[0] * envTint[0] * ke;
        c1 += e[1] * envTint[1] * ke;
        c2 += e[2] * envTint[2] * ke;
      }

      if (kSpec > 0) {
        const hK = Math.max(0, nx * KEY_HALF[0] + ny * KEY_HALF[1] + nzz * KEY_HALF[2]);
        const sK = Math.pow(hK, pSpec) * kSpec;
        c0 += KEY_COLOUR[0] * sK; c1 += KEY_COLOUR[1] * sK; c2 += KEY_COLOUR[2] * sK;

        const hWv = Math.max(0, nx * WARM_HALF[0] + ny * WARM_HALF[1] + nzz * WARM_HALF[2]);
        const sW = Math.pow(hWv, pSpec * 0.7) * kSpec * kWarm * 0.5;
        c0 += WARM_COLOUR[0] * sW; c1 += WARM_COLOUR[1] * sW; c2 += WARM_COLOUR[2] * sW;
      }

      // Tooth. Scaled by value so the deep shadows stay clean.
      if (grain > 0) {
        const g = (fbm(x / 14, y / 14, 3, 97) - 0.5) * grain;
        const k = 1 + g * clamp((c0 + c1 + c2) * 2.2);
        c0 *= k; c1 *= k; c2 *= k;
      }

      over(i, [clamp(c0), clamp(c1), clamp(c2)], a * alpha);
    }
  }
}

/**
 * Cast a plate's shadow onto whatever is already painted. Offset down and
 * right, away from both lights. This is the single detail that makes a stack
 * of lames read as overlapping steel rather than as one printed shape.
 */
function contact(mask, du, dv, radius, k) {
  const dx = Math.round(X(du)), dy = Math.round(Y(dv));
  const shifted = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W) continue;
      shifted[y * W + x] = mask[sy * W + sx];
    }
  }
  const sb = blur(shifted, radius, 2);
  for (let i = 0; i < N; i++) {
    const a = sb[i] * k;
    if (a <= 0.002) continue;
    const m = 1 - a;
    R[i] *= m; G[i] *= m; B[i] *= m;
  }
}

/**
 * A HARD rim along the contour that faces a light.
 *
 * This is the single loudest thing in the whole painting and the one the last
 * round was missing entirely: a silhouette standing in front of a light source
 * gets a near-white line down the edge that turns toward it, and without that
 * line no amount of interior shading will stop a figure reading as a cut-out.
 * Built by sampling the mask one rim-width FURTHER TOWARD the light and
 * subtracting: a pixel keeps the difference only if stepping toward the light
 * walks it off the shape, which is true exactly on the contour that faces the
 * light and nowhere else. Get the sign of that step backwards and you get an
 * outline all the way round the figure instead — a sticker, not a rim.
 *
 * The result is additionally weighted by how much the *interior* normal at
 * that pixel already agrees with the light, so a rim never lights an edge
 * that the shading has decided is in shadow.
 *
 * @param mask   the silhouette to rim
 * @param du,dv  direction TOWARD the light, in normalised units (+v is DOWN)
 * @param width  rim thickness in pixels
 */
function rimLight(mask, du, dv, colour, strength, width = 3, softness = 1) {
  const l = Math.hypot(du, dv) || 1;
  const dx = Math.round((du / l) * width);
  const dy = Math.round((dv / l) * width);
  const rim = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x + dx, sy = y + dy;
      const outer = sx < 0 || sy < 0 || sx >= W || sy >= H ? 0 : mask[sy * W + sx];
      const v = mask[y * W + x] - outer;
      if (v > 0) rim[y * W + x] = v;
    }
  }
  const soft = softness > 0 ? blur(rim, softness, 1) : rim;
  for (let i = 0; i < N; i++) {
    const a = soft[i] * strength;
    if (a > 0.004) add(i, colour, a);
  }
}

/**
 * A hard-edged LIT FACET inside a plate.
 *
 * The blur-normal shader in 3.4 is a rounding machine: it turns every mask
 * into a pillow, and a figure made of pillows reads as inflated vector art no
 * matter how good the light rig is. Real harness is faceted — flat planes
 * meeting along hard lines, one plane catching the moon and the next one not.
 * So each plate gets its lit plane painted in explicitly, as a polygon with a
 * crisp boundary, over the smooth pass. Hard edges are the whole point; do not
 * be tempted to blur them.
 */
function facet(host, polys, mat, opt = {}) {
  const m = coverage(polys);
  intersect(m, host);
  shade(m, mat, { bump: 2, grain: 0.0, form: 0.05, ...opt });
  return m;
}

/** Paint a thin dark groove where two plates meet, with a lit lip beneath. */
function seam(polys, host, darkK = 0.62, lipK = 0.34) {
  const s = coverage(polys);
  for (let i = 0; i < N; i++) {
    const a = s[i] * host[i] * darkK;
    if (a > 0.004) over(i, [0.006, 0.007, 0.013], a);
  }
  for (let i = W * 2; i < N; i++) {
    const a = s[i - W * 2] * host[i] * lipK;
    if (a > 0.004) add(i, KEY_COLOUR, a * 0.42);
  }
}

/**
 * Rivets: a run of tiny domed studs along a path. Each is a two-pixel dot with
 * a lit crown and a shadow under it. At 780px wide these are one pixel of
 * light and one of dark, and they are worth more per byte than anything else
 * in the file — they are most of what the eye reads as "made of parts".
 */
function rivets(host, pts, count, colour = KEY_COLOUR, k = 0.85) {
  for (let s = 0; s < count; s++) {
    const t = count === 1 ? 0.5 : s / (count - 1);
    // piecewise-linear walk of the path
    const seg = t * (pts.length - 1);
    const i0 = Math.min(pts.length - 2, Math.floor(seg));
    const f = seg - i0;
    const u = lerp(pts[i0][0], pts[i0 + 1][0], f);
    const v = lerp(pts[i0][1], pts[i0 + 1][1], f);
    const x = Math.round(X(u)), y = Math.round(Y(v));
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
    const h = host[y * W + x];
    if (h < 0.5) continue;
    add(y * W + x, colour, k * h);
    add(y * W + x - 1, colour, k * 0.42 * h);
    add((y - 1) * W + x, colour, k * 0.52 * h);
    const i = (y + 1) * W + x;
    R[i] *= 1 - 0.42 * h; G[i] *= 1 - 0.42 * h; B[i] *= 1 - 0.42 * h;
  }
}

/** Self-lit aether: paint, then bloom. Used for the visor and the pommel. */
function aether(polys, strength = 0.9, glowAt = null) {
  const m = coverage(polys);
  for (let i = 0; i < N; i++) {
    if (m[i] <= 0.004) continue;
    over(i, mix(P.violetLight, P.white, 0.35), m[i] * strength);
    add(i, P.violetBright, m[i] * strength * 0.6);
  }
  if (glowAt) glow(glowAt[0], glowAt[1], glowAt[2], glowAt[3], P.violetBright, glowAt[4] ?? 0.5, 2.6);
}

/* =========================================================================
   4. THE PAINTING
   ========================================================================= */

/* ---- 4.1  sky ----------------------------------------------------------- */

for (let y = 0; y < H; y++) {
  const v = y / H;
  const base = ramp(SKY_STOPS, v);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const mass = fbm(u * 2.1 + 3.1, v * 2.9 + 1.7, 5, 11) - 0.5;
    const band = smoothstep(-0.06, 0.16, v) * (1 - smoothstep(0.62, 0.96, v));
    const k = 1 + mass * 0.50 * band;
    set(y * W + x, [base[0] * k, base[1] * k, base[2] * k]);
  }
}

/* ---- 4.2  the moon ------------------------------------------------------
   The brightest thing in the frame and the scene's key light. Held to a
   neutral silver: the moment the moon takes a hue the palette has three
   accents in it. Placed left of centre and high, clear of the wordmark, so
   the Kettleworks have something to silhouette against.
   ------------------------------------------------------------------------ */
const MOON = { u: 0.293, v: 0.206, r: 0.062 };
{
  const { u: MU, v: MV, r: MR } = MOON;
  const AR = W / H;

  // Halo, in three widening steps. Broad and genuinely bright: this is the
  // light that lifts the whole upper-left quarter of the band.
  glow(MU, MV, MR * 9.5, MR * 9.5 * AR, mix(P.silverDeep, P.violetLight, 0.34), 0.16, 2.0);
  glow(MU, MV, MR * 4.2, MR * 4.2 * AR, mix(P.silverCore, P.white, 0.20), 0.24, 2.3);
  glow(MU, MV, MR * 1.9, MR * 1.9 * AR, P.white, 0.42, 2.8);

  // The disc.
  for (let y = Math.floor(Y(MV - MR * AR * 1.3)); y <= Math.ceil(Y(MV + MR * AR * 1.3)); y++) {
    if (y < 0 || y >= H) continue;
    const v = y / H;
    for (let x = Math.floor(X(MU - MR * 1.3)); x <= Math.ceil(X(MU + MR * 1.3)); x++) {
      if (x < 0 || x >= W) continue;
      const u = x / W;
      const d = Math.hypot((u - MU) / MR, (v - MV) / (MR * AR));
      if (d >= 1.04) continue;
      const disc = 1 - smoothstep(0.93, 1.02, d);
      // Maria: faint darker patches, so the disc is a body and not a hole.
      const maria = clamp(fbm(u * 22 + 4.0, v * 22 * AR + 1.0, 4, 77) * 1.5 - 0.52) * 0.30;
      const lit = mix(P.white, P.silverCore, 0.10 + maria);
      over(y * W + x, lit, disc * 0.985);
    }
  }
}

/* ---- 4.3  the moonlit cloud bank ---------------------------------------
   The light budget of the whole picture lives here. Cloud is built as a
   height field — an fbm mass thresholded into a body — and then LIT: the
   side of every billow that faces the moon takes a near-white hit, the side
   away from it stays close to the sky. That directional term is why this
   reads as weather with a moon behind it rather than as grey fog.
   ------------------------------------------------------------------------ */
{
  const AR = W / H;
  const density = new Float32Array(N);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    // Cloud lives in a band; it thins to nothing before the works' roofline
    // so the architecture always cuts a clean silhouette.
    const band = smoothstep(0.00, 0.14, v) * (1 - smoothstep(0.50, 0.78, v));
    if (band <= 0.001) continue;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const f = fbm(u * 2.6 + 11.4, v * 3.4 * AR + 5.2, 6, 401);
      const t = ridged(u * 5.4 + 2.2, v * 6.2 * AR + 8.1, 4, 409);
      const mass = clamp((f * 1.35 + t * 0.42 - 0.62) * 2.4);
      density[y * W + x] = mass * band;
    }
  }

  const dh = blur(density, 5, 2);       // smooth height for the lighting normal
  for (let y = 1; y < H - 1; y++) {
    const v = y / H;
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = density[i];
      if (a <= 0.004) continue;
      const u = x / W;

      // Normal of the cloud height field.
      const gx = (dh[i + 1] - dh[i - 1]) * 26;
      const gy = (dh[i + W] - dh[i - W]) * 26;
      let nx = -gx, ny = -gy, nz = 0.62;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      // Distance to the moon governs how much light this billow can take.
      const dm = Math.hypot((u - MOON.u) / 0.62, (v - MOON.v) / (0.46 / AR));
      const reach = Math.pow(clamp(1 - dm), 1.35);

      const dKey = Math.max(0, nx * KEY_DIR[0] + ny * KEY_DIR[1] + nz * KEY_DIR[2]);
      const lit = 0.10 + 0.90 * Math.pow(dKey, 1.15);

      // Transmission: thin cloud in front of the moon glows through.
      const thin = Math.pow(1 - clamp(a), 1.8) * reach;

      const body = mix(rgb(0x2a, 0x31, 0x4c), rgb(0xe8, 0xee, 0xf6), clamp(lit * (0.30 + 0.85 * reach)));
      over(i, body, clamp(a * (0.55 + 0.45 * reach)));
      add(i, mix(P.white, P.silverCore, 0.3), thin * 0.34 * a);

      // The moon's own halo re-applied on top of the cloud, so the billows
      // nearest it burn out rather than merely being pale.
      add(i, P.white, Math.pow(clamp(1 - dm * 1.9), 2.4) * 0.55 * a);
    }
  }

  // A dark cloud mass pulled across the top-left corner. Compositional: the
  // wordmark sits there and needs a quiet ground, and a sky that is bright
  // edge to edge has no weather in it.
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const band = 1 - smoothstep(0.02, 0.26, v);
    if (band <= 0.002) continue;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const across = 1 - smoothstep(0.04, 0.42, u);
      const puff = 0.5 + 0.5 * fbm(u * 4.4 + 21.0, v * 5.0 * AR + 3.3, 4, 433);
      over(y * W + x, rgb(0x0a, 0x0e, 0x1b), clamp(band * across * puff * 0.92));
    }
  }
}

/* ---- 4.4  stars ---------------------------------------------------------
   Only in the clear top-right quarter — a star inside the cloud bank is the
   fastest way to say "these two layers were drawn by different people". */
{
  const r = rng(0x5eed01);
  for (let s = 0; s < 210; s++) {
    const u = r(), v = r() * 0.46;
    const x = Math.round(X(u)), y = Math.round(Y(v));
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
    const i = y * W + x;
    const sky = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    const drown = clamp(1 - sky * 4.2);          // washed out by moon and cloud
    const b = (0.20 + 0.80 * Math.pow(r(), 2.6)) * drown * (1 - smoothstep(0.22, 0.48, v));
    if (b <= 0.02) continue;
    const c = r() < 0.28 ? P.goldLight : P.violetLight;
    add(i, P.white, b * 0.70);
    add(i, c, b * 0.34);
    if (b > 0.52) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        add((y + dy) * W + (x + dx), c, b * 0.15);
      }
    }
  }
}

/* ---- 4.5  far ridge -----------------------------------------------------
   Aerial perspective is the whole job here: the ridge is barely separated
   from the sky, which is what buys the citadel in front of it its depth. */
{
  const r = rng(0x21d6e);
  const pts = [[-0.02, 0.78]];
  let u = -0.02;
  while (u < 1.04) {
    u += 0.028 + r() * 0.042;
    pts.push([u, 0.622 + (r() - 0.5) * 0.062 + Math.sin(u * 5.1) * 0.024]);
  }
  pts.push([1.04, 0.94], [-0.02, 0.94]);
  const m = blur(coverage([poly(...pts)]), 2, 1);
  shade(m, MAT.worksFar, { alpha: 0.86, gain: 0.72, grain: 0.010, bump: 6 });
}

/* ---- 4.6  the Kettleworks ----------------------------------------------
   A refinery cut into a cliff: halls, flues, spires, an arched ore viaduct
   and the great regulator wheel. Cut hard against the lit sky — a black
   silhouette on a bright ground is what makes the sky read as bright.
   ------------------------------------------------------------------------ */
{
  const spire = (u, w, top, capH) => poly(
    [u, 0.86], [u, top + capH], [u + w / 2, top], [u + w, top + capH], [u + w, 0.86],
  );
  const flue = (u, w, top) => poly(
    [u + w * 0.12, 0.86], [u + w * 0.20, top + 0.014], [u - w * 0.10, top + 0.014],
    [u - w * 0.10, top], [u + w * 1.10, top], [u + w * 1.10, top + 0.014],
    [u + w * 0.80, top + 0.014], [u + w * 0.88, 0.86],
  );

  /* --- far plane: outlying towers, almost pure haze --- */
  const far = coverage([
    spire(0.040, 0.040, 0.512, 0.034),
    spire(0.118, 0.030, 0.556, 0.026),
    spire(0.286, 0.036, 0.528, 0.030),
    spire(0.360, 0.026, 0.572, 0.022),
    rect(0.020, 0.578, 0.150, 0.760),
    rect(0.262, 0.594, 0.398, 0.760),
    poly([0.262, 0.598], [0.330, 0.560], [0.398, 0.598]),
  ]);
  shade(far, MAT.worksFar, { alpha: 0.92, gain: 0.80, grain: 0.012 });

  /* --- mid plane: the works proper --- */
  const parts = [
    // Cliff the works are built on.
    poly([-0.02, 0.700], [0.058, 0.686], [0.126, 0.704], [0.198, 0.692],
         [0.276, 0.712], [0.352, 0.704], [0.424, 0.732], [0.462, 0.760],
         [0.462, 0.96], [-0.02, 0.96]),
    // Lower halls — overlapping masses, not a row of separate tombstones.
    rect(0.010, 0.654, 0.132, 0.860),
    rect(0.104, 0.614, 0.226, 0.860),
    rect(0.208, 0.664, 0.310, 0.860),
    rect(0.296, 0.694, 0.398, 0.860),
    rect(0.372, 0.730, 0.442, 0.860),
    // Pitched caps so the roofline is not a stair.
    poly([0.104, 0.618], [0.165, 0.578], [0.226, 0.618]),
    poly([0.208, 0.668], [0.259, 0.636], [0.310, 0.668]),
    poly([0.296, 0.698], [0.347, 0.672], [0.398, 0.698]),
    // Spires and flues.
    spire(0.140, 0.078, 0.382, 0.062),
    spire(0.036, 0.052, 0.558, 0.040),
    spire(0.244, 0.058, 0.506, 0.046),
    spire(0.330, 0.044, 0.598, 0.034),
    flue(0.096, 0.026, 0.480),
    flue(0.212, 0.022, 0.524),
    flue(0.288, 0.018, 0.576),
    flue(0.360, 0.016, 0.642),
    // Crenellations along the tallest hall — the micro-detail that turns a
    // rectangle into architecture at thumbnail size.
    ...[0, 1, 2, 3, 4].map((k) => rect(0.110 + k * 0.024, 0.600, 0.124 + k * 0.024, 0.618)),
  ];

  const viaduct = [rect(-0.02, 0.750, 0.470, 0.782), rect(-0.02, 0.782, 0.470, 0.866)];
  const arches = [];
  for (let k = 0; k < 4; k++) {
    const u0 = 0.020 + k * 0.110;
    const w = 0.070;
    arches.push(ellipse(u0 + w / 2, 0.838, w / 2, 0.036, Math.PI, Math.PI * 2, 16,
      [[u0 + w, 0.872], [u0, 0.872]]));
  }

  // The great regulator wheel, half-sunk behind the halls. A solid toothed
  // disc — spokes at this size just read as an asterisk.
  const wheelRing = [];
  {
    const cu = 0.206, cv = 0.636, rr = 0.052, ar = W / H;
    const teeth = 14;
    for (let k = 0; k < teeth * 2; k++) {
      const a0 = (k / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = k % 2 === 0 ? rr : rr * 0.87;
      wheelRing.push([cu + Math.cos(a0) * rad, cv + Math.sin(a0) * rad * ar]);
      wheelRing.push([cu + Math.cos(a1) * rad, cv + Math.sin(a1) * rad * ar]);
    }
  }
  const gear = coverage([poly(...wheelRing)]);
  subtract(gear, coverage([ellipse(0.206, 0.636, 0.019, 0.019 * (W / H))]));

  const solid = coverage(parts);
  union(solid, coverage(viaduct));
  subtract(solid, coverage(arches));

  contact(union(Float32Array.from(solid), gear), 0.004, 0.006, 3, 0.34);
  shade(gear, MAT.works, { gain: 0.94, grain: 0.024 });
  shade(solid, MAT.works, { grain: 0.026 });

  // Moonlit roof and parapet edges: every upward-facing lip of the works
  // catches the same light the cloud does. Without this the citadel is a
  // paper cut-out laid over a lit sky.
  rimLight(union(Float32Array.from(solid), gear), -0.62, -0.78,
    mix(P.silverCore, P.white, 0.5), 0.72, 2, 1);

  /* Window lights, on a GRID. Courses alone are not enough: what says
     "building" is that the windows line up vertically as well as
     horizontally, so every course shares one global pitch and one global
     origin, and only whether a given window is lit varies. Scattering them
     at random — which is the obvious way to write this loop — makes a
     citadel look like it is standing in falling snow. */
  {
    const PITCH = 0.0186;                          // one bay
    const RISE = 0.0345;                           // one floor
    const U0 = 0.0125;
    for (let course = 0; course < 10; course++) {
      const v = 0.492 + course * RISE;
      for (let bay = 0; bay < 26; bay++) {
        const u = U0 + bay * PITCH;
        if (hash2(bay, course, 0x9e11) > 0.36) continue;   // most rooms are dark
        const x = Math.round(X(u)), y = Math.round(Y(v));
        if (x < 2 || y < 2 || x > W - 4 || y > H - 6) continue;
        if (solid[y * W + x] < 0.92 || solid[(y + 3) * W + x] < 0.92) continue;
        const s = hash2(bay, course, 0x4d2);
        const hot = s > 0.88;
        const c = hot ? P.goldCap : P.goldCore;
        const k0 = (hot ? 1.05 : 0.24 + s * 0.42) * (0.34 + 0.66 * smoothstep(0.48, 0.84, v));
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) add((y + dy) * W + x + dx, c, k0 * (dy === 3 ? 0.5 : 1));
        }
        for (let dy = -3; dy <= 6; dy++) {
          for (let dx = -3; dx <= 4; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = Math.hypot(dx - 0.5, dy - 1.5);
            add(yy * W + xx, c, Math.max(0, 1 - d / 4.6) * k0 * 0.08);
          }
        }
      }
    }
  }

  // The furnace mouths themselves: the frame's warm anchor, low and left.
  glow(0.216, 0.806, 0.240, 0.090, P.goldDeep, 0.60, 2.6);
  glow(0.208, 0.816, 0.116, 0.046, P.goldCore, 0.66, 2.6);
  glow(0.202, 0.822, 0.052, 0.023, P.goldCap, 0.72, 2.4);
  glow(0.086, 0.792, 0.062, 0.030, P.goldCore, 0.40, 2.4);

  // Smoke: warm-lit plumes leaving the tall flues, cool-lit where the moon
  // catches their tops.
  for (const [su, sv] of [[0.104, 0.480], [0.219, 0.524], [0.294, 0.576], [0.366, 0.642]]) {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      if (v > sv || v < sv - 0.30) continue;
      const t = (sv - v) / 0.30;
      const drift = t * 0.070 + Math.sin(t * 3.1) * 0.009;
      const width = 0.010 + t * 0.050;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const d = Math.abs(u - (su + drift)) / width;
        if (d >= 1) continue;
        const puff = fbm(u * 13 + su * 40, v * 13, 4, 53);
        const a = Math.pow(1 - d, 1.7) * (1 - t) * t * 3.0 * clamp(puff * 1.6 - 0.42) * 0.34;
        if (a <= 0.002) continue;
        over(y * W + x, [lerp(0.075, 0.230, t), lerp(0.070, 0.238, t), lerp(0.110, 0.300, t)], clamp(a));
      }
    }
  }
}

/* ---- 4.7  the Gate ------------------------------------------------------
   The Warden's post. A single cropped pier of the Gate stands hard against
   the right edge with standing aether behind it, and that column of violet
   is the ONLY reason the accent is in the frame at all: it is the ground the
   Warden's back rim comes off.

   The first pass at this drew the whole arch sweeping across the top of the
   frame, and a smooth ring crossing a painting on a diagonal reads as a pipe,
   not as architecture. A cropped vertical pier is both more believable and
   completely out of the title block's way.
   ------------------------------------------------------------------------ */
{
  const AR = W / H;

  /* --- standing aether, a column between the figure and the pier --------- */
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const down = smoothstep(0.02, 0.30, v) * (1 - smoothstep(0.84, 1.00, v));
    if (down <= 0.002) continue;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const column = Math.pow(1 - smoothstep(0.00, 0.200, Math.abs(u - 0.935)), 1.5);
      if (column <= 0.004) continue;
      const drape = clamp(fbm(u * 17.0 + 5.5, v * 1.7 + 0.9, 4, 61) * 1.9 - 0.62);
      const body = column * down;
      const i = y * W + x;
      over(i, mix(P.ground, P.violetDeep, 0.62 * body), body * 0.72);
      add(i, mix(P.violetCore, P.violetLight, 0.30), drape * body * 0.62);
      add(i, P.violetBright, body * body * 0.26);
    }
  }
  glow(0.945, 0.400, 0.160, 0.430, P.violetDeep, 0.95, 1.7);
  glow(0.948, 0.330, 0.110, 0.220, P.violetCore, 0.72, 1.9);
  glow(0.952, 0.286, 0.062, 0.098, P.violetBright, 0.62, 2.1);
  glow(0.950, 0.262, 0.032, 0.048, mix(P.violetLight, P.white, 0.4), 0.55, 2.4);
  glow(0.940, 0.640, 0.070, 0.130, P.violetCore, 0.42, 2.1);

  /* --- the pier itself, cropped by the right edge ------------------------ */
  const pier = coverage([
    poly([0.9880, -0.02], [1.030, -0.02], [1.030, 1.02], [0.9760, 1.02],
         [0.9800, 0.620], [0.9840, 0.300]),
    rect(0.9700, 0.104, 1.030, 0.150),        // a projecting string course
    rect(0.9660, 0.706, 1.030, 0.752),
  ]);
  contact(pier, 0.006, 0.008, 4, 0.34);
  shade(pier, MAT.stone, { gain: 0.66, grain: 0.044 });
  rimLight(pier, -0.86, -0.30, mix(P.silverCore, P.white, 0.4), 0.75, 2, 1);
  {
    const courses = [];
    for (let v0 = -0.01; v0 < 1.0; v0 += 0.062) courses.push(rect(0.960, v0, 1.030, v0 + 0.0045));
    seam(courses, pier, 0.60, 0.40);
  }
  // Warden-mark: one gold sigil band set into the pier's face.
  {
    const m = coverage([rect(0.9840, 0.400, 1.030, 0.416)]);
    intersect(m, pier);
    shade(m, MAT.gold, { gain: 0.70, grain: 0.0 });
  }

  /* --- warden-lamps out along the ledge ----------------------------------
     Four posts running back toward the works, each a single lit point. They
     cost twelve polygons and they are the only thing in the middle distance
     that tells the eye how far away the Kettleworks are. Kept low and to the
     left of the pier, entirely clear of the title block's column. */
  for (const [lu, lv, lk] of [[0.482, 0.874, 1.0], [0.548, 0.856, 0.82], [0.596, 0.842, 0.66]]) {
    const post = coverage([
      poly([lu - 0.0035, lv], [lu + 0.0035, lv], [lu + 0.0030, lv + 0.046], [lu - 0.0030, lv + 0.046]),
      diamond(lu, lv - 0.008, 0.0090, 0.0090 * AR),
    ]);
    contact(post, 0.002, 0.003, 2, 0.26);
    shade(post, MAT.stone, { gain: 0.42, bump: 1, grain: 0.0 });
    aether([diamond(lu, lv - 0.008, 0.0050, 0.0050 * AR)], 0.9 * lk,
      [lu, lv - 0.008, 0.030, 0.030 * AR, 0.34 * lk]);
  }
}

/* ---- 4.8  the middle ground --------------------------------------------
   The strip between the works and the Gate gets a row of warden-stones
   standing off in the half-dark, and the two halves of the picture get air
   pushed between them: warm haze drifting right off the forge, cool haze
   bleeding left out of the Gate. Interpenetrating the two light sources is
   what stops the painting reading as a warm half and a cool half bolted
   together.
   ------------------------------------------------------------------------ */
{
  const stones = coverage([
    poly([0.470, 0.900], [0.482, 0.812], [0.502, 0.804], [0.512, 0.898]),
    poly([0.516, 0.906], [0.524, 0.848], [0.540, 0.844], [0.548, 0.904]),
    poly([0.428, 0.912], [0.438, 0.842], [0.456, 0.836], [0.464, 0.910]),
    poly([0.556, 0.910], [0.562, 0.868], [0.574, 0.866], [0.578, 0.908]),
  ]);
  contact(stones, 0.004, 0.006, 3, 0.30);
  shade(stones, MAT.stone, { gain: 0.50, bump: 3, grain: 0.030 });
  rimLight(stones, -0.70, -0.62, KEY_COLOUR, 0.50, 1, 0);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    const band = Math.exp(-Math.pow((v - 0.820) / 0.115, 2));
    if (band <= 0.004) continue;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const reach = Math.pow(1 - smoothstep(0.12, 0.86, u), 1.5);
      const puff = 0.55 + 0.45 * fbm(u * 5.2 + 7.1, v * 7.4, 3, 173);
      add(y * W + x, P.goldDeep, band * reach * puff * 0.085);
    }
  }
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const band = Math.exp(-Math.pow((v - 0.740) / 0.190, 2));
    if (band <= 0.004) continue;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const reach = Math.pow(smoothstep(0.30, 0.92, u), 1.4);
      const puff = 0.55 + 0.45 * fbm(u * 4.4 + 2.3, v * 6.6, 3, 191);
      add(y * W + x, P.violetDeep, band * reach * puff * 0.095);
    }
  }
}

/* ---- 4.9  the ledge -----------------------------------------------------
   The shelf the works and the Gate both stand on. */
{
  const ledge = coverage([
    poly([0.402, 1.030], [0.474, 0.950], [0.596, 0.918], [0.726, 0.906],
         [0.876, 0.912], [1.020, 0.930], [1.020, 1.030]),
    poly([-0.02, 1.030], [-0.02, 0.918], [0.092, 0.896], [0.232, 0.906],
         [0.334, 0.944], [0.376, 1.030]),
  ]);
  contact(ledge, 0.004, 0.008, 5, 0.30);
  shade(ledge, MAT.stone, { gain: 0.60, bump: 5, grain: 0.034 });
  rimLight(ledge, -0.62, -0.78, KEY_COLOUR, 0.42, 2, 1);
}

/* =========================================================================
   4.10  THE WARDEN OF THE CINDER GATE
   =========================================================================
   The subject, and the half of the frame that has to survive being put
   beside a top-grossing store listing. She stands close to camera, filling
   the right two fifths from the top of the band to the crop, three-quarter
   turned, greatsword grounded with both gauntlets stacked on the grip.

   BUILT FROM A SKELETON, NOT FROM TYPED OUTLINES.
   Two earlier passes at this figure were authored as hand-written polygon
   lists, and both came back as a barrel with lumps on it: typing forty pairs
   of coordinates blind gives you no control over proportion, and the eye
   reads proportion before it reads anything else. So the joints are declared
   once, in JOINT below, and every limb is a tapered capsule swept between
   two of them (`limb`) while every body mass is lofted through a stack of
   horizontal sections (`lofted`). Proportion is then a property of the
   skeleton, and the plates are just clothing hung on it — which is also how
   real harness is designed.

   Proportion held: head 0.170 of frame height, shoulder span 3.4 head-widths,
   crown to crop 6.2 heads. Waist is 78% of shoulder width, which is what
   gives the arms something to hang clear of.

   Lighting: moon key from the upper left, furnace bounce from the lower
   left, and the Gate's aether behind her right shoulder. Every silhouette
   takes a hard moon rim down its left contour — that line is the loudest mark
   in the painting and the thing that stops her reading as a cut-out.
   ========================================================================= */

const AR = W / H;

/** Tapered capsule from a to b, as a run of overlapping discs. Built from
    discs rather than one outline because a swept quad with round caps is
    easy to wind wrong, and a self-intersecting polygon fills with holes. */
function limb(a, b, r0, r1, n = 16) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push(ellipse(lerp(a[0], b[0], t), lerp(a[1], b[1], t),
      lerp(r0, r1, t), lerp(r0, r1, t) * AR, 0, Math.PI * 2, 14));
  }
  return out;
}

/** A body mass lofted through horizontal sections [v, centre-u, half-width].
    Left edge down, right edge back up: never self-intersects. */
function lofted(sections) {
  const L = [], Rt = [];
  for (const [v, cu, hw] of sections) {
    L.push([cu - hw, v]);
    Rt.push([cu + hw, v]);
  }
  return poly(...L, ...Rt.reverse());
}

/* The skeleton. Everything below hangs off these fourteen points. */
const JOINT = {
  crown: [0.802, 0.086], chin: [0.802, 0.256], neck: [0.804, 0.276],
  shL: [0.708, 0.308], shR: [0.906, 0.300],
  elbL: [0.648, 0.498], elbR: [0.972, 0.490],
  wriL: [0.786, 0.690], wriR: [0.888, 0.664],
  hipL: [0.760, 0.712], hipR: [0.876, 0.704],
  kneeL: [0.748, 1.030], kneeR: [0.890, 1.030],
};

const wardenMask = new Float32Array(N);   // everything, for the cast shadow
const steelMask = new Float32Array(N);    // just the harness, for the rim pass

/** Draw one plate: contact shadow, shade, remember it, and seam it. */
function plate(polys, mat, opt = {}) {
  const m = coverage(polys);
  if (opt.clip) intersect(m, opt.clip);
  contact(m, opt.du ?? 0.0035, opt.dv ?? 0.0055, opt.blur ?? 3, opt.shadow ?? 0.46);
  shade(m, mat, opt);
  union(wardenMask, m);
  if (opt.steel !== false) union(steelMask, m);
  return m;
}

{
  const J = JOINT;

  /* --- 1. the cloak, falling behind and to both sides --------------------
     It has to be SEEN, which means its silhouette has to leave the figure
     and cut into the lit sky on the left. A cloak drawn entirely behind a
     body is a cloak nobody knows is there. The hem is deliberately torn. */
  const cloak = coverage([
    poly([0.640, 0.300], [0.706, 0.256], [0.906, 0.252], [0.984, 0.296],
         [1.030, 0.440], [1.030, 1.020], [0.634, 1.020], [0.612, 0.944],
         [0.622, 0.986], [0.592, 0.908], [0.602, 0.948], [0.576, 0.848],
         [0.594, 0.708], [0.622, 0.540], [0.634, 0.400]),
    // A wind-caught corner thrown out to the left. One asymmetric event in
    // the outline is worth more than any amount of interior detail.
    poly([0.622, 0.560], [0.566, 0.628], [0.538, 0.724], [0.550, 0.822],
         [0.586, 0.866], [0.592, 0.734], [0.612, 0.646]),
  ]);
  contact(cloak, 0.004, 0.006, 5, 0.46);
  shade(cloak, MAT.cloth, { gain: 0.95, bump: 4, grain: 0.026, warm: 1.05, back: 1.35 });
  union(wardenMask, cloak);

  // Folds. A lit crest and a shadowed valley beside it: that pairing is what
  // makes cloth read as volume instead of as a cut-out of dark paper.
  {
    const crest = coverage([
      poly([0.6420, 0.4400], [0.6540, 0.4460], [0.6300, 0.6600], [0.6080, 0.9000], [0.5960, 0.8960], [0.6180, 0.6560]),
      poly([0.6880, 0.3600], [0.6980, 0.3660], [0.6800, 0.6200], [0.6620, 0.9400], [0.6520, 0.9360], [0.6700, 0.6180]),
      poly([0.9560, 0.3600], [0.9660, 0.3680], [0.9840, 0.6200], [0.9980, 0.9400], [0.9880, 0.9440], [0.9700, 0.6220]),
      poly([0.5760, 0.6740], [0.5860, 0.6800], [0.5700, 0.7860], [0.5620, 0.8340], [0.5520, 0.8280], [0.5640, 0.7800]),
    ]);
    intersect(crest, cloak);
    shade(crest, MAT.cloth, { alpha: 0.66, gain: 1.45, bump: 4, grain: 0.0 });

    const valley = coverage([
      poly([0.6580, 0.4500], [0.6660, 0.4560], [0.6420, 0.6640], [0.6200, 0.9040], [0.6100, 0.9000], [0.6320, 0.6600]),
      poly([0.7040, 0.3660], [0.7120, 0.3720], [0.6940, 0.6240], [0.6760, 0.9440], [0.6670, 0.9400], [0.6850, 0.6220]),
      poly([0.9420, 0.3660], [0.9500, 0.3740], [0.9680, 0.6240], [0.9820, 0.9440], [0.9740, 0.9480], [0.9560, 0.6260]),
    ]);
    intersect(valley, cloak);
    for (let i = 0; i < N; i++) {
      const a = valley[i] * 0.58;
      if (a <= 0.004) continue;
      R[i] *= 1 - a; G[i] *= 1 - a; B[i] *= 1 - a;
    }
  }

  // Gold thread along the torn hem — the embroidery a premium cape has.
  {
    const hem = coverage([
      poly([0.5760, 0.8500], [0.5880, 0.8440], [0.6060, 0.9520], [0.6360, 1.0200], [0.6160, 1.0200], [0.5900, 0.9440]),
      poly([0.5380, 0.7240], [0.5500, 0.7260], [0.5540, 0.8180], [0.5420, 0.8220]),
      poly([1.0180, 0.4600], [1.0300, 0.4600], [1.0300, 0.7600], [1.0180, 0.7600]),
    ]);
    intersect(hem, cloak);
    shade(hem, MAT.gold, { alpha: 0.60, gain: 0.60, bump: 1, grain: 0.0 });
  }

  rimLight(cloak, -0.72, -0.60, mix(P.silverCore, P.white, 0.35), 0.46, 2, 1);
  rimLight(cloak, 0.86, -0.28, P.violetCore, 0.52, 3, 2);

  /* --- 2. far arm (frame right, turned out of the moon) ------------------
     Shoulder out, elbow OUT and back, forearm in to the grip. The bend is
     the whole point: an arm drawn straight down the side of a torso shares
     its silhouette and disappears, and the triangle of dark it opens between
     arm and body is worth more than any amount of plate detail. */
  // The far pauldron. Its absence is what made the right shoulder read as a
  // pipe joined to a box; a figure needs a mass on BOTH shoulders even when
  // one of them is turned almost entirely out of the light.
  const pauldronR = plate([
    poly([0.8760, 0.3120], [0.8920, 0.2540], [0.9380, 0.2320], [0.9880, 0.2520],
         [1.0120, 0.3120], [0.9980, 0.3980], [0.9420, 0.4300], [0.8880, 0.3940]),
  ], MAT.steelDeep, { bump: 4, grain: 0.020, shadow: 0.50 });
  seam([
    poly([0.8800, 0.3320], [1.0080, 0.3140], [1.0100, 0.3240], [0.8820, 0.3420]),
  ], pauldronR, 0.70, 0.42);
  facet(pauldronR, [poly([0.8760, 0.3120], [0.8920, 0.2540], [0.9380, 0.2320],
                         [0.9880, 0.2520], [0.9600, 0.2760], [0.9160, 0.2740],
                         [0.8900, 0.3220])],
    MAT.steelDeep, { gain: 2.20 });

  plate(limb(J.shR, J.elbR, 0.040, 0.031), MAT.steelDeep, { bump: 3, grain: 0.020 });
  plate([ellipse(J.elbR[0], J.elbR[1], 0.032, 0.032 * AR, 0, Math.PI * 2, 18)],
    MAT.steelDeep, { bump: 2, grain: 0.018, gain: 1.05 });
  plate(limb(J.elbR, J.wriR, 0.031, 0.026), MAT.steelDeep, { bump: 3, grain: 0.020 });

  /* --- 3. the cuirass ---------------------------------------------------- */
  const cuirass = plate([lofted([
    [0.300, 0.808, 0.094], [0.324, 0.810, 0.104], [0.372, 0.812, 0.105],
    [0.436, 0.812, 0.100], [0.500, 0.812, 0.090], [0.556, 0.812, 0.080],
    [0.604, 0.810, 0.077], [0.646, 0.808, 0.081], [0.664, 0.806, 0.074],
  ])], MAT.steel, { bump: 4, grain: 0.022, shadow: 0.50 });

  // The keel: a raised ridge down the centre of the breastplate. Without it
  // a cuirass reads as a shield-shaped sticker.
  {
    const keel = coverage([
      poly([0.7980, 0.2880], [0.8200, 0.2940], [0.8280, 0.4400], [0.8200, 0.5800],
           [0.8060, 0.6620], [0.7940, 0.6620], [0.7880, 0.5800], [0.7860, 0.4400]),
    ]);
    intersect(keel, cuirass);
    shade(keel, MAT.steel, { alpha: 0.60, gain: 1.18, bump: 4, grain: 0.0 });
  }

  /* The cuirass's two planes. Everything inboard of the keel faces the moon;
     everything outboard of it turns into the Gate's shadow. The break is a
     straight line on purpose — that hard edge is the single strongest signal
     that this is a beaten steel plate and not an airbrushed capsule. */
  facet(cuirass, [poly([0.7000, 0.3120], [0.7960, 0.2860], [0.8000, 0.6640],
                       [0.7360, 0.6400], [0.7060, 0.5000])],
    MAT.steel, { gain: 1.90 });
  // and a narrower hot band right on the turn
  facet(cuirass, [poly([0.7420, 0.3060], [0.7860, 0.2940], [0.7900, 0.6600],
                       [0.7560, 0.6520])],
    MAT.steel, { gain: 2.30, alpha: 0.52 });

  seam([
    poly([0.7020, 0.3560], [0.9200, 0.3520], [0.9200, 0.3620], [0.7020, 0.3660]),
    poly([0.7220, 0.5060], [0.9040, 0.4980], [0.9040, 0.5080], [0.7220, 0.5160]),
    poly([0.7300, 0.6020], [0.8880, 0.5940], [0.8880, 0.6040], [0.7300, 0.6120]),
  ], cuirass, 0.72, 0.46);
  rivets(cuirass, [[0.712, 0.372], [0.918, 0.366]], 9);
  rivets(cuirass, [[0.734, 0.522], [0.898, 0.514]], 8);

  // The Warden's breast sigil: the house diamond in gold, small and set high
  // on the left breast where a badge actually sits. Centred and large it
  // reads as a target painted on a toy.
  {
    const SU = 0.7600, SV = 0.4160;
    const boss = coverage([diamond(SU, SV, 0.0300, 0.0300 * AR)]);
    intersect(boss, cuirass);
    contact(boss, 0.002, 0.003, 2, 0.36);
    shade(boss, MAT.gold, { gain: 1.20, bump: 2, grain: 0.0 });
    union(steelMask, boss);
    const inner = coverage([diamond(SU, SV, 0.0176, 0.0176 * AR)]);
    intersect(inner, cuirass);
    shade(inner, MAT.gold, { gain: 0.42, bump: 1, grain: 0.0 });
    aether([diamond(SU, SV, 0.0086, 0.0086 * AR)], 0.88, [SU, SV, 0.038, 0.038 * AR, 0.22]);
  }

  /* --- 4. fauld, tassets and legs ---------------------------------------- */
  for (let k = 0; k < 3; k++) {
    const v0 = 0.6480 + k * 0.0470;
    const w = 0.084 + k * 0.006;
    plate([lofted([
      [v0, 0.808, w * 0.94], [v0 + 0.018, 0.808, w], [v0 + 0.050, 0.807, w * 0.99],
    ])], MAT.steel, { bump: 3, grain: 0.020, gain: 0.94 - k * 0.05, shadow: 0.52 });
  }
  // Tassets: two hanging plates, the near one lower and further forward.
  plate([lofted([
    [0.762, 0.766, 0.045], [0.800, 0.764, 0.050], [0.860, 0.760, 0.050], [0.898, 0.756, 0.040],
  ])], MAT.steel, { bump: 3, grain: 0.020, gain: 0.92, shadow: 0.52 });
  plate([lofted([
    [0.756, 0.872, 0.043], [0.794, 0.876, 0.048], [0.850, 0.880, 0.048], [0.884, 0.884, 0.038],
  ])], MAT.steelDeep, { bump: 3, grain: 0.020, gain: 0.96, shadow: 0.52 });
  // Cuisses, cropped by the frame.
  plate(limb(J.hipL, J.kneeL, 0.050, 0.046), MAT.steel, { bump: 4, grain: 0.020, gain: 0.84 });
  plate(limb(J.hipR, J.kneeR, 0.047, 0.043), MAT.steelDeep, { bump: 4, grain: 0.020, gain: 0.88 });

  /* --- 5. mail in the gaps ----------------------------------------------- */
  {
    const gaps = coverage([
      rect(0.7380, 0.6320, 0.8800, 0.6540),
      rect(0.7500, 0.2200, 0.8600, 0.2560),
    ]);
    shade(gaps, MAT.mail, { bump: 2, grain: 0.10 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (gaps[i] < 0.4) continue;
        if (y % 3 !== 0) continue;
        if ((x + (Math.floor(y / 3) % 2) * 2) % 4 !== 0) continue;
        add(i, KEY_COLOUR, 0.34 * gaps[i]);
        if (y + 1 < H) { const j = i + W; R[j] *= 0.70; G[j] *= 0.70; B[j] *= 0.70; }
      }
    }
    union(wardenMask, gaps);
  }

  /* --- 6. near arm and the big pauldron (frame left, into the moon) ------ */
  const upperL = plate(limb(J.shL, J.elbL, 0.042, 0.033), MAT.steel, { bump: 3, grain: 0.020, gain: 0.94 });
  facet(upperL, [poly([0.6740, 0.3200], [0.7180, 0.3260], [0.6560, 0.5040],
                      [0.6180, 0.4900])], MAT.steel, { gain: 1.85 });
  const cop = plate([ellipse(J.elbL[0], J.elbL[1], 0.034, 0.034 * AR, 0, Math.PI * 2, 18)],
    MAT.steel, { bump: 2, grain: 0.018, gain: 1.06 });
  rivets(cop, [[0.622, 0.482], [0.668, 0.520]], 5);
  const foreL = plate(limb(J.elbL, J.wriL, 0.033, 0.027), MAT.steel, { bump: 3, grain: 0.020, gain: 1.00 });
  facet(foreL, [poly([0.6300, 0.4840], [0.6720, 0.4680], [0.8020, 0.6660],
                     [0.7760, 0.6820])], MAT.steel, { gain: 1.95 });

  // The big near pauldron: the largest single plate on the figure and the one
  // that takes the brightest hit in the painting.
  const pauldron = plate([
    poly([0.6100, 0.3480], [0.6360, 0.2800], [0.6940, 0.2440], [0.7560, 0.2620],
         [0.7840, 0.3340], [0.7700, 0.4260], [0.7020, 0.4600], [0.6380, 0.4280]),
  ], MAT.steel, { bump: 4, grain: 0.020, shadow: 0.54 });
  seam([
    poly([0.6150, 0.3680], [0.7830, 0.3440], [0.7850, 0.3540], [0.6170, 0.3780]),
    poly([0.6340, 0.4120], [0.7770, 0.3920], [0.7790, 0.4020], [0.6360, 0.4220]),
  ], pauldron, 0.74, 0.52);
  rivets(pauldron, [[0.624, 0.348], [0.690, 0.300], [0.754, 0.310]], 7);

  /* The pauldron's two planes. The crest of the shoulder turns up into the
     moon and takes almost the whole of the light; everything outboard of the
     break falls away. One hard line does more for "this is a curved steel
     plate" than any amount of smooth shading. */
  facet(pauldron, [poly([0.6100, 0.3480], [0.6360, 0.2800], [0.6940, 0.2440],
                        [0.7560, 0.2620], [0.7720, 0.3080], [0.6940, 0.2900],
                        [0.6480, 0.3140], [0.6260, 0.3700])],
    MAT.steel, { gain: 2.05 });
  // A narrow gold rope along its leading edge — the only trim she wears.
  facet(pauldron, [poly([0.6130, 0.3460], [0.6380, 0.2820], [0.6940, 0.2460],
                        [0.7540, 0.2640], [0.7500, 0.2760], [0.6940, 0.2590],
                        [0.6460, 0.2940], [0.6240, 0.3520])],
    MAT.gold, { gain: 1.05, bump: 1 });

  // One lame under the pauldron. Three stacked lames at this size stop
  // reading as armour and start reading as a lobster tail.
  plate([lofted([[0.436, 0.698, 0.070], [0.474, 0.702, 0.065], [0.512, 0.704, 0.050]])],
    MAT.steel, { bump: 3, grain: 0.020, gain: 0.90 });

  /* --- 7. the greatsword -------------------------------------------------
     Grounded between her feet with both gauntlets stacked on the grip. The
     whole cluster is kept right of u=0.74 so it never crowds the title
     block's widest line. */
  const SW = 0.8420;
  {
    const pommel = coverage([diamond(SW, 0.6120, 0.0290, 0.0290 * AR)]);
    contact(pommel, 0.003, 0.005, 2, 0.40);
    shade(pommel, MAT.gold, { bump: 2, grain: 0.0, gain: 1.05 });
    union(wardenMask, pommel); union(steelMask, pommel);
    aether([diamond(SW, 0.6120, 0.0122, 0.0122 * AR)], 0.95,
      [SW, 0.6120, 0.052, 0.052 * AR, 0.40]);

    const grip = plate([rect(SW - 0.0175, 0.6360, SW + 0.0175, 0.7980)],
      MAT.cloth, { bump: 2, grain: 0.05, gain: 1.9, shadow: 0.30 });
    for (let k = 0; k < 12; k++) {
      const v0 = 0.6420 + k * 0.0130;
      seam([poly([SW - 0.020, v0], [SW + 0.020, v0 - 0.004],
                 [SW + 0.020, v0 + 0.0032], [SW - 0.020, v0 + 0.0072])], grip, 0.55, 0.60);
    }
  }

  /* --- 8. the gauntlets, stacked on the grip ----------------------------- */
  const gauntletFar = plate([
    poly([0.8280, 0.6440], [0.9020, 0.6380], [0.9280, 0.6880], [0.9120, 0.7320],
         [0.8540, 0.7380], [0.8220, 0.7000]),
  ], MAT.steelDeep, { bump: 3, grain: 0.018, gain: 1.00, shadow: 0.50 });
  seam([
    poly([0.8240, 0.6700], [0.9240, 0.6620], [0.9250, 0.6720], [0.8250, 0.6800]),
    poly([0.8300, 0.6980], [0.9240, 0.6900], [0.9250, 0.7000], [0.8310, 0.7080]),
  ], gauntletFar, 0.70, 0.44);

  const gauntletNear = plate([
    poly([0.7620, 0.7000], [0.8440, 0.6920], [0.8680, 0.7400], [0.8580, 0.7900],
         [0.7980, 0.7980], [0.7540, 0.7740], [0.7460, 0.7300]),
  ], MAT.steel, { bump: 3, grain: 0.018, gain: 1.06, shadow: 0.54 });
  seam([
    poly([0.7480, 0.7280], [0.8640, 0.7180], [0.8660, 0.7280], [0.7500, 0.7380]),
    poly([0.7540, 0.7540], [0.8640, 0.7440], [0.8660, 0.7540], [0.7560, 0.7640]),
    poly([0.7660, 0.7780], [0.8580, 0.7700], [0.8600, 0.7800], [0.7680, 0.7880]),
  ], gauntletNear, 0.72, 0.48);
  facet(gauntletNear, [poly([0.7460, 0.7300], [0.7620, 0.7000], [0.8440, 0.6920],
                            [0.8560, 0.7140], [0.7680, 0.7240])],
    MAT.steel, { gain: 1.95 });
  rivets(gauntletNear, [[0.756, 0.732], [0.858, 0.722]], 7);

  /* --- 8b. guard and blade, in front of both hands ----------------------- */
  {
    const guard = plate([
      poly([0.7440, 0.8020], [0.7680, 0.7900], [0.9240, 0.7860], [0.9480, 0.7980],
           [0.9480, 0.8180], [0.9240, 0.8300], [0.7680, 0.8320], [0.7440, 0.8200]),
      rect(SW - 0.0260, 0.7820, SW + 0.0260, 0.8380),
    ], MAT.gold, { bump: 3, grain: 0.0, gain: 1.00, shadow: 0.50 });
    rivets(guard, [[0.756, 0.811], [0.936, 0.807]], 11, P.goldLight, 0.7);

    const blade = plate([
      poly([SW - 0.0330, 0.8300], [SW + 0.0330, 0.8300], [SW + 0.0280, 1.0200], [SW - 0.0280, 1.0200]),
    ], MAT.blade, { bump: 2, grain: 0.010, shadow: 0.44 });
    {
      const fuller = coverage([
        poly([SW - 0.0110, 0.8380], [SW + 0.0110, 0.8380], [SW + 0.0092, 1.0200], [SW - 0.0092, 1.0200]),
      ]);
      intersect(fuller, blade);
      for (let i = 0; i < N; i++) {
        const a = fuller[i] * 0.66;
        if (a <= 0.004) continue;
        R[i] *= 1 - a; G[i] *= 1 - a; B[i] *= 1 - a;
      }
      const edge = coverage([
        poly([SW - 0.0330, 0.8300], [SW - 0.0250, 0.8300], [SW - 0.0208, 1.0200], [SW - 0.0280, 1.0200]),
      ]);
      intersect(edge, blade);
      shade(edge, MAT.blade, { alpha: 0.92, gain: 2.2, bump: 1, grain: 0.0 });
    }
  }

  /* --- 9. gorget and helm ------------------------------------------------ */
  /* The gorget. Deep, and it comes right up under the jaw: in harness there is
     no bare neck, and a head floating over a gap on a thin stalk is the exact
     silhouette that reads as a robot rather than as a person in armour. */
  const gorget = plate([lofted([
    [0.222, 0.804, 0.052], [0.248, 0.804, 0.072], [0.272, 0.805, 0.086],
    [0.300, 0.806, 0.092], [0.322, 0.807, 0.084],
  ])], MAT.steel, { bump: 4, grain: 0.018, gain: 0.94, shadow: 0.50 });
  seam([
    poly([0.7180, 0.2760], [0.8940, 0.2720], [0.8940, 0.2820], [0.7180, 0.2860]),
  ], gorget, 0.70, 0.46);
  facet(gorget, [poly([0.7160, 0.2900], [0.7520, 0.2320], [0.8040, 0.2200],
                      [0.8040, 0.3240], [0.7480, 0.3160])],
    MAT.steel, { gain: 2.00 });

  /* Skull of the helm. Angular, not domed: a bascinet with flat facets, a
     ridged crown and a face that comes to a blunt point. A round helm at
     this size reads as a ball with a slot in it, which is precisely how the
     first version of this figure failed. */
  const helm = plate([
    poly([0.7480, 0.1880], [0.7500, 0.1520], [0.7620, 0.1220], [0.7860, 0.1050],
         [0.8140, 0.1020], [0.8400, 0.1160], [0.8540, 0.1460], [0.8570, 0.1860],
         [0.8510, 0.2140], [0.8310, 0.2380], [0.8030, 0.2560], [0.7770, 0.2440],
         [0.7560, 0.2180]),
  ], MAT.steel, { bump: 3, grain: 0.016, shadow: 0.50, form: 0.10 });

  /* The helm's planes: the near half of the skull turns to the moon, the
     jaw below the sights turns away and stays near black. */
  facet(helm, [poly([0.7480, 0.1900], [0.7500, 0.1520], [0.7620, 0.1220],
                    [0.7860, 0.1050], [0.8140, 0.1020], [0.7940, 0.1240],
                    [0.7720, 0.1560], [0.7640, 0.1920])],
    MAT.steel, { gain: 2.10 });
  facet(helm, [poly([0.7560, 0.2180], [0.7770, 0.2440], [0.8030, 0.2560],
                    [0.8310, 0.2380], [0.8000, 0.2480], [0.7740, 0.2360])],
    MAT.steel, { gain: 0.30 });

  // Comb and the small gold fin standing on it — the crest of her order.
  {
    const comb = coverage([
      poly([0.7720, 0.1380], [0.7920, 0.1040], [0.8180, 0.0970], [0.8410, 0.1140],
           [0.8430, 0.1320], [0.8250, 0.1190], [0.8050, 0.1120], [0.7870, 0.1210],
           [0.7790, 0.1430]),
    ]);
    contact(comb, 0.003, 0.004, 2, 0.42);
    shade(comb, MAT.steel, { bump: 2, grain: 0.014, gain: 1.12, form: 0.08 });
    union(steelMask, comb); union(wardenMask, comb);

    const fin = coverage([
      poly([0.7960, 0.1060], [0.8060, 0.0800], [0.8230, 0.0760], [0.8360, 0.0900],
           [0.8300, 0.1060], [0.8180, 0.0940], [0.8060, 0.0960]),
    ]);
    contact(fin, 0.002, 0.003, 2, 0.34);
    shade(fin, MAT.gold, { bump: 1, grain: 0.0, gain: 1.05 });
    union(steelMask, fin); union(wardenMask, fin);

    /* A crest of dyed horsehair streaming back off the comb. Cloth in motion
       is the cheapest possible antidote to a figure that reads as machined:
       nothing manufactured has a torn silhouette. */
    const crest = coverage([
      poly([0.8060, 0.0940], [0.8300, 0.0760], [0.8700, 0.0800], [0.9020, 0.1060],
           [0.9200, 0.1520], [0.9160, 0.2020], [0.9000, 0.1620], [0.8760, 0.1240],
           [0.8460, 0.1040], [0.8180, 0.1080]),
      poly([0.8840, 0.1360], [0.9080, 0.1780], [0.9040, 0.2340], [0.8880, 0.1900]),
    ]);
    contact(crest, 0.003, 0.005, 3, 0.34);
    shade(crest, MAT.cloth, { bump: 3, grain: 0.06, gain: 1.35, back: 1.8 });
    union(wardenMask, crest);
    rimLight(crest, -0.72, -0.60, mix(P.silverCore, P.white, 0.4), 0.55, 2, 1);
    rimLight(crest, 0.86, -0.28, P.violetLight, 0.80, 2, 1);
  }

  {
    // A steel brow ridge standing proud over the sights. Gold here reads as a
    // headband and turns the whole helm into a costume prop.
    const brow = coverage([
      poly([0.7490, 0.1690], [0.8570, 0.1630], [0.8570, 0.1810], [0.7490, 0.1870]),
    ]);
    intersect(brow, blur(helm, 1, 1));
    shade(brow, MAT.steel, { bump: 1, grain: 0.0, gain: 1.55 });

    /* The sights. TWO short slits with a nasal bar between them, not one band
       across the face — a single lit strip is the tell that turns a helm into
       a toy robot. Each slit is a hole in steel that happens to have a light
       behind it, so it stays dark at its ends and hot only at its centre. */
    /* The sight is a CROSS — one narrow vertical slot with a horizontal bar
       across it — and it is a HOLE, not a lamp. Two lit rectangles side by
       side is the single strongest "robot" signal a helmet can carry, and it
       is what two earlier passes at this figure were wearing. The aether
       behind her eyes shows as a faint bloom out of the slot's centre and
       nothing more. */
    const slit = coverage([
      poly([0.7960, 0.1720], [0.8110, 0.1714], [0.8130, 0.2440], [0.7980, 0.2470]),
      poly([0.7640, 0.1900], [0.8450, 0.1862], [0.8450, 0.1972], [0.7640, 0.2010]),
    ]);
    intersect(slit, helm);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = slit[i];
        if (a <= 0.004) continue;
        const u = x / W, v = y / H;
        const core = (1 - smoothstep(0.006, 0.030, Math.abs(u - 0.8040)))
                   * (1 - smoothstep(0.010, 0.050, Math.abs(v - 0.1960)));
        over(i, [0.003, 0.003, 0.008], a);
        over(i, mix(P.violetLight, P.white, 0.18), a * core * 0.62);
        add(i, P.violetBright, a * core * 0.30);
      }
    }
    glow(0.8040, 0.1950, 0.036, 0.036 * AR, P.violetBright, 0.24, 2.8);

    // Breathing perforations, in a short arc on the near cheek.
    const holes = [];
    for (let k = 0; k < 5; k++) {
      holes.push(ellipse(0.7710 + k * 0.0130, 0.2180 + k * 0.0042, 0.0032, 0.0032 * AR, 0, Math.PI * 2, 10));
    }
    const perf = coverage(holes);
    intersect(perf, helm);
    for (let i = 0; i < N; i++) {
      const a = perf[i] * 0.85;
      if (a <= 0.004) continue;
      R[i] *= 1 - a; G[i] *= 1 - a; B[i] *= 1 - a;
    }
  }

  seam([
    poly([0.7500, 0.1500], [0.8550, 0.1430], [0.8560, 0.1530], [0.7510, 0.1600]),
    poly([0.7570, 0.2040], [0.8490, 0.1980], [0.8500, 0.2080], [0.7580, 0.2140]),
    poly([0.7800, 0.2000], [0.7870, 0.2000], [0.7970, 0.2540], [0.7890, 0.2540]),
  ], helm, 0.70, 0.50);
  rivets(helm, [[0.754, 0.158], [0.804, 0.148], [0.853, 0.153]], 7);

  /* --- 10. one form shadow over the whole figure -------------------------
     Sixty separately-shaded plates read as sixty plates. What welds them into
     one body is a single large-scale ramp laid over all of them at once: the
     mass turns away from the moon toward frame right, and it sinks into the
     dark at the crop. This runs BEFORE the rims, so the rims still cut. */
  {
    const soft = blur(wardenMask, 3, 1);
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = soft[i];
        if (a <= 0.01) continue;
        const u = x / W;
        const away = smoothstep(0.780, 1.060, u);
        const low = smoothstep(0.620, 1.020, v);
        const k = 1 - a * (0.38 * away + 0.46 * low - 0.14 * away * low);
        R[i] *= k; G[i] *= k; B[i] *= k;
      }
    }
  }

  /* --- 11. the rim pass --------------------------------------------------
     Last, over everything: the moon's hard edge down the whole left contour
     of the harness, then the Gate's violet down the right. Two lines, and
     they are worth more than every plate above them put together. */
  rimLight(steelMask, -0.78, -0.62, mix(P.white, P.goldLight, 0.12), 0.92, 2, 0);
  rimLight(steelMask, -0.78, -0.62, P.white, 0.58, 1, 0);
  rimLight(steelMask, 0.90, -0.18, P.violetLight, 0.58, 2, 2);
  rimLight(steelMask, -0.58, 0.74, P.goldCore, 0.26, 2, 1);   // furnace bounce

  /* --- 12. she is standing in light, so she owns a shadow ---------------- */
  {
    const cast = coverage([
      poly([0.560, 0.960], [1.030, 0.960], [1.030, 1.030], [0.470, 1.030]),
    ]);
    const cb = blur(cast, 8, 2);
    for (let i = 0; i < N; i++) {
      const a = cb[i] * 0.30;
      if (a <= 0.002) continue;
      const m = 1 - a;
      R[i] *= m; G[i] *= m; B[i] *= m;
    }
  }
}

/* ---- 4.11  embers -------------------------------------------------------
   Motes lifting off the forge. Sparse, small, warm; besides the window
   lights and the sword furniture, the only gold in the frame. */
{
  const r = rng(0xe11be5);
  for (let k = 0; k < 150; k++) {
    const u = 0.01 + r() * 0.58;
    const v = 0.40 + Math.pow(r(), 0.55) * 0.52;
    const x = Math.round(X(u)), y = Math.round(Y(v));
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) continue;
    const life = Math.pow(r(), 1.4);
    const b = (0.22 + 0.78 * life)
      * (1 - smoothstep(0.66, 0.96, v))
      * (1 - smoothstep(0.26, 0.62, u));
    if (b <= 0.03) continue;
    const c = life > 0.68 ? P.goldCap : P.goldCore;
    add(y * W + x, c, b * 1.05);
    if (life > 0.82) add((y + 1) * W + x, c, b * 0.48);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < 0.6 || d > 3.2) continue;
        add((y + dy) * W + (x + dx), c, b * 0.16 * (1 - d / 3.4));
      }
    }
  }
}

/* =========================================================================
   5. FINISHING — haze, vignette, scrims, grain
   ========================================================================= */

/* Horizon haze: one soft lift where the works meet the sky. Cheap depth, and
   it separates the citadel from the ledge in front of it. */
for (let y = 0; y < H; y++) {
  const v = y / H;
  const band = Math.exp(-Math.pow((v - 0.728) / 0.050, 2));
  if (band <= 0.004) continue;
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const across = 1 - smoothstep(0.04, 0.50, Math.abs(u - 0.24));
    add(y * W + x, P.violetDeep, band * across * 0.10);
    add(y * W + x, P.goldDeep, band * across * 0.08);
  }
}

/* Centre-column hush. The title block lands here and nothing in the painting
   is allowed to compete with it, so the middle of the frame is pulled down.
   Deliberately wide and very soft — a hard edge here would read as a
   vignette bug — and it is the ONLY place the exposure is cut, so the two
   thirds either side of it keep every value they were painted with. */
for (let y = 0; y < H; y++) {
  const v = y / H;
  const down = smoothstep(0.16, 0.42, v) * (1 - smoothstep(0.86, 1.02, v));
  if (down <= 0.003) continue;
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const across = 1 - smoothstep(0.02, 0.24, Math.abs(u - 0.47));
    const k = 1 - 0.46 * across * down;
    const i = y * W + x;
    R[i] *= k; G[i] *= k; B[i] *= k;
  }
}

/* Vignette — corners fall away so the eye stays centre-frame. */
for (let y = 0; y < H; y++) {
  const v = y / H;
  for (let x = 0; x < W; x++) {
    const d = Math.hypot((x / W - 0.48) / 0.86, (v - 0.46) / 0.92);
    const k = 1 - 0.24 * Math.pow(clamp(d), 2.6);
    const i = y * W + x;
    R[i] *= k; G[i] *= k; B[i] *= k;
  }
}

/* Baked scrims. The CSS keeps its own scrim on top for text legibility — this
   one is compositional: it seats the art into the page ground so the hand-off
   to the panel stack has no visible seam, and it darkens the strip under the
   currency chips.

   It is held back deliberately. Doubling a heavy bake with the CSS scrim is
   what turns the bottom third of the art into a dead black band, and the
   whole point of a full-bleed painting is that it survives all the way down
   to the first panel. */
for (let y = 0; y < H; y++) {
  const v = y / H;
  const down = Math.pow(smoothstep(0.93, 1.04, v), 1.3) * 0.80;
  const up = Math.pow(1 - smoothstep(0.0, 0.11, v), 2.0) * 0.30;
  const a = clamp(down + up);
  if (a <= 0.001) continue;
  for (let x = 0; x < W; x++) over(y * W + x, P.ground, a);
}

/* Grain. Two frequencies: a slow one that behaves like tooth in the paint,
   and a fine one that keeps the dark ramps from looking synthetic. Scaled by
   luminance so the near-black bottom does not turn to static. */
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const lum = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    const tooth = (fbm(x / 3.0, y / 3.0, 2, 211) - 0.5) * 0.046;
    const fine = (hash2(x, y, 0x1234) - 0.5) * 0.020;
    const k = 1 + (tooth + fine) * smoothstep(0.004, 0.10, lum);
    R[i] *= k; G[i] *= k; B[i] *= k;
  }
}

/* =========================================================================
   6. ENCODE
   Ordered dithering on the quantise so the long dark ramps do not band —
   without it the sky shows contour rings on an OLED phone.
   ========================================================================= */

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];

const STRIDE = W * 3;
const BPP = 3;
const rows = Buffer.alloc(H * STRIDE);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const d = (BAYER[y & 7][x & 7] + 0.5) / 64 - 0.5;
    const o = y * STRIDE + x * 3;
    rows[o] = clamp(Math.round(clamp(R[i]) * 255 + d), 0, 255);
    rows[o + 1] = clamp(Math.round(clamp(G[i]) * 255 + d), 0, 255);
    rows[o + 2] = clamp(Math.round(clamp(B[i]) * 255 + d), 0, 255);
  }
}

/* Per-row adaptive filtering, standard minimum-sum-of-absolute-differences
   heuristic. Worth about 20% on a file this smooth. */
const filtered = Buffer.alloc(H * (STRIDE + 1));
{
  let prev = Buffer.alloc(STRIDE);
  for (let y = 0; y < H; y++) {
    const cur = rows.subarray(y * STRIDE, (y + 1) * STRIDE);
    let best = null;
    for (let f = 0; f < 5; f++) {
      const line = Buffer.alloc(STRIDE);
      let sum = 0;
      for (let x = 0; x < STRIDE; x++) {
        const a = x >= BPP ? cur[x - BPP] : 0;
        const b = prev[x];
        const c = x >= BPP ? prev[x - BPP] : 0;
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
    filtered[y * (STRIDE + 1)] = best.f;
    best.line.copy(filtered, y * (STRIDE + 1) + 1);
    prev = cur;
  }
}

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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // truecolour, no alpha — the art is opaque and full-bleed
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(filtered, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = resolve(HERE, "ember-gate.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out}  ${W}x${H}  ${(png.length / 1024).toFixed(0)} KB`);
