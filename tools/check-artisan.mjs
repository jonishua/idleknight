#!/usr/bin/env node
/* =========================================================================
   EMBERVEIL — ARTISAN WING CHECKER

       node tools/check-artisan.mjs            everything
       node tools/check-artisan.mjs bowcraft   one skill
       node tools/check-artisan.mjs --wide     add the derivation columns

   The five skills of the artisan wing add about eighty recipes to a content
   database, and there are exactly THREE ways to get them wrong. This file
   measures all three, through the real tick engine, and fails the build on
   any of them.

   ---------------------------------------------------------------------------
   1. TRAPS — is any recipe worse than the sell button?  (R5)
   ---------------------------------------------------------------------------
       EVERY processing recipe must beat selling its own inputs, in Cogs per
       second of TOTAL play including the time to gather those inputs.

   A recipe that fails it is a TRAP: the arithmetic tells the player to skip a
   rung of the game, and they will be right. The engine selftest enforces R5
   across the whole database in one line and reports a single worst ratio,
   which is the correct thing for a regression gate and useless for tuning —
   it tells you something is wrong, not which markup to move. This tool prints
   the whole derivation per recipe (`--wide`):

       markup      value(out) / value(in)
       own         seconds of THIS recipe per unit produced
       input       seconds of play, all the way down the tree, per unit
       needed      1 + own/input   — the markup R5 actually demands here
       R5          markup / needed — must be > 1

   Reading it: `needed` is what makes the markups in the data uneven. A first
   stage whose inputs arrive in under a second needs nearly 2x; a recipe ten
   links down a chain needs 1.05x. Nothing about that is a taste call.

   ---------------------------------------------------------------------------
   2. SHAPE — does the markup DECAY down each chain?  (R4)
   ---------------------------------------------------------------------------
   Markups COMPOUND. A flat 2.6x across Crafting's seventeen rungs is 3.5
   MILLION times, and that is not a hypothetical: it is what this wing shipped
   the first time. Smithing's billet ladder runs 2.00x on rung one to 1.12x on
   rung ten, and every value chain in the wing now copies that shape. The
   SHAPE table below asserts it, per skill, against the AUTHORED markup
   (`value(produces) / sum(q * value(consumes))`) rather than the measured one,
   because the authored number is the one a person edits.

   Not every skill is a chain, and the table says which is which:

       chain      each rung feeds the next. Markup must be non-increasing by
                  level. Bowcraft, Crafting, Cooking's composite line.
       plot       the input's real cost is a PLOT-HOUR and its Cog price is a
                  rounding error — a potion off a 6-Cog herb, a pie off five
                  pumpkins. R5's own `needed` for every one of them is 1.00x,
                  which is the tell. Endpoints and a ceiling only.
       sideways   the output is an item some other ladder already priced, so
                  there is no compounding to control. Transmutation. Bounded by
                  a ceiling instead, so no spell can dominate the Smithing
                  recipe it substitutes for.

   ---------------------------------------------------------------------------
   3. THE CEILING — does any of it out-earn the game?
   ---------------------------------------------------------------------------
   §5 of the math reference: "combat out-earns every gathering skill by
   10-100x. Melvor uses skills for XP and progression, and combat for wealth."
   The engine selftest checks that ratio against ONE NAMED loop, which is a
   regression gate and not a bound: name a loop and a richer one can appear
   beside it without anything going red. That is exactly what happened —
   Crafting's top two rungs reached 1.92B and 3.33B Cogs/hr while the named
   loop sat at 142M and the assertion stayed green.

   So the CEILING block below measures every rung of EVERY skill in the game,
   takes the MAXIMUM, and checks the ratio against that. It also lists any rung
   over CEILING Cogs/hr by name. That is the check that cannot drift.

   ---------------------------------------------------------------------------
   4. AND THE PASSIVE COOK REPLAYS EXACTLY
   ---------------------------------------------------------------------------
   The engine selftest asserts that the fast event-jump path and the
   tick-by-tick path land on identical state hashes, which is the only honest
   way to claim a 24 h offline replay is exact. It cannot cover the passive
   cook: `state.artisan` is created lazily, so no save the suite builds has a
   station running, and a `nextEvent` that forgot to report a timer would be
   jumped clean over with nothing to notice. So this file builds that save
   itself — two stations cooking, two potions live — and runs both paths over
   an hour.
   ========================================================================= */

/* Through the engine's PUBLIC surface, never straight at ../src/js/engine/
   game.js. ./index.js is what imports the tick-system registry, and a Game
   built without it has no systems registered at all — a harness that reached
   past it would measure a passive cook that never ticks and report a
   comfortable, meaningless "identical". */
import { Game, economyRates, secondsPerUnit, sustained } from "../src/js/engine/index.js";
import DB from "../src/data/index.js";
import { selectStation, drinkPotion } from "../src/js/engine/systems/cooking-stations.js";

const WING = ["bowcraft", "crafting", "alchemy", "transmutation", "hearthcraft"];

/** Cogs/hr above which a non-combat rung is out-earning the game. Sized off
 *  §5's own faucet table: "late non-combat around 20-100M/hr", plus headroom
 *  for the one loop the selftest names (Enchanting, 142M). */
const CEILING = 150e6;
/** §5: combat out-earns the best non-combat loop by this much. */
const COMBAT_RATIO = [10, 100];
/** The fight the balance report quotes as the endgame faucet. */
const ENDGAME_FIGHT = "the-ninefold-warden";

/** A dish (or a potion) made of nothing but farm produce and free fuel. Its
 *  real cost is a PLOT-HOUR, not a Cog, so its Cog markup measures nothing —
 *  which is exactly why R5's `needed` for every one of them comes out 1.00x. */
const farmOnly = (r) => (r.consumes || []).length > 0 &&
  r.consumes.every(([id]) => ["crop", "herb"].includes(DB.item(id).kind) || DB.item(id).value === 0);

/* How each skill's markup ladders are allowed to behave. See the header. A
 * skill may have MORE THAN ONE ladder: Cooking has three (the flat grills,
 * the catch chain, the farm shelf) and only two of them are R4's business. */
const SHAPE_KIND = {
  bowcraft:      [{ kind: "chain", note: "two interleaved lines, both monotone on their own" }],
  crafting:      [{ kind: "chain", note: "leather, stonework and jewellery, one ladder" }],
  hearthcraft: [
    { label: "Cooking · catch chain", kind: "chain", note: "composites off the catch ladder; the single-input grills are held flat at 2.4x by R3",
      only: (r) => r.consumes.length > 1 && !farmOnly(r) },
    { label: "Cooking · farm shelf", kind: "plot", note: "crops and a free ember: priced against a plot-hour, so only the endpoints and a ceiling are checked", max: 6,
      only: farmOnly },
  ],
  alchemy:       [{ kind: "plot", note: "a 620-Cog potion off a 4-Cog herb: the margin is the dose, not the reagent" }],
  transmutation: [{ kind: "sideways", note: "every output is an item the core ladder already priced", max: 2.6 }],
};

const args = process.argv.slice(2);
const wide = args.includes("--wide");
const only = args.filter((a) => !a.startsWith("-"));
const skills = (only.length ? only : WING).filter((id) => DB.skill(id));

if (!skills.length) {
  console.error(`no such skill. known: ${WING.join(", ")}`);
  process.exit(2);
}

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const money = (n) =>
  !Number.isFinite(n) ? "-" :
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` :
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` :
  n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

/** The AUTHORED markup — what a person reading the data file sees. */
const dataMarkup = (r) => {
  const inVal = (r.consumes || []).reduce((a, [id, q]) => a + q * DB.item(id).value, 0);
  const out = DB.item(r.produces)?.value ?? 0;
  return inVal > 0 ? out / inVal : Infinity;
};

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ${RED("FAIL")} ${msg}`); };

/* =========================================================================
   MEASURE. Both profiles, because the reference's faucet table is a table of
   RANGES and a single number would be a lie in either direction: FRESH is the
   moment a rung unlocks (that level, mastery 1, no tools, no checkpoints) and
   MASTERED is skill 99, mastery 99, the full bench ladder and all four pool
   checkpoints live. The spread between them is the build-crafting.
   ========================================================================= */
process.stdout.write("measuring the whole economy at both profiles ");
const t0 = Date.now();
const rates = { mastered: economyRates(DB, "mastered"), fresh: economyRates(DB, "fresh") };
const cache = { mastered: new Map(), fresh: new Map() };
console.log(`... ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

/** Sustained Cogs/hr and XP/s for one recipe under one profile. */
function rung(skill, r, profile) {
  const burst = rates[profile].recipeRuns.get(r.id);
  if (!burst) return null;
  const s = sustained(DB, rates[profile], skill, r, burst, cache[profile]);
  return { burst, ...s };
}

/* =========================================================================
   1 + 2. THE PER-SKILL TABLES
   ========================================================================= */
const shapeRows = [];

for (const skillId of skills) {
  const skill = DB.skill(skillId);
  const ladders = SHAPE_KIND[skillId] || [{ kind: "chain", note: "" }];
  console.log(`${B(skill.name)}  ${DIM(`${skill.recipes.length} recipes · pool ${money(500000 * skill.recipes.length)} XP · ${ladders.map((l) => l.kind).join(" + ")}`)}`);
  console.log(DIM(
    `  ${pad("", 26)}${rpad("", 4)}${rpad("", 8)}${rpad("", 8)}${rpad("", 7)}` +
    `${rpad("sustained Cogs/hr", 22)}${rpad("skill XP/s", 19)}` + (wide ? `${rpad("derivation", 26)}` : "")));
  console.log(
    `  ${pad("recipe", 26)}${rpad("lvl", 4)}${rpad("markup", 8)}${rpad("needed", 8)}${rpad("R5", 7)}` +
    `${rpad("fresh", 11)}${rpad("mastered", 11)}${rpad("fresh", 9)}${rpad("mastered", 10)}` +
    (wide ? `${rpad("own", 8)}${rpad("input", 9)}${rpad("value", 9)}` : ""));

  const ladder = ladders.map((l) => ({ ...l, rungs: [] }));  // for the shape check

  for (const r of skill.recipes) {
    const m = rung(skill, r, "mastered");
    const f = rung(skill, r, "fresh");
    if (!m) { console.log(`  ${pad(r.name, 26)}${rpad(r.level, 4)}  ${YEL("not measurable")}`); failures++; continue; }

    const made = (m.burst.produced[r.produces] || 0) + (m.burst.produced[`perfect-${r.produces}`] || 0);
    if (!made) {
      console.log(`  ${pad(r.name, 26)}${rpad(r.level, 4)}   ${YEL("produced nothing — starved or blocked")}`);
      failures++;
      continue;
    }

    /* R5, derived exactly the way the selftest derives it. */
    const perAction = made / m.burst.actionsPerHour;
    const own = 3600 / made;
    let inputSeconds = 0, inputValue = 0;
    for (const [id, q] of r.consumes || []) {
      inputSeconds += (q / perAction) * secondsPerUnit(DB, rates.mastered, id, cache.mastered);
      inputValue += (q / perAction) * DB.item(id).value;
    }
    if (r.shards && rates.mastered.shardsPerHour > 0) {
      inputSeconds += (r.shards / perAction) * (3600 / rates.mastered.shardsPerHour);
    }
    const outValue = DB.item(r.produces).value;
    const priced = inputValue > 0 && inputSeconds > 0;
    const needed = priced ? 1 + own / inputSeconds : NaN;
    const r5 = priced ? (outValue / (own + inputSeconds)) / (inputValue / inputSeconds) : NaN;

    if (priced && !(r5 > 1)) fail(`${skill.name} / ${r.name}: R5 ${r5.toFixed(2)} — a trap, selling the inputs pays better`);

    const authored = dataMarkup(r);
    if (Number.isFinite(authored)) {
      for (const l of ladder) if (!l.only || l.only(r)) l.rungs.push({ r, markup: authored });
    }

    const r5col = !priced ? DIM(rpad("free", 7))
      : r5 > 1.15 ? GRN(rpad(r5.toFixed(2), 7))
      : r5 > 1 ? YEL(rpad(r5.toFixed(2), 7))
      : RED(rpad(r5.toFixed(2), 7));

    const overCeiling = m.cogsPerHour > CEILING;
    const cph = rpad(money(m.cogsPerHour), 11);

    console.log(
      `  ${pad(r.name, 26)}${rpad(r.level, 4)}` +
      `${rpad(Number.isFinite(authored) ? authored.toFixed(2) + "x" : "-", 8)}` +
      `${rpad(priced ? needed.toFixed(2) + "x" : "-", 8)}${r5col}` +
      `${rpad(money(f ? f.cogsPerHour : NaN), 11)}${overCeiling ? RED(cph) : cph}` +
      `${rpad(f ? f.xpPerSecond.toFixed(2) : "-", 9)}${rpad(m.xpPerSecond.toFixed(2), 10)}` +
      (wide ? `${rpad(own.toFixed(2) + "s", 8)}${rpad(inputSeconds.toFixed(1) + "s", 9)}${rpad(money(outValue), 9)}` : ""));
  }

  for (const l of ladder) shapeRows.push({ skill, shape: l, ladder: l.rungs });
  console.log("");
}

/* =========================================================================
   THE SHAPE TABLE — R4, asserted
   ========================================================================= */
console.log(B("Markup shape") + DIM("  (R4: markups compound, so a value chain must open fat and close thin)"));
console.log(`  ${pad("ladder", 24)}${pad("kind", 10)}${rpad("rungs", 6)}${rpad("first", 8)}${rpad("last", 8)}${rpad("max", 8)}${rpad("compounded", 12)}  verdict`);

for (const { skill, shape, ladder } of shapeRows) {
  if (!ladder.length) continue;
  const byLevel = [...ladder].sort((a, b) => a.r.level - b.r.level);
  const ms = byLevel.map((x) => x.markup);
  const first = ms[0], last = ms.at(-1), max = Math.max(...ms);
  const compounded = ms.reduce((a, b) => a * b, 1);

  const breaks = [];
  if (shape.kind === "chain") {
    for (let i = 1; i < byLevel.length; i++) {
      /* A hair of tolerance: rounding a price to something a human can read
         moves a markup in the third decimal, and that is not a design fault. */
      if (ms[i] > ms[i - 1] * 1.005) breaks.push(`${byLevel[i].r.name} ${ms[i].toFixed(2)}x > ${byLevel[i - 1].r.name} ${ms[i - 1].toFixed(2)}x`);
    }
  }
  if (shape.max && max > shape.max) breaks.push(`max ${max.toFixed(2)}x over the ${shape.max}x ceiling`);
  if (last >= first) breaks.push(`last rung ${last.toFixed(2)}x is not thinner than the first ${first.toFixed(2)}x`);

  const verdict = breaks.length ? RED("BROKEN") : GRN(shape.kind === "chain" ? "monotone" : "within bounds");
  console.log(
    `  ${pad(shape.label || skill.name, 24)}${pad(shape.kind, 10)}${rpad(ms.length, 6)}` +
    `${rpad(first.toFixed(2) + "x", 8)}${rpad(last.toFixed(2) + "x", 8)}${rpad(max.toFixed(2) + "x", 8)}` +
    /* Only a chain compounds. Printing the product for a shelf of potions
       priced against their effect would be a big number about nothing. */
    `${rpad(shape.kind === "chain" ? money(compounded) + "x" : "-", 12)}  ${verdict}`);
  if (shape.note) console.log(DIM(`  ${" ".repeat(24)}${shape.note}`));
  for (const b of breaks) fail(`${shape.label || skill.name} shape: ${b}`);
}
console.log("");

/* =========================================================================
   THE CEILING — measured as a MAXIMUM over every rung in the game, not
   against one named loop.
   ========================================================================= */
const allRungs = [];
for (const skill of DB.skills) {
  if (skill.kind === "combat" || !skill.recipes) continue;
  for (const r of skill.recipes) {
    const m = rung(skill, r, "mastered");
    if (m) allRungs.push({ skill, r, cogsPerHour: m.cogsPerHour, throttle: m.throttle });
  }
}
allRungs.sort((a, b) => b.cogsPerHour - a.cogsPerHour);
const richest = allRungs[0];
const endgame = rates.mastered.monsterRuns.get(ENDGAME_FIGHT)
  ?? rates.fresh.monsterRuns.get(ENDGAME_FIGHT);
const combatCogs = [...rates.fresh.monsterRuns.values()].reduce((a, m) => Math.max(a, m.cogsPerHour), 0);
const ratio = combatCogs / richest.cogsPerHour;

console.log(B("The income ceiling") + DIM("  (every rung of every non-combat skill, sustained, at the mastered profile)"));
console.log(`  ${pad("richest non-combat rung", 28)}${pad(`${richest.r.name} (${richest.skill.name})`, 38)}${rpad(money(richest.cogsPerHour), 10)} Cogs/hr`);
console.log(`  ${pad("endgame combat", 28)}${pad(DB.monster(ENDGAME_FIGHT)?.name ?? ENDGAME_FIGHT, 38)}${rpad(money(combatCogs), 10)} Cogs/hr`);
const ratioOk = ratio >= COMBAT_RATIO[0] && ratio <= COMBAT_RATIO[1];
console.log(`  ${pad("combat / best non-combat", 28)}${pad(`must be ${COMBAT_RATIO[0]}x-${COMBAT_RATIO[1]}x  (§5: skills are for XP, combat is for money)`, 38)}${rpad(ratio.toFixed(1) + "x", 10)} ${ratioOk ? GRN("OK") : RED("OUT OF BAND")}`);
if (!ratioOk) fail(`combat out-earns the best non-combat loop by ${ratio.toFixed(1)}x, outside ${COMBAT_RATIO[0]}x-${COMBAT_RATIO[1]}x`);

const over = allRungs.filter((x) => x.cogsPerHour > CEILING);
console.log(`  ${pad(`rungs over ${money(CEILING)} Cogs/hr`, 28)}${over.length ? RED(`${over.length}`) : GRN("none")}`);
for (const x of over) {
  console.log(`      ${RED(pad(`${x.r.name} (${x.skill.name})`, 40))}${money(x.cogsPerHour)} Cogs/hr`);
  fail(`${x.skill.name} / ${x.r.name} sustains ${money(x.cogsPerHour)} Cogs/hr, over the ${money(CEILING)} ceiling`);
}
console.log(DIM("  next five:"));
for (const x of allRungs.filter((y) => y.cogsPerHour <= CEILING).slice(0, 5)) {
  console.log(DIM(`      ${pad(`${x.r.name} (${x.skill.name})`, 40)}${money(x.cogsPerHour)} Cogs/hr`));
}
console.log("");

/* =========================================================================
   THE COOKING STATIONS
   The one part of the wing R5 says nothing about: what the passive cook is
   worth per station, and how long a stockpile takes to fill.
   ========================================================================= */
if (skills.includes("hearthcraft")) {
  const cook = DB.skill("hearthcraft");
  console.log(B("Cooking stations") + DIM(`  (passive is ${cook.passiveMultiplier}x the active interval)`));
  console.log(`  ${pad("station", 14)}${rpad("recipes", 8)}${rpad("active", 9)}${rpad("passive", 9)}${rpad("fill", 10)}  best dish`);
  for (const st of cook.stations) {
    const rs = cook.recipes.filter((r) => r.station === st.id);
    const best = rs.reduce((a, b) => (DB.item(b.produces).value > DB.item(a.produces).value ? b : a));
    const active = st.flat ?? `${Math.min(...rs.map((r) => r.interval))}-${Math.max(...rs.map((r) => r.interval))}`;
    const one = st.flat ?? best.interval;
    const passive = one * cook.passiveMultiplier;
    const fill = (passive * cook.stockpileCap) / 60;
    console.log(
      `  ${pad(st.name, 14)}${rpad(rs.length, 8)}${rpad(active + "s", 9)}${rpad(passive.toFixed(0) + "s", 9)}` +
      `${rpad(fill.toFixed(0) + " min", 10)}  ${best.name} (${money(DB.item(best.produces).value)})`);
  }
  console.log("");
}

/* =========================================================================
   THE PASSIVE COOK REPLAYS EXACTLY
   ========================================================================= */
function stagedGame() {
  const g = new Game(DB, { seed: 0x9a2b17 });
  g.state.clasps = 118;
  for (const s of DB.skills) g.state.skills[s.id] && (g.state.skills[s.id].xp = 13_034_431);
  for (const id of ["silverfin", "bogskate", "glimmereel", "crop-onion", "crop-cabbage",
                    "ember-cinder", "potion-vigour", "potion-thrift"]) {
    g.state.items[id] = 1e6;
  }
  g._usedSlots = Object.keys(g.state.items).length;
  g._invalidate();
  selectStation(g, "furnace", "cook-smoked-eel");
  selectStation(g, "pot", "cook-stew");
  drinkPotion(g, "potion-vigour");
  drinkPotion(g, "potion-thrift");
  g.start("hearthcraft", "cook-silverfin");
  g._syncRng();
  return g;
}

const HOUR = 72_000; // ticks
const fast = stagedGame(); fast.advance(HOUR);
const slow = stagedGame(); slow.advance(HOUR, { naive: true });
const same = fast.hash() === slow.hash();
const stock = Object.entries(fast.state.artisan.stations)
  .map(([id, s]) => `${id} ${Object.values(s.stock).reduce((a, b) => a + b, 0)}`).join(", ");
console.log(B("Passive cook determinism") + DIM("  (one hour, two stations, two live potions)"));
console.log(`  event-jump ${fast.hash().slice(0, 12)}   tick-by-tick ${slow.hash().slice(0, 12)}` +
  `   ${same ? GRN("identical") : RED("DIVERGED")}`);
console.log(`  stockpiles after the hour: ${stock}\n`);
if (!same) fail("the passive cook does not replay identically on the two loop paths");

console.log(failures ? RED(`${failures} problem${failures === 1 ? "" : "s"}.`)
  : GRN(`clean: no traps, every chain's markup decays, and nothing non-combat clears ${money(CEILING)} Cogs/hr.`));
process.exit(failures ? 1 : 0);
