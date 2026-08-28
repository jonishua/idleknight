#!/usr/bin/env node
/* =========================================================================
   make-wardens.mjs — the 24 Warden sprites, authored at 48x48, shipped 1x.

   ORIGINAL ART. Nothing here is traced from, sampled out of, or derived from
   any reference screenshot. Only the *rules* come from reference/ffvi-art.md:

     - Every channel value is a multiple of 8 (SNES BGR555 / 5-bit colour).
       Validated at build time; the build fails on an off-grid colour.
     - 10-12 colours per sprite: two outline values + a 4-step primary ramp +
       a 3-step secondary + accents + a glint. (FFVI measures 10-12.)
     - Shadows are HUE-SHIFTED toward the cool end, not just darkened.
     - Outlines are tinted toward the creature, never #000000, and they LIFT
       on the key side — a flat keyline all the way round is the single
       clearest giveaway of a modern sprite pretending to be a 16-bit one.
     - Light comes from the upper-left, everywhere, and the shaded side takes
       a bounce rim off the ground so it never dies into a flat mass.
     - No dithering used as texture. It appears on a couple of sprites as a
       single transition row, which is the only job FFVI gives it.

   The grids below carry SHAPE ONLY. Every value decision — which pixel is lit,
   which falls into core shadow, which outline lifts — is made once, by rule,
   in light(). That is how you get one consistent key across 24 creatures
   instead of 24 slightly different guesses, and it is why adding a warden
   costs a silhouette and nothing else.

   Each warden also gets a SEALED variant: the same silhouette rendered as a
   FILLED violet shadow — lit contour, body, occluded core — so a locked cell
   reads as a withheld spirit rather than as unfinished line art. Locked state
   is communicated by SWAPPING THE WHOLE SPRITE — never by putting a CSS
   filter or opacity over the pixel layer, which would emit off-grid colour
   and break the whole illusion.

   THE AXIS LAW (reference/ui-bar.md, "palette discipline"):
     TWO ACCENTS ONLY. Every lit pixel this generator emits lands in the
     violet band (hue 240-300) or the gold band (hue 30-60), or is
     achromatic. A creature's element is carried by VALUE and SILHOUETTE,
     never by hue — there is no green spirit, no teal spirit, no orange
     spirit, because a codex grid that fans across the hue wheel is a gacha
     rainbow and the reference screen is not one.

     This is not a convention the author is trusted to remember. audit()
     decodes every PNG back off disk after the build, bins every lit pixel
     by hue, and exits non-zero on a single stray. A palette check that
     cannot see the pixels is not a palette check.

   Usage:  node src/assets/art/wardens/make-wardens.mjs [--sheet <out.html>]
                                                        [--palette]
           The axis audit always runs and always gates: there is no flag to
           turn it off, because the one thing a colour rule needs is to not be
           optional.
   ========================================================================= */

import { deflateSync } from "node:zlib";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../../../../tools/pixel/png.mjs";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SIZE = 48;

/* reference/ffvi-art.md S1: the SMALLEST monster class is 32x32-48x48, medium is
   ~88x64 and a boss runs 96x96 to 128x160. Wardens are the codex's boss-tier
   collectibles, so 48x48 is the floor, not the ceiling — and it is four times the
   area the first two rounds tried to work in. Every display size downstream is an
   integer multiple of THIS number: x2 in the grid (96), x2 in the sheet (96), x4
   in the Rite (192). Nothing is ever magnified past x4 again. */

/* S2 measures 10-12 distinct colours on a real FFVI sprite. Enforced per sprite
   below, because a 12-slot palette that a sprite only spends 8 of is a 48x48
   canvas being drawn like a 24x24 one. */
const MIN_COLOURS = 10;

/* =========================================================================
   THE TWO-ACCENT AXIS

   Slot vocabulary, shared by every grid so the shapes stay readable:
     .  transparent
     o  outline          (darkest, tinted toward the creature)
     1  2  3             primary ramp   dark -> mid -> light
     4  5  6             secondary ramp dark -> mid -> light
     7  8                accent         deep -> bright
     w  glint            (never pure white on a tinted creature)

   Two further slots are DERIVED per family rather than hand-authored, so
   they can never drift out of step with the ramp they belong to:
     0  core shadow      one rung below 1, hue rotated DOWN-BAND
     O  lit outline      o lifted toward the body, for the key-side contour
   Neither is ever typed into a grid — light() places both.

   ---------------------------------------------------------------------------
   Nothing below is a hand-picked hex any more, and that is the point. Eleven
   hand-authored tables is eleven chances to wander off the axis; the previous
   set managed six hue families and 21 distinct 10-degree bins, which is a
   rainbow with a straight face. Every ramp here is now GENERATED from four
   numbers, and only two of them are allowed to move much:

     hue     pinned inside violet 246-294 or gold 34-56. Never anywhere else.
     chroma  how saturated the body is. This is what separates granite from
             brass at the same lightness.
     key     the body's LIGHTNESS. This is the real workhorse: it is what
             makes Void a near-black mass and Rime a near-white one while
             both of them sit within eight degrees of the same hue.
     accent  the OTHER axis, usually. A violet spirit carrying a gold ember
             and a brass spirit carrying a violet inlay both stay inside the
             two-accent rule while reading as completely different creatures.

   Read the two `key` columns downward and you get a clean six-step and
   five-step value ladder. That ladder is the element system. Hue is not.
   ========================================================================= */

/* Legal hue bands, and the inset we actually author inside so 5-bit snapping
   can never round a colour across a boundary. */
const BANDS = [
  { name: "gold",   lo: 30,  hi: 60  },
  { name: "violet", lo: 240, hi: 300 },
];
const ACHROMATIC = 0.07; // below this saturation a pixel has no meaningful hue

const FAMILY_SPEC = {
  /* --- THE VIOLET AXIS — arcane, spectral, cold. Six steps of value. ----- */

  // The deepest thing in the codex: a near-black mass with an electric core.
  void:    { hue: 276, chroma: 0.74, key: 0.26, side:  +8,
             accent: { hue: 272, chroma: 0.66, lo: 0.44, hi: 0.66 },
             glint:  { hue: 276, chroma: 0.50, l: 0.86 } },

  // Slate violet struck through with gold. The crossover is the whole point:
  // lightning is the one place this palette is allowed to spark warm.
  storm:   { hue: 258, chroma: 0.38, key: 0.34, side: +10,
             accent: { hue:  46, chroma: 0.88, lo: 0.58, hi: 0.80 },
             glint:  { hue:  46, chroma: 0.50, l: 0.86 } },

  // Mauve carrying a lamp. Dusk spirits are the ones with something lit
  // inside them, so the accent is a small warm one against a cool body.
  dusk:    { hue: 280, chroma: 0.46, key: 0.42, side: +10,
             accent: { hue:  42, chroma: 0.80, lo: 0.54, hi: 0.76 },
             glint:  { hue:  46, chroma: 0.52, l: 0.86 } },

  // Periwinkle at midday value — the pale end of the cool ramp.
  tide:    { hue: 254, chroma: 0.42, key: 0.54, side: +12,
             accent: { hue: 262, chroma: 0.46, lo: 0.64, hi: 0.84 },
             glint:  { hue: 258, chroma: 0.46, l: 0.88 } },

  // Ivory that never quite became grey: violet at a chroma so low it reads
  // as bone, with a warm glint where the light catches an edge.
  bone:    { hue: 266, chroma: 0.18, key: 0.60, side:  +8,
             accent: { hue:  42, chroma: 0.48, lo: 0.68, hi: 0.86 },
             glint:  { hue:  44, chroma: 0.50, l: 0.90 } },

  // The high-key end. Rime is bright, not blue — value carries the cold.
  frost:   { hue: 250, chroma: 0.28, key: 0.70, side:  +8,
             accent: { hue: 256, chroma: 0.34, lo: 0.78, hi: 0.94 },
             glint:  { hue: 256, chroma: 0.52, l: 0.92 } },

  /* --- THE GOLD AXIS — forged, living, burning. Five steps of value. ----- */

  // Dark bronze reed. Verdure is carried by stalks, thorns and stilted legs
  // in the silhouette, and by a marsh-light violet accent — not by green.
  verdant: { hue:  42, chroma: 0.68, key: 0.28, side:  +8,
             accent: { hue: 282, chroma: 0.62, lo: 0.52, hi: 0.72 },
             glint:  { hue:  46, chroma: 0.50, l: 0.86 } },

  // Banked coal with a white-hot core. Highest chroma in the set.
  ember:   { hue:  34, chroma: 0.88, key: 0.34, side:  +8,
             accent: { hue:  44, chroma: 0.92, lo: 0.56, hi: 0.78 },
             glint:  { hue:  48, chroma: 0.58, l: 0.90 } },

  // Warm granite. Chroma this low is what "stone" means here; the violet
  // accent is the seam of arcane ore running through it.
  stone:   { hue:  44, chroma: 0.15, key: 0.42, side:  -6,
             accent: { hue: 272, chroma: 0.52, lo: 0.48, hi: 0.68 },
             glint:  { hue:  46, chroma: 0.42, l: 0.84 } },

  // Polished brass with an arcane inlay. Mid value, mid chroma — the most
  // ordinary material in the codex, which is what makes the inlay read.
  cog:     { hue:  40, chroma: 0.44, key: 0.46, side:  +8,
             accent: { hue: 276, chroma: 0.60, lo: 0.50, hi: 0.70 },
             glint:  { hue:  46, chroma: 0.50, l: 0.88 } },

  // Radiant. The high-key end of the warm ramp, and the only creature in the
  // set that is brighter than the panel it sits on.
  dawn:    { hue:  46, chroma: 0.64, key: 0.66, side:  -8,
             accent: { hue:  52, chroma: 0.74, lo: 0.78, hi: 0.92 },
             glint:  { hue:  48, chroma: 0.62, l: 0.94 } },
};

/* ---- colour maths -------------------------------------------------------
   Self-contained on purpose: this generator is the one thing in the project
   that must be readable end to end without chasing an import.
   ------------------------------------------------------------------------ */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Land a channel back on the 5-bit grid the hardware actually had. */
const snap8 = (v) => Math.max(0, Math.min(248, Math.round(v / 8) * 8));

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp01(s);
  l = clamp01(l);
  if (s === 0) { const v = snap8(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const t = (x) => {
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3)].map((v) => snap8(v * 255));
}

/** Inverse, on 0-255 channels. Returns [hue deg, sat 0-1, lightness 0-1]. */
function toHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [NaN, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h * 360, s, l];
}

/* Authored colour has to land a clear margin INSIDE its band, not on the
   boundary. At high lightness 5-bit snapping collapses channels onto the hue
   wheel's primaries — a pale gold quantises to exactly 60deg — and a colour
   sitting on 60.0 is a colour a critic's histogram will bin as "60-69" and
   call a leak. Three degrees of margin costs nothing and removes the argument. */
const EDGE = 3;

/** True when a colour is legal on the two-accent axis. */
function onAxis([r, g, b]) {
  const [h, s] = toHsl([r, g, b]);
  if (!(s >= ACHROMATIC)) return true;           // no hue to be wrong about
  return BANDS.some((band) => h >= band.lo + EDGE && h <= band.hi - EDGE);
}

const bandOf = (h) => BANDS.find((b) => h >= b.lo && h <= b.hi);

/** Keep a hue inside its own band with a 4-degree inset, so 5-bit snapping
    has room to round without crossing a boundary. */
function pin(hue, home) {
  const band = bandOf(home) || BANDS[1];
  const inset = EDGE + 4; // EDGE for the audit, 4 more for what snapping costs
  return Math.min(band.hi - inset, Math.max(band.lo + inset, hue));
}

/* ---- quantisation repair -------------------------------------------------
   5-bit colour is coarse, and it is coarsest exactly where this palette does
   its most important work: down in the core shadows, where a whole channel
   can round away and drag a hue several degrees off where it was authored.
   hsl(247deg) at lightness 0.20 lands on (24,24,72) — 240deg, flat on the
   band edge.

   So we repair rather than hope. Walk the 5-bit neighbourhood of the snapped
   colour and take the nearest candidate that is genuinely inside its band.
   Two rungs in each direction on each channel is plenty — the fix is almost
   always a single 8-step on one channel — and the search is deterministic,
   so the palette is reproducible byte for byte.
   ------------------------------------------------------------------------ */

const NUDGE = [-16, -8, 0, 8, 16];

function intoBand(c) {
  if (onAxis(c)) return c;
  let best = null, bestD = Infinity;
  for (const dr of NUDGE) for (const dg of NUDGE) for (const db of NUDGE) {
    const cand = [snap8(c[0] + dr), snap8(c[1] + dg), snap8(c[2] + db)];
    const [, s] = toHsl(cand);
    // A repair that merely drains the colour to grey is not a repair.
    if (s < ACHROMATIC || !onAxis(cand)) continue;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = cand; }
  }
  if (!best) throw new Error(`cannot pull ${c} back onto the axis`);
  return best;
}

const toHex = (ch) =>
  "#" + intoBand(ch.map(snap8)).map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");

/* ---- ramp construction --------------------------------------------------
   §2 of ffvi-art.md: shadows are HUE-SHIFTED, not multiplied, and highlights
   desaturate rather than running to white. Both still happen here — the only
   change is that the rotation now runs DOWN THE BAND (violet toward its blue
   end, gold toward its red end) instead of off the end of it. The craft rule
   survives; the rainbow does not.
   ------------------------------------------------------------------------ */

const SHIFT = -7; // degrees the hue rotates per rung as a colour darkens

function rung(spec, k, { hue = spec.hue, chroma = spec.chroma } = {}) {
  //  k = -2 core .. 0 body .. +1 highlight
  const l = k <= 0
    ? Math.max(0.055, spec.key * (1 + k * 0.34))
    : spec.key + (1 - spec.key) * 0.34 * k;
  const s = k < 0 ? chroma * (1 + 0.20 * -k) : chroma * (1 - 0.20 * k);
  const h = pin(hue + SHIFT * (k < 0 ? -k : 0.5 * -k), hue);
  return hsl(h, s, l);
}

function buildFamily(spec) {
  const side = pin(spec.hue + spec.side, spec.hue);
  const pal = {
    // primary ramp — the creature's mass
    o: hsl(pin(spec.hue + SHIFT * 2.6, spec.hue), Math.min(0.95, spec.chroma * 1.5),
           Math.max(0.05, spec.key * 0.22)),
    1: rung(spec, -1),
    2: rung(spec,  0),
    3: rung(spec, +1),
    // Secondary ramp — cloth, wing membrane, a second material. It is offset
    // in LIGHTNESS as well as hue, because on the low-chroma families (stone,
    // bone) a hue offset alone quantises straight back onto the primary and
    // the sprite silently loses a whole material.
    4: rung(spec, -1.45, { hue: side, chroma: spec.chroma * 0.80 }),
    5: rung(spec, -0.55, { hue: side, chroma: spec.chroma * 0.74 }),
    6: rung(spec, +0.55, { hue: side, chroma: spec.chroma * 0.66 }),
    // the accent — self-lit, and usually the OTHER axis
    7: hsl(spec.accent.hue, spec.accent.chroma * 1.06, spec.accent.lo),
    8: hsl(spec.accent.hue, spec.accent.chroma, spec.accent.hi),
    // the glint — a tinted near-white, never #F8F8F8 on a coloured creature
    w: hsl(spec.glint.hue, spec.glint.chroma, spec.glint.l),
  };
  return Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, toHex(v)]));
}

const FAMILY = Object.fromEntries(
  Object.entries(FAMILY_SPEC).map(([k, spec]) => [k, buildFamily(spec)])
);
const FAMILY_AXIS = Object.fromEntries(
  Object.entries(FAMILY_SPEC).map(([k, spec]) => [k, bandOf(spec.hue).name])
);

/* Sealed silhouette: three values of the one violet, lit by the same rule as
   the bound sprite. FILLED, not hollow — an outline-only lock reads as line
   art somebody forgot to finish, and with half a codex locked that is what
   collapses a dense grid into mush. A solid violet shadow with a lit contour
   reads instead as a spirit held behind the seal: the silhouette is legible,
   the creature is not, and the whole cell still sits in the violet axis the
   rest of the screen is built on. */
const SEALED_RIM  = "#584090"; // the key-side contour
const SEALED_BODY = "#281848"; // the mass
const SEALED_CORE = "#180828"; // where the form turns away from the light

/* =========================================================================
   THE ROSTER

   `sym` rows are 24 characters — the LEFT half of a frontally-posed spirit.
   The generator mirrors them, which guarantees a 48px row and perfect
   symmetry. `full` rows are 48 characters, for creatures posed in profile.
   ========================================================================= */

const SPRITES = {
  vharnys: {
    family: "void",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      ".......................o",
      "......................o2",
      "......................o2",
      "......................o2",
      "...............oo....o22",
      "..............o22o...o22",
      "..............o22o...o22",
      "..............o22o..o222",
      "........oo...o2222o.o222",
      ".......o22o..o2222o.o222",
      ".......o22o..o2222oo2222",
      ".......o22o.o222222o2222",
      "......o2222oo222222o2222",
      "......o2222oo22222222222",
      ".....o222222222222222222",
      ".....o222222222222222222",
      "....o2222222222222222222",
      "...o22222222222222222222",
      "...o2333w8883333w8883333",
      "...o23338888333388883333",
      "...o22228888222288882222",
      "...o22228888222288882222",
      "...o22255555555555555555",
      "....oooo5555555555555555",
      ".......o5555555555555555",
      ".......o5555511111111111",
      "........o555511111111111",
      "........o5555511w8881111",
      "........o555551188881111",
      ".........o55551188881111",
      ".........o55551188881111",
      ".........o55555177771111",
      "..........o5555111111111",
      "..........o5555111117717",
      "..........o5555111117717",
      "...........o555511117717",
      "...........o555511117717",
      "...........o555511117717",
      "............o55511117717",
      "............o55551111111",
      "............o55551111111",
      ".............o5555555555",
      "..............oooooooooo",
      "........................",
    ],
  },
  orrolek: {
    family: "tide",
    full: [
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      ".......................oo.o.....................",
      "....................ooo22o6o....................",
      "..................oo22222226o...................",
      "...............ooo22222332222o..................",
      "..............o222222333332222oo................",
      "...........ooo222223333333332222o...............",
      "........ooo2222223333333333332222o..............",
      "......oo22222222w8888833333333222o..............",
      "...ooo2222222222888888333333222226o.............",
      "..o2222222222222888888322222222222o.............",
      ".o222222222222228888882222222222222oo...........",
      "..o2222222222222888888222222222222222o..........",
      "..o222w222w222w27777772222222222222222o.........",
      "..o22w255w222w2222222222222222222222222o........",
      "..o111555511155111111222222222222222222o........",
      "...o115555115555111222222222222222222222o.......",
      "....o5555ooo5555ooo22222o2222222222222222o......",
      "....o5555o.o5555o..ooooo.oo22222222222222o......",
      "...o5555o.o5555o...........o22222222222222o.....",
      "...o5555o.o5555o............oo222222222222o.....",
      "..o5555o..o555o..............o2222222222222o....",
      "..o5555o.o5555o...............o2222222222222o...",
      "..o555o..o5555o...............o2222222222222o...",
      "..o555o..o555o.................o222222222222o...",
      "..o555o..o555o.................o2222222222222o..",
      "..o555o..o555o..................o222222222222o..",
      "...o555o.o555o.................o222222222222o...",
      "...o555o..o555o................o222222222222o...",
      "....o55o..o555o................o222222222222o...",
      "....o555o..o555oooooooooooooooo2222222222222o...",
      ".....o55o.oo5552222222222222222222222222222o....",
      ".....o55oo222552222222222222222222222222222o....",
      ".....o1222212255122221222212222122221222222o....",
      "....o2122221225512222122221222212222122222o.....",
      "...o22122221222515555155551555512222122222o.....",
      "..o22212222155551555w7777775555155521222222o....",
      "..o2221225515555155777777777555155551222222o....",
      "...o22212555155551557777777155551555512222o.....",
      "....o221222515555155551555515555155221222o......",
      ".....oo12222122551555515555155521222212oo.......",
      "......o1oo22122221222212222122221222o1o.........",
      "......o1o.oo1oo2212222122221222o1oooo1o.........",
      ".......o....o..oooooooooooooooo.o....o..........",
    ],
  },
  kethrivane: {
    family: "dawn",
    sym: [
      "........................",
      "........................",
      ".....................ooo",
      "..................ooo888",
      ".................o888888",
      "...o............o8888ooo",
      "..o5oo.........o888oo...",
      "..o444ooo.....o888o.....",
      "..o554444ooo..o88o......",
      ".o5555554444oo88o.......",
      ".o55555555oo4488ooo.....",
      ".o555555555ooo88444oo...",
      ".o55555555555o88oo444ooo",
      ".o544455555555o88oo22222",
      ".o5554444555555888o21111",
      ".o55555544445555888w7711",
      "o55555555555444458877711",
      "o55555555555555444277711",
      "o55555555555555555221111",
      "o55444555555555555221111",
      "o55554444555555555221111",
      ".o5555554444555555222222",
      ".o5555555555444455222222",
      "..o555555555555444222222",
      "..o555555555555555222222",
      "...o55555555555552222222",
      "...o55555555555552228w88",
      "....o5555555555552288888",
      ".....o555555555552288888",
      ".....o555555555552228888",
      "......o55555555552222222",
      "......o55555555552222222",
      "......oo5555555552222222",
      ".....o555555555511111111",
      "......o55555555522222222",
      "......o55555555522222222",
      "......o55555555522222222",
      ".......o5555555511111111",
      "........oo55555522222222",
      "..........oooo5522222222",
      "..............oo22222222",
      "...............o11111111",
      "..............o222222222",
      "..............o222222222",
      "..............o222222222",
      "..............o233333333",
      "...............ooooooooo",
      "........................",
    ],
  },
  sulmara: {
    family: "dusk",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "...oo...................",
      "..o55oo.................",
      "..o5555o................",
      "..o55555o...............",
      "..o555555oo..........ooo",
      "..o55555555o......ooo222",
      "...o55oo5555o....o222222",
      "...o55o.o5555o..o2222888",
      "...o55o..o5555oo2w882888",
      ".ooo55o...o5555o28882888",
      "o55555oo...o555228882222",
      "o5555555ooo.oo5222222222",
      "o5555555555oooo222222222",
      "o555o5555555555222222222",
      ".o55o55ooo55555522222222",
      ".o55o55o..ooo55222111111",
      ".o55o55o.....o2222222222",
      ".o555oo......o2222222222",
      "..o55o.oooooo22222555222",
      "..o55oo55555222225552222",
      "..o555555555222255527777",
      "..o555555ooo222255222777",
      "..o555ooo.o2222255222277",
      "..o555o...o2222552222288",
      "...o55o...o22225522228w8",
      "...o55o...o2222552222888",
      "...o555o.o52222552222888",
      "....o55oo552222552222888",
      "....o5555552222552222288",
      "....o55555o2222255222277",
      "....o5555o.o222255222777",
      ".....o555o.o221111111111",
      ".....o555o.o222225552222",
      "......o555o.o22222555522",
      "......o555o..o2222255555",
      ".......o55o..o1111111111",
      ".......o555o..o222222222",
      "........o55o...oo2222222",
      "........o55o.....o222222",
      ".........oo.......ooo222",
      ".....................ooo",
    ],
  },
  ythra: {
    family: "void",
    sym: [
      "........................",
      ".......................o",
      "......................o5",
      ".....................o55",
      "....................o555",
      "...................o5555",
      "..................o55555",
      ".................o555555",
      "................o5555551",
      "...............o55555511",
      "..............o555555111",
      ".............o5555551111",
      "............o55555551111",
      "............o55555511111",
      "............o55555111111",
      "............o55666666666",
      "...........o555444444433",
      "...........o555551111333",
      "...........o555551113333",
      "......oooooo555551133333",
      ".....o66666o555511133333",
      ".....o44444o555511336113",
      "......ooooo5555511331113",
      "..........o5555511331113",
      "..........o5555511333333",
      "..........o5555511333333",
      "..........o5555511333333",
      "......ooooo5533331133388",
      ".....o6666653333331338w8",
      ".....o444443333333313388",
      "......oooo53333333311388",
      ".........o33611333331177",
      ".........o33111333331111",
      "........o533111333331111",
      "........o533333333331111",
      "......ooo533333333331111",
      ".....o6666633w8883331111",
      ".....o444443388883311111",
      "......oo5553338833311111",
      "......o55555333333111111",
      "......o55555533331111111",
      "......o55555511111111111",
      ".....o555555511111111111",
      ".....o555555111111111111",
      ".....o666665111111111111",
      "....o5444445555555555555",
      ".....ooooooo444444444444",
      "............oooooooooooo",
    ],
  },
  corvidge: {
    family: "storm",
    sym: [
      "........................",
      "........................",
      "..o.....................",
      ".o5o....................",
      ".o55o................ooo",
      "o5555oo............oo222",
      "o544555o..........o22222",
      "o5554445oo.......o222222",
      "o555554444oo....o2222222",
      "o55555555444oooow8882222",
      "555555555554444o88882222",
      "554455555555554488882222",
      "555544455555555o88882222",
      "555555444455555522222222",
      "o55555555444555522222222",
      "o55555555554444522222222",
      ".o4455555555554442222222",
      ".o5544455555555552222777",
      "..o555444455555555222888",
      "..o555555444555555522277",
      "..o555555554444555222277",
      "...o55555555554442222277",
      "...o55555555555552222227",
      "....oo555555555552222222",
      "......o55555555522111111",
      "......o55555555522222222",
      ".....o555555555522211111",
      ".....o55555555552222222w",
      ".....o555555555522222288",
      ".....o5o5555555522222222",
      "......o.oo555555o2222228",
      "..........o55555o2222288",
      "........ooo5555oo2222222",
      ".......o555o555o.o222222",
      "........oo5ooo5o..o22222",
      "..........o...o....o2222",
      "...................o2222",
      "...................o2222",
      "....................o222",
      "...................o5555",
      "..................o55555",
      ".................o455554",
      "................o5455554",
      "................o5455554",
      "...............o55545555",
      "..............o555545555",
      ".............o5555545555",
      "..............oooooooooo",
    ],
  },
  pellune: {
    family: "dusk",
    sym: [
      "........................",
      ".............o..........",
      "............owoo........",
      "...........o6ow6o.......",
      "............o66w6o......",
      "....o........o66w6o.....",
      "...o5oo.......o66w6o....",
      "...o555oo......o6666o.oo",
      "...o55555oo.....o6666o22",
      "..o55555555ooo...o662622",
      "..o44555577555oo..ow6822",
      "..o5544477775555ooo88822",
      "..o555544447755555o88822",
      "..o555577844445555588822",
      ".o5555577887744455522222",
      ".o5555577887755544452222",
      ".o5555557777555555542222",
      ".o5555555775555555552222",
      ".o5555775555555555552222",
      "o55557777555555555552222",
      "o54444444444444444442222",
      "o55577777755777755552222",
      ".o5577777757777775552222",
      "..o577777757777775552222",
      "...o57777557777775442222",
      "....o5775557774444452222",
      ".....oo55554444755552222",
      ".....oo4444457755ooo2222",
      "....o444o555555oooo52222",
      ".....ooo.o55oooo55555222",
      "..........ooo55555555111",
      "........oo55555555554222",
      ".......o5555555555544222",
      ".......o5555555554455222",
      ".......o5777755444555111",
      "......o57777774455555222",
      "......o57777444555555222",
      "......o57774475555555222",
      "......o5744777555555o111",
      "......o544777555555oo222",
      ".....o555555555555o.o222",
      ".....o55555555555o..o222",
      ".....o555555ooooo...o111",
      "......oooooo........o222",
      ".....................ooo",
      "........................",
      "........................",
      "........................",
    ],
  },
  nimreth: {
    family: "frost",
    full: [
      "................................................",
      "..........................oo....................",
      ".........................o22o...................",
      ".........................o22o...................",
      "........................o2222o..................",
      "........................o2332o..................",
      ".......................o223322o.................",
      ".......................o223322o.................",
      "......................o22355322o................",
      "......................o22555522o................",
      ".....................o2235555322o...............",
      ".....................o2255555522o...............",
      "....................o22w885555322o..............",
      "....................o228885555522o..............",
      "...................o22588855555522o.............",
      "...................o22588855555522o.............",
      "...................o22355555555322o.............",
      "...................o22257777775222o.............",
      "...................o2222555555222o..............",
      "...................o2222555555222o..............",
      "...................o2222255552222o..............",
      "...................o2222255552222o..............",
      "..................o222222255222222o.............",
      "..................o555522255222222o.............",
      ".................o55555522222222222o............",
      "................o5555555222222222222o...........",
      "...............o55555555222222222222o...........",
      "..............o5555555552222222222222o..........",
      ".............o55555555522211222222222o..........",
      "............o555555552221111112222222o..........",
      "............o555555522111111111222222o..........",
      "...........o5555555211113333333112222o..........",
      "...........o5555522111111111111111222o..........",
      "..........o5555522211111111111111122o...........",
      ".........oo5555522211111111111111122o...........",
      ".......oo666655o22211111111111111122o...........",
      "......o66777766o22211111111111111122o...........",
      ".....o6777777776o2211111333333311122o...........",
      ".....o6778888776o2211111111111111122o...........",
      "....o6778w88887762221111111111111222o...........",
      "....o6778888887762221111111111111222o...........",
      "....o6778888887762221111111111111222o...........",
      "....o677888888776222111111111111122o............",
      ".....o6778888776o222111133333331122o............",
      ".....o6777777776o222111111111111122o............",
      "......o66777766oo222666666666666662o............",
      ".......oo6666oo..ooooo4444444444ooo.............",
      ".........oooo.........oooooooooo................",
    ],
  },
  ossuline: {
    family: "bone",
    sym: [
      "........................",
      ".....................ooo",
      "....................o222",
      "..................oo2222",
      ".................o222222",
      ".................o222222",
      "................o2222222",
      "................o2222222",
      "...............o22222222",
      "...............o21111222",
      "...............o21881222",
      "...............o21881222",
      "...............o21111222",
      "...............o22222222",
      "................o2222222",
      "................o2222222",
      ".................o226226",
      ".................o216116",
      "..................oo1111",
      "....................o222",
      "....................oo55",
      "...................o6666",
      "....................o444",
      "..................oo2225",
      "................oo222225",
      "..............oo22222266",
      "............oo222222o444",
      "..........oo222222oooo55",
      ".........o222222oooo2225",
      "........o22222oooo222226",
      "........o222ooo222222w88",
      "........o222o222222o8888",
      "........oo2222222ooo8888",
      ".......o2222222oo.oo2888",
      "......o222222oo.oo222224",
      "......o222ooo.oo22222255",
      "......o222o.oo222222oo55",
      ".......o222o22222ooo6666",
      ".......o2222222oo..o2224",
      ".......o22222oo..oo22225",
      ".......o222oo..oo2222255",
      ".......o222o..o222226666",
      "........o222oo22222oo444",
      "........o22222222oo..o55",
      ".........o22222oo....o55",
      "..........o222o......o55",
      "..........o222o.......oo",
      "...........o222o........",
    ],
  },
  lorquin: {
    family: "tide",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      ".........o..............",
      ".......oo2o.............",
      "....ooo222o.............",
      "..oo2222222o............",
      ".o222222222o............",
      "o2222222222o............",
      "o2w222222oo2o...........",
      ".o222oooo.o2o...oooo....",
      ".o2oo......o...o2222o...",
      ".o2o..........o22w882o..",
      "..o2o...ooo...o228882o..",
      "..o2oooo222o..o228882o..",
      "..o22222222o..o222222o..",
      ".o2222222222o..o2222o...",
      ".o2222222222o...o555oooo",
      ".o2111111122o...o5552222",
      "..o2222222oo.ooo25552222",
      "..o22555oo..o22225555555",
      "...ooo555o.o226555655565",
      "......o555o2265556555655",
      ".......o5522255655565556",
      "........o222555555555555",
      "........o222555555555555",
      ".......o2222255555555555",
      ".......o2222225555555777",
      ".......o2222222555557777",
      ".......o2222222222255777",
      "........o222222222222222",
      "........o222222222222222",
      ".........o22211111111111",
      "......ooo552222222222222",
      ".....o555552222222222222",
      "....o55555o2222222222222",
      "....o555oo55222111111111",
      "....o5555555222222222222",
      "...oo5555555oooooooooooo",
      "..o5555555ooo555o.......",
      "..o555o555555555o.......",
      "..o555o5555555oo........",
      "..oo5555555ooo..........",
      ".o555555ooo.............",
      ".o555555o...............",
      ".o555o55o...............",
    ],
  },
  mirevail: {
    family: "dusk",
    sym: [
      "........................",
      ".....................ooo",
      "...................oo555",
      "..................o55555",
      ".................o5555oo",
      ".................o55oo..",
      "................o55o....",
      "................o55o....",
      "................o55o....",
      "................o55o....",
      ".................o55oooo",
      ".................o555555",
      "..................o55555",
      "...............oooooo555",
      "..............o222222222",
      "..............o233333333",
      "..............o222222222",
      ".............oo222222222",
      "............o55554555555",
      "............o55554555555",
      "............o55554555555",
      "............o55574777777",
      ".............o5574777777",
      ".............o5574777788",
      ".............o5574777888",
      ".............o55547788w8",
      ".............o5554778w88",
      ".............o4444444444",
      ".............o6666666666",
      ".............o5554788888",
      "..............o554788888",
      "..............o554788888",
      "..............o554788888",
      "..............o554788888",
      "..............o554778888",
      "..............o554778888",
      "..............o554778888",
      "...............o54777888",
      "...............o54555588",
      "...............o54555555",
      "..............oo54555555",
      ".............o2333333333",
      ".............o2222222222",
      ".............o2222222222",
      ".............o2222222222",
      "..............ooooooo222",
      "....................o222",
      ".....................ooo",
    ],
  },
  tallow: {
    family: "dusk",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      ".......................o",
      "......................o8",
      "......................o8",
      ".....................o88",
      ".....................o88",
      "....................o88w",
      "....................o88w",
      "...................o8877",
      "...................o8877",
      "..................o88877",
      "..................o88777",
      "...................o8777",
      "....................o871",
      ".....................o81",
      ".....................o11",
      "................oooooo11",
      "...............o33333311",
      "..............o333333311",
      "..............o333355333",
      "...............o25555222",
      "...............o25555222",
      "...............o25555222",
      "...............o25555222",
      "...............o25555222",
      "...............o25w88222",
      "...............o25888222",
      "...............o25888222",
      "...............o25888222",
      "..............o225522222",
      "..............o225522222",
      "..............o222222222",
      "..............o222222777",
      "..............o222227777",
      "..............o222222222",
      "..............o222222222",
      "..............o222222222",
      "..............o222222222",
      "..............o222222222",
      "............ooo222222222",
      "...........o555555555555",
      "..........o5555555555555",
      ".........o55555555555555",
      "..........oooooooooooooo",
      "........................",
    ],
  },
  quillow: {
    family: "storm",
    full: [
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "...............oo...............................",
      "..............o33o....o.........................",
      "..............o33o...o5o........................",
      "..............o33o...o5o.....................o..",
      ".............o3333o.o555o...................o5o.",
      ".............o3333oo5555o..................o55o.",
      ".............o3333oo5555o.................o556o.",
      "............o33333355555o................o5564o.",
      "............o33333355555o...............o55645o.",
      "............o333335555555o.............o556445o.",
      "...........o3333333355555o............o556446o..",
      "............oo22222oooo55o............o564466o..",
      "............o222222o...oo............o5644666o..",
      "...........o22222222o...............o56446665o..",
      "..........o222222222o..............o564466665o..",
      ".........o22222222222ooooooooo....o5544566665o..",
      "........o2w8822222222222222222oooo55445555555o..",
      ".......o2288822222333322222222222554455555555o..",
      "......o2228882222222233333322222255455555555o...",
      ".....o1222222222222222222233333322455555555o....",
      "......o11222222222222222222222233335555555o.....",
      ".......o11222222222222227w7777722255555555o.....",
      ".......o111122222221112227777722222555555o......",
      "........o11111222o2111111112222222255555o.......",
      ".........o111112oo2111111111111122225555o.......",
      "..........o111oo.o211111111111111112555o........",
      "...........ooo...o22111111111111111255o.........",
      "..................oo22222111111111122o..........",
      "...................o44442111112222212o..........",
      "...................o2222444444422221o...........",
      "...................o22222ooooo244441o...........",
      "...................o22222o...o22222o............",
      "..................o222222o...o22222o............",
      "..................o22222o....o22222o............",
      "..................o22222o....o22222o............",
      "..................o22222o....o22222o............",
      "..................o22222o....o22222o............",
      "..................o22222o....o22222o............",
      "..................ooo222oo...ooo222oo...........",
      ".................o33333333o.o33333333o..........",
      "..................oooooooo...oooooooo...........",
      "................................................",
      "................................................",
    ],
  },
  draimund: {
    family: "cog",
    sym: [
      "........................",
      "......................oo",
      "....................oo55",
      "...................o5555",
      "..................o555oo",
      "..................o55o..",
      ".................o55o...",
      ".................o55o...",
      ".................o55o...",
      ".................o55o...",
      "..................o55ooo",
      "..................o55222",
      "...................o5222",
      "....................o222",
      "...................oo222",
      "..................o22222",
      ".................o222222",
      ".................o222233",
      "................o2222233",
      "................o2222333",
      "...............o22222333",
      "...............o22222333",
      "...............o22222333",
      "..............o222223333",
      "..............o222266666",
      ".............o2222666666",
      ".............o2222444444",
      "............o22222244444",
      "............o22222233333",
      "...........o222222233333",
      "...........o222222333333",
      "..........o2222222333333",
      "..........o2222222333333",
      "..........o2222222333333",
      ".........o22222223333333",
      ".........o22222223333333",
      "........o222222222222222",
      ".......o5555555555555555",
      ".......o5577555775557755",
      ".......o5577555775557755",
      ".......o5577555775557788",
      ".......o5577555775558888",
      ".......o5111111111188w88",
      "........oo11111111188888",
      "..........o1111111188888",
      "...........o111111188888",
      "............oooooooo8888",
      "....................oo88",
    ],
  },
  baskarel: {
    family: "ember",
    full: [
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      ".............o..................................",
      "............o2o......o..........................",
      "............o2o.....o1o.........................",
      "...........o222o....o1o.....................oo..",
      "...........o222o..oo111ooo.................o55o.",
      "...........o2222oo88w88877oooooo..........o5555o",
      "...........o22222o77888888888w77oo........o5555o",
      "...........o2222277777788888888888oooo....o5555o",
      "..........o222227777777777788888888888o...o55555",
      "..........o2222777777777777777777777oo....o55655",
      "..........o22277777777777777777777777o....o55655",
      "...........oo7777777777777777777777777o...o56555",
      "..........ooo77777777777777777777777777o..o56555",
      "........oo2222777777777777777777777777o..o556555",
      ".....ooo222222277777777777777777777777ooo5566555",
      "...oo22222222222777777777777777777777oo555565555",
      "..o22222w882222222222222227777777777oo5555565555",
      ".o222222888222222222222222222222222225555565555o",
      ".o22222288822222222222222222222222225555556555o.",
      ".o2222222222222222222222222222222222555555555o..",
      "..ow22w22222222222222222222222222222555555555o..",
      ".o111111111122222222222222222222222255555555o...",
      "..o222oooooo2222222222222222222222222555555o....",
      "...ooo......oo2222222222222222222222225555o.....",
      ".............o2222222222222222222222222ooo......",
      ".............o2222222222222222222222222o........",
      ".............o2211111111111111111111112o........",
      ".............o5555552222222222255555552o........",
      ".............o555511111111111111111155o.........",
      ".............o555555o44444o4444o555555o.........",
      ".............o555555o44444o4444o555555o.........",
      "............o5555555444444o4444o5555555o........",
      "............o555555o44444oo4444o5555555o........",
      "............o555555o44444oo4444oo555555o........",
      "............o5555554444444ooooo.o555555o........",
      "...........o66666664444444o....o66666666o.......",
      "..........o666666664444444o...o6666666666o......",
      "..........o6666666666ooooo....o6666666666o......",
      "...........oooooooooo..........oooooooooo.......",
      "................................................",
    ],
  },
  tessivar: {
    family: "cog",
    sym: [
      "........................",
      "........................",
      ".......................o",
      "......................o8",
      ".....................o88",
      "....................o88w",
      "...................o88ww",
      "...................o88ww",
      "....................o88w",
      ".....................o88",
      "............ooooooooooo8",
      "...........o222222222222",
      "..........o2222222222222",
      ".........o22222222222222",
      "........o22w623333333333",
      ".......o2226633333333333",
      ".......o2222333555555555",
      ".......o2223335555555555",
      ".......o2223355555555555",
      ".......o2223355555555555",
      ".......o2223355588888888",
      ".......o2223355577777777",
      ".......o2223355555555555",
      ".......o2223355555555555",
      ".......o2223355577777777",
      ".......o2223355577777777",
      ".......o2223355555555555",
      ".......o2223355555555555",
      ".......o2223355588888888",
      ".......o2223355577777777",
      ".......o2223355555555555",
      ".......o2223355555555555",
      ".......o2223355577777777",
      ".......o2223355577777777",
      ".......o2223355555555555",
      ".......o2223355555555555",
      ".......o2223355577777777",
      ".......o2223355577777777",
      ".......o2223335555555555",
      ".......o2222333555555555",
      ".......o2222233333333333",
      "........o226623333333333",
      ".........o26622222222222",
      "..........o2222222222222",
      "...........o221111111111",
      "............oooooooooooo",
      "........................",
      "........................",
    ],
  },
  halvane: {
    family: "verdant",
    full: [
      "..............................................o.",
      ".............................................owo",
      "...........................................oo78o",
      "........................................ooo778o.",
      "......................................oo777ooo..",
      "............................ooo.....oo777oo.....",
      ".......................ooooo222o.ooo777oo.......",
      "...................oooo22222222oo777ooo.........",
      "...............oooo66222w882222277oo......oooo..",
      "..........ooooo66666622288822222oo..oooooo7778o.",
      "......oooo66666666666o2288822222oooo7777777o8o..",
      "....oo666666666666666o22222222227777ooooooo.o...",
      "...o66666666666666666o22222222222ooo............",
      "....o4444444444444444oo22222222oo...............",
      ".....o6666ooooooooooo.o2222222o.................",
      "......oooo.............o22222o..................",
      "......................o222222o..................",
      ".....................o222222o...................",
      "....................o222222o....................",
      "....................o222222ooo..................",
      "...................o2222222222o.................",
      "................ooo222222222222o................",
      "...............o2222222222222222o...............",
      "...............o22222222222222222ooo............",
      "..............o222333333333333333555oooooo......",
      "..............o222222222222222222555555555ooo...",
      "..............o222222222222222222555555555555o..",
      "..............o222222222222222222555555555555o..",
      ".............o2222222222222222555555555555555o..",
      ".............o222222225555555555555555555555o...",
      ".............o222255555555554444445555555555o...",
      "..............o22255444444444555555oooo55555o...",
      "...............o2225555555555555555o...ooooo....",
      "...............o22255555555544444444o...........",
      "................o2254444444445555555o...........",
      "................o2225555555555555555o...........",
      ".................o225555555522222ooo............",
      "..................o22222222222222o..............",
      "...................oo666ooooo666o...............",
      "....................o666o...o666o...............",
      "....................o666o...o666o...............",
      "....................o666o...o666o...............",
      "....................o666o...o666o...............",
      "....................o666o...o666o...............",
      "....................o666o...o666o...............",
      "...................oo666ooooo666ooo.............",
      "..................o4444444444444444o............",
      "...................oooooooooooooooo.............",
    ],
  },
  delvarn: {
    family: "stone",
    full: [
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      ".............................ooooo..............",
      "......................ooooooo22222o.............",
      "..........o....ooooooo2222222222222o............",
      ".........o2oooo22222227w777777772222o...........",
      "........o2222222222222227777777777222ooo........",
      ".......o22222222222222222222222222221111o.......",
      "......o222222222222222222222211111111111o.......",
      ".....o222222w8882222221111111111111111111o......",
      "....o2222222888822111111111111111111111112o.....",
      "...o221222228888221111111111111111111333322o....",
      "..o2211222228888222111111111133333333333332o....",
      ".o21111122222222222111333333333333333333335o....",
      "o2111111222222222233333333333333333333222255o...",
      "211111112222222222333333333333322222222222555o..",
      "1111111122222222222333322222222222222222255555o.",
      "o1111111122222222222222222222222222222111555555o",
      "o1111111122222222222222222222111111111111555555o",
      ".o111111222222222222211111111111111111111555555o",
      "..o11w2662222222211111111111111111111122225555o.",
      ".oo166666111111221111111111111222222222222o555o.",
      "o66666446ooo222222111122222222222222222222ooo5o.",
      "66664446oooo662222222222222222222222222222o..o..",
      "66446666o666662222222222222222222222222222o.....",
      "66666666666446o222662222222222222222oooooo......",
      "6666o66664446oo666655555oooooooooooo............",
      "ooooo6644666666664455555o...o55555o.............",
      "....o6666666666444655555o...o55555o.............",
      "....o6666oo6644666555555o...o55555o.............",
      ".....oooo.o6666666555555o..o555555o.............",
      "..........o6666ooo555555o..o555555o.............",
      "...........oooo..o555555o..o555555o.............",
      "..................ooo555o..o555555o.............",
      ".................o4444444o..ooo555o.............",
      "..................ooooooo..o4444444o............",
      "............................ooooooo.............",
    ],
  },
  ashquill: {
    family: "ember",
    full: [
      "................................................",
      ".....................o..........................",
      "....................o6o.........................",
      "...................o666o........................",
      ".................oo66666o.......................",
      "...............oo2266666o.......................",
      "..............o2226666666o......................",
      ".............o222666666662o.....................",
      "............o22222222666662o....................",
      "...........o2222222222222222o...................",
      "...........o22w8882222222222o...................",
      "..........o222888822222222222o..................",
      "..........o222888822222222222o..................",
      ".......ooo7222888822222222222o..................",
      "....ooo7777222222222222222222o..............o...",
      "...o7777777222222222222222222o.............o5o..",
      "...o7w77777888822222222222222o............o554o.",
      "....ooo7777o2222222222222222o............o5545o.",
      ".......ooo7o2222222222222222o...........o55455o.",
      "..........o.o222222222222222o..........o554555o.",
      "............o2222222222222222o........o55455555o",
      "...........o222222222222222222o......o554555555o",
      "..........o22222222222225522222o....o5545555555o",
      ".........o2222222222555555222222o..o5545555555o.",
      ".........o2222225555555555444222o.o5545555555o..",
      ".........o2222555555554444422222oo5545555555o...",
      "........o2222255544444455552222225545555555o....",
      "........o222225444555555555222225545555555o.....",
      "........o222222w8888888855444225545555555o......",
      "........o2222288888888888445225555555555o.......",
      "........o222228888888888855522555555555o........",
      "........o22222288888888855444225555555o.........",
      ".........o222225777777744445522555555o..........",
      ".........o22222557777745555552255555o...........",
      ".........o2222244455555555522222555o............",
      "..........o22222555555522222222o55o.............",
      "...........o222255222222222222o.oo..............",
      "............o2222222222222222o..................",
      ".............o22222222222222o...................",
      "..............o222222226662o....................",
      "...............o6662222666o.....................",
      "...............o666oooo666o.....................",
      "...............o666o..o666o.....................",
      "...............o666o..o666o.....................",
      "...............o666o..o666o.....................",
      ".............ooo666oooo666oooo..................",
      "............o44444444444444444o.................",
      ".............ooooooooooooooooo..................",
    ],
  },
  verrow: {
    family: "verdant",
    sym: [
      "........................",
      "........................",
      ".................o......",
      "................o2o.....",
      "................o2o.....",
      "................o22o....",
      ".................o2o....",
      ".................o2ooooo",
      "......o.........oo222222",
      ".....o2o......oo22222222",
      "......o2o....o2222225555",
      ".......o2o.oo22225555555",
      "........o2o2222555552222",
      ".........o2665555222oooo",
      "........o26666522ooo....",
      "........o2666622o.......",
      ".......o225662oo........",
      "......o222552o..........",
      "......o225522o..........",
      "ooo..o225552o.........oo",
      "222ooo22552o........oo77",
      "oo222222552o.......o7777",
      "..ooo222522o......o77777",
      "....o22552o.......o777w8",
      "....o22552o......o777888",
      "....o22552o......o777888",
      "....o22552o......o777888",
      "....o22552o......o777888",
      "....o22662o.......o77788",
      "....o266662o......o77777",
      "..ooo266662o.......o7777",
      "oo222226652o........oo77",
      "222ooo225552o.........oo",
      "ooo...o225522o..........",
      "......o222552o..........",
      ".......o225552oo........",
      "........o2255522o.......",
      "........o22255522ooo....",
      ".........o2225555222oooo",
      ".........o22222555662222",
      "........o2ooo22226666555",
      ".......o22o..o2226666555",
      "......o2oo....oo22662222",
      ".....o2o......ooooo22222",
      "......o......o1111111111",
      "..............ooo1111111",
      ".................o22oooo",
      ".................o2o....",
    ],
  },
  cindren: {
    family: "ember",
    sym: [
      "........................",
      "........................",
      "........................",
      ".......................o",
      "......................o8",
      ".....................o88",
      ".....................o88",
      "....................o888",
      "....................o88w",
      "...................o888w",
      "..................o88877",
      "..................o88877",
      ".................o888877",
      ".................o888777",
      "..................o88777",
      "...................o8877",
      "...................o8222",
      "..................o22222",
      ".................o222222",
      "................o2222222",
      "................o2222222",
      "...............o22222222",
      "...............o222w7722",
      "...............o22277722",
      "...............o22277722",
      "...............o22277722",
      "...............o22222222",
      "................o2222222",
      "................o2222222",
      ".................o222111",
      "..................o22211",
      "..................ooo665",
      ".................o111111",
      "..................o55565",
      ".................o555565",
      "................o5555444",
      "..............oo5555o665",
      ".............o5555ooo665",
      "............o5555o..o665",
      "...........o5555o...o665",
      "...........o555o....o444",
      "..........o555o.....o665",
      "..........o55o......o665",
      ".........o555o......o665",
      ".........o555o......o444",
      ".........o55o.......o665",
      "..........oo........o665",
      ".....................ooo",
    ],
  },
  kellow: {
    family: "verdant",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "............oooooo......",
      "...........o222222o.....",
      "..........o22222222o....",
      ".........o2228888222o...",
      "........o222888888222o..",
      ".......o22288w88888222o.",
      ".......o22288888888222o.",
      ".......o22288888888222oo",
      ".......o2228888888822222",
      ".......o2222111111122222",
      ".......o2222288882222222",
      "........o222222222227777",
      "........o222222222277777",
      ".......o2222222222222222",
      "......o22222222222222222",
      ".....o222222222222222222",
      ".....o222222222222222222",
      "....o2111111111111111111",
      "....o1111111111111111111",
      "....o2666666666666655555",
      "....o2222222222255555555",
      "....o2222222225555555555",
      "....o2222222255555555555",
      ".....o222222555555555555",
      ".....o222222554444444444",
      "....o2222222555555555555",
      "....o2222222555555555555",
      "....o2222222254444444444",
      "....o2222222225555555555",
      "....o2222222222255555555",
      "....o2222222222222255555",
      ".....oow666ow666ow666222",
      "......o6666o6666o6666ooo",
      "......o6666o6666o6666o..",
      ".......oooo.oooo.oooo...",
    ],
  },
  nettlejack: {
    family: "verdant",
    sym: [
      ".......................o",
      "......................o5",
      ".....................o55",
      "....................o555",
      "...................o5555",
      "..................o55555",
      ".................o555554",
      "................o5555544",
      "...............o55554454",
      "..............o5o5444545",
      ".............o5oo4455445",
      ".............oo445555455",
      "............o54455554455",
      "............o55o55544555",
      "...........o555555545555",
      "...........o5555554o5555",
      "..........o55555544o5555",
      "..........o5555554o5555o",
      ".........o55555555o555oo",
      "..........oo555555555222",
      "............ooooo5522222",
      ".oooo..........o11111111",
      "o6666o........o111111111",
      "666666o........o22222222",
      "666666o........o22222222",
      "o6666ooo......o222w88222",
      ".oo56666o.....o222888222",
      "..o666666o....o222888222",
      "..o666666o....o222888222",
      "...o6666o.....o222222222",
      "....o555o.....o222222222",
      "....o5555o.....o22222222",
      ".....o5555oo...o22222777",
      "......o55555o...o2222277",
      ".......o55555o...o222222",
      "........oo5555oo.oo22222",
      "..........o55555o1111111",
      "...........oo55552222222",
      ".............o5552222222",
      "..............oo22222222",
      "...............o22222222",
      "..............o222222777",
      "..............o222227777",
      "..............o222222777",
      ".............o2222222222",
      ".............o2222222222",
      "..............o111111111",
      "...............ooooooooo",
    ],
  },
  dunmoss: {
    family: "stone",
    sym: [
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      ".....................ooo",
      "...................oo222",
      ".................oo22222",
      "...............oo2222222",
      ".............oo222222233",
      "...........oo22222223333",
      "..........o2222223333333",
      ".........o22222333333333",
      "........o222233333333333",
      ".......o2222333333333333",
      "......o22222333333333333",
      ".....o222222233333333333",
      "....o2222222233333333333",
      "....o2222222233333333333",
      "....o2222222233333333333",
      "....o2222222223333333333",
      "....o2222222223333222222",
      "...o22222222222222222222",
      "...o22222222w88888882222",
      "...o22222222888888882222",
      "...o22222222111111112222",
      "...o22222222111111112222",
      "...o22222222225555555555",
      "...o55555555555555555555",
      "..o255555555552222222222",
      "..o222211112222222222222",
      "..o222111111222222222222",
      "..o222111111222222222222",
      "..o222211112222222222222",
      "...o22222222222222222222",
      "...o22222222222222222222",
      "...o22222222225555555555",
      "...o55555555555555555555",
      "...o55555555551111222222",
      "....o2222222211111122222",
      ".....o222222211111122222",
      ".....o222222221111222222",
      "......o22222222222222222",
      "......o22222222222777777",
      "......o22222222277777777",
      ".......o2222222222222222",
      "........oo11111111111111",
      "..........oooooooooooooo",
    ],
  },
};

/* =========================================================================
   ENCODER
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

/* ---- derived slots ------------------------------------------------------
   Both are computed from the family ramp rather than hand-picked, which is
   the only way 11 palettes stay in step with each other.
   ------------------------------------------------------------------------ */

/** Core shadow: one rung under `1`, rotated further down its own band.
    A shadow that is merely a darker copy of the midtone is the flattest thing
    a sprite can do — FFVI rotates the hue on the way down and that is most of
    the depth. The rotation used to run channel-wise toward blue, which walked
    a gold creature's core shadow clean out of the gold band and into red.
    Doing it in HSL keeps the craft and loses the leak. */
const deepShadow = (hex) => {
  const [h, s, l] = toHsl(rgb(hex));
  if (!(s >= ACHROMATIC)) return toHex(hsl(0, 0, Math.max(0.045, l * 0.52)));
  return toHex(hsl(pin(h + SHIFT * 1.4, h), Math.min(0.95, s * 1.18), Math.max(0.045, l * 0.52)));
};

/** Key-side outline: `o` lifted halfway toward the body colour. Both ends sit
    in the same band, so the midpoint does too. */
const litOutline = (oHex, bodyHex) => {
  const a = rgb(oHex);
  const b = rgb(bodyHex);
  return toHex([0, 1, 2].map((i) => snap8((a[i] + b[i]) / 2)));
};

/** The 5-bit rule from ffvi-art.md §0, enforced rather than trusted. */
function assertFiveBit(where, hex) {
  for (const c of rgb(hex)) {
    if (c % 8 !== 0) throw new Error(`${where}: ${hex} is off the 5-bit grid (channel ${c})`);
  }
}

/** The axis law, enforced rather than trusted. */
function assertOnAxis(where, hex) {
  const c = rgb(hex);
  if (!onAxis(c)) {
    const [h, s] = toHsl(c);
    throw new Error(
      `${where}: ${hex} is off the two-accent axis — hue ${h.toFixed(0)}deg at ` +
      `saturation ${s.toFixed(2)}. Legal: violet 240-300, gold 30-60, or achromatic.`
    );
  }
}

function encodePNG(pixels, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const p = pixels[y * w + x];
      const o = rowStart + 1 + x * 4;
      if (!p) { raw[o] = raw[o + 1] = raw[o + 2] = raw[o + 3] = 0; continue; }
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* =========================================================================
   BUILD
   ========================================================================= */

/** Mirror a 24-char left half into a 48-char row. */
function mirror(left, id, y) {
  if (left.length !== 24) {
    throw new Error(`${id} row ${y}: symmetric halves must be exactly 24 chars, got ${left.length} ("${left}")`);
  }
  return left + [...left].reverse().join("");
}

/* -------------------------------------------------------------------------
   LIGHTING PASS

   The grids above carry SHAPE. Light is applied here, once, by rule — which
   is how you get a consistent upper-left key across 24 creatures instead of
   24 slightly different guesses.

   The key direction is normalised to each creature's OWN bounding box rather
   than to the 48x48 cell. That matters more than it sounds: on the absolute
   x+y diagonal a small sprite like the Match Sprite sits entirely inside one
   band and comes out flat, while a sprite that fills the cell gets the whole
   ramp. Normalised, every creature gets the same four-band read at whatever
   size it happens to be.

     t = 0   upper-left of the form, facing the light
     t = 1   lower-right, turned away

     t < 0.30   highlight band      +1
     t < 0.56   midtone              0
     t < 0.78   terminator          -1
     else       core shadow         -2

   Two contour rules sit on top of the bands:

     - KEY RIM. A pixel on the upper-left contour steps up one more. This is
       the specular edge that makes a mass read as round.
     - BOUNCE. A pixel on the lower-right contour, already in shadow, steps
       back UP one. Light coming off the ground under the creature. Without
       it the shaded half dies into a single flat value, which is the exact
       failure that makes 24 sprites in a grid read as mush.

   Outlines take part too: on the key side they lift to `O`. A uniform
   keyline all the way round a sprite is the clearest tell of pixel art made
   by someone who has only ever looked at pixel art from a distance.

   Accents (7/8) and the glint (w) are self-lit and never shaded — a lantern
   core does not fall into its own shadow.
   ------------------------------------------------------------------------- */

const RAMPS = [["0", "1", "2", "3"], ["4", "5", "6"]];
const SELF_LIT = new Set(["7", "8", "w"]);

function stepRamp(ch, delta) {
  if (delta === 0) return ch;
  for (const r of RAMPS) {
    const i = r.indexOf(ch);
    if (i !== -1) return r[Math.max(0, Math.min(r.length - 1, i + delta))];
  }
  return ch;
}

/** Tight bounding box of the drawn pixels, so light() can normalise to it. */
function bounds(rows) {
  let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (rows[y][x] === ".") continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("empty sprite grid");
  return {
    minX, minY,
    spanX: Math.max(1, maxX - minX),
    spanY: Math.max(1, maxY - minY),
  };
}

const HILIGHT = 0.30;
const TERM_1  = 0.56;
const TERM_2  = 0.78;
const RIM_MAX = 0.62;  // how far round the form the key light still reaches
const BOUNCE_MIN = 0.52;

function light(rows) {
  const solid = (x, y) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && rows[y][x] !== ".";
  const { minX, minY, spanX, spanY } = bounds(rows);

  return rows.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === ".") return ch;

        const t = ((x - minX) / spanX + (y - minY) / spanY) / 2;
        const keyEdge  = !solid(x - 1, y) || !solid(x, y - 1);
        const backEdge = !solid(x + 1, y) || !solid(x, y + 1);

        if (ch === "o") return keyEdge && t < RIM_MAX ? "O" : "o";
        if (SELF_LIT.has(ch)) return ch;

        let delta = 0;
        if (t >= TERM_2) delta -= 2;
        else if (t >= TERM_1) delta -= 1;
        else if (t < HILIGHT) delta += 1;

        if (keyEdge && t < RIM_MAX) delta += 1;
        else if (backEdge && t >= BOUNCE_MIN) delta += 1;

        return stepRamp(ch, delta);
      })
      .join("")
  );
}

function gridOf(id, spec) {
  const rows = spec.sym
    ? spec.sym.map((r, y) => mirror(r, id, y))
    : spec.full.map((r, y) => {
        if (r.length > SIZE) {
          throw new Error(`${id} row ${y}: ${r.length} chars, max ${SIZE} ("${r}")`);
        }
        return r.padEnd(SIZE, ".");
      });
  if (rows.length !== SIZE) throw new Error(`${id}: ${rows.length} rows, expected ${SIZE}`);
  return rows;
}

mkdirSync(OUT_DIR, { recursive: true });

const built = [];
let colourCount = 0;

for (const [id, spec] of Object.entries(SPRITES)) {
  const base = FAMILY[spec.family];
  if (!base) throw new Error(`${id}: unknown palette family "${spec.family}"`);

  // Derive the two rule-placed slots, then validate the WHOLE palette —
  // including what we just computed. snap8 is only trustworthy if the same
  // assertion that guards the hand-authored hexes also guards its output.
  const pal = { ...base, 0: deepShadow(base[1]), O: litOutline(base.o, base[1]) };
  for (const [slot, hex] of Object.entries(pal)) {
    assertFiveBit(`${id}.${slot}`, hex);
    assertOnAxis(`${id}.${slot}`, hex);
  }

  const rows = light(gridOf(id, spec));

  // --- bound sprite ------------------------------------------------------
  const pixels = new Array(SIZE * SIZE).fill(null);
  const solid = new Uint8Array(SIZE * SIZE);
  const used = new Set();

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      if (!(ch in pal)) throw new Error(`${id} (${x},${y}): unknown slot "${ch}"`);
      pixels[y * SIZE + x] = rgb(pal[ch]);
      solid[y * SIZE + x] = 1;
      used.add(ch);
    }
  }
  if (used.size < MIN_COLOURS) {
    throw new Error(
      `${id}: only ${used.size} colours — reference/ffvi-art.md S2 measures 10-12 on a ` +
      `real FFVI sprite, and this canvas has the room. Give it a second material, an ` +
      `accent or a glint.`
    );
  }
  colourCount += used.size;

  writeFileSync(resolve(OUT_DIR, `${id}.png`), encodePNG(pixels, SIZE, SIZE));

  // --- sealed silhouette -------------------------------------------------
  // Same shape, same key light, three values of the one violet. FILLED, so a
  // locked cell reads as a spirit behind the seal rather than as an unfinished
  // outline. State changes are communicated by swapping the sprite, never by a
  // filter over the pixels.
  for (const [k, hex] of [["rim", SEALED_RIM], ["body", SEALED_BODY], ["core", SEALED_CORE]]) {
    assertFiveBit(`sealed.${k}`, hex);
    assertOnAxis(`sealed.${k}`, hex);
  }
  const sRim = rgb(SEALED_RIM);
  const sBody = rgb(SEALED_BODY);
  const sCore = rgb(SEALED_CORE);

  const { minX, minY, spanX, spanY } = bounds(rows);
  const sealed = new Array(SIZE * SIZE).fill(null);
  const at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : solid[y * SIZE + x]);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!solid[y * SIZE + x]) continue;
      const t = ((x - minX) / spanX + (y - minY) / spanY) / 2;
      const keyEdge = !at(x - 1, y) || !at(x, y - 1);
      sealed[y * SIZE + x] =
        keyEdge && t < RIM_MAX ? sRim : t >= 0.66 ? sCore : sBody;
    }
  }
  writeFileSync(resolve(OUT_DIR, `${id}-sealed.png`), encodePNG(sealed, SIZE, SIZE));

  const filled = solid.reduce((a, b) => a + b, 0);
  built.push({ id, family: spec.family, colours: used.size, filled });
}

console.log(`\n  ${built.length} wardens x 2 states = ${built.length * 2} PNGs, ${SIZE}x${SIZE} at 1x`);
console.log(`  mean palette size: ${(colourCount / built.length).toFixed(1)} colours/sprite (FFVI measures 10-12)`);
for (const b of built) {
  const cov = ((b.filled / (SIZE * SIZE)) * 100).toFixed(0);
  console.log(
    `    ${b.id.padEnd(12)} ${b.family.padEnd(8)} ${FAMILY_AXIS[b.family].padEnd(6)}` +
    ` ${String(b.colours).padStart(2)} colours  ${String(cov).padStart(2)}% coverage`
  );
}

/* =========================================================================
   THE AUDIT

   Re-opens all 48 PNGs FROM DISK, decodes them, and bins every lit pixel by
   hue. This is deliberately not a check on the constants above — those are
   already asserted at build time. It is a check on the shipped bytes, which
   is the only thing a critic can actually look at. A palette gate that reads
   CSS and never opens an image is a gate with nothing behind it.
   ========================================================================= */

function audit() {
  const bins = new Map();          // 10-degree bin -> pixel count
  const offenders = [];
  let lit = 0, achromatic = 0;

  for (const b of built) {
    for (const suffix of ["", "-sealed"]) {
      const file = resolve(OUT_DIR, `${b.id}${suffix}.png`);
      const img = decode(readFileSync(file));
      const bad = new Map();
      for (let i = 0; i < img.width * img.height; i++) {
        const o = i * 4;
        if (img.data[o + 3] === 0) continue;
        const px = [img.data[o], img.data[o + 1], img.data[o + 2]];
        lit++;
        const [h, s] = toHsl(px);
        if (!(s >= ACHROMATIC)) { achromatic++; continue; }
        const bin = Math.floor(h / 10) * 10;
        bins.set(bin, (bins.get(bin) || 0) + 1);
        if (!onAxis(px)) bad.set(bin, (bad.get(bin) || 0) + 1);
      }
      if (bad.size) {
        offenders.push(`${b.id}${suffix}: ` +
          [...bad].sort((x, y) => y[1] - x[1]).map(([d, n]) => `${d}deg x${n}`).join(", "));
      }
    }
  }

  const families = [...bins.keys()].sort((a, b) => a - b);
  const share = (n) => `${((n / lit) * 100).toFixed(1)}%`;
  const gold = families.filter((d) => bandOf(d + 5)?.name === "gold")
    .reduce((a, d) => a + bins.get(d), 0);
  const violet = families.filter((d) => bandOf(d + 5)?.name === "violet")
    .reduce((a, d) => a + bins.get(d), 0);

  console.log(`\n  AXIS AUDIT — ${built.length * 2} PNGs decoded off disk, ${lit} lit pixels`);
  console.log(`    hue bins present: ${families.map((d) => `${d}`).join(", ")}`);
  console.log(`    gold  30-60   ${String(gold).padStart(5)}  ${share(gold)}`);
  console.log(`    violet 240-300 ${String(violet).padStart(4)}  ${share(violet)}`);
  console.log(`    achromatic     ${String(achromatic).padStart(4)}  ${share(achromatic)}`);

  if (offenders.length) {
    console.error(`\n  OFF-AXIS PIXELS IN ${offenders.length} FILE(S):`);
    for (const line of offenders) console.error(`    ${line}`);
    process.exit(1);
  }
  console.log(`    -> zero off-axis pixels across the whole codex.`);
}

if (process.argv.includes("--palette")) {
  console.log(`\n  GENERATED RAMPS`);
  for (const [name, spec] of Object.entries(FAMILY_SPEC)) {
    const p = FAMILY[name];
    const full = { ...p, 0: deepShadow(p[1]), O: litOutline(p.o, p[1]) };
    const order = ["o", "0", "1", "2", "3", "4", "5", "6", "7", "8", "w", "O"];
    console.log(`    ${name.padEnd(8)} ${FAMILY_AXIS[name].padEnd(6)} hue ${String(spec.hue).padStart(3)}  ` +
      `chroma ${spec.chroma.toFixed(2)}  key ${spec.key.toFixed(2)}`);
    console.log(`      ${order.map((k) => `${k}:${full[k]}`).join(" ")}`);
  }
}

audit();

/* Optional contact sheet, for eyeballing all 24 at once while authoring. */
const sheetIdx = process.argv.indexOf("--sheet");
if (sheetIdx !== -1 && process.argv[sheetIdx + 1]) {
  const cells = built
    .map(
      (b) => `<figure><img src="${resolve(OUT_DIR, `${b.id}.png`)}" width="192" height="192">
    <img src="${resolve(OUT_DIR, `${b.id}-sealed.png`)}" width="96" height="96">
    <figcaption>${b.id}</figcaption></figure>`
    )
    .join("\n");
  writeFileSync(
    resolve(process.cwd(), process.argv[sheetIdx + 1]),
    `<!doctype html><meta charset=utf-8><style>
      body{background:#050A10;color:#C4C8CA;font:12px system-ui;margin:0;padding:16px}
      main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
      figure{margin:0;background:#13171B;padding:8px;border-radius:12px;text-align:center}
      img{image-rendering:pixelated;margin:0 auto;display:block}
      figcaption{margin-top:6px;letter-spacing:.08em;text-transform:uppercase}
    </style><main>${cells}</main>`
  );
  console.log(`\n  contact sheet -> ${process.argv[sheetIdx + 1]}`);
}

console.log("");
