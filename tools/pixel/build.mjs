#!/usr/bin/env node
/* =========================================================================
   build.mjs — bake the whole pixel library to disk.

   Every asset ships at 1x. Nothing is ever pre-scaled in the file: the CSS
   and the canvas do the magnifying at an INTEGER factor with
   image-rendering: pixelated, which is the one thing this project cannot get
   wrong. A pre-scaled PNG is a blurry PNG the first time anything resamples
   it, and it locks the scale forever.

   The manifest written alongside is the contract the runtime and the gallery
   both read: geometry, palettes, the fonts' metrics, the palette-cycle slots
   for each monster, and the measured audit of every file.

   Usage:  node tools/pixel/build.mjs   (or: npm run sprites)
   ========================================================================= */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { encode, decode as decodePng } from "./png.mjs";
import { Surface } from "./raster.mjs";
import { hex, windowRamp, RAIL, ATB, TEXT, SLAGFEN, BAND_RAMP_TOP, BAND_RAMP_BOTTOM } from "./palette.mjs";
import { UI_FACE, DAMAGE_FACE } from "./font.mjs";
import { HEROES, heroSurface } from "./heroes.mjs";
import { MONSTERS, monsterSurface } from "./monsters.mjs";
import { slagfen, ashDrift, SLAGFEN_META, FIELD, STAGE } from "./scene.mjs";
import {
  railFrame, windowBand, atbCapsule, ATB_GEOM, BAND,
  ITEMS, itemSurface, fxSlash, fxImpact, fxSigil, contactShadow,
} from "./props.mjs";
import { measure, judge } from "./audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "src/assets/sprites/atelier");

const audit = [];
let bytes = 0;

function write(relPath, surface, kind = "sprite") {
  const path = resolve(OUT, relPath);
  mkdirSync(dirname(path), { recursive: true });
  const png = encode(surface.w, surface.h, surface.data);
  writeFileSync(path, png);
  bytes += png.length;
  const src = `src/assets/sprites/atelier/${relPath}`;

  /* Measured by DECODING THE PNG WE JUST WROTE, not by inspecting the Surface
     that produced it. Auditing the source of truth you already trust proves
     nothing; auditing the shipped bytes catches an encoder bug too. */
  const m = measure(png, { kind });
  const problems = judge(src, m);
  if (problems.length) {
    console.error(`  FAIL  ${relPath}: ${problems.join("; ")}`);
    process.exitCode = 1;
  }

  /* The full measurement goes into the manifest, not just a pass/fail. The
     gallery renders this table verbatim: a claim about palette discipline is
     worth very little standing next to the measurement that backs it, and
     worth a great deal standing on top of one. */
  const record = {
    src, kind, w: m.w, h: m.h,
    colours: m.colours,
    offGrid: m.offGrid,
    dither: m.dither,
    flat: m.flat,
    flatMain: m.flatMain,
    mainArea: m.mainArea,
    families: m.families,
    opaque: m.opaque,
    tileMedian: m.tileMedian,
    tileMax: m.tileMax,
    palette: surfacePalette(surface),
    ok: problems.length === 0,
    problems,
  };
  audit.push(record);
  return record;
}

/** Every distinct colour in a surface, brightest last — the sprite's page. */
function surfacePalette(surface) {
  const out = [];
  for (const key of surface.colours()) {
    out.push([(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]);
  }
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return out.sort((a, b) => lum(a) - lum(b)).map(hex);
}

console.log("\nEmberveil pixel library\n");

/* ---- fonts -------------------------------------------------------------- */
const ui = UI_FACE();
const dmg = DAMAGE_FACE();
const fonts = {
  ui: { ...write("font-ui.png", ui.surface), metrics: ui.metrics },
  damage: { ...write("font-damage.png", dmg.surface), metrics: dmg.metrics },
};
console.log(`  fonts     ui ${ui.surface.w}x${ui.surface.h}, damage ${dmg.surface.w}x${dmg.surface.h}`);

/* ---- heroes ------------------------------------------------------------- */
const heroes = HEROES.map((h) => {
  const poses = {};
  for (const pose of Object.keys(h.poses)) {
    poses[pose] = write(`heroes/${h.id}-${pose}.png`, heroSurface(h, pose));
  }
  return {
    id: h.id, name: h.name, full: h.full, order: h.order, blurb: h.blurb,
    palette: Object.entries(h.palette).map(([k, v]) => ({ key: k, hex: hex(v) })),
    poses,
  };
});
console.log(`  heroes    ${heroes.length} adepts, ${heroes.reduce((n, h) => n + Object.keys(h.poses).length, 0)} poses`);

/* ---- monsters ----------------------------------------------------------- */
const monsters = MONSTERS.map((m) => ({
  id: m.id, name: m.name, klass: m.klass, blurb: m.blurb,
  sprite: write(`monsters/${m.id}.png`, monsterSurface(m)),
  cycle: m.cycle ? m.cycle.map(hex) : null,
}));
console.log(`  monsters  ${monsters.map((m) => `${m.name} ${m.sprite.w}x${m.sprite.h}`).join(", ")}`);

/* ---- scene -------------------------------------------------------------- */
const field = slagfen();
const scene = {
  ...SLAGFEN_META,
  contactShadow: hex(SLAGFEN_META.contactShadow),
  field: write("scenes/slagfen.png", field, "scene"),
  ash: write("scenes/slagfen-ash.png", ashDrift()),
  size: FIELD,
};
console.log(`  scene     ${scene.name} ${field.w}x${field.h}`);

/* ---- window chrome ------------------------------------------------------ */
/* The window is a BACKGROUND layer in hardware terms, not a sprite: eight
   rail metals plus a twenty-step interior wash is far past a sprite page, and
   correctly so. It is budgeted per 8x8 tile the way §2 budgets a scene. */
const chrome = {
  band: write("ui/window-band.png", windowBand(), "scene"),
  atb: write("ui/atb-capsule.png", atbCapsule()),
  railDemo: write("ui/rail-specimen.png", railSpecimen(), "scene"),
  geometry: BAND,
  atbGeometry: {
    w: ATB_GEOM.w, h: ATB_GEOM.h,
    fillX: ATB_GEOM.fillX, fillTravel: ATB_GEOM.fillTravel,
    fillY: ATB_GEOM.fillY, fillRows: ATB_GEOM.fillRows,
    edge: hex(ATB_GEOM.edge), core: hex(ATB_GEOM.core),
  },
};

/** A bare 56x40 rail, for the gallery to show the cross-section against. */
function railSpecimen() {
  const s = new Surface(56, 40);
  const ramp = windowRamp();
  const frame = railFrame(56, 40);
  for (let y = 0; y < 40; y++) {
    const idx = BAND_RAMP_TOP + Math.round((y / 39) * (BAND_RAMP_BOTTOM - BAND_RAMP_TOP));
    for (let x = 0; x < 56; x++) {
      const rail = frame.get(x, y);
      if (rail) s.px(x, y, rail);
      else {
        const corner = Math.min(x + y, 55 - x + y, x + 39 - y, 55 - x + 39 - y);
        if (corner >= 4) s.px(x, y, ramp[idx]);
      }
    }
  }
  return s;
}

/* ---- items & effects ---------------------------------------------------- */
const items = ITEMS.map((it) => ({
  id: it.id, name: it.name, kind: it.kind, blurb: it.blurb,
  sprite: write(`items/${it.id}.png`, itemSurface(it)),
}));

const fx = {
  slash: write("fx/slash.png", fxSlash()),
  impact: write("fx/impact.png", fxImpact()),
  sigil: write("fx/sigil.png", fxSigil()),
  shadowSmall: write("fx/shadow-small.png", contactShadow(14, 3, SLAGFEN_META.contactShadow)),
  shadowMed: write("fx/shadow-med.png", contactShadow(26, 3, SLAGFEN_META.contactShadow)),
  shadowLarge: write("fx/shadow-large.png", contactShadow(46, 5, SLAGFEN_META.contactShadow)),
};
console.log(`  props     ${items.length} items, ${Object.keys(fx).length} effects, window band + ATB capsule`);

/* ---- the benchmark ------------------------------------------------------
   Measure the REFERENCE with the same code that measures us, at build time,
   from the real capture on disk. A page that prints our flatness next to a
   number we typed in is a page making a claim; a page that prints it next to
   a number it just computed off ffvi-battle-native-a.png is a page showing
   its work. Both crops are located by the 8px tile grid: the hero at
   (188,64) and the medium monster's bounding box at (18,83).

   The monster crop carries desert behind it, so it is measured through a
   green mask — the animal's hide is the only thing in that box where the
   green channel is not below the red. */
function benchmark() {
  const src = resolve(ROOT, "reference/shots/ffvi-battle-native-a.png");
  if (!existsSync(src)) return null;
  const { width, height, data } = decodePng(readFileSync(src));
  const crop = (x0, y0, w, h, keep) => {
    const s = new Surface(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * width + x0 + x) * 4;
      if (y0 + y >= height || x0 + x >= width) continue;
      const c = [data[o], data[o + 1], data[o + 2]];
      if (keep && !keep(c)) continue;
      s.px(x, y, c.map((v) => Math.min(248, Math.round(v / 8) * 8)));
    }
    return measure(encode(s.w, s.h, s.data), { kind: "sprite" });
  };
  return {
    note: "measured at build time from reference/shots/ffvi-battle-native-a.png by tools/pixel/audit.mjs",
    hero: { crop: "188,64 16x24", ...crop(188, 64, 16, 24) },
    monster: { crop: "18,83 77x57, hide only", ...crop(18, 83, 77, 57, (c) => c[1] >= c[0]) },
  };
}

/* ---- manifest ----------------------------------------------------------- */
const manifest = {
  benchmark: benchmark(),
  generated: "tools/pixel/build.mjs",
  note: "Every asset is authored and shipped at 1x. Scale with integers only.",
  stage: STAGE,
  scene,
  heroes,
  monsters,
  items,
  fx,
  chrome,
  fonts,
  palette: {
    windowRamp: windowRamp().map(hex),
    bandSlice: [BAND_RAMP_TOP, BAND_RAMP_BOTTOM],
    rail: Object.fromEntries(Object.entries(RAIL).map(([k, v]) => [k, hex(v)])),
    atb: Object.fromEntries(Object.entries(ATB).map(([k, v]) => [k, hex(v)])),
    text: Object.fromEntries(Object.entries(TEXT).map(([k, v]) => [k, hex(v)])),
    scene: Object.fromEntries(
      Object.entries(SLAGFEN).map(([k, v]) => [k, Array.isArray(v[0]) ? v.map(hex) : hex(v)])
    ),
  },
  audit,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n  ${audit.length} PNGs, ${(bytes / 1024).toFixed(1)} KB total, manifest written`);
console.log(process.exitCode ? "  BUILD FAILED — see failures above\n" : "  every asset passed the 5-bit / budget / dither audit\n");
