#!/usr/bin/env node
/* =========================================================================
   EMBERVEIL — THE EXOTIC WING CHECK   (Agility, Summoning, Astrology)

   The engine selftest proves the maths and the replay. It cannot prove that
   the three bespoke systems in this wing are actually WIRED — a course that
   never advances, a mark that never drops, a constellation percentage that
   never reaches the modifier set would all leave the selftest green while the
   skills quietly did nothing.

   So this tool drives the real engine, headless, and asserts the behaviour
   each of the three parity clauses promises:

     §3g  a built course runs slot to slot and laps; an obstacle's signed
          passive really does reach an unrelated skill's interval; building
          costs Cogs AND material and a blueprint reproduces a course.
     §3f  a mark drops from the ASSOCIATED skill and from no other; the first
          mark is blocked until a tablet is crafted; equipping doubles the
          rate; an equipped familiar is consumed one tablet per action.
     §3e  rolling a slot to 2.00% and 5.00% puts exactly that number into the
          modifier pipeline, additively, where the tick loop reads it.

   Plus the guards the brief is explicit about: no forbidden proper noun in
   any string this wing ships, and the join files still point at it.

   AND THE CAP REPORT, which is the reason this tool grew a second half. A
   modifier that reaches the pipeline is not the same as a modifier the player
   receives: the pipeline is additive and its named families are CLAMPED, so a
   source pushing a bucket that is already at its clamp is a number on a screen
   and nothing else — while its signed penalty is charged in full. The report
   measures the pre-clamp sum of every named bucket for a mastered player of
   every skill in the game, splits it into what this wing contributes and what
   it does not, and fails if one point of what the wing advertises fails to
   arrive. See the long comment above THE CAP REPORT.

       node tools/check-exotic.mjs
       node tools/check-exotic.mjs --caps      the report on its own
       node tools/check-exotic.mjs --shots <dir>
   ========================================================================= */

import * as FS from "node:fs";
const { readFileSync } = FS;
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const {
  DB, Game, MOD, xpAt, parseReference, scanForbidden,
  positioned, hitChance, intervalTicks, ticksToSeconds,
  INTERVAL_REDUCTION_CAP, PRESERVE_CAP, HIT_CHANCE_CAP, MIN_INTERVAL_SECONDS,
} = await import(join(ROOT, "src/js/engine/index.js"));
const AG = await import(join(ROOT, "src/js/engine/systems/agility.js"));
const SUM = await import(join(ROOT, "src/js/engine/systems/summoning.js"));
const AST = await import(join(ROOT, "src/js/engine/systems/astrology.js"));
const { OBSTACLES, OBSTACLE_BY_ID, SLOTS } = await import(join(ROOT, "src/data/obstacles.js"));
const { FAMILIARS, SYNERGIES, synergyFor, tabletId, craftId, tabletsPerCraft } =
  await import(join(ROOT, "src/data/familiars.js"));
const { CONSTELLATIONS, TIER_VALUES, slotKey } = await import(join(ROOT, "src/data/constellations.js"));
const { EXOTIC_SHOP } = await import(join(ROOT, "src/data/shop/exotic.js"));

/* ---- harness ------------------------------------------------------------ */

const results = [];
/** Lines the cap report prints under the check list, in report order. */
const CAP_REPORT = [];
const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const eq = (name, actual, expected, detail = "") =>
  ok(name, actual === expected, detail || `expected ${expected}, got ${actual}`);

/** A capped, stocked game with the hooks installed. */

function capped(cogs = 1e12) {
  const g = new Game(DB, { seed: 0xe0d1ce });
  for (const s of DB.skills) g.state.skills[s.id].xp = xpAt(99);
  g.state.cogs = cogs;
  g.state.shards = 1e9;
  g.state.clasps = 118;
  g._invalidate();
  AG.ensureHooks(g);
  return g;
}

function stock(g, ids, qty = 1e7) {
  for (const id of ids) g.state.items[id] = qty;
  g._usedSlots = Object.keys(g.state.items).length;
}

/* =========================================================================
   §3g  AGILITY
   ========================================================================= */

{
  const g = capped();
  stock(g, OBSTACLES.map((o) => o.material[0]));

  eq("agility is a route skill, so obstacles pay Cogs and drop nothing",
    DB.skill("agility").kind, "route");
  eq("eight obstacle slots", SLOTS.length, 8);
  eq("twenty-four level-gated designs, three per slot", OBSTACLES.length, 24);
  ok("every slot offers exactly three designs",
    SLOTS.every((s) => OBSTACLES.filter((o) => o.slot === s.index).length === 3));
  /* Every bucket a design is allowed to trade in is one where a POSITIVE
     number is the benefit, so the sign alone says which half of the bargain
     you are reading. That is not a convenience — it is the cap rule stated
     from the other end: `intervalPercent` and `respawnPercent` are the two
     backwards-signed buckets in the engine and they are also the two whose
     clamps this wing has no room in (see the cap report below). */
  const BACKWARDS = ["intervalPercent", "intervalFlat", "respawnPercent"];
  eq("no obstacle sells a negative-is-better modifier",
    OBSTACLES.flatMap((o) => o.mods.filter(([n]) => BACKWARDS.includes(n)).map(([n]) => `${o.name}/${n}`))
      .join(", ") || "none", "none",
    "so a signed bargain reads correctly from its sign alone");
  const helps = ([, v]) => v > 0;
  ok("every obstacle carries a signed trade-off (§7.4)",
    OBSTACLES.every((o) => o.mods.some(helps) && o.mods.some((m) => !helps(m))),
    `${OBSTACLES.filter((o) => o.mods.some((m) => !helps(m))).length} of ${OBSTACLES.length} carry a real penalty`);

  /* Building costs Cogs AND material, and it is really deducted. */
  const first = OBSTACLES[0];
  const cost = AG.buildCost(g, first.id);
  const cogsBefore = g.state.cogs, matBefore = g.count(cost.material[0]);
  eq("build succeeds", AG.build(g, first.id), null);
  eq("build spent Cogs", cogsBefore - g.state.cogs, cost.cogs);
  eq("build spent material", matBefore - g.count(cost.material[0]), cost.material[1]);

  /* A full course: the best design in every slot. */
  const top = SLOTS.map((s) => OBSTACLES.filter((o) => o.slot === s.index).at(-1));
  for (const o of top) eq(`build ${o.name}`, AG.build(g, o.id), null);
  const y = AG.courseYield(g);
  ok("a full course reports a lap time, XP and Cogs",
    y.obstacles === 8 && y.seconds > 0 && y.xp > 0 && y.cogs > 0,
    `${y.seconds.toFixed(2)}s a lap, ${Math.round(y.xp)} XP, ${Math.round(y.cogs)} Cogs`);

  /* The signed passives reach OTHER skills — that is the whole design. */
  const m = g.mods();
  ok("an obstacle's global passive reaches an unrelated skill",
    m.sum(MOD.skillXP, ["delving"]) !== 0 || m.sum(MOD.doubleChance, ["delving"]) !== 0,
    `Mining sees ${(m.sum(MOD.skillXP, ["delving"]) * 100).toFixed(1)}% skill XP and ` +
    `${(m.sum(MOD.doubleChance, ["delving"]) * 100).toFixed(1)}% double from the course`);
  const passives = AG.activePassives(g);
  ok("every standing obstacle is listed in the passive audit",
    passives.length === top.reduce((n, o) => n + o.mods.length, 0) + first.mods.length ||
    passives.length >= 8, `${passives.length} entries`);

  /* The course actually walks. */
  eq("Start Agility", AG.startCourse(g), null);
  const startedOn = g.state.action.recipeId;
  g.advanceSeconds(600);
  const st = g.state.agility;
  ok("the course walked from slot to slot and lapped",
    st.laps > 0 && g.state.action.recipeId !== startedOn,
    `${st.laps} laps, now on slot ${st.cursor + 1} (${OBSTACLE_BY_ID.get(g.state.action.recipeId).name})`);
  ok("Agility paid Cogs from the action, not from a sale", g.state.cogs > 0);
  ok("Agility earned skill XP", g.state.skills.agility.xp > xpAt(99),
    `${Math.round(g.state.skills.agility.xp - xpAt(99))} XP in ten minutes`);

  /* Blueprints. */
  eq("Save Blueprint", AG.saveBlueprint(g, 0, "Top"), null);
  for (let i = 0; i < 8; i++) AG.demolish(g, i);
  eq("the course is empty after demolishing", AG.courseYield(g).obstacles, 0);
  const bpCost = AG.blueprintCost(g, 0);
  ok("Load Blueprint quotes a real price", bpCost.cogs > 0, `${bpCost.cogs.toLocaleString()} Cogs`);
  eq("Load Blueprint", AG.loadBlueprint(g, 0), null);
  eq("the blueprint rebuilt the course", AG.courseYield(g).obstacles, 8);

  /* An untouched save carries no agility key at all — the property that keeps
     the selftest's determinism sweep meaningful. */
  const clean = new Game(DB);
  clean.start("agility", OBSTACLES[0].id);
  clean.advanceSeconds(120);
  eq("a course nobody built leaves no state and repeats one obstacle",
    clean.state.agility, undefined);
}

/* =========================================================================
   §3f  SUMMONING
   ========================================================================= */

{
  eq("twenty familiars", FAMILIARS.length, 20);
  eq("the mastery pool caps at the reference's 10,000,000", DB.recipeCounts.summoning * 500000, 10_000_000);
  /* "an action to complete" now includes a player swing. A combat skill has
     no recipes and never will — §1 says the eight of them are levels, not
     pages — but since game.js gained `afterCombatAction` a swing completes
     exactly as a craft does, so combat is a legal place to be marked in. */
  const hasActions = (id) => (DB.skill(id)?.recipes?.length || 0) > 0 || DB.skill(id)?.kind === "combat";
  ok("every familiar is marked in a real skill that has actions to complete",
    FAMILIARS.every((f) => hasActions(f.skill)),
    `${new Set(FAMILIARS.map((f) => f.skill)).size} skills carry a mark`);
  /* §3f wants combat to be a mark source, not just a tablet sink. Every
     familiar whose modifier is combat-scoped is marked in the combat skill
     whose stat it raises — the Ashcat's accuracy comes off Attack, the Grave
     Moth's max hit off Strength, the Roc's interval off Ranged — so the
     familiar that makes you hit harder is funded by hitting things, and not,
     as it was, by brewing potions. */
  const combatMarked = FAMILIARS.filter((f) => DB.skill(f.skill)?.kind === "combat");
  ok("every combat-scoped familiar is marked in a combat skill",
    FAMILIARS.filter((f) => f.mods.some(([, , s]) => s === "combat"))
      .every((f) => DB.skill(f.skill)?.kind === "combat") && combatMarked.length >= 3,
    combatMarked.map((f) => `${f.name} -> ${DB.skill(f.skill).name}`).join(", "));
  ok("every equipped modifier is scoped to a real skill, \"combat\" or global",
    FAMILIARS.concat(SYNERGIES).every((f) => f.mods.every(([, , s]) =>
      s === "global" || s === "combat" || !!DB.skill(s))));
  ok("no familiar is marked in Summoning itself — marks come from elsewhere",
    FAMILIARS.every((f) => f.skill !== "summoning"));
  eq("ten synergies", SYNERGIES.length, 10);
  /* Same rule as the obstacles and the constellations, with the one exception
     this wing allows itself: flat seconds are a different bucket from the
     percentage clamp, bounded by §4.1's 0.25 s floor instead, so exactly one
     familiar is allowed to sell speed. The cap report proves it lands. */
  eq("no familiar or synergy writes into a clamped backwards-signed bucket",
    FAMILIARS.concat(SYNERGIES).flatMap((f) =>
      f.mods.filter(([n]) => n === "intervalPercent" || n === "respawnPercent")
        .map(([n]) => `${f.name}/${n}`)).join(", ") || "none", "none");
  eq("...and flat seconds are sold by exactly one familiar",
    FAMILIARS.concat(SYNERGIES).filter((f) => f.mods.some(([n]) => n === "intervalFlat"))
      .map((f) => f.name).join(", "), "Stormcrown Roc",
    "the wing's only speed lever, and it is in the bucket with the room");

  /* A mark drops from the ASSOCIATED skill. */
  const g = capped();
  const mole = FAMILIARS.find((f) => f.id === "fam-stone-mole");
  g.start("delving", "vein-cinder-shale");
  g.advanceSeconds(3600);
  ok("a mark dropped while training the associated skill",
    SUM.markLevel(g, mole.id) >= 1,
    `Stonewarden Mole mark ${SUM.markLevel(g, mole.id)} after an hour of Mining`);
  eq("...and it stopped at level 1 until a tablet is made",
    SUM.markLevel(g, mole.id), 1);
  ok("marks for other skills did not drop from Mining",
    SUM.markLevel(g, "fam-tidewisp") === 0 && SUM.markLevel(g, "fam-branchling") === 0);

  /* Crafting unblocks it. */
  stock(g, DB.skill("summoning").recipes.flatMap((r) => r.consumes.map(([i]) => i)));
  g.start("summoning", craftId(mole.id));
  g.advanceSeconds(60);
  ok("crafting the tablet marks it converted", SUM.markOf(g, mole.id).crafted === true);
  ok("tablets were produced in a batch the mark level sets",
    g.count(tabletId(mole.id)) > 0, `${g.count(tabletId(mole.id))} held`);

  g.start("delving", "vein-cinder-shale");
  g.advanceSeconds(3600 * 3);
  ok("the mark deepens again once the tablet exists",
    SUM.markLevel(g, mole.id) >= 2, `mark ${SUM.markLevel(g, mole.id)} / 5`);

  /* Batch size follows the mark. */
  const lvl = SUM.markLevel(g, mole.id);
  g.start("summoning", craftId(mole.id));
  const extra = g.mods().sum(MOD.flatQuantity, ["summoning", craftId(mole.id)]);
  ok("the mark level is the batch size",
    extra >= tabletsPerCraft(lvl) - 1,
    `mark ${lvl} -> ${tabletsPerCraft(lvl)} tablets a craft`);

  /* Equipping: a modifier, a doubled mark rate, and one tablet an action. */
  const g2 = capped();
  stock(g2, DB.skill("summoning").recipes.flatMap((r) => r.consumes.map(([i]) => i)));
  g2.state.items[tabletId("fam-branchling")] = 500;
  g2._usedSlots = Object.keys(g2.state.items).length;
  eq("equip a familiar", SUM.equip(g2, "fam-branchling", 0), null);
  ok("the equipped familiar's modifier is in the pipeline",
    g2.mods().sum(MOD.doubleChance, ["boughcraft"]) >= 0.05,
    `+${(g2.mods().sum(MOD.doubleChance, ["boughcraft"]) * 100).toFixed(0)}% chance to double a log`);
  const held = g2.count(tabletId("fam-branchling"));
  g2.start("boughcraft", "bough-palebirch");
  g2.advanceSeconds(120);
  const spent = held - g2.count(tabletId("fam-branchling"));
  ok("one tablet is spent per completed action",
    spent === g2.state.stats.actions, `${spent} tablets for ${g2.state.stats.actions} actions`);

  /* --- COMBAT IS AN ACTION TOO -------------------------------------------
     The assertion this file was missing for two rounds. Everything above
     measures tablets against a CRAFT, and combat does not craft: it swings.
     Before game.js gained `afterCombatAction`, an hour of fighting spent
     zero tablets and dropped zero marks, and every check here passed anyway,
     because not one of them ever put the game in combat.

     So: an hour of the endgame fight with two familiars equipped must burn a
     printed, non-zero number of tablets, and that number is printed as a
     ratio against what the endgame craft produces in the same hour. The
     ratio is the number that decides whether familiars are affordable while
     fighting; a check that prints only the consumption cannot say. */
  {
    const gc = capped();
    /* The Warden hits for 620 and has 282,000 HP. A capped adept with no
       relic and no food dies to it in 4.4 seconds — which is how the first
       draft of this check measured "2 tablets an hour" and nearly concluded
       the hook was broken. Kit the adept out the way sandbox.js's "mastered"
       profile does, and stock the pantry, so the hour is an hour of fighting
       rather than an hour of being dead. */
    for (const e of DB.shop) {
      if (e.category === "ascension" || e.category === "bounty" || e.category === "gear") continue;
      gc.state.purchases[e.id] = 1;
    }
    for (const id of DB.provisionIds) gc.state.items[id] = 1e7;
    gc._invalidate();

    const pair = ["fam-ashcat", "fam-grave-moth"];
    for (const id of pair) gc.state.items[tabletId(id)] = 1e6;
    gc._usedSlots = Object.keys(gc.state.items).length;
    for (let i = 0; i < pair.length; i++) SUM.equip(gc, pair[i], i);
    ok("both familiars are equipped for the fight", pair.every((id) => SUM.isEquipped(gc, id)));

    const before = pair.map((id) => gc.count(tabletId(id)));
    gc.fight("the-ninefold-warden");
    gc.advanceSeconds(3600);
    const burned = pair.reduce((n, id, i) => n + (before[i] - gc.count(tabletId(id))), 0);
    const perSlot = pair.map((id, i) => before[i] - gc.count(tabletId(id)));

    ok("an hour of combat consumes tablets",
      burned > 0,
      `${burned.toLocaleString("en-US")} tablets/hr across ${pair.length} slots`);
    /* "One per equipped familiar per swing" is asserted as an IDENTITY rather
       than against a predicted swing count: the interval moves with the
       familiars' own modifiers and the clock stops during a respawn, so any
       predicted number would be a second, worse implementation of the thing
       being tested. Two slots eating exactly the same number is the property
       that can only hold if each is charged once per swing. */
    ok("...one per equipped familiar per swing",
      perSlot[0] > 0 && perSlot[0] === perSlot[1],
      perSlot.map((n, i) => `${FAMILIARS.find((f) => f.id === pair[i]).name} ${n}`).join(" · "));

    /* What the endgame craft makes in the same hour, measured the same way.
       At a deepened mark, which is the state a player who has farmed this
       familiar is actually in — batch size IS mark level. */
    const gp = capped();
    stock(gp, DB.skill("summoning").recipes.flatMap((r) => r.consumes.map(([i]) => i)));
    const top = DB.skill("summoning").recipes.at(-1);
    const topFam = FAMILIARS.find((f) => craftId(f.id) === top.id);
    const sst = SUM.sumState(gp, true);
    sst.marks[topFam.id] = { level: 5, crafted: true };
    gp._invalidate();
    gp.start("summoning", top.id);
    gp.advanceSeconds(3600);
    const made = gp.count(tabletId(topFam.id));

    const ratio = made > 0 ? burned / made : Infinity;
    ok("...and the hour of fighting costs less than the hour of crafting makes",
      ratio < 1,
      `${burned.toLocaleString("en-US")} spent/hr vs ${made.toLocaleString("en-US")} made/hr ` +
      `(${topFam.name}, mark 5) = ${ratio.toFixed(3)}x`);

    ok("combat drops marks for the skill the attack style trains",
      SUM.markLevel(gc, "fam-ashcat") >= 1,
      `Ashcat mark ${SUM.markLevel(gc, "fam-ashcat")} after an hour of ${DB.skill(gc.styleSkillId()).name}`);
  }

  const g3 = capped();
  g3.state.items[tabletId("fam-branchling")] = 3;
  g3._usedSlots = 1;
  SUM.equip(g3, "fam-branchling", 0);
  g3.start("boughcraft", "bough-palebirch");
  g3.advanceSeconds(600);
  ok("running out of tablets un-equips the familiar",
    !SUM.isEquipped(g3, "fam-branchling"));

  /* A synergy needs both halves. */
  const g4 = capped();
  const syn = SYNERGIES[0];
  for (const id of syn.pair) { g4.state.items[tabletId(id)] = 500; }
  g4._usedSlots = 2;
  SUM.equip(g4, syn.pair[0], 0);
  ok("one half of a pair is not a synergy", SUM.activeSynergy(g4) === null);
  SUM.equip(g4, syn.pair[1], 1);
  ok("both halves form the synergy", SUM.activeSynergy(g4)?.name === syn.name, syn.name);
  ok("...and the synergy's modifier is live",
    g4.mods().sum(MOD.skillXP, ["emberrite"]) >= 0.10 + 0.05,
    `${(g4.mods().sum(MOD.skillXP, ["emberrite"]) * 100).toFixed(0)}% Firemaking XP from familiar + synergy`);

  /* The private stream: mark rolls must not disturb the main RNG. */
  const a = new Game(DB, { autoSell: true, seed: 0x1234 });
  a.state.skills.delving.xp = xpAt(99);
  a._invalidate();
  a.start("delving", "vein-cinder-shale");
  a.advanceSeconds(1800);
  const b = new Game(DB, { autoSell: true, seed: 0x1234 });
  b.state.skills.delving.xp = xpAt(99);
  b._invalidate();
  AG.ensureHooks(b);
  b.start("delving", "vein-cinder-shale");
  b.advanceSeconds(1800);
  eq("mark rolls draw from their own stream and leave Mining's output identical",
    a.state.cogs, b.state.cogs, `${a.state.cogs} vs ${b.state.cogs} Cogs`);
}

/* =========================================================================
   §3e  ASTROLOGY
   ========================================================================= */

{
  eq("eight constellations", CONSTELLATIONS.length, 8);
  eq("twenty-four modifier slots", CONSTELLATIONS.reduce((n, c) => n + c.slots.length, 0), 24);
  eq("three rollable states: 0% / 2.00% / 5.00%",
    TIER_VALUES.map((v) => (v * 100).toFixed(2)).join(" / "), "0.00 / 2.00 / 5.00");
  eq("a flat 3.00s interval", DB.skill("astrology").baseInterval, 3.0);
  ok("every constellation carries a Study and an Explore action",
    DB.skill("astrology").recipes.length === CONSTELLATIONS.length * 2);

  const g = capped();
  g.state.items["star-mote"] = 1e6;
  g.state.items["prism-mote"] = 1e6;
  g._usedSlots = 2;

  const c = CONSTELLATIONS[0];
  const before = g.mods().sum(MOD.skillXP, ["delving"]);
  eq("roll a slot to 2.00%", AST.upgrade(g, c.id, 0), null);
  const at2 = g.mods().sum(MOD.skillXP, ["delving"]) - before;
  ok("2.00% really is 2.00% in the modifier pipeline",
    Math.abs(at2 - 0.02) < 1e-9, `+${(at2 * 100).toFixed(2)}%`);
  eq("roll the same slot to 5.00%", AST.upgrade(g, c.id, 0), null);
  const at5 = g.mods().sum(MOD.skillXP, ["delving"]) - before;
  ok("...and 5.00% replaces it rather than stacking on it",
    Math.abs(at5 - 0.05) < 1e-9, `+${(at5 * 100).toFixed(2)}%`);
  ok("a fully rolled slot cannot be rolled again", AST.canUpgrade(g, c.id, 0) !== null);

  /* No slot may sell a "negative is better" modifier. That rule is what let
     the per-slot `sign` field be deleted, and it is what keeps the screen
     from ever printing "+2.00% Mining interval" beside a bar that just got
     faster. It also rules out the two buckets — interval and respawn — whose
     caps this wing has no room in. */
  const BACKWARDS = ["intervalPercent", "intervalFlat", "respawnPercent"];
  eq("no constellation slot sells a negative-is-better modifier",
    CONSTELLATIONS.flatMap((c) => c.slots.filter((sl) => BACKWARDS.includes(sl.mod))
      .map((sl) => `${c.name}/${sl.mod}`)).join(", ") || "none", "none",
    "every one of the twenty-four reads as a plain positive percentage");
  AST.upgrade(g, c.id, 2);

  ok("the active-modifier audit lists what was rolled",
    AST.activeModifiers(g).length === 2, `${AST.activeModifiers(g).length} entries`);

  /* Study pays experience; Explore pays the Prism Motes. */
  const gained = (recipeId) => {
    const g = capped();
    const before = g.state.skills.astrology.xp;
    g.start("astrology", recipeId);
    g.advanceSeconds(600);
    return g.state.skills.astrology.xp - before;
  };
  const xpStudy = gained("study-lantern");
  const xpExplore = gained("explore-lantern");
  const s1 = capped(); s1.start("astrology", "study-lantern"); s1.advanceSeconds(600);
  const s2 = capped(); s2.start("astrology", "explore-lantern"); s2.advanceSeconds(600);
  ok("Study out-earns Explore on experience",
    xpStudy > xpExplore * 1.8,
    `${Math.round(xpStudy)} vs ${Math.round(xpExplore)} XP in ten minutes`);
  ok("Explore is the only source of Prism Motes",
    s2.count("prism-mote") > 0 && s1.count("prism-mote") === 0,
    `${s2.count("prism-mote")} Prism Motes`);
}

/* =========================================================================
   DETERMINISM ON A CONFIGURED SAVE

   The engine selftest sweeps every rung of every skill, but it does it on a
   virgin save — which for this wing means an empty course, no marks and no
   equipped familiar, i.e. exactly the state in which all three systems are
   no-ops. The interesting case is the opposite one, and it is the case a real
   player is in: a course walking from slot to slot, a private mark stream
   drawing on other skills' actions, and a familiar eating a tablet an action.

   So the four paths the selftest uses are re-run here on a fully configured
   save. If any of them drifts, the offline replay is lying about this wing.
   ========================================================================= */

{
  const build = (seed) => {
    const g = capped();
    stock(g, OBSTACLES.map((o) => o.material[0]));
    stock(g, DB.skill("summoning").recipes.flatMap((r) => r.consumes.map(([i]) => i)));
    g.state.items["star-mote"] = 1e6;
    g.state.items["prism-mote"] = 1e6;
    g.state.items[tabletId("fam-branchling")] = 1e6;
    g._usedSlots = Object.keys(g.state.items).length;
    for (const id of ["obs-cinder-steps", "obs-rubble-scramble", "obs-gap-leap", "obs-slag-hurdles"]) AG.build(g, id);
    SUM.equip(g, "fam-branchling", 0);
    AST.upgrade(g, "con-lantern", 0);
    AST.upgrade(g, "con-net", 1);
    g.rng.seed(seed); g._syncRng();
    g._invalidate();
    AG.startCourse(g);
    return g;
  };
  const TICKS = 60_000;
  const CUTS = [7311, 1, 12000, 40, 9997, 3, 15555, 2048, 6666, 4321, 1057, 1002];

  const fast = build(0x51ede1); fast.advance(TICKS);
  const want = fast.hash();

  const naive = build(0x51ede1); naive.advance(TICKS, { naive: true });
  eq("a configured course + marks + familiar: event jump == tick-by-tick", naive.hash(), want,
    `${fast.state.agility.laps} laps, mark ${SUM.markLevel(fast, "fam-branchling")}, ` +
    `${Math.round(1e6 - fast.count(tabletId("fam-branchling")))} tablets eaten`);

  const chunked = build(0x51ede1);
  let left = TICKS, i = 0;
  while (left > 0) { const k = Math.min(left, CUTS[i++ % CUTS.length]); chunked.advance(k); left -= k; }
  eq("...twelve uneven chunks == one continuous run", chunked.hash(), want);

  const half = build(0x51ede1);
  half.advance(23_101);
  const reloaded = Game.load(DB, JSON.parse(JSON.stringify(half.serialize(0))));
  reloaded.advance(TICKS - 23_101);
  eq("...serialise to JSON mid-course and resume == uninterrupted", reloaded.hash(), want,
    "the private mark stream survives the round trip");

  /* The course exercises the tablet drain but not the mark stream — Agility is
     nobody's associated skill. Woodcutting is the Branchling's, so run that
     four ways too: this is the only path on which the PRIVATE rng advances,
     and it is the one a naive implementation gets wrong on reload. */
  const marked = (seed) => {
    const g = capped();
    g.state.items[tabletId("fam-branchling")] = 1e6;
    g._usedSlots = 1;
    SUM.equip(g, "fam-branchling", 0);
    g.rng.seed(seed); g._syncRng();
    g._invalidate();
    g.start("boughcraft", "bough-palebirch");
    return g;
  };
  const mFast = marked(0xbead); mFast.advance(TICKS);
  const mWant = mFast.hash();
  const mNaive = marked(0xbead); mNaive.advance(TICKS, { naive: true });
  eq("the private mark stream is tick-exact", mNaive.hash(), mWant,
    `Branchling mark ${SUM.markLevel(mFast, "fam-branchling")} / 5 after 50 minutes of Woodcutting`);
  const mHalf = marked(0xbead); mHalf.advance(23_101);
  const mReload = Game.load(DB, JSON.parse(JSON.stringify(mHalf.serialize(0))));
  mReload.advance(TICKS - 23_101);
  eq("...and it survives a save and reload mid-stream", mReload.hash(), mWant);

  const replay = build(0x51ede1);
  replay.state.lastSaveAt = 0;
  const summary = replay.offlineReplay(6 * 3600 * 1000);
  ok("six hours offline really runs the course and the marks",
    replay.state.agility.laps > 0 && summary.ticks === 6 * 3600 * 20,
    `${replay.state.agility.laps} laps and mark ${SUM.markLevel(replay, "fam-branchling")} while away`);
}

/* =========================================================================
   THE CAP REPORT

   The bug this section exists to make impossible:

     A modifier is only worth printing on a screen if the player receives it,
     and Emberveil's modifier families are CAPPED. `intervalPercent` is one
     shared additive bucket (§7.1) clamped at INTERVAL_REDUCTION_CAP;
     `preserveChance` is one shared bucket clamped at PRESERVE_CAP; combat's
     hit chance is clamped at HIT_CHANCE_CAP. A source that pushes a bucket
     that is ALREADY at its clamp changes nothing at all — and if that source
     is a signed Agility obstacle, the player still pays its penalty in full.
     §7.4's whole bargain becomes pure downside and the screen is lying.

   So: for a MASTERED player of every skill in the game, and again for a
   mastered player past the Ascension Rites, this report measures the
   PRE-CLAMP sum of every named modifier bucket, splits it into

        base   everything outside this wing — the tool and bench ladders, the
               waystations, the pool checkpoints, the recipe-scoped mastery
               unlocks, the Ascension Rites. For Agility, Summoning and
               Astrology this also includes THEIR OWN checkpoint and mastery
               ladders, which live in this wing's files; the split is by
               "player-chosen wing content", not by file ownership, because
               what a report about caps needs to isolate is the part a player
               opts into.

        wing   this wing at MAXIMUM investment: its whole shop shelf, the
               course built with whichever of the three designs in each of
               the eight slots pushes this bucket hardest, whichever pair of
               the twenty familiars (plus their synergy) pushes it hardest,
               and all twenty-four constellation slots rolled to 5.00%.

   and then compares what the wing is ADVERTISING against what the clamp
   actually lets through:

        delivered = clamp(base + wing) - clamp(base)

   THE RULE: delivered must equal wing. A wing source that cannot be received
   is a failure of this wing, wherever the bucket was filled from.

   Rows where `base` alone already exceeds the cap are marked LADDER and
   printed with the out-of-wing sources that filled it, by name. Those are
   not this wing's failures — nothing in these files can fix them — but they
   are the reason the wing ships almost no interval at all, so the report
   prints them rather than hiding them.

       node tools/check-exotic.mjs --caps      (the report on its own)
   ========================================================================= */

const CAPPED = [
  { bucket: MOD.intervalPercent, cap: INTERVAL_REDUCTION_CAP, orient: -1, label: "INTERVAL REDUCTION" },
  { bucket: MOD.preserveChance,  cap: PRESERVE_CAP,           orient: +1, label: "RESOURCE PRESERVATION" },
];
/* Printed too, because "every named bucket" means every named bucket — and
   because a bucket with no cap is exactly where a re-cut source should land. */
const UNCAPPED = [MOD.skillXP, MOD.masteryXP, MOD.doubleChance, MOD.currency, MOD.saleValue];

const WING_SHOP = EXOTIC_SHOP.map((e) => e.id);
const clampTo = (v, cap) => (v > cap ? cap : v);
const f3 = (v) => (v < 0 ? "" : " ") + v.toFixed(3);

/** Sum one modifier list's contribution to `bucket` under `scopes`. */
function contributes(mods, bucket, scopes, selfSkill) {
  let v = 0;
  for (const [name, value, sym] of mods) {
    if (name !== bucket) continue;
    const scope = sym === "global" ? null : sym === "skill" ? selfSkill : sym;
    if (scope === null || scopes.includes(scope)) v += value;
  }
  return v;
}

/** The course that pushes `bucket` hardest, one design per slot. */
function bestCourse(bucket, orient, scopes) {
  return SLOTS.map((s) => {
    let bestId = null, best = 0;
    for (const o of OBSTACLES) {
      if (o.slot !== s.index) continue;
      const v = orient * contributes(o.mods, bucket, scopes, "agility");
      if (v > best) { best = v; bestId = o.id; }
    }
    return bestId;
  });
}

/** The familiar pair (with its synergy) that pushes `bucket` hardest. */
function bestPair(bucket, orient, scopes) {
  let best = 0, pair = [null, null];
  for (let i = 0; i < FAMILIARS.length; i++) {
    for (let j = i + 1; j < FAMILIARS.length; j++) {
      const syn = synergyFor(FAMILIARS[i].id, FAMILIARS[j].id);
      const v = orient * (
        contributes(FAMILIARS[i].mods, bucket, scopes, null) +
        contributes(FAMILIARS[j].mods, bucket, scopes, null) +
        (syn ? contributes(syn.mods, bucket, scopes, null) : 0));
      if (v > best) { best = v; pair = [FAMILIARS[i].id, FAMILIARS[j].id]; }
    }
  }
  return pair;
}

/**
 * A mastered game with this wing either stripped out entirely or configured
 * to push `bucket` as hard as it can. The action is STARTED, because
 * recipe-scoped mastery unlocks only exist for the action in flight and
 * leaving them out would understate every bucket in the game.
 */
function profile(skillId, recipeId, { ascended, wing, bucket, orient, scopes }) {
  const g = positioned(DB, { skillId, recipeId, profile: "mastered", ascended });
  for (const id of WING_SHOP) delete g.state.purchases[id];
  AG.ensureHooks(g);
  if (wing) {
    /* The whole shelf, comforts included: a cap report measures the ceiling,
       not the median. */
    for (const e of EXOTIC_SHOP) g.state.purchases[e.id] = 1;
    g.state.agility = { course: bestCourse(bucket, orient, scopes), blueprints: [], cursor: 0, laps: 0 };
    g.state.summoning = { marks: {}, equipped: bestPair(bucket, orient, scopes), rng: [1, 2, 3, 4], discovered: 0 };
    const upgrades = {};
    for (const c of CONSTELLATIONS) c.slots.forEach((_, i) => { upgrades[slotKey(c.id, i)] = TIER_VALUES.length - 1; });
    g.state.astrology = { upgrades };
  }
  g._invalidate();
  g.start(skillId, recipeId);
  return g;
}

/** One row of the table: base / wing / total / delivered, all pre-clamp. */
function measureBucket(skillId, recipeId, bucket, orient, ascended) {
  const scopes = [skillId, recipeId];
  const base = orient * profile(skillId, recipeId, { ascended, wing: false }).mods().sum(bucket, scopes);
  const full = profile(skillId, recipeId, { ascended, wing: true, bucket, orient, scopes })
    .mods().sum(bucket, scopes) * orient;
  return { base, wing: full - base, total: full };
}

{
  const SKILLS = DB.masterySkills;
  const lines = [];
  const ladderRows = [];
  let capFailures = 0;

  for (const { bucket, cap, orient, label } of CAPPED) {
    lines.push("");
    lines.push(`  ${label}   cap ${cap.toFixed(2)}   (pre-clamp sums, mastered player, action in flight)`);
    lines.push("    skill          profile     base     wing    total   delivered  verdict");
    for (const ascended of [false, true]) {
      for (const sk of SKILLS) {
        const top = sk.recipes[sk.recipes.length - 1];
        const { base, wing, total } = measureBucket(sk.id, top.id, bucket, orient, ascended);
        if (Math.abs(base) < 1e-9 && Math.abs(wing) < 1e-9) continue;
        const delivered = clampTo(total, cap) - clampTo(base, cap);
        const short = wing - delivered;
        const bad = short > 1e-9;
        if (bad) capFailures++;
        const verdict = bad
          ? `FAIL  ${(short * 100).toFixed(1)}pp of wing modifier never reaches the player`
          : base > cap + 1e-9 ? "ok    LADDER — base is over the cap on its own"
          : "ok";
        if (base > cap + 1e-9 && !ascended) ladderRows.push([sk.id, bucket, base, cap]);
        lines.push(`    ${sk.id.padEnd(14)} ${(ascended ? "ascended" : "mastered").padEnd(9)}` +
          `${f3(base)} ${f3(wing)} ${f3(total)}    ${f3(delivered)}  ${verdict}`);
      }
    }
  }

  lines.push("");
  lines.push(`  UNCAPPED BUCKETS   (printed because "every named bucket" means every one;`);
  lines.push(`                      an over-subscribed source belongs in one of these)`);
  lines.push("    skill          bucket           base     wing    total");
  for (const sk of SKILLS) {
    const top = sk.recipes[sk.recipes.length - 1];
    for (const bucket of UNCAPPED) {
      const { base, wing, total } = measureBucket(sk.id, top.id, bucket, +1, false);
      if (Math.abs(wing) < 1e-9) continue;
      lines.push(`    ${sk.id.padEnd(14)} ${bucket.padEnd(15)}${f3(base)} ${f3(wing)} ${f3(total)}`);
    }
  }

  /* Who filled the buckets this wing had to stay out of. Named, not asserted. */
  if (ladderRows.length) {
    lines.push("");
    lines.push(`  ${ladderRows.length} bucket/skill pairs are over their cap from OUTSIDE this wing.`);
    const [sid, bkt] = ladderRows[0];
    const sk = DB.skill(sid);
    const g = profile(sid, sk.recipes[sk.recipes.length - 1].id, { ascended: false, wing: false });
    lines.push(`  ${sid} / ${bkt}, itemised:`);
    for (const e of g.mods().breakdown(bkt, [sid, sk.recipes[sk.recipes.length - 1].id])) {
      lines.push(`      ${(e.value > 0 ? "+" : "") + (e.value * 100).toFixed(1)}%  ${e.source}`);
    }
    lines.push("  Not files this wing owns, and not this check's failures — but the reason");
    lines.push("  the wing ships one interval source in total instead of fourteen.");
  }

  CAP_REPORT.push(...lines);
  ok("no wing modifier lands in a bucket that cannot receive it (cap report)",
    capFailures === 0,
    capFailures ? `${capFailures} rows fail` :
      `${CAPPED.length} capped buckets x ${SKILLS.length} skills x 2 profiles: every point delivered`);

  /* ---- the wing's one interval source, sized on purpose ----------------- */
  const ivl = (skillId) => {
    const sk = DB.skill(skillId);
    const top = sk.recipes[sk.recipes.length - 1];
    return measureBucket(skillId, top.id, MOD.intervalPercent, -1, true);
  };
  const agi = ivl("agility");
  ok("Agility's Course Kit is the only intervalPercent this wing ships, and it fits",
    agi.wing > 0 && agi.total <= INTERVAL_REDUCTION_CAP + 1e-9,
    `a bound, mastered Agility sums ${agi.total.toFixed(3)} against a ${INTERVAL_REDUCTION_CAP.toFixed(2)} clamp ` +
    `(${agi.base.toFixed(3)} from the waystations and the Rites, ${agi.wing.toFixed(3)} from the Course Kit)`);
  const others = DB.masterySkills.filter((s) => s.id !== "agility")
    .map((s) => [s.id, ivl(s.id).wing]).filter(([, w]) => Math.abs(w) > 1e-9);
  eq("...and no other skill in the game receives one percent of interval from this wing",
    others.map(([id, w]) => `${id} ${w.toFixed(3)}`).join(", ") || "none", "none");

  /* The `wing` column above is measured by stripping this wing's SHOP SHELF
     and its player-chosen content. A wing skill's own checkpoint and mastery
     ladders land in `base` instead, so they would be excused by the LADDER
     marker — which is the one hole the split leaves. Close it from the data
     side: these three skills may not write the clamped bucket at all. */
  eq("no checkpoint or mastery unlock in this wing writes intervalPercent",
    ["agility", "summoning", "astrology"].flatMap((id) => {
      const sk = DB.skill(id);
      return [...sk.checkpoints, ...sk.masteryUnlocks]
        .filter((u) => (u.mods || []).some(([n]) => n === "intervalPercent"))
        .map((u) => `${id}/${u.name || u.level}`);
    }).join(", ") || "none", "none",
    "the Course Kit stays the wing's one and only percentage of speed");

  /* ...and the same hole from the other end: on this wing's OWN three skills,
     no capped bucket may be over its cap from ANY source, wing or ladder. */
  const ownOver = [];
  for (const id of ["agility", "summoning", "astrology"]) {
    const sk = DB.skill(id);
    const top = sk.recipes[sk.recipes.length - 1];
    for (const { bucket, cap, orient, label } of CAPPED) {
      const { total } = measureBucket(id, top.id, bucket, orient, true);
      if (total > cap + 1e-9) ownOver.push(`${id}/${label} ${total.toFixed(3)} > ${cap}`);
    }
  }
  eq("this wing's own three skills sit under every cap, from every source", ownOver.join(", ") || "none", "none",
    "measured on the ascended profile, which is the worst case in the game");

  /* ---- flat seconds: a DIFFERENT bucket, bounded by the 0.25s floor ----- */
  const flatRows = [];
  for (const id of ["agility", "summoning", "astrology"]) {
    const sk = DB.skill(id);
    const top = sk.recipes[sk.recipes.length - 1];
    const g = profile(id, top.id, { ascended: true, wing: true, bucket: MOD.intervalPercent, orient: -1, scopes: [id, top.id] });
    const m = g.mods(), scopes = [id, top.id];
    const flat = m.sum(MOD.intervalFlat, scopes);
    const base = sk.baseInterval ?? top.interval;
    const pct = m.intervalReduction(scopes);
    const withFlat = ticksToSeconds(intervalTicks(base, pct, flat));
    const without = ticksToSeconds(intervalTicks(base, pct, 0));
    flatRows.push(`${id} ${without.toFixed(2)}s -> ${withFlat.toFixed(2)}s`);
    ok(`${sk.name}'s flat mastery seconds clear the ${MIN_INTERVAL_SECONDS}s floor and are paid in full`,
      flat > 0 && Math.abs((without - withFlat) - flat) < 0.051 && withFlat > MIN_INTERVAL_SECONDS,
      `-${flat.toFixed(1)}s of ${without.toFixed(2)}s`);
  }
  CAP_REPORT.push("", "  FLAT INTERVAL (a separate bucket, floored at 0.25s not clamped at 0.50)",
    "    " + flatRows.join("   ·   "));

  /* ---- HIT_CHANCE_CAP: the wing's accuracy, against the hardest fight --- */
  const hardest = DB.monsters.reduce((a, b) => (b.evasion > a.evasion ? b : a));
  const bare = positioned(DB, { skillId: "attack", profile: "mastered", ascended: true });
  AG.ensureHooks(bare);
  for (const id of WING_SHOP) delete bare.state.purchases[id];
  bare._invalidate();
  const withWing = positioned(DB, { skillId: "attack", profile: "mastered", ascended: true });
  AG.ensureHooks(withWing);
  withWing.state.summoning = { marks: {}, equipped: ["fam-ashcat", "fam-grave-moth"], rng: [1, 2, 3, 4], discovered: 0 };
  const up = {};
  for (const c of CONSTELLATIONS) c.slots.forEach((_, i) => { up[slotKey(c.id, i)] = TIER_VALUES.length - 1; });
  withWing.state.astrology = { upgrades: up };
  withWing._invalidate();
  const h0 = hitChance(bare.combatStats().accuracy, hardest.evasion);
  const h1 = hitChance(withWing.combatStats().accuracy, hardest.evasion);
  ok("the wing's accuracy sources still move hit chance at the hardest fight (HIT_CHANCE_CAP)",
    h1 > h0 && h1 <= HIT_CHANCE_CAP + 1e-9,
    `${hardest.name}: ${(h0 * 100).toFixed(2)}% -> ${(h1 * 100).toFixed(2)}%, cap ${(HIT_CHANCE_CAP * 100).toFixed(0)}%`);
  CAP_REPORT.push("", `  HIT CHANCE   cap ${HIT_CHANCE_CAP.toFixed(2)}   ` +
    `${hardest.name}: ${(h0 * 100).toFixed(2)}% bare -> ${(h1 * 100).toFixed(2)}% with the wing's accuracy pair`);
}

/* =========================================================================
   THE DELIVERY PROOF

   The cap report is arithmetic. This is the same claim measured by running
   the engine for an hour, because arithmetic about a modifier pipeline is
   only worth as much as the pipeline agreeing with it.

   A mastered Mining account is run for an hour with nothing built, and then
   again with the three obstacles that used to sell "-6% / -6% / -8% interval
   in ALL skills" standing in their slots. The old build produced byte-
   identical XP both times while charging 14,000 Cogs an hour in penalties.
   ========================================================================= */

{
  const mine = (course) => {
    const g = positioned(DB, { skillId: "delving", recipeId: "vein-aetherite", profile: "mastered" });
    AG.ensureHooks(g);
    if (course) g.state.agility = { course, blueprints: [], cursor: 0, laps: 0 };
    g._invalidate();
    g.start("delving", "vein-aetherite");
    g.advanceSeconds(3600);
    return {
      xp: Math.round(g.state.skills.delving.xp),
      mastery: Math.round(g.state.skills.delving.mastery["vein-aetherite"]),
      cogs: g.state.cogs,
    };
  };
  const NAMED = ["obs-wind-bridge", "obs-glass-beam", "obs-rift-steps"];
  const slots = new Array(SLOTS.length).fill(null);
  for (const id of NAMED) slots[OBSTACLE_BY_ID.get(id).slot] = id;

  const before = mine(null);
  const after = mine(slots);
  const gain = (r) => r.xp - Math.round(xpAt(99));
  ok("the three re-cut obstacles change a mastered miner's hour (the critic's own experiment)",
    after.xp !== before.xp,
    `an hour of capped Mining pays ${gain(before).toLocaleString()} XP bare and ` +
    `${gain(after).toLocaleString()} XP with them standing ` +
    `(+${((gain(after) / gain(before) - 1) * 100).toFixed(1)}%); the interval build moved it by 0`);

  /* And every one of the twenty-four, so no design is ever inert again.
     An obstacle whose passives are all Agility-scoped cannot move a Mining
     hour and should not be expected to, so each design is stood alone for an
     hour of capped Mining AND an hour of the course it belongs to; a design
     that moves neither is a design the player pays for and never receives. */
  const run = (course) => {
    const g = positioned(DB, { skillId: "agility", recipeId: course.find(Boolean), profile: "mastered" });
    AG.ensureHooks(g);
    g.state.agility = { course, blueprints: [], cursor: 0, laps: 0 };
    g._invalidate();
    AG.startCourse(g);
    g.advanceSeconds(3600);
    return {
      xp: Math.round(g.state.skills.agility.xp),
      mastery: Math.round(Object.values(g.state.skills.agility.mastery).reduce((a, b) => a + b, 0)),
      cogs: g.state.cogs,
    };
  };
  const same = (a, b) => a.xp === b.xp && a.mastery === b.mastery && a.cogs === b.cogs;
  const inert = [];
  for (const o of OBSTACLES) {
    const one = new Array(SLOTS.length).fill(null);
    one[o.slot] = o.id;
    const bareCourse = new Array(SLOTS.length).fill(null);
    bareCourse[o.slot] = o.id;
    /* A one-obstacle course cannot be compared against an empty one — there
       would be nothing to run — so the Agility half compares this design
       against the cheapest design in the same slot, which is the choice the
       player is actually making. */
    const rival = OBSTACLES.find((x) => x.slot === o.slot && x.id !== o.id);
    const alt = new Array(SLOTS.length).fill(null);
    alt[o.slot] = rival.id;
    if (!same(mine(one), before) || !same(run(bareCourse), run(alt))) continue;
    inert.push(o.name);
  }
  eq("no obstacle is inert on a mastered account", inert.join(", ") || "none", "none",
    `${OBSTACLES.length} designs, each measured against capped Mining and against its own slot's rival`);
}

/* =========================================================================
   NAMES AND WIRING
   ========================================================================= */

{
  const ref = parseReference(readFileSync(join(ROOT, "reference/melvor-math.md"), "utf8"));
  const strings = [
    ...OBSTACLES.flatMap((o) => [o.name, o.text]),
    ...FAMILIARS.flatMap((f) => [f.name, f.text]),
    ...SYNERGIES.flatMap((s) => [s.name, s.text]),
    ...CONSTELLATIONS.flatMap((c) => [c.name, c.blurb, ...c.slots.map((s) => s.text)]),
    ...["agility", "summoning", "astrology"].flatMap((id) => {
      const s = DB.skill(id);
      return [s.name, s.blurb, ...s.recipes.map((r) => r.name),
        ...s.checkpoints.flatMap((c) => [c.name, c.text]),
        ...s.masteryUnlocks.map((u) => u.text)];
    }),
  ].join(" • ");
  const hits = scanForbidden(strings, ref.forbidden);
  eq("no forbidden proper noun in anything this wing ships", hits.join(", ") || "none", "none");

  eq("Agility keeps its generic name", DB.skill("agility").name, "Agility");
  eq("Summoning keeps its generic name", DB.skill("summoning").name, "Summoning");
  eq("Astrology keeps its generic name", DB.skill("astrology").name, "Astrology");

  const src = (p) => readFileSync(join(ROOT, p), "utf8");
  ok("registered in src/data/skills/index.js",
    ["AGILITY", "SUMMONING", "ASTROLOGY"].every((n) => src("src/data/skills/index.js").includes(n)));
  ok("registered in src/js/engine/systems/index.js",
    src("src/js/engine/systems/index.js").includes("agility, summoning, astrology"));
  ok("registered in src/js/screens/skill-views/registry.js",
    src("src/js/screens/skill-views/registry.js").includes("[summoning.kind]"));
  ok("shelved in src/data/shop/index.js", src("src/data/shop/index.js").includes("EXOTIC"));
  ok("items registered through src/data/items/index.js",
    src("src/data/items/index.js").includes("./summoning.js"));
  eq("every exotic shop entry is skill-scoped, with no exceptions to remember",
    EXOTIC_SHOP.flatMap((e) => e.mods.filter(([, , sc]) => !DB.skill(sc)).map(([n, , sc]) => `${e.id}:${n}@${sc}`))
      .join(", ") || "none", "none",
    "so the balance sandbox's mastered profile cannot leak this shelf into another skill's measured numbers");
}


/* =========================================================================
   --shots <dir>   THE SCREENSHOT HARNESS

   `node tools/check-exotic.mjs --shots progress/shots/exotic` drives a real
   headless Chrome at 390x844, seeds a mid-game save through the engine's own
   API (no fixtures — the course is BUILT, the marks are FOUND, the
   constellations are ROLLED), walks to each of the three pages and writes a
   full-page PNG.

   It exists because a screenshot of these three screens is only worth
   anything if the state behind it is real, and a fresh save shows three empty
   pages. The same CDP technique as tools/shot.mjs, with one addition: a
   `Runtime.evaluate` between load and capture.

   Requires the dev server: `npm start` (http://localhost:5174).
   ========================================================================= */

/* ---- the seeding script, run inside the page ---------------------------- */

const SEED = `(async () => {
  const E = await import("/src/js/engine/index.js");
  const AG = await import("/src/js/engine/systems/agility.js");
  const SUM = await import("/src/js/engine/systems/summoning.js");
  const AST = await import("/src/js/engine/systems/astrology.js");
  const OB = await import("/src/data/obstacles.js");
  const FA = await import("/src/data/familiars.js");
  const g = window.game, DB = window.DB;
  g.stop();
  for (const s of DB.skills) g.state.skills[s.id].xp = E.xpAt(72);
  g.state.skills.agility.xp = E.xpAt(84);
  g.state.skills.summoning.xp = E.xpAt(78);
  g.state.skills.astrology.xp = E.xpAt(66);
  g.state.cogs = 240e6; g.state.shards = 40000; g.state.clasps = 60;
  for (const o of OB.OBSTACLES) g.state.items[o.material[0]] = 20000;
  for (const r of DB.skill("summoning").recipes) for (const [i] of r.consumes) g.state.items[i] = 20000;
  g.state.items["star-mote"] = 18400; g.state.items["prism-mote"] = 2600;
  g._usedSlots = Object.keys(g.state.items).length;
  g._invalidate(); AG.ensureHooks(g);
  for (const id of ["obs-cinder-steps","obs-rubble-scramble","obs-gap-leap","obs-slag-hurdles","obs-glass-beam","obs-storm-rigging"]) AG.build(g, id);
  AG.saveBlueprint(g, 0, "Mastery Run");
  AG.startCourse(g); g.advanceSeconds(900);
  for (const f of FA.FAMILIARS) {
    if (f.level > 78) continue;
    const st = SUM.sumState(g, true);
    st.marks[f.id] = { level: Math.min(5, 1 + (f.level % 4)), crafted: f.level <= 55 };
  }
  for (const id of ["fam-branchling","fam-emberfly"]) g.state.items[FA.tabletId(id)] = 640;
  g._usedSlots = Object.keys(g.state.items).length;
  SUM.equip(g, "fam-emberfly", 0); SUM.equip(g, "fam-branchling", 1);
  for (const [c,i,n] of [["con-lantern",0,2],["con-lantern",2,1],["con-anvil",0,1],["con-net",1,2],["con-wanderer",2,1]])
    for (let k=0;k<n;k++) AST.upgrade(g, c, i);
  g._invalidate();
  return "seeded";
})()`;

/**
 * The app's scroll container is `#screen`, not the document, so a
 * "full page" capture would otherwise be one viewport tall. Unpin it, and the
 * two fixed bars with it, so the document itself grows to the whole page.
 */
const EXPAND = `(() => {
  const s = document.getElementById("screen");
  s.style.cssText += ";height:auto;max-height:none;overflow:visible";
  const app = document.getElementById("app");
  if (app) app.style.cssText += ";height:auto;min-height:0";
  document.documentElement.style.height = "auto";
  document.body.style.height = "auto";
  for (const sel of [".topbar", ".nav"]) {
    const n = document.querySelector(sel);
    if (n) n.style.position = "static";
  }
  return document.documentElement.scrollHeight;
})()`;

const OPEN = (name, extra = "") => `(() => {
  document.querySelector(".scrim") && document.querySelector(".scrim").remove();
  document.querySelector('.nav__item[data-tab="skills"]').click();
  const rows = [...document.querySelectorAll("#main button.row-card")];
  const hit = rows.find((r) => (r.querySelector(".row-card__title") || {}).textContent.trim().startsWith(${JSON.stringify(name)}));
  if (!hit) return "missing " + ${JSON.stringify(name)};
  hit.click();
  ${extra}
  return "open";
})()`;

/* ---- a minimal CDP client, the same shape tools/shot.mjs uses ------------ */

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { ok: o, no: n } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? n(new Error(msg.error.message)) : o(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  static connect(url) {
    return new Promise((ok, no) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => ok(new CDP(ws)));
      ws.addEventListener("error", () => no(new Error(`cannot reach ${url}`)));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      this.pending.set(id, { ok, no });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method) {
    return new Promise((ok) => {
      const fns = this.listeners.get(method) || [];
      const fn = (p) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((f) => f !== fn)); ok(p); };
      fns.push(fn); this.listeners.set(method, fns);
    });
  }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const { existsSync, readdirSync } = FS;
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(process.env.HOME || "", "Library/Caches/ms-playwright");
  if (existsSync(cache)) {
    for (const d of readdirSync(cache)) {
      for (const rel of ["chrome-mac/Chrome Headless Shell.app/Contents/MacOS/Chrome Headless Shell",
                         "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
                         "chrome-headless-shell-mac-arm64/chrome-headless-shell",
                         "chrome-headless-shell-mac-x64/chrome-headless-shell"]) {
        const p = join(cache, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                   "/Applications/Chromium.app/Contents/MacOS/Chromium"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function captureShots(dir, base = "http://localhost:5174/index.html") {
  const { existsSync, mkdirSync, writeFileSync } = FS;
  const { spawn } = await import("node:child_process");
  const browser = findChrome();
  if (!browser) { console.error("no Chrome found; set CHROME_PATH"); return 1; }
  mkdirSync(dir, { recursive: true });

  const port = 9333 + (process.pid % 400);
  const child = spawn(browser, [
    `--remote-debugging-port=${port}`, "--remote-allow-origins=*", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--mute-audio", "--hide-scrollbars",
    "--force-color-profile=srgb", "--headless=new", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let cdp = null;
  try {
    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
      try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) version = await r.json(); } catch { /* not up */ }
      if (!version) await sleep(100);
    }
    if (!version) throw new Error("browser never opened a DevTools port");
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: base });
    await Promise.race([loaded, sleep(15000)]);
    await sleep(600);
    await cdp.send("Runtime.evaluate", { expression: "localStorage.clear()", returnByValue: true });
    await cdp.send("Runtime.evaluate", { expression: SEED, awaitPromise: true, returnByValue: true });

    const pages = [
      ["agility", "Agility"],
      ["summoning", "Summoning"],
      ["astrology", "Astrology"],
    ];
    const written = [];
    for (const [file, label] of pages) {
      await cdp.send("Runtime.evaluate", { expression: OPEN(label), returnByValue: true });
      await sleep(400);
      await cdp.send("Runtime.evaluate", { expression: EXPAND, returnByValue: true });
      await sleep(200);
      const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 390, height: Math.ceil(cssContentSize.height), scale: 1 },
      });
      const out = join(dir, `exotic-${file}.png`);
      writeFileSync(out, Buffer.from(data, "base64"));
      written.push(out);
    }
    /* One drill-down each, because the list page is only half the screen. */
    await cdp.send("Runtime.evaluate", {
      expression: OPEN("Astrology", `const c=[...document.querySelectorAll("#main button.row-card")].find(r=>r.querySelector(".row-card__title").textContent.trim()==="The Lantern"); c&&c.click();`),
      returnByValue: true,
    });
    await sleep(400);
    await cdp.send("Runtime.evaluate", { expression: EXPAND, returnByValue: true });
    await sleep(200);
    {
      const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 390, height: Math.ceil(cssContentSize.height), scale: 1 },
      });
      const out = join(dir, "exotic-astrology-constellation.png");
      writeFileSync(out, Buffer.from(data, "base64"));
      written.push(out);
    }

    /* The two panels §3g and §3f name by title and that a list page cannot
       show: the passive audit, and the synergy table. Both are sheets, so
       they are captured at the viewport rather than full-page. */
    for (const [file, label, open] of [
      ["agility-passives", "Agility", `document.getElementById("agPassives").click();`],
      ["summoning-synergies", "Summoning",
        `[...document.querySelectorAll("#main button")].find(b=>b.textContent.trim()==="Synergies")?.click();
         [...document.querySelectorAll("#main .sect")].find(n=>n.textContent.startsWith("Synergies"))?.scrollIntoView();`],
    ]) {
      await cdp.send("Runtime.evaluate", { expression: OPEN(label), returnByValue: true });
      await sleep(400);
      await cdp.send("Runtime.evaluate", { expression: `(()=>{${open} return "ok"})()`, returnByValue: true });
      await sleep(400);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      const out = join(dir, `exotic-${file}.png`);
      writeFileSync(out, Buffer.from(data, "base64"));
      written.push(out);
    }
    for (const w of written) console.log("  wrote " + w);
    return 0;
  } catch (e) {
    console.error("screenshot capture failed: " + e.message);
    return 1;
  } finally {
    cdp && cdp.close();
    child.kill();
  }
}

/* ---- report ------------------------------------------------------------- */

const failed = results.filter((r) => !r.pass);
const capsOnly = process.argv.includes("--caps");

if (!capsOnly) {
  for (const r of results) {
    console.log(`${r.pass ? "  ok  " : " FAIL "} ${r.name}${r.detail ? `  \u2014  ${r.detail}` : ""}`);
  }
}

/* The cap report always prints. It is the one part of this tool that is a
   REPORT rather than an assertion: the assertion above says every modifier is
   delivered, and these are the numbers that claim is made of. */
console.log("\n  ======  MODIFIER CAP REPORT  ======");
for (const line of CAP_REPORT) console.log(line);

if (!capsOnly) console.log(`\n${results.length - failed.length}/${results.length} exotic-wing checks passed`);

const shotIdx = capsOnly ? -1 : process.argv.indexOf("--shots");
let shotCode = 0;
if (shotIdx >= 0) {
  const dir = process.argv[shotIdx + 1] || "progress/shots/exotic";
  console.log(`\ncapturing screenshots into ${dir} ...`);
  shotCode = await captureShots(join(ROOT, dir).startsWith("/") && dir.startsWith("/") ? dir : join(ROOT, dir));
}
process.exit(failed.length || shotCode ? 1 : 0);
