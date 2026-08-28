/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: FARMING   (parity §3c)

   Plots, not actions. Farming never touches `state.action`: every plot runs
   its own countdown in ticks, the main loop's event jump sees them through
   ./index.js, and the same code path serves a live session and a 24-hour
   offline replay. Plant a crop, close the tab for a day, come back: the plot
   ripened at the tick it was always going to ripen at, and the grow roll
   came off the same seeded RNG stream it would have come off live.

   ---------------------------------------------------------------------------
   THE LIFE OF A PLOT
   ---------------------------------------------------------------------------
       empty  --plant(cogs)-->  growing  --countdown hits 0-->  ONE ROLL
                                                              /          \
                                                          ready         dead
                                                            |             |
                                                        harvest       replant
                                                            |             |
                                                          empty <---------+

   The roll is the skill. Base grow chance is 50%, which means half of
   everything planted dies, and compost is the only thing that buys that
   back — +10% per application to a ceiling of five. Because compost is
   priced flat and yields climb the ladder, composting a Potato is a waste
   and composting Ironbark is not optional. That crossover is the whole
   economy of the skill, and it is why the roll happens at maturity rather
   than at planting: the player commits the compost before they know.

   ---------------------------------------------------------------------------
   TWO THINGS THIS FILE IS CAREFUL ABOUT
   ---------------------------------------------------------------------------
   MODIFIERS. `game.mods()` only carries recipe-scoped mastery unlocks for
   the recipe in `state.action`, because that is the only one the foreground
   loop can be working. Farming has up to eighteen live recipes at once, so
   this file assembles a per-crop set: the global set merged with THAT crop's
   own mastery unlocks. `ModifierSet.merge` copies the bucket arrays it takes
   from an empty target, so the game's own set is never mutated by this.

   MASTERY XP. §2.1 gives Farming its own action-time rule, and it is the
   only skill in the game that does not use seconds: the HOURS the crop spent
   in the ground, times the quantity harvested, divided by 3 for allotments
   and herbs or by 10 for trees. A forty-five-minute tree harvest would
   otherwise be worth a day of allotments.
   ========================================================================= */

import {
  CROP_BY_ID, CATEGORY_BY_ID, CATEGORIES, growChance, COMPOST_BY_ID, COMPOST_MAX,
} from "../../../data/crops.js";
import { ModifierSet, MOD, clamp } from "../modifiers.js";
import { intervalTicks, ticksToSeconds } from "../interval.js";
import { masteryXpPerAction, poolDepositRate, depositToPool } from "../mastery.js";
import { xpAt } from "../xp.js";
import { MASTERY_CAP } from "../constants.js";

const SKILL = "farming";

/* =========================================================================
   STATE
   ========================================================================= */

/**
 * The save slice, created on first touch. A player who has never opened the
 * farm has no `state.farming` key at all, which is what lets a sandbox game
 * hash identically with this module loaded or not.
 */
export function farmState(game, create = true) {
  const s = game.state;
  /* `init()` seeds this on every new save; the guard is for a save written
     before the passive wing existed. */
  if (!s.farming && create) {
    s.farming = {
      plots: [],
      /* PURCHASED plots only. The first plot of each category is free and is
         granted by level, so it is derived rather than stored. */
      bought: { allotment: 0, herb: 0, tree: 0 },
      /* The crop each category's bulk "Plant All Selected Crops" uses. */
      sel: { allotment: null, herb: null, tree: null },
      harvested: 0,
      /* Cycles, not items: `grown` and `died` are the two halves of the grow
         roll, so the loss rate compost buys back is measurable directly
         instead of being inferred from an item count and a yield. */
      grown: 0,
      died: 0,
    };
  }
  return s.farming || null;
}

/** How many plots of a category the player is entitled to right now. */
export function plotEntitlement(game, catId) {
  const cat = CATEGORY_BY_ID.get(catId);
  const lv = game.skillLevel(SKILL);
  const free = cat.plots[0].level <= lv ? 1 : 0;
  return free + (farmState(game)?.bought[catId] || 0);
}

/** The next plot the player could buy in a category, or null if none left. */
export function nextPlot(game, catId) {
  const cat = CATEGORY_BY_ID.get(catId);
  const owned = plotEntitlement(game, catId);
  return cat.plots[owned] || null;
}

/**
 * Reconcile the plot array with the entitlement. Called from every read and
 * every write, so a level-up silently hands the player their free herb bed
 * without any screen having to notice.
 */
export function ensurePlots(game) {
  const f = farmState(game);
  for (const cat of CATEGORIES) {
    const want = plotEntitlement(game, cat.id);
    const have = f.plots.filter((p) => p.cat === cat.id).length;
    for (let i = have; i < want; i++) {
      f.plots.push({ cat: cat.id, crop: null, ticks: 0, grow: 0, compost: 0, st: "empty" });
    }
  }
  return f.plots;
}

/** Every plot of a category, in creation order. */
export const plotsIn = (game, catId) => ensurePlots(game).filter((p) => p.cat === catId);

/* =========================================================================
   MODIFIERS

   One set per crop: everything global plus that crop's own mastery unlocks.
   ========================================================================= */

export function cropMods(game, cropId) {
  const m = new ModifierSet().merge(game.mods());
  const skill = game.db.skill(SKILL);
  const lvl = game.masteryLevel(SKILL, cropId);
  for (const u of skill.masteryUnlocks || []) {
    if (lvl < u.level) continue;
    for (const [name, value, sym] of u.mods || []) {
      const scope = sym === "recipe" ? cropId : sym === "skill" ? SKILL : sym === "global" ? null : sym;
      m.add(name, value, { scope, source: `${CROP_BY_ID.get(cropId).name} mastery ${u.level}` });
    }
  }
  return m;
}

const scopesFor = (cropId) => [SKILL, cropId];

/** Grow time in ticks, through §4.1 exactly as any other interval. */
export function growTicks(game, cropId) {
  const crop = CROP_BY_ID.get(cropId);
  const m = cropMods(game, cropId);
  const sc = scopesFor(cropId);
  return intervalTicks(crop.growSeconds, m.intervalReduction(sc), m.sum(MOD.intervalFlat, sc));
}

/** The chance this plot's crop survives to harvest, 0..1. */
export function plotGrowChance(game, plot) {
  const base = growChance(plot.compost);
  if (!plot.crop) return base;
  const m = cropMods(game, plot.crop);
  return clamp(base + m.sum("growChance", scopesFor(plot.crop)), 0, 1);
}

/** Cogs to plant one of `cropId`, after every cost reduction that applies. */
export function seedCost(game, cropId) {
  const crop = CROP_BY_ID.get(cropId);
  const cut = clamp(cropMods(game, cropId).sum(MOD.costReduction, scopesFor(cropId)), 0, 0.9);
  return Math.max(1, Math.floor(crop.seedCost * (1 - cut)));
}

/**
 * What the UI quotes as this crop's yield: the bed's rate through every
 * `yieldPercent` share, then the flat "+N" bucket. The doubling roll is
 * deliberately not folded in — it is a chance, and a preview that averages a
 * chance in is a preview that is never right about any single harvest.
 *
 * `yieldPercent` rather than "+N" is the whole reason a bonus stays a bonus:
 * ../../../data/crops.js sizes a bed in units per plot-hour, so a Potato bed
 * is twelve and a Barley bed six hundred, and a flat +1 would be a fifth of
 * the first and nothing at all of the second.
 */
export function baseYield(game, cropId) {
  const { doublable, flat } = yieldParts(game, cropId);
  return Math.max(1, doublable + flat);
}

/**
 * A harvest in two halves, because the engine's quantity order is not
 * negotiable (§7.2): everything percentage-based scales the base and is then
 * subject to the doubling roll, and the "+N base quantity" bucket is tagged
 * non-doublable and lands last.
 */
function yieldParts(game, cropId) {
  const crop = CROP_BY_ID.get(cropId);
  const m = cropMods(game, cropId);
  const sc = scopesFor(cropId);
  const pct = Math.max(-0.9, m.sum("yieldPercent", sc));
  return {
    doublable: Math.max(1, Math.floor(crop.yield * (1 + pct))),
    flat: Math.max(0, Math.floor(m.sum(MOD.flatQuantity, sc))),
  };
}

/* =========================================================================
   PLAYER ACTIONS
   ========================================================================= */

/** Crops of a category the player's level allows, best rung last. */
export const availableCrops = (game, catId) =>
  game.db.skill(SKILL).recipes.filter(
    (r) => r.category === catId && r.level <= game.skillLevel(SKILL)
  );

/**
 * Plant `cropId` into plot `index`. Charges the seed price in Cogs.
 * @returns {string|null} a reason string on refusal, null on success
 */
export function plant(game, index, cropId) {
  const f = farmState(game);
  ensurePlots(game);
  const p = f.plots[index];
  if (!p) return "no such plot";
  if (p.st === "growing" || p.st === "ready") return "plot is busy";
  const crop = CROP_BY_ID.get(cropId);
  if (!crop) return "no such crop";
  if (crop.category !== p.cat) return "wrong bed for that crop";
  if (game.skillLevel(SKILL) < crop.level) return "level too low";

  const cost = seedCost(game, cropId);
  if (game.state.cogs < cost) return "not enough Cogs";
  game.state.cogs -= cost;
  game.state.stats.cogsSpent += cost;

  p.crop = cropId;
  p.grow = growTicks(game, cropId);
  p.ticks = p.grow;
  p.compost = 0;
  p.st = "growing";
  return null;
}

/** Apply one compost tier to a plot. Only a growing crop can take it. */
export function compost(game, index, tierId = "compost") {
  const f = farmState(game);
  ensurePlots(game);
  const p = f.plots[index];
  if (!p) return "no such plot";
  if (p.st !== "growing") return "nothing growing there";
  const tier = COMPOST_BY_ID.get(tierId);
  if (!tier) return "no such compost";
  if (tier.unlock && !game.state.purchases[tier.unlock]) return "not unlocked";
  if (p.compost >= 5) return "already fully composted";
  if (game.state.cogs < tier.cost) return "not enough Cogs";
  game.state.cogs -= tier.cost;
  game.state.stats.cogsSpent += tier.cost;
  p.compost = Math.min(5, p.compost + tier.applications);
  return null;
}

/**
 * Harvest a ripe plot, or clear a dead one.
 * @returns {{items:number, xp:number}|null}
 */
export function harvest(game, index) {
  const f = farmState(game);
  ensurePlots(game);
  const p = f.plots[index];
  if (!p) return null;

  if (p.st === "dead") { p.st = "empty"; p.compost = 0; p.ticks = 0; return { items: 0, xp: 0 }; }
  if (p.st !== "ready") return null;

  const crop = CROP_BY_ID.get(p.crop);
  const m = cropMods(game, p.crop);
  const sc = scopesFor(p.crop);

  /* Quantity, in the engine's own order: the bed's rate through every
     `yieldPercent` share, then the doubling roll, then the flat "+N base
     quantity" bucket that is tagged as non-doublable. */
  const { doublable, flat } = yieldParts(game, p.crop);
  const doubled = game.rng.chance(m.sum(MOD.doubleChance, sc));
  const qty = Math.max(1, doublable * (doubled ? 2 : 1) + flat);
  game._deliver(crop.itemId, qty);

  /* Skill XP is per HARVEST, not per unit — the plot is the action. */
  const xp = crop.xp * (1 + m.sum(MOD.skillXP, sc));
  const beforeLvl = game.skillLevel(SKILL);
  game.state.skills[SKILL].xp += xp;
  if (game.skillLevel(SKILL) !== beforeLvl) game._invalidate();

  /* §2.1's quantity term, in BEDS rather than in leaves: one for a clean
     harvest, two for a doubled one. */
  grantMastery(game, crop, doubled ? 2 : 1, m, sc);

  f.harvested += qty;
  game.state.stats.actions++;
  game._checkCheckpointDrift(SKILL);

  p.st = "empty";
  p.compost = 0;
  p.ticks = 0;
  return { items: qty, xp };
}

/**
 * §2.1's farming rule, and the only place in the game where mastery action
 * time is measured in hours rather than seconds:
 *
 *     actionTime = growHours x quantity / (3 allotments and herbs, 10 trees)
 *
 * THE QUANTITY TERM IS SEEDS, NOT LEAVES. The reference multiplies by what
 * came out of the plot because in the reference a plot holds three seeds and
 * hands back about five of a thing. Ours hands back a whole bed — 645 Barley
 * — so feeding that straight in would have tied mastery XP to a supply-side
 * tuning number and inflated it a hundredfold the moment ../../../data/
 * crops.js was rebalanced to feed Alchemy. `beds` is 1 for a clean harvest
 * and 2 for a doubled one, and `seedsPerBed` is the category's own 5/4/6, so
 * mastery prices a BED-HOUR and is immune to the yield ladder by
 * construction.
 */
function grantMastery(game, crop, beds, m, sc) {
  const s = game.state;
  const cat = CATEGORY_BY_ID.get(crop.category);
  const hours = crop.growSeconds / 3600;
  const actionTime = (hours * beds * cat.seedsPerBed) / cat.masteryDivisor;

  const mxp = masteryXpPerAction({
    unlockedActions: game.unlockedActions(SKILL),
    totalMasteryInSkill: game.totalMastery(SKILL),
    totalItemsInSkill: game.db.recipeCounts[SKILL],
    itemMasteryLevel: game.masteryLevel(SKILL, crop.id),
    actionTime,
    bonus: m.sum(MOD.masteryXP, sc),
  });

  const bank = s.skills[SKILL].mastery;
  const before = game.masteryLevel(SKILL, crop.id);
  bank[crop.id] = Math.min(xpAt(MASTERY_CAP), (bank[crop.id] || 0) + mxp);
  if (game.masteryLevel(SKILL, crop.id) !== before) game._invalidate();

  const rate = poolDepositRate(game.skillLevel(SKILL));
  const { pool, wasted } = depositToPool(s.skills[SKILL].pool, mxp * rate, game.poolCapFor(SKILL));
  s.skills[SKILL].pool = pool;
  s.stats.poolWasted += wasted;
}

/** Buy the next plot in a category. */
export function buyPlot(game, catId) {
  const slot = nextPlot(game, catId);
  if (!slot) return "every plot is already yours";
  if (game.skillLevel(SKILL) < slot.level) return `needs Farming ${slot.level}`;
  if (game.state.cogs < slot.cost) return "not enough Cogs";
  game.state.cogs -= slot.cost;
  game.state.stats.cogsSpent += slot.cost;
  farmState(game).bought[catId]++;
  ensurePlots(game);
  return null;
}

/* =========================================================================
   BULK ACTIONS   (parity §3c — the five prices are the reference's own)
   ========================================================================= */

/** Charge a flat bulk fee, or refuse. */
function payBulk(game, cost) {
  if (game.state.cogs < cost) return false;
  game.state.cogs -= cost;
  game.state.stats.cogsSpent += cost;
  return true;
}

export function harvestAll(game, cost = 2000) {
  const f = farmState(game);
  ensurePlots(game);
  const ripe = f.plots.filter((p) => p.st === "ready" || p.st === "dead");
  if (!ripe.length) return "nothing to harvest";
  if (!payBulk(game, cost)) return "not enough Cogs";
  let n = 0;
  for (let i = 0; i < f.plots.length; i++) {
    const r = harvest(game, i);
    if (r) n += r.items;
  }
  return { items: n };
}

export function compostAll(game, tierId = "compost", cost = 2000) {
  const f = farmState(game);
  ensurePlots(game);
  const tier = COMPOST_BY_ID.get(tierId);
  if (tier.unlock && !game.state.purchases[tier.unlock]) return "not unlocked";
  const targets = f.plots.filter((p) => p.st === "growing" && p.compost < 5);
  if (!targets.length) return "nothing to compost";
  if (!payBulk(game, cost)) return "not enough Cogs";
  for (const p of targets) p.compost = Math.min(5, p.compost + tier.applications);
  return { plots: targets.length };
}

/**
 * `mode: "best"` plants the highest rung unlocked in each category — the
 * reference's "Plant All". `mode: "selected"` plants what the player picked
 * per category — its "Plant All Selected Crops". Both charge the flat bulk
 * fee AND the per-plot seed price, which is exactly what the reference does:
 * the 5,000 buys you the taps, not the seed.
 */
export function plantAll(game, mode = "best", cost = 5000) {
  const f = farmState(game);
  ensurePlots(game);
  const empty = f.plots.filter((p) => p.st === "empty" || p.st === "dead");
  if (!empty.length) return "every plot is planted";

  const pick = {};
  for (const cat of CATEGORIES) {
    const list = availableCrops(game, cat.id);
    if (!list.length) continue;
    pick[cat.id] = mode === "selected" && f.sel[cat.id] && list.some((c) => c.id === f.sel[cat.id])
      ? f.sel[cat.id]
      : list[list.length - 1].id;
  }
  if (!Object.keys(pick).length) return "nothing unlocked to plant";
  if (!payBulk(game, cost)) return "not enough Cogs";

  let n = 0;
  for (let i = 0; i < f.plots.length; i++) {
    const p = f.plots[i];
    if (p.st !== "empty" && p.st !== "dead") continue;
    if (p.st === "dead") { p.st = "empty"; p.compost = 0; }
    const crop = pick[p.cat];
    if (!crop) continue;
    if (!plant(game, i, crop)) n++;
  }
  return { plots: n };
}

/* =========================================================================
   THE TICK
   ========================================================================= */

/**
 * Ticks until the next plot ripens, or Infinity.
 *
 * THE EMPTY-FARM EARLY-OUT IS LOAD-BEARING. Both of these run once per event
 * in the main loop, and a 24 h replay of the game's fastest rung is ~350,000
 * events; every system in the registry pays that toll on every save, whether
 * or not the player has ever planted anything. Reducing the idle case to two
 * property reads is worth more than any amount of cleverness in the loop
 * below, which only ever sees at most eighteen plots.
 */
function nextEvent(game) {
  const f = game.state.farming;
  if (!f || !f.plots.length) return Infinity;
  let m = Infinity;
  const plots = f.plots;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (p.st === "growing" && p.ticks < m) m = p.ticks;
  }
  return m;
}

/**
 * One roll, at the moment the crop finishes growing. A failure is a real
 * loss — no items, no XP, no mastery — which is what gives compost its
 * teeth.
 */
function mature(game, plot, index) {
  const chance = plotGrowChance(game, plot);
  plot.ticks = 0;
  if (game.rng.chance(chance)) {
    plot.st = "ready";
    game.state.farming.grown++;
  } else {
    plot.st = "dead";
    game.state.farming.died++;
  }

  /* The Grange Steward works the farm unattended, which is what makes the
     whole wing pay while the tab is closed. It harvests, replants the same
     crop, and re-applies the SAME compost the plot was carrying — a steward
     that replanted but left the beds bare would halve an automated farm's
     yield against a hand-worked one, which is an automation upgrade that
     makes the skill worse. The compost bill is still paid in Cogs every
     cycle, so the sink survives the convenience. */
  if (!game.state.purchases["farm-grange-steward"]) return;
  const crop = plot.crop;
  const order = plot.compost;
  harvest(game, index);
  if (plot.st !== "empty" || !crop) return;
  if (plant(game, index, crop)) return;
  restoreCompost(game, index, order);
}

/** Re-apply `want` applications, in the cheapest way the player has unlocked. */
function restoreCompost(game, index, want) {
  if (!(want > 0)) return;
  const loam = COMPOST_BY_ID.get("emberloam");
  if (want >= COMPOST_MAX && game.state.purchases[loam.unlock]) {
    compost(game, index, "emberloam");
    return;
  }
  for (let n = 0; n < want; n++) if (compost(game, index, "compost")) return;
}

function tick(game, k) {
  const f = game.state.farming;
  if (!f || !f.plots.length) return;
  const plots = f.plots;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (p.st !== "growing") continue;
    p.ticks -= k;
    if (p.ticks <= 0) mature(game, p, i);
  }
}

/* =========================================================================
   READS FOR THE UI
   ========================================================================= */

/** Seconds left on a plot, for the countdown. */
export const plotSeconds = (plot) => ticksToSeconds(Math.max(0, plot.ticks));

/** 0..1 of the way to ripe. */
export const plotProgress = (plot) =>
  plot.grow > 0 ? clamp(1 - plot.ticks / plot.grow, 0, 1) : 0;

/** A whole-farm summary line for the skill page. */
export function summary(game) {
  const f = game.state.farming;
  if (!f) return { plots: 0, growing: 0, ready: 0, dead: 0, empty: 0 };
  const out = { plots: f.plots.length, growing: 0, ready: 0, dead: 0, empty: 0 };
  for (const p of f.plots) out[p.st]++;
  return out;
}

/**
 * Seed the slice onto a fresh save. The farm is part of the save format from
 * day one rather than appearing the first time somebody plants something, so
 * a save written before the player ever opened the page and one written after
 * have the same shape.
 */
function init(state) {
  state.farming = {
    plots: [],
    bought: { allotment: 0, herb: 0, tree: 0 },
    sel: { allotment: null, herb: null, tree: null },
    harvested: 0,
    grown: 0,
    died: 0,
  };
}

export default { id: SKILL, init, nextEvent, tick };
