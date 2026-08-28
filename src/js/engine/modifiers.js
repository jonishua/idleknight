/* =========================================================================
   EMBERVEIL ENGINE — THE MODIFIER PIPELINE   (§7)

   One rule, applied without exception:

       ALL MODIFIERS OF THE SAME NAMED TYPE SUM TOGETHER, THEN APPLY ONCE.

   "+10% double" and "+5% double" is 15%, never 1.10 x 1.05. A global
   "-10% interval" and a skill-scoped "-10% interval" land in the SAME bucket
   and are worth exactly the same thing. There is no additive-vs-multiplicative
   split: one bucket per modifier name, and scope only decides membership.

   That choice is what makes a loadout a linear optimisation the player can
   actually reason about — which is the whole point of shipping SIGNED
   modifiers (§7.4), where the strongest sources carry real drawbacks.

   Every entry keeps its source string so the UI can show a full audit of who
   contributed what, with sign. An opaque modifier stack is an unreadable one.
   ========================================================================= */

import { PRESERVE_CAP, INTERVAL_REDUCTION_CAP } from "./constants.js";

/**
 * The named families. Scope is expressed by the caller, not by the name:
 * `add("intervalPercent", -0.05, { scope: "delving" })`.
 */
export const MOD = {
  /** Multiplies the XP a completed action pays into its skill. */
  skillXP: "skillXP",
  /** Multiplies mastery XP (and therefore the pool deposit too). */
  masteryXP: "masteryXP",
  /** Percentage interval reduction. ALWAYS applied to the base interval. */
  intervalPercent: "intervalPercent",
  /** Flat interval reduction in seconds, subtracted after the percentages. */
  intervalFlat: "intervalFlat",
  /** Summed probability of doubling an action's output. */
  doubleChance: "doubleChance",
  /** Summed probability an input survives being consumed. Capped at 80%. */
  preserveChance: "preserveChance",
  /** Raises the preservation cap itself. */
  preserveCap: "preserveCap",
  /** Currency earned FROM AN ACTION — deliberately not the same bucket as
   *  currency from selling an item, so a global bonus cannot double dip. */
  currency: "currency",
  /** Currency earned from SELLING an item. */
  saleValue: "saleValue",
  /** "+N base quantity". Tagged in data as non-doublable where it should be. */
  flatQuantity: "flatQuantity",
  /** Reduces the build/purchase cost of a skill's constructions. */
  costReduction: "costReduction",
  /** Raises the mastery pool cap (three sources, +25/+50/+25, additive). */
  poolCap: "poolCap",
  /** Extra HP on a gathering node before it depletes. */
  nodeHp: "nodeHp",
  /** Percentage change to a node's respawn timer. */
  respawnPercent: "respawnPercent",
  /** Combat: flat max hit, flat accuracy rating, healing from provisions. */
  maxHit: "maxHit",
  accuracy: "accuracy",
  healing: "healing",
  /** Chance for a rare/special roll to fire an extra time. */
  rareChance: "rareChance",
};

export class ModifierSet {
  constructor() {
    /** @type {Map<string, {scope: string|null, value: number, source: string}[]>} */
    this.buckets = new Map();
  }

  /**
   * @param {string} name   one of MOD
   * @param {number} value  signed. Reductions are negative.
   * @param {{scope?: string|null, source?: string}} [opts]
   */
  add(name, value, opts = {}) {
    if (!value) return this;
    let bucket = this.buckets.get(name);
    if (!bucket) this.buckets.set(name, (bucket = []));
    bucket.push({ scope: opts.scope ?? null, value, source: opts.source ?? "unknown" });
    return this;
  }

  /** Bulk add: `[["intervalPercent", -0.05], ["skillXP", 0.03]]`. */
  addAll(list, opts = {}) {
    for (const [name, value, extra] of list) {
      this.add(name, value, { ...opts, ...(extra || {}) });
    }
    return this;
  }

  /**
   * Sum a bucket. Unscoped (global) entries always count; scoped entries count
   * when their scope appears in `scopes`. Scopes are skill ids, recipe ids or
   * item ids — the caller decides what is in play for this action.
   */
  sum(name, scopes = null) {
    const bucket = this.buckets.get(name);
    if (!bucket) return 0;
    let total = 0;
    for (const e of bucket) {
      if (e.scope === null) total += e.value;
      else if (scopes && (scopes === e.scope || (Array.isArray(scopes) && scopes.includes(e.scope)))) {
        total += e.value;
      }
    }
    return total;
  }

  /** Every contributing entry, for the tooltip that makes this auditable. */
  breakdown(name, scopes = null) {
    const bucket = this.buckets.get(name) || [];
    return bucket.filter(
      (e) =>
        e.scope === null ||
        (scopes && (scopes === e.scope || (Array.isArray(scopes) && scopes.includes(e.scope))))
    );
  }

  /** Preservation, with §7.2's 80% cap (itself raisable by a named modifier). */
  preserve(scopes) {
    const cap = PRESERVE_CAP + this.sum(MOD.preserveCap, scopes);
    return clamp(this.sum(MOD.preserveChance, scopes), 0, cap);
  }

  /**
   * Interval reduction as the §4.1 formula wants it: a POSITIVE fraction that
   * gets subtracted from 1.
   *
   * Data stores `intervalPercent` as a SIGNED CHANGE to the interval, because
   * §7.4's whole point is that the best modifier sources carry drawbacks and
   * some of them genuinely make you slower: -0.05 is five percent faster,
   * +0.10 is ten percent slower. One bucket, both signs, summed additively —
   * so the flip happens here, once, at the boundary, and never in the data.
   *
   * Clamped so the hyperbolic throughput term in §4.2 stays bounded: an
   * unbounded reduction ladder detonates the economy because rate is
   * 1/(1 - reduction), not linear in it.
   */
  intervalReduction(scopes) {
    return clamp(-this.sum(MOD.intervalPercent, scopes), -Infinity, INTERVAL_REDUCTION_CAP);
  }

  /** Merge another set in (used to layer a loadout over a base). */
  merge(other) {
    for (const [name, bucket] of other.buckets) {
      const mine = this.buckets.get(name);
      if (mine) mine.push(...bucket);
      else this.buckets.set(name, bucket.slice());
    }
    return this;
  }

  /** Flat listing, for the balance report's modifier audit. */
  entries() {
    const out = [];
    for (const [name, bucket] of this.buckets) {
      for (const e of bucket) out.push({ name, ...e });
    }
    return out;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * §4.2 — the reason interval items are chased so hard. Reductions are linear
 * on the base but the RATE is 1/interval, so the marginal value is hyperbolic:
 * the first -10% buys +11% actions/hr, a -10% on top of -50% buys +25%.
 */
export function throughputMultiplier(totalReduction) {
  return 1 / (1 - totalReduction);
}

/** Human-readable sign for the audit UI: "-12%" / "+15%". */
export function signedPercent(v, digits = 0) {
  const p = v * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
}
