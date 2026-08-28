/* =========================================================================
   EMBERVEIL ENGINE — ACTION INTERVALS   (§4)

   The one formula:

       EffectiveInterval = max(
           floor( (Base * (1 - SumPercent) - SumFlat) / 0.05 ) * 0.05,
           0.25 )

   Encoded rules:
     1. Percentages apply to the BASE interval, never to the current one.
        A -10% on a 5 s action always removes exactly 0.5 s.
     2. All percentages sum additively into one pool (§7.1).
     3. Flat reductions subtract AFTER, unmodified by the percentages.
     4. The result is floored to a whole 0.05 s tick.
     5. Hard floor of 0.25 s.

   We work in TICKS, not seconds, because every countdown in the engine is an
   integer tick count. floor(x / 0.05) * 0.05 is exactly ticks/20 where
   ticks = floor(x * 20), so this is the same formula with the float error
   removed from the interior.
   ========================================================================= */

import { TICKS_PER_SECOND, MIN_ACTION_TICKS, EPS } from "./constants.js";

/** Seconds -> whole ticks, floored, guarded against binary-float dust. */
export function secondsToTicks(seconds) {
  return Math.floor(seconds * TICKS_PER_SECOND + EPS);
}

export function ticksToSeconds(ticks) {
  return ticks / TICKS_PER_SECOND;
}

/**
 * The formula, in ticks.
 * @param {number} baseSeconds  the recipe's unmodified interval
 * @param {number} percentReduction  summed, e.g. 0.4 for -40%
 * @param {number} flatSeconds  summed flat reduction in seconds, e.g. 0.2
 */
export function intervalTicks(baseSeconds, percentReduction = 0, flatSeconds = 0) {
  const reduced = baseSeconds * (1 - percentReduction) - flatSeconds;
  const ticks = Math.floor(reduced * TICKS_PER_SECOND + EPS);
  return ticks < MIN_ACTION_TICKS ? MIN_ACTION_TICKS : ticks;
}

/** Same thing expressed in seconds, for reports and tooltips. */
export function intervalSeconds(baseSeconds, percentReduction = 0, flatSeconds = 0) {
  return ticksToSeconds(intervalTicks(baseSeconds, percentReduction, flatSeconds));
}

/**
 * §4.3 — a fishing-style interval that rolls uniformly inside [min, max] every
 * action. Reduction scales BOTH endpoints. It costs nothing to implement and
 * it is the difference between a skill that feels alive and one that is a
 * metronome, so it is worth having in the engine from day one.
 *
 * The roll happens in tick space so replay reproduces it exactly.
 */
export function rollRangeBaseTicks(rng, minSeconds, maxSeconds) {
  const lo = secondsToTicks(minSeconds);
  const hi = secondsToTicks(maxSeconds);
  return hi <= lo ? lo : rng.range(lo, hi);
}

/** Actions per hour at a given tick interval. */
export function actionsPerHour(ticks) {
  return 3600 / ticksToSeconds(ticks);
}
