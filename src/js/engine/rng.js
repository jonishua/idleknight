/* =========================================================================
   EMBERVEIL ENGINE — DETERMINISTIC RNG

   The offline replay in §3 is only honest if it is bit-identical to having
   played those hours live. That means randomness has to be part of the save,
   not of the runtime: same seed + same tick count => same rolls, forever.

   xoshiro128** — four uint32 words of state, serialises to four integers,
   passes the usual statistical batteries, and costs a handful of int ops per
   draw. Math.random() is unseedable and therefore unusable here.
   ========================================================================= */

function rotl(x, k) {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32 — turns one integer seed into well-mixed state words. */
function splitmix32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export class Rng {
  /** @param {number|number[]} seed integer seed, or a serialised 4-word state */
  constructor(seed = 0x51ede1) {
    this.seed(seed);
  }

  seed(seed) {
    if (Array.isArray(seed) || ArrayBuffer.isView(seed)) {
      this.s = Uint32Array.from(seed);
      if (this.s.length !== 4) throw new Error("Rng state must be 4 words");
    } else {
      const mix = splitmix32(seed);
      this.s = Uint32Array.of(mix(), mix(), mix(), mix());
    }
    // All-zero state is a fixed point of xoshiro; nudge it.
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
    return this;
  }

  /** Raw uint32 draw. */
  next() {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform in [0, 1). */
  float() {
    return this.next() / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n) {
    return (this.next() * n) / 4294967296 | 0;
  }

  /** Uniform integer in [lo, hi] inclusive. */
  range(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability p. p <= 0 never fires; p >= 1 always does. */
  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.float() < p;
  }

  /** Serialisable state — goes straight into the save. */
  save() {
    return Array.from(this.s);
  }

  clone() {
    return new Rng(this.save());
  }
}

/**
 * Pick from a weighted table: [{ weight, ... }].
 * `totalWeight` may be precomputed by the caller for hot loops.
 */
export function pickWeighted(rng, table, totalWeight) {
  let total = totalWeight;
  if (total === undefined) {
    total = 0;
    for (const row of table) total += row.weight;
  }
  let roll = rng.float() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll < 0) return row;
  }
  return table[table.length - 1];
}
