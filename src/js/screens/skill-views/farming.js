/* =========================================================================
   EMBERVEIL — SKILL VIEW: FARMING   (parity §3c)

   The passive archetype. ../skills.js has already rendered §2's universal
   header above this; everything below is the farm itself.

   §3c is short and every clause of it is on this page:

     "Three categories — Allotments (food), Herbs (potion ingredients),
      Trees (skill XP)"           — the category selector, with each one's job
                                    stated on it, because a player choosing
                                    between three beds needs to know why.
     "A grid of plots"            — the plot grid, one cell per owned plot,
                                    plus the next purchasable plot as a
                                    priced, level-gated cell.
     "each showing crop, growth
      state"                      — crop name, state word, and a live
                                    countdown that moves at 20 Hz.
     "Compost Applied: No Compost" — verbatim, on every plot, and it names the
                                    tier when there is one.
     "Chance to grow: 100%"        — verbatim, and it is the REAL number: base
                                    50%, plus 10% per compost application,
                                    plus every mastery and shop modifier.
     "and a Harvest button"        — per plot.
     "Bulk actions with GP costs:
      Harvest All: 2,000 …"        — all five, at the reference's own prices.
     "Compost has tiers … and
      raises grow chance from 50%
      toward 100%"                 — two tiers, the second shop-gated.

   NOTHING ON THIS PAGE IS A FIXTURE. Every number is read back out of
   ../../engine/systems/farming.js, which is the same module the tick loop
   runs, so the countdown on screen is the countdown in the save.
   ========================================================================= */

import { DB } from "../../engine/index.js";
import { el, esc, num, int, dur, secs, mark, initials, sect, selector, toolbar, sheet, xpPair } from "../ui.js";
import { CATEGORIES, CATEGORY_BY_ID, CROP_BY_ID, COMPOST_TIERS, BULK_ACTIONS, GROW_CHANCE_BASE } from "../../../data/crops.js";
import * as farm from "../../engine/systems/farming.js";

/* Which bed is open. This view's own state, reset by the shell on tab entry. */
let openCat = "allotment";

const STATE_WORD = { empty: "Empty", growing: "Growing", ready: "Ready to harvest", dead: "Died" };

/* =========================================================================
   THE CATEGORY PICKER
   ========================================================================= */

function categoryPicker(ctx) {
  const { game, render } = ctx;
  const opts = CATEGORIES.map((c) => {
    const n = farm.plotEntitlement(game, c.id);
    return [c.id, `${c.name} — ${n} plot${n === 1 ? "" : "s"}`];
  });
  const node = selector("Select Farming Category", opts, openCat, (v) => { openCat = v; render(); });
  const cat = CATEGORY_BY_ID.get(openCat);
  node.append(el(`<p class="t-micro" style="color:var(--c-text-2);margin-top:var(--s-2)">${esc(cat.blurb)}</p>`));
  return node;
}

/* =========================================================================
   THE SEED PICKER

   "Plant All Selected Crops" needs a selection, so the selection is a
   first-class control rather than a hidden preference: pick a crop here and
   every empty plot in this bed plants it.
   ========================================================================= */

function seedPicker(ctx) {
  const { game, render } = ctx;
  const f = farm.farmState(game);
  const list = farm.availableCrops(game, openCat);
  if (!list.length) {
    const next = DB.skill("farming").recipes.find((r) => r.category === openCat);
    return el(`<section class="panel panel--tight"><p class="t-label">Selected Crop</p>
      <p class="t-micro" style="color:var(--c-text-2);margin-top:6px">Nothing unlocked yet — ${esc(next.name)} needs Farming ${next.level}.</p></section>`);
  }
  const chosen = f.sel[openCat] && list.some((c) => c.id === f.sel[openCat])
    ? f.sel[openCat] : list[list.length - 1].id;
  f.sel[openCat] = chosen;

  const crop = CROP_BY_ID.get(chosen);
  const cost = farm.seedCost(game, chosen);
  const grow = farm.growTicks(game, chosen) / 20;
  const yieldNow = farm.baseYield(game, chosen);
  const ml = game.masteryLevel("farming", chosen);

  const wrap = selector(
    "Selected Crop",
    list.map((c) => [c.id, `${c.name} — level ${c.level}`]),
    chosen,
    (v) => { f.sel[openCat] = v; render(); }
  );
  wrap.append(el(`<div style="margin-top:var(--s-3)">
    <div class="stat-line"><span>Seed cost</span><b class="u-tnum">${int(cost)} Cogs</b></div>
    <div class="stat-line"><span>Grow time</span><b class="u-tnum">${dur(grow)}</b></div>
    <div class="stat-line"><span>Yield</span><b class="u-tnum">${yieldNow} × ${esc(crop.itemName)}</b></div>
    <div class="stat-line"><span>Grants</span><b class="u-tnum">${int(crop.xp)} XP</b></div>
    <div class="stat-line"><span>Mastery</span><b class="u-tnum">${ml} · ${xpPair(Math.floor(game.masteryXp("farming", chosen)), ml, 99)}</b></div>
  </div>`));
  return wrap;
}

/* =========================================================================
   ONE PLOT
   ========================================================================= */

function plotCell(ctx, plot, index) {
  const { game, render, toast } = ctx;
  const crop = plot.crop ? CROP_BY_ID.get(plot.crop) : null;
  const chance = farm.plotGrowChance(game, plot);
  const tier = plot.compost >= 5 ? "Emberloam" : plot.compost > 0 ? `Compost ×${plot.compost}` : "No Compost";
  const busy = plot.st === "growing";

  const cell = el(`<section class="bank-cell" style="text-align:left;padding:var(--s-3)" data-plot="${index}">
    <div class="row" style="gap:var(--s-2);align-items:flex-start">
      ${mark(crop ? crop.itemId : `plot-${plot.cat}`, crop ? initials(crop.name) : "—")}
      <div class="grow">
        <p class="row-card__title" style="margin:0">${esc(crop ? crop.name : "Empty Plot")}</p>
        <p class="t-micro" style="color:var(--c-text-2)" data-state>${esc(STATE_WORD[plot.st])}</p>
      </div>
    </div>
    <div class="bar bar--sm" style="margin:var(--s-2) 0 6px"><span class="bar__fill" data-bar
      style="--fill:${(farm.plotProgress(plot) * 100).toFixed(1)}%"></span></div>
    <p class="t-micro" style="color:var(--c-text-2)">Compost Applied: <b style="color:var(--c-text-1)">${esc(tier)}</b></p>
    <p class="t-micro" style="color:var(--c-text-2)">Chance to grow: <b style="color:var(--c-gold-core)">${(chance * 100).toFixed(0)}%</b></p>
    <div style="display:flex;flex-direction:column;gap:var(--s-1);margin-top:var(--s-2)"></div>
  </section>`);

  /* Stacked, full-width rows with the price on the right — the same shape as
     the bulk bar. Two buttons side by side inside a plot cell run out of
     horizontal room at 390 px and truncate their own prices, which is the one
     number on them that has to be readable. */
  const row = cell.lastElementChild;
  const add = (text, price, cls, on, disabled) => {
    const b = el(`<button type="button" class="${cls}"
      style="display:flex;justify-content:space-between;align-items:center;gap:var(--s-1);
             width:100%;font-size:var(--fs-micro);padding:7px var(--s-2)"${disabled ? " disabled" : ""}>
      <span>${esc(text)}</span>${price == null ? "" : `<span class="u-tnum">${int(price)}</span>`}</button>`);
    if (!disabled) b.onclick = on;
    row.appendChild(b);
    return b;
  };

  if (plot.st === "ready") {
    add("Harvest", null, "btn-gold btn-gold--sm", () => {
      const r = farm.harvest(game, index);
      if (r) toast(`Harvested ${r.items} × ${crop.itemName}`, "violet");
      render();
    });
  } else if (plot.st === "dead") {
    add("Clear", null, "btn-ghost", () => { farm.harvest(game, index); render(); });
  } else if (busy) {
    for (const t of COMPOST_TIERS) {
      const locked = t.unlock && !game.state.purchases[t.unlock];
      const full = plot.compost >= 5;
      add(t.name, t.cost, "btn-ghost", () => {
        const why = farm.compost(game, index, t.id);
        if (why) return toast(why, "bad");
        render();
      }, locked || full);
    }
  } else {
    const f = farm.farmState(game);
    const sel = f.sel[plot.cat];
    add("Plant", sel ? farm.seedCost(game, sel) : null, "btn-gold btn-gold--sm", () => {
      const why = farm.plant(game, index, sel);
      if (why) return toast(why, "bad");
      render();
    }, !sel);
  }
  return cell;
}

/** The next plot the player could buy, rendered as a priced cell. */
function lockedCell(ctx) {
  const { game, render, toast } = ctx;
  const slot = farm.nextPlot(game, openCat);
  if (!slot) return null;
  const lv = game.skillLevel("farming");
  const locked = lv < slot.level;
  const cell = el(`<section class="bank-cell" style="text-align:left;padding:var(--s-3);opacity:${locked ? ".55" : "1"}">
    <div class="row" style="gap:var(--s-2)">
      ${mark(`lock-${openCat}`, "+")}
      <div class="grow">
        <p class="row-card__title" style="margin:0">New Plot</p>
        <p class="t-micro" style="color:var(--c-text-2)">${locked ? `Needs Farming ${slot.level}` : `${int(slot.cost)} Cogs`}</p>
      </div>
    </div>
    <div class="btn-row" style="margin-top:var(--s-3)"></div>
  </section>`);
  const b = el(`<button type="button" class="btn-gold btn-gold--sm"
    style="width:100%;font-size:var(--fs-micro);padding:7px var(--s-2)"${locked ? " disabled" : ""}>Break Ground</button>`);
  if (!locked) b.onclick = () => {
    const why = farm.buyPlot(game, openCat);
    if (why) return toast(why, "bad");
    toast("A new plot is yours", "violet");
    render();
  };
  cell.querySelector(".btn-row").appendChild(b);
  return cell;
}

/* =========================================================================
   THE BULK BAR   (§3c's five prices, unchanged)
   ========================================================================= */

function bulkBar(ctx) {
  const { game, render, toast } = ctx;
  const run = (id, cost) => {
    let r;
    if (id === "harvest-all") r = farm.harvestAll(game, cost);
    else if (id === "compost-all") r = farm.compostAll(game, "compost", cost);
    else if (id === "emberloam-all") r = farm.compostAll(game, "emberloam", cost);
    else if (id === "plant-all") r = farm.plantAll(game, "best", cost);
    else r = farm.plantAll(game, "selected", cost);
    if (typeof r === "string") return toast(r, "bad");
    toast(r.items !== undefined ? `Harvested ${num(r.items)} items` : `${r.plots} plots`, "violet");
    render();
  };

  const wrap = el(`<section class="panel panel--tight">
    <p class="t-label" style="margin-bottom:var(--s-2)">Bulk Actions</p>
    <div style="display:flex;flex-direction:column;gap:var(--s-1)"></div>
  </section>`);
  const host = wrap.querySelector("div");
  for (const a of BULK_ACTIONS) {
    const locked = a.unlock && !game.state.purchases[a.unlock];
    const poor = game.state.cogs < a.cost;
    const b = el(`<button type="button" class="btn-ghost"
      style="display:flex;justify-content:space-between;align-items:center;width:100%;font-size:var(--fs-micro);padding:9px var(--s-2)"
      ${locked || poor ? " disabled" : ""}>
      <span>${esc(a.label)}</span><span class="u-tnum" style="color:var(--c-gold-core)">${int(a.cost)}</span></button>`);
    if (!locked && !poor) b.onclick = () => run(a.id, a.cost);
    host.appendChild(b);
  }
  return wrap;
}

/* =========================================================================
   THE COMPOST EXPLAINER
   ========================================================================= */

function compostSheet(ctx) {
  const { game } = ctx;
  const rows = COMPOST_TIERS.map((t) => {
    const locked = t.unlock && !game.state.purchases[t.unlock];
    return `<div class="stat-line"><span>${esc(t.name)}${locked ? " (locked)" : ""}<br>
      <span class="t-micro" style="color:var(--c-text-2)">${esc(t.text)}</span></span>
      <b class="u-tnum">${int(t.cost)}</b></div>`;
  });
  sheet("Compost", `A crop rolls once when it finishes growing. Base chance is ${(GROW_CHANCE_BASE * 100).toFixed(0)}% — compost is the only thing that buys that back.`, [
    el(`<section class="panel panel--tight">${rows.join("")}</section>`),
    el(`<p class="t-micro" style="color:var(--c-text-2);margin-top:var(--s-3)">
      Five applications reach 100%. The price is flat while yields climb the ladder, so composting a
      Potato is a waste and composting Ironbark is not optional. That crossover is the skill.</p>`),
  ]);
}

/* =========================================================================
   RENDER
   ========================================================================= */

/** Every plot, whatever bed it is in — the steward works the whole farm. */
const plots0 = (game) => farm.farmState(game).plots;

function render(ctx) {
  const { game } = ctx;
  farm.ensurePlots(game);

  const s = farm.summary(game);
  const out = [];

  out.push(el(`<section class="panel panel--tight">
    <div class="stat-split">
      <div><p class="t-label">Growing</p><p class="t-value u-tnum" style="color:var(--c-gold-core)" id="farmGrowing">${s.growing}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">Ready</p><p class="t-value u-tnum" style="color:var(--c-gold-core)" id="farmReady">${s.ready}</p></div>
      <div class="divider divider--v"></div>
      <div><p class="t-label">Plots</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${s.plots}</p></div>
    </div>
    <p class="t-micro" style="color:var(--c-text-2);margin-top:var(--s-2)" id="farmStatus">
      Plots keep growing while another skill is running, and while the game is closed.</p>
  </section>`));

  const f0 = farm.farmState(game);
  out.push(el(`<p class="t-micro u-tnum" style="color:var(--c-text-2);text-align:center;margin:0 0 var(--s-2)">
    ${num(f0.harvested)} harvested · ${num(f0.died)} lost to the roll</p>`));

  /* THE STEWARD RUNS ON WORKING CAPITAL. Replanting costs Cogs — 35% of a
     ripe bed, per the seed rule — so a farm left unattended by a player who
     never sells anything will quietly stop replanting rather than stop
     growing. Saying so is the difference between an economy and a bug: the
     plots read "Empty", the counter reads zero, and nothing else on the page
     would explain why. */
  if (game.state.purchases["farm-grange-steward"] && s.empty > 0) {
    /* What the steward was about to plant: the crop that bed last held (it is
       kept through the harvest for exactly this), then the bed's selection,
       then the best rung the bed can take. */
    const owed = plots0(game).reduce((n, pl) => {
      if (pl.st !== "empty") return n;
      const list = farm.availableCrops(game, pl.cat);
      const id = pl.crop || f0.sel[pl.cat] || list[list.length - 1]?.id;
      return n + (id ? farm.seedCost(game, id) : 0);
    }, 0);
    out.push(el(`<p class="t-micro" style="color:var(--c-gold-core);text-align:center;margin:0 0 var(--s-3)">
      The Grange Steward left ${s.empty} bed${s.empty === 1 ? "" : "s"} bare — it replants out of your
      Cogs, and the next round costs about ${num(owed)}.</p>`));
  }
  out.push(toolbar([{ text: "How compost works", onClick: () => compostSheet(ctx) }]));

  out.push(categoryPicker(ctx));
  out.push(seedPicker(ctx));
  out.push(bulkBar(ctx));

  out.push(sect(CATEGORY_BY_ID.get(openCat).name));
  /* Two columns at 390 px, three on anything wider. A plot cell carries a
     crop name, a state line, two labelled prices and a bar; the bank grid's
     104 px track truncates every one of them. */
  const grid = el(`<div class="bank-grid" style="grid-template-columns:repeat(auto-fill,minmax(158px,1fr))"></div>`);
  const plots = farm.farmState(game).plots;
  let any = false;
  for (let i = 0; i < plots.length; i++) {
    if (plots[i].cat !== openCat) continue;
    grid.appendChild(plotCell(ctx, plots[i], i));
    any = true;
  }
  const lock = lockedCell(ctx);
  if (lock) grid.appendChild(lock);
  if (!any && !lock) grid.appendChild(el(`<p class="empty">No plots in this bed yet.</p>`));
  out.push(grid);

  return out;
}

/* =========================================================================
   PAINT — 20 Hz, in place, no DOM rebuild
   ========================================================================= */

function paint(ctx) {
  const { game } = ctx;
  const f = game.state.farming;
  if (!f) return;
  const set = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };

  const s = farm.summary(game);
  set(document.getElementById("farmGrowing"), String(s.growing));
  set(document.getElementById("farmReady"), String(s.ready));

  let soonest = Infinity, soonestName = null;
  for (const node of document.querySelectorAll("[data-plot]")) {
    const p = f.plots[Number(node.dataset.plot)];
    if (!p) continue;
    const bar = node.querySelector("[data-bar]");
    if (bar) bar.style.setProperty("--fill", `${(farm.plotProgress(p) * 100).toFixed(1)}%`);
    const st = node.querySelector("[data-state]");
    if (!st) continue;
    if (p.st === "growing") {
      const left = farm.plotSeconds(p);
      set(st, `Growing — ${left >= 60 ? dur(left) : secs(left)} to go`);
      if (p.ticks < soonest) { soonest = p.ticks; soonestName = CROP_BY_ID.get(p.crop)?.name; }
    } else {
      set(st, STATE_WORD[p.st]);
    }
  }

  const status = document.getElementById("farmStatus");
  if (status) {
    set(status, s.ready
      ? `${s.ready} plot${s.ready === 1 ? "" : "s"} ready to harvest.`
      : Number.isFinite(soonest)
        ? `Next up: ${soonestName} in ${dur(soonest / 20)}.`
        : "Plots keep growing while another skill is running, and while the game is closed.");
  }
}

export default { kind: "farming", render, paint, reset: () => { openCat = "allotment"; } };
