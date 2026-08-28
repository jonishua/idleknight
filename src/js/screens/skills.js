/* =========================================================================
   EMBERVEIL — SCREEN: SKILLS  (nav tab "skills")

   Two jobs, and it does nothing else.

   1. THE MENU (parity §1). The skill list is the game's menu, in the
      reference's own three blocks — COMBAT, PASSIVE, NON-COMBAT — with every
      skill showing `(current / 99)`. The reference's critical finding is
      reproduced exactly: the combat skills are NOT separate screens. They are
      levels, and tapping one lands on the Combat screen.

   2. THE DISPATCHER (parity §2). Opening a skill renders the universal skill
      header — the identical block every skill page in the reference opens
      with — and then hands the body to the view registered for that skill's
      `kind` in ./skill-views/registry.js. This file knows about exactly one
      view module: the registry. Adding an archetype does not touch it.

   NOTE: not to be confused with ./skill.js (singular), which is the
   standalone skills.html design mockup and shares no code with this file.
   ========================================================================= */

import { DB } from "../engine/index.js";
import { el, esc, num, int, hms, mark, initials, xpPct, xpPair, prefs, backRow } from "./ui.js";
import { viewFor } from "./skill-views/registry.js";
import { poolLine, poolPct, checkpointSheet, spendSheet, guideSheet } from "./mastery.js";
import { openAt } from "./settings.js";

/* Which skill's page is open, or null for the menu. */
let openSkill = null;

/* Deep-link support, mirroring ./settings.js: the shell calls reset() when the
   tab is entered, AFTER whoever routed here has already named a skill, so the
   request has to survive one reset. */
let pending = null;

/** Open straight onto a skill page: openSkillAt("delving"); goTab("skills"). */
export function openSkillAt(id) { pending = DB.skill(id) ? id : null; }

/** Which skill page is showing, or null on the menu — for the URL hash. */
export const currentSkill = () => openSkill;

/* =========================================================================
   1. THE MENU
   ========================================================================= */

/**
 * The reference's blocks, in the reference's order.
 *
 * NON-COMBAT is deliberately "everything else" rather than a list of kinds.
 * A new skill archetype landing in src/data/skills/ must show up in the menu
 * on the day it lands — a menu that silently drops a skill because nobody
 * added its kind to an allow-list here is the exact bug this shape prevents.
 */
const BLOCKS = [
  ["Combat", (s) => s.kind === "combat" || s.id === "vitality"],
  ["Passive", (s) => s.passive || (s.kind === "passive" && s.id !== "vitality")],
  ["Non-Combat", (s) => !(s.kind === "combat" || s.id === "vitality") && s.kind !== "passive" && !s.passive],
];

/** §1's critical finding: the combat skills are levels, not pages. */
const routesToCombat = (s) => s.kind === "combat" || s.id === "vitality";

/**
 * The reference's menu does not print the same sub-line under every combat
 * skill. Three of the eight carry a live resource beside the level, and the
 * capture records exactly which:
 *
 *     Hitpoints(800)                 -> Vitality, current HP
 *     Prayer (shows prayer points)   -> Devotion, the point pool
 *     Slayer (shows slayer coins)    -> Bounties, the contract currency
 *
 * Those three are the only combat skills with a spendable pool behind them,
 * which is why they and only they get a number. The other five are pure stat
 * contributions and say so.
 */
function combatSub(game, s) {
  const st = game.state;
  switch (s.id) {
    case "vitality":  return `${num(st.combat ? st.combat.pHp : game.maxHp())} / ${num(game.maxHp())} HP`;
    case "devotion":  return `${num(Math.floor(st.prayer))} devotion points`;
    case "bounties":  return `${num(st.marks)} bounty marks`;
    default:          return "Opens the Combat screen";
  }
}

function skillRow(ctx, s) {
  const { game, render } = ctx;
  const lv = game.skillLevel(s.id);
  const pct = xpPct(game.skillXp(s.id), lv);
  const running = game.state.action?.skillId === s.id;
  const combatBound = routesToCombat(s);
  const actions = s.recipes?.length || 0;
  const sub = combatBound
    ? combatSub(game, s)
    : s.mastery
      ? `${actions} actions · pool ${num(game.poolCapFor(s.id))} XP`
      : actions ? `${actions} actions` : (s.blurb || "");

  const b = el(`<button class="row-card${running ? " is-active" : ""}" type="button">
    ${mark(s.id, initials(s.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(s.name)}${running ? '<span class="badge badge--on">Running</span>' : ""}</span>
      <span class="row-card__sub" style="display:block">${esc(sub)}</span>
      <span class="bar bar--sm" style="margin-top:6px"><span class="bar__fill" style="--fill:${pct.toFixed(1)}%"></span></span>
    </span>
    <span class="row-card__right"><span class="row-card__lvl u-tnum">${lv}</span>
      <span class="row-card__lvl-cap">/ ${game.levelCap}</span></span>
  </button>`);
  b.onclick = combatBound
    ? () => ctx.goTab("combat")
    : () => { openSkill = s.id; render(); };
  return b;
}

/** §1's OTHER block: everything in the menu that is not a skill. */
function otherBlock(ctx) {
  const { game } = ctx;
  const p = prefs(game);
  const totalLevel = DB.skills.reduce((n, s) => n + game.skillLevel(s.id), 0);
  const found = Object.keys(p.found).length;

  const items = [
    ["completion", "Completion Log", `${found} / ${DB.items.size} items found`, "i-crown"],
    ["stats", "Statistics", `${int(totalLevel)} total level`, "i-insight"],
    ["settings", "Settings", "Save, offline and display", "i-cog"],
    ["guide", "Game Guide", "The tick, the XP curve and the mastery pool", "i-insight"],
  ];
  return items.map(([id, name, sub]) => {
    const b = el(`<button class="row-card" type="button">
      ${mark(id, initials(name))}
      <span class="row-card__body"><span class="row-card__title">${esc(name)}</span>
        <span class="row-card__sub" style="display:block">${esc(sub)}</span></span>
      <span class="row-card__right"><span class="row-card__lvl-cap">open</span></span></button>`);
    b.onclick = () => { openAt(id); ctx.goTab("settings"); };
    return b;
  });
}

/**
 * §1 prints one thing above the COMBAT block that is not a skill:
 * `Combat Level 96`. It is derived from the eight combat levels rather than
 * trained directly, so it belongs on the block and not in it.
 */
function blockHead(ctx, title) {
  if (title !== "Combat") return el(`<p class="sect">${esc(title)}</p>`);
  return el(`<p class="sect" style="display:flex;justify-content:space-between;gap:var(--s-2)">
    <span>Combat</span>
    <span class="u-tnum" style="color:var(--c-text-2)">Combat Level ${int(ctx.game.combatLevel())}</span>
  </p>`);
}

function menu(ctx) {
  const out = [];
  for (const [title, test] of BLOCKS) {
    const list = DB.skills.filter(test);
    if (!list.length) continue;
    out.push(blockHead(ctx, title));
    for (const s of list) out.push(skillRow(ctx, s));
  }
  out.push(el(`<p class="sect">Other</p>`));
  out.push(...otherBlock(ctx));
  return out;
}

/* =========================================================================
   2. THE UNIVERSAL SKILL HEADER  (parity §2)

   `<Skill name>            Game Guide
    Last Cloud Save : 0h 3m 9s   [Force Save]   ADEPT
    Skill Level      99 / 99
    Skill XP         581,032 / 605,032
    <mastery pool bar>  15,500,000 / 15,500,000 (100.00%) XP
    [View Checkpoints]  [Spend Mastery Pool XP]`

   Every value is live and every one is painted in place each tick. The pool
   block is omitted for skills that carry no mastery track — the reference's
   own header only appears on skills that have one.
   ========================================================================= */

function header(ctx, skill) {
  const { game, save, toast } = ctx;
  const p = prefs(game);
  const lv = game.skillLevel(skill.id);
  const xp = game.skillXp(skill.id);
  const cap = game.levelCap;

  const pool = skill.mastery ? `
    <div class="divider" style="margin:var(--s-3) 0"></div>
    <div class="row--between" style="margin-bottom:6px">
      <p class="t-label">Mastery Pool</p>
      <p class="t-micro u-tnum" id="skPool" style="color:var(--c-text-2)">${poolLine(game, skill.id)}</p>
    </div>
    <div class="bar bar--violet"><div class="bar__fill" id="skPoolBar" style="--fill:${poolPct(game, skill.id).toFixed(1)}%"></div></div>
    <div class="btn-row" style="margin-top:var(--s-3)">
      <button class="btn-ghost" type="button" id="skCheck" style="flex:1 1 0;font-size:var(--fs-micro)">View Checkpoints</button>
      <button class="btn-ghost" type="button" id="skSpend" style="flex:1 1 0;font-size:var(--fs-micro)">Spend Mastery Pool XP</button>
    </div>` : "";

  const node = el(`<section class="panel">
    <div class="row--between">
      <p class="t-value-lg" style="font-family:var(--ff-display);letter-spacing:var(--ls-tight)">${esc(skill.name)}</p>
      <button class="btn-ghost" type="button" id="skGuide" style="flex:0 0 auto;font-size:var(--fs-micro)">Game Guide</button>
    </div>
    <div class="row--between" style="margin:6px 0 var(--s-3)">
      <p class="t-micro u-tnum" style="color:var(--c-text-2)">Last Cloud Save : <span id="skSave">${hms(0)}</span></p>
      <button class="btn-ghost" type="button" id="skForce" style="flex:0 0 auto;padding:4px var(--s-2);font-size:var(--fs-micro)">Force Save</button>
      <p class="t-micro" style="color:var(--c-text-2);letter-spacing:var(--ls-label);text-transform:uppercase">${esc(p.name)}</p>
    </div>
    <div class="stat-line"><span>Skill Level</span><b class="u-tnum" id="skLevel">${lv} / ${cap}</b></div>
    <div class="stat-line"><span>Skill XP</span><b class="u-tnum" id="skXp">${xpPair(Math.floor(xp), lv, cap)}</b></div>
    <div class="bar" style="margin-top:var(--s-2)"><div class="bar__fill" id="skXpBar" style="--fill:${xpPct(xp, lv).toFixed(1)}%"></div></div>
    ${pool}
  </section>`);

  node.querySelector("#skGuide").onclick = () => guideSheet(ctx, skill.id);
  node.querySelector("#skForce").onclick = () => { save(); toast("Saved"); };
  if (skill.mastery) {
    node.querySelector("#skCheck").onclick = () => checkpointSheet(ctx, skill.id);
    node.querySelector("#skSpend").onclick = () => spendSheet(ctx, skill.id);
  }
  return node;
}

/* =========================================================================
   3. THE PAGE
   ========================================================================= */

function page(ctx, id) {
  const skill = DB.skill(id);
  const view = viewFor(skill.kind);
  return [
    backRow("All skills", () => { openSkill = null; ctx.render(); }),
    header(ctx, skill),
    ...view.render(ctx, skill),
  ];
}

function paint(ctx) {
  if (!openSkill) return;
  const { game } = ctx;
  const skill = DB.skill(openSkill);
  const cap = game.levelCap;
  const lv = game.skillLevel(openSkill);
  const xp = game.skillXp(openSkill);

  const set = (id, v) => { const n = document.getElementById(id); if (n && n.textContent !== v) n.textContent = v; };
  const fill = (id, v) => { const n = document.getElementById(id); if (n) n.style.setProperty("--fill", `${v.toFixed(1)}%`); };

  set("skSave", hms((Date.now() - (game.state.lastSaveAt || Date.now())) / 1000));
  set("skLevel", `${lv} / ${cap}`);
  set("skXp", xpPair(Math.floor(xp), lv, cap));
  fill("skXpBar", xpPct(xp, lv));
  if (skill.mastery) {
    set("skPool", poolLine(game, openSkill));
    fill("skPoolBar", poolPct(game, openSkill));
  }
  viewFor(skill.kind).paint?.(ctx, skill);
}

export default {
  id: "skills",
  label: "Skills",
  render: (ctx) => (openSkill ? page(ctx, openSkill) : menu(ctx)),
  /* On the MENU the shell's panels are the only progress readout there is.
     On a skill PAGE §2's header carries the same level, the same XP pair and
     the same bar, so the shell's copy is 220px of duplication between the
     player and the recipe list. */
  chrome: () => !openSkill,
  paint,
  reset: () => { openSkill = pending; pending = null; },
};
