/* =========================================================================
   EMBERVEIL — SKILL VIEW: AGILITY   (parity §3g)

   §3g is a short spec and every clause of it is on this page:

     "Obstacle 1, Obstacle 2 (Requires Level 10), …"
                            — eight slots, each one a row, each one carrying
                              its own level gate whether or not it is open.
     "each chosen from level-gated options that grant global passives with
      trade-off penalties"
                            — tapping a slot opens its three designs, with the
                              passive AND the penalty written out in full and
                              the real build price beside them.
     "Start Agility / Stop Agility"
                            — one button, and it starts at the first standing
                              obstacle rather than at whatever was tapped last.
     "Load Blueprint / Save Blueprint"
                            — three presets. Saving is free; LOADING PAYS, at
                              today's prices, for every obstacle not already
                              standing.
     "a course time total"  — the lap header, and it is the EFFECTIVE time,
                              summed from the same interval formula the tick
                              loop uses, so it moves when a passive does.
     "View all Global Active Passives from Agility"
                            — the sheet, listing every standing obstacle's
                              contribution with its sign.

   ---------------------------------------------------------------------------
   WHY THIS VIEW IS REGISTERED UNDER THE "route" KIND
   ---------------------------------------------------------------------------
   Agility is a `route` skill in the engine: an obstacle pays Cogs straight out
   of the action and produces no item, which is the only way the obstacles'
   own signed "+25% / -35% Cogs from Agility" passives can mean anything.
   Exploration is a route skill too, and the view registry keys on `kind`, so
   this module is handed both — and hands every route skill that is not
   Agility straight back to the gathering view, which is exactly what an
   unclaimed kind gets today. Nothing regresses, and the day Exploration is
   reworked into its own archetype this delegation simply stops being reached.
   ========================================================================= */

import { DB, TICK_MS } from "../../engine/index.js";
import {
  el, esc, num, int, secs, sheet, mark, initials,
} from "../ui.js";
import { SLOTS, obstaclesForSlot, OBSTACLE_BY_ID } from "../../../data/obstacles.js";
import {
  ensureHooks, courseState, courseYield, buildCost, canBuild,
  build, demolish, saveBlueprint, loadBlueprint, blueprintCost, startCourse,
  stopCourse, running, activePassives,
} from "../../engine/systems/agility.js";
import gather from "./gather.js";

const SKILL = "agility";

/* -------------------------------------------------------------------------
   MODIFIER NAMES, IN ENGLISH
   The audit is only useful if the reader can tell what moved, so the engine's
   modifier keys are spelled out rather than printed raw.
   ------------------------------------------------------------------------- */
const MOD_TEXT = {
  skillXP: "skill XP", masteryXP: "mastery XP", intervalPercent: "interval",
  intervalFlat: "flat interval", doubleChance: "chance to double items",
  preserveChance: "resource preservation", currency: "Cogs from actions",
  saleValue: "Cogs from sales", costReduction: "build cost", flatQuantity: "base quantity",
  nodeHp: "node HP", respawnPercent: "node respawn",
};
const scopeText = (s) => (s === "global" || s == null ? "ALL skills" : DB.skill(s)?.name || s);
/** Interval is stored as a SIGNED CHANGE, so -12% is faster and reads green. */
const good = (name, v) => (name === "intervalPercent" || name === "respawnPercent" ? v < 0 : v > 0);
const signedPct = (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}%`;

function passiveLine(name, value, scope) {
  const colour = good(name, value) ? "var(--c-gold-core)" : "var(--c-violet-light)";
  const body = name === "intervalFlat" || name === "nodeHp" || name === "flatQuantity"
    ? `${value > 0 ? "+" : ""}${value} ${MOD_TEXT[name] || name}`
    : `${signedPct(value)} ${MOD_TEXT[name] || name}`;
  return `<span style="color:${colour}">${esc(body)}</span> <span style="opacity:.6">· ${esc(scopeText(scope))}</span>`;
}

/* =========================================================================
   THE COURSE HEADER
   ========================================================================= */

function coursePanel(ctx) {
  const { game, render, toast, markDirty } = ctx;
  const y = courseYield(game);
  const st = game.state.agility;
  const live = running(game);
  const built = y.obstacles;

  const perHour = y.seconds > 0 ? (y.cogs / y.seconds) * 3600 : 0;
  const xpSec = y.seconds > 0 ? y.xp / y.seconds : 0;

  const p = el(`<section class="panel">
    <div class="row--between">
      <p class="t-label">Course</p>
      <p class="t-micro u-tnum" style="color:var(--c-text-2)">${built} / ${SLOTS.length} obstacles${st ? ` · ${int(st.laps)} laps` : ""}</p>
    </div>
    <div class="stat-split" style="margin-top:var(--s-2)">
      <div><p class="t-label">Course time</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${built ? secs(y.seconds) : "—"}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">XP a lap</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${built ? int(Math.round(y.xp)) : "—"}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">Cogs a lap</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${built ? num(y.cogs) : "—"}</p></div>
    </div>
    <p class="t-micro u-tnum" id="agRate" style="color:var(--c-text-2);margin-top:var(--s-2)">${
      built ? `${xpSec.toFixed(2)} XP / s · ${num(Math.round(perHour))} Cogs / hr` : "Build an obstacle to open the course."
    }</p>
    <div class="bar bar--sm" style="margin-top:var(--s-2)"><div class="bar__fill" id="agBar" style="--fill:0%"></div></div>
    <p class="t-micro" id="agStatus" style="color:var(--c-text-2);margin-top:6px">Information about your course will display here.</p>
    <div class="btn-row" style="margin-top:var(--s-3)">
      <button class="${live ? "btn-ghost" : "btn-gold"}" type="button" id="agGo" style="flex:1 1 0"${built ? "" : " disabled"}>${live ? "Stop Agility" : "Start Agility"}</button>
    </div>
    <div class="btn-row" style="margin-top:var(--s-2)">
      <button class="btn-ghost" type="button" id="agLoad" style="flex:1 1 0;font-size:var(--fs-micro)">Load Blueprint</button>
      <button class="btn-ghost" type="button" id="agSave" style="flex:1 1 0;font-size:var(--fs-micro)">Save Blueprint</button>
    </div>
    <button class="btn-ghost" type="button" id="agPassives" style="width:100%;margin-top:var(--s-2);font-size:var(--fs-micro)">View all Global Active Passives from Agility</button>
  </section>`);

  p.querySelector("#agGo").onclick = () => {
    if (live) { stopCourse(game); toast("Agility stopped"); }
    else {
      const why = startCourse(game);
      if (why) return toast(why, "bad");
      toast("Agility started");
    }
    markDirty(); render();
  };
  p.querySelector("#agLoad").onclick = () => blueprintSheet(ctx, "load");
  p.querySelector("#agSave").onclick = () => blueprintSheet(ctx, "save");
  p.querySelector("#agPassives").onclick = () => passiveSheet(ctx);
  return p;
}

/* =========================================================================
   THE "VIEW ALL GLOBAL ACTIVE PASSIVES" SHEET
   ========================================================================= */

function passiveSheet(ctx) {
  const list = activePassives(ctx.game);
  /* Summed as the engine sums them (§7.1): one bucket per name and scope, so
     what the player reads is what the tick loop actually applies. */
  const totals = new Map();
  for (const p of list) {
    const k = `${p.name}|${p.scope ?? "global"}`;
    totals.set(k, (totals.get(k) || 0) + p.value);
  }
  const body = [];
  if (!list.length) {
    body.push(el(`<p class="empty">No obstacles are standing, so Agility is granting nothing.</p>`));
  } else {
    body.push(el(`<p class="t-label" style="margin-bottom:var(--s-2)">Net, summed additively</p>`));
    for (const [k, v] of totals) {
      const [name, scope] = k.split("|");
      body.push(el(`<div class="stat-line"><span>${passiveLine(name, v, scope)}</span><b class="u-tnum">${signedPct(v)}</b></div>`));
    }
    body.push(el(`<p class="t-label" style="margin:var(--s-4) 0 var(--s-2)">By obstacle</p>`));
    for (const p of list) {
      body.push(el(`<div class="stat-line"><span style="font-size:var(--fs-micro)">${esc(p.obstacle)}</span>
        <b style="font-weight:400;font-size:var(--fs-micro)">${passiveLine(p.name, p.value, p.scope)}</b></div>`));
    }
  }
  sheet("Global Active Passives", "Everything the standing course is granting the whole game.", body);
}

/* =========================================================================
   BLUEPRINTS
   ========================================================================= */

function blueprintSheet(ctx, mode) {
  const { game, toast, render } = ctx;
  const st = courseState(game, true);
  const body = [];
  st.blueprints.forEach((bp, i) => {
    const names = bp ? bp.course.filter(Boolean).map((id) => OBSTACLE_BY_ID.get(id).name) : [];
    const cost = bp && mode === "load" ? blueprintCost(game, i) : null;
    const sub = bp
      ? `${names.length} obstacles · ${esc(names.slice(0, 3).join(", "))}${names.length > 3 ? "…" : ""}`
      : "Empty";
    const row = el(`<div class="row-card">
      ${mark(`bp-${i}`, `B${i + 1}`)}
      <span class="row-card__body">
        <span class="row-card__title">${esc(bp ? bp.name : `Blueprint ${i + 1}`)}</span>
        <span class="row-card__sub">${sub}</span>
        ${cost ? `<span class="row-card__meta u-tnum" style="display:block">${cost.cogs ? `${num(cost.cogs)} Cogs to build` : "Already standing"}</span>` : ""}
      </span>
      <span class="row-card__right"><button class="btn-gold btn-gold--sm" type="button">${mode === "save" ? "Save" : "Load"}</button></span>
    </div>`);
    row.querySelector("button").onclick = () => {
      const why = mode === "save" ? saveBlueprint(game, i) : loadBlueprint(game, i);
      if (why) return toast(why, "bad");
      toast(mode === "save" ? "Blueprint saved" : "Blueprint built");
      document.querySelector(".scrim")?.remove();
      render();
    };
    body.push(row);
  });
  sheet(mode === "save" ? "Save Blueprint" : "Load Blueprint",
    mode === "save"
      ? "Saving is free. It records the course as it stands."
      : "Loading builds everything missing, at today's prices.", body);
}

/* =========================================================================
   THE EIGHT SLOTS
   ========================================================================= */

function slotRow(ctx, slot) {
  const { game, render, toast } = ctx;
  const lv = game.skillLevel(SKILL);
  const locked = lv < slot.level;
  const id = game.state.agility?.course[slot.index] || null;
  const o = id ? OBSTACLE_BY_ID.get(id) : null;
  const isNow = running(game) && game.state.action?.recipeId === id;

  const sub = locked
    ? `Requires Level ${slot.level}`
    : o ? o.text : "Empty — tap to choose an obstacle";
  const meta = o && !locked
    ? `${secs((game.actionIntervalTicks(SKILL, o.id) * TICK_MS) / 1000)} · ${int(o.xp)} XP · ${num(o.cogs)} Cogs · mastery ${game.masteryLevel(SKILL, o.id)}`
    : "";

  const row = el(`<button class="row-card${locked ? " is-locked" : ""}${isNow ? " is-active" : ""}" type="button"${locked ? " disabled" : ""}>
    ${mark(o ? o.id : `slot-${slot.index}`, o ? initials(o.name) : String(slot.index + 1))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(slot.name)}${o ? ` — ${esc(o.name)}` : ""}${isNow ? '<span class="badge badge--on">Running</span>' : ""}</span>
      <span class="row-card__sub" style="white-space:normal;display:block">${esc(sub)}</span>
      ${meta ? `<span class="row-card__meta u-tnum" style="display:block">${meta}</span>` : ""}
    </span>
    <span class="row-card__right">
      <span class="row-card__lvl u-tnum">${slot.level}</span><span class="row-card__lvl-cap">slot req</span>
    </span></button>`);
  if (!locked) row.onclick = () => designSheet(ctx, slot);
  return row;
}

function designSheet(ctx, slot) {
  const { game, toast, render } = ctx;
  const body = [];
  const standing = game.state.agility?.course[slot.index] || null;

  for (const o of obstaclesForSlot(slot.index)) {
    const c = buildCost(game, o.id);
    const why = canBuild(game, o.id);
    const here = standing === o.id;
    const row = el(`<div class="row-card${here ? " is-active" : ""}">
      ${mark(o.id, initials(o.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(o.name)}${here ? '<span class="badge badge--on">Built</span>' : ""}</span>
        <span class="row-card__sub" style="white-space:normal;display:block">${o.mods.map(([n, v, s]) => passiveLine(n, v, s === "skill" ? SKILL : s)).join(" · ")}</span>
        <span class="row-card__meta u-tnum" style="display:block">${o.interval}s · ${int(o.xp)} XP · ${num(o.cogs)} Cogs · needs level ${o.level}</span>
        <span class="row-card__meta u-tnum" style="display:block">Build: ${num(c.cogs)} Cogs + ${int(c.material[1])}× ${esc(DB.item(c.material[0]).name)}${c.cut ? ` (-${(c.cut * 100).toFixed(0)}%)` : ""}</span>
      </span>
      <span class="row-card__right">
        <button class="btn-gold btn-gold--sm" type="button"${why || here ? " disabled" : ""}>${here ? "Built" : why ? shortWhy(why) : "Build"}</button>
      </span></div>`);
    if (!why && !here) row.querySelector("button").onclick = () => {
      const err = build(game, o.id);
      if (err) return toast(err, "bad");
      toast(`Built ${o.name}`, "violet");
      document.querySelector(".scrim")?.remove();
      render();
    };
    body.push(row);
  }

  if (standing) {
    const b = el(`<button class="btn-ghost" type="button" style="width:100%;margin-top:var(--s-2)">Demolish ${esc(OBSTACLE_BY_ID.get(standing).name)}</button>`);
    b.onclick = () => {
      demolish(game, slot.index);
      toast("Obstacle demolished");
      document.querySelector(".scrim")?.remove();
      render();
    };
    body.push(b);
  }

  sheet(slot.name,
    `Requires Agility ${slot.level}. Rebuilding costs the full price again.`, body);
}

const shortWhy = (w) =>
  w.includes("level") || w.includes("locked") ? "Locked" : w.includes("Cogs") ? "Too costly" : "Materials";

/* =========================================================================
   THE VIEW
   ========================================================================= */

function render(ctx, skill) {
  /* Every other `route` skill — Exploration today — keeps the flat action
     list it already had. See the header. */
  if (skill.id !== SKILL) return gather.render(ctx, skill);
  ensureHooks(ctx.game);

  const out = [coursePanel(ctx)];
  out.push(el(`<p class="sect">Obstacles — ${SLOTS.length} slots</p>`));
  for (const s of SLOTS) out.push(slotRow(ctx, s));
  out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(skill.blurb)}</p>`));
  return out;
}

function paint(ctx, skill) {
  if (skill.id !== SKILL) return gather.paint?.(ctx, skill);
  const { game } = ctx;
  const a = game.state.action;
  const bar = document.getElementById("agBar");
  const status = document.getElementById("agStatus");
  if (!bar || !status) return;

  if (a && a.skillId === SKILL && !game.state.combat) {
    const o = OBSTACLE_BY_ID.get(a.recipeId);
    const pct = a.intervalTicks > 0 ? (1 - a.ticks / a.intervalTicks) * 100 : 0;
    bar.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
    const st = game.state.agility;
    const text = `${o ? o.name : "Obstacle"} — ${secs((a.ticks * TICK_MS) / 1000)} to go · slot ${(st?.cursor ?? 0) + 1} · ${int(st?.laps || 0)} laps`;
    if (status.textContent !== text) status.textContent = text;
  } else {
    bar.style.setProperty("--fill", "0%");
    const idle = "Information about your course will display here.";
    if (status.textContent !== idle) status.textContent = idle;
  }
}

export default { kind: "route", render, paint };
