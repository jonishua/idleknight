/* =========================================================================
   EMBERVEIL — MASTERY POOL UI   (parity §2 buttons, math §2.2 / §2.3)

   The two controls the universal skill header ends with — View Checkpoints
   and Spend Mastery Pool XP — plus the pool readout they share. Not a nav
   screen: these open over whichever skill page is showing, because that is
   the only place the pool means anything.

   THE ONE IDEA THIS UI HAS TO CARRY
   ---------------------------------
   Checkpoints are LIVE THRESHOLDS, not unlocks (§2.3). Spend the pool back
   down below one and the bonus switches off until it is re-earned. Every
   other idle game would latch them, and a latched checkpoint makes the spend
   button free — there would be no decision. So the spend sheet prices each
   purchase in checkpoints as well as in XP: a spend that would drop you under
   a live threshold says so, by name, before you press it.

   THE SECOND SUBTLETY
   -------------------
   The cap you can HOLD is raised by the three Mastery Codices (+25/+50/+25,
   additive to +100%). The XP a checkpoint FIRES at is measured on the base
   cap and never moves. That is the whole point of buying a codex: it makes
   the 95% checkpoint comfortable to hold while still banking XP to spend.
   Both numbers are on screen, labelled, because one without the other is
   actively misleading.
   ========================================================================= */

import {
  DB, xpAt, poolCapBase, checkpointThresholds, CHECKPOINTS, MASTERY_CAP,
} from "../engine/index.js";
import { el, esc, num, int, pct2, sheet, initials, mark } from "./ui.js";

/* -------------------------------------------------------------------------
   READS
   ------------------------------------------------------------------------- */

/** `1,240,000 / 5,000,000 (24.80%) XP` — the header's pool line, verbatim. */
export function poolLine(game, skillId) {
  const pool = game.state.skills[skillId].pool;
  const cap = game.poolCapFor(skillId);
  return `${int(pool)} / ${int(cap)} (${pct2(cap ? pool / cap : 0)}) XP`;
}

export function poolPct(game, skillId) {
  const cap = game.poolCapFor(skillId);
  return cap ? Math.min(100, (game.state.skills[skillId].pool / cap) * 100) : 0;
}

/* -------------------------------------------------------------------------
   VIEW CHECKPOINTS
   ------------------------------------------------------------------------- */

export function checkpointSheet(ctx, skillId) {
  const { game } = ctx;
  const skill = DB.skill(skillId);
  const pool = game.state.skills[skillId].pool;
  const base = poolCapBase(skill.recipes.length);
  const held = game.poolCapFor(skillId);
  const thresholds = checkpointThresholds(skill.recipes.length);
  const active = game.checkpointsFor(skillId);

  const rows = (skill.checkpoints || []).map((cp, i) => {
    const at = thresholds[i];
    const on = active[i];
    const away = Math.max(0, at - pool);
    return el(`<div class="row-card${on ? " is-active" : ""}" style="${on ? "" : "opacity:.62"}">
      <span class="mark${on ? "" : ""}" aria-hidden="true"
        style="background:${on ? "var(--grad-gold-face)" : "var(--c-track)"};color:${on ? "var(--c-ground)" : "var(--c-text-2)"}">${Math.round(CHECKPOINTS[i] * 100)}%</span>
      <span class="row-card__body">
        <span class="row-card__title">${esc(cp.name)}${on ? '<span class="badge badge--on">Live</span>' : ""}</span>
        <span class="row-card__sub" style="display:block;white-space:normal">${esc(cp.text)}</span>
        <span class="row-card__meta u-tnum" style="display:block">${int(at)} pool XP${on ? "" : ` · ${int(away)} to go`}</span>
      </span></div>`);
  });

  const foot = el(`<section class="panel panel--tight" style="margin-top:var(--s-3)">
    <p class="t-micro" style="color:var(--c-text-2);line-height:var(--lh-body)">
      Checkpoints are live thresholds, not unlocks. Spend the pool back below one and the
      bonus turns off until you re-earn it. The thresholds are measured on the base cap
      (${int(base)}), so raising the cap you can hold (${int(held)}) never moves them.
    </p></section>`);

  return sheet(
    `${skill.name} Checkpoints`,
    `${int(pool)} / ${int(held)} (${pct2(held ? pool / held : 0)}) pool XP`,
    [...rows, foot],
    "Done"
  );
}

/* -------------------------------------------------------------------------
   SPEND MASTERY POOL XP
   ------------------------------------------------------------------------- */

/** Highest mastery level `pool` XP can buy for this recipe, 1:1 (§2.2). */
function maxAffordableLevel(game, skillId, recipeId) {
  const pool = game.state.skills[skillId].pool;
  const have = game.masteryXp(skillId, recipeId);
  let lvl = game.masteryLevel(skillId, recipeId);
  while (lvl < MASTERY_CAP && xpAt(lvl + 1) - have <= pool) lvl++;
  return lvl;
}

/** Checkpoints that would switch OFF if `cost` XP left the pool. */
function wouldLose(game, skillId, cost) {
  const skill = DB.skill(skillId);
  const before = game.checkpointsFor(skillId);
  const thresholds = checkpointThresholds(skill.recipes.length);
  const after = game.state.skills[skillId].pool - cost;
  return (skill.checkpoints || []).filter((cp, i) => before[i] && after < thresholds[i]);
}

export function spendSheet(ctx, skillId) {
  const { game, toast, markDirty } = ctx;
  const skill = DB.skill(skillId);

  const body = document.createElement("div");
  const draw = () => {
    body.innerHTML = "";
    const pool = game.state.skills[skillId].pool;
    body.append(el(`<p class="t-label" style="margin-bottom:var(--s-2)">${int(pool)} pool XP available · spent 1:1 against the mastery table</p>`));

    for (const r of skill.recipes) {
      const lvl = game.masteryLevel(skillId, r.id);
      const have = game.masteryXp(skillId, r.id);
      const capped = lvl >= MASTERY_CAP;
      const one = capped ? 0 : Math.max(0, xpAt(lvl + 1) - have);
      const best = maxAffordableLevel(game, skillId, r.id);
      const canOne = !capped && one <= pool;
      /* The +1 rarely crosses a threshold; the "to N" almost always does, and
         it is the button that costs the pool its checkpoints. Warn about
         whichever spend would actually turn a live bonus off, and say which
         button does it — an unlabelled warning next to two buttons is worse
         than none. */
      const lostOne = canOne ? wouldLose(game, skillId, one) : [];
      const lostMax = best > lvl ? wouldLose(game, skillId, Math.max(0, xpAt(best) - have)) : [];
      const lost = lostOne.length ? lostOne : lostMax;
      const which = lostOne.length ? "+1" : `To ${best}`;

      const row = el(`<div class="row-card">
        ${mark(r.produces || r.id, initials(r.name))}
        <span class="row-card__body">
          <span class="row-card__title">${esc(r.name)}</span>
          <span class="row-card__sub u-tnum" style="display:block;white-space:normal">${capped ? "Mastery 99 — capped" : `Mastery ${lvl} -> ${lvl + 1} · ${int(one)} XP`}</span>
          <span class="row-card__meta" style="display:block;white-space:normal">${lost.length
            ? `<span class="badge badge--warn">${which} drops the ${Math.round(lost[0].pct * 100)}% checkpoint — ${esc(lost[0].name)}</span>`
            : (best > lvl + 1 ? `Pool reaches mastery ${best}` : "")}</span>
        </span>
        <span class="row-card__right" style="min-width:74px">
          <button class="btn-gold btn-gold--sm" type="button" data-one style="width:100%;padding:6px 4px"${canOne ? "" : " disabled"}>+1</button>
          <button class="btn-ghost" type="button" data-max style="width:100%;margin-top:6px;padding:6px 4px;font-size:var(--fs-micro)"${best > lvl ? "" : " disabled"}>To ${best}</button>
        </span></div>`);

      const spend = (target) => {
        const cost = Math.max(0, xpAt(target) - game.masteryXp(skillId, r.id));
        const err = game.spendPool(skillId, r.id, target);
        if (err) return toast(err, "bad");
        toast(`${r.name} mastery ${target} — ${num(cost)} pool XP spent`, "violet");
        markDirty();
        draw();
      };
      if (canOne) row.querySelector("[data-one]").onclick = () => spend(lvl + 1);
      if (best > lvl) row.querySelector("[data-max]").onclick = () => spend(best);
      body.append(row);
    }
  };
  draw();

  return sheet(
    `Spend ${skill.name} Pool`,
    "Pool XP buys mastery levels 1:1 — and stops paying checkpoints the moment it drops below one.",
    [body],
    "Done"
  );
}

/* -------------------------------------------------------------------------
   THE GAME GUIDE
   The reference puts a Game Guide link in the top-right of every skill page.
   Ours is generated from the skill's own data, so it can never describe a
   skill the content files no longer ship.
   ------------------------------------------------------------------------- */

export function guideSheet(ctx, skillId) {
  const { game } = ctx;
  const skill = DB.skill(skillId);
  const facts = [];

  const mode = skill.intervalMode;
  facts.push(["Interval", mode === "flat"
    ? `${skill.baseInterval.toFixed(2)}s flat, every action`
    : mode === "range"
      ? "Rolled uniformly inside each action's range, every action"
      : mode === "player" ? "Your attack interval" : "Set per action"]);
  facts.push(["Actions", `${skill.recipes?.length || 0}`]);
  if (skill.mastery) {
    facts.push(["Mastery pool cap", int(poolCapBase(skill.recipes.length))]);
    facts.push(["Mastery XP time", skill.masteryActionTime === "actual"
      ? "The real seconds the action took — so speeding up buys loot, not mastery"
      : skill.masteryActionTime.fixed !== undefined
        ? `${skill.masteryActionTime.fixed}s fixed — so speeding up DOES buy mastery`
        : `${Math.round(skill.masteryActionTime.ofBase * 100)}% of the action's base interval`]);
  }
  if (skill.node) facts.push(["Node HP", `${skill.node.baseHp} + mastery level, regenerating 1 HP every ${skill.node.regenSeconds}s`]);
  if (skill.quality) facts.push(["Success", `${Math.round(skill.quality.successBase * 100)}% + ${(skill.quality.successPerMastery * 100).toFixed(1)}% per mastery level`]);
  if (skill.rareShards) facts.push(["Rare roll", `${(skill.rareShards.chance * 100).toFixed(1)}% chance of Aether Shards`]);

  const panel = el(`<section class="panel panel--tight">${facts
    .map(([k, v]) => `<div class="stat-line"><span>${esc(k)}</span><b style="font-size:var(--fs-micro);text-align:right;max-width:60%">${esc(v)}</b></div>`)
    .join("")}</section>`);

  const unlocks = (skill.masteryUnlocks || []).map((u) =>
    `<div class="stat-line"><span>Mastery ${u.level}</span><b style="font-size:var(--fs-micro);text-align:right;max-width:66%">${esc(u.text)}</b></div>`);

  const body = [panel];
  if (unlocks.length) {
    body.push(el(`<p class="sect">Every action unlocks</p>`));
    body.push(el(`<section class="panel panel--tight">${unlocks.join("")}</section>`));
  }
  body.push(el(`<p class="sect">Skill level</p>`));
  body.push(el(`<section class="panel panel--tight">${[
    ["Now", `${game.skillLevel(skillId)} / ${game.levelCap}`],
    ["XP held", int(game.skillXp(skillId))],
    ["XP to 99", int(Math.max(0, xpAt(99) - game.skillXp(skillId)))],
  ].map(([k, v]) => `<div class="stat-line"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</section>`));

  return sheet(skill.name, skill.blurb || "", body, "Done");
}
