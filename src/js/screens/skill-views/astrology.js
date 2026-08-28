/* =========================================================================
   EMBERVEIL — SKILL VIEW: ASTROLOGY   (parity §3e)

   §3e is one sentence long and it names six things:

     "Constellations"          eight rows, level-gated, each opening into its
                               own page of slots.
     "each with Study and
      Explore actions"         two buttons per constellation. Study pays the
                               experience, Explore pays the Prism Motes the
                               second tier of every slot is bought with.
     "a set of rollable
      modifier percentages
      (5.00% / 2.00% / 0%)"    three slots per constellation, and every slot
                               shows all three states at once with the one it
                               is currently rolled to lit. The reference shows
                               the ladder, not just the current value, because
                               the whole screen is a shopping list.
     "a 3.00s action interval" the skill is flat-interval, so the number is on
                               every action button and it is the EFFECTIVE one.
     "level-gated unlocks"     a locked constellation still lists what it will
                               grant, because that is what makes it a goal.
     "View All Active
      Modifiers"               the sheet, with every rolled slot and the net
                               total per modifier family.

   Every percentage on this page is read through the same system module the
   tick loop reads, so a number here is a number the engine is really applying.
   ========================================================================= */

import { DB, TICK_MS } from "../../engine/index.js";
import { el, esc, num, int, secs, pct2, sheet, mark, initials, backRow } from "../ui.js";
import { CONSTELLATIONS, TIER_VALUES, studyId, exploreId } from "../../../data/constellations.js";
import {
  tierOf, slotValue, upgradeCost, canUpgrade, upgrade, activeModifiers, slotsRolled,
} from "../../engine/systems/astrology.js";
import { ensureHooks } from "../../engine/systems/agility.js";

const SKILL = "astrology";

/* Which constellation page is open, or null for the list. */
let openCon = null;


/* =========================================================================
   THE MOTE HEADER
   ========================================================================= */

function motePanel(ctx) {
  const { game } = ctx;
  const star = game.count("star-mote");
  const prism = game.count("prism-mote");
  const rolled = slotsRolled(game);
  const total = CONSTELLATIONS.length * 3;

  const p = el(`<section class="panel">
    <div class="stat-split">
      <div><p class="t-label">Star Motes</p><p class="t-value u-tnum" id="asStar" style="color:var(--c-gold-core)">${num(star)}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">Prism Motes</p><p class="t-value u-tnum" id="asPrism" style="color:var(--c-gold-core)">${num(prism)}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">Slots rolled</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${rolled} / ${total}</p></div>
    </div>
    <div class="bar bar--sm" style="margin-top:var(--s-3)"><div class="bar__fill" id="asBar" style="--fill:0%"></div></div>
    <p class="t-micro" id="asStatus" style="color:var(--c-text-2);margin-top:6px">Information about your observations will display here.</p>
    <button class="btn-ghost" type="button" id="asMods" style="width:100%;margin-top:var(--s-3);font-size:var(--fs-micro)">View All Active Modifiers</button>
  </section>`);
  p.querySelector("#asMods").onclick = () => modifierSheet(ctx);
  return p;
}

function modifierSheet(ctx) {
  const list = activeModifiers(ctx.game);
  const body = [];
  if (!list.length) {
    body.push(el(`<p class="empty">Nothing rolled yet. Study a constellation and spend the motes.</p>`));
  } else {
    /* Summed the way §7.1 sums them: one bucket per modifier family. */
    const totals = new Map();
    for (const r of list) {
      const k = r.text;
      totals.set(k, (totals.get(k) || 0) + r.value);
    }
    body.push(el(`<p class="t-label" style="margin-bottom:var(--s-2)">Net, summed additively</p>`));
    for (const [k, v] of totals) {
      const text = k;
      body.push(el(`<div class="stat-line"><span>${esc(text)}</span><b class="u-tnum">+${pct2(v)}</b></div>`));
    }
    body.push(el(`<p class="t-label" style="margin:var(--s-4) 0 var(--s-2)">By constellation</p>`));
    for (const r of list) {
      body.push(el(`<div class="stat-line"><span style="font-size:var(--fs-micro)">${esc(r.constellation)} — ${esc(r.text)}</span>
        <b class="u-tnum" style="font-size:var(--fs-micro)">+${pct2(r.value)}</b></div>`));
    }
  }
  sheet("Active Modifiers", "Every constellation percentage the sky is currently granting.", body);
}

/* =========================================================================
   THE CONSTELLATION LIST
   ========================================================================= */

function conRow(ctx, c) {
  const { game, render } = ctx;
  const lv = game.skillLevel(SKILL);
  const locked = lv < c.level;
  const rolled = c.slots.filter((_, i) => tierOf(game, c.id, i) > 0).length;
  const study = DB.recipe(studyId(c));
  const isNow = game.state.action?.skillId === SKILL &&
    (game.state.action.recipeId === studyId(c) || game.state.action.recipeId === exploreId(c));

  const row = el(`<button class="row-card${locked ? " is-locked" : ""}${isNow ? " is-active" : ""}" type="button"${locked ? " disabled" : ""}>
    ${mark(c.id, initials(c.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(c.name)}${isNow ? '<span class="badge badge--on">Observing</span>' : ""}</span>
      <span class="row-card__sub" style="white-space:normal;display:block">${locked ? `Requires Astrology level ${c.level}` : esc(c.blurb)}</span>
      <span class="row-card__meta u-tnum" style="display:block">${locked ? "" : `${rolled} / 3 slots rolled · ${int(study.xp)} XP a study · mastery ${game.masteryLevel(SKILL, study.id)}`}</span>
    </span>
    <span class="row-card__right"><span class="row-card__lvl u-tnum">${c.level}</span><span class="row-card__lvl-cap">req</span></span>
  </button>`);
  if (!locked) row.onclick = () => { openCon = c.id; render(); };
  return row;
}

/* =========================================================================
   ONE CONSTELLATION
   ========================================================================= */

function actionButton(ctx, c, kind) {
  const { game, toast, markDirty, render } = ctx;
  const id = kind === "study" ? studyId(c) : exploreId(c);
  const r = DB.recipe(id);
  const lv = game.skillLevel(SKILL);
  const locked = lv < r.level;
  const isNow = game.state.action?.recipeId === id;
  const ivl = locked ? 0 : (game.actionIntervalTicks(SKILL, id) * TICK_MS) / 1000;

  const row = el(`<div class="row-card${locked ? " is-locked" : ""}${isNow ? " is-active" : ""}">
    ${mark(r.produces, initials(r.name))}
    <span class="row-card__body">
      <span class="row-card__title">${kind === "study" ? "Study" : "Explore"}${isNow ? '<span class="badge badge--on">Running</span>' : ""}</span>
      <span class="row-card__sub u-tnum" style="display:block">${locked ? `Requires level ${r.level}` : `${int(r.xp)} Skill XP / ${secs(ivl)}`}</span>
      <span class="row-card__meta u-tnum" style="display:block">${locked ? "" :
        `-> ${esc(DB.item(r.produces).name)} · mastery ${game.masteryLevel(SKILL, id)}`}</span>
    </span>
    <span class="row-card__right">${locked
      ? `<span class="row-card__lvl u-tnum">${r.level}</span><span class="row-card__lvl-cap">req</span>`
      : `<button class="btn-gold btn-gold--sm" type="button">${isNow ? "Stop" : kind === "study" ? "Study" : "Explore"}</button>`}
    </span></div>`);
  if (!locked) row.querySelector("button").onclick = () => {
    if (isNow) { game.stop(); markDirty(); render(); return; }
    game.start(SKILL, id);
    markDirty(); render();
    toast(`${kind === "study" ? "Studying" : "Exploring"} ${c.name}`);
  };
  return row;
}

function slotRow(ctx, c, sl, i) {
  const { game, toast, render } = ctx;
  const tier = tierOf(game, c.id, i);
  const cost = upgradeCost(game, c.id, i);
  const why = canUpgrade(game, c.id, i);
  const live = slotValue(game, c.id, i);

  /* The reference shows the whole ladder, not just the current value. */
  const chips = TIER_VALUES.map((v, t) => {
    const on = t === tier;
    return `<span style="flex:1 1 0;text-align:center;padding:5px 2px;border-radius:var(--r-sm);
      font-size:var(--fs-micro);font-variant-numeric:tabular-nums;
      background:${on ? "var(--grad-gold-face)" : "var(--c-track)"};
      color:${on ? "var(--c-ground)" : "var(--c-text-2)"};
      border:1px solid ${on ? "var(--c-hairline-gold)" : "var(--c-panel-edge)"};
      font-weight:${on ? "var(--fw-bold)" : "400"}">${(v * 100).toFixed(2)}%</span>`;
  }).join("");

  const costText = cost
    ? `${num(cost[0])} Star Motes${cost[1] ? ` + ${num(cost[1])} Prism Motes` : ""}`
    : "Fully rolled";

  const row = el(`<section class="panel panel--tight" style="margin-bottom:var(--s-2)">
    <div class="row--between">
      <p class="t-value" style="font-size:var(--fs-body)">${esc(sl.text)}</p>
      <p class="t-micro u-tnum" style="color:${live ? "var(--c-gold-core)" : "var(--c-text-2)"}">${live ? `+${pct2(live)}` : "\u2014"}</p>
    </div>
    <div style="display:flex;gap:var(--s-1);margin:var(--s-2) 0">${chips}</div>
    <div class="row--between">
      <p class="t-micro u-tnum" style="color:var(--c-text-2)">${esc(costText)}</p>
      <button class="btn-gold btn-gold--sm" type="button"${why ? " disabled" : ""}>${cost ? (why ? shortWhy(why) : "Roll") : "Maxed"}</button>
    </div>
  </section>`);
  if (!why) row.querySelector("button").onclick = () => {
    const err = upgrade(game, c.id, i);
    if (err) return toast(err, "bad");
    toast(`${c.name} — ${sl.text} rolled up`, "violet");
    render();
  };
  return row;
}

const shortWhy = (w) => (w.includes("level") ? "Locked" : w.includes("Prism") ? "Prism Motes" : w.includes("Star") ? "Star Motes" : "—");

function conPage(ctx, c) {
  const { game, render } = ctx;
  const out = [
    backRow("All constellations", () => { openCon = null; render(); }),
    motePanel(ctx),
    el(`<p class="sect">${esc(c.name)} — actions</p>`),
    actionButton(ctx, c, "study"),
    actionButton(ctx, c, "explore"),
    el(`<p class="sect">Modifiers — 3 slots</p>`),
  ];
  c.slots.forEach((sl, i) => out.push(slotRow(ctx, c, sl, i)));
  out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(c.blurb)}</p>`));
  return out;
}

/* =========================================================================
   THE VIEW
   ========================================================================= */

function render(ctx, skill) {
  ensureHooks(ctx.game);
  const c = openCon ? CONSTELLATIONS.find((x) => x.id === openCon) : null;
  if (c) return conPage(ctx, c);

  const out = [motePanel(ctx), el(`<p class="sect">Constellations — ${CONSTELLATIONS.length}</p>`)];
  for (const con of CONSTELLATIONS) out.push(conRow(ctx, con));
  out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(skill.blurb)}</p>`));
  return out;
}

function paint(ctx) {
  const { game } = ctx;
  const set = (id, v) => { const n = document.getElementById(id); if (n && n.textContent !== v) n.textContent = v; };
  set("asStar", num(game.count("star-mote")));
  set("asPrism", num(game.count("prism-mote")));

  const bar = document.getElementById("asBar");
  const status = document.getElementById("asStatus");
  const a = game.state.action;
  if (!bar || !status) return;
  if (a && a.skillId === SKILL && !game.state.combat) {
    const r = DB.recipe(a.recipeId);
    const pct = a.intervalTicks > 0 ? (1 - a.ticks / a.intervalTicks) * 100 : 0;
    bar.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
    const text = `${r.name} — ${secs((a.ticks * TICK_MS) / 1000)} to go`;
    if (status.textContent !== text) status.textContent = text;
  } else {
    bar.style.setProperty("--fill", "0%");
    const idle = "Information about your observations will display here.";
    if (status.textContent !== idle) status.textContent = idle;
  }
}

export default { kind: "astrology", render, paint, reset: () => { openCon = null; } };
