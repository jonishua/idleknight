/* =========================================================================
   EMBERVEIL — SCREEN: OTHER  (nav tab "settings")

   §1's OTHER block, and the Settings page that lives at the bottom of it.

       OTHER
         Completion Log   (Skills / Mastery / Items / Monsters / Wardens)
         Statistics
         Settings
         Game Guide

   The reference's OTHER block also carries Golbin Raid, Lore and News &
   Changelog. The first is a minigame, and the other two are prose: none of
   them is a system, so none of them is in scope for a parity build that is
   explicitly not authoring content. The four that ARE systems are all here.

   WHY THEY SHARE ONE TAB. The reference's menu is a scrolling sidebar with
   four labelled sections; ours is a five-slot tab bar on a 390px phone. Four
   of those slots are already spoken for by Shop, Bank, Combat and the skill
   menu — which is exactly the reference's own top level — so OTHER gets the
   fifth, and its pages open inside it. Completion Log and Statistics are each
   a separately registered screen (see ./registry.js), so the day the shell
   grows a wider nav they take a slot without changing a line here.

   SETTINGS ARE REAL SETTINGS. Every switch below changes something the
   simulation or the renderer actually reads: offline combat is the engine's
   own opt-in flag (it can kill you while you are away), auto-sell is the
   Game constructor option, and the number format is the formatter every
   screen in the app shares. Nothing here is decoration.
   ========================================================================= */

import {
  DB, TICK_MS, OFFLINE_CAP_MS, SAVE_VERSION, MIN_INTERVAL_SECONDS, SKILL_CAP,
  ASCENSION_CAP, POOL_PER_RECIPE, POOL_DEPOSIT, POOL_DEPOSIT_CAPPED, CHECKPOINTS,
  INTERVAL_REDUCTION_CAP, PRESERVE_CAP, xpAt,
} from "../engine/index.js";
import { el, esc, num, int, dur, age, prefs, setNumberFormat, backRow, segmented } from "./ui.js";
import completion from "./completion.js";
import stats from "./stats.js";

/* Which page of the block is open. `pending` exists because the shell calls
   reset() when the tab is entered, AFTER openAt() has already been called by
   whoever routed here — so the request has to survive one reset. */
let sub = null;
let pending = null;

/** Deep-link into the block from another screen: openAt("stats"); goTab("settings"). */
export function openAt(id) { pending = id; }

const PAGES = { completion, stats };

/* -------------------------------------------------------------------------
   THE MENU
   ------------------------------------------------------------------------- */

function menu(ctx) {
  const { game, render: rerender } = ctx;
  const p = prefs(game);
  const found = Object.keys(p.found).length;
  let level = 0;
  for (const s of DB.skills) level += game.skillLevel(s.id);

  const items = [
    ["completion", "Completion Log", `${int(found)} / ${int(DB.items.size)} items found`],
    ["stats", "Statistics", `${int(level)} total level · ${dur((game.state.tick * TICK_MS) / 1000)} played`],
    ["settings", "Settings", `${esc(p.name)} · ${age(Date.now() - p.createdAt)} old`],
    ["guide", "Game Guide", "How the tick, the XP curve and the mastery pool work"],
  ];

  const out = [el(`<p class="sect">Other</p>`)];
  for (const [id, name, detail] of items) {
    const b = el(`<button class="row-card" type="button">
      <span class="row-card__body"><span class="row-card__title">${esc(name)}</span>
        <span class="row-card__sub" style="display:block;white-space:normal">${detail}</span></span>
      <span class="row-card__right"><span class="row-card__lvl-cap">open</span></span></button>`);
    b.onclick = () => { sub = id; document.getElementById("screen").scrollTop = 0; rerender(); };
    out.push(b);
  }
  return out;
}

/* -------------------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------------------- */

function toggleRow(title, detail, on, onClick) {
  const b = el(`<button class="row-card" type="button">
    <span class="row-card__body"><span class="row-card__title">${esc(title)}</span>
      <span class="row-card__sub" style="display:block;white-space:normal">${esc(detail)}</span></span>
    <span class="row-card__right">
      <span class="badge${on ? " badge--on" : ""}">${on ? "On" : "Off"}</span></span></button>`);
  b.onclick = onClick;
  return b;
}

function settings(ctx) {
  const { game, render: rerender, toast, save, SAVE_KEY } = ctx;
  const p = prefs(game);
  const out = [];

  /* --- who you are --- */
  out.push(el(`<p class="sect">Adept</p>`));
  const nameRow = el(`<section class="panel panel--tight">
    <p class="t-label" style="margin-bottom:var(--s-2)">Name — shown on every skill page</p>
    <input type="text" maxlength="18" value="${esc(p.name)}"
      style="width:100%;background:var(--c-track);color:var(--c-text-1);border:1px solid var(--c-panel-edge);
             border-radius:var(--r-sm);padding:10px var(--s-3);font:inherit;font-family:var(--ff-sans);font-size:var(--fs-body)">
  </section>`);
  const input = nameRow.querySelector("input");
  input.onchange = () => { p.name = (input.value || "Adept").trim().slice(0, 18) || "Adept"; toast("Name saved"); };
  out.push(nameRow);

  /* --- display --- */
  out.push(el(`<p class="sect">Display</p>`));
  out.push(el(`<section class="panel panel--tight">
    <p class="t-label">Number format</p>
    <p class="t-micro" style="color:var(--c-text-2);margin-bottom:var(--s-1)">The faucet ladder spans eight orders of magnitude; compact keeps it on screen.</p>
  </section>`));
  out.push(segmented([["1", "Compact — 12.4M"], ["0", "Full — 12,400,000"]], p.compact ? "1" : "0",
    (v) => { p.compact = v === "1"; setNumberFormat(p.compact); rerender(); }));

  /* --- play --- */
  out.push(el(`<p class="sect">Play</p>`));
  out.push(toggleRow("Confirm before selling a full stack", "A mis-tap in sell mode can liquidate an hour of gathering.",
    p.confirmSell, () => { p.confirmSell = !p.confirmSell; rerender(); }));
  out.push(toggleRow("Sell gathered items automatically", "Output is converted to Cogs the moment it is made and never touches the reliquary.",
    p.autoSell, () => { p.autoSell = !p.autoSell; game.autoSell = p.autoSell; rerender(); }));
  out.push(toggleRow("Continue combat while away", `Offline combat is replayed for real, and you can die in it. Capped at ${OFFLINE_CAP_MS / 3600000} hours like everything else.`,
    game.state.offlineCombat, () => { game.state.offlineCombat = !game.state.offlineCombat; rerender(); }));

  /* --- the save --- */
  out.push(el(`<p class="sect">Save</p>`));
  out.push(el(`<section class="panel panel--tight">${[
    ["Format version", String(SAVE_VERSION)],
    ["Storage key", SAVE_KEY],
    ["Last save", `${Math.round((Date.now() - (game.state.lastSaveAt || Date.now())) / 1000)}s ago`],
    ["Autosave", "Every 5 seconds"],
    ["Tick rate", `${Math.round(1000 / TICK_MS)} per second`],
    ["Offline cap", `${OFFLINE_CAP_MS / 3600000} hours, replayed tick by tick`],
  ].map(([k, v]) => `<div class="stat-line"><span>${esc(k)}</span><b style="font-size:var(--fs-micro)">${esc(v)}</b></div>`).join("")}</section>`));

  const ctl = el(`<div class="btn-row" style="margin-top:var(--s-3);flex-wrap:wrap">
    <button class="btn-gold btn-gold--sm" type="button" id="stForce" style="flex:1 1 40%">Force Save</button>
    <button class="btn-ghost" type="button" id="stExp" style="flex:1 1 40%;font-size:var(--fs-micro)">Export</button>
    <button class="btn-ghost" type="button" id="stImp" style="flex:1 1 40%;font-size:var(--fs-micro)">Import</button>
    <button class="btn-ghost" type="button" id="stWipe" style="flex:1 1 40%;font-size:var(--fs-micro)">Reset</button>
  </div>`);
  ctl.querySelector("#stForce").onclick = () => { save(); toast("Saved"); rerender(); };
  ctl.querySelector("#stExp").onclick = () => {
    save();
    const text = localStorage.getItem(SAVE_KEY) || "";
    navigator.clipboard?.writeText(text);
    toast(`Save copied — ${num(text.length)} characters`);
  };
  ctl.querySelector("#stImp").onclick = () => {
    const text = prompt("Paste an exported save:");
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed.version !== SAVE_VERSION) throw new Error(`save format ${parsed.version}, expected ${SAVE_VERSION}`);
      localStorage.setItem(SAVE_KEY, text);
      location.reload();
    } catch (e) { toast(`Import failed: ${e.message}`, "bad"); }
  };
  ctl.querySelector("#stWipe").onclick = () => {
    if (!confirm("Wipe this save and start over? Everything is lost.")) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.setItem = () => {};      // stop the unload handler restoring it
    location.reload();
  };
  out.push(ctl);
  return out;
}

/* -------------------------------------------------------------------------
   THE GAME GUIDE

   §1 puts a Game Guide in the OTHER block, above and beyond the per-skill one
   the universal header links to. This is the rulebook: the five constants and
   two formulas that decide everything a player will ever wonder about, read
   off the engine rather than typed in, so it cannot describe a game we no
   longer ship. Change MIN_INTERVAL_SECONDS and this page changes.
   ------------------------------------------------------------------------- */

function table(title, rows) {
  return el(`<section class="panel panel--tight">
    <p class="t-label" style="margin-bottom:var(--s-2)">${esc(title)}</p>
    ${rows.map(([k, v]) => `<div class="stat-line"><span>${esc(k)}</span>
      <b style="font-size:var(--fs-micro);text-align:right;max-width:62%">${esc(v)}</b></div>`).join("")}
  </section>`);
}

function guide(ctx) {
  const { game } = ctx;
  const recipes = DB.masterySkills.reduce((n, s) => n + s.recipes.length, 0);
  return [
    el(`<p class="t-micro" style="color:var(--c-text-2);line-height:var(--lh-body);padding:0 var(--s-1) var(--s-2)">
      Everything below is read from the engine at the moment you open this page. If a number here is
      wrong, the game is wrong — there is no second copy of it.</p>`),

    el(`<p class="sect">The tick</p>`),
    table("One tick is the atomic unit of the whole game", [
      ["Tick length", `${TICK_MS}ms — ${Math.round(1000 / TICK_MS)} per second`],
      ["Shortest action", `${MIN_INTERVAL_SECONDS.toFixed(2)}s, a hard floor`],
      ["Interval rounding", "Every interval is floored to a whole tick"],
      ["Away time", `Replayed tick by tick, capped at ${OFFLINE_CAP_MS / 3600000} hours`],
    ]),

    el(`<p class="sect">Levels</p>`),
    table("XP doubles every seven levels", [
      ["Level cap", `${game.levelCap}${game.levelCap > SKILL_CAP ? " — ascended" : ` (${ASCENSION_CAP} once the ninth Warden is bound)`}`],
      ["XP to level 10", int(xpAt(10))],
      ["XP to level 50", int(xpAt(50))],
      ["XP to level 92", `${int(xpAt(92))} — the halfway point of a 99`],
      ["XP to level 99", int(xpAt(99))],
      ["Skills", `${DB.skills.length}, of which ${DB.masterySkills.length} carry mastery`],
    ]),

    el(`<p class="sect">Mastery</p>`),
    table("Every action masters separately, on the same curve", [
      ["Actions with a mastery track", int(recipes)],
      ["Pool cap", `${int(POOL_PER_RECIPE)} x the skill's action count`],
      ["Paid into the pool", `${Math.round(POOL_DEPOSIT * 100)}% of mastery XP, ${Math.round(POOL_DEPOSIT_CAPPED * 100)}% once the skill is capped`],
      ["Checkpoints", `${CHECKPOINTS.map((c) => `${Math.round(c * 100)}%`).join(" / ")} of the base cap`],
      ["Checkpoints are", "live thresholds — spend below one and it turns off"],
      ["Pool XP buys mastery", "1:1 against the same table"],
    ]),

    el(`<p class="sect">Modifiers</p>`),
    table("One bucket per named modifier, summed, applied once", [
      ["Interval reduction", "Always applied to the BASE interval, never the current one"],
      ["Stacking", "Global and skill-scoped land in the same bucket and are worth the same"],
      ["Flat reductions", "Subtracted after the percentages, unmodified by them"],
      ["Interval reduction cap", `${Math.round(INTERVAL_REDUCTION_CAP * 100)}% summed, then a ${MIN_INTERVAL_SECONDS.toFixed(2)}s floor`],
      ["Preservation cap", `${Math.round(PRESERVE_CAP * 100)}%`],
      ["Signed modifiers", "The strongest sources carry real drawbacks. Read them."],
    ]),

    el(`<p class="sect">The reliquary</p>`),
    table("The sink that introduces itself in the first two minutes", [
      ["Free space", int(game.reliquarySlots() - game.state.clasps)],
      ["First clasp", `${int(DB.claspCost(0))} Cogs`],
      ["All 118 clasps", `${int(DB.claspCumulative(118))} Cogs`],
      ["After that", "A flat price per clasp, forever"],
      ["A full reliquary", "Destroys what will not fit. Watch the Space readout."],
    ]),
  ];
}

/* -------------------------------------------------------------------------
   THE SCREEN
   ------------------------------------------------------------------------- */

const TITLES = { completion: "Completion Log", stats: "Statistics", settings: "Settings", guide: "Game Guide" };

function render(ctx) {
  if (!sub) return menu(ctx);
  const back = backRow("Other", () => { sub = null; ctx.render(); });
  const body = sub === "settings" ? settings(ctx)
    : sub === "guide" ? guide(ctx)
    : PAGES[sub].render(ctx);
  return [back, el(`<p class="sect">${esc(TITLES[sub])}</p>`), ...body];
}

function paint(ctx) {
  if (sub && PAGES[sub]) PAGES[sub].paint?.(ctx);
}

export default {
  id: "settings",
  label: "Other",
  render,
  paint,
  reset: () => { sub = pending; pending = null; },
};
