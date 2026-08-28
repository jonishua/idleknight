/* =========================================================================
   EMBERVEIL — SCREEN: SHOP   (parity §3l)

       Select Shop Category  ·  Buy x1 quantity selector
       entries showing name, effect text, level requirement and cost

   Two kinds of row, one renderer.

   REAL ROWS come from src/data/shop.js — the priced ladder the balance report
   reads. WHICH SHELF they sit on, and in what order the shelves appear, comes
   from src/data/shop/core.js, so re-shelving the shop can never move a price.

   VIRTUAL ROWS are purchases the engine already owns a dedicated method for.
   There is exactly one: the reliquary clasp, whose price is `claspCost(owned)`
   on the §6.1 curve and therefore cannot be a static row. It is described in
   the catalogue with the same fields a real row has and rendered by the same
   code, so the player never sees the seam.

   THE QUANTITY SELECTOR IS NOT COSMETIC. The clasp ladder is 118 purchases
   long and the first sixty cost less than a minute of play each. Without a
   x25 the sink that is supposed to introduce itself in the first two minutes
   would take two hundred taps to climb. "All" walks the curve one step at a
   time, re-pricing each purchase, because that is what the curve means.
   ========================================================================= */

import { DB } from "../engine/index.js";
import { el, esc, num, int, mark, initials, prefs, selector, segmented, statSplit } from "./ui.js";
import {
  shelvesFor, shelfOf, VIRTUAL_BY_SHELF, BUY_QUANTITIES, affordableCount, totalCost,
} from "../../data/shop/core.js";

/* -------------------------------------------------------------------------
   THE PRICE BLOCK

   §3l's rows show "name, effect text, level requirement and cost", and the
   cost has to be the cost of the transaction the button in the same row will
   perform — not the cost of one unit of it. See totalCost() in
   ../../data/shop/core.js for what went wrong when they differed.

   When the quantity is 1 the two are the same and the row prints one number.
   When it is more, the TOTAL is the headline and the unit price drops to a
   sub-line, because the total is the number the player is about to be
   charged and the unit price is now context.
   ------------------------------------------------------------------------- */

/** A purchase this much bigger than a single unit asks first. */
const CONFIRM_MULTIPLE = 10;

function priceBlock(unit, total, n) {
  const per = n > 1
    ? `<span class="row-card__lvl-cap u-tnum">${num(unit)} each</span>`
    : "";
  return `<span class="row-card__lvl u-tnum">${num(total)}</span>
    <span class="row-card__lvl-cap">cogs</span>${per}`;
}

/**
 * Ask before a tap spends an order of magnitude more than the row's headline
 * unit price — the same courtesy ../bank.js already extends before dumping a
 * full stack. A mis-tapped "All" on the clasp ladder is otherwise an
 * unrecoverable, unannounced seven-figure spend.
 */
function confirmLarge(name, unit, total, n) {
  if (n <= 1 || total <= unit * CONFIRM_MULTIPLE) return true;
  return confirm(`Buy ${int(n)}x ${name} for ${int(total)} Cogs?`);
}

/** game.canBuy() returns a sentence; the button has room for a word. */
const shortWhy = (w) =>
  w.includes("already") ? "Owned" :
  w.includes("prerequisite") ? "Locked" :
  w.includes("level") ? "Level" :
  w.includes("Cogs") ? "Need Cogs" :
  w.includes("Seals") ? "Seals" :
  w.includes("material") ? "Materials" : "—";

/* -------------------------------------------------------------------------
   ROWS
   ------------------------------------------------------------------------- */

function requirementText(e) {
  const bits = [];
  if (e.skill) bits.push(`Requires ${DB.skill(e.skill).name} level ${e.level}`);
  if (e.seals) bits.push(`${e.seals} Warden Seals`);
  if (e.material) bits.push(`${int(e.material[1])}x ${DB.item(e.material[0]).name}`);
  if (e.requires) bits.push(`After ${DB.shopEntry(e.requires).name}`);
  return bits.join(" · ");
}

function realRow(ctx, e) {
  const { game, render: rerender, toast } = ctx;
  const p = prefs(game);
  const owned = game.state.purchases[e.id] || 0;
  const max = e.repeatable || 1;
  const why = game.canBuy(e.id);
  const done = owned >= max;
  const want = e.repeatable ? (p.shopQty === "all" ? max - owned : Math.min(Number(p.shopQty) || 1, max - owned)) : 1;

  const row = el(`<div class="row-card${done ? " is-locked" : ""}">
    ${mark(e.id, initials(e.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(e.name)}${e.repeatable ? `<span class="badge">${owned} / ${max}</span>` : ""}</span>
      <span class="row-card__sub" style="display:block;white-space:normal">${esc(e.text || "")}</span>
      <span class="row-card__meta" style="display:block">${esc(requirementText(e))}</span>
    </span>
    <span class="row-card__right">
      ${priceBlock(e.cost, totalCost(game, e, Math.max(1, want)), want)}
      <button class="btn-gold btn-gold--sm" type="button" style="margin-top:6px"${why ? " disabled" : ""}>${
        why ? shortWhy(why) : (e.repeatable && want > 1 ? `Buy x${want}` : "Buy")}</button>
    </span></div>`);

  if (!why) row.querySelector("button").onclick = () => {
    const q = Math.max(1, want);
    if (!confirmLarge(e.name, e.cost, totalCost(game, e, q), q)) return;
    let n = 0;
    for (let i = 0; i < q; i++) {
      if (game.buy(e.id)) break;
      n++;
    }
    if (!n) return toast("Cannot buy that yet", "bad");
    toast(`Bought ${n > 1 ? `${n}x ` : ""}${e.name}`, "violet");
    rerender();
  };
  return row;
}

function virtualRow(ctx, v) {
  const { game, render: rerender, toast } = ctx;
  const p = prefs(game);
  const owned = v.owned(game);
  const price = v.cost(game);
  const can = affordableCount(game, v, p.shopQty);

  const row = el(`<div class="row-card">
    ${mark(v.id, initials(v.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(v.name)}<span class="badge">${int(owned)} owned</span></span>
      <span class="row-card__sub" style="display:block;white-space:normal">${esc(v.text)}</span>
      <span class="row-card__meta" style="display:block">${esc(v.detail || "")}</span>
    </span>
    <span class="row-card__right">
      ${priceBlock(price, totalCost(game, v, Math.max(1, can)), can)}
      <button class="btn-gold btn-gold--sm" type="button" style="margin-top:6px"${can ? "" : " disabled"}>${
        can ? (can > 1 ? `Buy x${can}` : "Buy") : "Need Cogs"}</button>
    </span></div>`);

  if (can) row.querySelector("button").onclick = () => {
    if (!confirmLarge(v.name, price, totalCost(game, v, can), can)) return;
    let n = 0, spent = 0;
    for (let i = 0; i < can; i++) {
      const cost = v.cost(game);
      if (v.buy(game)) break;
      spent += cost; n++;
    }
    toast(`Bought ${n > 1 ? `${n}x ` : ""}${v.name} for ${num(spent)} Cogs`, "violet");
    rerender();
  };
  return row;
}

/* -------------------------------------------------------------------------
   THE SCREEN
   ------------------------------------------------------------------------- */

function render(ctx) {
  const { game, render: rerender } = ctx;
  const p = prefs(game);
  const shelves = shelvesFor(DB.shop);
  if (!shelves.some((c) => c.id === p.shopCat)) p.shopCat = shelves[0].id;
  const cat = shelves.find((c) => c.id === p.shopCat);

  const out = [
    selector("Select Shop Category", shelves.map((c) => [c.id, c.name]), p.shopCat,
      (v) => { p.shopCat = v; rerender(); }),
    el(`<p class="t-micro" style="color:var(--c-text-2);padding:0 var(--s-1) var(--s-1);line-height:var(--lh-body)">${esc(cat.blurb)}</p>`),
    statSplit([
      ["Cogs", num(game.state.cogs)],
      ["Aether Shards", num(game.state.shards)],
      ["Warden Seals", int(game.state.seals)],
    ]),
    segmented(BUY_QUANTITIES, String(p.shopQty), (v) => { p.shopQty = v; rerender(); }),
  ];

  for (const v of VIRTUAL_BY_SHELF(p.shopCat)) out.push(virtualRow(ctx, v));

  /* Tool ladders are three ladders and four benches stacked in one list, so
     the shelf is sub-headed by skill. Every other shelf is a single ladder
     and reads correctly flat. */
  const rows = DB.shop.filter((e) => shelfOf(e) === p.shopCat);
  if (p.shopCat === "tool") {
    for (const s of DB.skills) {
      const mine = rows.filter((e) => e.skill === s.id);
      if (!mine.length) continue;
      out.push(el(`<p class="sect">${esc(s.name)}</p>`));
      for (const e of mine) out.push(realRow(ctx, e));
    }
  } else {
    for (const e of rows) out.push(realRow(ctx, e));
  }

  if (out.length <= 4) out.push(el(`<p class="empty">Nothing on this shelf yet.</p>`));
  return out;
}

/** Per tick: the currency readouts, so an affordable row becomes obvious. */
function paint(ctx) {
  const { game } = ctx;
  const cells = document.querySelectorAll(".stat-split .t-value");
  const vals = [num(game.state.cogs), num(game.state.shards), int(game.state.seals)];
  cells.forEach((n, i) => { if (vals[i] !== undefined && n.textContent !== vals[i]) n.textContent = vals[i]; });
}

export default { id: "shop", label: "Shop", render, paint };
