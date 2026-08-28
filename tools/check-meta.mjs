#!/usr/bin/env node
/* =========================================================================
   check-meta.mjs — does the meta layer still match the parity bar?

   The engine has a selftest that holds the systems core to
   reference/melvor-math.md. This is the same discipline one layer up: it
   holds the SCREENS to reference/melvor-parity.md, by parsing the clauses out
   of that document and checking that the code which claims to implement them
   actually ships the strings, the controls and the numbers it names.

   It checks five things a screenshot cannot:

     1. THE CONTRACTS. Every screen in the registry has the shape
        screens/registry.js documents; every skill-view has the shape
        skill-views/registry.js documents; every nav button resolves.

     2. THE PARITY CLAUSES. §2's header labels, §3a's row format, §3k's three
        bank controls and its empty state, §3l's category and quantity
        controls, §3m's five axes and three filters, §3n's seven named
        statistics — each one is a literal string in the parity doc, and each
        one has to appear in the file that owns that screen.

     3. THE NUMBERS. Per-skill mastery pool caps really are 500,000 x recipe
        count, checkpoints really fire at 10/25/50/95% of the BASE cap, and
        the clasp curve really starts cheap and climbs monotonically.

     4. THE NAMING POLICY. §9 of melvor-math.md is parsed the same way the
        engine selftest parses it, and every player-visible string in the meta
        screens is scanned against it.

     5. THE NUMBERS ON SCREEN, AGAINST THE TICK LOOP THAT PAYS THEM.
        This is the part that matters, and it is the part a string test cannot
        do. Asserting that the characters "Toggle Sell Mode" appear in bank.js
        proves nothing about whether the price next to the button is the price
        the sale pays; asserting that gather.js interpolates `secs(...)` proves
        nothing about whether those seconds are the seconds an action takes.
        So section 6 BOOTS A GAME PER ROW, RUNS THE REAL TICK LOOP FOR A DAY
        OF GAME TIME, and fails the build if what the screen would render is
        more than 5% away from what the engine actually paid out. Section 7
        does the same to the Bank's sell price, to the Shop's quantity
        selector, and to the Completion and Statistics totals.

        A screen number that has never been compared against the loop is a
        number that is wrong; it just has not been caught yet.

   Usage:  node tools/check-meta.mjs
   Exit 0 if everything passes, 1 otherwise.
   ========================================================================= */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

let pass = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? `  ${detail}` : ""}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`); }
}
const section = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

/* Sections are isolated. This tool runs while three other people are editing
   the engine and the content database, and a throw from THEIR half-written
   module must not stop it reporting on the screens. Each block says what it
   could not run and the suite carries on. */
async function block(title, fn) {
  section(title);
  try { await fn(); }
  catch (e) { check(`${title.split(".")[0]}: ran to completion`, false, String(e.message).split("\n")[0]); }
}

/* =========================================================================
   0. THE ENGINE SELFTEST — the non-negotiable
   ========================================================================= */

let E = null, DB = null;
await block("0. Engine selftest", async () => {
  E = await import("../src/js/engine/index.js");
  DB = E.DB;
  const r = E.runSelftest(DB, read("reference/melvor-math.md"));
  const res = r.results || r.tests || [];
  const bad = res.filter((x) => !(x.pass ?? x.ok ?? true));
  check(`selftest ${res.length - bad.length}/${res.length}`, bad.length === 0,
    bad.slice(0, 3).map((x) => x.name).join("; "));
});

/* =========================================================================
   1. THE CONTRACTS
   ========================================================================= */

section("1. Screen and view contracts");

/* Both registries are shared joins: any screen or view module can break them
   for everybody. Import defensively and name the module that failed, rather
   than dying with a stack trace that points at this file. */
async function tryImport(path) {
  try { return await import(path); }
  catch (e) {
    check(`${path.split("/").pop()} imports cleanly`, false, String(e.message).split("\n")[0]);
    return null;
  }
}
const screens = await tryImport("../src/js/screens/registry.js");
const views = await tryImport("../src/js/screens/skill-views/registry.js");

for (const s of screens?.SCREENS || []) {
  check(`screen "${s.id}" has id, label and render`,
    typeof s.id === "string" && typeof s.label === "string" && typeof s.render === "function");
}
for (const [kind, v] of Object.entries(views?.VIEWS || {})) {
  check(`skill-view "${kind}" has kind and render`,
    v.kind === kind && typeof v.render === "function");
}
if (views) check("viewFor() never returns undefined", !!views.viewFor("a-kind-nobody-has-written"));

if (screens) {
  const html = read("index.html");
  const tabs = [...html.matchAll(/data-tab="([a-z-]+)"/g)].map((m) => m[1]);
  const ids = screens.screenIds();
  check("every nav button resolves to a registered screen",
    tabs.every((t) => ids.includes(t)), tabs.join(", "));
  /* §1's OTHER block shares one tab on a five-slot bar; those two are
     registered without a button on purpose (see screens/registry.js). */
  const unrouted = ids.filter((i) => !tabs.includes(i));
  check("only the OTHER-block screens are registered without a nav button",
    unrouted.every((i) => ["completion", "stats"].includes(i)), unrouted.join(", ") || "none");
}

/* =========================================================================
   2. THE PARITY CLAUSES
   ========================================================================= */

section("2. Parity clauses (reference/melvor-parity.md)");
const parity = read("reference/melvor-parity.md");
const SRC = {
  skills: read("src/js/screens/skills.js"),
  gather: read("src/js/screens/skill-views/gather.js"),
  mastery: read("src/js/screens/mastery.js"),
  bank: read("src/js/screens/bank.js"),
  shop: read("src/js/screens/shop.js"),
  stats: read("src/js/screens/stats.js"),
  completion: read("src/js/screens/completion.js"),
  settings: read("src/js/screens/settings.js"),
  ui: read("src/js/screens/ui.js"),
  catalogue: read("src/data/shop/core.js"),
};
const ALL = Object.values(SRC).join("\n");

/** A clause must be quoted in the parity doc AND shipped in the code. */
function clause(sectionName, text, source) {
  const inDoc = parity.includes(text);
  const inCode = (source ?? ALL).includes(text);
  check(`${sectionName}: "${text}"`, inDoc && inCode,
    inDoc ? (inCode ? "" : "MISSING FROM CODE") : "not quoted in the parity doc");
}

clause("§2 header", "Last Cloud Save", SRC.skills);
clause("§2 header", "Force Save", SRC.skills + SRC.settings);
clause("§2 header", "Skill Level", SRC.skills);
clause("§2 header", "Skill XP", SRC.skills);
clause("§2 header", "View Checkpoints", SRC.skills);
clause("§2 header", "Spend Mastery Pool XP", SRC.skills);
clause("§2 header", "Game Guide", SRC.skills);

clause("§3a gathering", "Skill XP", SRC.gather);
check(`§3a gathering: "10 Skill XP / 1.8 seconds" row format`,
  /Skill XP \/ \$\{secs\(/.test(SRC.gather), "XP and effective interval in one line");
check("§3a gathering: per-row mastery level and mastery XP",
  SRC.gather.includes("Mastery ${ml}") && SRC.gather.includes("xpPair("));
check("§3a gathering: Current Tool indicator",
  SRC.gather.includes("Current ${esc(t.noun)}") && SRC.gather.includes("toolState"));
check("§3a gathering: live action-status line",
  SRC.gather.includes("actions will display here"));

clause("§3k bank", "Sort", SRC.bank);
clause("§3k bank", "Move items to new Tab", SRC.bank);
clause("§3k bank", "Toggle Sell Mode", SRC.bank);
clause("§3k bank", "No item selected.", SRC.bank);
check("§3k bank: Space / Bank / Tab readouts",
  ['"Space"', '"Bank"', '"Tab"'].every((s) => SRC.bank.includes(s)));
check("§3k bank: multiple tabs", SRC.bank.includes("tabCount") && SRC.bank.includes("bankTabs"));

clause("§3l shop", "Select Shop Category", SRC.shop);
clause("§3l shop", "Buy x1", SRC.catalogue);
check("§3l shop: real categories with names", /SHOP_CATEGORIES\s*=\s*\[/.test(SRC.catalogue));

clause("§3m completion", "True Completion", SRC.completion);
clause("§3m completion", "Total Items Found", SRC.completion);
clause("§3m completion", "Show All", SRC.completion);
for (const axis of ["Skills", "Mastery", "Items", "Monsters"]) {
  check(`§3m completion: "${axis}" axis`, SRC.completion.includes(`["${axis}"`));
}
check(`§3m completion: the fifth axis (Pets -> Wardens)`, SRC.completion.includes(`["Wardens"`));
check("§3m completion: Discovered / Undiscovered filters",
  SRC.completion.includes('"Discovered"') && SRC.completion.includes('"Undiscovered"'));

clause("§3n statistics", "Select Stats Category", SRC.stats);
for (const stat of ["Total Skill Level", "Total XP", "Total Mastery Level",
                    "Total Mastery XP", "Total Items Sold", "Account Age"]) {
  check(`§3n statistics: "${stat}"`, SRC.stats.includes(stat));
}
check(`§3n statistics: "Total GP Gained" as our own currency`,
  SRC.stats.includes("Total Cogs Gained"), "Cogs, not GP — §9 naming");
check("§3n statistics: two-column STATISTIC / # table",
  SRC.stats.includes(">Statistic<") && SRC.stats.includes(">#<"));

const ids = screens ? screens.screenIds() : [];
check("§4 missing screens: Settings exists", ids.includes("settings"));
check("§4 missing screens: Completion Log exists", ids.includes("completion"));
check("§4 missing screens: Statistics exists", ids.includes("stats"));
check("§4 missing screens: mastery checkpoint UI exists",
  SRC.mastery.includes("checkpointSheet") && SRC.mastery.includes("spendSheet"));

/* =========================================================================
   3. THE NUMBERS
   ========================================================================= */

await block("3. Mastery pool caps and checkpoints (math §2.2, §2.3)", () => {
  let ok = true, sample = [];
  for (const s of DB.masterySkills) {
    const base = E.poolCapBase(s.recipes.length);
    if (base !== 500_000 * s.recipes.length) ok = false;
    sample.push(`${s.name} ${s.recipes.length}->${(base / 1e6).toFixed(2)}M`);
  }
  check("every pool cap is 500,000 x recipe count", ok, sample.join(" · "));

  const wc = DB.masterySkills.find((s) => s.name === "Woodcutting");
  if (wc) {
    check("Woodcutting's cap matches the reference's 4.5M",
      E.poolCapBase(wc.recipes.length) === 4_500_000, `${wc.recipes.length} recipes`);
  }

  const t = E.checkpointThresholds(10);
  check("checkpoints fire at 10 / 25 / 50 / 95% of the BASE cap",
    JSON.stringify(t) === JSON.stringify([500_000, 1_250_000, 2_500_000, 4_750_000]), t.join(", "));

  const g = new E.Game(DB);
  const skill = DB.masterySkills[0];
  g.state.skills[skill.id].pool = E.poolCapBase(skill.recipes.length) * 0.5;
  const before = g.checkpointsFor(skill.id).filter(Boolean).length;
  g.state.skills[skill.id].pool -= 1;
  const after = g.checkpointsFor(skill.id).filter(Boolean).length;
  check("checkpoints are LIVE thresholds, not latched unlocks", before === 3 && after === 2,
    `${before} -> ${after} after spending one XP`);

  /* Raising the cap must not move a threshold — the whole point of a codex. */
  const g2 = new E.Game(DB);
  g2.grant("codex-1");
  check("a raised cap does not move the checkpoint thresholds",
    g2.poolCapFor(skill.id) > E.poolCapBase(skill.recipes.length) &&
    E.checkpointThresholds(skill.recipes.length)[0] === E.poolCapBase(skill.recipes.length) * 0.1);
});

await block("4. Shop catalogue and the clasp curve (math §6.1)", async () => {
  const cat = await import("../src/data/shop/core.js");
  const shelves = cat.shelvesFor(DB.shop);
  const orphans = DB.shop.filter((e) => !shelves.some((c) => c.id === cat.shelfOf(e)));
  check("every shop row lands on exactly one shelf", orphans.length === 0,
    orphans.slice(0, 3).map((e) => e.id).join(", ") || `${shelves.length} shelves`);
  check("the buy-quantity selector offers x1 and All",
    cat.BUY_QUANTITIES[0][0] === "1" && cat.BUY_QUANTITIES.at(-1)[0] === "all",
    cat.BUY_QUANTITIES.map(([, t]) => t).join(" "));

  const first = DB.claspCost(0);
  check("the first reliquary clasp is affordable in the first two minutes",
    first > 0 && first < 100, `${first} Cogs`);
  let monotonic = true;
  for (let n = 1; n < 118; n++) if (DB.claspCost(n) <= DB.claspCost(n - 1)) monotonic = false;
  check("the clasp curve is strictly increasing across all 118", monotonic,
    `cost(117) = ${DB.claspCost(117).toLocaleString("en-US")}`);

  const g = new E.Game(DB);
  g.state.cogs = 1_000_000;
  const v = cat.VIRTUAL_ENTRIES[0];
  const n = cat.affordableCount(g, v, "all");
  check("'All' walks the curve, re-pricing every step", n > 20 && n < 118, `${n} clasps for 1M Cogs`);
});

/* =========================================================================
   6. §3a — THE GATHERING ROW, AGAINST THE TICK LOOP

   The bug this section exists to prevent, in full, because it was shipped:

     gather.js printed `actionIntervalTicks(...)` as the row's seconds. That
     is ONE SWING of the pick. Delving's entire ladder is carried by node hit
     points and respawn (math §4.3 — "depth comes from rock HP + respawn, not
     interval"), so every Mining rung printed "3.00s" and an xp/s up to twelve
     times what the engine paid. Warden's Tear Pocket claimed 21.33 xp/s and
     delivered 1.68. The screen ranked the WORST rung in the game as the best
     one to train on, and every string assertion in section 2 passed.

   So: for every row the gathering view draws, boot a Game positioned at that
   rung, run the real loop for a day of game time, and compare the xp/s the
   row would render against the xp/s the loop actually paid.

   WHY MASTERY IS FROZEN FOR THE MEASUREMENT. The row is a statement about the
   state it was rendered in: "at this mastery level, an action takes this
   long". Mastery rising mid-run changes node HP, respawn and interval, so an
   unfrozen 24 h run measures a moving target and could only ever be compared
   against a time-weighted average of a hundred different predictions. The
   freeze is the experimental control, not a way to dodge the question — and
   the last check in the section proves it hides nothing by running one rung
   UNFROZEN and requiring the measured rate to sit between the prediction at
   the start and the prediction at the end.

   WHY 24 HOURS AND NOT 30 MINUTES. A node rung is a cycle, not a metronome:
   Warden's Tear Pocket at mastery 99 runs 170 swings and then stands empty
   for 255 seconds, a 765-second period. Half an hour is 2.3 of those, so
   whichever fraction of a cycle the window happens to start and end on is
   worth ~20% of the answer all by itself — a 30-minute window would fail a
   PERFECT prediction. A one-hour burn-in puts the run in the steady phase and
   24 hours makes the partial cycle at each end worth well under 1%.
   ========================================================================= */

const SIM_BURN_IN_HOURS = 1;    // reach the steady deplete/respawn phase
const SIM_HOURS = 24;           // long enough that one partial cycle is noise
const TOLERANCE = 0.05;

await block("6. §3a gathering rows vs. the tick loop", async () => {
  const gatherMod = await import("../src/js/screens/skill-views/gather.js");
  const gather = gatherMod.default;

  /* The skills whose rows this view draws: everything the registry maps to
     it, plus the route skills skill-views/agility.js hands straight back
     (it keeps only Agility itself). */
  const drawn = DB.skills.filter((s) => (s.recipes || []).length &&
    (views.viewFor(s.kind) === gather || (s.kind === "route" && s.id !== "agility")));
  check("the gathering view draws at least Mining, Woodcutting and Fishing",
    ["delving", "boughcraft", "trawling"].every((id) => drawn.some((s) => s.id === id)),
    drawn.map((s) => s.name).join(", "));

  /** Measure one rung with the real loop. `freeze` holds mastery still. */
  function measured(skillId, recipeId, profile, freeze = true) {
    const g = E.positioned(DB, { skillId, recipeId, profile });
    if (freeze) g._grantMastery = () => {};
    const predict = () => gatherMod.rates(g, skillId, DB.recipe(recipeId));
    const before = predict();
    if (!before) return null;
    g.start(skillId, recipeId);
    g.advanceSeconds(SIM_BURN_IN_HOURS * 3600);
    const x0 = g.skillXp(skillId), a0 = g.state.stats.actions;
    g.advanceSeconds(SIM_HOURS * 3600);
    const seconds = SIM_HOURS * 3600;
    return {
      before,
      after: predict(),
      xpPerSecond: (g.skillXp(skillId) - x0) / seconds,
      secondsPerAction: seconds / Math.max(1, g.state.stats.actions - a0),
      stopped: g.state.stoppedReason,
    };
  }

  const worst = { err: 0, name: "" };
  let rows = 0, bad = [];
  for (const skill of drawn) {
    for (const profile of ["fresh", "mastered"]) {
      const ranked = [];
      for (const r of skill.recipes) {
        const m = measured(skill.id, r.id, profile);
        if (!m) { bad.push(`${r.name}: rates() went null`); continue; }
        rows++;
        const err = Math.abs(m.before.xpPerSecond / m.xpPerSecond - 1);
        if (err > worst.err) { worst.err = err; worst.name = `${r.name} (${profile})`; }
        if (err > TOLERANCE) {
          bad.push(`${skill.name}/${r.name} ${profile}: row says ${m.before.xpPerSecond.toFixed(2)} xp/s ` +
            `at ${m.before.seconds.toFixed(2)}s, loop paid ${m.xpPerSecond.toFixed(2)} ` +
            `at ${m.secondsPerAction.toFixed(2)}s (${(err * 100).toFixed(0)}% out)`);
        }
        ranked.push([r.name, m.before.xpPerSecond, m.xpPerSecond]);
      }
      /* The second half of the original failure: even if every row were only
         a little wrong, a screen that ranks the ladder wrongly sends the
         player to train on the worst rung in the skill. */
      if (ranked.length > 1) {
        const byRow = [...ranked].sort((a, b) => b[1] - a[1])[0][0];
        const byLoop = [...ranked].sort((a, b) => b[2] - a[2])[0][0];
        check(`${skill.name} (${profile}): the row's best rung is the loop's best rung`,
          byRow === byLoop, `row says ${byRow}, loop says ${byLoop}`);
      }
    }
  }
  check(`every gathering row's xp/s is within ${TOLERANCE * 100}% of ${SIM_HOURS} h of the real loop`,
    bad.length === 0, bad.length ? bad.slice(0, 4).join(" | ")
      : `${rows} rows, worst ${(worst.err * 100).toFixed(2)}% on ${worst.name}`);

  /* Larceny's actions are resolved by a tick system that can spend one of
     them stunned, so its clock is not "one interval, then paid". The row must
     print the XP alone rather than invent a rate. */
  const stun = DB.skill("larceny");
  if (stun) {
    const g = E.positioned(DB, { skillId: "larceny", recipeId: stun.recipes[0].id, profile: "fresh" });
    check("a system-resolved skill gets no fabricated rate",
      gatherMod.rates(g, "larceny", stun.recipes[0]) === null &&
      gatherMod.actionSeconds(g, "larceny", stun.recipes[0]) === null);
  }

  /* The freeze hides nothing: unfrozen, the truth must sit between the
     prediction at the start of the run and the prediction at the end. */
  const un = measured("delving", "vein-wardens-tear", "fresh", false);
  const lo = Math.min(un.before.xpPerSecond, un.after.xpPerSecond) * (1 - TOLERANCE);
  const hi = Math.max(un.before.xpPerSecond, un.after.xpPerSecond) * (1 + TOLERANCE);
  check("unfrozen, the measured rate is bracketed by the row before and after",
    un.xpPerSecond >= lo && un.xpPerSecond <= hi,
    `${un.before.xpPerSecond.toFixed(2)} -> ${un.after.xpPerSecond.toFixed(2)} bracket, measured ${un.xpPerSecond.toFixed(2)}`);

  /* And the specific regression, named, so it can never come back quietly:
     a node rung's action must take longer than one swing of the pick. */
  const g = E.positioned(DB, { skillId: "delving", recipeId: "vein-wardens-tear", profile: "fresh" });
  const rt = gatherMod.rates(g, "delving", DB.recipe("vein-wardens-tear"));
  check("a node rung's action time is not its swing interval",
    rt.seconds > rt.swingSeconds * 2,
    `${rt.swingSeconds.toFixed(2)}s swing, ${rt.nodeHp} node HP, ` +
    `${rt.respawnSeconds.toFixed(0)}s respawn -> ${rt.seconds.toFixed(2)}s per ore`);
});

/* =========================================================================
   7. §3k / §3l / §3m / §3n — THE OTHER SCREENS, AGAINST THE ENGINE
   ========================================================================= */

await block("7. Bank, Shop, Completion and Statistics vs. the engine", async () => {
  const bank = await import("../src/js/screens/bank.js");
  const cat = await import("../src/data/shop/core.js");
  const comp = await import("../src/js/screens/completion.js");
  const statsMod = await import("../src/js/screens/stats.js");

  /* --- §3k: the price on the cell is the money in your pocket ---------- */
  const g = E.positioned(DB, { skillId: "delving", recipeId: "vein-cinder-shale", profile: "mastered" });
  const sellable = [...DB.items.values()].filter((i) => i.value > 0).slice(0, 40);
  let mismatched = [];
  for (const it of sellable) {
    g.state.items[it.id] = 10;
    const shown = bank.unitPrice(g, it.id);          // what the grid cell prints
    const cogs0 = g.state.cogs;
    g.sell(it.id, 3);
    const paid = g.state.cogs - cogs0;
    if (paid !== shown * 3) mismatched.push(`${it.name}: printed ${shown} x3, paid ${paid}`);
  }
  check("§3k: every price the bank prints is the price the sale pays",
    mismatched.length === 0, mismatched.slice(0, 3).join(" | ") || `${sellable.length} items`);

  /* A sale-value checkpoint is §2.3's economy slot. It has to move the number
     on the cell the moment the pool crosses the threshold, and stop moving it
     the moment the pool drops back — checkpoints are live, not latched. */
  let checked = 0, dead = [];
  for (const skill of DB.masterySkills) {
    const i = (skill.checkpoints || []).findIndex((c) =>
      (c.mods || []).some(([n, , sym]) => n === "saleValue" && sym === "skill"));
    if (i < 0) continue;
    const cp = skill.checkpoints[i];
    const rate = cp.mods.find(([n]) => n === "saleValue")[1];
    /* The dearest thing the skill makes AND OWNS. Two constraints, both
       load-bearing: on a one-Cog log a +50% floors straight back to one Cog
       and the test could not tell live from dead, and `Game.producedBy` maps
       an item to exactly ONE source — a monster drop overwrites a recipe — so
       a skill-scoped sale modifier never reaches an item the engine credits
       to somebody else. Testing on one of those would be testing the wrong
       claim. (Transmutation's dearest output is a monster drop, which is why
       its -12% Transmutewise penalty cannot touch it.) */
    const owner = new E.Game(DB).producedBy;
    const item = skill.recipes.map((r) => r.produces)
      .filter((id) => id && DB.items.has(id) && owner.get(id) === skill.id)
      .sort((a, b) => DB.item(b).value - DB.item(a).value)[0];
    if (!item || DB.item(item).value * Math.abs(rate) < 1) continue;

    const gg = new E.Game(DB);
    const off = bank.unitPrice(gg, item);
    gg.state.skills[skill.id].pool = E.checkpointThresholds(skill.recipes.length)[i];
    gg._invalidate();                       // a pool that moves is mods that moved
    const on = bank.unitPrice(gg, item);
    const want = Math.floor(DB.item(item).value * (1 + rate));
    checked++;
    /* Direction follows the sign: §7.4 ships SIGNED checkpoints, and
       Transmutation's capstone deliberately pays +6% XP everywhere for -12%
       on its own sales. A test that demanded the price go up would forbid the
       most interesting modifier in the game. */
    const moved = rate > 0 ? on > off : on < off;
    if (on !== want || !moved) dead.push(`${skill.name}: ${off} -> ${on}, expected ${want}`);
  }
  check("§3k: every sale-value checkpoint moves the bank price the instant it goes live",
    dead.length === 0 && checked > 0, dead.slice(0, 3).join(" | ") || `${checked} checkpoints, signs included`);

  /* --- §3l: "Buy x25" and "All" really walk the §6.1 curve ------------- */
  const gs = new E.Game(DB);
  gs.state.cogs = 250_000;
  const clasp = cat.VIRTUAL_ENTRIES.find((v) => v.id === "reliquary-clasp");
  const want = cat.affordableCount(gs, clasp, "all");
  const cogs0 = gs.state.cogs;
  for (let i = 0; i < want; i++) gs.buyClasp();
  check("§3l: 'All' buys exactly what the selector promised, at curve prices",
    gs.state.clasps === want && cogs0 - gs.state.cogs === DB.claspCumulative(want) &&
    gs.state.cogs < DB.claspCost(want),
    `${want} clasps for ${(cogs0 - gs.state.cogs).toLocaleString("en-US")} Cogs, ` +
    `${gs.state.cogs.toLocaleString("en-US")} left (next costs ${DB.claspCost(want).toLocaleString("en-US")})`);
  check("§3l: the quantity selector never over-promises",
    cat.affordableCount(new E.Game(DB), clasp, "all") === 0, "a broke adept can afford none");

  /* --- §3l: the printed price IS the Cogs the button spends -------------
     The row used to print `entry.cost` — the price of ONE — beside a button
     reading "Buy x25", and the tap then walked twenty-five rungs of a
     climbing curve. Measured live: the Reliquary Clasp row printed 27 Cogs
     and the tap took 35,814; Reliquary Wing printed 100,000,000 and "Buy x10"
     took 1,000,000,000.

     Nothing in the previous seven checks could catch that, because they all
     verify the BUY LOOP against the curve and the buy loop was always right.
     The lie was in the string. So this asserts the string: for every shop row
     and every quantity in the selector, the figure totalCost() hands the
     renderer must equal the Cogs the buy loop actually removes from the
     purse. One function feeds both, and this is what proves it still does.  */
  {
    const rows = [
      ...cat.VIRTUAL_ENTRIES.map((v) => [v.name, v, (g) => v.buy(g)]),
      ...DB.shop.filter((e) => e.repeatable > 1).map((e) => [e.name, e, (g) => g.buy(e.id)]),
    ];
    const wrong = [];
    let pairs = 0;
    for (const [name, entry, buy] of rows) {
      for (const [q] of cat.BUY_QUANTITIES) {
        /* A fresh, rich, fully-unlocked adept for every pair, so one row's
           purchases cannot move the next row's price. */
        const g = new E.Game(DB);
        g.state.cogs = 5e12;
        for (const s of DB.skills) g.state.skills[s.id].xp = E.xpAt(99);
        for (const e2 of DB.shop) if (e2.id !== entry.id) g.state.purchases[e2.id] = e2.repeatable || 1;
        g.state.seals = 1e6;
        for (const it of DB.items.values()) g.state.items[it.id] = 1e6;
        g._invalidate();

        const owned = entry.owned ? entry.owned(g) : (g.state.purchases[entry.id] || 0);
        const max = entry.repeatable === true || !entry.repeatable ? Infinity : entry.repeatable;
        const n = q === "all"
          ? (entry.owned ? cat.affordableCount(g, entry, "all") : max - owned)
          : Math.min(Number(q), max - owned, entry.owned ? cat.affordableCount(g, entry, q) : Number(q));
        if (n < 1) continue;

        const printed = cat.totalCost(g, entry, n);
        const before = g.state.cogs;
        let bought = 0;
        for (let i = 0; i < n; i++) { if (buy(g)) break; bought++; }
        const spent = before - g.state.cogs;
        pairs++;
        if (bought !== n || spent !== printed) {
          wrong.push(`${name} x${q}: row says ${printed.toLocaleString("en-US")}, loop spent ${spent.toLocaleString("en-US")}${bought !== n ? ` (bought ${bought}/${n})` : ""}`);
        }
      }
    }
    check("§3l: the price a row prints is the Cogs its own Buy button spends",
      wrong.length === 0 && pairs > 0,
      wrong.slice(0, 3).join(" | ") || `${pairs} row/quantity pairs, curve walked`);
  }

  /* --- §3m: True Completion is a real average of five real axes -------- */
  const fresh = comp.completion(new E.Game(DB));
  check("§3m: a new save reads under 2% — one level in each skill and nothing else", fresh.truth < 0.02,
    fresh.axes.map(([n, f]) => `${n} ${(f * 100).toFixed(1)}%`).join(" · "));
  const full = new E.Game(DB);
  for (const s of DB.skills) full.state.skills[s.id].xp = E.xpAt(99);
  for (const s of DB.masterySkills) for (const r of s.recipes) full.state.skills[s.id].mastery[r.id] = E.xpAt(99);
  for (const w of DB.ascension) full.state.purchases[w.id] = 1;
  for (const it of DB.items.values()) full.state.items[it.id] = 1;
  full._invalidate();
  const maxed = comp.completion(full);
  const bySkill = maxed.axes.find((a) => a[0] === "Skills")[1];
  const byMastery = maxed.axes.find((a) => a[0] === "Mastery")[1];
  check("§3m: capping every skill and every mastery reads 100% on those two axes",
    Math.abs(bySkill - 1) < 1e-9 && Math.abs(byMastery - 1) < 1e-9,
    `Skills ${(bySkill * 100).toFixed(2)}% · Mastery ${(byMastery * 100).toFixed(2)}%`);
  check("§3m: True Completion is the mean of the five axes",
    Math.abs(maxed.truth - maxed.axes.reduce((n, a) => n + a[1], 0) / 5) < 1e-12);

  /* --- §3n: the seven named statistics carry live engine numbers ------- */
  const rows = new Map(statsMod.statRows(full, "general").map((r) => [r[0], r[1]]));
  let level = 0, xp = 0;
  for (const s of DB.skills) { level += full.skillLevel(s.id); xp += full.skillXp(s.id); }
  let mLvl = 0;
  for (const s of DB.masterySkills) mLvl += full.totalMastery(s.id);
  const named = ["Total Skill Level", "Total XP", "Total Mastery Level", "Total Mastery XP",
                 "Total Cogs Gained", "Total Items Sold", "Account Age"];
  check("§3n: all seven named statistics are on the General table",
    named.every((n) => rows.has(n)), named.filter((n) => !rows.has(n)).join(", ") || "");
  check("§3n: Total Skill Level and Total XP equal an independent engine read",
    rows.get("Total Skill Level") === level.toLocaleString("en-US") &&
    rows.get("Total XP") === Math.floor(xp).toLocaleString("en-US"),
    `${rows.get("Total Skill Level")} levels · ${rows.get("Total XP")} XP`);
  check("§3n: Total Mastery Level equals the sum of every recipe's mastery",
    rows.get("Total Mastery Level") === mLvl.toLocaleString("en-US"),
    `${rows.get("Total Mastery Level")} of ${(DB.masterySkills.reduce((n, s) => n + s.recipes.length, 0) * 99).toLocaleString("en-US")}`);
});

/* =========================================================================
   8. THE NAMING POLICY
   ========================================================================= */

await block("8. Naming policy (math §9)", () => {
  const ref = E.parseReference(read("reference/melvor-math.md"));
  /* Only player-visible text: quoted strings and template literals, not the
     identifiers and comments around them. Comments in these files quote the
     reference on purpose and must not be scanned. */
  const strings = [...ALL.matchAll(/"([^"\\\n]{2,})"|'([^'\\\n]{2,})'|>([^<>{}\n]{3,})</g)]
    .map((m) => m[1] || m[2] || m[3]).join(" • ");
  const hits = E.scanForbidden(strings, ref.forbidden);
  check("no forbidden proper noun in any meta-screen string", hits.length === 0,
    hits.join(", ") || `${ref.forbidden.length} banned words checked`);
  check("...and the scanner is live", E.scanForbidden("a Mithril bar", ref.forbidden).length === 1);
});

/* =========================================================================
   DONE
   ========================================================================= */

console.log(`\n${failures.length ? "FAILED" : "OK"}  ${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
