/* =========================================================================
   monsters.mjs — five original beasts of the Emberveil.

   ROUND 2 REWRITE, and the reason is a number.

   Decode reference/shots/ffvi-battle-native-a.png, isolate the medium monster,
   and ask what share of its pixels sit inside a uniform 3x3 patch. The answer
   is 3.2%. Ask the same of the round-1 slagmaw.png and the answer is 42%. The
   reference animal's hide is only three values deep — #182818 / #303820 /
   #505030, luminance 13% to 30% — and those three carry 358 / 346 / 245
   pixels, near enough a third each. It does not read as a blob because the
   values are distributed by ANATOMY: every muscle group is a small lit cap
   with a dark crease against its neighbour, and the darkest step is a network
   of seams rather than one shadowed side.

   Round 1 shaded each animal as a single mass under one projected lighting
   plane. That can only ever make a lit side and a dark side, which at 88x64
   is a lozenge. So every monster below is now built in three passes:

     1. A MARKER MASK — the silhouette, from ellipses and tapered limbs. This
        is the only pass that decides whether the thing reads at a glance.

     2. MASS SHADING — Surface.shadeMasses(). The masses under the skin are
        declared explicitly (haunch, barrel, shoulder, skull, each shank), and
        each is lit as its own ellipsoid from the same upper-left source. The
        strongest term wins. Where two masses abut, both are at their own rim,
        both terms are low, and the crease falls out of the arithmetic.

     3. HAND MARKS — creases along the ribs and the flank, a lit crest on the
        silhouette's upper edge, and the accents: eyes, magma, claws.

   Sizes are the measured ones (§1). Palettes are 13-15 colours, ramps are
   3-4 steps weighted toward the biggest masses, every value is on the 5-bit
   grid, and the outline is tinted toward the scene rather than being black.

   §6 is why none of these have idle frames: "Budget zero idle frames for
   monsters and spend everything on palette cycling + transforms."
   ========================================================================= */

import { Surface, rng } from "./raster.mjs";
import { fromHex } from "./palette.mjs";

const C = (h) => fromHex(h);

/* Marker colours are arbitrary and never ship — they only have to be
   distinct. Using visible primaries makes a mis-drawn mask obvious if you
   dump it mid-build. */
const M = {
  body: [8, 0, 0],
  plate: [16, 0, 0],
  magma: [24, 0, 0],
  claw: [32, 0, 0],
  eye: [40, 0, 0],
  seam: [48, 0, 0],
  mane: [56, 0, 0],
  horn: [64, 0, 0],
  veil: [72, 0, 0],
  head: [80, 0, 0],
  scale: [88, 0, 0],
  cloth: [96, 0, 0],
};

const isM = (mask, m) => (x, y) => {
  const c = mask.get(x, y);
  return !!c && c[0] === m[0];
};

/** A quad limb that tapers from (x0,y0,w0) to (x1,y1,w1), drawn perpendicular. */
function limb(s, x0, y0, w0, x1, y1, w1, c) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  s.poly([
    [x0 + nx * w0 / 2, y0 + ny * w0 / 2],
    [x1 + nx * w1 / 2, y1 + ny * w1 / 2],
    [x1 - nx * w1 / 2, y1 - ny * w1 / 2],
    [x0 - nx * w0 / 2, y0 - ny * w0 / 2],
  ], c);
}

/** Draw the silhouette of a mass list, so mask and shading cannot disagree. */
function massMask(s, masses, c) {
  for (const m of masses) s.ellipse(m.cx, m.cy, m.rx, m.ry, c);
  return s;
}

/* =========================================================================
   SLAGMAW — 88 x 64, the medium class.

   A quadruped that lives in the cooling slag of the old refinery basin. Its
   dorsal plates are cracked basalt; what shows through the cracks is still
   molten. Faces right, toward the party.
   ========================================================================= */

/* Four hide values, and the job of shadeMasses is to spend all four. The
   basalt plates are deliberately COOL against that warm hide — the reference
   animal gets its read the same way, warm shell plates on a cool body — which
   also gives the magma seams somewhere bright to sit. */
const SLAGMAW_PAL = {
  outline: C("#100808"),
  hide: [C("#180810"), C("#302018"), C("#504030"), C("#786050")],
  hideRim: C("#A89078"),
  plate: [C("#181820"), C("#383040"), C("#605868")],
  plateRim: C("#988FA8"),
  magma: [C("#902800"), C("#D04800"), C("#F07810"), C("#F8C060")],
  eye: C("#F8D800"),
};

/* Teeth and claws are bone, and bone gets no slots of its own: the sprite is
   at 15, which IS the budget (§2 — "15 colours + 1 transparent, per palette,
   per sprite"). They borrow the plate metals, which is what a real 4bpp page
   does and what makes the count honest rather than a claim. */
SLAGMAW_PAL.claw = [SLAGMAW_PAL.plate[2], SLAGMAW_PAL.plateRim];

/* The animal, declared once. The mask draws these and shadeMasses lights
   them, so the silhouette and the modelling can never drift apart.

   `lift` is where the drawing happens: a shoulder standing proud of the ribs
   gets +0.10 and reads as the nearest thing on the animal; a belly tucked
   under the ribcage gets -0.14 and falls away. Same light, different planes. */
const SLAGMAW_MASSES = [
  { cx: 22, cy: 36, rx: 14, ry: 12, lift: 0.02 },   // haunch
  { cx: 36, cy: 39, rx: 12, ry: 8, lift: -0.14 },   // belly
  { cx: 42, cy: 33, rx: 13, ry: 9, lift: 0.04 },    // ribcage
  { cx: 55, cy: 32, rx: 12, ry: 11, lift: 0.10 },   // shoulder
  { cx: 64, cy: 27, rx: 9, ry: 9, lift: 0.05 },     // neck, overlapping both
  { cx: 13, cy: 33, rx: 7, ry: 6, lift: -0.05 },    // tail root
];

/* Each leg is thigh -> shank -> pastern -> foot, four masses, because three
   overlapping tubes of the same width is a sausage and an animal's leg
   tapers. The far pair sits a full lift step below the near pair, which is
   the only depth cue a flat 2D sprite gets. */
const SLAGMAW_LEGS = [
  { cx: 30, cy: 47, rx: 4.6, ry: 8, lift: -0.08 },  // far hind
  { cx: 31, cy: 56, rx: 3.2, ry: 5, lift: -0.10 },
  { cx: 31, cy: 60, rx: 5, ry: 3, lift: -0.12 },
  { cx: 56, cy: 46, rx: 4.2, ry: 8, lift: -0.12 },  // far fore
  { cx: 56, cy: 55, rx: 3, ry: 5, lift: -0.14 },
  { cx: 56, cy: 59, rx: 4.6, ry: 3, lift: -0.14 },
  { cx: 19, cy: 47, rx: 6, ry: 9, lift: 0.05 },     // near hind
  { cx: 17, cy: 56, rx: 4, ry: 5, lift: 0.04 },
  { cx: 15, cy: 60, rx: 6, ry: 3.4, lift: 0.0 },
  { cx: 68, cy: 46, rx: 5.4, ry: 9, lift: 0.06 },   // near fore
  { cx: 70, cy: 55, rx: 3.8, ry: 5, lift: 0.04 },
  { cx: 71, cy: 60, rx: 6, ry: 3.4, lift: 0.0 },
];

const SLAGMAW_SKULL = [
  { cx: 72, cy: 22, rx: 9, ry: 7, lift: 0.08 },     // cranium
  { cx: 80, cy: 24, rx: 7, ry: 4, lift: 0.0 },      // muzzle
  { cx: 77, cy: 31, rx: 8, ry: 3.4, lift: -0.12 },  // lower jaw
];

function slagmaw() {
  const W = 88, H = 64;
  const mask = new Surface(W, H);

  // --- silhouette -------------------------------------------------------
  limb(mask, 16, 33, 13, 3, 14, 3, M.body);          // tail
  massMask(mask, SLAGMAW_MASSES, M.body);
  for (const seg of [
    [22, 42, 13, 30, 52, 9], [30, 52, 9, 31, 59, 7],
    [30, 42, 11, 31, 52, 7], [31, 52, 7, 31, 59, 6],
    [55, 40, 10, 56, 52, 7], [56, 52, 7, 56, 58, 6],
    [62, 40, 12, 68, 52, 8], [68, 52, 8, 71, 59, 7],
  ]) limb(mask, ...seg, M.body);
  massMask(mask, SLAGMAW_LEGS, M.body);

  /* Skull: a wedge slung LOW and FORWARD off the shoulder, not a ball on a
     stalk. Round 1 put the cranium at y=18 with a separate brow slab over it
     and the animal grew a top hat. Here the neck mass, the cranium and the
     shoulder all overlap, so the head is the front of one continuous body. */
  limb(mask, 60, 30, 19, 71, 24, 15, M.head);
  massMask(mask, SLAGMAW_SKULL, M.head);
  mask.poly([[70, 19], [87, 22], [87, 27], [72, 28]], M.head);   // upper jaw

  // --- dorsal plates ----------------------------------------------------
  // Biggest over the shoulder, tapering both ways: a row of six identical
  // domes is a caterpillar, and the animal has to have a heaviest end.
  const spine = [
    { cx: 13, cy: 29, rx: 5, ry: 4 }, { cx: 22, cy: 25, rx: 7, ry: 5 },
    { cx: 33, cy: 22, rx: 9, ry: 6 }, { cx: 46, cy: 20, rx: 10, ry: 7 },
    { cx: 58, cy: 21, rx: 9, ry: 6 }, { cx: 66, cy: 24, rx: 6, ry: 4 },
  ];
  for (const p of spine) {
    mask.ellipse(p.cx, p.cy + 1, p.rx, p.ry, M.seam);   // hard edge under each
    mask.ellipse(p.cx, p.cy, p.rx, p.ry - 1, M.plate);
  }
  mask.ellipse(73, 17, 8, 3.4, M.seam);                  // brow ridge, on the skull
  mask.ellipse(73, 16.6, 7, 2.6, M.plate);

  /* --- magma cracks -----------------------------------------------------
     Cracks, not stripes. Round 1 drew eight straight vertical strokes and
     they read as tally marks glued to the hide. A real crack forks and
     changes direction, so each one is a short jagged polyline that starts
     under a plate's edge and runs down the flank, thinning as it goes. */
  const cracks = [
    [[18, 29], [17, 33], [19, 36]],
    [[27, 26], [28, 31], [26, 34], [27, 37]],
    [[38, 24], [37, 29], [39, 33]],
    [[50, 24], [51, 29], [49, 32]],
    [[60, 25], [59, 30]],
    [[29, 41], [34, 42], [37, 41]],
    [[43, 42], [48, 43]],
    [[16, 41], [20, 44], [23, 43]],
  ];
  for (const c of cracks) {
    for (let i = 0; i + 1 < c.length; i++) mask.line(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1], M.magma);
  }
  // The throat, lit from inside — a ragged glow line, not a painted bar.
  for (const [x, y, w] of [[72, 29, 4], [76, 28, 3], [79, 29, 5], [84, 28, 3]]) {
    mask.rect(x, y, w, 2, M.magma);
  }

  // --- teeth, claws, eye ------------------------------------------------
  for (const x of [74, 78, 82]) mask.rect(x, 26, 2, 2, M.claw);
  for (const x of [76, 80, 84]) mask.rect(x, 30, 2, 2, M.claw);
  for (const [x, y] of [[11, 60], [15, 61], [29, 61], [33, 61], [54, 59], [58, 59], [68, 61], [72, 61]]) {
    mask.rect(x, y, 2, 3, M.claw);
  }
  mask.rect(75, 21, 3, 2, M.eye);

  // --- shading ----------------------------------------------------------
  const out = new Surface(W, H);
  const hide = isM(mask, M.body);
  const head = isM(mask, M.head);
  const plate = isM(mask, M.plate);

  out.shadeMasses(hide, [...SLAGMAW_MASSES, ...SLAGMAW_LEGS], SLAGMAW_PAL.hide, {
    lx: -0.5, ly: -0.66, lz: 0.56, ambient: 0.14, crease: 0.36, mottle: 0.44, seed: 0x5a19,
  });
  // The skull is lit on its own terms. The animal faces RIGHT and the light
  // is fixed upper-left, so on one global plane the one part of the
  // silhouette that has to read would land on the darkest step and vanish.
  out.shadeMasses(head, SLAGMAW_SKULL, SLAGMAW_PAL.hide, {
    lx: -0.4, ly: -0.8, lz: 0.45, ambient: 0.2, crease: 0.3, mottle: 0.3, seed: 0x71c3,
  });
  out.shadeMasses(plate, spine.map((p) => ({ ...p, ry: p.ry - 1 })).concat([{ cx: 73, cy: 16.6, rx: 7, ry: 2.6 }]),
    SLAGMAW_PAL.plate, { lx: -0.45, ly: -0.7, lz: 0.55, ambient: 0.12, crease: 0.42, mottle: 0.22, seed: 0x2b8d });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isM(mask, M.seam)(x, y)) out.px(x, y, SLAGMAW_PAL.plate[0]);
  }

  /* Ribs and flank folds. shadeMasses gives the big forms; these are the
     marks a pixel artist makes last, and at this size they carry as much of
     the read as the lighting does. Each drops the pixel one ramp step, so a
     crease over a lit flank stays lighter than a crease in a shadow — the
     line describes the form instead of drawing on top of it. */
  const ribs = [];
  for (const [x0, y0, x1, y1] of [
    [38, 28, 35, 38], [43, 27, 40, 38], [48, 27, 46, 37],
    [24, 30, 21, 41], [19, 31, 16, 40],
    [53, 28, 52, 36], [61, 30, 60, 37],
  ]) ribs.push(...Surface.path(x0, y0, x1, y1));
  out.crease(ribs, SLAGMAW_PAL.hide);
  // Where each leg meets the body, the line of the belly, and the fold at
  // every ankle — the marks that stop a tapered tube reading as a sausage.
  const joints = [
    ...Surface.path(13, 44, 24, 45), ...Surface.path(27, 42, 34, 43),
    ...Surface.path(53, 42, 59, 43), ...Surface.path(63, 43, 73, 44),
    ...Surface.path(28, 45, 46, 46),
    ...Surface.path(14, 52, 21, 53), ...Surface.path(28, 51, 34, 52),
    ...Surface.path(53, 51, 59, 52), ...Surface.path(65, 52, 73, 53),
  ];
  out.crease(joints, SLAGMAW_PAL.hide);

  /* The lit crest. Two pixels deep on the hide because a 25px-tall barrel can
     carry it, one on the plates because they cannot. minRun drops the speckle
     a lumpy overlapping-ellipse silhouette throws along its upper edge. */
  out.rim(hide, SLAGMAW_PAL.hideRim, { lx: -0.55, ly: -0.75, depth: 2, minRun: 3 });
  out.rim(head, SLAGMAW_PAL.hideRim, { lx: -0.4, ly: -0.9, depth: 1, minRun: 3 });
  out.rim(plate, SLAGMAW_PAL.plateRim, { lx: -0.5, ly: -0.8, depth: 1, minRun: 2 });

  /* Basalt is fractured. Without these the plates shade beautifully and still
     read as six smooth river stones, because a smooth surface and a shattered
     one are the same form and differ only in their marks. */
  const fractures = [];
  for (const [x0, y0, x1, y1] of [
    [11, 27, 15, 31],
    [19, 23, 23, 28], [24, 22, 25, 28],
    [30, 19, 34, 26], [36, 19, 35, 26],
    [42, 17, 47, 25], [50, 17, 48, 25],
    [55, 18, 59, 25], [61, 19, 60, 25],
    [65, 22, 68, 26], [70, 15, 74, 18],
  ]) fractures.push(...Surface.path(x0, y0, x1, y1));
  out.crease(fractures.filter(([x, y]) => plate(x, y)), SLAGMAW_PAL.plate);

  // Magma is not lit by the scene — it IS a light — so it gets a vertical
  // ramp of its own, hottest at the top of each seam.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isM(mask, M.magma)(x, y)) continue;
      let up = 0;
      while (up < 4 && isM(mask, M.magma)(x, y - up - 1)) up++;
      out.px(x, y, SLAGMAW_PAL.magma[3 - Math.min(3, up)]);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Teeth catch the light; claws in the ash do not.
    if (isM(mask, M.claw)(x, y)) out.px(x, y, SLAGMAW_PAL.claw[y < 40 ? 1 : 0]);
    if (isM(mask, M.eye)(x, y)) out.px(x, y, SLAGMAW_PAL.eye);
  }

  out.outline(SLAGMAW_PAL.outline);
  return out;
}

/* =========================================================================
   CINDERWISP — 40 x 40, the small class.

   Not a body at all: a burning core wrapped in a veil that never quite
   closes. The veil is drawn as a checkerboard at its hem on purpose — the
   SNES had one real transparency layer and spent it elsewhere, so ghosts and
   flames were faked with a 50% dither. That is sanctioned job number two.
   ========================================================================= */

const WISP_PAL = {
  outline: C("#180810"),
  veil: [C("#180810"), C("#380820"), C("#601038"), C("#883058")],
  ember: [C("#C04800"), C("#F08810"), C("#F8C858"), C("#F8E8B0")],
  void: C("#080008"),
};

function cinderwisp() {
  const W = 40, H = 40;
  const mask = new Surface(W, H);
  const r = rng(0x51a6);

  // Veil: a torn cowl, wider at the shoulders, trailing to nothing.
  mask.poly([[20, 3], [31, 12], [33, 26], [27, 36], [13, 36], [7, 26], [9, 12]], M.veil);
  mask.poly([[13, 34], [17, 39], [12, 39]], M.veil);
  mask.poly([[24, 34], [29, 39], [23, 39]], M.veil);

  const out = new Surface(W, H);
  /* Cloth is folds, so the masses are the folds: a hood, two shoulders and
     three hanging pleats. One plane over the whole cowl gave a lit half and a
     dark half and read as a paper cut-out. */
  out.shadeMasses(isM(mask, M.veil), [
    { cx: 19, cy: 10, rx: 9, ry: 7, lift: 0.06 },    // hood
    { cx: 12, cy: 20, rx: 5, ry: 8, lift: 0.04 },    // left shoulder
    { cx: 28, cy: 21, rx: 5, ry: 8, lift: -0.08 },   // right shoulder
    { cx: 15, cy: 31, rx: 4, ry: 7, lift: 0.0 },     // pleats
    { cx: 21, cy: 33, rx: 3.5, ry: 7, lift: -0.10 },
    { cx: 27, cy: 31, rx: 4, ry: 7, lift: -0.05 },
  ], WISP_PAL.veil, { lx: -0.55, ly: -0.5, lz: 0.66, ambient: 0.13, crease: 0.42, mottle: 0.52, seed: 0x8f21 });
  // The cowl's own folds, so a torn shroud does not read as an egg.
  const pleats = [];
  for (const [x0, y0, x1, y1] of [
    [12, 12, 10, 33], [16, 14, 15, 35], [24, 14, 25, 35], [28, 12, 30, 32],
  ]) pleats.push(...Surface.path(x0, y0, x1, y1));
  out.crease(pleats.filter(([x, y]) => isM(mask, M.veil)(x, y)), WISP_PAL.veil);
  out.rim(isM(mask, M.veil), C("#B06070"), { lx: -0.7, ly: -0.55, depth: 1, minRun: 3 });

  // The trailing hem dissolves into the air as a checkerboard rather than
  // ending on a hard line.
  for (let y = 30; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!out.opaque(x, y)) continue;
      const fade = (y - 29) / 10;
      if (((x + y) & 1) === 0 && r() < fade) out.px(x, y, null);
    }
  }

  /* The core, burning through the cowl's opening. The opening is an ALMOND,
     not a circle: a round hole with a round flame in it reads as a fried egg,
     which is exactly what the first pass looked like. Pointed top and bottom,
     narrow, and the hottest pixels sit low because a flame is fed from
     below. */
  const core = new Surface(W, H);
  core.poly([[20, 7], [25, 14], [24, 22], [20, 26], [16, 22], [15, 14]], M.magma);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isM(core, M.magma)(x, y)) continue;
    const d = Math.hypot((x - 20) / 5.2, (y - 18) / 8.2);
    out.px(x, y, WISP_PAL.ember[Math.min(3, Math.max(0, Math.round((1 - d) * 3.2)))]);
  }
  // Two voids where eyes would be, cut straight out of the fire — slits, not
  // discs, because at 40 px a disc is a pupil and a slit is a stare.
  out.rect(18, 13, 1, 4, WISP_PAL.void);
  out.rect(22, 13, 1, 4, WISP_PAL.void);
  out.rect(19, 20, 3, 1, WISP_PAL.void);

  out.outline(WISP_PAL.outline, { diagonal: false });
  return out;
}

/* =========================================================================
   GLOAMSTAG — 64 x 56, the medium-small class.

   A shade-beast out of the Deepstone galleries: cold body, warm-grey antler,
   and a single moss-green eye that is the only saturated thing on it. Faces
   right. Palette is the §5d temperature split — mineral and organic are
   separated by warmth, not by hue.
   ========================================================================= */

/* §5b is the licence for how bright a cold thing may get: night snow tops out
   at #8098A8, 57% luminance, and the scene still reads as night because
   nothing else in it comes close. */
const STAG_PAL = {
  outline: C("#080810"),
  body: [C("#101820"), C("#283848"), C("#486478"), C("#708898")],
  bodyRim: C("#A0B8C8"),
  mane: [C("#102820"), C("#285840"), C("#50A070")],
  horn: [C("#605848"), C("#908878"), C("#D8D0B8")],
  eye: C("#98D048"),
};

const STAG_MASSES = [
  { cx: 20, cy: 26, rx: 11, ry: 9, lift: 0.05 },    // haunch
  { cx: 31, cy: 28, rx: 9, ry: 6, lift: -0.14 },    // belly, tucked
  { cx: 38, cy: 23, rx: 9, ry: 7, lift: 0.04 },     // ribcage
  { cx: 45, cy: 20, rx: 6, ry: 6, lift: 0.09 },     // shoulder
  { cx: 11, cy: 22, rx: 5, ry: 4, lift: -0.06 },    // tail root
];
/* A deer's hind leg zigzags — stifle forward, hock back — and a stag drawn
   with four straight tubes reads as a table. Each segment gets its own mass
   so the joints land where a joint would. */
const STAG_LEGS = [
  { cx: 19, cy: 34, rx: 3.6, ry: 6, lift: 0.02 },   // near stifle
  { cx: 15, cy: 42, rx: 2.6, ry: 6, lift: 0.03 },   // near hock
  { cx: 17, cy: 50, rx: 2, ry: 4, lift: 0.0 },      // near cannon
  { cx: 26, cy: 34, rx: 3.2, ry: 6, lift: -0.09 },  // far stifle
  { cx: 23, cy: 42, rx: 2.3, ry: 6, lift: -0.10 },
  { cx: 25, cy: 50, rx: 1.8, ry: 4, lift: -0.12 },
  { cx: 43, cy: 32, rx: 3, ry: 7, lift: -0.06 },    // far fore
  { cx: 42, cy: 45, rx: 2, ry: 7, lift: -0.10 },
  { cx: 49, cy: 31, rx: 3.4, ry: 7, lift: 0.04 },   // near fore
  { cx: 50, cy: 45, rx: 2.2, ry: 7, lift: 0.02 },
];
const STAG_HOOVES = [[17, 53], [25, 53], [42, 53], [50, 53]];
const STAG_SKULL = [
  { cx: 51, cy: 11, rx: 6, ry: 5, lift: 0.06 },
  { cx: 57, cy: 14, rx: 5, ry: 3, lift: -0.02 },
];

function gloamstag() {
  const W = 64, H = 56;
  const mask = new Surface(W, H);

  limb(mask, 14, 24, 9, 4, 17, 4, M.body);           // tail
  massMask(mask, STAG_MASSES, M.body);
  limb(mask, 44, 22, 12, 50, 12, 7, M.body);         // neck
  massMask(mask, STAG_SKULL, M.head);
  mask.poly([[52, 10], [62, 13], [61, 17], [53, 16]], M.head);   // muzzle
  mask.poly([[46, 6], [51, 8], [48, 10]], M.head);               // ear

  // Legs, drawn joint to joint so the zigzag survives.
  for (const seg of [
    [19, 30, 7, 15, 40, 4], [15, 40, 4, 17, 49, 3], [17, 49, 3, 17, 53, 3],
    [26, 30, 6, 23, 40, 3.5], [23, 40, 3.5, 25, 49, 2.6], [25, 49, 2.6, 25, 53, 2.6],
    [43, 27, 6, 42, 40, 3], [42, 40, 3, 42, 49, 2.4], [42, 49, 2.4, 42, 53, 2.4],
    [49, 26, 6.5, 50, 40, 3.4], [50, 40, 3.4, 50, 49, 2.8], [50, 49, 2.8, 50, 53, 2.8],
  ]) limb(mask, ...seg, M.body);
  massMask(mask, STAG_LEGS, M.body);
  for (const [x, y] of STAG_HOOVES) mask.rect(x - 2, y, 4, 3, M.body);

  // Mane along the spine and under the throat.
  mask.poly([[26, 16], [45, 12], [47, 18], [28, 21]], M.mane);
  mask.poly([[44, 14], [50, 12], [49, 21], [43, 20]], M.mane);

  /* Antlers sweep BACK from the brow and then up, four tines a side. Drawn
     forward from the skull they read as a crown; drawn back they read as an
     animal. Kept 2-3px thick so the silhouette survives at 1x. */
  for (const [x0, y0, x1, y1, w0, w1] of [
    [50, 7, 41, 2, 3, 2], [46, 4, 44, 0, 2, 2], [42, 3, 38, 0, 2, 2],
    [52, 6, 48, 1, 3, 2], [50, 3, 52, 0, 2, 2],
    [51, 7, 57, 3, 3, 2], [56, 4, 59, 0, 2, 2],
  ]) limb(mask, x0, y0, w0, x1, y1, w1, M.horn);

  const out = new Surface(W, H);
  const body = isM(mask, M.body);
  const head = isM(mask, M.head);
  out.shadeMasses(body, [...STAG_MASSES, ...STAG_LEGS], STAG_PAL.body, {
    lx: -0.52, ly: -0.66, lz: 0.54, ambient: 0.15, crease: 0.32, mottle: 0.5, seed: 0x3d71,
  });
  out.shadeMasses(head, STAG_SKULL, STAG_PAL.body, {
    lx: -0.4, ly: -0.82, lz: 0.42, ambient: 0.2, crease: 0.26, mottle: 0.22, seed: 0x1c04,
  });
  out.shadeMasses(isM(mask, M.mane), [
    { cx: 31, cy: 17, rx: 7, ry: 3.5, lift: 0.05 },
    { cx: 42, cy: 15, rx: 5, ry: 3.5, lift: 0.0 },
    { cx: 47, cy: 17, rx: 3.5, ry: 5, lift: -0.06 },
  ], STAG_PAL.mane, { lx: -0.5, ly: -0.7, lz: 0.5, ambient: 0.16, crease: 0.32, mottle: 0.46, seed: 0x60ba });
  out.shadeRegion(isM(mask, M.horn), STAG_PAL.horn, { reach: 3, lx: -0.7, ly: -0.7 });

  const ribs = [];
  for (const [x0, y0, x1, y1] of [
    [36, 18, 34, 27], [40, 17, 38, 26], [24, 20, 21, 29], [17, 21, 14, 28],
  ]) ribs.push(...Surface.path(x0, y0, x1, y1));
  ribs.push(...Surface.path(22, 32, 40, 32));                  // the belly line
  ribs.push(...Surface.path(15, 39, 19, 40), ...Surface.path(48, 39, 52, 40));
  out.crease(ribs, STAG_PAL.body);
  // Hooves are the darkest step, always — a deer's foot is horn, not hide.
  for (const [x, y] of STAG_HOOVES) out.rect(x - 2, y, 4, 3, STAG_PAL.body[0]);

  out.rim(body, STAG_PAL.bodyRim, { lx: -0.55, ly: -0.75, depth: 1, minRun: 3 });
  out.rim(head, STAG_PAL.bodyRim, { lx: -0.4, ly: -0.9, depth: 1, minRun: 2 });
  out.rect(55, 11, 2, 2, STAG_PAL.eye);

  out.outline(STAG_PAL.outline);
  return out;
}

/* =========================================================================
   FLUEWYRM — 80 x 48, the medium class, and the sprite that proves the
   method generalises: a body with no limbs at all, made entirely of masses.

   It lives in the cold flues above the refinery and comes down when they
   stoke. Iron-blue scale over a soft underbelly, ember eye. Faces right.
   ========================================================================= */

const WYRM_PAL = {
  outline: C("#080810"),
  scale: [C("#101828"), C("#203048"), C("#385070"), C("#587898")],
  scaleRim: C("#88A8C0"),
  belly: [C("#403040"), C("#786070"), C("#B0A0A0")],
  fin: [C("#301848"), C("#603098"), C("#A878D8")],
  eye: C("#F8A020"),
  fang: C("#E8E0D0"),
};

/* The coil, as a chain of segments along an explicit path. Each segment is
   its own bulge, so the body gets a lit cap and a dark seam PER SEGMENT —
   which is what makes a serpent read as a serpent rather than as a tube.
   The path is a rearing S: tail curled at the bottom left, the body climbing
   through the middle, the neck arriving under the head at the top right. */
const WYRM_PATH = [
  [7, 41], [13, 44], [21, 45], [29, 43], [35, 38], [39, 32],
  [42, 25], [47, 20], [54, 17], [61, 15], [66, 13],
];

function catmull(pts, n) {
  const out = [];
  const P = (i) => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let s = 0; s + 1 < pts.length; s++) {
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const [p0, p1, p2, p3] = [P(s - 1), P(s), P(s + 1), P(s + 2)];
      const q = (a, b, c, d) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const WYRM_SPINE = (() => {
  const curve = catmull(WYRM_PATH, 2);
  return curve.map(([x, y], i) => {
    const t = i / (curve.length - 1);
    // Thin at the tail tip, thickest a third along, tapering to the neck.
    const r = 2.2 + 5.4 * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.82);
    return { cx: x, cy: y, rx: r, ry: r, lift: 0.08 - 0.02 * (i % 3) };
  });
})();

function fluewyrm() {
  const W = 80, H = 48;
  const mask = new Surface(W, H);

  for (let i = 0; i + 1 < WYRM_SPINE.length; i++) {
    const a = WYRM_SPINE[i], b = WYRM_SPINE[i + 1];
    limb(mask, a.cx, a.cy, a.rx * 2, b.cx, b.cy, b.rx * 2, M.body);
  }
  massMask(mask, WYRM_SPINE, M.body);

  // Head: a flat wedge continuing the last segment, jaw slung under.
  const headMasses = [
    { cx: 70, cy: 11, rx: 8, ry: 5, lift: 0.08 },
    { cx: 75, cy: 13, rx: 5, ry: 3, lift: 0.0 },
  ];
  massMask(mask, headMasses, M.head);
  mask.poly([[64, 8], [79, 11], [79, 15], [65, 16]], M.head);
  mask.poly([[66, 16], [78, 16], [77, 19], [67, 19]], M.head);

  // Dorsal fin — a saw of triangles down the spine, the one violet on it.
  // Each spike stands perpendicular to the body at that point, so the saw
  // follows the coil instead of pointing at the ceiling.
  for (let i = 4; i < WYRM_SPINE.length - 3; i += 2) {
    const a = WYRM_SPINE[i - 1], b = WYRM_SPINE[i + 1], s = WYRM_SPINE[i];
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;          // outward, up-left of travel
    const h = s.rx + (i % 4 === 0 ? 6 : 4);
    mask.poly([
      [s.cx + nx * (s.rx - 1) - ny * 3, s.cy + ny * (s.rx - 1) + nx * 3],
      [s.cx + nx * h, s.cy + ny * h],
      [s.cx + nx * (s.rx - 1) + ny * 3, s.cy + ny * (s.rx - 1) - nx * 3],
    ], M.horn);
  }

  // Belly plates — a run of short bands along the underside of the coil,
  // laid perpendicular to the body the same way the fin is.
  for (let i = 1; i < WYRM_SPINE.length - 2; i++) {
    const a = WYRM_SPINE[i - 1], b = WYRM_SPINE[i + 1], s = WYRM_SPINE[i];
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;          // inward, down-right of travel
    limb(mask,
      s.cx + nx * (s.rx - 2.2), s.cy + ny * (s.rx - 2.2), 2.4,
      s.cx + nx * (s.rx + 0.4), s.cy + ny * (s.rx + 0.4), 2.4, M.scale);
  }

  const out = new Surface(W, H);
  const body = isM(mask, M.body);
  const head = isM(mask, M.head);
  out.shadeMasses(body, WYRM_SPINE, WYRM_PAL.scale, {
    lx: -0.5, ly: -0.7, lz: 0.5, ambient: 0.14, crease: 0.42, mottle: 0.48, seed: 0x9e12,
  });
  out.shadeMasses(head, headMasses, WYRM_PAL.scale, {
    lx: -0.45, ly: -0.8, lz: 0.42, ambient: 0.2, crease: 0.3, mottle: 0.2, seed: 0x44a7,
  });
  out.shadeMasses(isM(mask, M.scale), WYRM_SPINE.map((s, i) => {
    const a = WYRM_SPINE[Math.max(0, i - 1)], b = WYRM_SPINE[Math.min(WYRM_SPINE.length - 1, i + 1)];
    const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
    return { cx: s.cx + (-dy / len) * s.rx, cy: s.cy + (dx / len) * s.rx, rx: 2.6, ry: 2.6, lift: 0.05 };
  }), WYRM_PAL.belly, { lx: -0.5, ly: -0.6, lz: 0.62, ambient: 0.3, crease: 0.24, mottle: 0.3, seed: 0xb3c1 });
  out.shadeRegion(isM(mask, M.horn), WYRM_PAL.fin, { reach: 3, lx: -0.6, ly: -0.8 });

  // The seam between segments, cut by hand where the arithmetic is too gentle.
  const seams = [];
  for (let i = 1; i < WYRM_SPINE.length; i++) {
    const a = WYRM_SPINE[i - 1], b = WYRM_SPINE[i];
    const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const r = (a.rx + b.rx) / 2 - 0.6;
    seams.push(...Surface.path(
      Math.round(mx - nx * r), Math.round(my - ny * r),
      Math.round(mx + nx * r), Math.round(my + ny * r)
    ));
  }
  out.crease(seams, WYRM_PAL.scale);

  out.rim(body, WYRM_PAL.scaleRim, { lx: -0.5, ly: -0.8, depth: 1, minRun: 3 });
  out.rim(head, WYRM_PAL.scaleRim, { lx: -0.45, ly: -0.85, depth: 1, minRun: 2 });

  out.rect(72, 11, 2, 2, WYRM_PAL.eye);
  for (const x of [71, 74, 77]) out.rect(x, 15, 1, 2, WYRM_PAL.fang);

  out.outline(WYRM_PAL.outline);
  return out;
}

/* =========================================================================
   ASHGRIEVE — 48 x 64, the medium class, upright.

   A furnace-hand who did not come out, walking still: a hooded shroud stiff
   with slag, an iron frame where the arms should be, and the flue-light of
   the shift it died on still burning behind its ribs.

   The vertical silhouette is the point. Four monsters that are all wider than
   they are tall is not a bestiary, it is one monster four times.

   The second point is the shroud. Its bell is 780 of this sprite's ~1,500
   opaque pixels — over half — so it is the mass that gets the four-step ramp
   and the fold structure, and the small parts borrow. That ordering is the
   whole lesson of this round: spend the ramp where the pixels are.
   ========================================================================= */

const GRIEVE_PAL = {
  outline: C("#100810"),
  cloth: [C("#181018"), C("#302038"), C("#504058"), C("#786078")],
  clothRim: C("#A090A8"),
  ash: [C("#201818"), C("#403430"), C("#685850")],
  /* The iron frame borrows the shroud's darkest step for its own shadow
     rather than taking a sixteenth slot. Sharing the foot of two ramps is
     what a real 4bpp page does, and here it is also true: in the bottom of a
     fold the scorched cloth and the metal under it are the same dark. */
  iron: [C("#181018"), C("#403030"), C("#685050")],
  ember: [C("#B03000"), C("#F07000"), C("#F8B840")],
  eye: C("#F8E8B0"),
};

/* The shroud, and it is deliberately a BELL: narrow at the cowl, widest at
   the hem. A hooded figure drawn as a rectangle reads as a chess piece. */
const GRIEVE_CLOTH = [
  { cx: 24, cy: 21, rx: 9, ry: 5, lift: 0.10 },     // shoulders
  { cx: 22, cy: 31, rx: 8, ry: 8, lift: 0.02 },     // chest fall
  { cx: 24, cy: 44, rx: 10, ry: 11, lift: -0.02 },  // the body of the bell
  { cx: 17, cy: 53, rx: 4.5, ry: 9, lift: 0.06 },   // three hanging folds
  { cx: 24, cy: 55, rx: 4.5, ry: 9, lift: -0.08 },
  { cx: 31, cy: 53, rx: 4.5, ry: 9, lift: -0.02 },
];
const GRIEVE_HOOD = [
  { cx: 25, cy: 10, rx: 7, ry: 8, lift: 0.09 },
  { cx: 27, cy: 16, rx: 6, ry: 5, lift: -0.05 },
];
const GRIEVE_ARMS = [
  { cx: 11, cy: 27, rx: 3.4, ry: 7, lift: 0.10 },
  { cx: 9, cy: 39, rx: 2.8, ry: 7, lift: 0.03 },
  { cx: 37, cy: 28, rx: 3.4, ry: 7, lift: -0.05 },
  { cx: 39, cy: 40, rx: 2.8, ry: 7, lift: -0.11 },
];

function ashgrieve() {
  const W = 48, H = 64;
  const mask = new Surface(W, H);

  // --- the shroud -------------------------------------------------------
  massMask(mask, GRIEVE_CLOTH, M.cloth);
  mask.poly([[17, 20], [32, 20], [36, 56], [13, 56]], M.cloth);
  // A torn hem: five tongues of cloth of different lengths, not a straight cut.
  for (const [x, w, h] of [[13, 5, 4], [19, 4, 7], [24, 5, 3], [29, 4, 6], [33, 4, 2]]) {
    mask.poly([[x, 54], [x + w, 54], [x + w - 1, 56 + h], [x + 1, 56 + h]], M.cloth);
  }

  // --- the cowl ---------------------------------------------------------
  massMask(mask, GRIEVE_HOOD, M.body);
  mask.poly([[19, 11], [25, 0], [31, 11], [32, 22], [18, 22]], M.body);

  // --- the iron frame ---------------------------------------------------
  // Arms hang long and thin outside the shroud, which is what gives the
  // silhouette its two hard verticals against all that soft cloth.
  limb(mask, 15, 21, 7, 11, 33, 5, M.plate);
  limb(mask, 11, 33, 5, 10, 45, 4, M.plate);
  limb(mask, 33, 22, 7, 37, 34, 5, M.plate);
  limb(mask, 37, 34, 5, 39, 46, 4, M.plate);
  massMask(mask, GRIEVE_ARMS, M.plate);
  mask.ellipse(9, 48, 3.4, 3.6, M.plate);
  mask.ellipse(40, 49, 3.4, 3.6, M.plate);

  /* --- the cavity ------------------------------------------------------
     A ribcage, not a porthole. The shroud is open down the chest and four
     iron ribs cross the gap with the flue-light behind them, which is the
     difference between a skeleton and a lamp. */
  mask.ellipse(22, 31, 4.4, 7, M.magma);
  for (const y of [26, 30, 34]) mask.rect(17, y, 11, 1, M.plate);

  // Eye slots under the cowl, deep in its shadow.
  mask.rect(22, 11, 2, 2, M.eye);
  mask.rect(27, 11, 2, 2, M.eye);

  // --- shading ----------------------------------------------------------
  const out = new Surface(W, H);
  const cloth = isM(mask, M.cloth);
  const hood = isM(mask, M.body);
  out.shadeMasses(cloth, GRIEVE_CLOTH, GRIEVE_PAL.cloth, {
    lx: -0.6, ly: -0.52, lz: 0.6, ambient: 0.13, crease: 0.40, mottle: 0.54, seed: 0x7712,
  });
  out.shadeMasses(hood, GRIEVE_HOOD, GRIEVE_PAL.ash, {
    lx: -0.62, ly: -0.6, lz: 0.5, ambient: 0.1, crease: 0.36, mottle: 0.44, seed: 0x4c30,
  });
  out.shadeMasses(isM(mask, M.plate), GRIEVE_ARMS, GRIEVE_PAL.iron, {
    lx: -0.6, ly: -0.6, lz: 0.53, ambient: 0.2, crease: 0.3, mottle: 0.24, seed: 0x0d5e,
  });

  /* Folds. The masses give the bell its round; these are the creases that
     run DOWN it, which is what tells the eye the material is cloth rather
     than stone. Each drops the pixel one ramp step, so a fold crossing a lit
     panel stays lighter than a fold in shadow. */
  const folds = [];
  for (const [x0, y0, x1, y1] of [
    [20, 22, 15, 56], [23, 26, 21, 57], [27, 26, 29, 57], [30, 22, 34, 55],
    [18, 38, 14, 53], [31, 38, 35, 51],
  ]) folds.push(...Surface.path(x0, y0, x1, y1));
  out.crease(folds.filter(([x, y]) => cloth(x, y)), GRIEVE_PAL.cloth);
  // The cowl's own crease, where the hood turns under toward the face.
  out.crease(Surface.path(19, 17, 32, 18).filter(([x, y]) => hood(x, y)), GRIEVE_PAL.ash);

  out.rim(cloth, GRIEVE_PAL.clothRim, { lx: -0.72, ly: -0.5, depth: 1, minRun: 3 });
  out.rim(hood, GRIEVE_PAL.clothRim, { lx: -0.7, ly: -0.62, depth: 1, minRun: 3 });

  // The cavity fire, radial and hottest at the centre, behind the ribs.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isM(mask, M.magma)(x, y)) {
      const d = Math.hypot((x - 22) / 4.4, (y - 31) / 7);
      out.px(x, y, GRIEVE_PAL.ember[Math.min(2, Math.max(0, Math.round((1 - d) * 2.8)))]);
    }
    if (isM(mask, M.eye)(x, y)) out.px(x, y, GRIEVE_PAL.eye);
  }

  out.outline(GRIEVE_PAL.outline);
  return out;
}

/* ---- catalogue ---------------------------------------------------------- */

export const MONSTERS = [
  {
    id: "slagmaw",
    name: "Slagmaw",
    klass: "Medium",
    size: [88, 64],
    blurb: "Sleeps in the cooling slag until something warm walks past. The cracks in its plates never went out.",
    build: slagmaw,
    /* The four slots the runtime rotates to make the seams burn — §6's
       highest-leverage trick, and the reason this sprite has one frame. */
    cycle: SLAGMAW_PAL.magma,
  },
  {
    id: "cinderwisp",
    name: "Cinderwisp",
    klass: "Small",
    size: [40, 40],
    blurb: "What is left when a furnace-hand forgets to come home. Follows lantern light. Will not be spoken to.",
    build: cinderwisp,
    cycle: WISP_PAL.ember,
  },
  {
    id: "gloamstag",
    name: "Gloamstag",
    klass: "Medium",
    size: [64, 56],
    blurb: "Walks the Deepstone galleries where the moss still glows. Its antlers are older than its body.",
    build: gloamstag,
    cycle: null,
  },
  {
    id: "fluewyrm",
    name: "Fluewyrm",
    klass: "Medium",
    size: [80, 48],
    blurb: "Nests in the cold flues and comes down when they stoke. Iron scale, and a temper about the heat.",
    build: fluewyrm,
    cycle: null,
  },
  {
    id: "ashgrieve",
    name: "Ashgrieve",
    klass: "Medium",
    size: [48, 64],
    blurb: "A furnace-hand who never came up. Still walking the shift, still carrying the light it died holding.",
    build: ashgrieve,
    cycle: GRIEVE_PAL.ember,
  },
];

export function monsterSurface(m) {
  const s = m.build();
  if (s.w !== m.size[0] || s.h !== m.size[1]) {
    throw new Error(`${m.id} built ${s.w}x${s.h}, manifest says ${m.size.join("x")}`);
  }
  return s;
}
