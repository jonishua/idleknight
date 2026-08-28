#!/usr/bin/env node
/* =========================================================================
   check-passive.mjs — the passive wing, proved rather than asserted.

   The engine selftest covers the foreground loop: one action, one recipe,
   one timer. The two PASSIVE skills are a different shape — eighteen plot
   timers and a five-minute town clock running with no action selected — and
   the properties that matter for them are properties the selftest does not
   currently reach:

     1. CONTENT. 24 crops (500,000 x 24 = the 12,000,000 Farming pool cap the
        parity capture recorded off a live save), 24 items, six worships, the
        five bulk prices §3c states, and no forbidden proper noun anywhere in
        the passive wing's strings.

     2. DETERMINISM. A farm and a town advanced by the event jump, one tick
        at a time, in twelve uneven chunks, and through a serialise/reload
        must all land on the same state hash. This is the same proof the
        selftest makes for the foreground, made for the background.

     3. OFFLINE IS REPLAYED, NOT EXTRAPOLATED. A 24-hour offlineReplay() must
        resolve EXACTLY what 24 separate one-hour advances resolve — same
        harvests, same grow rolls, same town ticks — and it must do it fast
        enough to run on a phone.

     4. THE ECONOMY RUNS. Measured, not modelled: XP per second and Cogs per
        second off a real farm and a real town, and hours to level 99 at those
        rates.

     5. THE FARM FEEDS ITS CONSUMERS. The one property a passive supply skill
        can fail while every other check is green: growing far less than the
        skills downstream of it drink. At five level tiers, the hungriest
        unlocked Alchemy and Cooking line is run for an hour to measure what
        it really eats, the farm is planted with exactly those inputs and run
        for eight, and the binding ratio is asserted >= 1.0 at the composted
        100% grow chance AND at the bare 50%. The table prints either way.

   Usage:  node tools/check-passive.mjs [--verbose]
   ========================================================================= */

import { readFileSync } from "node:fs";
import { Game, DB, xpAt, scanForbidden, parseReference } from "../src/js/engine/index.js";
import * as farm from "../src/js/engine/systems/farming.js";
import * as town from "../src/js/engine/systems/settlement.js";
import { CROPS, CATEGORIES, COMPOST_TIERS, BULK_ACTIONS, growChance } from "../src/data/crops.js";
import {
  BUILDINGS, WORSHIPS, RESOURCES, TOWN_TICK_SECONDS, WORSHIP_CHANGE_COST, xpForTick,
} from "../src/data/settlement.js";

const VERBOSE = process.argv.includes("--verbose");
const results = [];
const ok = (name, pass, expected, actual, note = "") =>
  results.push({ name, pass: !!pass, expected: String(expected), actual: String(actual), note });
const eq = (name, actual, expected, note) => ok(name, actual === expected, expected, actual, note);
const between = (name, v, lo, hi, note) =>
  ok(name, v >= lo && v <= hi, `${fmt(lo)} .. ${fmt(hi)}`, fmt(v), note);
const fmt = (v) =>
  typeof v === "number"
    ? Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(v < 1 ? 4 : 2)
    : String(v);

/* =========================================================================
   1. CONTENT
   ========================================================================= */

const F = DB.skill("farming");
const S = DB.skill("settlement");

eq("Farming ships 24 crops", F.recipes.length, 24,
  CATEGORIES.map((c) => `${c.name} ${CROPS.filter((x) => x.category === c.id).length}`).join(", "));
eq("...which is exactly the 12,000,000 pool cap the capture recorded",
  500_000 * DB.recipeCounts.farming, 12_000_000, "cap = 500,000 x recipeCount");
eq("every crop yields a registered item", CROPS.filter((c) => !DB.items.has(c.itemId)).length, 0,
  `${CROPS.length} crops`);
eq("crops are listed in level order",
  F.recipes.every((r, i) => i === 0 || r.level >= F.recipes[i - 1].level), true);
eq("three categories, and each one has eight rungs",
  CATEGORIES.map((c) => CROPS.filter((x) => x.category === c.id).length).join("/"), "8/8/8",
  "allotments / herbs / trees");

/* THE FAILURE THE WHOLE TABLE WAS REBUILT AROUND. A flat yield per category
   plus a rising grow time makes output per plot-hour FALL the length of the
   ladder — the level-99 farm grew a third of what the level-10 farm did. The
   quantity is now derived from a rising per-plot-hour rate, and this is the
   line that stops it silently reverting. */
{
  const falling = [];
  for (const cat of CATEGORIES) {
    const rungs = CROPS.filter((c) => c.category === cat.id);
    for (let i = 1; i < rungs.length; i++) {
      if (rungs[i].perPlotHour <= rungs[i - 1].perPlotHour) falling.push(rungs[i].name);
    }
  }
  eq("output per plot-hour RISES up every ladder", falling.join(", ") || "none", "none",
    CATEGORIES.map((c) => {
      const r = CROPS.filter((x) => x.category === c.id);
      return `${c.name} ${Math.round(r[0].perPlotHour)} -> ${Math.round(r[r.length - 1].perPlotHour)}/plot-hr`;
    }).join(", "));
}

/* THE UNLOCK CONTRACT. A crop the player cannot grow yet, needed by a recipe
   they can already cook, is a hole in the supply chain the ratio gate below
   would happily step over — it plants what it can and measures that. Walk
   every skill in the database instead and demand the crop be in the ground
   first. */
{
  const late = [];
  const first = new Map();
  for (const sk of DB.skills) {
    for (const r of sk.recipes || []) {
      for (const [id] of r.consumes || []) {
        if (!CROPS.some((c) => c.itemId === id)) continue;
        if (!first.has(id) || r.level < first.get(id).level) first.set(id, { level: r.level, skill: sk.name, recipe: r.name });
      }
    }
  }
  for (const c of CROPS) {
    const f = first.get(c.itemId);
    if (f && f.level < c.level) late.push(`${c.name} ${c.level} > ${f.skill} ${f.level}`);
  }
  eq("every crop is growable before the first recipe that eats it", late.join(", ") || "none", "none",
    `${first.size} of ${CROPS.length} crops are consumed by something; the rest are timber`);
}

/* Piece-to-piece contract: Alchemy consumes these ids and defines none. */
const herbIds = CROPS.filter((c) => c.category === "herb").map((c) => c.itemId);
eq("the eight herb ids exist and are Farming's alone",
  herbIds.filter((id) => DB.items.get(id)?.kind === "herb").length, 8, herbIds.join(", "));

eq("Settlement carries no mastery track", !!S.mastery, false,
  "twelve buildings and a clock are not twenty-four recipes");
eq("six worship options, as the capture records", WORSHIPS.length, 6,
  WORSHIPS.map((w) => w.name).join(", "));
eq("five of the six carry a signed bonus AND a drawback",
  WORSHIPS.filter((w) => w.bonus && w.drawback).length, 5, "the sixth is None");
eq("changing worship costs 50,000,000 Cogs", WORSHIP_CHANGE_COST, 50_000_000);
eq("one town tick every five minutes", TOWN_TICK_SECONDS, 300, `${town.TOWN_TICK_TICKS} engine ticks`);
eq("twelve buildings, level-gated across the whole climb",
  `${BUILDINGS.length}/${BUILDINGS[0].level}/${BUILDINGS[BUILDINGS.length - 1].level}`, "12/1/78");
eq("every resource is consumed by something",
  RESOURCES.filter((r) => !BUILDINGS.some((b) => (b.consumes || {})[r.id]) && r.id !== "stone" && r.id !== "bars").length,
  0, "stone and bars are build materials rather than tick inputs");

/* §3c prices the bulk actions to the GP. These five are the reference's. */
const wantBulk = { "harvest-all": 2000, "compost-all": 2000, "emberloam-all": 2000, "plant-all": 5000, "plant-selected": 5000 };
eq("the five bulk-action prices are the reference's own",
  BULK_ACTIONS.filter((a) => wantBulk[a.id] !== a.cost).length, 0,
  BULK_ACTIONS.map((a) => `${a.label} ${a.cost.toLocaleString("en-US")}`).join(" · "));
eq("compost raises grow chance from 50% to exactly 100%",
  `${growChance(0)}/${growChance(5)}`, "0.5/1", "+10% per application, five applications");
eq("two compost tiers, the second gated on a purchase",
  `${COMPOST_TIERS.length}/${COMPOST_TIERS[1].unlock}`, "2/farm-emberloam-vat");

/* Forbidden strings, over everything the passive wing ships. */
const ref = parseReference(readFileSync(new URL("../reference/melvor-math.md", import.meta.url), "utf8"));
const passiveStrings = [
  ...CROPS.flatMap((c) => [c.name, c.itemName]),
  ...CATEGORIES.flatMap((c) => [c.name, c.blurb]),
  ...WORSHIPS.flatMap((w) => [w.name, w.text, w.bonus?.text || "", w.drawback?.text || ""]),
  ...BUILDINGS.flatMap((b) => [b.name, b.blurb]),
  ...RESOURCES.flatMap((r) => [r.name, r.note]),
  ...COMPOST_TIERS.flatMap((c) => [c.name, c.text]),
  ...BULK_ACTIONS.map((a) => a.label),
  F.name, F.blurb, S.name, S.blurb,
  ...F.checkpoints.flatMap((c) => [c.name, c.text]),
  ...F.masteryUnlocks.map((u) => u.text),
].join(" • ");
const hits = scanForbidden(passiveStrings, [...ref.forbidden, "township", "wintertodt", "weird gloop"]);
eq("no forbidden proper noun in any passive-wing string", hits.join(", ") || "none", "none",
  `${ref.forbidden.length} parsed + Township, Wintertodt, Weird Gloop`);
eq("...and the scanner can fail", scanForbidden("a Township of Mithril", [...ref.forbidden, "township"]).length, 2,
  "negative control");

/* =========================================================================
   2. A REAL FARM AND A REAL TOWN
   ========================================================================= */

/**
 * A player at Farming/Settlement 60 with every plot bought, every bed
 * planted with its best rung, a founded town and a handful of buildings.
 * Deterministic: no wall clock anywhere in the setup.
 */
function populated(seed = 0xfa2, steward = false) {
  const g = new Game(DB, { seed });
  g.state.cogs = 5_000_000_000;
  g.state.skills.farming.xp = xpAt(60);
  g.state.skills.settlement.xp = xpAt(60);
  if (steward) g.grant("farm-grange-steward");

  for (const cat of CATEGORIES) {
    while (farm.nextPlot(g, cat.id) && farm.nextPlot(g, cat.id).level <= 60) {
      if (farm.buyPlot(g, cat.id)) break;
    }
  }
  farm.ensurePlots(g);
  const plots = g.state.farming.plots;
  for (let i = 0; i < plots.length; i++) {
    const list = farm.availableCrops(g, plots[i].cat);
    farm.plant(g, i, list[list.length - 1].id);
    if (i % 3 === 0) farm.compost(g, i, "compost");
  }

  town.found(g, "deep");
  g.state.settlement.res.food = 100_000;
  g.state.settlement.res.timber = 100_000;
  g.state.settlement.res.stone = 100_000;
  g.state.settlement.res.planks = 100_000;
  for (let i = 0; i < 20; i++) town.build(g, "cottages");
  for (let i = 0; i < 14; i++) town.build(g, "farmland");
  for (let i = 0; i < 8; i++) town.build(g, "logging-camp");
  for (let i = 0; i < 4; i++) town.build(g, "granary");
  for (let i = 0; i < 6; i++) town.build(g, "quarry");
  g.state.settlement.pop = 400;
  g._syncRng();
  return g;
}

eq("a level-60 farm owns every plot that level allows",
  populated().state.farming.plots.length,
  CATEGORIES.reduce((n, c) => n + c.plots.filter((p) => p.level <= 60).length, 0),
  CATEGORIES.map((c) => `${c.name} ${c.plots.filter((p) => p.level <= 60).length}`).join(", "));

/* --- determinism: four ways to reach the same tick ---------------------- */
const SWEEP = 400_000;                       // 5.5 hours of game time
const CUTS = [7311, 1, 12_000, 40, 9997, 3, 15_555, 2048, 6666, 4321, 1057, 1002];

const fast = populated();
fast.advance(SWEEP);
const want = fast.hash();

const naive = populated();
naive.advance(SWEEP, { naive: true });
eq("event jump == tick-by-tick over 400,000 ticks", naive.hash(), want,
  "the passive wing reports its timers honestly to the event jump");

const chunked = populated();
{ let left = SWEEP, i = 0; while (left > 0) { const k = Math.min(left, CUTS[i++ % CUTS.length]); chunked.advance(k); left -= k; } }
eq("twelve uneven chunks == one continuous run", chunked.hash(), want,
  "a throttled mobile tab must resume identically to a cold start");

const half = populated();
half.advance(151_777);
const reloaded = Game.load(DB, JSON.parse(JSON.stringify(half.serialize(0))));
reloaded.advance(SWEEP - 151_777);
eq("serialise to JSON mid-growth and resume == uninterrupted", reloaded.hash(), want,
  "plot timers and town stocks survive a save/load round trip");

ok("...and something actually happened in those hours",
  fast.state.settlement.townTicks > 60 && fast.state.farming.harvested + fast.state.farming.died > 0,
  "> 60 town ticks and at least one crop resolved",
  `${fast.state.settlement.townTicks} town ticks, ${fast.state.farming.harvested} harvested, ${fast.state.farming.died} lost`);

/* --- offline: a full day, replayed rather than extrapolated -------------- */
const DAY = 24 * 3600 * 1000;

const away = populated(0xfa2, true);
const t0 = performance.now();
const sum = away.offlineReplay(away.state.lastSaveAt + DAY);
const replayMs = performance.now() - t0;

const stepped = populated(0xfa2, true);
for (let i = 0; i < 24; i++) stepped.advanceSeconds(3600);
stepped.state.lastSaveAt = away.state.lastSaveAt;
eq("a 24 h offline replay == 24 separate one-hour advances", stepped.hash(), away.hash(),
  `${sum.ticks.toLocaleString("en-US")} ticks`);

ok("...and a full day of the passive wing replays in well under 250 ms",
  replayMs < 250, "< 250 ms", `${replayMs.toFixed(1)} ms`,
  "1,728,000 ticks, on a phone, before the first frame");

ok("the replay resolved real plot harvests, not a frozen farm",
  away.state.farming.harvested > 200, "> 200 items", `${away.state.farming.harvested} harvested, ${away.state.farming.died} lost`,
  "the Grange Steward is what makes an unattended farm pay");
eq("...and the Welcome Back summary names them",
  sum.items.some((i) => DB.item(i.id).kind === "crop" || DB.item(i.id).kind === "herb" || DB.item(i.id).kind === "timber"),
  true, sum.items.slice(0, 4).map((i) => `${i.name} +${i.delta}`).join(", "));
eq("288 town ticks in a day", away.state.settlement.townTicks - populated(0xfa2, true).state.settlement.townTicks, 288);

/* Without the steward, plots ripen and WAIT — that is the reference's own
   model, and it must be exactly as reproducible as the automated one. */
const manual = populated(0xfa2, false);
manual.offlineReplay(manual.state.lastSaveAt + DAY);
const manualStep = populated(0xfa2, false);
for (let i = 0; i < 24; i++) manualStep.advanceSeconds(3600);
manualStep.state.lastSaveAt = manual.state.lastSaveAt;
eq("an unattended farm replays identically too", manualStep.hash(), manual.hash(),
  `${manual.state.farming.plots.filter((p) => p.st === "ready").length} plots ripe and waiting`);

/* --- the farm keeps growing UNDER another skill -------------------------- */
const busy = populated(0xfa2, true);
busy.state.skills.delving.xp = xpAt(50);
busy.state.items["cinder-shale"] = 0;
busy.start("delving", "vein-cinder-shale");
const oreBefore = busy.count("cinder-shale");
busy.advanceSeconds(3 * 3600);
ok("plots grow while another skill holds the foreground",
  busy.state.farming.harvested > 0 && busy.count("cinder-shale") > oreBefore,
  "both the farm and the mine advanced",
  `${busy.state.farming.harvested} crops harvested and ${busy.count("cinder-shale")} ore mined in 3 h`);

/* =========================================================================
   3. THE ECONOMY, MEASURED

   Everything below runs through the real tick engine. Nothing here is a
   model of the farm; it is the farm, advanced by the same loop the player's
   tab advances, and read afterwards.
   ========================================================================= */

/**
 * Build a farm at `level` with every plot the level allows, plant it, and
 * advance it for `hours`.
 *
 * `planting` decides what goes in the ground: by default the best rung each
 * bed can take, or a { plotIndex -> cropId } map when the supply test needs a
 * specific crop in a specific bed. `compost` off is the bare 50% grow chance;
 * on is the composted steady state the Grange Steward maintains. The gap
 * between the two is what compost buys.
 */
function runFarm(level, { compost = true, hours = 8, planting = null, seed = 0xbee } = {}) {
  const g = new Game(DB, { seed });
  g.state.cogs = 1e12;
  g.state.skills.farming.xp = xpAt(level);
  g.grant("farm-grange-steward");
  g.grant("farm-emberloam-vat");
  for (const cat of CATEGORIES) {
    while (farm.nextPlot(g, cat.id) && farm.nextPlot(g, cat.id).level <= level) {
      if (farm.buyPlot(g, cat.id)) break;
    }
  }
  farm.ensurePlots(g);
  const plots = g.state.farming.plots;
  for (let i = 0; i < plots.length; i++) {
    const list = farm.availableCrops(g, plots[i].cat);
    if (!list.length) continue;
    const want = planting ? planting[i] : null;
    farm.plant(g, i, want || list[list.length - 1].id);
    if (compost) farm.compost(g, i, "emberloam");
  }

  const xp0 = g.state.skills.farming.xp;
  const cogs0 = g.state.cogs;
  g.advanceSeconds(hours * 3600);

  let value = 0;
  const perHour = new Map();
  const kind = { crop: 0, herb: 0, timber: 0 };
  for (const [id, n] of g.produced) {
    const it = DB.item(id);
    value += it.value * n;
    perHour.set(id, n / hours);
    if (kind[it.kind] !== undefined) kind[it.kind] += n / hours;
  }
  return {
    game: g,
    perHour,
    kind,
    xpPerSecond: (g.state.skills.farming.xp - xp0) / (hours * 3600),
    cogsPerHour: (value + (g.state.cogs - cogs0)) / hours,
    plots: plots.length,
    grown: g.state.farming.grown,
    lost: g.state.farming.died,
    harvested: g.state.farming.harvested,
  };
}

const farmRate = (level, opts) => runFarm(level, opts);

const early = farmRate(10);
const late = farmRate(99);
const bare = farmRate(99, { compost: false });

between("Farming at cap pays 12-25 XP/s across every bed", late.xpPerSecond, 12, 25,
  `${late.plots} plots, ${late.harvested} harvested, ${late.lost} lost`);
between("...which caps the skill in the 150-300 h band every skill is held to",
  xpAt(99) / late.xpPerSecond / 3600, 150, 300, "the reference's own 200-400 h arc, at the top rung");

/* The climb is two multiplied sources — more beds AND better rungs — which is
   why a passive skill's spread is wider than a gathering skill's 3-6x. */
const plotSpread = late.plots / early.plots;
ok("the climb is a real climb, and it comes from beds x rungs",
  late.xpPerSecond / early.xpPerSecond >= 10,
  ">= 10x", `${(late.xpPerSecond / early.xpPerSecond).toFixed(0)}x`,
  `level 10: ${early.plots} plots at ${early.xpPerSecond.toFixed(2)} XP/s -> level 99: ${late.plots} plots at ${late.xpPerSecond.toFixed(1)} XP/s (${plotSpread.toFixed(1)}x the beds)`);

/* WHAT A CAPPED FARM IS WORTH. §5 of the maths reference prices a capped
   base-game gathering skill at 310k-3M GP/hr and mid-game combat at ~18M, and
   is explicit that "combat out-earns every gathering skill by 10-100x". A farm
   that has bought eighteen beds and pays a seed bill of 35% of every harvest
   belongs at the bottom of the gathering band and nowhere near combat. */
between("a capped farm earns like a capped gathering skill, not like combat",
  late.cogsPerHour, 250_000, 2_000_000,
  `${Math.round(late.cogsPerHour).toLocaleString("en-US")} Cogs/hr net of seed and compost, against ~18M/hr for base-game combat`);

/* THE SKILL'S ONE REAL DECISION. Half of everything planted dies at the base
   50%, and the flat compost bill is what buys that back. Both halves are
   measured off the grow roll itself — `grown` and `died` are the two arms of
   it — because "compost is worth it" is a claim about the gap. */
const lossRate = bare.lost / (bare.lost + bare.grown);
between("about half an uncomposted crop is lost", lossRate, 0.35, 0.65,
  `${bare.lost} lost of ${bare.lost + bare.grown} grow rolls at the bare 50% chance`);
ok("...and composting to 100% roughly doubles the skill",
  late.xpPerSecond / bare.xpPerSecond >= 1.7,
  ">= 1.7x", `${(late.xpPerSecond / bare.xpPerSecond).toFixed(2)}x`,
  `${bare.xpPerSecond.toFixed(1)} XP/s bare -> ${late.xpPerSecond.toFixed(1)} XP/s composted, for a flat bill that ignores the yield`);

/* =========================================================================
   3b. THE RATIO GATE — DOES THE FARM ACTUALLY FEED ITS TWO CONSUMERS?

   This is the question the whole crop table is tuned against, and it is the
   one a content file cannot answer about itself. Farming exists to supply
   Alchemy with herbs and Cooking with crops. If a bench at level 50 drinks
   6,200 sprigs an hour and the herb row grows 48, the skill is decoration.

   Both sides are LIVE-MEASURED through the tick engine at the same level:

     DEMAND  every unlocked recipe of the consumer skill is run for an hour
             on an unmastered account with a full bank, and the hungriest one
             — the one that eats the most of the kind per hour — is the bar.
             Unmastered on purpose: mastery's preserve rolls only ever REDUCE
             what a bench drinks, so a farm that feeds a level-1-mastery
             bench feeds every bench.

             Cooking's two passive stations are deliberately not in the
             number. They stop at the twenty-dish stockpile cap inside twenty
             minutes, so the draw the farm must sustain is the active cook.

     SUPPLY  the same farm, at the same level, with its beds allocated across
             exactly the inputs that recipe needs — greedy water-filling, one
             bed at a time to whichever input is furthest behind, which is
             what a player does by hand. Run for eight hours and read the
             units that actually came out of the ground.

   The gate is the BINDING input: the ratio is the worst of the recipe's
   inputs, not the average, because a stew short of one crop is a stew that
   does not cook. And it is asserted at the BARE 50% grow chance as well as
   composted, so the farm feeds the workshop even when the player never buys
   a bag of compost. Anything under 1.0 fails the script.
   ========================================================================= */

const TIERS = [10, 30, 50, 70, 99];

/** Every item of `kind` a recipe eats, with the per-hour rate, measured. */
function drain(skillId, recipe, level, kind) {
  const g = new Game(DB, { seed: 0x51ee });
  g.state.cogs = 1e12;
  for (const s of DB.skills) if (g.state.skills[s.id]) g.state.skills[s.id].xp = xpAt(level);
  for (const it of DB.items.values()) g.state.items[it.id] = 1e9;
  g.state.shards = 1e9;
  g._usedSlots = Object.keys(g.state.items).length;
  g._invalidate();
  const before = new Map();
  for (const it of DB.items.values()) if (it.kind === kind) before.set(it.id, g.count(it.id));
  g.start(skillId, recipe.id);
  g.advanceSeconds(3600);
  const per = new Map();
  let total = 0;
  for (const [id, had] of before) {
    const used = had - g.count(id);
    if (used > 0) { per.set(id, used); total += used; }
  }
  return { total, per, recipe };
}

/** The hungriest unlocked recipe of `skillId` for inputs of `kind`. */
function hungriest(skillId, kind, level) {
  let worst = null;
  for (const r of DB.skill(skillId).recipes) {
    if (r.level > level) continue;
    if (!(r.consumes || []).some(([id]) => DB.items.get(id)?.kind === kind)) continue;
    const d = drain(skillId, r, level, kind);
    if (!worst || d.total > worst.total) worst = d;
  }
  return worst;
}

/**
 * Hand each bed of the relevant category to whichever wanted input is
 * furthest behind its share. One bed at a time, cheapest possible allocator,
 * and exactly the reasoning a player uses standing in front of the grid.
 */
function allocate(game, wants) {
  const plots = game.state.farming.plots;
  const state = wants.map((w) => ({ ...w, rate: 0 }));
  const planting = {};
  for (let i = 0; i < plots.length; i++) {
    const here = state.filter((w) => w.crop.category === plots[i].cat);
    if (!here.length) continue;
    here.sort((a, b) => a.rate / a.need - b.rate / b.need);
    here[0].rate += here[0].crop.perPlotHour;
    planting[i] = here[0].crop.id;
  }
  return planting;
}

/** One row of the ratio table: demand, supply composted and bare, and both ratios. */
function feeds(level, skillId, kind) {
  const want = hungriest(skillId, kind, level);
  if (!want) return null;

  /* Only inputs the farm is actually the supplier of. An ember or a fish is
     someone else's supply problem. */
  const wants = [];
  for (const [id, rate] of want.per) {
    const crop = CROPS.find((c) => c.itemId === id);
    if (crop) wants.push({ id, need: rate, crop });
  }
  if (!wants.length) return null;

  /* A probe farm, only to learn the bed layout this level owns. */
  const probe = runFarm(level, { hours: 0 });
  const planting = allocate(probe.game, wants);

  const rows = [];
  for (const compost of [true, false]) {
    const run = runFarm(level, { compost, planting });
    let ratio = Infinity, supply = 0;
    for (const w of wants) {
      const got = run.perHour.get(w.id) || 0;
      supply += got;
      ratio = Math.min(ratio, got / w.need);
    }
    rows.push({ compost, supply, ratio, run });
  }
  return {
    level,
    recipe: want.recipe,
    demand: want.total,
    inputs: wants,
    composted: rows[0],
    barefaced: rows[1],
  };
}

const supplyTable = [];
for (const t of TIERS) {
  supplyTable.push({
    tier: t,
    herbs: feeds(t, "alchemy", "herb"),
    crops: feeds(t, "hearthcraft", "crop"),
  });
}

for (const row of supplyTable) {
  for (const [kind, r] of [["herbs", row.herbs], ["crops", row.crops]]) {
    if (!r) continue;
    const label = kind === "herbs" ? "Alchemy" : "Cooking";
    ok(`level ${String(row.tier).padStart(2)}: the farm outgrows ${label}'s hungriest line, composted`,
      r.composted.ratio >= 1, ">= 1.00x", `${r.composted.ratio.toFixed(2)}x`,
      `${r.recipe.name} eats ${Math.round(r.demand).toLocaleString("en-US")} ${kind}/hr; ` +
      `${r.composted.run.plots} plots grow ${Math.round(r.composted.supply).toLocaleString("en-US")}/hr`);
    ok(`level ${String(row.tier).padStart(2)}: ...and outgrows it uncomposted too, at the bare 50%`,
      r.barefaced.ratio >= 1, ">= 1.00x", `${r.barefaced.ratio.toFixed(2)}x`,
      `${Math.round(r.barefaced.supply).toLocaleString("en-US")}/hr with not one bag of compost bought`);
  }
}

/* --- the town ----------------------------------------------------------- */
const townRun = populated(0xdec, false);
const beforeXp = townRun.state.skills.settlement.xp;
const beforeCogs = townRun.state.cogs;
townRun.advanceSeconds(12 * 3600);
const townXpS = (townRun.state.skills.settlement.xp - beforeXp) / (12 * 3600);
ok("a 400-strong town earns Settlement XP every tick",
  townXpS > 0.5, "> 0.5 XP/s", `${townXpS.toFixed(2)} XP/s at population ${Math.round(townRun.state.settlement.pop)}`);

const capped = xpForTick(5000, 20, 0) / TOWN_TICK_SECONDS;
between("a fully built town caps Settlement in 150-350 h",
  xpAt(99) / capped / 3600, 150, 350, `${capped.toFixed(1)} XP/s at 5,000 population`);

ok("the town genuinely eats: population falls when the food runs out",
  (() => {
    const g = populated(0xfa9, false);
    g.state.settlement.res.food = 0;
    for (const id of Object.keys(g.state.settlement.built)) if (id === "farmland") delete g.state.settlement.built[id];
    const p0 = g.state.settlement.pop;
    g.advanceSeconds(4 * 3600);
    return g.state.settlement.pop < p0 * 0.6;
  })(), "population collapses", "yes",
  "cottages -> workers -> farmland -> food -> cottages: the loop closes");

ok("...and a fed town grows back toward its housing",
  (() => {
    const g = populated(0xfab, false);
    g.state.settlement.pop = 10;
    g.advanceSeconds(8 * 3600);
    return g.state.settlement.pop > 200;
  })(), "population recovers", "yes");

ok("storage is a real cap and overflow is destroyed",
  (() => {
    const g = populated(0xfac, false);
    g.advanceSeconds(24 * 3600);
    const cap = town.townStats(g).storage;
    return Object.values(g.state.settlement.res).every((v) => v <= cap + 1e-6) && g.state.settlement.wasted > 0;
  })(), "every stock <= cap, and something was wasted", "yes",
  "the same shape as the mastery pool, and for the same reason");

/* =========================================================================
   REPORT
   ========================================================================= */

/* The supply table is the headline of this tool, so it prints whether or not
   anything failed. Both sides of every row came out of the tick engine. */
{
  const L = (s, n) => String(s).padEnd(n);
  const R = (s, n) => String(s).padStart(n);
  const n0 = (v) => Math.round(v).toLocaleString("en-US");
  const B = "\x1b[1m", D = "\x1b[2m", G = "\x1b[32m", Y = "\x1b[33m", X = "\x1b[0m";
  console.log(`\n${B}FARMING SUPPLY vs MEASURED DEMAND${X}  ` +
    `${D}both sides run through the tick engine — the consumer for an hour, the farm for eight${X}`);
  console.log(`  ${L("", 6)}${L("hungriest consumer line", 34)}${R("eats/hr", 9)}` +
    `${R("farm/hr", 10)}${R("ratio", 8)}${R("farm/hr", 10)}${R("ratio", 8)}   binding input`);
  console.log(`  ${L("tier", 6)}${L("", 34)}${R("", 9)}${R("@100%", 10)}${R("", 8)}${R("@50%", 10)}${R("", 8)}`);
  for (const row of supplyTable) {
    for (const [kind, r] of [["herb", row.herbs], ["crop", row.crops]]) {
      if (!r) continue;
      const worst = r.inputs.reduce((a, b) =>
        (r.composted.run.perHour.get(b.id) || 0) / b.need < (r.composted.run.perHour.get(a.id) || 0) / a.need ? b : a);
      const tint = (v) => (v >= 1.5 ? G : Y) + R(`${v.toFixed(2)}x`, 8) + X;
      console.log(
        `  ${L(row.tier, 6)}${L(`${kind === "herb" ? "Alchemy" : "Cooking"}  ${r.recipe.name}`, 34)}` +
        `${R(n0(r.demand), 9)}${R(n0(r.composted.supply), 10)}${tint(r.composted.ratio)}` +
        `${R(n0(r.barefaced.supply), 10)}${tint(r.barefaced.ratio)}   ${D}${worst.crop.name}${X}`);
    }
  }
  const floor = Math.min(...supplyTable.flatMap((r) =>
    [r.herbs, r.crops].filter(Boolean).map((x) => x.barefaced.ratio)));
  console.log(`  ${D}worst ratio anywhere on the ladder: ${floor.toFixed(2)}x, uncomposted. ` +
    `Anything under 1.00x fails this script.${X}\n`);
}

const failed = results.filter((r) => !r.pass);
const pad = (s, n) => String(s).padEnd(n);
if (VERBOSE || failed.length) {
  for (const r of results) {
    if (!VERBOSE && r.pass) continue;
    console.log(`${r.pass ? "  ok" : "FAIL"}  ${pad(r.name, 62)} ${pad(r.actual, 18)} ${r.pass ? "" : `want ${r.expected}`}`);
    if (VERBOSE && r.note) console.log(`      ${r.note}`);
  }
  console.log("");
}
console.log(`${results.length - failed.length}/${results.length} passive-wing checks`);
process.exit(failed.length ? 1 : 0);
