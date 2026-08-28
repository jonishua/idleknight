/* =========================================================================
   palette.mjs — 5-bit colour, ramps, and every palette this game paints with.

   RULE ZERO (reference/ffvi-art.md §0): the SNES stores colour as BGR555, so
   every channel of every pixel we ship is a multiple of 8. White is #F8F8F8.
   Nothing here returns a colour that has not been through snes().

   Everything below is ORIGINAL. The reference document supplies structure —
   ramp length, hue-shift direction, per-tile budget, the window ramp's
   arithmetic — and none of the values are lifted from a capture.
   ========================================================================= */

/* ---- the one function that matters -------------------------------------- */

export const snes = (v) => Math.min(248, Math.max(0, Math.round(v / 8) * 8));

export const rgb = (r, g, b) => [snes(r), snes(g), snes(b)];

export const hex = (c) =>
  "#" + c.map((v) => snes(v).toString(16).padStart(2, "0")).join("").toUpperCase();

export function fromHex(h) {
  const s = h.replace("#", "");
  return rgb(
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16)
  );
}

/** True when a colour is legal in the pixel layer. */
export const isFiveBit = (c) => c.every((v) => v % 8 === 0);

/* ---- ramps ---------------------------------------------------------------
   §2: three steps is the standard length. Shadows are HUE-SHIFTED, not
   multiplied: saturation rises and the hue rotates toward the warm end as a
   colour darkens; highlights desaturate toward the scene light, never toward
   pure white. rampFrom() encodes exactly that so procedural regions get the
   same treatment hand-picked anchors do.
   ------------------------------------------------------------------------ */

function toHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h * 360, s, l];
}

function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  if (s === 0) { const v = l * 255; return rgb(v, v, v); }
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
  return rgb(t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255);
}

/**
 * Build an N-step ramp around a base colour.
 *   base   the mid (body) value
 *   opts.warm   degrees the hue rotates per step toward red as it darkens
 *   opts.light  the scene light colour highlights desaturate toward
 * Returns darkest..lightest.
 */
export function rampFrom(base, { steps = 3, spread = 0.17, warm = 12, light = null } = {}) {
  const [h, s, l] = toHsl(base);
  const mid = (steps - 1) / 2;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const k = i - mid;                       // negative = darker
    const nl = l + k * spread;
    // Shadows gain saturation and rotate warm; highlights lose saturation.
    const ns = k < 0 ? Math.min(1, s * (1 + 0.34 * -k)) : s * (1 - 0.22 * k);
    const nh = h + (k < 0 ? warm * -k : -warm * 0.4 * k);
    let c = fromHsl(nh, ns, nl);
    if (k > 0 && light) {
      // pull highlights toward the scene light rather than toward white
      const m = 0.22 * k;
      c = rgb(
        c[0] * (1 - m) + light[0] * m,
        c[1] * (1 - m) + light[1] * m,
        c[2] * (1 - m) + light[2] * m
      );
    }
    out.push(c);
  }
  return out;
}

/**
 * The window interior ramp, §3a — the ARITHMETIC ported, the hue replaced.
 *
 * §7 is blunt about this: "Do not use FFVI's window blue for our panels —
 * that fight is unwinnable and it would also be the most literally-copied
 * thing in the project." So what we take is the recipe, not the colour:
 * subtract 8 from ALL THREE channels per step and clamp each at zero. That
 * clamp is the whole signature — R and G bottom out first, so the wash slides
 * from a lit mid tone into a deep saturated foot rather than into grey.
 *
 * Our seed is --c-violet-light (#B394D8) pulled down to the cabinet's
 * temperature: #807098. The 20-step length is not a choice, it is what the
 * seed's blue channel buys — 0x98 / 8 = 19, so k runs 0..19 and the ramp is
 * exactly the 20 steps §3a measured. Run it and you get an indigo that is
 * unmistakably this game's violet axis at the top and near-black at the foot,
 * with R and G hitting zero at k=16 and k=14 the way the original's do.
 */
export function windowRamp() {
  const [r0, g0, b0] = fromHex("#807098");
  const out = [];
  for (let k = 0; k <= 19; k++) {
    out.push(rgb(Math.max(0, r0 - k * 8), Math.max(0, g0 - k * 8), Math.max(0, b0 - k * 8)));
  }
  return out;                       // 20 entries: #807098 … #000008
}

/* The slice of that ramp the battle band actually paints: #382850 down to
   #000008. Starting deep keeps the window reading as a lit instrument inside
   a dark cabinet rather than as a bright box borrowed from another game, and
   it puts the wash on the same value footing as --c-surface so the pixel
   layer and the chrome around it agree about how dark this screen is. */
export const BAND_RAMP_TOP = 9;
export const BAND_RAMP_BOTTOM = 18;

/**
 * The 4px lit rail, §3b — ported from silver to gold.
 *
 * FFVI's rail is a greyscale tube; §7 says port the geometry and swap the
 * metal. Each entry maps one measured grey step onto our gold ramp, with the
 * hue rotating toward red-brown as the value falls (§2 shading rule) so it
 * reads as gold rather than as tinted grey.
 */
export const RAIL = {
  f8: fromHex("#F8E0B0"), // was #F8F8F8 — the lit crest of the tube
  d8: fromHex("#E0C080"), // was #D8D8D8
  b8: fromHex("#C8A050"), // was #B8B8B8
  a8: fromHex("#B89040"), // was #A8A8A8
  g80: fromHex("#B08838"), // was #808080 — token --c-gold-deep on the grid
  g60: fromHex("#886028"), // was #606060
  g50: fromHex("#704818"), // was #505050
  g38: fromHex("#503010"), // was #383838 — rail/interior separator line
  g00: fromHex("#201008"), // was #000000 — bottom rail sits in shadow
};

/* The ATB capsule, §4 — the one bar in the whole game, kept in its measured
   silver. Deliberate: the cabinet around it is gold, so a silver instrument
   inside it reads as a different material rather than more of the same, and
   readiness is signalled by the NAME (§4 rule 2), never by the bar. */
export const ATB = {
  outline: fromHex("#A0A0A0"),
  edge: fromHex("#808080"),
  core: fromHex("#F8F8F8"),
};

/* Two text accents in the whole pixel UI, mapped through §7's bridge:
   FFVI cyan (labels/headers) -> our gold; FFVI yellow (this one is ready)
   -> our violet-light. Nothing else is allowed a colour. */
export const TEXT = {
  primary: fromHex("#F8F8F8"),
  shadow: fromHex("#000000"),
  label: fromHex("#D8A848"),  // --c-gold-core on the grid
  ready: fromHex("#B098D8"),  // --c-violet-light on the grid
  dim: fromHex("#9098A0"),
  damage: fromHex("#F8F8F8"),
  heal: fromHex("#78E058"),
  crit: fromHex("#F8D800"),
};

/* ---- scene palettes ------------------------------------------------------
   Structural templates from §5 applied to invented places. Every ramp is
   three steps; every shadow is hue-shifted; nothing is a multiply.
   ------------------------------------------------------------------------ */

/** THE SLAGFEN — an ash basin at dusk under a bruised violet sky.
    Warm ground, cool sky: the background carries the mood, sprites stay
    neutral (§5f). */
export const SLAGFEN = {
  // sky, top to horizon — the violet end bridges to the cabinet's accent
  sky: [
    fromHex("#180820"), fromHex("#201028"), fromHex("#281838"), fromHex("#302040"),
    fromHex("#3C2848"), fromHex("#483050"), fromHex("#583858"), fromHex("#684058"),
    fromHex("#804858"), fromHex("#985860"), fromHex("#B07060"), fromHex("#C08868"),
  ],
  ridgeFar: [fromHex("#281828"), fromHex("#302030"), fromHex("#402838")],
  ridgeNear: [fromHex("#180810"), fromHex("#201018"), fromHex("#301820")],
  stack: [fromHex("#100810"), fromHex("#181018"), fromHex("#282028")],
  ember: [fromHex("#B08838"), fromHex("#D8A848"), fromHex("#F8D8A0")],
  ground: [
    fromHex("#180F08"), fromHex("#281810"), fromHex("#382018"),
    fromHex("#483028"), fromHex("#584030"), fromHex("#705040"),
  ],
  groundLit: [fromHex("#886050"), fromHex("#A07860"), fromHex("#B89078")],
  crack: fromHex("#100808"),
  ash: [fromHex("#605058"), fromHex("#807078")],
  shadow: fromHex("#180F08"),
};

/** Ramp helper: index into a ramp with clamping. */
export const at = (ramp, i) => ramp[Math.min(ramp.length - 1, Math.max(0, i | 0))];
