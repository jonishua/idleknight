/* =========================================================================
   EMBERVEIL ENGINE — THE XP CURVE   (reference/melvor-math.md §1)

   XP to go from level L-1 to L:

       delta(L) = floor( (1/4) * ( (L-1) + 300 * 2^((L-1)/7) ) )

   Cumulative XP to *reach* level L — the number we store and compare:

       xpAt(L) = floor( (1/4) * SUM(n = 1 .. L-1) floor( n + 300 * 2^(n/7) ) )

   The two floors sit in different places. In the cumulative form the per-term
   floor is INSIDE the sum and the quarter is applied to the running total. Get
   that wrong and you drift by a few XP by level 40 and by thousands by 99.

   Both skill levels and mastery levels read this one table (§2).
   ========================================================================= */

import { SKILL_CAP, ASCENSION_CAP, TABLE_MAX } from "./constants.js";

/** Cumulative XP indexed by level. XP_TABLE[1] === 0, XP_TABLE[99] === 13034431. */
export const XP_TABLE = (() => {
  const t = new Float64Array(TABLE_MAX + 2);
  let acc = 0;
  t[0] = 0;
  t[1] = 0;
  for (let n = 1; n <= TABLE_MAX; n++) {
    acc += Math.floor(n + 300 * Math.pow(2, n / 7));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;
})();

/** Cumulative XP required to reach `level`. */
export function xpAt(level) {
  if (level <= 1) return 0;
  if (level > TABLE_MAX + 1) level = TABLE_MAX + 1;
  return XP_TABLE[level];
}

/** XP required for the single step from `level - 1` to `level`. */
export function deltaXp(level) {
  if (level <= 1) return 0;
  return xpAt(level) - xpAt(level - 1);
}

/**
 * Level for a given cumulative XP, clamped to `cap`.
 * Binary search over the precomputed table — never a loop over levels.
 */
export function levelAt(xp, cap = SKILL_CAP) {
  if (!(xp > 0)) return 1;
  let lo = 1;
  let hi = Math.min(cap, TABLE_MAX);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * "Virtual" level — keeps counting past the cap. Display-only for the player,
 * but real for rare-drop math (§1.2).
 */
export function virtualLevelAt(xp) {
  return levelAt(xp, TABLE_MAX);
}

/** Fraction of the way from the current level to the next, 0..1. */
export function levelProgress(xp, cap = SKILL_CAP) {
  const lvl = levelAt(xp, cap);
  if (lvl >= cap) return 1;
  const lo = xpAt(lvl);
  const hi = xpAt(lvl + 1);
  return hi === lo ? 1 : (xp - lo) / (hi - lo);
}

/**
 * The property that carries the whole design: XP doubles every seven levels.
 * 1.995 by level 10, exactly 2.000 by level 66.
 */
export function doublingRatio(level) {
  const a = deltaXp(level);
  return a === 0 ? NaN : deltaXp(level + 7) / a;
}

/** Hours to take a skill from `fromXp` to `level` at a measured XP/second. */
export function hoursToLevel(xpPerSecond, level, fromXp = 0) {
  if (!(xpPerSecond > 0)) return Infinity;
  return Math.max(0, xpAt(level) - fromXp) / xpPerSecond / 3600;
}

export const CAPS = { skill: SKILL_CAP, ascension: ASCENSION_CAP, table: TABLE_MAX };
