/* =========================================================================
   raster.mjs — the drawing surface every sprite and scene is painted on.

   Deliberately primitive. There is no antialiasing, no alpha blending and no
   sub-pixel anything, because §0 of the art spec says any of those emit
   off-grid colours and instantly read as "modern engine faking retro". A
   pixel is set or it is not; a colour is on the /8 grid or the encoder
   refuses it.

   Two ideas here do most of the work:

   • band() posterises a lighting term to a fixed number of steps, which is
     how you get FFVI's hard-edged flat regions instead of a soft gradient.
     Shading is a lookup into a 3-step ramp, never a multiply.

   • dither() is metered. The audit measures 2x2 checkerboard coverage across
     every shipped asset and fails the build over 4%, because the reference
     measured real FFVI frames at 1.3-4.3% and "dithering is a spice, not a
     technique".
   ========================================================================= */

import { snes, isFiveBit, hex } from "./palette.mjs";

export class Surface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4); // RGBA, all zero = transparent
  }

  static from(w, h, fn) {
    const s = new Surface(w, h);
    fn(s);
    return s;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Set one pixel. `c` is [r,g,b] already on the 5-bit grid, or null to erase. */
  px(x, y, c) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return this;
    const o = (y * this.w + x) * 4;
    if (c === null) {
      this.data[o] = this.data[o + 1] = this.data[o + 2] = this.data[o + 3] = 0;
      return this;
    }
    if (!isFiveBit(c)) throw new Error(`off-grid colour ${hex(c)} at ${x},${y}`);
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
    this.data[o + 3] = 255;
    return this;
  }

  get(x, y) {
    if (!this.inside(x, y)) return null;
    const o = (y * this.w + x) * 4;
    if (this.data[o + 3] === 0) return null;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }

  opaque(x, y) {
    if (!this.inside(x, y)) return false;
    return this.data[(y * this.w + x) * 4 + 3] !== 0;
  }

  fill(c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.px(x, y, c);
    return this;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
    return this;
  }

  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }

  /** Bresenham. Integer endpoints only — there is no other kind here. */
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Solid axis-aligned ellipse by scanline. cx,cy may be half-integers. */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = (y + 0.5 - cy) / ry;
      if (Math.abs(t) > 1) continue;
      const half = rx * Math.sqrt(1 - t * t);
      const x0 = Math.round(cx - half);
      const x1 = Math.round(cx + half) - 1;
      for (let x = x0; x <= x1; x++) this.px(x, y, c);
    }
    return this;
  }

  /** Even-odd polygon fill. Points are [x,y] pairs in surface space. */
  poly(points, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of points) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if (y0 === y1) continue;
        if (sy >= Math.min(y0, y1) && sy < Math.max(y0, y1)) {
          xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y, c);
      }
    }
    return this;
  }

  /* ---- authored grids ---------------------------------------------------
     A character grid is the honest way to author a sprite: one glyph per
     pixel, one string per row, so the thing you read is the thing that
     ships. `key` maps glyph -> colour, with "." reserved for transparent.
     --------------------------------------------------------------------- */

  grid(x, y, rows, key, { flip = false } = {}) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, j) => {
      const padded = row.padEnd(w, ".");
      for (let i = 0; i < w; i++) {
        const ch = padded[flip ? w - 1 - i : i];
        if (ch === "." || ch === " ") continue;
        if (!(ch in key)) throw new Error(`unknown grid glyph "${ch}" at ${i},${j}`);
        const c = key[ch];
        if (c === null) continue;
        this.px(x + i, y + j, c);
      }
    });
    return this;
  }

  static gridSize(rows) {
    return { w: Math.max(...rows.map((r) => r.length)), h: rows.length };
  }

  /* ---- compositing ------------------------------------------------------ */

  blit(src, x, y, { flip = false, tint = null } = {}) {
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.w; i++) {
        const sx = flip ? src.w - 1 - i : i;
        const c = src.get(sx, j);
        if (!c) continue;
        this.px(x + i, y + j, tint || c);
      }
    }
    return this;
  }

  /** Replace every instance of one exact colour with another. */
  swap(from, to) {
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      if (this.data[i] === from[0] && this.data[i + 1] === from[1] && this.data[i + 2] === from[2]) {
        this.data[i] = to[0]; this.data[i + 1] = to[1]; this.data[i + 2] = to[2];
      }
    }
    return this;
  }

  /* ---- shading ----------------------------------------------------------
     §2: light comes from the upper-left, everywhere, always.
     --------------------------------------------------------------------- */

  /**
   * Posterise a continuous lighting term into `steps` hard bands. This is the
   * single function that keeps our shading FFVI-shaped: flat regions with one
   * clean ramp step between them, not a gradient.
   */
  static band(t, steps) {
    return Math.min(steps - 1, Math.max(0, Math.floor(t * steps)));
  }

  /**
   * Shade every opaque pixel matching `mask` with a ramp, using an upper-left
   * light and the pixel's depth into the shape (distance from the lit edge).
   * `shape(x,y)` returns true for pixels in the region.
   */
  shadeRegion(shape, ramp, { lx = -0.7, ly = -0.7, bias = 0, reach = 7 } = {}) {
    // Distance to the nearest non-shape pixel, measured along the light
    // direction, gives a cheap and very controllable "how buried is this".
    // `reach` is the shape's own scale: a 26px-wide body needs a longer probe
    // than a 6px antler or every interior pixel collapses onto one step.
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!shape(x, y)) continue;
        let d = 0;
        for (let k = 1; k <= reach; k++) {
          if (!shape(Math.round(x + lx * k), Math.round(y + ly * k))) break;
          d = k;
        }
        const t = d / reach + bias;
        const idx = ramp.length - 1 - Surface.band(Math.min(0.999, Math.max(0, t)), ramp.length);
        this.px(x, y, ramp[idx]);
      }
    }
    return this;
  }

  /**
   * Shade a solid form with an upper-left light.
   *
   * shadeRegion() measures depth from the lit EDGE, which gives a rim — right
   * for a thin limb, wrong for a body, where it collapses the whole interior
   * onto the darkest step. This measures how far along the light direction a
   * pixel sits ACROSS the form, which is how you actually shade a mass: a lit
   * upper-left third, a mid body, a shadowed lower-right. Posterising that
   * plane is what turns it into flat FFVI regions instead of a gradient.
   *
   * `ao` mixes a little of the edge-depth term back in so crevices between
   * overlapping masses still darken.
   */
  shadeForm(shape, ramp, { lx = -0.7, ly = -0.7, ao = 0.25, aoReach = 5, gamma = 1 } = {}) {
    let minU = Infinity, maxU = -Infinity;
    // Projection onto the light vector: up-left pixels score highest, so t=1
    // is the lit shoulder of the form and t=0 its shadowed underside.
    const u = (x, y) => x * lx + y * ly;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!shape(x, y)) continue;
      const v = u(x, y);
      if (v < minU) minU = v;
      if (v > maxU) maxU = v;
    }
    const span = Math.max(1e-6, maxU - minU);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!shape(x, y)) continue;
        let t = (u(x, y) - minU) / span;
        if (gamma !== 1) t = Math.pow(t, gamma);
        if (ao > 0) {
          let d = 0;
          for (let k = 1; k <= aoReach; k++) {
            if (!shape(Math.round(x + lx * k), Math.round(y + ly * k))) break;
            d = k;
          }
          t -= ao * (d / aoReach);
        }
        this.px(x, y, ramp[Surface.band(Math.min(0.999, Math.max(0, t)), ramp.length)]);
      }
    }
    return this;
  }

  /**
   * Shade a form as a set of ANATOMICAL MASSES rather than as one lit plane.
   *
   * This function exists because of a measurement. Decoding the medium monster
   * out of reference/shots/ffvi-battle-native-a.png and asking "what share of
   * its pixels sit inside a uniform 3x3 patch" gives 3.2%. Asking the same of
   * our previous slagmaw.png gave 42%. The reference monster's hide is only
   * three values deep — #182818 / #303820 / #505030, 13% to 30% luminance —
   * and each value carries roughly a third of the hide. It does not read as a
   * blob because those three values are distributed by ANATOMY: every muscle
   * group is a small lit cap with a dark crease against its neighbour.
   *
   * A single projected lighting plane cannot produce that no matter how it is
   * tuned; it produces one lit side and one dark side, which is a lozenge.
   * So instead: declare the masses under the skin, light each one as its own
   * ellipsoid, and take the strongest term. Where two masses meet, both terms
   * are near zero and the ramp's darkest step lands in the seam by itself.
   *
   *   masses  [{ cx, cy, rx, ry, lift?, reach? }]
   *   lift    biases one mass up or down the ramp (a shoulder catches more
   *           light than a belly; both are still lit from the upper-left)
   *   crease  how hard the seam between adjacent masses darkens
   *   mottle  fraction of pixels nudged one step at a band boundary — the
   *           organic break a pixel artist puts on a hard shading edge. It is
   *           value noise, not a checkerboard, so it does not read as dither.
   */
  shadeMasses(shape, masses, ramp, {
    lx = -0.55, ly = -0.62, lz = 0.56,
    ambient = 0.2, crease = 0.3, mottle = 0, seed = 0x2f6b, gamma = 1,
  } = {}) {
    const ln = Math.hypot(lx, ly, lz) || 1;
    const Lx = lx / ln, Ly = ly / ln, Lz = lz / ln;
    const hash = (x, y) => {
      let h = (x * 0x1f1f1f1f) ^ (y * 0x2545f491) ^ seed;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!shape(x, y)) continue;
        let best = -Infinity, bestR = 2;
        for (const m of masses) {
          const ux = (x + 0.5 - m.cx) / m.rx;
          const uy = (y + 0.5 - m.cy) / m.ry;
          const r = Math.hypot(ux, uy);
          // Outside its own ellipse a mass still lights the skin, dimming with
          // distance — otherwise the gaps between masses go to pure black and
          // the animal turns into a constellation.
          const rc = Math.min(1, r);
          const nz = Math.sqrt(Math.max(0, 1 - rc * rc));
          const lam = (ux / Math.max(1e-6, r)) * Lx * rc + (uy / Math.max(1e-6, r)) * Ly * rc + nz * Lz;
          let t = ambient + (1 - ambient) * Math.max(0, lam) + (m.lift || 0);
          if (r > 1) t *= Math.exp(-(r - 1) * (m.reach ? 1 / m.reach : 1.7));
          if (t > best) { best = t; bestR = r; }
        }
        // The seam. In the belly of a mass bestR is small; where two masses
        // abut, every mass covering the pixel is at its own rim, so bestR is
        // high — which is exactly the crease line the eye reads as anatomy.
        if (crease > 0 && bestR > 0.82) best -= crease * Math.min(1, (bestR - 0.82) / 0.3);
        let t = Math.min(0.999, Math.max(0, best));
        if (gamma !== 1) t = Math.pow(t, gamma);
        let idx = Surface.band(t, ramp.length);
        if (mottle > 0) {
          const cell = t * ramp.length - idx;             // 0..1 within the band
          const edge = Math.min(cell, 1 - cell) * 2;      // 0 at a boundary
          if (edge < mottle && hash(x, y) < 0.55) {
            idx = Math.min(ramp.length - 1, Math.max(0, idx + (cell < 0.5 ? -1 : 1)));
          }
        }
        this.px(x, y, ramp[idx]);
      }
    }
    return this;
  }

  /**
   * Cut a 1px dark line along a path, in whatever ramp step is one below the
   * pixel already there. Muscle seams, garment folds, plate edges: the marks a
   * pixel artist makes last and that carry most of the read at 16px.
   */
  crease(points, ramp, { drop = 1 } = {}) {
    const idxOf = (c) => ramp.findIndex((r) => r[0] === c[0] && r[1] === c[1] && r[2] === c[2]);
    for (const [x, y] of points) {
      const c = this.get(x, y);
      if (!c) continue;
      const i = idxOf(c);
      if (i < 0) continue;
      this.px(x, y, ramp[Math.max(0, i - drop)]);
    }
    return this;
  }

  /** The pixels a Bresenham line would touch, as a point list. */
  static path(x0, y0, x1, y1) {
    const out = [];
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  /**
   * Paint the lit crest of a form: the run of `shape` pixels whose up-light
   * neighbour lies outside the shape.
   *
   * This is the step that separates our monsters from mud, and it is measured
   * rather than invented. The reference's medium monster resolves to
   * #004830 #007060 #60A860 #B0D070 — a ramp whose TOP step sits at 82%
   * luminance and is reached only along the back and shoulder. Shade a mass
   * with a posterised plane alone and that brightest step lands as a broad
   * wash; reserving it for the silhouette's lit edge is what makes an 88x64
   * shape read as a solid body at a glance instead of a dark blob.
   *
   * `depth` thickens the crest where a form is big enough to carry it;
   * `minRun` drops speckle so the crest reads as a line, not as noise.
   */
  rim(shape, colour, { lx = -0.7, ly = -0.7, depth = 1, minRun = 0 } = {}) {
    const hits = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!shape(x, y)) continue;
        let free = 0;
        for (let k = 1; k <= depth; k++) {
          if (shape(Math.round(x + lx * k), Math.round(y + ly * k))) break;
          free = k;
        }
        if (free > 0) hits.push([x, y]);
      }
    }
    if (minRun > 1) {
      const set = new Set(hits.map(([x, y]) => y * this.w + x));
      const runLength = (x, y) => {
        let run = 1;
        for (let k = 1; set.has(y * this.w + x + k); k++) run++;
        for (let k = 1; set.has(y * this.w + x - k); k++) run++;
        return run;
      };
      for (const [x, y] of hits) if (runLength(x, y) >= minRun) this.px(x, y, colour);
      return this;
    }
    for (const [x, y] of hits) this.px(x, y, colour);
    return this;
  }

  /**
   * Trace a 1px outline around everything opaque. §2: outlines are COLOURED —
   * tinted toward the scene, never #000000.
   */
  outline(c, { diagonal = true } = {}) {
    const src = this.data.slice();
    const op = (x, y) =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3] !== 0;
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const n8 = [...n4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const ns = diagonal ? n8 : n4;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (op(x, y)) continue;
        if (ns.some(([dx, dy]) => op(x + dx, y + dy))) this.px(x, y, c);
      }
    }
    return this;
  }

  /* ---- dithering --------------------------------------------------------
     Three sanctioned jobs only (§2): fading a sky band it cannot afford more
     palette steps for, standing in for transparency, and a single transition
     row between two ramp steps. Never as texture.
     --------------------------------------------------------------------- */

  /** 50% checkerboard of `c` over a rect. Phase keeps adjacent bands aligned. */
  dither(x, y, w, h, c, phase = 0) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (((x + i + y + j + phase) & 1) === 0) this.px(x + i, y + j, c);
      }
    }
    return this;
  }

  /* ---- transforms ------------------------------------------------------- */

  crop(x, y, w, h) {
    const out = new Surface(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = this.get(x + i, y + j);
      if (c) out.px(i, j, c);
    }
    return out;
  }

  clone() {
    const out = new Surface(this.w, this.h);
    out.data.set(this.data);
    return out;
  }

  /** Trim to the opaque bounding box; returns { surface, x, y }. */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.opaque(x, y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /* ---- measurement (used by the audit) ---------------------------------- */

  colours() {
    const set = new Set();
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      set.add((this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2]);
    }
    return set;
  }
}

/**
 * Smooth 2D value noise on a lattice, deterministic from a seed.
 *
 * The scene needs this for one specific reason. Round 1 separated every
 * colour band with `dither(0, y, W, 1, …)` — a perfectly straight,
 * full-width, single-row checkerboard — and the critic read the result
 * exactly as it deserved: "a strict alternating checker in a dead-straight
 * line that reads as a tiling artifact". Real 16-bit skies and ground have
 * band boundaries that WANDER, and dither only where the boundary actually
 * falls. Two octaves of this, one wobbling the boundary and one mottling the
 * fill, is the whole difference between painted and printed.
 */
export function noise2(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = hash(x0, y0), b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

/** Deterministic value noise — a seeded PRNG so every build is byte-identical. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
