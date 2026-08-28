/* =========================================================================
   EMBERVEIL — SCREEN: STATISTICS   (parity §3n)

       Select Stats Category  ->  a two-column STATISTIC / # table
       Total Skill Level · Total XP · Total Mastery Level · Total Mastery XP ·
       Total GP Gained · Total Items Sold · Account Age

   Every row is read, not stored. The engine keeps eleven lifetime counters on
   `state.stats` and everything else here is derived from the save at the
   moment the screen renders, which is the only way a statistics screen can be
   trusted: a cached total is a total that can be wrong.

   THE TWO COUNTERS THE ENGINE DOES NOT KEEP
   -----------------------------------------
   "Total Items Sold" and its unit count are not simulation facts — selling is
   something the player does through this UI, not something the tick loop
   does — so the bank screen counts them into the UI slice of the save as it
   sells. Account Age is stamped the first time a save reads its UI slice.
   ========================================================================= */

import { DB, TICK_MS, SKILL_CAP, MASTERY_CAP } from "../engine/index.js";
import { el, esc, num, int, dur, age, pct2, line, selector, prefs } from "./ui.js";
import { completion } from "./completion.js";

/* -------------------------------------------------------------------------
   THE CATEGORIES
   ------------------------------------------------------------------------- */

const CATEGORIES = [
  ["general", "General"],
  ["skills", "Skills"],
  ["mastery", "Mastery"],
  ["combat", "Combat"],
  ["economy", "Economy"],
  ["reliquary", "Reliquary"],
];

/** Total sale value of everything held, at today's modifiers. */
function bankValue(game) {
  let v = 0;
  for (const [id, n] of Object.entries(game.state.items)) if (n > 0) v += game.salePrice(id) * n;
  return v;
}

function totals(game) {
  let level = 0, xp = 0;
  for (const s of DB.skills) { level += game.skillLevel(s.id); xp += game.skillXp(s.id); }
  let mastery = 0, masteryXp = 0, pool = 0, poolCap = 0;
  for (const s of DB.masterySkills) {
    mastery += game.totalMastery(s.id);
    for (const r of s.recipes) masteryXp += game.masteryXp(s.id, r.id);
    pool += game.state.skills[s.id].pool;
    poolCap += game.poolCapFor(s.id);
  }
  return { level, xp, mastery, masteryXp, pool, poolCap };
}

/* -------------------------------------------------------------------------
   THE TABLES
   ------------------------------------------------------------------------- */

/**
 * The rows of one category, as `[label, value, liveId?]`.
 *
 * Exported because a table is only as good as its numbers, and a number that
 * has never been compared against an independent read of the engine is a
 * number nobody has checked. tools/check-meta.mjs §7 asks for the General
 * category and re-derives Total Skill Level, Total XP and Total Mastery Level
 * from the save itself, so a total that quietly stops summing every skill is
 * a build failure rather than a screenshot nobody looked at closely.
 */
export function statRows(game, cat) {
  return rowsFor(game, cat);
}

function rowsFor(game, cat) {
  const s = game.state, st = s.stats, p = prefs(game);
  const t = totals(game);
  const played = (s.tick * TICK_MS) / 1000;

  if (cat === "general") {
    const c = completion(game);
    return [
      ["Account Age", age(Date.now() - p.createdAt), "statAge"],
      ["Time Played", dur(played), "statPlayed"],
      ["Total Skill Level", int(t.level)],
      ["Total XP", int(t.xp)],
      ["Total Mastery Level", int(t.mastery)],
      ["Total Mastery XP", int(t.masteryXp)],
      ["Total Cogs Gained", int(st.cogsEarned)],
      ["Total Items Sold", int(p.itemsSold)],
      ["Actions Completed", int(st.actions)],
      ["True Completion", pct2(c.truth)],
    ];
  }

  if (cat === "skills") {
    const rows = DB.skills.map((k) => [
      k.name,
      `${game.skillLevel(k.id)} — ${num(Math.floor(game.skillXp(k.id)))} xp`,
    ]);
    rows.push(["Total Skill Level", `${int(t.level)} / ${int(DB.skills.length * SKILL_CAP)}`]);
    rows.push(["Total XP", int(t.xp)]);
    return rows;
  }

  if (cat === "mastery") {
    const rows = DB.masterySkills.map((k) => [
      k.name,
      `${int(game.totalMastery(k.id))} / ${int(k.recipes.length * MASTERY_CAP)}`,
    ]);
    rows.push(["Total Mastery Level", int(t.mastery)]);
    rows.push(["Total Mastery XP", int(t.masteryXp)]);
    rows.push(["Pool XP Held", int(t.pool)]);
    rows.push(["Pool XP Capacity", int(t.poolCap)]);
    rows.push(["Pool XP Destroyed by Overflow", int(st.poolWasted)]);
    return rows;
  }

  if (cat === "combat") {
    const relic = [...DB.relics].reverse().find((r) => s.purchases[r.id]);
    return [
      ["Monsters Slain", int(st.kills)],
      ["Deaths", int(st.deaths)],
      ["Damage Dealt", int(st.damageDealt)],
      ["Damage Taken", int(st.damageTaken)],
      ["Provisions Eaten", int(st.provisionsEaten)],
      ["Maximum HP", int(game.maxHp())],
      ["Vitality Level", `${game.skillLevel("vitality")} / ${game.levelCap}`],
      /* §1 prints one derived "Combat Level 96" over the eight combat
         skills, not the level of whichever one your style trains. */
      ["Combat Level", int(game.combatLevel())],
      ["Attack Style", game.attackStyle().name],
      ["Current Relic", relic ? relic.name : "None — bare hands"],
      ["Warden Seals", int(s.seals)],
      ["Offline Combat", s.offlineCombat ? "Enabled" : "Disabled"],
    ];
  }

  if (cat === "economy") {
    return [
      ["Cogs Held", int(s.cogs)],
      ["Total Cogs Gained", int(st.cogsEarned)],
      ["Total Cogs Spent", int(st.cogsSpent)],
      ["Net Cogs", int(st.cogsEarned - st.cogsSpent)],
      ["Total Items Sold", int(p.itemsSold)],
      ["Individual Items Sold", int(p.unitsSold)],
      ["Aether Shards", int(s.shards)],
      ["Reliquary Value", int(bankValue(game))],
      ["Shop Purchases", int(Object.values(s.purchases).reduce((n, v) => n + v, 0))],
      ["Waystations Built", `${s.waystations.length} / ${DB.waystationSlots}`],
    ];
  }

  /* reliquary */
  const used = Object.keys(s.items).filter((i) => s.items[i] > 0).length;
  return [
    ["Space Used", `${used} / ${game.reliquarySlots()}`],
    ["Clasps Bought", int(s.clasps)],
    ["Spent on Clasps", int(DB.claspCumulative(s.clasps))],
    ["Next Clasp Costs", int(DB.claspCost(s.clasps))],
    ["Wings Owned", int(s.purchases["reliquary-wing"] || 0)],
    ["Reliquary Value", int(bankValue(game))],
    ["Items Lost (reliquary full)", int(st.itemsLost)],
    ["Distinct Items Discovered", `${int(Object.keys(p.found).length)} / ${int(DB.items.size)}`],
  ];
}

/* -------------------------------------------------------------------------
   THE SCREEN
   ------------------------------------------------------------------------- */

function render(ctx) {
  const { game, render: rerender } = ctx;
  const p = prefs(game);
  if (!CATEGORIES.some(([id]) => id === p.statsCat)) p.statsCat = "general";

  const pick = selector("Select Stats Category", CATEGORIES, p.statsCat,
    (v) => { p.statsCat = v; rerender(); });

  const rows = rowsFor(game, p.statsCat);
  const table = el(`<section class="panel panel--tight">
    <div class="stat-line" style="border-bottom:1px solid var(--c-groove)">
      <span style="letter-spacing:var(--ls-label);text-transform:uppercase">Statistic</span>
      <b style="color:var(--c-text-2)">#</b></div>
    ${rows.map(([k, v, id]) => id
      ? `<div class="stat-line"><span>${esc(k)}</span><b id="${id}">${esc(v)}</b></div>`
      : line(k, v)).join("")}
  </section>`);

  return [pick, table];
}

/** The two clocks on the General table must actually run. */
function paint(ctx) {
  const p = prefs(ctx.game);
  const set = (id, v) => { const n = document.getElementById(id); if (n && n.textContent !== v) n.textContent = v; };
  set("statAge", age(Date.now() - p.createdAt));
  set("statPlayed", dur((ctx.game.state.tick * TICK_MS) / 1000));
}

export default { id: "stats", label: "Statistics", render, paint };
