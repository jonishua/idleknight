/* =========================================================================
   EMBERVEIL — SKILL VIEW: SETTLEMENT   (parity §3d)

   §3d is two screens in one, and the first one only ever appears once:

     "Opens on a one-time Worship choice: None, Aeris, Glacia, Terran,
      Ragnar, Bane — changeable later for 50M."
                                — six options, taken before anything can be
                                  built, and afterwards only for 50,000,000
                                  Cogs. Ours are named for the thing
                                  worshipped rather than for a god, because
                                  the reference's five are its own invented
                                  proper nouns.
     "Then a town-building screen with Toggle Info / Toggle Resources."
                                — both toggles, both real, both remembered.
     "Ticks passively in the background."
                                — one town tick every five minutes, run by
                                  ../../engine/systems/settlement.js through
                                  the same loop that runs everything else, so
                                  a day away is 288 ticks resolved exactly.

   THE LEDGER IS THE POINT. A resource screen that only shows stock counts
   makes a town look like a row of numbers going up. This one shows what the
   LAST TICK did to every line — produced, consumed, net — so the closed loop
   (cottages -> workers -> farmland -> food -> cottages) is legible on the
   screen rather than only in the code.
   ========================================================================= */

import { el, esc, num, int, dur, sect, toolbar, sheet, line } from "../ui.js";
import {
  BUILDINGS, RESOURCES, WORSHIPS, WORSHIP_BY_ID, RESOURCE_BY_ID,
  TOWN_TICK_SECONDS, WORSHIP_CHANGE_COST,
} from "../../../data/settlement.js";
import * as town from "../../engine/systems/settlement.js";

/* This view's own state; the shell resets it when the tab is entered. */
let showInfo = true;
let showResources = true;

/* =========================================================================
   1. THE ONE-TIME WORSHIP CHOICE
   ========================================================================= */

function worshipCard(ctx, w, current, onPick) {
  const { game } = ctx;
  const chosen = current === w.id;
  const bits = [];
  if (w.bonus) bits.push(`<span style="color:var(--c-gold-core)">${esc(w.bonus.text)}</span>`);
  if (w.drawback) bits.push(`<span style="color:var(--c-violet-light)">${esc(w.drawback.text)}</span>`);
  if (!bits.length) bits.push(`<span style="color:var(--c-text-2)">No bonus, no cost</span>`);

  const b = el(`<button class="row-card${chosen ? " is-active" : ""}" type="button">
    ${markFor(w.id, w.name)}
    <span class="row-card__body">
      <span class="row-card__title">${esc(w.name)}${chosen ? '<span class="badge badge--on">Patron</span>' : ""}</span>
      <span class="row-card__sub" style="display:block">${esc(w.text)}</span>
      <span class="row-card__meta" style="display:block">${bits.join(" · ")}</span>
    </span>
    <span class="row-card__right"><span class="row-card__lvl-cap">${chosen ? "current" : "choose"}</span></span>
  </button>`);
  b.onclick = () => onPick(w.id);
  return b;
}

/** A tinted initials block — the shared placeholder mark, no new art. */
function markFor(id, name) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  const initials = name.split(/[\s'-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return `<span class="mark" aria-hidden="true"
    style="background:linear-gradient(160deg,hsl(${h} 48% 58%),hsl(${(h + 38) % 360} 44% 34%))">${esc(initials)}</span>`;
}

function foundingScreen(ctx) {
  const { game, render, toast } = ctx;
  const out = [
    el(`<section class="panel">
      <p class="t-label">Before anything is built</p>
      <p class="t-body" style="margin-top:6px">Choose a patron for the settlement. Every choice carries a
      bonus and a cost, both of which fade in as the town's shrines accrue worship. It can be changed
      later, but the fee is <b class="u-gold u-tnum">${int(WORSHIP_CHANGE_COST)} Cogs</b>.</p>
    </section>`),
    sect("Worship"),
  ];
  for (const w of WORSHIPS) {
    out.push(worshipCard(ctx, w, null, (id) => {
      const why = town.found(game, id);
      if (why) return toast(why, "bad");
      toast(`${WORSHIP_BY_ID.get(id).name} — the settlement is founded`, "violet");
      render();
    }));
  }
  return out;
}

/* =========================================================================
   2. THE TOWN
   ========================================================================= */

function infoPanel(ctx) {
  const { game } = ctx;
  const t = town.townState(game);
  const st = town.townStats(game);
  const w = WORSHIP_BY_ID.get(t.worship);
  const power = town.worshipPower(t);

  return el(`<section class="panel panel--tight">
    <p class="t-label" style="margin-bottom:var(--s-2)">Town Info</p>
    ${line("Population", `${int(t.pop)} / ${int(st.popCap)}`)}
    ${line("Workers needed", int(st.workers))}
    ${line("Building efficiency", `${(st.efficiency * 100).toFixed(0)}%`)}
    ${line("Happiness", `${Math.round(t.happiness)} / 100`)}
    ${line("Education", int(st.education))}
    ${line("Storage per resource", int(st.storage))}
    ${line("Buildings", int(st.buildings))}
    ${line("Worship", `${w.name} — ${(power * 100).toFixed(0)}% power`)}
    ${line("Town ticks", int(t.townTicks))}
  </section>`);
}

function resourcePanel(ctx) {
  const { game } = ctx;
  const t = town.townState(game);
  const st = town.townStats(game);
  const last = t.last || { gained: {}, used: {} };

  const rows = RESOURCES.map((r) => {
    const have = Math.floor(t.res[r.id] || 0);
    const net = (last.gained[r.id] || 0) - (last.used[r.id] || 0);
    const sign = net > 0.05 ? "+" : "";
    const colour = net > 0.05 ? "var(--c-gold-core)" : net < -0.05 ? "var(--c-violet-light)" : "var(--c-text-2)";
    const full = st.storage > 0 ? Math.min(100, (have / st.storage) * 100) : 0;
    return `<div style="margin-bottom:6px">
      <div class="row--between">
        <span class="t-micro" style="color:var(--c-text-2)">${esc(r.name)}</span>
        <span class="t-micro u-tnum"><b style="color:var(--c-text-1)">${num(have)}</b>
          <span style="color:${colour}"> ${sign}${net.toFixed(1)}/tick</span></span>
      </div>
      <div class="bar bar--sm"><span class="bar__fill" style="--fill:${full.toFixed(1)}%"></span></div>
    </div>`;
  });

  return el(`<section class="panel panel--tight">
    <div class="row--between" style="margin-bottom:var(--s-2)">
      <p class="t-label">Resources</p>
      <p class="t-micro u-tnum" style="color:var(--c-text-2)">cap ${num(st.storage)}</p>
    </div>
    ${rows.join("")}
  </section>`);
}

/* `.row-card__sub` carries `white-space: nowrap`, which an INLINE span honours
   while ignoring the `overflow: hidden` next to it — so a long line runs
   straight under the Build button instead of clipping. Every sub and meta on
   this page is forced to a block box for that reason. */
function buildingRow(ctx, b) {
  const { game, render, toast } = ctx;
  const t = town.townState(game);
  const owned = t.built[b.id] || 0;
  const lv = game.skillLevel("settlement");
  const locked = lv < b.level;
  const maxed = owned >= b.max;
  const cost = town.costFor(game, b.id);

  const costText = Object.entries(cost)
    .map(([res, qty]) => `${num(qty)} ${res === "cogs" ? "Cogs" : RESOURCE_BY_ID.get(res).name}`)
    .join(" · ");

  const gives = [];
  const p = b.provides || {};
  if (p.population) gives.push(`+${p.population} pop`);
  if (p.storage) gives.push(`+${num(p.storage)} storage`);
  if (p.education) gives.push(`+${p.education} education`);
  if (p.happiness) gives.push(`${p.happiness > 0 ? "+" : ""}${p.happiness} happiness`);
  if (p.worship) gives.push(`+${p.worship} worship`);
  for (const [res, qty] of Object.entries(b.produces || {}))
    gives.push(`+${qty} ${res === "cogs" ? "Cogs" : RESOURCE_BY_ID.get(res).name}/tick`);
  for (const [res, qty] of Object.entries(b.consumes || {}))
    gives.push(`-${qty} ${res === "cogs" ? "Cogs" : RESOURCE_BY_ID.get(res).name}/tick`);
  if (b.workers) gives.push(`${b.workers} workers`);

  const row = el(`<div class="row-card${locked ? " is-locked" : ""}">
    ${markFor(b.id, b.name)}
    <span class="row-card__body">
      <span class="row-card__title">${esc(b.name)}${owned ? `<span class="badge">×${owned}</span>` : ""}</span>
      <span class="row-card__sub" style="display:block">${esc(locked ? `Unlocks at Settlement ${b.level}` : b.blurb)}</span>
      <span class="row-card__meta" style="display:block">${esc(gives.join(" · "))}</span>
      ${locked ? "" : `<span class="row-card__meta" style="display:block;color:var(--c-gold-core)">${esc(costText)}</span>`}
    </span>
    <span class="row-card__right">
      <span class="row-card__lvl u-tnum">${owned}</span><span class="row-card__lvl-cap">/ ${b.max}</span>
      <button class="btn-gold btn-gold--sm" type="button" style="margin-top:6px"${locked || maxed ? " disabled" : ""}>${maxed ? "Max" : "Build"}</button>
    </span>
  </div>`);

  if (!locked && !maxed) row.querySelector("button").onclick = () => {
    const why = town.build(game, b.id);
    if (why) return toast(why, "bad");
    toast(`${b.name} built`, "violet");
    render();
  };
  return row;
}

function worshipSheet(ctx) {
  const { game, render, toast } = ctx;
  const t = town.townState(game);
  const body = WORSHIPS.map((w) =>
    worshipCard(ctx, w, t.worship, (id) => {
      if (id === t.worship) return;
      const why = town.changeWorship(game, id);
      if (why) return toast(why, "bad");
      toast(`Patron changed to ${WORSHIP_BY_ID.get(id).name}`, "violet");
      document.querySelector(".scrim")?.remove();
      render();
    })
  );
  sheet("Change Worship", `Changing patron costs ${int(WORSHIP_CHANGE_COST)} Cogs. Worship power carries over.`, body);
}

function townScreen(ctx) {
  const { game, render } = ctx;
  const t = town.townState(game);
  const out = [];

  out.push(el(`<section class="panel panel--tight">
    <div class="row--between" style="margin-bottom:6px">
      <p class="t-label">Next town tick</p>
      <p class="t-micro u-tnum" style="color:var(--c-text-2)" id="townClock">${dur(town.secondsToNextTick(t))}</p>
    </div>
    <div class="bar bar--violet"><span class="bar__fill" id="townBar"
      style="--fill:${(town.tickProgress(t) * 100).toFixed(1)}%"></span></div>
    <p class="t-micro" style="color:var(--c-text-2);margin-top:var(--s-2)">
      One tick every ${TOWN_TICK_SECONDS / 60} minutes, whatever else you are doing — and while the game is closed.</p>
  </section>`));

  out.push(toolbar([
    { text: "Toggle Info", on: showInfo, onClick: () => { showInfo = !showInfo; render(); } },
    { text: "Toggle Resources", on: showResources, onClick: () => { showResources = !showResources; render(); } },
    { text: "Change Worship", onClick: () => worshipSheet(ctx) },
  ]));

  if (showInfo) out.push(infoPanel(ctx));
  if (showResources) out.push(resourcePanel(ctx));

  out.push(sect("Buildings"));
  for (const b of BUILDINGS) out.push(buildingRow(ctx, b));
  return out;
}

/* =========================================================================
   RENDER / PAINT
   ========================================================================= */

function render(ctx) {
  const { game } = ctx;
  return town.townState(game) ? townScreen(ctx) : foundingScreen(ctx);
}

function paint(ctx) {
  const t = ctx.game.state.settlement;
  if (!t) return;
  const clock = document.getElementById("townClock");
  const bar = document.getElementById("townBar");
  if (clock) {
    const v = dur(town.secondsToNextTick(t));
    if (clock.textContent !== v) clock.textContent = v;
  }
  if (bar) bar.style.setProperty("--fill", `${(town.tickProgress(t) * 100).toFixed(1)}%`);
}

export default { kind: "settlement", render, paint, reset: () => { showInfo = true; showResources = true; } };
