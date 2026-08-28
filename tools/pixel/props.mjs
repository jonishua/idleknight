/* =========================================================================
   props.mjs — the window chrome, the ATB capsule, item icons and effects.

   The two halves of the piece meet in this file, so the seam gets stated
   explicitly (ffvi-art.md §7):

     PIXEL LAYER   sprites, monsters, the stage, item icons, and the 16-bit
                   window that frames the party status. 5-bit colour, 8px
                   grid, integer scale, hard 1px shadows, no CSS effects.
     CHROME        panels, buttons, the currency bar, typography. ui-bar.md
                   rules, full-resolution vector, gradients and bevels.

   The FRAME is where they meet and it is a designed object, not an accident:
   a gold-beveled bezel from the cabinet with the pixel stage sitting inside
   it flush at an integer offset. Inside that stage sits a SECOND frame — the
   4px lit rail from §3b, ported from silver to gold — around the party
   window. Two nested frames, both deliberate, and the resolution change
   between them reads as intentional instead of accidental.
   ========================================================================= */

import { Surface } from "./raster.mjs";
import {
  RAIL, ATB, windowRamp, BAND_RAMP_TOP, BAND_RAMP_BOTTOM, fromHex,
} from "./palette.mjs";

/* =========================================================================
   1. THE 4PX LIT RAIL  (§3b)

   Not a 1px stroke and not a border-radius. A lit metal tube, four pixels
   thick, wrapping the window with the light upper-left. The measured
   greyscale cross-sections, ported step for step onto our gold ramp:

     top     F8 D8 80 50 -> interior      light crest, falling into shadow
     left    F8 B8 60 38 -> interior
     right   60 B8 F8 38 -> interior      the bright pixel is one IN, on
                                          purpose: both vertical rails are
                                          the same tube lit from its left
     bottom  00 78 30    -> interior      the bottom rail sits in shadow

   Corners are chamfered over 4px on a 45 degree diagonal — not square, not
   rounded. That chamfer is the single most recognisable thing about the
   window and the first thing a border-radius would throw away.
   ========================================================================= */

const TOP = [RAIL.f8, RAIL.d8, RAIL.g80, RAIL.g50];
const LEFT = [RAIL.f8, RAIL.b8, RAIL.g60, RAIL.g38];
const RIGHT = [RAIL.g60, RAIL.b8, RAIL.f8, RAIL.g38];
const BOTTOM = [RAIL.g00, RAIL.g80, RAIL.g38];

export function railFrame(w, h) {
  const s = new Surface(w, h);

  for (let x = 0; x < w; x++) {
    for (let i = 0; i < 4; i++) s.px(x, i, TOP[i]);
    for (let i = 0; i < 3; i++) s.px(x, h - 1 - i, BOTTOM[i]);
  }
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < 4; i++) s.px(i, y, LEFT[i]);
    for (let i = 0; i < 4; i++) s.px(w - 1 - i, y, RIGHT[i]);
  }

  // Chamfer each corner over four pixels on the diagonal, then re-lay the
  // tube along it so the rail turns the corner instead of stopping at it.
  const cut = (ox, oy, sx, sy, ramp) => {
    for (let d = 0; d < 8; d++) {
      for (let k = 0; k <= d; k++) {
        const x = ox + sx * k;
        const y = oy + sy * (d - k);
        if (d < 4) s.px(x, y, null);
        else s.px(x, y, ramp[d - 4]);
      }
    }
  };
  cut(0, 0, 1, 1, TOP);
  cut(w - 1, 0, -1, 1, [RAIL.f8, RAIL.d8, RAIL.g80, RAIL.g50]);
  cut(0, h - 1, 1, -1, [RAIL.b8, RAIL.g80, RAIL.g60, RAIL.g38]);
  cut(w - 1, h - 1, -1, -1, [RAIL.g60, RAIL.g80, RAIL.g50, RAIL.g38]);

  return s;
}

/* =========================================================================
   2. THE WINDOW BAND  (§3a + §4 layout)

   §3a's real insight is that the interior wash is NOT per-window: it is one
   vertical ramp spanning the whole windowed region, and windows at different
   heights sample different parts of it. That is why stacked FFVI windows
   look like one continuous surface. So the ramp here is computed from the
   band's y, not from each window's own y, and both windows share it.

   §4's layout, measured and scaled: enemy roster LEFT, party status RIGHT,
   always. Four rows at a 12px pitch. No HP bars for the party — HP is a
   number; the only bar on screen is the ATB gauge.
   ========================================================================= */

export const BAND = {
  y: 110,
  h: 58,
  left: { x: 2, w: 72 },
  right: { x: 78, w: 112 },
  rowPitch: 12,
  rowTop: 5,
  // Right-window column stops, in stage pixels.
  nameX: 82,
  hpRight: 142,
  atbX: 145,
  enemyX: 6,
};

export function windowBand() {
  const s = new Surface(192, BAND.h);
  const ramp = windowRamp();
  const span = BAND_RAMP_BOTTOM - BAND_RAMP_TOP;

  const paint = (x0, w) => {
    const frame = railFrame(w, BAND.h);
    for (let y = 0; y < BAND.h; y++) {
      const idx = BAND_RAMP_TOP + Math.round((y / (BAND.h - 1)) * span);
      for (let x = 0; x < w; x++) {
        const rail = frame.get(x, y);
        // Inside the frame the interior wash shows; the rail itself is
        // opaque metal and wins.
        if (rail) s.px(x0 + x, y, rail);
        else if (isInside(frame, x, y, w, BAND.h)) s.px(x0 + x, y, ramp[idx]);
      }
    }
  };

  paint(BAND.left.x, BAND.left.w);
  paint(BAND.right.x, BAND.right.w);
  return s;
}

/** A frame pixel is "inside" when it is not in the chamfered-away corner. */
function isInside(frame, x, y, w, h) {
  const corner = Math.min(x + y, (w - 1 - x) + y, x + (h - 1 - y), (w - 1 - x) + (h - 1 - y));
  return corner >= 4;
}

/* =========================================================================
   3. THE ATB CAPSULE  (§4, decoded pixel by pixel)

   40 x 7. A proper 1px lozenge whose end caps step in by one pixel on the
   top and bottom rows, which is what makes a 7px-tall bar read as a rounded
   pill instead of a rectangle.

   The EMPTY TRACK IS NOT DRAWN. There is no darker well — the window's wash
   shows straight through, which means a gauge near the top of the band and
   one near the bottom genuinely look different, and that is correct.

   Only the outline ships as an asset; the runtime paints the three fill rows
   itself because their length changes every tick. Fill travels x+4 -> x+37,
   so 34 pixels of travel inside a 40px capsule.
   ========================================================================= */

export const ATB_GEOM = {
  w: 40, h: 7,
  fillX: 4, fillTravel: 34, fillY: 2, fillRows: 3,
  edge: ATB.edge, core: ATB.core,
};

export function atbCapsule() {
  const s = new Surface(ATB_GEOM.w, ATB_GEOM.h);
  const o = ATB.outline;
  const W = ATB_GEOM.w;
  s.hline(3, 0, W - 6, o);
  s.hline(3, 6, W - 6, o);
  s.px(1, 1, o); s.px(2, 1, o); s.px(W - 3, 1, o); s.px(W - 2, 1, o);
  s.px(1, 5, o); s.px(2, 5, o); s.px(W - 3, 5, o); s.px(W - 2, 5, o);
  for (let y = 2; y <= 4; y++) { s.px(0, y, o); s.px(1, y, o); s.px(W - 2, y, o); s.px(W - 1, y, o); }
  return s;
}

/* =========================================================================
   4. ITEM ICONS — 16 x 16, one shared 15-colour page.

   Real SNES icon sheets share a single palette across every icon on the
   page, which is why they look like a set instead of a collection. Ours does
   the same: one key, six drawings, and the discipline shows.
   ========================================================================= */

const ICON = {
  k: fromHex("#100810"),
  1: fromHex("#401808"), 2: fromHex("#785030"), 3: fromHex("#A87848"),
  4: fromHex("#385058"), 5: fromHex("#7890A0"), 6: fromHex("#C0D0D8"),
  7: fromHex("#802010"), 8: fromHex("#D85820"), 9: fromHex("#F8B058"),
  a: fromHex("#301060"), b: fromHex("#6030B0"), c: fromHex("#A880E8"),
  d: fromHex("#B08838"), e: fromHex("#F8D8A0"),
};

const EMBERGLASS = [
  "................",
  ".....kkkk.......",
  ".....k55k.......",
  ".....k55k.......",
  "....k5665k......",
  "....k6..5k......",
  "...k6....5k.....",
  "..k6.9998.5k....",
  "..k6.9888.5k....",
  ".k6.988887.5k...",
  ".k6.988887.5k...",
  ".k5.878877.4k...",
  "..k5.7777.4k....",
  "...k54444k......",
  "....kkkkk.......",
  "................",
];

const SPANNER = [
  "................",
  "...kkk..........",
  "..k66k..........",
  "..k6.5k.........",
  "..k6.5k.........",
  "..k665k.........",
  "...k65k.........",
  "....k65k........",
  ".....k65k.......",
  "......k65k......",
  ".......k65k.....",
  "........k65k....",
  ".........k665k..",
  "........k6..5k..",
  "........k65.5k..",
  ".........kkkk...",
];

const FOCUS = [
  "................",
  ".......cc.......",
  "......ccck......",
  ".....cbbbck.....",
  "....cbbcbbck....",
  "....cbaccbbk....",
  "....kbaabbbk....",
  ".....kbaabk.....",
  "......kbbk......",
  ".......k2k......",
  ".......k2k......",
  ".......k2k......",
  ".......k2k......",
  "......k21k......",
  "......k21k......",
  "......kkkk......",
];

const WARDEN_SIGIL = [
  "................",
  "......kkkk......",
  "....kkeeeekk....",
  "...keeddddek....",
  "..keeddddddek...",
  "..kedddd99dek...",
  ".keddd9999ddek..",
  ".kedd99dd99dek..",
  ".kedd99dd99dek..",
  ".keddd9999dddk..",
  "..kedd99ddddk...",
  "..keddddddddk...",
  "...keddddddk....",
  "....kkddddkk....",
  "......kkkk......",
  "................",
];

const SLAG_INGOT = [
  "................",
  "................",
  "................",
  "....kkkkkkkk....",
  "...k55555555k...",
  "..k5544444455k..",
  ".k554487844455k.",
  ".k44487778444k..",
  ".k4448778444kk..",
  ".k4444784444k...",
  ".kk444444444k...",
  "..kk4444444k....",
  "...kkkkkkkkk....",
  "................",
  "................",
  "................",
];

const ASHROOT = [
  "................",
  "....kk....kk....",
  "...k66k..k66k...",
  "...k66kkk66k....",
  "....k66666k.....",
  ".....k666k......",
  "......k33k......",
  "......k33k......",
  ".....k333k......",
  ".....k332k......",
  "....k3322k......",
  "....k3222k.kk...",
  "...k32211kk22k..",
  "...k3221112221k.",
  "....kk1111111k..",
  "......kkkkkkk...",
];

export const ITEMS = [
  { id: "emberglass-vial", name: "Emberglass Vial", kind: "Restorative", grid: EMBERGLASS,
    blurb: "Bottled furnace-light. Drink it and the cold stops mattering for a while." },
  { id: "cogwrights-spanner", name: "Cogwright's Spanner", kind: "Arm", grid: SPANNER,
    blurb: "Iska's own, re-forged twice. Turns a bolt and breaks a jaw." },
  { id: "voidcallers-focus", name: "Voidcaller's Focus", kind: "Arm", grid: FOCUS,
    blurb: "The crystal was cut from a veil-fall. It hums when something is listening." },
  { id: "warden-seal", name: "Warden Seal", kind: "Relic", grid: WARDEN_SIGIL,
    blurb: "Struck for the last basin wardens. Nine were made; four are accounted for." },
  { id: "slag-ingot", name: "Slag Ingot", kind: "Material", grid: SLAG_INGOT,
    blurb: "Refinery tailings, re-poured. Still warm in the middle if you split it." },
  { id: "ashroot", name: "Ashroot", kind: "Material", grid: ASHROOT,
    blurb: "Grows only where the ground burned. Bitter, and the only thing that grows here." },
];

export function itemSurface(item) {
  return new Surface(16, 16).grid(0, 0, item.grid, ICON);
}

/* =========================================================================
   5. EFFECTS

   §6: spells are large overlay sequences, not per-sprite animation, and the
   heavy lifting is done by screen flash and screen shake — both free, both
   enormous. These three overlays plus a 1-3px integer frame offset are the
   entire effects budget for the encounter.
   ========================================================================= */

const FX = {
  k: fromHex("#100810"),
  w: fromHex("#F8F8F8"), s: fromHex("#C0D0D8"), t: fromHex("#7890A0"),
  e: fromHex("#F8D8A0"), o: fromHex("#F08810"), r: fromHex("#C03800"),
  v: fromHex("#A880E8"), u: fromHex("#6030B0"), i: fromHex("#301060"),
};

/**
 * Contact shadow. §2: "every standing sprite gets a 1-2px dark ellipse under
 * it, drawn in the BACKGROUND'S darkest ramp step, not in black." So it is
 * baked from the scene palette, not from the sprite's, and the soft outer
 * ring is a checkerboard rather than an alpha fade — sanctioned job two, a
 * transparency stand-in, because the hardware only had one real one.
 */
export function contactShadow(w, h, colour) {
  const s = new Surface(w, h);
  /* SIZE IS THE WHOLE THING HERE, and round 1 got it wrong by a factor of
     about five. Decoding the reference hero at (188,65) in
     ffvi-battle-native-a.png, its cast shadow is SIX PIXELS of #181828 — a
     dark blue, not a black — tucked under the two boots and nowhere else.
     Ours was an 18x5 filled ellipse with a dithered ring around it, ~70 px,
     and four of them merged into one black smear under the party. A contact
     shadow says "this thing is standing on that ground"; anything larger
     says "this thing is floating over a hole".

     So: a solid core one row tall across the middle two thirds, a second row
     only under the very centre, and a checkerboard at both ends. */
  const cy = Math.floor(h / 2);
  const core = Math.round(w * 0.62);
  const x0 = Math.round((w - core) / 2);
  s.hline(x0, cy, core, colour);
  if (h >= 3) s.hline(x0 + Math.round(core * 0.2), cy + 1, Math.round(core * 0.6), colour);
  if (h >= 5) s.hline(x0 + Math.round(core * 0.3), cy - 1, Math.round(core * 0.4), colour);
  for (let i = 0; i < x0; i++) {
    if ((i & 1) === 0) { s.px(x0 - 1 - i, cy, colour); s.px(x0 + core + i, cy, colour); }
  }
  return s;
}

export function fxSlash() {
  const s = new Surface(32, 28);
  // A crescent: one arc swept twice at slightly different radii, then the
  // gap between filled. Held for a few frames, never tweened.
  for (let a = -58; a <= 58; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < 3; k++) {
      const R = 19 - k * 1.6 - Math.abs(a) * 0.055;
      const x = Math.round(6 + Math.cos(rad) * R);
      const y = Math.round(14 + Math.sin(rad) * R);
      s.px(x, y, k === 0 ? FX.w : k === 1 ? FX.s : FX.t);
    }
  }
  return s;
}

export function fxImpact() {
  const s = new Surface(24, 24);
  const spikes = [[0, 11], [45, 8], [90, 11], [135, 8], [180, 11], [225, 8], [270, 11], [315, 8]];
  for (const [deg, len] of spikes) {
    const rad = (deg * Math.PI) / 180;
    for (let k = 2; k <= len; k++) {
      const x = Math.round(11.5 + Math.cos(rad) * k);
      const y = Math.round(11.5 + Math.sin(rad) * k);
      s.px(x, y, k > len - 3 ? FX.r : k > len - 6 ? FX.o : FX.e);
    }
  }
  s.ellipse(11.5, 11.5, 4, 4, FX.e);
  s.ellipse(11.5, 11.5, 2, 2, FX.w);
  return s;
}

export function fxSigil() {
  const s = new Surface(32, 32);
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    s.px(Math.round(15.5 + Math.cos(rad) * 14), Math.round(15.5 + Math.sin(rad) * 14), FX.u);
    s.px(Math.round(15.5 + Math.cos(rad) * 13), Math.round(15.5 + Math.sin(rad) * 13), FX.v);
    s.px(Math.round(15.5 + Math.cos(rad) * 9), Math.round(15.5 + Math.sin(rad) * 9), FX.i);
  }
  // An inscribed hexagram — the Voidcaller's mark, and ours.
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const rad = ((i * 60 - 90) * Math.PI) / 180;
    pts.push([15.5 + Math.cos(rad) * 12, 15.5 + Math.sin(rad) * 12]);
  }
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 2) % 6];
    s.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), FX.v);
  }
  return s;
}
