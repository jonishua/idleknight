/* =========================================================================
   EMBERVEIL — SCREEN: COMPLETION LOG   (parity §3m)

       True Completion 25.66%
         Skills 49.03% | Mastery 12.58% | Items 24.67% | Monsters 22.36% | Pets 19.64%
       Total Items Found: 316 / 1,281 (24.67%)
       [Show All] [Show Discovered Items] [Show Undiscovered Items]

   Five axes, averaged into one number. Four of them are already in the save —
   skill levels, mastery levels, bound Wardens — and can be read straight off
   the engine. The fifth and sixth are not: nothing in the engine records that
   you once HELD an item or once KILLED a particular monster, because neither
   fact changes the simulation.

   THE DISCOVERY LEDGER
   --------------------
   So this screen keeps one, and owning it is the right call: a completion log
   is precisely a record of what you have seen. It lives in the UI slice of
   the save (see ./ui.js) and is folded from three sources:

     · everything currently in the reliquary,
     · game.produced — the engine's runtime tally of everything made or
       dropped this session, which catches items that were auto-sold before
       they were ever banked,
     · the monster you are engaged with, at the moment the kill counter moves.

   The fold runs once a second from a sampler installed at import, not from a
   screen's paint, because drops happen while you are looking at the Combat
   screen and a ledger that only updates on the screen that displays it would
   be worse than no ledger. One pass over a few dozen keys per second is
   nothing next to the 20Hz tick loop.

   PETS -> WARDENS. Emberveil has no pets. Its collectible set of the same
   shape is the nine Ascension Rites — nine Wardens, bound one at a time — so
   that is the axis this log carries in the fifth slot.
   ========================================================================= */

import { DB, SKILL_CAP, MASTERY_CAP } from "../engine/index.js";
import { el, esc, num, int, pct2, mark, initials, prefs, segmented, statSplit } from "./ui.js";

/* =========================================================================
   THE LEDGER
   ========================================================================= */

let lastKills = null;

/** Fold everything currently knowable into the discovery ledger. */
export function noteDiscoveries(game) {
  if (!game || !game.state) return;
  const p = prefs(game);
  for (const [id, n] of Object.entries(game.state.items)) if (n > 0) p.found[id] = 1;
  if (game.produced) for (const id of game.produced.keys()) p.found[id] = 1;

  const kills = game.state.stats.kills;
  if (lastKills === null) lastKills = kills;
  if (kills > lastKills && game.state.combat) p.slain[game.state.combat.monsterId] = 1;
  lastKills = kills;
}

/* The sampler. Browser only — importing this module in a CLI tool must not
   leave a live timer holding the process open. */
if (typeof window !== "undefined") {
  window.setInterval(() => {
    try { noteDiscoveries(globalThis.game); } catch { /* pre-boot, nothing to fold */ }
  }, 1000);
}

/* =========================================================================
   THE FIVE AXES
   ========================================================================= */

export function completion(game) {
  const p = prefs(game);

  let levels = 0;
  for (const s of DB.skills) levels += game.skillLevel(s.id);
  const skills = Math.min(1, levels / (DB.skills.length * SKILL_CAP));

  let mastery = 0, masteryMax = 0;
  for (const s of DB.masterySkills) {
    mastery += game.totalMastery(s.id);
    masteryMax += s.recipes.length * MASTERY_CAP;
  }

  const foundIds = Object.keys(p.found).filter((id) => DB.items.has(id));
  const slainIds = Object.keys(p.slain).filter((id) => !!DB.monster(id));
  const wardens = DB.ascension.filter((w) => game.state.purchases[w.id]).length;

  const axes = [
    ["Skills", skills, `${int(levels)} / ${int(DB.skills.length * SKILL_CAP)} levels`],
    ["Mastery", masteryMax ? mastery / masteryMax : 0, `${int(mastery)} / ${int(masteryMax)} levels`],
    ["Items", foundIds.length / DB.items.size, `${int(foundIds.length)} / ${int(DB.items.size)}`],
    ["Monsters", slainIds.length / DB.monsters.length, `${slainIds.length} / ${DB.monsters.length}`],
    ["Wardens", wardens / DB.ascension.length, `${wardens} / ${DB.ascension.length}`],
  ];
  const truth = axes.reduce((n, a) => n + a[1], 0) / axes.length;
  return { axes, truth, foundIds, slainIds, levels, mastery, masteryMax };
}

/* =========================================================================
   THE SCREEN
   ========================================================================= */

function axisRow(name, frac, detail) {
  return `<div style="margin-bottom:var(--s-3)">
    <div class="row--between" style="margin-bottom:4px">
      <p class="t-label">${esc(name)}</p>
      <p class="t-micro u-tnum" style="color:var(--c-text-2)">${esc(detail)} · <b style="color:var(--c-gold-core)">${pct2(frac)}</b></p>
    </div>
    <div class="bar bar--sm"><div class="bar__fill" style="--fill:${(frac * 100).toFixed(1)}%"></div></div>
  </div>`;
}

function itemGrid(ctx, c) {
  const { game } = ctx;
  const p = prefs(game);
  const found = new Set(c.foundIds);
  const list = [...DB.items.values()].filter((it) =>
    p.completionFilter === "all" ? true :
    p.completionFilter === "found" ? found.has(it.id) : !found.has(it.id));

  if (!list.length) {
    return el(`<p class="empty">${p.completionFilter === "found"
      ? "Nothing discovered yet. Train a gathering skill."
      : "Everything in the veil has been found."}</p>`);
  }

  list.sort((a, b) => a.value - b.value || a.name.localeCompare(b.name));
  const grid = el(`<div class="bank-grid"></div>`);
  for (const it of list.slice(0, 400)) {
    const seen = found.has(it.id);
    grid.append(el(`<div class="bank-cell" style="${seen ? "" : "opacity:.42"}">
      ${seen ? mark(it.id, initials(it.name)) : mark("unknown", "?")}
      <div class="bank-cell__name" style="margin-top:var(--s-2)">${esc(seen ? it.name : "Undiscovered")}</div>
      <div class="bank-cell__each">${seen ? `${num(it.value)} ea` : esc(it.kind)}</div>
    </div>`));
  }
  return grid;
}

function render(ctx) {
  const { game, render: rerender } = ctx;
  noteDiscoveries(game);
  const p = prefs(game);
  const c = completion(game);

  const head = el(`<section class="panel">
    <p class="t-label">True Completion</p>
    <p class="t-numeral" style="font-size:var(--fs-display);margin:2px 0 var(--s-4)">${pct2(c.truth)}</p>
    ${c.axes.map(([n, f, d]) => axisRow(n, f, d)).join("")}
  </section>`);

  const totals = statSplit([
    ["Items Found", `${int(c.foundIds.length)} / ${int(DB.items.size)}`],
    ["Of Everything", pct2(c.foundIds.length / DB.items.size)],
  ]);

  const filter = segmented(
    [["all", "Show All"], ["found", "Discovered"], ["missing", "Undiscovered"]],
    p.completionFilter,
    (v) => { p.completionFilter = v; rerender(); }
  );

  const mon = el(`<section class="panel panel--tight">${DB.monsters.map((m) => {
    const seen = p.slain[m.id];
    return `<div class="stat-line" style="${seen ? "" : "opacity:.45"}">
      <span>${esc(seen ? m.name : "Unfought")}</span><b>${seen ? "Slain" : `tier ${m.tier}`}</b></div>`;
  }).join("")}</section>`);

  const ward = el(`<section class="panel panel--tight">${DB.ascension.map((w) => {
    const owned = game.state.purchases[w.id];
    return `<div class="stat-line" style="${owned ? "" : "opacity:.45"}">
      <span>${esc(owned ? w.name : "Unbound Warden")}</span><b>${owned ? "Bound" : num(w.cost)}</b></div>`;
  }).join("")}</section>`);

  return [
    head,
    el(`<p class="sect">Total Items Found</p>`),
    totals,
    filter,
    itemGrid(ctx, c),
    el(`<p class="sect">Monsters</p>`), mon,
    el(`<p class="sect">Wardens</p>`), ward,
  ];
}

export default { id: "completion", label: "Completion Log", render };
