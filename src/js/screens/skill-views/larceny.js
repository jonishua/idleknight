/* =========================================================================
   EMBERVEIL — SKILL VIEW: LARCENY   (parity §3h)

   The reference's Thieving screen, part for part:

     NPC targets grouped by AREA        Low Town, Kiln Yards, Ash Market, …
     per-target PERCEPTION              fixed, and the only number you cannot
                                        improve
     per-target SUCCESS RATE            min(1, (100+Stealth)/(100+Perception))
     per-target MAXIMUM HIT             what it takes off you when it catches you
     a level requirement
     the combat HP BAR and the FOOD     because failure stuns AND damages you
     "Continue on Stun"                 the toggle

   TWO ENTRY POINTS, ONE VIEW. The object at the bottom serves both: it is a
   `kind: "larceny"` view for ../skills.js's dispatcher (which draws §2's
   universal skill header above it), and a full screen registered in
   ../registry.js so the Combat screen's sub-nav can route straight here —
   Larceny shares the hit points, the food and the auto-ward with combat, and
   a player looking after their HP bar should not have to go and find it.

   THE SUCCESS RATE ON EVERY ROW IS THE ENGINE'S OWN. It comes from
   `successFor()` in ../../engine/systems/larceny.js, which is the same
   function the tick loop rolls against. A screen that recomputes a rate is a
   screen that will eventually disagree with the game.
   ========================================================================= */

import { DB } from "../../engine/index.js";
import {
  el, esc, num, int, secs, pct2, mark, initials, sect, statSplit, toolbar, prefs,
} from "../ui.js";
import { successFor, stealthFor, stunTicks } from "../../engine/systems/larceny.js";
import { combatNav } from "../combat.js";

const SKILL = "larceny";

/* =========================================================================
   THE BLOCKS
   ========================================================================= */

function statusPanel(ctx) {
  const { game } = ctx;
  const s = game.state;
  const max = game.maxHp(), hp = game.hp();
  const stun = stunTicks(game);
  const running = s.action?.skillId === SKILL;
  const target = running ? DB.recipe(s.action.recipeId) : null;

  const status = stun > 0
    ? `Stunned — ${secs((stun * 50) / 1000)} left`
    : running ? `Lifting from ${target.name}` : "Nothing underway";

  return el(`<section class="panel">
    <div class="panel__head">
      <p class="t-label">Hit points — shared with combat</p>
      <p class="t-label u-tnum" id="lcStatus">${esc(status)}</p>
    </div>
    <p class="t-value u-tnum" id="lcHpTxt">${int(hp)} / ${int(max)} HP</p>
    <div class="bar" role="progressbar" aria-label="Hit points">
      <div class="bar__fill" id="lcHpBar" style="--fill:${((hp / max) * 100).toFixed(1)}%"></div>
    </div>
  </section>`);
}

function foodPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const s = game.state;
  const held = Object.keys(s.items)
    .filter((i) => DB.items.get(i)?.kind === "provision" && s.items[i] > 0)
    .sort((a, b) => DB.item(b).heal - DB.item(a).heal);
  if (!held.length) {
    return el(`<div class="row-card"><span class="row-card__body">
      <span class="row-card__title badge--warn">No food</span>
      <span class="row-card__sub">A caught lift hits for real. Without provisions this skill will kill you.</span>
    </span></div>`);
  }
  const chosen = held.includes(s.food) ? s.food : held[0];
  const it = DB.item(chosen);
  return el(`<div class="row-card">${mark(chosen, initials(it.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(it.name)}</span>
      <span class="row-card__sub">(${num(s.items[chosen])}) +${int(it.heal)} HP · eaten automatically</span>
    </span></div>`);
}

function stunToggle(ctx) {
  const { game, render: rerender } = ctx;
  const l = game.state.larceny;
  const b = el(`<button class="row-card" type="button">
    <span class="row-card__body">
      <span class="row-card__title">Continue on Stun</span>
      <span class="row-card__sub">${l.continueOnStun
        ? "Serve the three seconds and carry on."
        : "Being caught ends the session — safer above your level."}</span>
    </span>
    <span class="badge${l.continueOnStun ? " badge--on" : ""}">${l.continueOnStun ? "On" : "Off"}</span></button>`);
  b.onclick = () => { l.continueOnStun = !l.continueOnStun; rerender(); };
  return b;
}

/* =========================================================================
   THE TARGET LIST, GROUPED BY AREA
   ========================================================================= */

function targets(ctx, skill) {
  const { game, render: rerender, toast, markDirty, TICK_MS } = ctx;
  const lvl = game.skillLevel(SKILL);
  const out = [];
  let area = null;

  for (const r of skill.recipes) {
    if (r.area !== area) {
      area = r.area;
      out.push(sect(area));
    }
    const locked = lvl < r.level;
    const running = game.state.action?.recipeId === r.id;
    const success = successFor(game, r);
    const stealth = stealthFor(game, r);
    const ivl = locked ? skill.baseInterval : (game.actionIntervalTicks(SKILL, r.id) * TICK_MS) / 1000;
    const mastery = game.masteryLevel(SKILL, r.id);

    const b = el(`<button class="row-card${locked ? " is-locked" : ""}${running ? " is-active" : ""}" type="button"${locked ? " disabled" : ""}>
      ${mark(r.id, initials(r.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(r.name)}${running ? '<span class="badge badge--on">Lifting</span>' : ""}</span>
        <span class="row-card__sub">${locked
          ? `Unlocks at level ${r.level}`
          : `Success Rate: ${pct2(success)} · Maximum Hit: ${int(r.maxHit)}`}</span>
        ${locked ? "" : `<span class="row-card__meta">Perception ${r.perception} · ${secs(ivl)} · ${r.xp} xp · ${num(r.cogs)} cogs · stealth ${int(stealth)} · mastery ${mastery}</span>`}
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${r.level}</span><span class="row-card__lvl-cap">req</span></span>
    </button>`);
    if (!locked) b.onclick = () => {
      game.start(SKILL, r.id);
      markDirty();
      toast(`Working ${r.name} — ${pct2(success)} success`);
    };
    out.push(b);
  }
  return out;
}

/* =========================================================================
   RENDER
   ========================================================================= */

function body(ctx, skill) {
  const { game, render: rerender, toast } = ctx;
  const l = game.state.larceny;
  const out = [];

  out.push(statSplit([
    ["Attempts", num(l.attempts)],
    ["Caught", num(l.caught)],
    ["Success", l.attempts ? pct2(1 - l.caught / l.attempts) : "—"],
  ]));
  out.push(statusPanel(ctx));
  out.push(foodPanel(ctx));
  out.push(stunToggle(ctx));
  if (game.state.action?.skillId === SKILL) {
    out.push(toolbar([{ text: "Stop", onClick: () => { game.stop(); toast("Stopped"); rerender(); } }]));
  }
  out.push(...targets(ctx, skill));
  return out;
}

function paint(ctx) {
  const { game, set, fill } = ctx;
  const s = game.state;
  const max = game.maxHp(), hp = game.hp();
  set("lcHpTxt", `${int(hp)} / ${int(max)} HP`);
  fill("lcHpBar", (hp / max) * 100);
  const stun = stunTicks(game);
  const running = s.action?.skillId === SKILL;
  set("lcStatus", stun > 0
    ? `Stunned — ${secs((stun * 50) / 1000)} left`
    : running ? `Lifting from ${DB.recipe(s.action.recipeId).name}` : "Nothing underway");
}

/* -------------------------------------------------------------------------
   TWO EXPORTS, ONE VIEW.

   The DEFAULT is the skill-view object ../skills.js's dispatcher wants: it
   renders the body only, because the dispatcher owns §2's universal header
   and two mastery pool bars on one page is the exact bug that registry
   prevents.

   `screen` is the same body wrapped as a nav-routable screen, registered in
   ../registry.js so the Combat sub-nav can jump straight here. It draws its
   own one-line heading in place of the dispatcher's header.
   ------------------------------------------------------------------------- */

export default { kind: "larceny", render: body, paint };

export const screen = {
  id: SKILL,
  label: "Larceny",
  render(ctx) {
    prefs(ctx.game);
    const skill = DB.skill(SKILL);
    const lvl = ctx.game.skillLevel(SKILL);
    return [
      combatNav(ctx, SKILL),
      el(`<p class="sect">${esc(skill.name)} — level ${lvl} / ${ctx.game.levelCap}</p>`),
      ...body(ctx, skill),
    ];
  },
  paint,
};
