/* =========================================================================
   EMBERVEIL — THE SKILL SCREEN

   Two states in one screen:
     list    — the five disciplines, each with its own level, XP bar and
               mastery-pool fill, and the running one marked live.
     detail  — the idle loop made visible: level, XP, the action interval
               counting down, per-recipe mastery, the mastery pool with its
               checkpoint markers, and stock accruing.

   It renders against the SkillEngine interface documented at the top of
   ./skill-fixtures.js and touches nothing else. Swapping the fixture for the
   real engine is a one-line change at BOOT below.

   ARCHITECTURE. The skeleton is built once per view; after that `paint()`
   writes only the values that changed, so the 20Hz loop never rebuilds DOM.
   `advance(ms)` is fed the real frame delta — the same call serves a live
   frame, a throttled background tab and a 24h resume, which is why a
   backgrounded phone comes back to the correct state instead of a guess.

   DEV URL FLAGS (fixtures only, never shipped behaviour):
     ?view=list      open on the list state
     ?demo=levelup   start on the brink of all three milestones
     ?paused=1       open with the loop stopped
     ?at=recipes     open scrolled to the recipe list, so a screenshot of the
                     below-the-fold half is reproducible rather than hand-made
   ========================================================================= */

import { createFixtureEngine, verifyMath } from "./skill-fixtures.js";

/* ---- formatting ---------------------------------------------------------
   These mirror the canonical formatters in src/js/main.js. That module boots
   the home shell as an import side effect, so this screen cannot import from
   it while it runs standalone; when the shell absorbs the screen, delete
   these four and import them instead.
   ------------------------------------------------------------------------ */

const UNITS = ["", "K", "M", "B", "T"];

/** 12450000 -> "12.45M" */
function compact(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const tier = Math.min(Math.floor(Math.log10(abs) / 3), UNITS.length - 1);
  const scaled = n / 1000 ** tier;
  return scaled.toFixed(scaled >= 100 ? 0 : 2).replace(/\.?0+$/, "") + UNITS[tier];
}

/** 1250 -> "1,250" */
const int = (n) => Math.trunc(n).toLocaleString("en-US");

/**
 * 0.654 -> "65.4%". FLOORS, never rounds.
 *
 * A progress figure that rounds up lies about a threshold. The mastery pool
 * sits at 49.9984% here — one action below its 50% checkpoint — and a
 * rounding formatter prints "50.0%" next to two of four filled checkpoint
 * pips, which reads as a broken binding rather than as a knife-edge. Under a
 * floor, 100% means finished and 50% means the checkpoint is held.
 *
 * The epsilon is for the modifier sums that also come through here: additive
 * buckets like 0.10 + 0.10 + 0.10 land on 0.30000000000000004, and a bare
 * floor would happily print one of those as 29%.
 */
const pct = (f, digits = 1) => {
  const m = 10 ** digits;
  return `${(Math.floor(f * 100 * m + 1e-9) / m).toFixed(digits)}%`;
};

/** "1 action" / "2 actions" — a live counter that passes through 1 and reads
    "1 actions" is the cheapest possible tell that nobody looked at it. */
const plural = (n, one, many) => `${int(n)} ${Math.round(n) === 1 ? one : many}`;

/** 16338 -> "04:32:18" */
function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 2.4 -> "2.40s" */
const secs = (n) => `${n.toFixed(2)}s`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- markup helpers ----------------------------------------------------- */

/** Pixel sprites are authored at 16x16 and scaled by WHOLE numbers only. */
const sprite = (src, alt, scale) =>
  `<img class="pixel" data-scale="${scale}" style="--px-w:16;--px-h:16" src="${esc(src)}" alt="${esc(alt)}"
        width="${16 * scale}" height="${16 * scale}" draggable="false">`;

const icon = (id, size, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><use href="${id}"/></svg>`;

/* =========================================================================
   BOOT
   ========================================================================= */

const params = new URLSearchParams(location.search);
const engine = createFixtureEngine({ preset: params.get("demo") === "levelup" ? "brink" : "default" });
if (params.get("paused") === "1") engine.setRunning(false);

verifyMath(); // throws loudly rather than shipping quiet drift

const app = document.getElementById("app");
const viewRoot = document.getElementById("viewRoot");
const screenEl = document.getElementById("screen");
const plaqueSlot = document.getElementById("plaques");
const backBtn = document.getElementById("backBtn");

const ui = {
  view: params.get("view") === "list" ? "list" : "detail",
  skillId: engine.activeSkillId(),
  nodes: {},
  written: new Map(),
};

/* Write-through cache: the loop runs at display rate, so never touch the DOM
   for a value that has not changed. */
function setText(key, node, value) {
  if (!node || ui.written.get(key) === value) return;
  ui.written.set(key, value);
  node.textContent = value;
}
function setFill(key, node, fraction) {
  if (!node) return;
  const clamped = Math.max(0, Math.min(1, fraction));
  const v = `${(clamped * 100).toFixed(2)}%`;
  if (ui.written.get(key) === v) return;
  ui.written.set(key, v);
  node.style.setProperty("--fill", v);
  /* A fill of zero has no leading edge, so it must not paint a hot cap or
     throw a bloom — otherwise an untouched bar shows a 2px sliver of lit
     metal at its left end, which reads as a rendering fault. */
  node.classList.toggle("is-empty", clamped <= 0);
  const track = node.parentElement;
  if (track?.getAttribute("role") === "progressbar") {
    track.setAttribute("aria-valuenow", Math.round(clamped * 100));
  }
}

/* =========================================================================
   DETAIL VIEW
   ========================================================================= */

function stackLine(s, showStock) {
  return `<li class="stack">
    ${sprite(s.icon, s.name, 1)}
    <b class="stack__qty u-tnum">${s.qty}&times;</b>
    <span class="stack__name">${esc(s.name)}</span>
    ${showStock ? `<span class="stack__stock u-tnum" data-stock="${s.id}">${int(s.stock)}</span>` : ""}
  </li>`;
}

function recipeRow(r) {
  const inputs = r.inputs.length
    ? r.inputs.map((i) => `${i.qty}&times; ${esc(i.name)}`).join(" &middot; ")
    : `Yields ${esc(r.outputs[0].name)}${r.note ? ` &middot; ${esc(r.note)}` : ""}`;

  return `<li class="rrow-wrap">
    <button class="rrow${r.selected ? " is-selected" : ""}${r.unlocked ? "" : " is-locked"}"
            type="button" data-recipe="${r.id}" ${r.unlocked ? "" : "disabled"}>
      <span class="rrow__icon">${sprite(r.icon, r.name, 2)}</span>
      <span class="rrow__body">
        <span class="rrow__top">
          <span class="rrow__name">${esc(r.name)}</span>
          ${r.unlocked
            ? `<span class="rrow__meta u-tnum">${r.xp} XP &middot; ${r.ranged ? "~" : ""}${secs(r.intervalSec)}</span>`
            : `<span class="rrow__req">${icon("#i-lock", 10)}LV ${r.req}</span>`}
        </span>
        <span class="rrow__in">${inputs}</span>
        ${r.unlocked
          ? `<span class="rrow__mastery">
               <span class="bar bar--sm bar--violet"><span class="bar__fill" data-mbar="${r.id}"
                     style="--fill:${(r.masteryPct * 100).toFixed(2)}%"></span></span>
               <span class="rrow__ml u-tnum" data-ml="${r.id}">M${r.masteryLevel}</span>
             </span>`
          /* A locked recipe has no mastery to show, and four identical empty
             tracks down the list are just noise. It gets the figures you
             actually weigh a goal by instead: the pace, and what it sells for. */
          : `<span class="rrow__goal u-tnum">
               ${r.xp} XP &middot; ${secs(r.intervalSec)} &middot;
               ${icon("#i-coin", 11, "rrow__coin")}${int(r.value)}
             </span>`}
      </span>
    </button>
  </li>`;
}

function detailHTML(d) {
  const unlocked = d.recipes.filter((r) => r.unlocked).length;

  return `
  <header class="skillhead" id="skillhead">
    <svg class="skillhead__wm" viewBox="0 0 24 24" aria-hidden="true"><use href="${d.mark}"/></svg>
    <div class="skillhead__body">
      <p class="skillhead__eyebrow">
        <svg class="skillhead__mark" viewBox="0 0 24 24" aria-hidden="true"><use href="${d.mark}"/></svg>
        ${esc(d.name)}
      </p>
      <p class="t-numeral skillhead__numeral" id="lvNum">${d.level}</p>
      <p class="t-rarity" id="lvRank">${esc(d.rank)}</p>
      <div class="ornament-rule skillhead__rule"><span class="ornament-rule__diamond"></span></div>
      <p class="skillhead__status">
        <span class="dot-gold"></span>
        <span class="u-tnum" id="sessionText"></span>
        ${icon("#i-clock", 12, "skillhead__clock")}
        <span class="u-tnum" id="sessionClock"></span>
      </p>
    </div>
  </header>

  <main class="screen__body">

    <!-- ============ THE GOLD PANEL — progression, then the live loop.
         One panel, four sections, no nested boxes: the structure is carried
         entirely by cut grooves. ============ -->
    <section class="panel act" id="actPanel">
      <div class="panel__head">
        <p class="t-label">Skill progress</p>
        <p class="t-value-lg u-tnum" id="xpPct">${pct(d.xpPct)}</p>
      </div>
      <p class="lvlrow">
        <span class="t-value" id="lvFrom">${d.level}</span>
        <span class="lvlrow__arrow">&rarr;</span>
        <span class="t-value" id="lvNext">${d.level + 1}</span>
        <span class="grow"></span>
        <span class="t-micro u-tnum" id="xpInto"></span>
      </p>
      <div class="bar" role="progressbar" aria-label="Skill XP">
        <div class="bar__fill" id="xpBar"></div>
      </div>

      <hr class="divider">

      <div class="stat-split stat-split--3">
        <div class="stat">
          <p class="t-label">Total XP</p>
          <p class="t-value-lg u-tnum" id="totalXp"></p>
        </div>
        <div class="divider divider--v"></div>
        <div class="stat">
          <p class="t-label">XP / hour</p>
          <p class="t-value-lg u-tnum" id="xpHr"></p>
        </div>
        <div class="divider divider--v"></div>
        <div class="stat">
          <p class="t-label">Unlocks at</p>
          <p class="t-value-lg u-tnum">${d.nextUnlock ? `LV ${d.nextUnlock.level}` : "&mdash;"}</p>
        </div>
      </div>

      <hr class="divider">

      <div class="act__head">
        <span class="act__icon">${sprite(d.action.icon, d.action.name, 3)}</span>
        <span class="act__title">
          <span class="act__kicker"><span class="dot-gold"></span><span id="actVerb">${esc(d.verb)}</span></span>
          <span class="act__name">${esc(d.action.name)}</span>
        </span>
        <button class="runbtn plate" type="button" id="runBtn" aria-label="Pause or resume">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><use href="#i-pause" id="runGlyph"/></svg>
        </button>
      </div>

      <p class="act__timer">
        <span class="act__remain u-tnum" id="actRemain">0.00</span><span class="act__unit">s</span>
        <span class="grow"></span>
        <span class="t-micro u-tnum" id="actMeta"></span>
      </p>
      <div class="bar bar--live" role="progressbar" aria-label="Action progress">
        <div class="bar__fill" id="actBar"></div>
      </div>

      <div class="stat-split act__flow">
        <div class="stat">
          <p class="t-label">Consumes</p>
          <ul class="stacks">${d.action.inputs.map((s) => stackLine(s, true)).join("")
            || `<li class="stack stack--none">Nothing &mdash; gathered</li>`}</ul>
        </div>
        <div class="divider divider--v"></div>
        <div class="stat">
          <p class="t-label">Yields</p>
          <ul class="stacks">${d.action.outputs.map((s) => stackLine(s, false)).join("")}</ul>
          <p class="act__stored"><b class="u-tnum" id="storedQty">${int(d.action.outputs[0].stock)}</b> stored</p>
        </div>
      </div>
    </section>

    <!-- ============ THE VIOLET PANEL — mastery, then the pool it feeds.
         The two halves of the same axis, split by a groove. ============ -->
    <section class="panel pool">
      <div class="panel__head">
        <p class="t-label">Mastery
          <span class="head-lv"><b id="mFrom"></b><i>&rarr;</i><b id="mTo"></b></span>
        </p>
        <p class="t-value u-tnum" id="mPct"></p>
      </div>
      <div class="bar bar--violet" role="progressbar" aria-label="Recipe mastery">
        <div class="bar__fill" id="mBar"></div>
      </div>
      <p class="milestone-line"><span class="u-tnum" id="mRate"></span><span id="mNext"></span></p>

      <hr class="divider">

      <div class="panel__head">
        <p class="t-label">Mastery pool</p>
        <p class="t-value u-tnum" id="poolPct"></p>
      </div>

      <div class="poolbar">
        <div class="bar bar--violet"><div class="bar__fill" id="poolBar"></div></div>
        ${d.pool.checkpoints.map((c) => `<span class="poolbar__notch" style="--at:${c.at * 100}%"></span>`).join("")}
      </div>

      <!-- The pool's numeric witness. A compact "2.25M / 4.50M" is frozen at
           this resolution — a quarter of 28.5 mastery XP is 7 a go against a
           4,500,000 cap — so the raw integer carries it instead, and its last
           digits step every time an action lands. Without a figure that moves,
           a checkpoint crossing has nothing to prove itself against. -->
      <p class="poolfig u-tnum"><b id="poolValue"></b> / ${int(d.pool.cap)} XP
        <span class="poolfig__rate" id="poolRate"></span></p>

      <ul class="cps">
        ${d.pool.checkpoints.map((c) => `
          <li class="cp${c.reached ? " is-held" : ""}" style="--at:${c.at * 100}%" data-cp="${c.at}">
            <span class="cp__dia"></span>
            <span class="cp__pct u-tnum">${c.at * 100}%</span>
          </li>`).join("")}
      </ul>

      <hr class="divider">

      <p class="cpline cpline--held" id="cpHeld">
        <i class="cpline__tag">Held</i>
        <b class="cpline__at u-tnum" id="cpHeldAt"></b>
        <span class="cpline__txt" id="cpHeldTxt"></span>
      </p>
      <p class="cpline cpline--next" id="cpNext">
        <i class="cpline__tag">Next</i>
        <b class="cpline__at u-tnum" id="cpNextAt"></b>
        <span class="cpline__txt" id="cpNextTxt"></span>
      </p>
    </section>

    <!-- ============ RECIPES ============ -->
    <section class="panel panel--flush recipes">
      <div class="recipes__head">
        <p class="t-label">${esc(d.name)} recipes</p>
        <p class="t-micro u-tnum">${unlocked} of ${d.recipes.length} unlocked</p>
      </div>
      <ul id="recipeList">${d.recipes.map(recipeRow).join("")}</ul>
    </section>

  </main>`;
}

/* =========================================================================
   LIST VIEW
   ========================================================================= */

/* Every row states BOTH axes as bars: gold for the level climb, violet for
   the mastery pool with its checkpoints cut into it as notches. That is the
   whole point of the list state — you should be able to tell, without
   reading a digit, which discipline is deep and which is shallow. */
function skillRow(r) {
  return `<li class="srow-wrap">
    <button class="srow${r.active ? " is-active" : ""}" type="button" data-skill="${r.id}" data-axis="${r.axis}">
      <span class="srow__mark">${icon(r.mark, 22)}</span>
      <span class="srow__body">
        <span class="srow__top">
          <span class="srow__name">${esc(r.name)}</span>
          <span class="srow__lv"><i>LV</i><b class="u-tnum">${r.level}</b></span>
        </span>

        <span class="srow__meter">
          <i class="srow__axis">XP</i>
          <span class="bar bar--sm"><span class="bar__fill" data-xpbar="${r.id}"
                style="--fill:${(r.xpPct * 100).toFixed(2)}%"></span></span>
          <b class="srow__pct u-tnum" data-xppct="${r.id}">${pct(r.xpPct)}</b>
        </span>

        <span class="srow__meter">
          <i class="srow__axis">Pool</i>
          <span class="poolbar poolbar--inline">
            <span class="bar bar--sm bar--violet"><span class="bar__fill" data-poolbar="${r.id}"
                  style="--fill:${(r.poolPct * 100).toFixed(2)}%"></span></span>
            ${r.poolCheckpoints.map((c) => `<span class="poolbar__notch" style="--at:${c.at * 100}%"></span>`).join("")}
          </span>
          <b class="srow__pct srow__pct--pool u-tnum" data-poolpct="${r.id}">${pct(r.poolPct)}</b>
        </span>

        <span class="srow__foot">
          <span class="srow__what" data-what="${r.id}"></span>
          <span class="srow__pool" data-pips="${r.id}">
            ${r.poolCheckpoints.map((c) => `<span class="pip${c.reached ? " is-held" : ""}"></span>`).join("")}
          </span>
        </span>
      </span>
    </button>
  </li>`;
}

function listHTML(rows) {
  const combined = rows.reduce((n, r) => n + r.level, 0);
  const active = rows.find((r) => r.active);
  return `
  <header class="skillhead skillhead--list">
    <div class="skillhead__body">
      <p class="skillhead__eyebrow">Combined Level</p>
      <p class="t-numeral skillhead__numeral">${combined}</p>
      <p class="t-rarity">${rows.length} Disciplines</p>
      <div class="ornament-rule skillhead__rule"><span class="ornament-rule__diamond"></span></div>
      <p class="skillhead__status">
        <span class="dot-gold"></span>
        ${esc(`${active.name} · ${active.recipeName}`)}
      </p>
    </div>
  </header>
  <main class="screen__body">
    <section class="panel panel--flush skills">
      <ul>${rows.map(skillRow).join("")}</ul>
    </section>
    <p class="footnote">One discipline runs at a time &mdash; the rest hold their progress.</p>
  </main>`;
}

/* =========================================================================
   RENDER + PAINT
   ========================================================================= */

function render() {
  ui.written.clear();
  app.dataset.view = ui.view;

  if (ui.view === "detail") {
    const d = engine.detail(ui.skillId);
    viewRoot.innerHTML = detailHTML(d);
    const $ = (id) => document.getElementById(id);
    ui.nodes = {
      head: $("skillhead"), lvNum: $("lvNum"), lvRank: $("lvRank"),
      lvFrom: $("lvFrom"), lvNext: $("lvNext"),
      xpPct: $("xpPct"), xpInto: $("xpInto"), xpBar: $("xpBar"),
      totalXp: $("totalXp"), xpHr: $("xpHr"),
      actVerb: $("actVerb"), actRemain: $("actRemain"), actMeta: $("actMeta"), actBar: $("actBar"),
      actPanel: $("actPanel"), runBtn: $("runBtn"), runGlyph: $("runGlyph"), storedQty: $("storedQty"),
      mPct: $("mPct"), mFrom: $("mFrom"), mTo: $("mTo"), mRate: $("mRate"), mBar: $("mBar"), mNext: $("mNext"),
      sessionText: $("sessionText"), sessionClock: $("sessionClock"),
      poolPct: $("poolPct"), poolValue: $("poolValue"),
      poolRate: $("poolRate"), poolBar: $("poolBar"),
      cpHeld: $("cpHeld"), cpHeldAt: $("cpHeldAt"), cpHeldTxt: $("cpHeldTxt"),
      cpNextAt: $("cpNextAt"), cpNextTxt: $("cpNextTxt"),
      recipeList: $("recipeList"),
      stocks: new Map([...viewRoot.querySelectorAll("[data-stock]")].map((n) => [n.dataset.stock, n])),
      cps: new Map([...viewRoot.querySelectorAll("[data-cp]")].map((n) => [n.dataset.cp, n])),
    };
  } else {
    viewRoot.innerHTML = listHTML(engine.skills());
    const byData = (key) =>
      new Map([...viewRoot.querySelectorAll(`[data-${key}]`)].map((n) => [n.dataset[key], n]));
    ui.nodes = {
      whats: byData("what"),
      xpbars: byData("xpbar"),
      xppcts: byData("xppct"),
      poolbars: byData("poolbar"),
      poolpcts: byData("poolpct"),
      pips: byData("pips"),
    };
  }
  screenEl.scrollTop = 0;
  app.classList.remove("is-scrolled");
  paint();
}

function paintDetail() {
  const d = engine.detail(ui.skillId);
  const n = ui.nodes;

  /* progression */
  setText("lvNum", n.lvNum, String(d.level));
  setText("lvRank", n.lvRank, d.rank);
  /* Both ends of the pair, not just the right one — repainting only lvNext
     leaves the row reading "46 -> 48" for the rest of the session. */
  setText("lvFrom", n.lvFrom, String(d.level));
  setText("lvNext", n.lvNext, String(d.level + 1));
  setText("xpPct", n.xpPct, pct(d.xpPct));
  setText("xpInto", n.xpInto, `${int(d.xpInto)} / ${int(d.xpSpan)} XP`);
  setFill("xpBar", n.xpBar, d.xpPct);
  setText("totalXp", n.totalXp, compact(d.totalXp));
  setText("xpHr", n.xpHr, int(d.xpPerHour));

  /* the action */
  const a = d.action;
  const halted = !!d.halted;
  n.actPanel.classList.toggle("is-halted", halted);
  n.actPanel.classList.toggle("is-paused", !d.running && !halted);
  setText("actVerb", n.actVerb, halted ? `Out of ${d.halted}` : d.running ? d.verb : "Paused");
  setText("actRemain", n.actRemain, a.remainingSec.toFixed(2));
  setText("actMeta", n.actMeta,
    `${a.ranged ? "~" : ""}${secs(a.intervalSec)} of ${secs(a.baseSec)} · −${pct(a.reductionPct, 0)}${a.reductionFlat ? ` −${a.reductionFlat}s` : ""}`);
  setFill("actBar", n.actBar, halted ? 1 : a.progressPct);
  n.runGlyph.setAttribute("href", d.running ? "#i-pause" : "#i-play");
  n.runBtn.classList.toggle("is-stopped", !d.running);
  setText("storedQty", n.storedQty, int(a.outputs[0].stock));
  for (const s of a.inputs) setText(`stock:${s.id}`, n.stocks.get(s.id), int(s.stock));

  /* mastery */
  const m = a.mastery;
  setText("mPct", n.mPct, pct(m.pct));
  setText("mFrom", n.mFrom, String(m.level));
  setText("mTo", n.mTo, String(m.level + 1));
  setText("mRate", n.mRate, `+${a.masteryXpPerAction.toFixed(1)} / action`);
  setFill("mBar", n.mBar, m.pct);
  setText("mNext", n.mNext, m.next ? ` · at M${m.next.level}, ${m.next.effect}` : " · every perk earned");

  /* session — the head band's status line, the reference's gold-dot slot */
  const s = d.session;
  setText("session", n.sessionText, `${plural(s.actions, "action", "actions")} · ${compact(s.xp)} XP`);
  setText("sessionClock", n.sessionClock, clock(s.seconds));

  /* pool */
  const p = d.pool;
  /* Two decimals, not one: at a 4.5M cap the pool moves ~7 XP per action, so
     49.9% would sit still through an entire session and the 50% checkpoint
     would appear to fire out of nowhere. 49.99 -> 50.00 is the crossing. */
  setText("poolPct", n.poolPct, pct(p.pct, 2));
  setText("poolValue", n.poolValue, int(p.xp));
  setText("poolRate", n.poolRate, `+${p.perAction.toFixed(2)} / action`);
  setFill("poolBar", n.poolBar, p.pct);
  for (const c of p.checkpoints) {
    n.cps.get(String(c.at))?.classList.toggle("is-held", c.reached);
  }
  /* Percentage and sentence are separate nodes: the figure gets the tabular
     white treatment, the sentence stays one clipped line. A checkpoint line
     that wraps changes the panel's height mid-session and shoves the fold,
     so the slot is fixed and the strings are written to fit it. */
  setText("cpHeldAt", n.cpHeldAt, p.held ? `${p.held.at * 100}%` : "—");
  setText("cpHeldTxt", n.cpHeldTxt, p.held ? p.held.effect : "Nothing held yet");
  setText("cpNextAt", n.cpNextAt, p.next ? `${p.next.at * 100}%` : "—");
  setText("cpNextTxt", n.cpNextTxt, p.next ? p.next.effect : "Every checkpoint held");
  n.cpHeld.classList.toggle("is-empty", !p.held);
}

function paintList() {
  const n = ui.nodes;
  for (const r of engine.skills()) {
    if (r.active) {
      const d = engine.detail(r.id);
      setText(`what:${r.id}`, n.whats.get(r.id), d.halted
        ? `Out of ${d.halted}`
        : d.running
          ? `${d.verb} ${d.action.name} · ${d.action.remainingSec.toFixed(1)}s`
          : `Paused · ${r.recipeName}`);
    } else {
      setText(`what:${r.id}`, n.whats.get(r.id), `Idle · ${r.recipeName}`);
    }

    setFill(`xp:${r.id}`, n.xpbars.get(r.id), r.xpPct);
    setText(`xppct:${r.id}`, n.xppcts.get(r.id), pct(r.xpPct));
    setFill(`pool:${r.id}`, n.poolbars.get(r.id), r.poolPct);
    setText(`poolpct:${r.id}`, n.poolpcts.get(r.id), pct(r.poolPct));

    /* Checkpoints are thresholds, not unlocks — a pip can go out again. */
    const pips = n.pips.get(r.id)?.children;
    if (pips) {
      r.poolCheckpoints.forEach((c, i) => pips[i]?.classList.toggle("is-held", c.reached));
    }
  }
}

const paint = () => (ui.view === "detail" ? paintDetail() : paintList());

/* =========================================================================
   MOMENTS
   A level, a mastery level and a pool checkpoint each deserve to land. The
   motion is deliberately heavy: a short rise, a hold, a fade. No bounce, no
   scale-pop, no confetti — this cabinet is cast metal.

   Timing is driven by JS rather than by an animation's own duration, so a
   reader on prefers-reduced-motion still gets the full readable hold even
   though the transitions themselves collapse to nothing.
   ========================================================================= */

const PLAQUE_HOLD = 2600;
const queue = [];
let showing = false;

function enqueue(plaque) {
  queue.push(plaque);
  if (!showing) next();
}

function next() {
  const p = queue.shift();
  if (!p) {
    showing = false;
    /* The scrim goes with the last plate, not with each one — three
       milestones landing back to back should not strobe the screen. */
    plaqueSlot.classList.remove("is-busy");
    return;
  }
  showing = true;
  plaqueSlot.classList.add("is-busy");

  const el = document.createElement("div");
  el.className = `plaque plate plaque--${p.axis}${p.axis === "violet" ? " plate--violet" : ""}`;
  el.innerHTML = `
    <span class="plaque__kicker">${esc(p.kicker)}</span>
    <span class="plaque__title">${esc(p.title)}</span>
    ${p.note ? `<span class="plaque__note">${esc(p.note)}</span>` : ""}`;
  plaqueSlot.appendChild(el);

  void el.offsetWidth; // flush layout so the transition has a start value
  el.classList.add("is-in");
  setTimeout(() => {
    el.classList.remove("is-in");
    el.classList.add("is-out");
    setTimeout(() => { el.remove(); next(); }, 260);
  }, PLAQUE_HOLD);
}

function flash(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth; // restart the transition
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

function refreshRecipeRows() {
  if (ui.view !== "detail" || !ui.nodes.recipeList) return;
  const d = engine.detail(ui.skillId);
  for (const r of d.recipes) {
    const bar = ui.nodes.recipeList.querySelector(`[data-mbar="${r.id}"]`);
    const lbl = ui.nodes.recipeList.querySelector(`[data-ml="${r.id}"]`);
    if (bar && r.unlocked) setFill(`rm:${r.id}`, bar, r.masteryPct);
    if (lbl && r.unlocked) setText(`rml:${r.id}`, lbl, `M${r.masteryLevel}`);
  }
}

function handleEvents(events) {
  let sawAction = false;

  for (const ev of events) {
    switch (ev.type) {
      case "action":
        sawAction = true;
        break;

      case "level": {
        const d = engine.detail(ev.skillId);
        enqueue({
          axis: "gold",
          kicker: "Level up",
          title: `${d.name} ${ev.level}`,
          note: ev.unlocked
            ? `${ev.unlocked.name} unlocked`
            : d.nextUnlock
              ? `${d.rank} · ${d.nextUnlock.name} at ${d.nextUnlock.level}`
              : `${d.rank} · every recipe unlocked`,
        });
        flash(ui.nodes.head, "is-levelup", 900);
        break;
      }

      case "mastery": {
        const d = engine.detail(ev.skillId);
        enqueue({
          axis: "violet",
          kicker: "Mastery",
          title: `${d.action.name} · ${ev.level}`,
          note: ev.perk || "Deeper knowledge of this recipe",
        });
        flash(ui.nodes.mBar?.parentElement, "is-levelup", 900);
        break;
      }

      case "checkpoint":
        enqueue({
          axis: "violet",
          kicker: `Pool checkpoint · ${ev.at * 100}%`,
          title: ev.label,
          note: ev.effect,
        });
        flash(ui.nodes.cps?.get(String(ev.at)), "is-lit", 1200);
        break;

      case "halt":
        enqueue({ axis: "gold", kicker: "Halted", title: `Out of ${ev.reason}`, note: "Gather more, or pick another recipe" });
        break;
    }
  }

  if (sawAction) {
    refreshRecipeRows();
    flash(ui.nodes.storedQty, "is-bump", 320);
  }
}

/* =========================================================================
   THE CLOCK

   Deliberately a timer and NOT requestAnimationFrame. rAF stops dead in a
   hidden tab, and an idle game that stops when you look away is broken —
   on a phone, backgrounded is the common case, not the edge case. A timer
   keeps firing (throttled to about 1Hz in the background), and because the
   engine is driven by the real elapsed delta rather than by a frame count,
   a throttled tab lands on exactly the same state as one that never slept.

   50ms is not an arbitrary paint rate either: it is one tick. The engine has
   no more information than that to show, so interpolating at 60fps would be
   inventing motion the simulation does not have.

   A gap larger than AWAY_MS is a return from background: replayed in a
   single call, capped at 24h inside the engine, and reported to the player.
   ========================================================================= */

const AWAY_MS = 4000;
const TICK_MS = 50;
let last = performance.now();

function step() {
  const now = performance.now();
  const dt = now - last;
  last = now;
  if (dt <= 0) return;

  if (dt >= AWAY_MS) {
    const events = engine.advance(dt);
    handleEvents(events.filter((e) => e.type !== "action"));
    if (events.actions > 0) {
      enqueue({
        axis: "gold",
        kicker: "While you were away",
        title: `${int(events.actions)} actions`,
        note: `${clock(dt / 1000)} replayed tick by tick`,
      });
      refreshRecipeRows();
    }
  } else {
    handleEvents(engine.advance(dt));
  }

  paint();
}

/* Coming back to the foreground: catch up now rather than on the next tick. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) step();
});

/* =========================================================================
   INPUT
   ========================================================================= */

viewRoot.addEventListener("click", (e) => {
  const skill = e.target.closest("[data-skill]");
  if (skill) {
    ui.skillId = skill.dataset.skill;
    engine.selectSkill(ui.skillId);
    ui.view = "detail";
    render();
    return;
  }

  const recipe = e.target.closest("[data-recipe]");
  if (recipe && !recipe.disabled) {
    engine.selectRecipe(recipe.dataset.recipe);
    render();
    return;
  }

  const run = e.target.closest("#runBtn");
  if (run) {
    engine.setRunning(!engine.isRunning());
    paint();
  }
});

backBtn.addEventListener("click", () => {
  ui.view = "list";
  render();
});

/* The pinned top bar earns its scrim only once content is passing under it. */
screenEl.addEventListener("scroll", () => {
  app.classList.toggle("is-scrolled", screenEl.scrollTop > 6);
}, { passive: true });

/* =========================================================================
   GO
   ========================================================================= */

render();

if (params.get("at") === "recipes") {
  const panel = viewRoot.querySelector(".recipes");
  if (panel) {
    screenEl.scrollTop = panel.offsetTop - screenEl.offsetTop;
    app.classList.add("is-scrolled");
  }
}

last = performance.now();
setInterval(step, TICK_MS);

/* Console handle for building and QA. */
window.EMBERVEIL_SKILL = { engine, ui, render, step, compact, int, pct, clock };

/* tools/shot.mjs waits on this so it never captures a half-laid-out screen.
   Set from a timer rather than rAF for the same reason the loop is: a
   headless or backgrounded tab never fires a frame, and the screenshot tool
   would then wait forever on a page that is in fact fully laid out. */
window.__APP_READY__ = false;
setTimeout(() => { window.__APP_READY__ = true; }, 0);
