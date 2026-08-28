/* =========================================================================
   EMBERVEIL ENGINE — THE BALANCE SANDBOX

   Every number in the balance report is MEASURED by running the real tick
   engine for an hour of game time under a stated configuration. Nothing in
   the report is a spreadsheet formula standing in for the game, because a
   spreadsheet cannot tell you what a node's respawn does to your rate, or
   what happens when a quality roll lands, or what the reliquary does when it
   fills up. The engine can, so we ask it.

   Two profiles are measured for every rung:

     FRESH     — the moment it unlocks: exactly the required level, mastery 1,
                 no tools, no waystations, no checkpoints.
     MASTERED  — the end state for that rung: skill capped, mastery 99 on
                 every recipe in the skill, the full tool ladder, all four
                 pool checkpoints live, and the comfort purchases that apply.

   The spread between them is the build-crafting. The reference's faucet table
   is a table of RANGES for exactly this reason, and a single number would be
   a lie in either direction.
   ========================================================================= */

import { Game, freshState } from "./game.js";
import { xpAt } from "./xp.js";
import { SKILL_CAP, MASTERY_CAP, TICKS_PER_SECOND } from "./constants.js";
import { poolCapBase } from "./mastery.js";
import { ticksToSeconds } from "./interval.js";

const HUGE = 1e9;

/** The waystation set the report treats as "fully invested": every station
 *  whose net contribution to a throughput loop is positive, plus the two
 *  signed ones a real player takes anyway. */
export const REFERENCE_WAYSTATIONS = [
  "way-milestone",
  "way-windbreak",
  "way-shrine",
  "way-beacon",
  "way-ford",
  "way-hollowgate",
  "way-reliquary",
  "way-ninefold-arch",
];

/* The combat block is eight skills and no page (§1), so "measure Warding"
   means "measure a fight". Callers still say `warding` — the balance report
   and every save written before the split do — and it resolves to the skill
   the default attack style trains, which is where the XP would land. */
const COMBAT_ALIASES = new Set(["warding", "combat", "attack", "strength", "defence", "ranged", "magic"]);
const COMBAT_SKILL = "attack";
/** The five skills an attack style can route XP into (../engine/combat.js). */
const STYLE_SKILLS = ["attack", "strength", "defence", "ranged", "magic"];
const styleXpTotal = (g) => STYLE_SKILLS.reduce((a, id) => a + g.state.skills[id].xp, 0);
const isCombat = (id) => COMBAT_ALIASES.has(id);

const COMFORTS_FOR = {
  delving: ["charm-twin-vein", "lens-focus"],
  boughcraft: ["lens-focus"],
  trawling: ["lens-focus"],
  emberrite: ["lens-focus"],
  kilnwork: ["lens-focus"],
  hearthcraft: ["lens-focus"],
  sigilwork: ["lens-focus"],
  wayfaring: ["lens-focus"],
  larceny: ["ward-auto-1", "ward-auto-2", "ward-auto-3", "lens-focus"],
  attack: ["ward-auto-1", "ward-auto-2", "ward-auto-3", "lens-focus"],
};

/**
 * Build a game positioned at a given point in the progression.
 *
 * @param {object} db
 * @param {object} cfg
 * @param {string} cfg.skillId
 * @param {string} [cfg.recipeId]
 * @param {"fresh"|"mastered"} cfg.profile
 * @param {boolean} [cfg.ascended]   include the nine Ascension Rites
 * @param {boolean} [cfg.stocked]    fill the reliquary with every input
 */
export function positioned(db, cfg) {
  const { recipeId, profile, ascended = false, stocked = true } = cfg;
  const skillId = isCombat(cfg.skillId) ? COMBAT_SKILL : cfg.skillId;
  const g = new Game(db, { autoSell: true, seed: 0xe4be27 });
  const s = g.state;
  const skill = db.skill(skillId);
  const recipe = recipeId ? db.recipe(recipeId) : null;

  s.clasps = 118; // never let the sink distort a throughput measurement

  if (profile === "fresh") {
    s.skills[skillId].xp = xpAt(recipe ? recipe.level : 1);
    if (isCombat(cfg.skillId)) {
      const lvl = cfg.monsterLevel || 1;
      /* All five weapon skills sit at the fight's own level, because a player
         farming a tier-six monster has been fighting all the way up to it. */
      for (const id of ["attack", "strength", "defence", "ranged", "magic"]) s.skills[id].xp = xpAt(lvl);
      s.skills.vitality.xp = xpAt(Math.max(1, Math.floor(lvl * 0.9)));
      const relic = relicForLevel(db, lvl);
      if (relic) grantChain(g, db, relic);
    }
  } else {
    for (const sk of db.skills) s.skills[sk.id].xp = xpAt(ascended ? 120 : SKILL_CAP);
    for (const sk of db.masterySkills) {
      for (const r of sk.recipes) s.skills[sk.id].mastery[r.id] = xpAt(MASTERY_CAP);
      s.skills[sk.id].pool = poolCapBase(db.recipeCounts[sk.id]); // all four checkpoints live
    }
    /* A Warding rung is measured with the relic a player farming that rung
       would actually be holding. Handing the tier-nine blade to someone
       farming Hollow Wisps would produce a very impressive and completely
       meaningless number. */
    const relicCeiling = cfg.monsterLevel ?? 99;
    for (const e of db.shop) {
      if (e.category === "ascension" && !ascended) continue;
      if (e.category === "comfort" && !(COMFORTS_FOR[skillId] || []).includes(e.id)) continue;
      if (e.category === "relic" && e.level > relicCeiling) continue;
      /* Bounty Marks are a currency the sandbox does not simulate and
         equipment sets are pure convenience, so neither shelf is granted.
         The consequence is that every combat figure in the report UNDERSTATES
         a real capped player, which is the safe direction to be wrong in. */
      if (e.category === "bounty" || e.category === "gear") continue;
      s.purchases[e.id] = 1;
    }
    for (const w of REFERENCE_WAYSTATIONS) s.waystations.push(w);
  }

  if (profile === "fresh") {
    /* Fresh means fresh: only the one tool ladder step the level allows. */
    for (const e of db.shop) {
      if (e.category !== "tool" || e.skill !== skillId) continue;
      if (e.level <= (recipe ? recipe.level : 1) && e.level === 1) s.purchases[e.id] = 1;
    }
  }

  g._invalidate();
  g._usedSlots = 0;

  if (stocked) stock(g, db, skillId, recipeId);
  return g;
}

function relicForLevel(db, level) {
  let best = null;
  for (const r of db.relics) if (r.level <= level) best = r;
  return best;
}

function grantChain(g, db, entry) {
  const chain = [];
  let e = entry;
  while (e) { chain.unshift(e); e = e.requires ? db.shopEntry(e.requires) : null; }
  for (const c of chain) g.state.purchases[c.id] = 1;
  g._invalidate();
}

/** Fill the reliquary so an artisan measurement is never input-starved. */
function stock(g, db, skillId, recipeId) {
  const skill = db.skill(skillId);
  const wanted = new Set();
  for (const r of skill.recipes || []) {
    if (recipeId && r.id !== recipeId) continue;
    for (const [id] of r.consumes || []) wanted.add(id);
  }
  for (const id of wanted) g.state.items[id] = HUGE;
  g.state.shards = HUGE;
  g._usedSlots = wanted.size;

  /* Combat and Larceny both eat: stock the best provision so neither is ever
     lost to hunger. Larceny is here for the same reason it ships with the
     combat core — it draws on the same hit points and the same food. */
  if (isCombat(skillId) || skillId === "larceny") {
    const provisions = [...db.items.values()].filter((i) => i.kind === "provision" && !i.perfectOf);
    const best = provisions.sort((a, b) => b.heal - a.heal)[0];
    g.state.items[best.id] = HUGE;
    g.state.food = best.id;
    g._usedSlots++;
  }
}

/**
 * Run one configuration for `hours` of game time and report measured rates.
 * Input stock is topped back up so the measurement is of THROUGHPUT, not of
 * how deep the reliquary was when we started.
 */
export function measure(db, cfg, hours = 1) {
  const g = positioned(db, cfg);
  const { recipeId } = cfg;
  const skillId = isCombat(cfg.skillId) ? COMBAT_SKILL : cfg.skillId;

  const before = {
    cogs: g.state.cogs,
    xp: g.state.skills[skillId].xp,
    shards: g.state.shards,
    actions: g.state.stats.actions,
    kills: g.state.stats.kills,
    vitality: g.state.skills.vitality.xp,
    pool: g.state.skills[skillId].pool,
    /* Combat XP is paid per point of damage and split across the style's
       shares, so the honest total is the sum over all five weapon skills —
       reading one of them would understate any style that splits. */
    styleXp: styleXpTotal(g),
    damage: g.state.stats.damageDealt,
  };
  const stockBefore = { ...g.state.items };

  if (isCombat(cfg.skillId)) g.fight(recipeId);
  else g.start(skillId, recipeId);

  const intervalTicks =
    isCombat(cfg.skillId) ? g._playerAttackTicks() : g.state.action.intervalTicks;

  const t0 = performance.now();
  g.advanceSeconds(hours * 3600);
  const ms = performance.now() - t0;

  /* Restore consumed stock so multi-hour runs stay honest. */
  for (const id of Object.keys(stockBefore)) {
    if (stockBefore[id] >= HUGE) g.state.items[id] = HUGE;
  }

  const producedValue = {};
  for (const [id, n] of g.produced) producedValue[id] = n / hours;

  return {
    produced: producedValue,
    cfg,
    hours,
    cogsPerHour: (g.state.cogs - before.cogs) / hours,
    xpPerHour: (g.state.skills[skillId].xp - before.xp) / hours,
    xpPerSecond: (g.state.skills[skillId].xp - before.xp) / (hours * 3600),
    shardsPerHour: (g.state.shards - before.shards) / hours,
    vitalityPerHour: (g.state.skills.vitality.xp - before.vitality) / hours,
    /* The two halves of the per-damage XP rule, and the damage they are both
       computed from, so the selftest can check the identity rather than a
       band. See STYLE_XP_PER_DAMAGE in ./constants.js. */
    styleXpPerHour: (styleXpTotal(g) - before.styleXp) / hours,
    damageDealt: g.state.stats.damageDealt - before.damage,
    poolPerHour: (g.state.skills[skillId].pool - before.pool) / hours,
    actionsPerHour: (g.state.stats.actions - before.actions) / hours,
    killsPerHour: (g.state.stats.kills - before.kills) / hours,
    deaths: g.state.stats.deaths,
    provisionsEaten: g.state.stats.provisionsEaten / hours,
    intervalSeconds: ticksToSeconds(intervalTicks),
    stoppedReason: g.state.stoppedReason,
    ms,
    game: g,
  };
}

/* =========================================================================
   BURST VERSUS SUSTAINED

   An artisan skill measured with a full reliquary reports a fantasy. Ninefold
   Sigils at 2.35 s each are worth billions an hour right up until you notice
   each one eats forty Aether Shards, and shards only fall off tier-five
   Warding and sub-1% Delving rolls.

   So every artisan rung gets a second number. Measure the whole tree once
   with the real engine, turn each item into "seconds of play per unit", walk
   the recipe tree, and throttle the burst rate by the fraction of a cycle
   that is actually the craft:

        throttle = ownSeconds / (ownSeconds + inputSeconds)

   Sustained rate is the honest one, and it is the only number that lets you
   compare "run the Kilnwork loop" against "just sell the ore".
   ========================================================================= */

/**
 * Measure every gathering rung, every route and every monster once, and index
 * how fast each item and each currency actually arrives.
 */
export function economyRates(db, profile = "mastered") {
  const perHour = new Map();      // itemId -> units/hour from its best source
  const recipeRuns = new Map();   // recipeId -> measurement
  let shardsPerHour = 0;

  for (const skill of db.skills) {
    for (const r of skill.recipes || []) {
      const run = measure(db, { skillId: skill.id, recipeId: r.id, profile });
      recipeRuns.set(r.id, run);
      shardsPerHour = Math.max(shardsPerHour, run.shardsPerHour);
      for (const [id, n] of Object.entries(run.produced)) {
        if (n > (perHour.get(id) || 0)) perHour.set(id, n);
      }
    }
  }

  const monsterRuns = new Map();
  for (const m of db.monsters) {
    const run = measure(db, {
      skillId: COMBAT_SKILL, recipeId: m.id, profile,
      monsterLevel: m.level,
    });
    monsterRuns.set(m.id, run);
    shardsPerHour = Math.max(shardsPerHour, run.shardsPerHour);
    for (const [id, n] of Object.entries(run.produced)) {
      if (n > (perHour.get(id) || 0)) perHour.set(id, n);
    }
  }

  return { perHour, recipeRuns, monsterRuns, shardsPerHour };
}

/** Seconds of play, all the way down the tree, to obtain one of an item. */
export function secondsPerUnit(db, rates, itemId, cache = new Map(), seen = new Set()) {
  if (cache.has(itemId)) return cache.get(itemId);
  if (seen.has(itemId)) return Infinity;
  seen.add(itemId);

  let best = Infinity;
  const direct = rates.perHour.get(itemId);
  if (direct > 0) best = 3600 / direct;

  for (const skill of db.skills) {
    for (const r of skill.recipes || []) {
      if (r.produces !== itemId || !(r.consumes || r.shards)) continue;
      const run = rates.recipeRuns.get(r.id);
      const made = run?.produced[itemId];
      if (!made) continue;
      const own = 3600 / made;
      let inputs = 0;
      const perUnitDivisor = made / run.actionsPerHour; // units produced per action
      for (const [id, qty] of r.consumes || []) {
        inputs += (qty / perUnitDivisor) * secondsPerUnit(db, rates, id, cache, seen);
      }
      if (r.shards && rates.shardsPerHour > 0) {
        inputs += (r.shards / perUnitDivisor) * (3600 / rates.shardsPerHour);
      }
      best = Math.min(best, own + inputs);
    }
  }

  seen.delete(itemId);
  cache.set(itemId, best);
  return best;
}

/**
 * Throttle a burst measurement down to what the input chain can actually feed.
 * @returns {{throttle:number, cogsPerHour:number, xpPerSecond:number, inputSeconds:number}}
 */
export function sustained(db, rates, skill, recipe, burst, cache = new Map()) {
  const made = burst.produced[recipe.produces] || burst.produced[`perfect-${recipe.produces}`];
  if (!recipe.consumes && !recipe.shards) {
    return { throttle: 1, cogsPerHour: burst.cogsPerHour, xpPerSecond: burst.xpPerSecond, inputSeconds: 0 };
  }
  const totalMade = Object.entries(burst.produced)
    .filter(([id]) => id === recipe.produces || id === `perfect-${recipe.produces}`)
    .reduce((a, [, n]) => a + n, 0) || made || 1;

  const perAction = totalMade / burst.actionsPerHour;
  const own = 3600 / totalMade;
  let inputs = 0;
  for (const [id, qty] of recipe.consumes || []) {
    inputs += (qty / perAction) * secondsPerUnit(db, rates, id, cache);
  }
  if (recipe.shards && rates.shardsPerHour > 0) {
    inputs += (recipe.shards / perAction) * (3600 / rates.shardsPerHour);
  }
  const throttle = Number.isFinite(inputs) ? own / (own + inputs) : 0;
  return {
    throttle,
    cogsPerHour: burst.cogsPerHour * throttle,
    xpPerSecond: burst.xpPerSecond * throttle,
    inputSeconds: inputs,
  };
}

export { TICKS_PER_SECOND, freshState, COMBAT_SKILL };
