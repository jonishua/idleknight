/* =========================================================================
   EMBERVEIL — SCREEN: BANK / THE RELIQUARY   (parity §3k)

       Sort | Move items to new Tab | Toggle Sell Mode
       Space: 111 / 130 | Bank: 98M GP | Tab: 65M GP
       item grid with stack counts, multiple tabs, and a detail pane
       ("No item selected.")

   TABS ARE UI, NOT SIMULATION. Which drawer a stack is filed in changes
   nothing the tick loop can observe, so the assignment lives in the UI slice
   of the save (see ./ui.js) rather than in engine state. The engine keeps one
   flat inventory and one slot count; this screen decides how it is shelved.
   A tab is unlocked by a Reliquary Wing from the shop, which is a real 100M
   purchase, so the drawers cost what the reference charges for them.

   SELL MODE EXISTS BECAUSE SELLING IS DANGEROUS. A per-cell Sell button is
   one mis-tap away from liquidating a stack you were saving for a recipe.
   The reference's answer is a mode you have to arm, and it is the right one:
   armed, the whole grid becomes sell buttons and says so; disarmed, a tap
   only inspects. The quantity picker and the optional confirmation are the
   two guards on top of that.

   VALUES ARE POST-MODIFIER, AND THE PRICE ON THE CELL IS THE MONEY IN YOUR
   POCKET. Every price here is unitPrice() — one function, used by the grid,
   the detail pane, the two totals and the sort — and tools/check-meta.mjs
   sells three of every item and fails the build unless the Cogs that arrive
   equal the number the cell printed, times three. A shop screen may round; a
   bank may not.
   ========================================================================= */

import { DB, MOD } from "../engine/index.js";
import { el, esc, num, int, mark, initials, prefs, toolbar, segmented, statSplit } from "./ui.js";
import { noteDiscoveries } from "./completion.js";

/* Move mode is transient — it must not survive leaving the screen. */
let moveMode = false;
let moving = new Set();

const SORTS = [
  ["name", "Name"],
  ["value", "Value"],
  ["qty", "Quantity"],
];

/* -------------------------------------------------------------------------
   READS
   ------------------------------------------------------------------------- */

/** How many drawers the player has: one free, one per Reliquary Wing. */
export const tabCount = (game) => 1 + (game.state.purchases["reliquary-wing"] || 0);

/** Which drawer a stack is filed in, defaulting to the first. */
function tabOf(p, id, tabs) {
  const t = p.bankTabs[id] || 0;
  return t < tabs ? t : 0;
}

function heldIds(game) {
  return Object.keys(game.state.items).filter((i) => game.state.items[i] > 0);
}

/**
 * What one unit fetches — the ONE price function on this screen.
 *
 * It is `Game.salePrice()` and nothing else, deliberately. Every figure in
 * the reliquary is money, and money must come from the same call that moves
 * it: the engine sums the sale-value modifiers this item is in scope for
 * (global bonuses, and the +50% Charter checkpoint of the skill that made
 * it), floors once, and `Game.sell()` multiplies that by the quantity. Any
 * cleverness added here would show a price the sale does not pay.
 *
 * @see tools/check-meta.mjs §7, which sells three of every item to prove it.
 */
export const unitPrice = (game, id) => game.salePrice(id);

/** The live sale-value bonuses on an item, so the price is auditable. */
function saleBonuses(game, id) {
  return game.mods()
    .breakdown(MOD.saleValue, [id, game.producedBy.get(id)])
    .filter((e) => e.value);
}

function sortIds(game, ids, mode) {
  const name = (i) => (DB.items.has(i) ? DB.item(i).name : i);
  if (mode === "value") return ids.sort((a, b) => unitPrice(game, b) * game.count(b) - unitPrice(game, a) * game.count(a));
  if (mode === "qty") return ids.sort((a, b) => game.count(b) - game.count(a));
  return ids.sort((a, b) => name(a).localeCompare(name(b)));
}

function valueOf(game, ids) {
  let v = 0;
  for (const id of ids) v += unitPrice(game, id) * game.count(id);
  return v;
}

/* -------------------------------------------------------------------------
   THE DETAIL PANE
   ------------------------------------------------------------------------- */

function detail(ctx, id) {
  const { game, render: rerender } = ctx;
  const p = prefs(game);

  if (!id || !DB.items.has(id) || game.count(id) <= 0) {
    return el(`<section class="panel"><p class="empty" style="padding:var(--s-5) 0">No item selected.</p></section>`);
  }

  const it = DB.item(id);
  const qty = game.count(id);
  const unit = unitPrice(game, id);
  const bonus = it.value > 0 ? unit / it.value - 1 : 0;
  const from = game.producedBy.get(id);
  const source = from ? DB.skill(from)?.name : null;
  const why = saleBonuses(game, id);

  const node = el(`<section class="panel">
    <div class="row gap-3" style="align-items:flex-start">
      ${mark(id, initials(it.name))}
      <div class="grow">
        <p class="t-value-lg" style="font-family:var(--ff-display)">${esc(it.name)}</p>
        <p class="t-micro" style="color:var(--c-text-2);text-transform:capitalize">${esc(it.kind)}${source ? ` · from ${esc(source)}` : ""}</p>
      </div>
    </div>
    <div class="stat-line"><span>Held</span><b class="u-tnum">${int(qty)}</b></div>
    <div class="stat-line"><span>Base value</span><b class="u-tnum">${int(it.value)} Cogs</b></div>
    ${why.map((e) => `<div class="stat-line"><span style="font-size:var(--fs-micro);color:var(--c-text-2)">${esc(e.source)}</span>
      <b class="u-tnum" style="font-size:var(--fs-micro);color:${e.value > 0 ? "var(--c-gold-core)" : "var(--c-text-2)"}">${e.value > 0 ? "+" : ""}${(e.value * 100).toFixed(0)}%</b></div>`).join("")}
    <div class="stat-line"><span>Sells for</span><b class="u-tnum">${int(unit)} Cogs each${bonus > 0.0001 ? ` (+${(bonus * 100).toFixed(0)}%)` : ""}</b></div>
    <div class="stat-line"><span>Stack value</span><b class="u-tnum">${int(unit * qty)} Cogs</b></div>
    ${it.heal ? `<div class="stat-line"><span>Heals</span><b class="u-tnum">${int(it.heal)} HP</b></div>` : ""}
    <div class="stat-line"><span>Drawer</span><b>${esc(p.bankTabNames[tabOf(p, id, tabCount(game))] || "Reliquary")}</b></div>
    <div class="btn-row" style="margin-top:var(--s-3)">
      <button class="btn-ghost" type="button" data-q="1" style="flex:1 1 0;font-size:var(--fs-micro)">Sell 1</button>
      <button class="btn-ghost" type="button" data-q="10" style="flex:1 1 0;font-size:var(--fs-micro)">Sell 10</button>
      <button class="btn-gold btn-gold--sm" type="button" data-q="all" style="flex:1 1 0">Sell All</button>
    </div>
  </section>`);

  for (const b of node.querySelectorAll("[data-q]")) {
    b.onclick = () => { doSell(ctx, id, b.dataset.q); rerender(); };
  }
  return node;
}

/* -------------------------------------------------------------------------
   SELLING
   ------------------------------------------------------------------------- */

function doSell(ctx, id, want) {
  const { game, toast } = ctx;
  const p = prefs(game);
  const have = game.count(id);
  if (!have) return;
  const qty = want === "all" ? have : Math.min(have, Number(want) || 1);
  const it = DB.item(id);
  const worth = unitPrice(game, id) * qty;

  if (p.confirmSell && qty === have && have > 1) {
    if (!confirm(`Sell all ${int(have)} ${it.name} for ${int(worth)} Cogs?`)) return;
  }
  const paid = game.sell(id, qty);
  p.itemsSold += 1;
  p.unitsSold += qty;
  if (game.count(id) <= 0 && p.selected === id) p.selected = null;
  toast(`Sold ${num(qty)}x ${it.name} for ${num(paid)} Cogs`);
}

/* -------------------------------------------------------------------------
   THE SCREEN
   ------------------------------------------------------------------------- */

function render(ctx) {
  const { game, render: rerender, toast } = ctx;
  const p = prefs(game);
  noteDiscoveries(game);

  const tabs = tabCount(game);
  while (p.bankTabNames.length < tabs) p.bankTabNames.push(`Wing ${p.bankTabNames.length + 1}`);
  if (p.bankTab >= tabs) p.bankTab = 0;

  const all = heldIds(game);
  const mine = sortIds(game, all.filter((i) => tabOf(p, i, tabs) === p.bankTab), p.bankSort);
  const sortName = (SORTS.find(([k]) => k === p.bankSort) || SORTS[0])[1];

  /* --- the three controls the reference names, in its order --- */
  const bar = toolbar([
    { text: `Sort: ${sortName}`, onClick: () => {
      const i = SORTS.findIndex(([k]) => k === p.bankSort);
      p.bankSort = SORTS[(i + 1) % SORTS.length][0];
      rerender();
    } },
    { text: moveMode ? `Move ${moving.size} here` : "Move items to new Tab", on: moveMode, onClick: () => {
      if (!moveMode) { moveMode = true; moving = new Set(); return rerender(); }
      if (!moving.size) { moveMode = false; return rerender(); }
      const dest = tabs > 1 ? (p.bankTab + 1) % tabs : -1;
      if (dest < 0) { moveMode = false; rerender(); return toast("Buy a Reliquary Wing in the shop to open a second drawer", "bad"); }
      for (const id of moving) p.bankTabs[id] = dest;
      toast(`Moved ${moving.size} to ${p.bankTabNames[dest]}`, "violet");
      moveMode = false; moving = new Set();
      rerender();
    } },
    { text: "Toggle Sell Mode", on: p.sellMode, onClick: () => { p.sellMode = !p.sellMode; rerender(); } },
  ]);

  /* --- Space / Bank / Tab --- */
  const totals = statSplit([
    ["Space", `${all.length} / ${game.reliquarySlots()}`],
    ["Bank", `${num(valueOf(game, all))} Cogs`],
    ["Tab", `${num(valueOf(game, mine))} Cogs`],
  ]);

  const out = [bar, totals];

  /* --- the drawers --- */
  if (tabs > 1) {
    out.push(segmented(
      p.bankTabNames.slice(0, tabs).map((n, i) => [String(i), `${n} (${all.filter((x) => tabOf(p, x, tabs) === i).length})`]),
      String(p.bankTab),
      (v) => { p.bankTab = Number(v); rerender(); }
    ));
  }

  if (p.sellMode) {
    out.push(el(`<p class="sect" style="color:var(--c-gold-core)">Sell mode armed — tapping a stack sells it</p>`));
    out.push(segmented(
      [["1", "x1"], ["10", "x10"], ["100", "x100"], ["all", "All"]],
      String(p.sellQty),
      (v) => { p.sellQty = v; rerender(); }
    ));
  } else if (moveMode) {
    out.push(el(`<p class="sect" style="color:var(--c-violet-light)">Pick the stacks to move, then press Move again</p>`));
  }

  /* --- the grid --- */
  if (!mine.length) {
    out.push(el(`<p class="empty">${all.length ? "This drawer is empty." : "Nothing yet. Train a gathering skill."}</p>`));
  } else {
    const grid = el(`<div class="bank-grid"></div>`);
    for (const id of mine) {
      const it = DB.item(id);
      const picked = moving.has(id);
      const cell = el(`<div class="bank-cell" data-item="${esc(id)}"
        style="cursor:pointer;${picked ? "border-color:var(--c-violet-light)" : ""}${p.selected === id ? "border-color:var(--c-gold-core)" : ""}">
        ${mark(id, initials(it.name))}
        <div class="bank-cell__qty u-tnum">${num(game.count(id))}</div>
        <div class="bank-cell__name">${esc(it.name)}</div>
        <div class="bank-cell__each">${num(unitPrice(game, id))} ea</div>
      </div>`);
      cell.onclick = () => {
        if (moveMode) { moving.has(id) ? moving.delete(id) : moving.add(id); return rerender(); }
        if (p.sellMode) { doSell(ctx, id, p.sellQty); return rerender(); }
        p.selected = p.selected === id ? null : id;
        rerender();
      };
      grid.appendChild(cell);
    }
    out.push(grid);
  }

  out.push(el(`<p class="sect">Selected item</p>`));
  out.push(detail(ctx, p.selected));
  return out;
}

/** Per tick: quantities and the three totals. Never rebuilds the grid. */
function paint(ctx) {
  const { game } = ctx;
  const p = prefs(game);
  const tabs = tabCount(game);
  for (const c of document.querySelectorAll(".bank-cell[data-item]")) {
    const q = c.querySelector(".bank-cell__qty");
    const v = num(game.count(c.dataset.item));
    if (q && q.textContent !== v) q.textContent = v;
  }
  const all = heldIds(game);
  const mine = all.filter((i) => tabOf(p, i, tabs) === p.bankTab);
  const cells = document.querySelectorAll(".stat-split .t-value");
  if (cells.length >= 3) {
    const vals = [
      `${all.length} / ${game.reliquarySlots()}`,
      `${num(valueOf(game, all))} Cogs`,
      `${num(valueOf(game, mine))} Cogs`,
    ];
    cells.forEach((n, i) => { if (vals[i] && n.textContent !== vals[i]) n.textContent = vals[i]; });
  }
}

export default {
  id: "bank",
  label: "Bank",
  render,
  paint,
  reset: () => { moveMode = false; moving = new Set(); },
};
