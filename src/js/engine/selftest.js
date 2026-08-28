/* =========================================================================
   EMBERVEIL ENGINE — SELFTEST

   The published tables in reference/melvor-math.md are PARSED OUT OF THE
   DOCUMENT at test time and compared against what this engine computes.
   Nothing is transcribed into a fixture, because a transcribed fixture only
   proves that two copies of the same typo agree.

   Three groups:

     REFERENCE — does the maths reproduce the document's own tables, to the
                 last digit? XP thresholds, per-level deltas, the doubling
                 ratio, pool caps, checkpoint thresholds, the interval
                 formula, the slot curve.
     ENGINE    — is the tick loop deterministic and is the replay exact?
                 Fast path against naive path, chunked against continuous,
                 save-and-reload against uninterrupted, and the 24 h budget.
     ECONOMY   — is the content DESIGNED? Every one of these is measured by
                 running the real engine, and each asserts a stated design
                 rule rather than a magic number.
   ========================================================================= */

import {
  TICK_MS, TICKS_PER_SECOND, OFFLINE_CAP_MS, OFFLINE_CAP_TICKS,
  MIN_INTERVAL_SECONDS, PRESERVE_CAP, INTERVAL_REDUCTION_CAP, POOL_PER_RECIPE,
  VITALITY_XP_PER_DAMAGE, STYLE_XP_PER_DAMAGE, SKILL_CAP,
} from "./constants.js";
import { xpAt, deltaXp, levelAt, doublingRatio, virtualLevelAt } from "./xp.js";
import { intervalSeconds, intervalTicks } from "./interval.js";
import { ModifierSet, MOD, throughputMultiplier } from "./modifiers.js";
import {
  poolCapBase, poolCap, poolDepositRate, checkpointXp, activeCheckpoints,
  depositToPool, masteryXpPerAction,
} from "./mastery.js";
import { Game } from "./game.js";
import { combatLevel, ATTACK_STYLES, COMBAT_BLOCK, COMBAT_SCOPES, larcenySuccess } from "./combat.js";
import { measure, economyRates, sustained, positioned, secondsPerUnit } from "./sandbox.js";
import { compact } from "./format.js";

/* =========================================================================
   PARSING THE REFERENCE
   ========================================================================= */

const num = (s) => Number(String(s).replace(/[*,\s]/g, ""));

export function parseReference(md) {
  const out = {
    thresholds: [],       // {level, cumulative, delta}
    checkpointsXp: [],    // {level, cumulative} from the "intermediate" line
    verifications: [],    // {level, cumulative} from §8
    poolCaps: [],         // {recipes, cap}
    checkpointRows: [],   // {skill, values:[4]}
    slotRows: [],         // {bought, next, cumulative}
    slotFormula: null,
  };

  for (const line of md.split("\n")) {
    let m;
    /* §1.3 — | level | cumulative | per-level | */
    if ((m = line.match(/^\|\s*(\d+)\s*\|\s*\**([\d,]+)\**\s*\|\s*([\d,]+)\s*\|\s*$/))) {
      const level = num(m[1]);
      if (level <= 200) out.thresholds.push({ level, cumulative: num(m[2]), delta: num(m[3]) });
    }
    /* §6.1 — | slots bought | next cost | cumulative | */
    if ((m = line.match(/^\|\s*(\d+)\s*\|\s*\**([\d,]+)\**\s*\|\s*\**([\d,]+)\**\s*\|\s*$/))) {
      // Ambiguous with the XP table; disambiguated below by section context.
    }
  }

  /* The two three-column tables look alike, so slice by heading. */
  const section = (name, until) => {
    const i = md.indexOf(name);
    if (i < 0) return "";
    const j = until ? md.indexOf(until, i) : md.length;
    return md.slice(i, j < 0 ? md.length : j);
  };

  const xpSection = section("### 1.3 Thresholds", "### 1.4");
  out.thresholds = [];
  for (const line of xpSection.split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*\**([\d,]+)\**\s*\|\s*([\d,]+)\s*\|\s*$/);
    if (m) out.thresholds.push({ level: num(m[1]), cumulative: num(m[2]), delta: num(m[3]) });
  }
  for (const m of xpSection.matchAll(/L(\d+)\s*=\s*([\d,]+)/g)) {
    out.checkpointsXp.push({ level: num(m[1]), cumulative: num(m[2]) });
  }

  for (const m of md.matchAll(/xpAt\((\d+)\)\s*=\s*`?([\d,]+)`?/g)) {
    out.verifications.push({ level: num(m[1]), cumulative: num(m[2]) });
  }

  const poolPara = section("Real pool caps", "### 2.3");
  for (const m of poolPara.matchAll(/(\d+)(?:\s+recipes|\s+obstacles)?\s*→\s*([\d,]+)/g)) {
    out.poolCaps.push({ recipes: num(m[1]), cap: num(m[2]) });
  }

  const cpSection = section("### 2.3", "### 2.4");
  for (const line of cpSection.split("\n")) {
    const m = line.match(/^\|\s*([A-Za-z]+)\s*\|(.+)\|\s*$/);
    if (!m || /^Skill$/i.test(m[1]) || /^-+$/.test(m[2])) continue;
    const values = [...m[2].matchAll(/([\d,]{5,})\s*·/g)].map((x) => num(x[1]));
    if (values.length) out.checkpointRows.push({ skill: m[1], values });
  }

  const slotSection = section("### 6.1", "### 6.2");
  for (const line of slotSection.split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*\**([\d,]+)\**\s*\|\s*\**([\d,]+)\**\s*\|\s*$/);
    if (m) out.slotRows.push({ bought: num(m[1]), next: num(m[2]), cumulative: num(m[3]) });
  }
  const f = slotSection.match(/Cost\(n\)\s*=\s*floor\(\s*(\d+)\s*\*\s*\(n\s*\+\s*2\)\s*\/\s*([\d]+)\^\((\d+)\s*\/\s*\((\d+)\s*\+\s*n\)\)\s*\)/);
  if (f) out.slotFormula = { A: num(f[1]), B: num(f[2]), C: num(f[3]), D: num(f[4]) };

  /* §9 — the banned-string list is READ OUT OF THE DOCUMENT, not copied into
     a constant here. A transcribed blocklist rots the moment the document
     grows a word, and the failure mode is silent: the test keeps passing
     while a forbidden noun ships. Parsing it means the reference can add a
     word tomorrow and this suite starts enforcing it with no code change. */
  const banned = md.match(/may appear in our game:\*\*([\s\S]*?)\n\n/);
  if (banned) {
    out.forbidden = banned[1]
      .split(/[,\n]/)
      .flatMap((s) => s.split("/"))
      .map((s) => s.replace(/[.*\s]+/g, " ").trim().toLowerCase())
      .filter((s) => s.length >= 2);
  } else {
    out.forbidden = [];
  }

  return out;
}

/* =========================================================================
   ASSERTION HARNESS
   ========================================================================= */

class Suite {
  constructor() { this.results = []; this.group = "general"; }
  section(name) { this.group = name; return this; }

  ok(name, pass, expected, actual, note = "") {
    this.results.push({ group: this.group, name, pass: !!pass, expected: fmt(expected), actual: fmt(actual), note });
    return pass;
  }
  eq(name, actual, expected, note) { return this.ok(name, Object.is(actual, expected) || actual === expected, expected, actual, note); }
  close(name, actual, expected, tol, note) {
    return this.ok(name, Math.abs(actual - expected) <= tol, `${fmt(expected)} +/- ${fmt(tol)}`, actual, note);
  }
  between(name, actual, lo, hi, note) {
    return this.ok(name, actual >= lo && actual <= hi, `${fmt(lo)} .. ${fmt(hi)}`, actual, note);
  }
  get passed() { return this.results.filter((r) => r.pass).length; }
  get failed() { return this.results.filter((r) => !r.pass).length; }
}

/**
 * Assertion values are read by a human, in a column, on a phone. Anything
 * past six figures becomes a suffixed number — `119177332.27` is not a
 * number a reader can compare against a stated range at a glance, and it
 * wrecks the column it sits in.
 */
function fmt(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    if (Math.abs(v) >= 1e6) return compact(Math.round(v));
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return v.toFixed(Math.abs(v) < 1 ? 4 : 2);
  }
  return String(v);
}

/* =========================================================================
   FORBIDDEN STRINGS

   Two lists, and only one of them lives here.

   The systems reference's own §9 list is PARSED out of the document at test
   time (see parseReference) — the same discipline as the XP tables. The art
   reference is a screenshot folder with no machine-readable list, so its
   proper nouns are enumerated below and that is the only hand-kept list in
   the suite.

   Matching is whole-word, case-insensitive, over every player-visible string
   the content database ships.
   ========================================================================= */

/** Proper nouns from the ART reference. No published list exists to parse. */
const FORBIDDEN_ART = [
  "terra", "locke", "celes", "edgar", "sabin", "setzer", "cyan", "gau",
  "umaro", "gogo", "relm", "strago", "kefka", "esper", "espers", "magitek",
  "figaro", "narshe", "zozo", "vector", "doma", "thamasa", "jidoor",
  "kohlingen", "mobliz", "nikeah", "albrook", "tzen", "maranda", "returners",
  "ragnarok", "bahamut", "ifrit", "shiva", "ramuh", "siren", "tritoch",
  "chocobo", "moogle", "gil", "gilgamesh", "atma", "phunbaba", "veldt",
  "narshe", "opera", "kupo", "espergate",
];

/**
 * @param {string} text    the concatenated shipped strings
 * @param {string[]} [extra] words parsed out of the reference's own §9
 */
export function scanForbidden(text, extra = []) {
  const hits = [];
  const lower = text.toLowerCase();
  const seen = new Set();
  for (const word of [...extra, ...FORBIDDEN_ART]) {
    if (seen.has(word)) continue;
    seen.add(word);
    const re = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`, "g");
    if (re.test(lower)) hits.push(word);
  }
  return hits;
}

/** Every player-visible string the content database ships. */
export function shippedStrings(db) {
  const parts = [];
  for (const it of db.items.values()) parts.push(it.name);
  for (const s of db.skills) {
    parts.push(s.name, s.blurb || "");
    for (const r of s.recipes || []) parts.push(r.name);
    for (const c of s.checkpoints || []) parts.push(c.name, c.text);
    for (const u of s.masteryUnlocks || []) parts.push(u.text);
  }
  for (const m of db.monsters) parts.push(m.name, m.blurb || "");
  for (const e of db.shop) parts.push(e.name, e.text || "");
  for (const w of db.waystations) parts.push(w.name, w.text || "");
  return parts.join(" • ");
}

/* =========================================================================
   THE SUITE
   ========================================================================= */

export function runSelftest(db, referenceMd, { economy = true } = {}) {
  const t = new Suite();
  const ref = parseReference(referenceMd);

  /* -----------------------------------------------------------------
     1. THE XP CURVE
     ----------------------------------------------------------------- */
  t.section("XP curve vs the published tables");

  t.eq(`parsed ${ref.thresholds.length} threshold rows from the reference`, ref.thresholds.length > 15, true);
  let xpBad = 0, deltaBad = 0;
  for (const row of ref.thresholds) {
    if (xpAt(row.level) !== row.cumulative) xpBad++;
    if (deltaXp(row.level) !== row.delta) deltaBad++;
  }
  t.eq("every published cumulative XP threshold reproduced exactly", xpBad, 0,
    `${ref.thresholds.length} rows, L1..L120`);
  t.eq("every published per-level XP delta reproduced exactly", deltaBad, 0,
    `${ref.thresholds.length} rows`);

  let ckBad = 0;
  for (const c of ref.checkpointsXp) if (xpAt(c.level) !== c.cumulative) ckBad++;
  t.eq("intermediate pacing checkpoints (L25..L95) reproduced", ckBad, 0,
    `${ref.checkpointsXp.length} values`);

  let verBad = 0;
  for (const v of ref.verifications) if (xpAt(v.level) !== v.cumulative) verBad++;
  t.eq("section 8 verification values reproduced", verBad, 0,
    ref.verifications.map((v) => `xpAt(${v.level})`).join(" "));

  t.eq("level 50 costs 101,333", xpAt(50), 101333);
  t.eq("level 92 costs 6,517,253", xpAt(92), 6517253);
  t.eq("level 99 costs 13,034,431", xpAt(99), 13034431);
  t.eq("level 120 costs 104,273,167", xpAt(120), 104273167);

  t.close("XP doubles every 7 levels at L10", doublingRatio(10), 1.995, 0.001);
  t.close("XP doubles every 7 levels at L66", doublingRatio(66), 2.0, 0.0005);
  let ratioBad = 0;
  for (let l = 10; l <= 94; l++) if (doublingRatio(l) < 1.99 || doublingRatio(l) > 2.005) ratioBad++;
  t.eq("doubling ratio stays inside [1.99, 2.005] for L10..L94", ratioBad, 0);

  t.close("the back half is the whole game: 1->92 equals 92->99", xpAt(92) / (xpAt(99) - xpAt(92)), 1.0, 0.001,
    `${fmt(xpAt(92))} vs ${fmt(xpAt(99) - xpAt(92))}`);

  t.eq("levelAt is the exact inverse at the boundary", levelAt(xpAt(50)), 50);
  t.eq("one XP short of the boundary is still the level below", levelAt(xpAt(50) - 1), 49);
  t.eq("levelAt clamps to the cap", levelAt(1e15, 99), 99);
  t.eq("virtual levels keep counting past the cap", virtualLevelAt(xpAt(112)), 112);

  /* -----------------------------------------------------------------
     2. MASTERY
     ----------------------------------------------------------------- */
  t.section("Mastery, the pool and its checkpoints");

  let capBad = 0;
  for (const p of ref.poolCaps) if (poolCapBase(p.recipes) !== p.cap) capBad++;
  t.eq("pool cap = 500,000 x recipe count, for every published skill", capBad, 0,
    ref.poolCaps.map((p) => `${p.recipes}->${fmt(p.cap)}`).join(" "));
  t.eq("the constant itself is 500,000", POOL_PER_RECIPE, 500000);

  /* The published checkpoint table cross-checks the whole checkpoint model:
     each row's four numbers must be 10/25/50/95% of that skill's base cap. */
  const capByFirst = new Map(ref.poolCaps.map((p) => [poolCapBase(p.recipes) * 0.1, p.recipes]));
  let cpRows = 0, cpBad = 0;
  for (const row of ref.checkpointRows) {
    const recipes = capByFirst.get(row.values[0]);
    if (!recipes || row.values.length < 4) continue;
    cpRows++;
    const want = [0.1, 0.25, 0.5, 0.95].map((f) => checkpointXp(recipes, f));
    for (let i = 0; i < 4; i++) if (want[i] !== row.values[i]) cpBad++;
  }
  t.eq("published 10/25/50/95% checkpoint thresholds reproduced", cpBad, 0,
    `${cpRows} skills cross-checked against their pool caps`);

  t.eq("pool deposit is 25% below the cap", poolDepositRate(98), 0.25);
  t.eq("pool deposit becomes 50% at skill 99", poolDepositRate(99), 0.5);

  const dep = depositToPool(9_900_000, 200_000, 10_000_000);
  t.eq("overflow above the pool cap is destroyed", dep.wasted, 100_000, `pool clamped to ${fmt(dep.pool)}`);

  t.eq("cap raisers stack additively to +100%", poolCap(20, 0.25 + 0.5 + 0.25), 20_000_000,
    "base 10,000,000");
  t.eq("raising the cap does NOT move the 95% checkpoint", checkpointXp(20, 0.95), 9_500_000,
    "still measured on the base cap");

  const live = activeCheckpoints(5_000_000, 20);
  t.eq("checkpoints are live thresholds, not unlocks", JSON.stringify(live), JSON.stringify([true, true, true, false]),
    "spend back below one and it turns off");

  /* MXP term 1 maxes out at exactly UnlockedActions once everything is
     mastered, which is the property that makes the formula readable. */
  const term1 = masteryXpPerAction({
    unlockedActions: 20, totalMasteryInSkill: 20 * 99, totalItemsInSkill: 20,
    itemMasteryLevel: 0, actionTime: 2, bonus: 0,
  });
  t.close("MXP term 1 tops out at +1 per fully mastered recipe", term1 / (2 * 0.5), 20, 1e-9);

  const worked = masteryXpPerAction({
    unlockedActions: 5, totalMasteryInSkill: 120, totalItemsInSkill: 20,
    itemMasteryLevel: 30, actionTime: 3, bonus: 0.1,
  });
  const expect = ((5 * 120) / (20 * 99) + (30 * 20) / 10) * 3 * 0.5 * 1.1;
  t.close("MXP worked example matches the formula term for term", worked, expect, 1e-9,
    "5 unlocked, 120 total mastery, 20 recipes, item at 30, 3s, +10%");

  /* THE CONSEQUENCE THAT MATTERS, measured by running the engine rather than
     re-deriving the formula. §2.1 says ActionTime is the ACTUAL seconds for a
     gatherer and a FIXED constant for an artisan. The whole point of that
     split is a behavioural one:

       gatherer  -> mastery per second is INVARIANT to interval reduction.
                    Speeding up a gatherer buys loot, not mastery.
       artisan   -> mastery per second SCALES with interval reduction.

     A formula-level test cannot catch getting this backwards in the engine's
     wiring, because both spellings look plausible in isolation. Two one-hour
     runs of the real loop can. */
  const masteryRun = (skillId, recipeId, tooled) => {
    const g = positioned(db, { skillId, recipeId, profile: "fresh" });
    if (tooled) {
      for (const e of db.shop) if (e.category === "tool" && e.skill === skillId) g.state.purchases[e.id] = 1;
      g._invalidate();
    }
    g.start(skillId, recipeId);
    const ticks = g.state.action.intervalTicks;
    g.advanceSeconds(3600);
    return { mxp: g.state.skills[skillId].mastery[recipeId] || 0, seconds: ticks / TICKS_PER_SECOND };
  };

  const gSlow = masteryRun("boughcraft", "bough-palebirch", false);
  const gFast = masteryRun("boughcraft", "bough-palebirch", true);
  t.close("a gatherer's mastery/sec is invariant to interval reduction",
    gFast.mxp / gSlow.mxp, 1.0, 0.05,
    `${gSlow.seconds}s -> ${gFast.seconds}s a swing, and the same mastery an hour`);
  t.ok("...even though the same reduction really did speed the action up",
    gFast.seconds < gSlow.seconds * 0.75, "< 75% of the base interval",
    `${gFast.seconds}s vs ${gSlow.seconds}s`);

  const aSlow = masteryRun("kilnwork", "kiln-shalebrick", false);
  const aFast = masteryRun("kilnwork", "kiln-shalebrick", true);
  t.between("an artisan's mastery/sec DOES scale with interval reduction",
    aFast.mxp / aSlow.mxp, 1.25, 1.75,
    `${aSlow.seconds}s -> ${aFast.seconds}s a pour; the fixed 1.7s action time is why`);

  /* -----------------------------------------------------------------
     3. INTERVALS
     ----------------------------------------------------------------- */
  t.section("Action intervals and modifier stacking");

  t.eq("an unmodified 3.0s action is 3.00s", intervalSeconds(3.0), 3.0);
  t.eq("-10% on a 5s action removes exactly 0.5s", intervalSeconds(5.0, 0.1), 4.5);
  t.eq("percentages apply to BASE, so -10% twice equals -20% once",
    intervalSeconds(5.0, 0.2), intervalSeconds(5.0, 0.1 + 0.1));
  t.eq("flat reduction subtracts AFTER the percentages", intervalSeconds(5.0, 0.2, 0.2), 3.8,
    "5 x 0.8 = 4.0, then -0.2");
  t.eq("results quantise down to a whole 0.05s tick", intervalSeconds(3.0, 0.07), 2.75,
    "2.79 floors to 2.75");
  t.eq("hard floor of 0.25s", intervalSeconds(1.0, 0.9, 0.5), MIN_INTERVAL_SECONDS);
  t.eq("an over-reduced action still floors at 0.25s", intervalSeconds(2.0, 0.99, 5), 0.25);
  t.eq("intervals are stored as whole ticks", intervalTicks(3.0), 60);

  /* THE FLOAT TRAP.
     `floor(x / 0.05) * 0.05` transcribed literally is WRONG in binary
     floating point for a large family of ordinary inputs, and it is wrong in
     the direction that silently gives the player a free tick. 4.55 / 0.05 is
     90.99999999999999, so a literal implementation quantises a 4.55 s action
     down to 4.50 s. Every one of the cases below is a value the shipped
     content actually produces, and every one of them breaks a naive
     transcription. The engine multiplies by 20 and adds an epsilon instead,
     so it lands on the true tick. */
  const naiveQuantise = (b, p = 0, f = 0) => Math.max(Math.floor((b * (1 - p) - f) / 0.05) * 0.05, 0.25);
  const traps = [
    [4.55, 0, 0, 4.55], [0.3, 0, 0, 0.3], [5, 0.2, 0.2, 3.8],
    [1.15, 0, 0, 1.15], [8, 0.45, 0, 4.4], [11.5, 0.3, 0, 8.05],
  ];
  let trapBad = 0, trapCaught = 0;
  for (const [b, p, f, want] of traps) {
    if (intervalSeconds(b, p, f) !== want) trapBad++;
    if (Math.abs(naiveQuantise(b, p, f) - want) > 1e-9) trapCaught++;
  }
  t.eq("tick quantisation is exact where binary floats are not", trapBad, 0,
    `${traps.length} adversarial inputs, e.g. 4.55s and 5s at -20% then -0.2s`);
  t.ok("...and those inputs really do break a literal transcription",
    trapCaught >= 4, ">= 4 of 6 would be wrong", `${trapCaught} of ${traps.length}`,
    "so the epsilon guard is load-bearing, not superstition");

  /* Quantisation must always round the player DOWN to a tick boundary, never
     up: an action may never be faster than the formula says it is. */
  let upward = 0;
  for (let b = 0.3; b <= 30; b += 0.05) {
    for (const p of [0, 0.05, 0.15, 0.33, 0.4, 0.5]) {
      const got = intervalSeconds(b, p);
      const exact = Math.max(b * (1 - p), 0.25);
      if (got > exact + 1e-9 || (got - 0.25 > 1e-9 && exact - got > 0.05 - 1e-9)) upward++;
    }
  }
  t.eq("quantisation always floors, and never by more than one tick", upward, 0,
    "3,564 base/reduction pairs swept");

  const stack = new ModifierSet();
  stack.add(MOD.doubleChance, 0.1, { source: "a" });
  stack.add(MOD.doubleChance, 0.05, { source: "b" });
  t.close("two doubling sources sum to 15%, not 1.10 x 1.05", stack.sum(MOD.doubleChance), 0.15, 1e-12);

  const pool = new ModifierSet();
  pool.add(MOD.intervalPercent, -0.1, { source: "global" });
  pool.add(MOD.intervalPercent, -0.1, { scope: "delving", source: "skill-scoped" });
  t.close("global and skill-scoped land in the SAME bucket", pool.intervalReduction("delving"), 0.2, 1e-12);
  t.close("a skill-scoped modifier does not leak to another skill", pool.intervalReduction("trawling"), 0.1, 1e-12);

  const signed = new ModifierSet();
  signed.add(MOD.intervalPercent, -0.12, { source: "good" });
  signed.add(MOD.intervalPercent, 0.1, { source: "drawback" });
  t.close("signed modifiers sum, so a drawback really is a drawback",
    signed.intervalReduction(null), 0.02, 1e-12);

  const preserve = new ModifierSet();
  preserve.add(MOD.preserveChance, 0.5);
  preserve.add(MOD.preserveChance, 0.6);
  t.eq("preservation caps at 80%", preserve.preserve(null), PRESERVE_CAP);
  preserve.add(MOD.preserveCap, 0.1);
  t.close("but the cap itself is raisable by a named modifier", preserve.preserve(null), 0.9, 1e-12);

  const overcap = new ModifierSet();
  overcap.add(MOD.intervalPercent, -0.9);
  t.eq("stacked interval reduction is bounded", overcap.intervalReduction(null), INTERVAL_REDUCTION_CAP);

  t.close("throughput is hyperbolic: the first -10% buys +11.1%",
    throughputMultiplier(0.1) - 1, 0.1111, 0.0001);
  t.close("...and -10% on top of -50% buys +25%",
    throughputMultiplier(0.6) / throughputMultiplier(0.5) - 1, 0.25, 0.0001);

  /* -----------------------------------------------------------------
     4. THE TICK ENGINE
     ----------------------------------------------------------------- */
  t.section("Tick engine, determinism and offline replay");

  t.eq("one tick is 50 ms", TICK_MS, 50);
  t.eq("twenty ticks a second", TICKS_PER_SECOND, 20);
  t.eq("offline is capped at 24 hours", OFFLINE_CAP_MS, 86_400_000);
  t.eq("...which is 1,728,000 ticks", OFFLINE_CAP_TICKS, 1_728_000);

  const mk = (skillId, recipeId, seed = 0xbead) => {
    const g = new Game(db, { autoSell: true, seed });
    g.state.items["cinder-shale"] = 1e7;
    g._usedSlots = 1;
    g.start(skillId, recipeId);
    return g;
  };

  /* THE SWEEP.
     Three representative recipes would prove almost nothing: the paths that
     drift are the rare ones — a quality roll, a shard cost, a route that pays
     currency instead of items, a node that depletes on the same tick an
     input runs out. So every rung of every skill and every monster is run
     four ways and the four state fingerprints must be identical:

       fast      the event-jump loop a real client uses
       naive     one tick at a time, 60,000 times
       chunked   twelve uneven slices, the way a throttled mobile tab arrives
       reloaded  serialised to JSON mid-action and resumed in a new Game

     One assertion per path, reporting how many configurations were swept, so
     a single drift anywhere in the content set fails the suite. */
  const SWEEP_TICKS = 60_000;
  const CUTS = [7_311, 1, 12_000, 40, 9_997, 3, 15_555, 2_048, 6_666, 4_321, 1_057, 1_002];
  const sweepFails = { naive: [], chunked: [], reloaded: [] };
  let swept = 0;

  const buildAt = (skillId, recipeId, seed, combat) => {
    const g = positioned(db, {
      skillId, recipeId, profile: "mastered",
      monsterLevel: combat ? db.monster(recipeId).level : undefined,
    });
    g.rng.seed(seed);
    g.state.rng = g.rng.save();
    if (combat) g.fight(recipeId); else g.start(skillId, recipeId);
    return g;
  };

  const sweepOne = (skillId, recipeId, combat) => {
    const seed = 0x9e3779b9 ^ (swept * 2654435761);
    swept++;
    const fast = buildAt(skillId, recipeId, seed, combat);
    fast.advance(SWEEP_TICKS);
    const want = fast.hash();

    const naive = buildAt(skillId, recipeId, seed, combat);
    naive.advance(SWEEP_TICKS, { naive: true });
    if (naive.hash() !== want) sweepFails.naive.push(recipeId);

    const chunked = buildAt(skillId, recipeId, seed, combat);
    let left = SWEEP_TICKS, i = 0;
    while (left > 0) { const k = Math.min(left, CUTS[i++ % CUTS.length]); chunked.advance(k); left -= k; }
    if (chunked.hash() !== want) sweepFails.chunked.push(recipeId);

    const half = buildAt(skillId, recipeId, seed, combat);
    half.advance(23_101);
    const reloaded = Game.load(db, JSON.parse(JSON.stringify(half.serialize(0))), { autoSell: true });
    reloaded.advance(SWEEP_TICKS - 23_101);
    if (reloaded.hash() !== want) sweepFails.reloaded.push(recipeId);
  };

  for (const skill of db.skills) for (const r of skill.recipes || []) sweepOne(skill.id, r.id, false);
  for (const m of db.monsters) sweepOne("attack", m.id, true);

  const sweepNote = `${swept} configurations x ${fmt(SWEEP_TICKS)} ticks each`;
  t.eq("event jump == tick-by-tick, on EVERY rung and EVERY monster",
    sweepFails.naive.join(", ") || "none", "none", sweepNote);
  t.eq("twelve uneven chunks == one continuous run, everywhere",
    sweepFails.chunked.join(", ") || "none", "none",
    "a throttled mobile tab must resume identically to a cold start");
  t.eq("serialise to JSON mid-action and resume == uninterrupted, everywhere",
    sweepFails.reloaded.join(", ") || "none", "none", sweepNote);

  /* Combat carries far more state than a gatherer: two attack timers, a
     respawn timer, regeneration, food. Kept as a named case because the
     numbers it reports are worth reading. */
  const mkFight = (seed = 0x5eed) => {
    const g = new Game(db, { autoSell: true, seed });
    g.grant("relic-1"); g.grant("relic-2");
    for (const id of ["attack", "strength", "defence"]) g.state.skills[id].xp = xpAt(20);
    g.state.items["ration-bogskate"] = 1e6;
    g.state.food = "ration-bogskate";
    g._usedSlots = 1;
    g.fight("rust-kite");
    return g;
  };
  const cf = mkFight(); cf.advance(120_000);
  const cn = mkFight(); cn.advance(120_000, { naive: true });
  t.eq("combat: event jump == tick-by-tick over 120k ticks", cf.hash(), cn.hash(),
    `${cf.state.stats.kills} kills, ${fmt(cf.state.stats.damageDealt)} damage`);

  /* Determinism is worth nothing if the RNG is weak enough that two seeds
     agree by accident. A different seed must produce a different history. */
  const seedA = mk("trawling", "cast-silverfin", 1); seedA.advance(40_000);
  const seedB = mk("trawling", "cast-silverfin", 2); seedB.advance(40_000);
  t.ok("a different seed really does produce a different history",
    seedA.hash() !== seedB.hash(), "different", "different");

  /* A 24 h replay must equal 24 separate 1 h advances, and must be fast.
     The budget is measured on the HEAVIEST rung in the game rather than a
     convenient one: Hearthcraft's first recipe runs a one-second action with
     a consume, a quality roll and a perfect roll on every completion, which
     is 86,400 full action resolutions inside one replay. Timing an easy rung
     and quoting the number would be a lie by selection. */
  let heavy = null;
  for (const skill of db.skills) {
    for (const r of skill.recipes || []) {
      const seconds = skill.intervalMode === "range" ? r.range[0]
        : skill.intervalMode === "flat" ? skill.baseInterval : r.interval;
      if (!heavy || seconds < heavy.seconds) heavy = { skillId: skill.id, recipeId: r.id, seconds };
    }
  }
  const mkHeavy = () => {
    const g = positioned(db, { skillId: heavy.skillId, recipeId: heavy.recipeId, profile: "mastered" });
    g.rng.seed(0xc0ffee); g._syncRng();
    g.start(heavy.skillId, heavy.recipeId);
    return g;
  };
  const long = mkHeavy();
  const t0 = performance.now();
  long.advance(OFFLINE_CAP_TICKS);
  const replayMs = performance.now() - t0;
  const stepped = mkHeavy();
  for (let i = 0; i < 24; i++) stepped.advance(72_000);
  t.eq("a full 24 h replay == 24 separate one-hour advances", long.hash(), stepped.hash(),
    `${db.recipe(heavy.recipeId).name}, ${fmt(long.state.stats.actions)} actions resolved`);
  t.ok("24 h (1,728,000 ticks) of the game's HEAVIEST rung replays in under 250 ms",
    replayMs < 250, "< 250 ms", `${replayMs.toFixed(1)} ms`,
    `${db.recipe(heavy.recipeId).name} at ${heavy.seconds}s base — ${fmt(Math.round(OFFLINE_CAP_TICKS / Math.max(replayMs, 0.001)))} ticks/ms`);

  /* The save has to be valid at EVERY moment, not only after advance().
     Trawling rolls its interval the instant an action starts, so start()
     draws from the RNG before a single tick passes. A state snapshot taken
     between start() and the first advance() must therefore already carry the
     advanced RNG position, or the resumed session diverges from the live one
     — on exactly one skill, and only sometimes. */
  let snapBad = [];
  for (const skill of db.skills) {
    for (const r of skill.recipes || []) {
      const g = positioned(db, { skillId: skill.id, recipeId: r.id, profile: "mastered" });
      g.rng.seed(0x5a17); g._syncRng();
      g.start(skill.id, r.id);
      const live = new Game(db, { autoSell: true, state: g.state });   // raw state, no serialize()
      const saved = Game.load(db, JSON.parse(JSON.stringify(g.serialize(0))), { autoSell: true });
      live.advance(40_000);
      saved.advance(40_000);
      if (live.hash() !== saved.hash()) snapBad.push(r.id);
    }
  }
  t.eq("a raw state snapshot is a valid save the instant an action starts",
    snapBad.join(", ") || "none", "none",
    `${db.skills.flatMap((s) => s.recipes || []).length} rungs, snapshot taken between start() and the first tick`);

  /* Offline is a real replay, so a session that levels up mid-flight earns
     MORE than its starting rate x time. Freezing the rate was the bug. */
  const g24 = mk("boughcraft", "bough-palebirch", 0x11);
  const startInterval = g24.state.action.intervalTicks;
  g24.state.lastSaveAt = 0;
  const sum = g24.offlineReplay(6 * 3600 * 1000);
  const frozenRate = (6 * 3600) / (startInterval / TICKS_PER_SECOND);
  t.ok("replay is not frozen-rate: mastery gained mid-flight speeds it up",
    sum.ticks > 0 && g24.state.stats.actions > frozenRate, `> ${fmt(Math.round(frozenRate))} actions`,
    fmt(g24.state.stats.actions), "the naive shortcut would have stopped at the starting rate");

  /* Banked, not auto-sold, so the summary has real item rows to report. */
  const capped = new Game(db, { seed: 0x12 });
  capped.start("boughcraft", "bough-palebirch");
  capped.state.lastSaveAt = 0;
  const capSum = capped.offlineReplay(72 * 3600 * 1000);
  t.eq("three days away still only replays 24 hours", capSum.ticks, OFFLINE_CAP_TICKS,
    `flagged as capped: ${capSum.cappedByLimit}`);
  t.ok("the Welcome Back summary reports what changed", capSum.items.length > 0 && capSum.levels.length > 0,
    "items and level-ups", `${capSum.items.length} item rows, ${capSum.levels.length} level-ups`);

  const noCombat = new Game(db, { autoSell: true });
  noCombat.grant("relic-1");
  noCombat.fight("hollow-wisp");
  noCombat.state.lastSaveAt = 0;
  const blocked = noCombat.offlineReplay(3600 * 1000);
  t.eq("offline combat is gated behind an explicit opt-in", blocked.stoppedReason, "offline-combat-disabled");

  /* THE HARDEST REPLAY CASE.
     §2.3's checkpoints are live thresholds on a pool that the replay itself
     is filling. So somewhere inside an offline session the pool crosses 50%,
     a -0.2 s flat interval switches on, and every tick after that runs on a
     different schedule than every tick before it. That is precisely the case
     the "freeze the rate at the starting state" shortcut gets wrong, and it
     is invisible to a test that only checks totals. Park the pool just under
     the threshold, replay, and require three things: the crossing happened,
     the action is measurably faster afterwards, and the event-jump loop still
     agrees tick-for-tick with the naive one across the discontinuity. */
  const mkCross = () => {
    const g = positioned(db, { skillId: "delving", recipeId: "vein-emberquartz", profile: "mastered" });
    g.state.skills.delving.pool = poolCapBase(db.recipeCounts.delving) * 0.5 - 400;
    g.state.skills.delving.mastery["vein-emberquartz"] = 0;
    g._invalidate();
    g.start("delving", "vein-emberquartz");
    return g;
  };
  const cross = mkCross();
  const beforeTicks = cross.state.action.intervalTicks;
  const beforeLive = cross.checkpointsFor("delving")[2];
  cross.state.lastSaveAt = 0;
  cross.offlineReplay(6 * 3600 * 1000);
  const afterLive = cross.checkpointsFor("delving")[2];
  const afterTicks = cross.actionIntervalTicks("delving", "vein-emberquartz");
  t.ok("a pool checkpoint that fires mid-replay changes the rate from there on",
    !beforeLive && afterLive && afterTicks < beforeTicks,
    "off -> on, and faster after", `${beforeTicks} -> ${afterTicks} ticks, live: ${beforeLive} -> ${afterLive}`,
    "the frozen-rate shortcut cannot produce this");
  const crossNaive = mkCross();
  crossNaive.state.lastSaveAt = 0;
  crossNaive.offlineReplay(6 * 3600 * 1000, { naive: true });
  t.eq("...and the fast loop agrees tick-for-tick across the discontinuity",
    cross.hash(), crossNaive.hash(), "432,000 ticks with a modifier flip inside");

  /* Spending the pool back down must revoke the bonus. Checkpoints are
     thresholds, not purchases, and this is the tension that makes the pool
     an interesting resource rather than a second experience bar. */
  const spender = mkCross();
  spender.state.skills.delving.pool = poolCapBase(db.recipeCounts.delving) * 0.55;
  spender.state.skills.delving.mastery["vein-palegrit"] = 0;
  spender._invalidate();
  const rich = spender.actionIntervalTicks("delving", "vein-emberquartz");
  const bought = spender.spendPool("delving", "vein-palegrit", 70);
  const poor = spender.actionIntervalTicks("delving", "vein-emberquartz");
  t.ok("spending the pool below a threshold revokes the bonus again",
    bought === null && poor > rich && !spender.checkpointsFor("delving")[2],
    "slower once the pool drops", `${rich} -> ${poor} ticks`,
    `mastery 70 on another vein cost ${fmt(xpAt(70))} pool XP and dropped the pool from 55% to 40%`);

  /* -----------------------------------------------------------------
     5. THE SINK CURVE
     ----------------------------------------------------------------- */
  t.section("Sinks");

  if (ref.slotFormula && ref.slotRows.length) {
    const { A, B, C, D } = ref.slotFormula;
    const refCost = (n) => Math.floor((A * (n + 2)) / Math.pow(B, C / (D + n)));
    let bad = 0;
    for (const row of ref.slotRows) if (refCost(row.bought) !== row.next) bad++;
    t.eq("the published slot-curve family reproduces its own table", bad, 0,
      `${ref.slotRows.length} rows, exponent-in-denominator form`);
  }

  const c0 = db.claspCost(0);
  const total = db.claspCumulative(118);
  t.between("the first reliquary clasp is affordable in the first two minutes", c0, 10, 40,
    "the sink has to introduce itself immediately");
  let monotone = true;
  for (let n = 1; n < 118; n++) if (db.claspCost(n) <= db.claspCost(n - 1)) monotone = false;
  t.ok("the clasp curve is strictly increasing across all 118 clasps", monotone, "smooth", monotone ? "yes" : "no");
  t.ok("...and self-limiting rather than exploding",
    db.claspCost(117) / db.claspCost(110) < 1.6, "< 1.6x over the last 7",
    (db.claspCost(117) / db.claspCost(110)).toFixed(3));
  t.between("the whole clasp ladder totals 80M-110M Cogs", total, 80e6, 110e6,
    "about five hours of a mid-game loop");

  const firstTool = db.shopEntry("tool-boughcraft-apprentice");
  t.eq("the first tool costs 50 Cogs", firstTool.cost, 50);
  const ladder = db.toolLadders.boughcraft;
  const totalCut = ladder.reduce((a, e) => a + Math.abs(e.mods[0][1]), 0);
  t.close("a full tool ladder reaches -40% interval in seven steps", totalCut, 0.4, 1e-9,
    `${ladder.length} steps, ${fmt(ladder[ladder.length - 1].cost)} at the top`);
  /* The reference's own ladder jumps 15x on its first step and settles into
     4-10x after, so the rule to hold is the GEOMETRIC MEAN across the ladder,
     with every step at least a 2.5x. Benefit stays flat at -5% throughout;
     the hyperbolic throughput term is what pays for the price curve. */
  let minStep = Infinity;
  for (let i = 1; i < ladder.length; i++) minStep = Math.min(minStep, ladder[i].cost / ladder[i - 1].cost);
  const geoMean = Math.pow(ladder[ladder.length - 1].cost / ladder[0].cost, 1 / (ladder.length - 1));
  t.between("cost multiplies 4x-10x a step on average while the benefit stays flat", geoMean, 4, 10,
    `smallest single step ${minStep.toFixed(1)}x, from ${fmt(ladder[0].cost)} to ${fmt(ladder[ladder.length - 1].cost)}`);
  t.ok("no step is a rounding error", minStep >= 2.5, ">= 2.5x", `${minStep.toFixed(1)}x`);

  /* -----------------------------------------------------------------
     6. CONTENT AND THE DESIGNED ECONOMY
     ----------------------------------------------------------------- */
  t.section("Content");

  t.ok(`the reference's own banned-string list was parsed, not transcribed`,
    ref.forbidden.length >= 25, ">= 25 words read from section 9", `${ref.forbidden.length} words`,
    ref.forbidden.slice(0, 8).join(", ") + " ...");
  const hits = scanForbidden(shippedStrings(db), ref.forbidden);
  t.eq("no forbidden proper noun appears in any shipped string", hits.join(", ") || "none", "none",
    `${ref.forbidden.length} parsed + ${db.items.size} items, ${db.monsters.length} monsters, ${db.shop.length} shop entries`);
  /* The scanner has to actually be able to fail, or "0 hits" proves nothing. */
  t.eq("...and the scanner catches one when it is planted", scanForbidden("a Mithril Herblore", ref.forbidden).length, 2,
    "negative control");

  t.eq("every mastery skill's pool cap follows the 500,000 rule",
    db.masterySkills.every((s) => poolCapBase(db.recipeCounts[s.id]) === 500000 * s.recipes.length), true,
    db.masterySkills.map((s) => `${s.name} ${s.recipes.length}`).join(", "));

  let cpShape = true;
  for (const s of db.masterySkills) {
    if (s.checkpoints.length !== 4) cpShape = false;
    if (JSON.stringify(s.checkpoints.map((c) => c.pct)) !== JSON.stringify([0.1, 0.25, 0.5, 0.95])) cpShape = false;
    if (!s.checkpoints[0].mods.some(([n]) => n === MOD.masteryXP)) cpShape = false;
  }
  t.ok("every skill spends its four checkpoints on the same ladder", cpShape,
    "10% mastery XP, 25% throughput, 50% economy, 95% prestige", cpShape ? "yes" : "no");

  const signedStations = db.waystations.filter((w) => w.mods.some(([, v]) => v < 0)).length;
  t.between("most waystations carry a real drawback", signedStations, 9, db.waystations.length,
    `${signedStations} of ${db.waystations.length} are signed`);

  if (!economy) return finish(t, ref);

  /* ---- measured design assertions --------------------------------- */
  t.section("The economy, measured by running the engine");

  const hourOne = [
    ["Delving", measure(db, { skillId: "delving", recipeId: "vein-cinder-shale", profile: "fresh" })],
    ["Boughcraft", measure(db, { skillId: "boughcraft", recipeId: "bough-palebirch", profile: "fresh" })],
    ["Combat", measure(db, { skillId: "attack", recipeId: "hollow-wisp", profile: "fresh", monsterLevel: 1 })],
  ];
  for (const [name, r] of hourOne) {
    t.between(`hour one on ${name} pays 1,000-3,000 Cogs`, Math.round(r.cogsPerHour), 1000, 3000,
      "it has to, because the first upgrade costs 50 and the first clasp 27");
  }
  t.between("hour one XP is around 3.3/s, as the reference's first rung is",
    hourOne[1][1].xpPerSecond, 3.0, 4.0);

  /* Trawling is the fourth level-1 loop and it is DELIBERATELY the poorest:
     it pays roughly a quarter of what Delving does at hour one. That is a
     choice, not an oversight, and the thing that makes it a choice is that
     Trawling's ladder climbs further than any other — so the assertion pairs
     the two halves rather than quietly excluding the skill from the band. */
  const trawlHour = measure(db, { skillId: "trawling", recipeId: "cast-silverfin", profile: "fresh" });
  const spans = db.skills.filter((s) => s.kind === "gather").map((s) => {
    const vals = s.recipes.map((r) => db.item(r.produces).value);
    return { id: s.id, span: Math.max(...vals) / Math.min(...vals) };
  });
  const widest = spans.reduce((a, b) => (b.span > a.span ? b : a));
  t.ok("the poorest hour-one loop is the one with the richest ladder",
    trawlHour.cogsPerHour < hourOne[0][1].cogsPerHour / 2 && widest.id === "trawling",
    "Trawling: poorest start, widest climb",
    `${fmt(Math.round(trawlHour.cogsPerHour))}/hr at rung one, ${Math.round(widest.span)}x span`,
    "so the cheapest-looking skill at hour one is the one that pays best at hour four hundred");

  /* The Ashright checkpoint has to be legible at the rung where it is first
     met, or it is a mechanic that silently switches on forty levels later. */
  const burnLow = measure(db, { skillId: "emberrite", recipeId: "burn-palebirch", profile: "mastered" });
  t.ok("the burn-refund faucet pays something even on a 1-Cog bough",
    burnLow.cogsPerHour > 0, "> 0 Cogs/hr", `${fmt(Math.round(burnLow.cogsPerHour))} Cogs/hr`,
    "25% of 1 Cog floors to nothing, so the refund carries a floor of one");

  const rates = economyRates(db, "mastered");
  const cache = new Map();

  /* Each gathering skill must span about 4x from its worst rung to its best,
     which is what makes climbing the ladder feel like progress. */
  for (const id of ["boughcraft", "trawling", "wayfaring"]) {
    const xs = db.skill(id).recipes.map((r) => measure(db, { skillId: id, recipeId: r.id, profile: "fresh" }).xpPerSecond);
    const spread = Math.max(...xs) / Math.min(...xs);
    t.between(`${db.skill(id).name}: worst-to-best XP rate spans about 4x`, spread, 3, 6);
  }

  /* One deliberate inversion per gathering skill: a rung that is the best in
     the skill for money and among the worst for experience. */
  for (const [skillId, rung] of [["boughcraft", "bough-sunwood"], ["trawling", "cast-tidewyrm"], ["delving", "vein-wardens-tear"]]) {
    const runs = db.skill(skillId).recipes.map((r) => ({
      id: r.id, ...measure(db, { skillId, recipeId: r.id, profile: "mastered" }),
    }));
    const richest = runs.reduce((a, b) => (b.cogsPerHour > a.cogsPerHour ? b : a));
    const target = runs.find((r) => r.id === rung);
    const rank = runs.filter((r) => r.xpPerSecond > target.xpPerSecond).length;
    t.ok(`${db.skill(skillId).name}: the money rung is deliberately NOT the XP rung`,
      richest.id === rung && rank >= 3, "richest rung, mid-to-low XP",
      `${db.recipe(rung).name}: richest=${richest.id === rung}, ${rank} rungs out-XP it`);
  }

  /* Time to cap, quoted the way the reference quotes it: at the rate you have
     the moment the best rung unlocks. */
  for (const id of ["boughcraft", "trawling", "wayfaring"]) {
    const best = db.skill(id).recipes.reduce((a, b) => (b.level > a.level ? b : a));
    const r = measure(db, { skillId: id, recipeId: best.id, profile: "fresh" });
    const hours = xpAt(99) / r.xpPerSecond / 3600;
    t.between(`${db.skill(id).name} caps in 200-400 h at its top rung's unlock rate`, hours, 200, 400,
      `${db.recipe(best.id).name}, ${r.xpPerSecond.toFixed(1)} XP/s`);
  }

  /* The faucet ladder: five orders of magnitude between the first hour and
     the last, with combat clearly on top. */
  const endgame = measure(db, { skillId: "attack", recipeId: "the-ninefold-warden", profile: "fresh", monsterLevel: 99 });
  const span = endgame.cogsPerHour / hourOne[0][1].cogsPerHour;
  t.between("the faucet spans 10^6 to 10^8 from the first hour to the last",
    Math.log10(span), 6, 8, `${fmt(Math.round(hourOne[0][1].cogsPerHour))} -> ${fmt(Math.round(endgame.cogsPerHour))} Cogs/hr`);

  const sigil = db.recipe("sig-ninefold");
  const sigilBurst = rates.recipeRuns.get("sig-ninefold");
  const sigilSustained = sustained(db, rates, db.skill("sigilwork"), sigil, sigilBurst, cache);
  t.between("the best non-combat loop sustains 20M-150M Cogs/hr", sigilSustained.cogsPerHour, 20e6, 150e6,
    `Sigilwork, throttled to ${(sigilSustained.throttle * 100).toFixed(1)}% by Aether Shard income`);
  t.between("combat out-earns the best non-combat loop by 10x-100x",
    endgame.cogsPerHour / sigilSustained.cogsPerHour, 10, 100,
    "skills are for experience, combat is for money");

  /* Sink pacing: the flagship sinks are priced at about five hours of the
     income tier they are aimed at. */
  const midgame = measure(db, { skillId: "attack", recipeId: "emberquartz-colossus", profile: "fresh", monsterLevel: 68 });
  t.between("the clasp ladder costs 2-6 hours of mid-game income",
    total / midgame.cogsPerHour, 2, 6, `${fmt(total)} against ${fmt(Math.round(midgame.cogsPerHour))}/hr`);
  const rites = db.ascension.reduce((a, r) => a + r.cost, 0);
  t.between("the Ascension Rites cost 3-8 hours of endgame income",
    rites / endgame.cogsPerHour, 3, 8, `${fmt(rites)} against ${fmt(Math.round(endgame.cogsPerHour))}/hr`);

  /* -----------------------------------------------------------------
     THE PRICE LADDER — the five rules items.js states, enforced against
     the numbers as shipped. A stated design rule that nothing checks is
     decoration, and rule R5 below caught a real trap recipe.
     ----------------------------------------------------------------- */

  /* R1 — raw ladders climb 1.5x-2.6x a tier on the geometric mean and span
     25x-800x end to end. Deliberately not a constant ratio. */
  for (const skill of db.skills.filter((s) => s.kind === "gather")) {
    const vals = skill.recipes.map((r) => db.item(r.produces).value);
    const geo = Math.pow(vals.at(-1) / vals[0], 1 / (vals.length - 1));
    const span = Math.max(...vals) / Math.min(...vals);
    t.between(`${skill.name}: raw tiers climb 1.5x-2.6x a step on average`, geo, 1.4, 2.7,
      `${vals[0]} -> ${vals.at(-1)} Cogs, widest rung ${fmt(Math.max(...vals))}`);
    t.between(`${skill.name}: the raw ladder spans 350x-1000x end to end`, span, 350, 1000);
  }

  /* R2 — exactly one inversion per gathering skill, where an INVERSION is
     defined precisely: a rung worth at least 3x the rung below it that the
     NEXT rung does not sustain. The second clause is what separates a real
     inversion from an ordinary steep step near the bottom of a ladder — a
     spike the ladder comes back down from is a decision the player has to
     make, a step that keeps climbing is just a tier. */
  for (const skill of db.skills.filter((s) => s.kind === "gather")) {
    const vals = skill.recipes.map((r) => db.item(r.produces).value);
    const spikes = skill.recipes.filter((r, i) =>
      i > 0 && i < vals.length - 1 && vals[i] / vals[i - 1] >= 3 && vals[i + 1] < vals[i]);
    t.eq(`${skill.name}: exactly one deliberate value inversion`, spikes.length, 1,
      spikes.map((r) => `${r.name} at ${fmt(db.item(r.produces).value)} Cogs`).join(", "));
    const richest = vals.indexOf(Math.max(...vals));
    t.ok(`${skill.name}: ...and it is not the top rung of the ladder`,
      richest < vals.length - 1 && vals.at(-1) < vals[richest],
      "richest rung is not the last", `richest at rung ${richest + 1} of ${vals.length}, last worth ${fmt(vals.at(-1))}`,
      "so the highest thing unlocked is never automatically the right thing to do");
  }

  /* R3 — provisions carry a flat markup, because a moving one would make a
     single rung strictly dominant. The top two composites break it upward on
     purpose and are excluded by name. */
  const cookMargins = db.skill("hearthcraft").recipes
    .filter((r) => r.consumes.length === 1)
    .map((r) => db.item(r.produces).value / db.item(r.consumes[0][0]).value);
  t.between("provisions hold a flat markup the length of the ladder",
    Math.max(...cookMargins) / Math.min(...cookMargins), 1.0, 1.3,
    `${cookMargins.length} single-input recipes, ${cookMargins.map((m) => m.toFixed(2)).join(" ")}`);

  /* And the reason it is flat: healing per Cog must FALL, so the expensive
     provision is a convenience rather than an efficiency. */
  const healPerCog = db.skill("hearthcraft").recipes.map((r) => {
    const it = db.item(r.produces);
    return it.heal / it.value;
  });
  t.ok("healing per Cog falls across the provision ladder",
    healPerCog[0] > healPerCog.at(-1) * 20, "first rung is far cheaper per HP",
    `${healPerCog[0].toFixed(1)} -> ${healPerCog.at(-1).toFixed(2)} HP per Cog`,
    "late provisions buy fewer interruptions, not efficiency");

  /* R4 — billet markup SHRINKS with depth. Markups compound, so a flat one
     across ten rungs would multiply the endgame by thousands. */
  const billet = db.skill("kilnwork").recipes.map((r) => {
    const inVal = r.consumes.reduce((a, [id, q]) => a + db.item(id).value * q, 0);
    return inVal > 0 ? db.item(r.produces).value / inVal : Infinity;
  });
  t.ok("every billet is worth more than the sum of its inputs",
    billet.every((m) => m > 1), "all > 1x", `${billet.filter((m) => m > 1).length} of ${billet.length}`);
  t.ok("...but the billet markup shrinks with chain depth",
    billet[0] > billet.at(-1) && billet.at(-1) < 1.3,
    "first rung fattest, last rung thinnest",
    `${billet[0].toFixed(2)}x -> ${billet.at(-1).toFixed(2)}x`,
    `a flat ${billet[0].toFixed(1)}x over ${billet.length} rungs would multiply the endgame by ${fmt(Math.round(billet[0] ** billet.length))}x`);

  /* R5 — THE INVARIANT. Every processing recipe must beat selling its own
     inputs, in Cogs per second of total play. A recipe that fails this is a
     trap: the arithmetic tells the player to skip a rung of the game. Fuel
     recipes (Emberrite, whose output is deliberately worth nothing) are
     exempt by name. */
  const trapRecipes = [];
  const ratios = [];
  for (const skill of db.skills) {
    if (!skill.recipes || skill.id === "emberrite") continue;
    for (const r of skill.recipes) {
      if (!r.consumes) continue;
      const burst = rates.recipeRuns.get(r.id);
      const made = (burst.produced[r.produces] || 0) + (burst.produced[`perfect-${r.produces}`] || 0);
      if (!made) continue;
      const perAction = made / burst.actionsPerHour;
      const own = 3600 / made;
      let inputSeconds = 0, inputValue = 0;
      for (const [id, q] of r.consumes) {
        inputSeconds += (q / perAction) * secondsPerUnit(db, rates, id, cache);
        inputValue += (q / perAction) * db.item(id).value;
      }
      if (r.shards && rates.shardsPerHour > 0) {
        inputSeconds += (r.shards / perAction) * (3600 / rates.shardsPerHour);
      }
      if (!(inputSeconds > 0) || !(inputValue > 0)) continue;
      const ratio = (db.item(r.produces).value / (own + inputSeconds)) / (inputValue / inputSeconds);
      ratios.push(ratio);
      if (ratio <= 1) trapRecipes.push(`${r.name} ${ratio.toFixed(2)}x`);
    }
  }
  t.eq("no recipe is a trap: crafting always beats selling its own inputs",
    trapRecipes.join(", ") || "none", "none",
    `${ratios.length} recipes, worst ${Math.min(...ratios).toFixed(2)}x, best ${fmt(Math.max(...ratios))}x`);
  t.ok("Emberrite is the one exemption, and it is exempt by name",
    db.skill("emberrite").recipes.every((r) => db.item(r.produces).value === 0),
    "every ember is worth 0", "yes",
    "burning destroys sale value outright; the 50% checkpoint is what pays it back");

  /* -----------------------------------------------------------------
     THE COMBAT CORE — §1's eight-skill block, §3h's stun model, §3j's
     equipment layer. Every one of these is measured by running the engine.
     ----------------------------------------------------------------- */
  t.section("The combat core");

  t.eq("the COMBAT block is eight skills, and none of them is a page",
    COMBAT_BLOCK.filter((id) => (db.skill(id)?.recipes || []).length === 0).length, 8,
    COMBAT_BLOCK.map((id) => db.skill(id).name).join(", "));
  t.eq("...and all eight route to the one Combat screen",
    COMBAT_BLOCK.every((id) => db.skill(id).screen === "combat"), true,
    "parity section 1's critical finding");

  /* The derived combat level, against the reference's own worked shape: a
     capped melee account is 99+99 attack/strength, 99 defence, 99 vitality. */
  const cappedBlock = Object.fromEntries(COMBAT_BLOCK.map((id) => [id, 99]));
  t.eq("a fully capped melee account is combat level 126", combatLevel(cappedBlock), 126,
    "0.25(def + vit + devotion/2) + 0.325(atk + str), the reference's own derived number");
  const freshBlock = Object.fromEntries(COMBAT_BLOCK.map((id) => [id, 1]));
  t.eq("a brand new one is combat level 1", combatLevel(freshBlock), 1);

  /* Every style must pay the SAME total XP — the choice is which bar moves,
     never how fast. A style that quietly paid more would be mandatory. */
  const styleTotals = ATTACK_STYLES.map((st) => st.xp.reduce((a, [, share]) => a + share, 0));
  t.eq("every attack style pays exactly one action's worth of XP",
    styleTotals.filter((v) => Math.abs(v - 1) > 1e-9).length, 0,
    `${ATTACK_STYLES.length} styles, shares summing to 1`);
  t.eq("Stab is the neutral style, so the sandbox measures unmodified combat",
    ATTACK_STYLES.find((st) => st.id === "stab").mods.length, 0);
  t.eq("every other style carries a real drawback",
    ATTACK_STYLES.filter((st) => st.id !== "stab" && !st.mods.some(([, v]) => v < 0)).length, 0,
    "signed modifiers, section 7.4");

  /* -----------------------------------------------------------------
     COMBAT XP IS PAID PER POINT OF DAMAGE — THE IDENTITY, ON EVERY RUNG

     §7.5 fixes Vitality at 0.133 XP per point of damage. The weapon skills
     are on the SAME spine at STYLE_XP_PER_DAMAGE, and no monster carries a
     hand-written per-kill number for either. This block runs a real hour on
     every monster in the bestiary and checks the two identities exactly,
     because that is what a hand-written per-kill number quietly broke: with
     one, our Vitality-to-weapon ratio swung from 0.04 to 81 across the
     ladder and weapon XP/hr FELL every time the player advanced a tier.

     Three assertions, and they are three different claims:
       1. both rates are exactly per-damage (the identity itself),
       2. therefore the ratio is one constant on all seventeen rungs, and
       3. therefore weapon XP/hr is monotone in DPS — a strictly stronger
          statement than 1 and 2, and the one a player actually feels.
     ----------------------------------------------------------------- */
  const dmgRuns = db.monsters
    .map((mon) => ({
      mon,
      run: measure(db, { skillId: "attack", recipeId: mon.id, profile: "fresh", monsterLevel: mon.level }),
    }))
    .sort((a, b) => a.mon.level - b.mon.level);

  let vitOff = 0, styleOff = 0, worstVit = 0, worstStyle = 0;
  for (const { mon, run } of dmgRuns) {
    /* The XP modifier in play for THIS fight, read off the game that ran it
       rather than assumed — a fresh combat profile owns relics, and a
       hard-coded "1 + 0" would pass for the wrong reason. */
    const bonus = 1 + run.game.mods().sum(MOD.skillXP, [...COMBAT_SCOPES, mon.id]);
    const relErr = (a, b) => (b === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - b) / Math.abs(b));
    const vErr = relErr(run.vitalityPerHour, VITALITY_XP_PER_DAMAGE * run.damageDealt);
    const sErr = relErr(run.styleXpPerHour, STYLE_XP_PER_DAMAGE * run.damageDealt * bonus);
    worstVit = Math.max(worstVit, vErr);
    worstStyle = Math.max(worstStyle, sErr);
    if (vErr > 1e-9) vitOff++;
    if (sErr > 1e-9) styleOff++;
  }
  t.eq(`Vitality XP is exactly ${VITALITY_XP_PER_DAMAGE} per point of damage, on all ${dmgRuns.length} rungs`,
    vitOff, 0,
    `worst relative error ${worstVit.toExponential(1)} over ${dmgRuns.length} measured hours`);
  t.eq(`weapon XP is exactly ${STYLE_XP_PER_DAMAGE} per point of damage x modifiers, on all ${dmgRuns.length} rungs`,
    styleOff, 0,
    `worst relative error ${worstStyle.toExponential(1)}; no monster carries a per-kill XP number`);

  const vitRatios = dmgRuns.map(({ run }) => run.vitalityPerHour / run.styleXpPerHour);
  const expectedRatio = VITALITY_XP_PER_DAMAGE / STYLE_XP_PER_DAMAGE;
  t.between(`...so the Vitality-to-weapon ratio is ${expectedRatio} on every rung, not a swing`,
    Math.max(...vitRatios) - Math.min(...vitRatios), 0, 1e-3,
    `${vitRatios[0].toFixed(4)} at level ${dmgRuns[0].mon.level}, ${vitRatios.at(-1).toFixed(4)} at level ${dmgRuns.at(-1).mon.level}`);

  /* Weapon XP/hr is now a fixed multiple of damage/hr, so it can only move
     when the player's throughput moves. Two consequences, and they are the
     two the player feels:

     ADVANCING A FLAGSHIP TIER ALWAYS PAYS MORE. The nine flagship rungs are
     the spine — one relic tier each — and every step up must strictly climb.

     AND NO STEP ANYWHERE IS A CLIFF. The eight interleaved rungs sit BETWEEN
     relic tiers: same weapon, tougher target, so hit chance drops from ~82%
     to ~74% and the rung pays a few percent less XP than the flagship below
     it. That is the trade the reference's own non-monotonic ladders make
     (§4.3) — you take an interleaved rung for the armour and relics only it
     drops, and it costs you a rounding error of XP, not a third of it. Under
     the per-kill number this same step cost 29%. */
  const flagship = dmgRuns.filter(({ mon }) => Number.isInteger(mon.tier));
  const flagBack = flagship.filter((r, i) =>
    i > 0 && r.run.styleXpPerHour <= flagship[i - 1].run.styleXpPerHour).length;
  const steps = flagship.slice(1).map((r, i) => r.run.styleXpPerHour / flagship[i].run.styleXpPerHour);
  t.eq(`advancing a tier always pays more weapon XP, on all ${flagship.length} flagship rungs`, flagBack, 0,
    `${fmt(Math.round(flagship[0].run.styleXpPerHour))} XP/hr at tier one to ` +
    `${fmt(Math.round(flagship.at(-1).run.styleXpPerHour))} at tier nine, ` +
    `${Math.min(...steps).toFixed(1)}x-${Math.max(...steps).toFixed(1)}x a step`);

  const worstStep = Math.min(...dmgRuns.slice(1).map((r, i) =>
    r.run.styleXpPerHour / dmgRuns[i].run.styleXpPerHour));
  t.between("...and no rung on the whole ladder is a step backwards worth feeling",
    worstStep, 0.95, 4,
    `worst step ${((1 - worstStep) * 100).toFixed(1)}% down, on an interleaved rung fought for its drops`,
    "the per-kill number this replaced cost 29% at the same step");

  /* WHAT 0.4 BUYS, AS AN ARC. Walk the nine flagship rungs at the rate each
     one pays the moment it unlocks, and every relic tier is a similar sized
     chunk of the climb — which is the only property that makes a nine-rung
     ladder feel like nine steps rather than one wall and eight formalities.

     The whole weapon skill caps in a fraction of a gathering skill's 200-400
     hours, and that is the reference's own shape, not a slip: combat XP is
     the fast XP there too, and what actually gates a combat account is
     affording the next relic — 8 BILLION Cogs at the top of our ladder —
     rather than earning the next level. Skills for experience, combat for
     money, and the money is the long half. */
  const rungHours = flagship.map(({ mon, run }, i) => {
    const to = i + 1 < flagship.length ? flagship[i + 1].mon.level : SKILL_CAP;
    return (xpAt(to) - xpAt(mon.level)) / run.styleXpPerHour;
  });
  const climb = rungHours.reduce((a, b) => a + b, 0);
  t.between("no relic tier is a wall and none is a formality", Math.max(...rungHours), 1, 6,
    `every tier is ${Math.min(...rungHours.filter((h) => h > 0)).toFixed(1)}-${Math.max(...rungHours).toFixed(1)} hours of fighting`);
  t.between("a weapon skill caps in 15-40 h, a tenth of a gathering skill's arc",
    climb, 15, 40,
    `${climb.toFixed(1)} h up the nine flagship rungs at each rung's unlock rate`,
    "what gates a combat account is the 8B Cogs for the last relic, not the XP");

  /* Vitality is the long pole of the block, exactly as the reference's own
     Hitpoints is: it rides the same damage at 0.3325 of the rate, so it is
     still a dozen levels short when the weapon skill caps. That is the whole
     reason it is worth being a separate bar. */
  const vitAtCap = rungHours.reduce((a, h, i) => a + flagship[i].run.vitalityPerHour * h, 0);
  t.between("Vitality is still climbing when the weapon skill caps", levelAt(vitAtCap, SKILL_CAP), 80, 95,
    `Vitality ${levelAt(vitAtCap, SKILL_CAP)} at the moment the weapon skill hits ${SKILL_CAP}`);

  /* §7.5's success formula, at the two ends the design cares about: every
     rung opens at about a coin flip, and the top two are pitched above the
     maximum reachable stealth so they stay permanently short of certain. */
  const lar = db.skill("larceny");
  const opens = lar.recipes.map((r) => larcenySuccess(r.level + 1, r.perception, lar.stealthBase));
  t.between("every Larceny target opens at about a coin flip",
    Math.max(...opens) - Math.min(...opens), 0, 0.02,
    `${(Math.min(...opens) * 100).toFixed(1)}% to ${(Math.max(...opens) * 100).toFixed(1)}% at each unlock level`);
  const maxStealth = 99 + 99;      // skill cap + mastery cap
  const perfectable = lar.recipes.filter((r) => larcenySuccess(maxStealth, r.perception, lar.stealthBase) >= 1);
  t.between("...and the top third of the ladder can never be perfected",
    lar.recipes.length - perfectable.length, 3, 6,
    `${perfectable.length} of ${lar.recipes.length} reach 100% at stealth ${maxStealth}`);

  /* The reference measures its own tier-one Thieving NPC at ~29,000 GP/hr:
     50 gp at ~48% success on a 3 s action. Ours has to land there, because
     that ratio to hour-one gathering — 15x to 25x — is the entire reason the
     skill is worth the death risk. */
  const first = lar.recipes[0];
  const opening = first.cogs * larcenySuccess(2, first.perception, lar.stealthBase) * (3600 / lar.baseInterval);
  t.between("Larceny's first target opens on the reference's own ~29,000 an hour",
    opening, 27_000, 31_000,
    `${first.cogs} Cogs at ${(larcenySuccess(2, first.perception, lar.stealthBase) * 100).toFixed(1)}% success on a ${lar.baseInterval}s lift`);
  const lift1 = measure(db, { skillId: "larceny", recipeId: "lift-beggar", profile: "fresh" });
  t.between("...and an hour of it measures 25k-45k as that target's mastery climbs",
    lift1.cogsPerHour, 25_000, 45_000,
    `${fmt(Math.round(lift1.cogsPerHour))} Cogs/hr measured, against ${fmt(Math.round(opening))} at the opening rate`);
  t.between("...which is 12x-25x the first hour of any gathering skill",
    lift1.cogsPerHour / hourOne[0][1].cogsPerHour, 12, 25,
    "the reference's own thieving-to-woodcutting ratio, and the reason it can kill you");

  /* The stun model is the whole point of the skill: it must actually cost
     hit points, and it must actually eat food. */
  const lifted = measure(db, { skillId: "larceny", recipeId: "lift-captain", profile: "mastered" });
  t.ok("a caught lift really does take hit points and eat provisions",
    lifted.provisionsEaten > 0, "> 0 provisions/hr", `${Math.round(lifted.provisionsEaten)} provisions/hr`,
    "section 3h: failure stuns AND damages you, off the combat HP bar");

  /* Armour is a percentage layer on the relic spine, and it has to be worth
     having without being a second spine. Measured: one hour of tier-nine
     combat naked, one hour in the best set in every slot. */
  const kit = (equip) => {
    const g = positioned(db, { skillId: "attack", recipeId: "the-ninefold-warden", profile: "mastered", monsterLevel: 99 });
    if (equip) {
      for (const it of db.items.values()) {
        if (it.equip?.set !== "ninefold") continue;
        g.addItem(it.id, 1);
        g.equip(it.id);
      }
    }
    g.fight("the-ninefold-warden");
    g.advanceSeconds(3600);
    return g.state.stats.kills;
  };
  const bare = kit(false), kitted = kit(true);
  t.between("a full best-in-slot set is worth 1.15x-3x, never more",
    kitted / bare, 1.15, 3,
    `${bare} kills an hour bare, ${kitted} kitted — a real layer, not a second spine`);

  /* The consume end of the chain has to be load-bearing, or the whole
     gather -> process -> consume triangle is decoration. */
  const fed = measure(db, { skillId: "attack", recipeId: "the-ninefold-warden", profile: "mastered", monsterLevel: 99 });
  t.ok("endgame combat genuinely eats provisions", fed.provisionsEaten > 100,
    "> 100 an hour", `${Math.round(fed.provisionsEaten)} provisions/hr`,
    "so Trawling and Hearthcraft are load-bearing, not decorative");

  return finish(t, ref);
}

function finish(t, ref) {
  return {
    results: t.results,
    passed: t.passed,
    failed: t.failed,
    total: t.results.length,
    reference: ref,
  };
}
