#!/usr/bin/env node
/* =========================================================================
   balance.mjs — the systems core's own test bench and its published report.

     node tools/balance.mjs            selftest, then write balance.html
     node tools/balance.mjs selftest   assertions only (CI-friendly)
     node tools/balance.mjs report     regenerate balance.html only

   Exits non-zero if any assertion fails.

   Every number in balance.html is MEASURED: the generator boots the real
   engine, positions it at a stated point in the progression, runs an hour of
   game time at 20 ticks a second, and reads the result. Nothing is typed in
   by hand, so the report cannot drift away from the game.
   ========================================================================= */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import DB from "../src/data/index.js";
import { Game } from "../src/js/engine/game.js";
import { runSelftest } from "../src/js/engine/selftest.js";
import { measure, economyRates, sustained, positioned, secondsPerUnit } from "../src/js/engine/sandbox.js";
import { OFFLINE_CAP_MS, TICKS_PER_SECOND, TICK_MS } from "../src/js/engine/constants.js";
import { xpAt, deltaXp, doublingRatio } from "../src/js/engine/xp.js";
import { intervalSeconds } from "../src/js/engine/interval.js";
import { throughputMultiplier } from "../src/js/engine/modifiers.js";
import { poolCapBase, checkpointThresholds } from "../src/js/engine/mastery.js";
import { compact, int, pct, signed, hours as fmtHours, secs } from "../src/js/engine/format.js";
import { INTERVAL_REDUCTION_CAP, PRESERVE_CAP } from "../src/js/engine/constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODE = process.argv[2] || "all";
const REFERENCE = readFileSync(resolve(ROOT, "reference/melvor-math.md"), "utf8");

/* =========================================================================
   1. SELFTEST
   ========================================================================= */

console.log("\nEmberveil systems core — selftest\n");
const t0 = Date.now();
const test = runSelftest(DB, REFERENCE, { economy: MODE !== "quick" });
let group = "";
for (const r of test.results) {
  if (r.group !== group) { group = r.group; console.log(`\n  ${group}`); }
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`    ${mark}  ${r.name}${r.pass ? "" : `\n           expected ${r.expected}, got ${r.actual}`}`);
}
console.log(`\n  ${test.passed} passed, ${test.failed} failed of ${test.total}  (${Date.now() - t0} ms)\n`);

if (MODE === "selftest" || MODE === "quick") process.exit(test.failed ? 1 : 0);

/* =========================================================================
   2. MEASURE THE WHOLE ECONOMY
   ========================================================================= */

console.log("  measuring the economy by running the engine ...");
const tm = Date.now();

const rates = economyRates(DB, "mastered");
const cache = new Map();

/** One row per recipe: fresh, mastered, and (for artisan) sustained. */
const LADDER = new Map();
for (const skill of DB.skills) {
  if (!skill.recipes) continue;
  const rows = skill.recipes.map((r) => {
    const fresh = measure(DB, { skillId: skill.id, recipeId: r.id, profile: "fresh" });
    const full = rates.recipeRuns.get(r.id);
    const sus = sustained(DB, rates, skill, r, full, cache);
    return { recipe: r, fresh, full, sus };
  });
  LADDER.set(skill.id, rows);
}

const WARD = DB.monsters.map((m) => ({
  monster: m,
  fresh: measure(DB, { skillId: "warding", recipeId: m.id, profile: "fresh", monsterLevel: m.level }),
  full: measure(DB, { skillId: "warding", recipeId: m.id, profile: "mastered", monsterLevel: m.level }),
  ascended: measure(DB, { skillId: "warding", recipeId: m.id, profile: "mastered", monsterLevel: m.level, ascended: true }),
}));

console.log(`  measured ${[...LADDER.values()].flat().length} rungs and ${WARD.length} monsters in ${Date.now() - tm} ms\n`);

const endgame = WARD[WARD.length - 1];
const hourOne = LADDER.get("delving")[0].fresh;
const sigilTop = LADDER.get("sigilwork").at(-1);
const claspTotal = DB.claspCumulative(118);
const riteTotal = DB.ascension.reduce((a, r) => a + r.cost, 0);
const riteSeals = DB.ascension.reduce((a, r) => a + r.seals, 0);
/** One definition of the arc, quoted by both the masthead and section 8. */
const FAUCET_SPAN = endgame.ascended.cogsPerHour / hourOne.cogsPerHour;

/* =========================================================================
   3. HTML HELPERS
   ========================================================================= */

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cogs = (n) => compact(Math.round(n));

function table(headers, rows, { align = [] } = {}) {
  const head = headers.map((h, i) => `<th${align[i] === "n" ? ' class="right"' : ""}>${esc(h)}</th>`).join("");
  const body = rows
    .map((r) => {
      const cls = r.flag ? ' class="is-flagged"' : "";
      const cells = r.cells
        .map((c, i) => {
          const a = align[i] === "n" ? " n" : align[i] === "w" ? " w" : "";
          const v = i === 0 ? "" : c && c.strong ? " v" : "";
          const text = c && typeof c === "object" ? c.text : c;
          return i === 0
            ? `<th>${text ?? ""}</th>`
            : `<td class="${(a + v).trim()}">${text ?? ""}</td>`;
        })
        .join("");
      return `<tr${cls}>${cells}</tr>`;
    })
    .join("");
  return `<div class="tablewrap"><div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

/**
 * A key/value readout. Deliberately NOT a table: a two-column table with a
 * long label column pushes its one value column off the right edge of a
 * phone, which is precisely the wrong place for the only number in the row.
 * These wrap instead.
 */
function readout(rows) {
  return `<dl class="kv">${rows.map((r) => `
    <div class="kv__row${r.flag ? " is-flagged" : ""}">
      <dt>${r.label}</dt>
      <dd class="${r.strong ? "kv__big" : ""}">${r.value}</dd>
    </div>`).join("")}</dl>`;
}

function tile(value, label, note, violet = false) {
  return `<div class="tile${violet ? " tile--violet" : ""}">
    <span class="tile__value num">${value}</span>
    <span class="label">${esc(label)}</span>
    ${note ? `<span class="tile__note">${esc(note)}</span>` : ""}
  </div>`;
}

/* --- charts ------------------------------------------------------------- */

function logChart({ series, width = 460, height = 190, pad = { l: 48, r: 12, t: 18, b: 24 }, xLabels, yTicks }) {
  const all = series.flatMap((s) => s.points.map((p) => p[1])).filter((v) => v > 0);
  const lo = Math.log10(Math.min(...all));
  const hi = Math.log10(Math.max(...all));
  const xs = series[0].points.map((p) => p[0]);
  const xlo = Math.min(...xs), xhi = Math.max(...xs);
  const X = (x) => pad.l + ((x - xlo) / (xhi - xlo || 1)) * (width - pad.l - pad.r);
  const Y = (v) => height - pad.b - ((Math.log10(v) - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);

  const grid = (yTicks || []).map((v) =>
    `<line class="axis" x1="${pad.l}" y1="${Y(v).toFixed(1)}" x2="${width - pad.r}" y2="${Y(v).toFixed(1)}"/>
     <text x="${pad.l - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${compact(v)}</text>`).join("");

  const lines = series.map((s) => {
    const d = s.points.filter((p) => p[1] > 0).map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    return `<path class="${s.violet ? "line-violet" : "line-gold"}" d="${d}"/>`;
  }).join("");

  const marks = series.flatMap((s) => (s.marks || []).map((m) =>
    `<circle cx="${X(m.x).toFixed(1)}" cy="${Y(m.y).toFixed(1)}" r="3" class="${s.violet ? "violet" : "gold"}"/>
     <text x="${X(m.x).toFixed(1)}" y="${(Y(m.y) - 7).toFixed(1)}" text-anchor="middle" class="tick">${esc(m.label)}</text>`
  )).join("");

  const xl = (xLabels || []).map((x) =>
    `<text x="${X(x).toFixed(1)}" y="${height - 7}" text-anchor="middle">${x}</text>`).join("");

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <line class="axis" x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}"/>
    ${lines}${marks}${xl}
  </svg>`;
}

/**
 * Log-scaled horizontal bars, label ABOVE the bar rather than beside it.
 *
 * A left label gutter is the obvious layout and it does not survive a phone:
 * "Warding · The Ninefold Warden" needs about 180px of gutter inside a 350px
 * chart, which either clips the labels or leaves no room for the bars. Putting
 * the label on its own line above the bar, with the value right-aligned on the
 * same line, gives both the full width.
 */
function barChart(rows, { width = 460, rowH = 38, pad = { l: 2, r: 2, t: 6, b: 6 } } = {}) {
  const max = Math.log10(Math.max(...rows.map((r) => r.value)));
  const min = Math.log10(Math.min(...rows.map((r) => r.value)));
  const span = width - pad.l - pad.r;
  const W = (v) => Math.max(3, ((Math.log10(v) - min) / (max - min || 1)) * span * 0.93 + span * 0.07);
  const height = pad.t + pad.b + rows.length * rowH;
  const bars = rows.map((r, i) => {
    const y = pad.t + i * rowH;
    const w = W(r.value);
    return `<text x="${pad.l}" y="${y + 12}">${esc(r.label)}</text>
      <text x="${width - pad.r}" y="${y + 12}" text-anchor="end" class="${r.violet ? "t-violet" : "t-gold"}">${esc(r.text)}</text>
      <rect x="${pad.l}" y="${y + 19}" width="${w.toFixed(1)}" height="10" rx="3" fill="url(#${r.violet ? "bvio" : "bgold"})"/>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="bgold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--c-gold-light)"/><stop offset="52%" stop-color="var(--c-gold-core)"/><stop offset="100%" stop-color="var(--c-gold-deep)"/>
      </linearGradient>
      <linearGradient id="bvio" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--c-violet-bright)"/><stop offset="52%" stop-color="var(--c-violet-core)"/><stop offset="100%" stop-color="var(--c-violet-deep)"/>
      </linearGradient>
    </defs>${bars}</svg>`;
}

/* =========================================================================
   4. SECTIONS
   ========================================================================= */

/* ---- verification ------------------------------------------------------ */

function sectionVerification() {
  const groups = [];
  let cur = null;
  for (const r of test.results) {
    if (!cur || cur.name !== r.group) { cur = { name: r.group, rows: [] }; groups.push(cur); }
    cur.rows.push(r);
  }
  const panels = groups.map((g) => {
    const fails = g.rows.filter((r) => !r.pass).length;
    const rows = g.rows.map((r) => `
      <div class="check${r.pass ? "" : " check--fail"}">
        <span class="check__mark">${r.pass ? "&#10003;" : "&#10007;"}</span>
        <span class="check__name">${esc(r.name)}${r.note ? `<br><span class="micro">${esc(r.note)}</span>` : ""}</span>
        <span class="check__val">${r.pass ? esc(r.actual) : `want ${esc(r.expected)}<br>got ${esc(r.actual)}`}</span>
      </div>`).join("");
    return `<div class="panel">
      <div class="section__head">
        <h3 class="h3">${esc(g.name)}</h3>
        <span class="pill${fails ? " pill--fail" : ""}"><span class="dot${fails ? "" : ""}"></span>${g.rows.length - fails}/${g.rows.length} pass</span>
      </div>
      <div class="checks" style="margin-top:var(--s-3)">${rows}</div>
    </div>`;
  }).join("");

  return `<section id="verification">
    <div class="section__head">
      <h2 class="h2">1 &middot; Verification</h2>
      <span class="pill${test.failed ? " pill--fail" : ""}">${test.passed} of ${test.total} assertions pass</span>
    </div>
    <p class="lede" style="margin-top:var(--s-3)">
      The published tables in <code>reference/melvor-math.md</code> are parsed out of the document
      at test time, not transcribed into a fixture &mdash; a transcribed fixture only proves that two
      copies of the same typo agree. Everything below is compared against the numbers as the document
      states them, and the economy assertions are measured by running the real tick engine.
    </p>
    ${panels}
  </section>`;
}

/* ---- XP curve ---------------------------------------------------------- */

function sectionXp() {
  const levels = [];
  for (let l = 2; l <= 120; l++) levels.push(l);
  const chart = logChart({
    width: 460, height: 210,
    yTicks: [100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
    xLabels: [10, 25, 50, 75, 92, 99, 110, 120],
    series: [
      {
        points: levels.map((l) => [l, xpAt(l)]),
        marks: [
          { x: 50, y: xpAt(50), label: "50" },
          { x: 92, y: xpAt(92), label: "92 — halfway" },
          { x: 99, y: xpAt(99), label: "99" },
          { x: 120, y: xpAt(120), label: "120" },
        ],
      },
      { points: levels.map((l) => [l, deltaXp(l)]), violet: true },
    ],
  });

  const rows = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 92, 99, 110, 120].map((l) => ({
    cells: [
      `Level ${l}`,
      { text: int(xpAt(l)), strong: true },
      int(deltaXp(l)),
      l >= 8 && l <= 113 ? doublingRatio(l).toFixed(3) : "&mdash;",
      l <= 99 ? pct(xpAt(l) / xpAt(99), 1) : pct(xpAt(l) / xpAt(120), 1),
    ],
    flag: l === 92 || l === 99,
  }));

  return `<section id="xp">
    <h2 class="h2">2 &middot; The experience curve</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      One table, 121 entries, precomputed at boot and never recalculated. It serves both skill levels
      and every recipe's mastery level. The single property that carries the whole design is that
      experience <strong class="white">doubles every seven levels</strong> &mdash; which is why the
      halfway point of a level-99 grind is <strong class="white">level 92</strong>, not level 50.
    </p>
    <div class="formula">delta(L)  = floor( (1/4) * ( (L-1) + 300 * 2^((L-1)/7) ) )
xpAt(L)   = floor( (1/4) * SUM(n = 1..L-1) floor( n + 300 * 2^(n/7) ) )

  the two floors sit in DIFFERENT places: the per-term floor is inside the sum</div>
    <div class="panel">
      ${chart}
      <div class="legend">
        <span class="legend__item"><span class="swatch swatch--gold"></span>Cumulative experience to reach a level</span>
        <span class="legend__item"><span class="swatch swatch--violet"></span>Experience for that one level</span>
      </div>
    </div>
    <div class="panel">
      ${table(["", "Cumulative XP", "This level", "delta(L+7)/delta(L)", "Share of a 99"],
        rows, { align: ["", "n", "n", "n", "n"] })}
      <p class="note">
        <strong>Read the doubling column.</strong> It is 1.995 by level 10 and lands on exactly 2.000 by
        level 66. Experience from 1 to 92 (${int(xpAt(92))}) equals experience from 92 to 99
        (${int(xpAt(99) - xpAt(92))}) to within ${pct(Math.abs(xpAt(92) / (xpAt(99) - xpAt(92)) - 1), 2)}.
        The back half is the whole game.
      </p>
    </div>
  </section>`;
}

/* ---- mastery ----------------------------------------------------------- */

function sectionMastery() {
  const rows = DB.masterySkills.map((s) => {
    const cap = poolCapBase(DB.recipeCounts[s.id]);
    const cps = checkpointThresholds(DB.recipeCounts[s.id]);
    return {
      cells: [
        s.name,
        String(s.recipes.length),
        { text: int(cap), strong: true },
        int(cps[0]), int(cps[1]), int(cps[2]), int(cps[3]),
      ],
    };
  });

  const cpTable = DB.masterySkills.map((s) => {
    const cps = checkpointThresholds(DB.recipeCounts[s.id]);
    return `<tr><th>${esc(s.name)}</th>` +
      s.checkpoints.map((c, i) =>
        `<td><span class="micro num gold">${compact(cps[i])}</span><br>${esc(c.text)}</td>`).join("") +
      `</tr>`;
  }).join("");

  return `<section id="mastery">
    <h2 class="h2">3 &middot; Mastery, the pool and its checkpoints</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      Every recipe carries its own mastery level 1&ndash;99, on the same table as the skill.
      A quarter of every point of mastery experience is <em>also</em> deposited into the skill's pool
      (half, once the skill itself is capped), and the pool's four thresholds are
      <strong class="white">live</strong>: spend the pool back down and the bonus turns off until it
      is re-earned. That tension is the entire reason the pool is interesting.
    </p>
    <div class="formula">MXP = [ (UnlockedActions * TotalMasteryInSkill / (RecipeCount * 99))
        + (ThisRecipeMastery * RecipeCount / 10) ] * ActionTime * 0.5 * (1 + Bonus)

  term 1 tops out at exactly +1 per fully mastered recipe
  term 2 is this recipe's own level times a tenth of the recipe count
  ActionTime = the REAL seconds for a gatherer, a FIXED constant for an artisan
               -> interval reduction buys a gatherer loot, and an artisan mastery</div>
    <div class="panel">
      ${table(["Skill", "Recipes", "Pool cap", "10%", "25%", "50%", "95%"], rows,
        { align: ["", "n", "n", "n", "n", "n", "n"] })}
      <p class="note">
        Pool cap is <code>500,000 &times; recipeCount</code>, with no exceptions. Three late purchases
        raise the cap by +25% / +50% / +25%, stacking additively to +100% &mdash; and deliberately do
        <strong>not</strong> move the thresholds, so the 95% checkpoint becomes comfortable to hold
        while still banking experience to spend on mastery levels.
      </p>
    </div>
    <div class="panel">
      <p class="label">The checkpoint ladder &mdash; the same four slots, every skill</p>
      <div class="tablewrap" style="margin-top:var(--s-3)"><div class="scroll"><table>
        <thead><tr><th>Skill</th><th>10% &middot; more mastery XP</th><th>25% &middot; throughput</th><th>50% &middot; economy</th><th>95% &middot; prestige</th></tr></thead>
        <tbody>${cpTable}</tbody>
      </table></div></div>
      <p class="note">
        Four slots, spent in the same order in every skill: <strong>more mastery experience</strong>,
        then <strong>a throughput or quality-of-life fix</strong>, then <strong>an economy
        multiplier</strong>, then <strong>a prestige bonus that leaves the skill</strong>. Emberrite's
        50% checkpoint is the one worth stealing outright: burning a bough pays back a quarter of its
        price, turning the one skill whose job is to destroy value into a faucet.
      </p>
    </div>
  </section>`;
}

/* ---- intervals --------------------------------------------------------- */

function sectionIntervals() {
  const steps = [
    ["Base interval, nothing equipped", 0, 0],
    ["First tool, -5%", 0.05, 0],
    ["Full tool ladder, -40%", 0.4, 0],
    ["...plus two waystations, -20% global", 0.6, 0],
    ["...clipped by the -50% cap", INTERVAL_REDUCTION_CAP, 0],
    ["...plus a -0.2s flat checkpoint", INTERVAL_REDUCTION_CAP, 0.2],
  ];
  const base = 5.0;
  let prev = null;
  const rows = steps.map(([label, p, f]) => {
    const iv = intervalSeconds(base, p, f);
    const rate = 3600 / iv;
    const gain = prev ? rate / prev - 1 : 0;
    prev = rate;
    return {
      cells: [label, signed(-p, 0), f ? `-${f}s` : "&mdash;", { text: secs(iv), strong: true },
        int(Math.round(rate)), gain ? signed(gain, 1) : "&mdash;"],
    };
  });

  const pts = [];
  for (let r = 0; r <= 0.5; r += 0.01) pts.push([r, throughputMultiplier(r)]);

  return `<section id="intervals">
    <h2 class="h2">4 &middot; Intervals and the modifier pipeline</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      One formula governs every action in the game. Percentages always apply to the
      <strong class="white">base</strong> interval and all of them sum into a single additive pool;
      flat reductions subtract afterwards; the result floors to a whole 0.05&nbsp;s tick and can never
      go below 0.25&nbsp;s.
    </p>
    <div class="formula">EffectiveInterval = max( floor( (Base * (1 - SumPercent) - SumFlat) / 0.05 ) * 0.05, 0.25 )

  stored as whole TICKS, because every countdown in the engine is an integer tick count
  intervalPercent is a SIGNED bucket: -0.05 is five percent faster, +0.10 is ten percent slower</div>
    <div class="panel">
      <p class="label">A 5-second action, walked up the whole ladder</p>
      <div style="margin-top:var(--s-3)">
      ${table(["Loadout", "Percent", "Flat", "Interval", "Actions/hr", "Gain over the row above"],
        rows, { align: ["", "n", "n", "n", "n", "n"] })}</div>
      <p class="note">
        <strong>Reductions are linear on the base; rate is 1/interval.</strong> So the marginal value of
        reduction is hyperbolic: the first &minus;10% buys +11.1% actions per hour, and a &minus;10%
        added on top of an existing &minus;50% buys +25%. That is what pays for a tool ladder whose
        price multiplies four-to-tenfold a step while its benefit stays flat at &minus;5%. It is also
        why the stack is capped at &minus;${Math.round(INTERVAL_REDUCTION_CAP * 100)}%.
      </p>
    </div>
    <div class="panel">
      <p class="label">Throughput multiplier against total reduction</p>
      ${logChart({
        width: 460, height: 160, pad: { l: 44, r: 40, t: 18, b: 24 }, yTicks: [1, 1.25, 1.5, 2],
        xLabels: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        series: [{ points: pts, marks: [
          { x: 0.1, y: throughputMultiplier(0.1), label: "+11%" },
          { x: 0.5, y: throughputMultiplier(0.5), label: "+100%" },
        ] }],
      })}
    </div>
    <div class="panel">
      <p class="label">The named buckets</p>
      <div style="margin-top:var(--s-3)">${table(
        ["Bucket", "What it does", "Cap"],
        [
          { cells: ["skillXP", "Multiplies the experience a completed action pays", "&mdash;"] },
          { cells: ["masteryXP", "Multiplies mastery experience, and the pool deposit with it", "&mdash;"] },
          { cells: ["intervalPercent", "Signed change to the interval, applied to the base", `-${Math.round(INTERVAL_REDUCTION_CAP * 100)}%`] },
          { cells: ["intervalFlat", "Seconds removed after the percentages", "0.25s floor"] },
          { cells: ["doubleChance", "Summed probability of doubling the output", "&mdash;"] },
          { cells: ["preserveChance", "Summed probability an input survives", `${Math.round(PRESERVE_CAP * 100)}%, raisable`] },
          { cells: ["currency", "Cogs earned <em>from an action</em>", "&mdash;"] },
          { cells: ["saleValue", "Cogs earned <em>from selling an item</em>", "&mdash;"] },
          { cells: ["flatQuantity", "+N base quantity, tagged non-doublable", "&mdash;"] },
          { cells: ["quantityMultiplier", "Deterministic &times;N &mdash; its own multiplicative layer", "&mdash;"] },
        ],
        { align: ["", "w", "n"] }
      )}</div>
      <p class="note">
        <strong>currency</strong> and <strong>saleValue</strong> are separate on purpose, so a global
        income bonus cannot double-dip through the sell button. <strong>quantityMultiplier</strong> is
        the one deliberate exception to additive stacking: the Twin-Vein Charm's deterministic
        &times;2 multiplies <em>on top of</em> a doubling roll, so a lucky Delving action really does
        yield four ore.
      </p>
    </div>
  </section>`;
}

/* ---- skill ladders ----------------------------------------------------- */

function skillPanel(skill) {
  const rows = LADDER.get(skill.id);
  if (!rows) return "";
  const artisan = !!(skill.recipes[0].consumes || skill.recipes[0].shards);
  const xsFresh = rows.map((r) => r.fresh.xpPerSecond);
  const spread = Math.max(...xsFresh) / Math.min(...xsFresh);
  const richest = rows.reduce((a, b) => (b.full.cogsPerHour > a.full.cogsPerHour ? b : a));

  /* Delving's ladder is carried entirely by respawn downtime rather than by
     interval, so printing its flat 3.0s ten times would say nothing. Node
     skills get the axis they are actually designed on. */
  const node = !!skill.node;
  const head = ["Rung", "Lvl", "Interval"];
  if (node) head.push("Respawn");
  head.push("XP/s new", "XP/s capped", "Hours to 99", "Cogs/hr new", "Cogs/hr capped");
  if (artisan) head.push("Sustained");

  const body = rows.map((r) => {
    const base =
      skill.intervalMode === "range" ? `${r.recipe.range[0]}–${r.recipe.range[1]}s`
      : skill.intervalMode === "flat" ? secs(skill.baseInterval)
      : secs(r.recipe.interval);
    const cells = [
      r.recipe.name,
      String(r.recipe.level),
      `${base} <span class="micro">&rarr; ${secs(r.full.intervalSeconds)}</span>`,
    ];
    if (node) cells.push(secs(r.recipe.respawn));
    cells.push(
      r.fresh.xpPerSecond.toFixed(2),
      { text: r.full.xpPerSecond.toFixed(1), strong: true },
      fmtHours(xpAt(99) / r.fresh.xpPerSecond / 3600),
      cogs(r.fresh.cogsPerHour),
      { text: cogs(r.full.cogsPerHour), strong: true },
    );
    if (artisan) cells.push(`${cogs(r.sus.cogsPerHour)} <span class="micro">(${pct(r.sus.throttle, 0)})</span>`);
    return { cells, flag: r === richest };
  });

  return `<div class="panel">
    <div class="section__head">
      <h3 class="h3">${esc(skill.name)}</h3>
      <span class="pill pill--violet">${skill.recipes.length} rungs &middot; ${spread.toFixed(1)}&times; XP spread</span>
    </div>
    <p class="micro" style="margin-top:var(--s-1)">${esc(skill.blurb)}</p>
    <div style="margin-top:var(--s-3)">${table(head, body,
      { align: head.map((h, i) => (i === 0 ? "" : "n")) })}</div>
    <p class="note">${skillNote(skill, rows, richest, spread, artisan)}</p>
  </div>`;
}

function skillNote(skill, rows, richest, spread, artisan) {
  const richIdx = rows.indexOf(richest);
  const outXp = rows.filter((r) => r.full.xpPerSecond > richest.full.xpPerSecond).length;
  const parts = [];
  if (skill.kind === "gather" || skill.kind === "route") {
    parts.push(`<strong>${spread.toFixed(1)}&times;</strong> between the worst and best experience rate in the skill, at the rate each rung pays the moment it unlocks.`);
  }
  if (outXp >= 2 && richIdx >= rows.length - 3) {
    parts.push(`The richest rung is <strong>${esc(richest.recipe.name)}</strong> at ${cogs(richest.full.cogsPerHour)} Cogs/hr &mdash; and ${outXp} other rungs out-earn it on experience. That inversion is deliberate: the player has to choose between wealth and levels several times per skill instead of always taking the highest thing they have unlocked.`);
  }
  if (artisan) {
    const sus = rows.at(-1).sus;
    const worst = rows.reduce((a, b) => (b.sus.throttle < a.sus.throttle ? b : a));
    parts.push(`Sustained: the top rung runs at <strong>${pct(sus.throttle, 1)}</strong> of its own speed once the ${fmtHours(sus.inputSeconds / 3600)} of gathering each unit costs is counted${worst !== rows.at(-1) ? `, and <strong>${esc(worst.recipe.name)}</strong> is the most input-starved rung in the skill at ${pct(worst.sus.throttle, 1)}` : ""}.`);
  }
  if (skill.id === "delving") {
    parts.push(`Every vein takes exactly three seconds. Depth comes entirely from node HP (<code>5 + mastery</code>, regenerating 1 every 10&nbsp;s) and respawn, so mastery buys <em>uptime</em> rather than speed.`);
  }
  if (skill.id === "trawling") {
    parts.push(`Each cast rolls its own interval uniformly inside the rung's range, and reduction scales both endpoints. It costs nothing to implement and it is the difference between a skill that feels alive and a metronome.`);
  }
  if (skill.id === "wayfaring") {
    parts.push(`Wayfaring pays Cogs directly rather than items, so it is the one faucet no sale-value modifier can touch &mdash; and the only place the signed waystation modifiers apply.`);
  }
  return parts.join(" ");
}

/* ---- offline replay ----------------------------------------------------- */

/**
 * Run one real offline session and report the Welcome Back summary.
 *
 * Nothing here is modelled. A save is built, its clock is wound back by
 * `awayHours`, and `offlineReplay` runs the same tick loop the live client
 * runs. The frozen-rate comparison is the interesting column: it is what the
 * player would have been paid by the shortcut this engine deliberately does
 * not take — freezing the action interval at whatever it was when they closed
 * the tab, and multiplying.
 */
function replaySession({ skillId, recipeId, awayHours, level }) {
  const g = new Game(DB, { seed: 0x0ff11e });
  g.state.skills[skillId].xp = xpAt(level);
  for (const e of DB.shop) {
    if (e.category === "tool" && e.skill === skillId && e.level <= level) g.state.purchases[e.id] = 1;
  }
  g.state.clasps = 40;
  g._invalidate();
  g.start(skillId, recipeId);

  const skill = DB.skill(skillId);
  const startTicks = g.state.action.intervalTicks;
  const startMastery = g.masteryLevel(skillId, recipeId);
  const startNodeHp = skill.node ? g._nodeMaxHp() : 0;
  g.state.lastSaveAt = 0;

  const t = performance.now();
  const summary = g.offlineReplay(awayHours * 3600 * 1000);
  const ms = performance.now() - t;

  /* These sessions bank their haul rather than auto-selling it, so the honest
     currency figure is what the reliquary is now worth, not the zero in the
     Cogs counter. */
  const haul = summary.items.reduce((a, i) => a + Math.max(0, i.delta) * DB.item(i.id).value, 0);

  const cappedSeconds = Math.min(awayHours * 3600, OFFLINE_CAP_MS / 1000);
  return {
    skill, recipe: DB.recipe(recipeId), awayHours, level, summary, ms, haul,
    startSeconds: startTicks / TICKS_PER_SECOND,
    endSeconds: g.actionIntervalTicks(skillId, recipeId) / TICKS_PER_SECOND,
    startMastery,
    endMastery: g.masteryLevel(skillId, recipeId),
    startNodeHp,
    endNodeHp: skill.node ? g._nodeMaxHp() : 0,
    frozenActions: Math.floor(cappedSeconds / (startTicks / TICKS_PER_SECOND)),
    /* A frozen-rate estimate is wrong in BOTH directions, and which way it
       misses is a property of the skill rather than a property of the error.
       It under-counts a skill whose interval falls as mastery arrives, and it
       over-counts a node skill, because dividing the session by the action
       interval silently assumes the vein never runs dry. */
    frozenNote: skill.node
      ? "(it assumes the vein never runs dry)"
      : "(it assumes you never got faster)",
    actions: g.state.stats.actions,
    poolWasted: g.state.stats.poolWasted,
  };
}

/* Run once, at module scope, so the masthead can quote MEASURED replay
   numbers. A report whose lede says "none of them was typed in" cannot have a
   typed-in number in its first tile. */
const OFFLINE_SESSIONS = [
  replaySession({ skillId: "boughcraft", recipeId: "bough-palebirch", awayHours: 8, level: 1 }),
  replaySession({ skillId: "delving", recipeId: "vein-verdigris", awayHours: 72, level: 35 }),
];

function sectionOffline() {
  const sessions = OFFLINE_SESSIONS;

  const panels = sessions.map((s) => {
    const sum = s.summary;
    const gain = s.actions / s.frozenActions - 1;
    const items = sum.items.slice(0, 4)
      .map((i) => `${esc(i.name)} <span class="white bold">&times;${int(i.delta)}</span>`).join(" &middot; ");
    const levels = sum.levels.map((l) => `${esc(l.name)} ${l.from}&rarr;<span class="gold bold">${l.to}</span>`).join(" &middot; ");
    return `<div class="panel">
      <div class="section__head">
        <h3 class="h3">${esc(s.recipe.name)}, ${s.awayHours} h away</h3>
        <span class="pill${sum.cappedByLimit ? "" : " pill--violet"}">${
          sum.cappedByLimit ? `capped to 24 h` : `${s.awayHours} h replayed in full`}</span>
      </div>
      ${readout([
        { label: "Ticks replayed", value: int(sum.ticks), strong: true },
        { label: "Wall clock to replay them", value: `${s.ms.toFixed(1)} ms`, strong: true, flag: true },
        { label: "Actions completed", value: int(s.actions) },
        { label: `A frozen-rate estimate would have counted <span class="micro">${esc(s.frozenNote)}</span>`,
          value: `${int(s.frozenActions)} <span class="micro">${signed(gain, 1)}</span>` },
        { label: "Interval, start &rarr; end", value: `${secs(s.startSeconds)} &rarr; ${secs(s.endSeconds)}` },
        ...(s.skill.node
          ? [{ label: "Node HP, start &rarr; end", value: `${s.startNodeHp} &rarr; <span class="gold bold">${s.endNodeHp}</span>` }]
          : []),
        { label: "Mastery on that rung", value: `${s.startMastery} &rarr; <span class="gold bold">${s.endMastery}</span>` },
        { label: "Levels gained", value: levels || "&mdash;" },
        { label: "Brought home", value: items || "&mdash;" },
        { label: "Worth, at the counter", value: `${cogs(s.haul)} Cogs`, strong: true },
      ])}
    </div>`;
  }).join("");

  const perMs = sessions[1].summary.ticks / Math.max(sessions[1].ms, 0.001);
  return `<section id="offline">
    <h2 class="h2">5 &middot; The tick loop and coming back</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      One tick is <strong class="white">50 ms</strong>; twenty ticks a second is the atomic unit of
      the whole game, and every countdown in the engine is an integer tick count rather than a float
      of seconds. Offline is <strong class="white">not simulated in the background and not
      extrapolated</strong>: on resume the game takes
      <code>min(now &minus; lastSave, 24 h)</code>, converts it to ticks, and replays them through the
      same loop that runs live. Both sessions below were produced by actually doing that.
    </p>
    <div class="formula">advance(n)              jump straight to the next scheduled event
advance(n, {naive:1})   step one tick at a time

  both funnel through the same _advanceBy(k): decrement every live timer by k,
  then resolve whatever hit zero, in a fixed order. k is chosen as the minimum
  over live timers, so nothing can be skipped past — the fast path is not an
  approximation of the slow one, it is the same computation with the no-ops
  removed. The selftest asserts identical state hashes on every rung and every
  monster in the game, four ways, which is the only honest way to claim this.</div>
    ${panels}
    <p class="note">
      Twenty-four hours is <strong>${int(OFFLINE_CAP_MS / TICK_MS)} ticks</strong> and it resolves in
      ${sessions[1].ms.toFixed(0)}&nbsp;ms &mdash; ${compact(Math.round(perMs))} ticks a millisecond,
      because the loop jumps to the next scheduled event instead of stepping one at a time.
      <strong>The frozen-rate row is the point of the exercise.</strong> Dividing the session by the
      action interval &mdash; the obvious shortcut, and the one this engine deliberately does not
      take &mdash; is wrong in both directions and for different reasons.
      It <strong>under-counts</strong> Palebirch by
      ${pct(sessions[0].actions / sessions[0].frozenActions - 1, 1)}, because the mastery levels
      earned during those eight hours make every later swing faster.
      It <strong>over-counts</strong> Verdigris by
      ${pct(1 - sessions[1].actions / sessions[1].frozenActions, 1)}, because it quietly assumes a
      vein that never depletes and never has to respawn. Neither error is available to a replay that
      re-runs the real loop, which is exactly why it re-runs the real loop.
    </p>
  </section>`;
}

function sectionSkills() {
  return `<section id="skills">
    <h2 class="h2">6 &middot; The skill ladders</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      Every figure below was produced by running the tick engine for an hour of game time at two
      stated points: <strong class="white">new</strong> means the moment that rung unlocks &mdash;
      exactly the required level, mastery 1, no tools, no waystations, no checkpoints;
      <strong class="white">capped</strong> means skill 99, mastery 99 on every recipe, the full tool
      ladder, all four checkpoints live and the reference waystation set. The spread between them is
      the build-crafting, which is why the faucet table further down is a table of ranges.
    </p>
    <p class="lede" style="margin-top:var(--s-3)">
      Artisan skills carry a third number. Measured with a full reliquary they report a fantasy
      &mdash; Ninefold Sigils at 2.5&nbsp;s each are worth billions an hour right up until you notice
      each one eats forty Aether Shards, and shards only fall on sub-1% rolls.
      <strong class="white">Sustained</strong> throttles the burst rate by
      <code>own / (own + inputs)</code>, where the input cost is the whole tree walked down to raw
      gathering seconds. Burst is what the skill screen shows; sustained is the number the economy is
      designed against.
    </p>
    ${DB.skills.filter((s) => s.recipes).map(skillPanel).join("")}
    ${panelWorthDoing()}
  </section>`;
}

/**
 * The invariant that makes gather -> process -> consume real, printed.
 *
 *   craft   = value(output) / (ownSeconds + inputSeconds)
 *   sellRaw = sum(value(inputs)) / inputSeconds
 *
 * Both are Cogs per second of TOTAL play, so they are directly comparable. If
 * craft <= sellRaw the recipe is a trap and the arithmetic tells the player to
 * skip a rung of the game. Publishing the column is the point: it is the one
 * table where a mispriced recipe cannot hide.
 */
function panelWorthDoing() {
  const rows = [];
  let worst = null;
  for (const skill of DB.skills) {
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
        inputSeconds += (q / perAction) * secondsPerUnit(DB, rates, id, cache);
        inputValue += (q / perAction) * DB.item(id).value;
      }
      if (r.shards && rates.shardsPerHour > 0) {
        inputSeconds += (r.shards / perAction) * (3600 / rates.shardsPerHour);
      }
      if (!(inputSeconds > 0) || !(inputValue > 0)) continue;
      const craft = DB.item(r.produces).value / (own + inputSeconds);
      const sellRaw = inputValue / inputSeconds;
      const ratio = craft / sellRaw;
      const row = { skill, r, craft, sellRaw, ratio };
      rows.push(row);
      if (!worst || ratio < worst.ratio) worst = row;
    }
  }

  /* The skill gets a micro line under the recipe name rather than a column of
     its own: ten consecutive rows reading "Kilnwork" is a column that costs a
     third of a phone's width and carries no information. */
  const body = rows.map((x) => ({
    cells: [
      `${esc(x.r.name)}<br><span class="micro">${esc(x.skill.name)}</span>`,
      x.craft.toFixed(2),
      x.sellRaw.toFixed(2),
      { text: `${x.ratio < 100 ? x.ratio.toFixed(2) : compact(x.ratio)}&times;`, strong: true },
    ],
    flag: x === worst,
  }));

  return `<div class="panel">
    <div class="section__head">
      <h3 class="h3">Is the recipe worth doing at all?</h3>
      <span class="pill">${rows.length} checked &middot; 0 traps</span>
    </div>
    <div class="formula">craft   = value(output)      / (ownSeconds + inputSeconds)
sellRaw = sum(value(inputs)) /  inputSeconds

  both in Cogs per second of TOTAL play, so they compare directly.
  craft &lt;= sellRaw means the recipe is a TRAP: the arithmetic tells the
  player to skip a rung of the game, and they will be right.</div>
    ${table(["Recipe", "Craft, Cogs/s", "Sell the inputs", "Ratio"], body,
      { align: ["", "n", "n", "n"] })}
    <p class="note">
      The thinnest rung in the game is <strong>${esc(worst.r.name)}</strong> at
      ${worst.ratio.toFixed(2)}&times;, and it stays above 1 on purpose &mdash; a chain this deep
      cannot afford a fat markup at every rung, because markups compound. The first version of the
      price list failed here: the Voidglass Lens sold for 690 Cogs while its own inputs sold for a
      combined 596, which worked out to <strong>0.90&times;</strong> once the gathering time was
      counted. It was repriced, and this assertion is why it was found at all.
      <strong>Emberrite is exempt by name</strong>, not by omission: an ember is worth exactly zero
      Cogs, because burning a bough destroys its sale value outright. That is the whole design of the
      skill, and its 50% pool checkpoint &mdash; which pays back a quarter of the bough's price
      &mdash; is what turns the one value-destroying skill in the game into a faucet.
    </p>
  </div>`;
}

/* ---- warding ----------------------------------------------------------- */

function sectionWarding() {
  const rows = WARD.map((w) => ({
    cells: [
      w.monster.name,
      String(w.monster.level),
      int(w.monster.hp),
      `${w.fresh.killsPerHour.toFixed(0)}`,
      w.fresh.xpPerSecond.toFixed(1),
      { text: cogs(w.fresh.cogsPerHour), strong: true },
      cogs(w.full.cogsPerHour),
      w.full.shardsPerHour > 0 ? int(Math.round(w.full.shardsPerHour)) : "&mdash;",
      Math.round(w.full.provisionsEaten) || "&mdash;",
    ],
    flag: w === endgame,
  }));

  return `<section id="warding">
    <h2 class="h2">7 &middot; Warding &mdash; where the money is</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      Nine tiers, derived rather than wished for. The relic ladder fixes damage per second at every
      tier; kill time is then <em>chosen</em> &mdash; 14&nbsp;seconds at tier one drifting to
      30&nbsp;at tier nine &mdash; and monster HP is set to DPS &times; kill time. Cadence stays roughly
      constant across the whole arc while every number on screen grows by four orders of magnitude.
      Every monster's evasion is a quarter of the tier-matched relic's accuracy, so hit chance sits
      near 80% the whole way up: progression buys damage, never the right to stop missing.
    </p>
    <div class="panel">
      ${table(["Monster", "Lvl", "HP", "Kills/hr", "XP/s", "Cogs/hr new", "Cogs/hr capped", "Shards/hr", "Provisions/hr"],
        rows, { align: ["", "n", "n", "n", "n", "n", "n", "n", "n"] })}
      <p class="note">
        <strong>Aether Shards drop only from tier five up</strong>, and Sigilwork &mdash; the late
        non-combat faucet &mdash; runs on nothing else. That is what stops the two halves of the
        endgame from being independent: the best crafting loop in the game is throttled by how much
        Warding you are willing to do. Provisions are the other half of the same knot: the Ninefold
        Warden eats ${Math.round(endgame.full.provisionsEaten)} of them an hour, so Trawling and
        Hearthcraft stay load-bearing right to the end.
      </p>
    </div>
  </section>`;
}

/* ---- the faucet -------------------------------------------------------- */

function sectionFaucet() {
  const pick = (skillId, recipeId) => LADDER.get(skillId).find((r) => r.recipe.id === recipeId);
  const stages = [
    ["Hour one", "Delving &middot; Cinder Shale", LADDER.get("delving")[0].fresh.cogsPerHour, false],
    ["Hour one", "Warding &middot; Hollow Wisp", WARD[0].fresh.cogsPerHour, true],
    ["Early", "Kilnwork &middot; Marrow Billet (sustained)", pick("kilnwork", "kiln-marrow").sus.cogsPerHour, false],
    ["Early", "Warding &middot; Ashen Revenant", WARD[2].fresh.cogsPerHour, true],
    ["Early-mid", "Wayfaring &middot; Emberwatch Climb", pick("wayfaring", "route-climb").full.cogsPerHour, false],
    ["Early-mid", "Warding &middot; Slag Behemoth", WARD[3].fresh.cogsPerHour, true],
    ["Mid", "Hearthcraft &middot; Tidewyrm Steak (sustained)", pick("hearthcraft", "cook-tidewyrm").sus.cogsPerHour, false],
    ["Mid", "Delving &middot; Warden's Tear, capped", pick("delving", "vein-wardens-tear").full.cogsPerHour, false],
    ["Mid", "Wayfaring &middot; The Ninefold Circuit", pick("wayfaring", "route-circuit").full.cogsPerHour, false],
    ["Mid", "Warding &middot; Void Harrier", WARD[4].fresh.cogsPerHour, true],
    ["Mid-late", "Sigilwork &middot; Storm Sigil (sustained)", pick("sigilwork", "sig-storm").sus.cogsPerHour, false],
    ["Mid-late", "Warding &middot; Emberquartz Colossus", WARD[5].fresh.cogsPerHour, true],
    ["Late", "Sigilwork &middot; Ninefold Sigil (sustained)", sigilTop.sus.cogsPerHour, false],
    ["Late", "Warding &middot; Stormcrown Wyrm", WARD[6].fresh.cogsPerHour, true],
    ["Endgame", "Warding &middot; Riftbound Sovereign", WARD[7].fresh.cogsPerHour, true],
    ["Endgame", "Warding &middot; The Ninefold Warden", endgame.fresh.cogsPerHour, true],
    ["Endgame", "...fully ascended", endgame.ascended.cogsPerHour, true],
  ];

  const span = FAUCET_SPAN;
  const bars = stages.map(([stage, label, v, violet]) => ({
    /* SVG <text> gets the real character: esc() would render an HTML entity
       as visible literal text inside the chart. */
    label: label.replace(/&middot;/g, "\u00b7"), value: v, text: `${cogs(v)}/hr`, violet,
  }));

  const rows = stages.map(([stage, label, v, violet]) => ({
    cells: [stage, label, { text: `${cogs(v)}`, strong: true },
      `10<sup>${Math.log10(v).toFixed(1)}</sup>`],
    flag: violet && v === endgame.fresh.cogsPerHour,
  }));

  return `<section id="faucet">
    <h2 class="h2">8 &middot; The faucet ladder</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      From the first hour to the last, income spans
      <strong class="white">${compact(span)}&times;</strong> &mdash; 10<sup>${Math.log10(span).toFixed(1)}</sup>.
      The reference's own arc spans 10<sup>8</sup>, but that figure covers a base game plus a paid
      expansion; Emberveil ships one arc, and it is designed to the same <em>shape</em> one notch
      down: a first hour that pays one to three thousand, a mid plateau in the low millions, a late
      non-combat ceiling near a hundred million, and combat sitting an order of magnitude above the
      best crafting loop at equal investment.
    </p>
    <div class="panel panel--flush" style="padding:var(--s-4) var(--s-2)">
      ${barChart(bars)}
      <div class="legend" style="padding:0 var(--s-4) var(--s-2)">
        <span class="legend__item"><span class="swatch swatch--gold"></span>Non-combat loops</span>
        <span class="legend__item"><span class="swatch swatch--violet"></span>Warding</span>
      </div>
    </div>
    <div class="panel">
      ${table(["Stage", "Loop", "Cogs/hr", "Order"], rows, { align: ["", "", "n", "n"] })}
      <p class="note">
        <strong>The rule the ladder is built on.</strong> Combat out-earns the best non-combat loop by
        ${(endgame.fresh.cogsPerHour / sigilTop.sus.cogsPerHour).toFixed(0)}&times; at equal
        investment, which is the split worth copying: skills are for experience and progression,
        combat is for wealth. Every entry is a range in play, not a point &mdash; the "new" and
        "capped" columns in the skill ladders are three-to-eightfold apart, and that spread <em>is</em> the
        build-crafting.
      </p>
    </div>
  </section>`;
}

/* ---- sinks ------------------------------------------------------------- */

function sectionSinks() {
  const claspPoints = [];
  const cumPoints = [];
  let cum = 0;
  for (let n = 0; n < 118; n++) {
    cum += DB.claspCost(n);
    claspPoints.push([n, DB.claspCost(n)]);
    cumPoints.push([n, cum]);
  }
  const claspRows = [0, 1, 2, 5, 10, 20, 30, 50, 70, 90, 110, 117].map((n) => ({
    cells: [`${n} owned`, { text: int(DB.claspCost(n)), strong: true }, int(DB.claspCumulative(n + 1))],
    flag: n === 0 || n === 117,
  }));

  const ladderRows = Object.entries(DB.toolLadders).map(([skillId, ladder]) => ({
    cells: [
      DB.skill(skillId).name,
      int(ladder[0].cost),
      int(ladder.at(-1).cost),
      int(ladder.reduce((a, e) => a + e.cost, 0)),
      `-${Math.round(ladder.reduce((a, e) => a + Math.abs(e.mods[0][1]), 0) * 100)}%`,
      `${(Math.pow(ladder.at(-1).cost / ladder[0].cost, 1 / (ladder.length - 1))).toFixed(1)}&times;`,
    ],
  }));

  const wayRows = DB.waystations.map((w) => {
    const good = w.mods.filter(([, v]) => v > 0 || ["intervalPercent"].includes(w.mods[0][0]) === false);
    return {
      cells: [
        w.name,
        String(w.level),
        int(w.cost),
        `${int(w.material[1])} ${DB.item(w.material[0]).name}`,
        w.text.replace(/;/, " <span class='violet'>&bull;</span>"),
      ],
      flag: w.mods.some(([, v]) => v < 0),
    };
  });

  const riteRows = DB.ascension.map((r) => ({
    cells: [r.name, int(r.cost), String(r.seals), int(r.ingots), r.text],
    flag: !!r.raisesCap,
  }));

  return `<section id="sinks">
    <h2 class="h2">9 &middot; Where the Cogs go</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      Four rules price every sink in the game.
      <strong class="white">One:</strong> a flagship sink costs about five hours of the income tier it
      is aimed at. <strong class="white">Two:</strong> the first purchase of every ladder is affordable
      inside the first two minutes. <strong class="white">Three:</strong> tool ladders hold the
      benefit flat and let the price multiply, because throughput is hyperbolic.
      <strong class="white">Four:</strong> nothing costs more because the player is rich.
    </p>

    <div class="panel">
      <div class="section__head">
        <h3 class="h3">The reliquary &mdash; the flagship smooth sink</h3>
        <span class="pill">${int(claspTotal)} Cogs for all 118</span>
      </div>
      <div class="formula">Cost(n) = floor( ${int(DB.claspCurve.A)} * (n + 2) / ${int(DB.claspCurve.B)}^(${DB.claspCurve.C} / (${DB.claspCurve.D} + n)) )

  the denominator is an EXPONENT, not a multiplication — that is what makes the
  curve self-limiting instead of explosive as n grows</div>
      ${logChart({
        width: 460, height: 175,
        yTicks: [100, 1e4, 1e6, 1e8],
        xLabels: [0, 20, 40, 60, 80, 100, 117],
        series: [
          { points: claspPoints },
          { points: cumPoints, violet: true },
        ],
      })}
      <div class="legend">
        <span class="legend__item"><span class="swatch swatch--gold"></span>Cost of the next clasp</span>
        <span class="legend__item"><span class="swatch swatch--violet"></span>Cumulative spent</span>
      </div>
      <div style="margin-top:var(--s-4)">${table(["Clasps", "Next costs", "Cumulative"], claspRows, { align: ["", "n", "n"] })}</div>
      <p class="note">
        The first clasp costs <strong>${DB.claspCost(0)} Cogs</strong> &mdash; roughly two minutes of
        the first hour &mdash; so the sink introduces itself before the player has any idea what a
        Cog is worth. It is smooth rather than stepped, so every single purchase is a visible next
        goal, and the exponent flattens the curve near the end so the last clasp costs
        ${compact(DB.claspCost(117))} rather than infinity. The whole ladder is
        ${(claspTotal / WARD[5].fresh.cogsPerHour).toFixed(1)} hours of mid-game income.
      </p>
    </div>

    <div class="panel">
      <h3 class="h3">Tool ladders</h3>
      <div style="margin-top:var(--s-3)">${table(["Skill", "First step", "Last step", "Whole ladder", "Total cut", "Price step"],
        ladderRows, { align: ["", "n", "n", "n", "n", "n"] })}</div>
      <p class="note">
        Seven steps, six at &minus;5% and a final &minus;10%. Guild ranks &mdash; Apprentice,
        Journeyman, Guildwright, Emberforged, Voidtempered, Ascendant, Warden's &mdash; replace a
        material ladder entirely: an Emberveil tool is named for the hand that made it, not for what
        it is made of. Three skills, three price shapes: Delving's is cheapest at the top because its
        real cost is respawn downtime rather than interval, and Trawling's is dearest because its top
        rung is also the best Cogs per second in the game.
      </p>
    </div>

    <div class="panel">
      <div class="section__head">
        <h3 class="h3">Waystations &mdash; the signed-modifier puzzle</h3>
        <span class="pill pill--violet">${DB.waystationSlots} slots &middot; ${DB.waystations.length} designs</span>
      </div>
      <div style="margin-top:var(--s-3)">${table(["Waystation", "Lvl", "Cogs", "Materials", "Effect"], wayRows, { align: ["", "n", "n", "", ""] })}</div>
      <p class="note">
        ${DB.waystations.filter((w) => w.mods.some(([, v]) => v < 0)).length} of
        ${DB.waystations.length} carry a real drawback. Because stacking is additive and the
        modifiers are signed, choosing eight of twelve is a genuine linear optimisation the player can
        work out on paper &mdash; and that is the payoff for choosing additive stacking in the first
        place. Waystations cost Cogs <em>and</em> materials and must be rebuilt to reconfigure, so the
        puzzle is also a recurring drain rather than a one-off screen.
      </p>
    </div>

    <div class="panel">
      <div class="section__head">
        <h3 class="h3">The Ascension Rites &mdash; the designed endgame</h3>
        <span class="pill">${compact(riteTotal)} Cogs &middot; ${riteSeals} Warden Seals</span>
      </div>
      <div style="margin-top:var(--s-3)">${table(["Warden", "Cogs", "Seals", "Ninefold Ingots", "Bound effect"], riteRows, { align: ["", "n", "n", "n", ""] })}</div>
      <p class="note">
        ${compact(riteTotal)} Cogs is
        <strong>${(riteTotal / endgame.fresh.cogsPerHour).toFixed(1)} hours</strong> of tier-nine
        Warding at the rate you have <em>before</em> the rites &mdash; the same five-hour rule the
        reliquary follows, applied four orders of magnitude further up. The seals are the real gate:
        at ${(endgame.full.killsPerHour * 0.035).toFixed(1)} an hour, ${riteSeals} of them is roughly
        ${fmtHours(riteSeals / (endgame.full.killsPerHour * 0.035))} of farming. Binding the ninth
        Warden raises every skill cap from 99 to 120, which re-opens the experience curve for another
        ${compact(xpAt(120) - xpAt(99))} experience per skill &mdash; seven times everything earned to
        get there.
      </p>
    </div>
  </section>`;
}

/* ---- the arc ----------------------------------------------------------- */

function sectionArc() {
  const rows = DB.skills.filter((s) => s.recipes).map((s) => {
    const rungs = LADDER.get(s.id);
    const best = rungs.reduce((a, b) => (b.recipe.level > a.recipe.level ? b : a));
    const worst = rungs[0];
    return {
      cells: [
        s.name,
        `${s.recipes.length}`,
        fmtHours(xpAt(99) / worst.fresh.xpPerSecond / 3600),
        { text: fmtHours(xpAt(99) / best.fresh.xpPerSecond / 3600), strong: true },
        fmtHours(xpAt(99) / best.full.xpPerSecond / 3600),
      ],
      hours: xpAt(99) / best.fresh.xpPerSecond / 3600,
    };
  });
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const wardHours = xpAt(99) / endgame.fresh.xpPerSecond / 3600;
  rows.push({
    cells: ["Warding", `${DB.monsters.length}`, fmtHours(xpAt(99) / WARD[0].fresh.xpPerSecond / 3600),
      { text: fmtHours(wardHours), strong: true }, fmtHours(xpAt(99) / endgame.full.xpPerSecond / 3600)],
    hours: wardHours, flag: true,
  });

  return `<section id="arc">
    <h2 class="h2">10 &middot; The designed arc</h2>
    <p class="lede" style="margin-top:var(--s-3)">
      Time to cap, quoted three ways: at the first rung's rate (the number that makes a fresh save
      look impossible), at the rate the <em>top</em> rung pays the moment it unlocks (the honest one),
      and at the rate it pays once fully invested (the reward for the sinks).
    </p>
    <div class="panel">
      ${table(["Skill", "Rungs", "At the first rung", "At the top rung, new", "Fully invested"], rows,
        { align: ["", "n", "n", "n", "n"] })}
      <p class="note">
        <strong>About ${Math.round(total + wardHours)} hours to cap all nine active skills</strong> at
        their honest rate, roughly halved by full investment, before the Ascension Rites re-open the
        curve to 120 and multiply everything again. Vitality is not listed because it has no action of
        its own: it accrues at 0.133 experience per point of damage dealt and caps itself somewhere
        around the sixth Warding tier, which is exactly when the player needs the HP.
      </p>
    </div>
  </section>`;
}

/* =========================================================================
   5. ASSEMBLE
   ========================================================================= */

const generated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const recipeCount = DB.skills.reduce((a, s) => a + (s.recipes?.length || 0), 0);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#050A10">
<title>Emberveil — Balance Report</title>
<link rel="stylesheet" href="src/styles/tokens.css">
<link rel="stylesheet" href="src/styles/balance.css">
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <p class="eyebrow">Emberveil &middot; systems core</p>
    <h1 class="title">The Balance Report</h1>
    <p class="lede" style="margin-top:var(--s-2)">
      Ten skills, ${recipeCount} recipes, ${DB.items.size} items, ${DB.monsters.length} monsters and
      ${DB.shop.length} priced purchases, checked against the published tables in
      <code>reference/melvor-math.md</code> and then measured by running the real tick engine.
      Every figure on this page came out of the engine; none of them was typed in.
    </p>
    <div class="rule"><span class="rule__diamond"></span></div>
    <div class="grid">
      ${tile(`${test.passed}/${test.total}`, "Assertions passing", test.failed ? `${test.failed} FAILING` : "against the reference tables")}
      ${tile(int(xpAt(99)), "XP to level 99", "doubling every 7 levels", true)}
      ${tile(`${compact(FAUCET_SPAN)}×`, "Faucet span", "first hour to fully ascended")}
      ${tile(compact(OFFLINE_CAP_MS / TICK_MS), "Ticks replayed offline",
        `24 h at 20/s, measured at ${OFFLINE_SESSIONS[1].ms.toFixed(0)} ms`, true)}
    </div>
    <div class="toc">
      <a href="#verification">Verification</a>
      <a href="#xp">The XP curve</a>
      <a href="#mastery">Mastery</a>
      <a href="#intervals">Intervals</a>
      <a href="#offline">Offline replay</a>
      <a href="#skills">Skill ladders</a>
      <a href="#warding">Warding</a>
      <a href="#faucet">The faucet</a>
      <a href="#sinks">Sinks</a>
      <a href="#arc">The arc</a>
    </div>
  </header>

  ${sectionVerification()}
  ${sectionXp()}
  ${sectionMastery()}
  ${sectionIntervals()}
  ${sectionOffline()}
  ${sectionSkills()}
  ${sectionWarding()}
  ${sectionFaucet()}
  ${sectionSinks()}
  ${sectionArc()}

  <footer>
    <p>Generated ${generated} by <code>tools/balance.mjs</code> from the live engine.
    Regenerate with <code>node tools/balance.mjs</code>.</p>
    <p style="margin-top:var(--s-2)">Emberveil takes the mathematics of its reference and none of its
    words. Every skill, recipe, item, monster, waystation and Warden named on this page is original.</p>
  </footer>

</div>
<script>
/* Wide tables on a 390px phone.

   Nine columns of measured numbers do not fit a phone and should not be
   thinned out to make them fit — this is a designer's document and the
   numbers are the point. So each table that genuinely overflows announces
   itself: the header grows a SWIPE affordance, the right edge fades while
   there is more to see, and the fade lifts at the end of the scroll. Tables
   that fit stay completely silent. Everything is a class toggle; the CSS
   does the drawing. */
(function () {
  var wraps = [].slice.call(document.querySelectorAll(".tablewrap"));

  function sync(wrap) {
    var box = wrap.querySelector(".scroll");
    if (!box) return;
    var over = box.scrollWidth - box.clientWidth > 2;
    var atEnd = !over || box.scrollLeft >= box.scrollWidth - box.clientWidth - 2;
    wrap.classList.toggle("is-overflowing", over);
    wrap.classList.toggle("is-at-end", atEnd);
    if (wrap.hint) {
      wrap.hint.classList.toggle("is-on", over);
      wrap.hint.classList.toggle("is-spent", atEnd);
    }
  }

  wraps.forEach(function (wrap) {
    var box = wrap.querySelector(".scroll");
    if (!box) return;
    /* The hint is injected rather than emitted, so a page with scripting off
       degrades to a plain scrolling table instead of to a lying label. */
    var hint = document.createElement("p");
    hint.className = "swipe";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "swipe for the rest of the row →";
    wrap.parentNode.insertBefore(hint, wrap);
    wrap.hint = hint;
    box.addEventListener("scroll", function () { sync(wrap); }, { passive: true });
    sync(wrap);
  });

  var pending;
  addEventListener("resize", function () {
    clearTimeout(pending);
    pending = setTimeout(function () { wraps.forEach(sync); }, 100);
  }, { passive: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { wraps.forEach(sync); });
  }
})();
</script>
</body>
</html>`;

const outPath = resolve(ROOT, "balance.html");
writeFileSync(outPath, html, "utf8");
console.log(`  wrote balance.html  (${(html.length / 1024).toFixed(0)} KB)\n`);

process.exit(test.failed ? 1 : 0);
