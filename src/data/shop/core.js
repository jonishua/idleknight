/* =========================================================================
   EMBERVEIL — THE SHOP CATALOGUE

   §3l of the parity doc asks for a real "Select Shop Category" control and a
   "Buy x1" quantity selector. Both need something ../shop.js does not have:
   a CATALOGUE — an ordered list of player-facing category names, and a way to
   present the two purchases that are not rows in the SHOP array at all.

   WHY THIS FILE EXISTS RATHER THAN MORE FIELDS ON ../shop.js
   ----------------------------------------------------------
   ../shop.js is the priced ladder: what a thing costs and what modifiers it
   grants. Those are systems facts and the balance report reads them. How the
   shop is *shelved* — which drawer a tool ladder lives in, what order the
   drawers appear in, which quantities the buy button offers — is a shopfront
   decision that changes when the screen changes and never when the economy
   does. Keeping the two apart means re-shelving the shop cannot alter a
   single price.

   THE TWO VIRTUAL ENTRIES
   -----------------------
   A reliquary clasp has no fixed price: it costs `claspCost(owned)` on the
   §6.1 curve, so it cannot be a static row, and the engine already buys it
   through its own `buyClasp()`. It is described here instead, with the same
   shape a real entry has, so the shop screen renders one kind of row.

   Reliquary Wings ARE a real shop row (a repeatable 100M comfort), but they
   belong on the reliquary shelf next to the clasps rather than among the
   general upgrades — hence RESHELVED.
   ========================================================================= */

/* -------------------------------------------------------------------------
   THE SHELVES
   Order is the order the dropdown lists them in, and the first entry is what
   a new player lands on. Reliquary is first because it is the sink that
   introduces itself in the first two minutes (§6.1): 27 Cogs, buyable before
   anything else in the building is affordable.
   ------------------------------------------------------------------------- */
export const SHOP_CATEGORIES = [
  {
    id: "reliquary",
    name: "Reliquary Space",
    blurb: "Stack slots and wings. The smooth sink — every purchase is the next affordable goal.",
  },
  {
    id: "comfort",
    name: "General Upgrades",
    blurb: "Charms, auto-ward sigils and the three mastery codices that raise every pool cap.",
  },
  {
    id: "tool",
    name: "Skill Tools",
    blurb: "Seven rungs per gathering skill, -5% interval each, ending at -40%. Benches are the artisan's three-step version.",
  },
  {
    id: "relic",
    name: "Warding Relics",
    blurb: "The whole combat ladder. Every point of damage in the game is traceable to one of these.",
  },
  {
    id: "ascension",
    name: "Ascension Rites",
    blurb: "Nine Wardens, bound one at a time. The ninth raises every skill cap from 99 to 120.",
  },
];

export const CATEGORY_BY_ID = new Map(SHOP_CATEGORIES.map((c) => [c.id, c]));

/** Shop rows that are shelved somewhere other than their systems category. */
const RESHELVED = { "reliquary-wing": "reliquary" };

/** Which shelf a real ../shop.js entry belongs on. */
export function shelfOf(entry) {
  return RESHELVED[entry.id] || entry.category;
}

/**
 * The shelves to actually show, given the shop as it ships today.
 *
 * The curated list above sets the ORDER and writes the blurbs; anything with a
 * category nobody has curated yet is appended rather than dropped. A shop
 * screen that silently hides a whole new ladder because its author had not
 * also edited this file would be the worst possible failure mode for a
 * catalogue, so this function is written so that it cannot happen.
 */
export function shelvesFor(entries) {
  const out = SHOP_CATEGORIES.filter((c) =>
    entries.some((e) => shelfOf(e) === c.id) || VIRTUAL_ENTRIES.some((v) => v.shelf === c.id));
  for (const e of entries) {
    const id = shelfOf(e);
    if (out.some((c) => c.id === id)) continue;
    out.push({ id, name: id.replace(/(^|[-_])(\w)/g, (_, s, ch) => (s ? " " : "") + ch.toUpperCase()), blurb: "" });
  }
  return out;
}

/* -------------------------------------------------------------------------
   VIRTUAL ENTRIES
   Purchases the engine already owns a dedicated method for, described in the
   same shape as a shop row so one renderer covers both. `cost(game)` and
   `owned(game)` are read live because that is the entire point of the clasp
   curve — the price is a function of how many you already have, and of
   nothing else (shop.js RULE 4).
   ------------------------------------------------------------------------- */
export const VIRTUAL_ENTRIES = [
  {
    id: "reliquary-clasp",
    name: "Reliquary Clasp",
    shelf: "reliquary",
    text: "+1 Maximum Reliquary Space",
    detail: "Cost climbs on the §6.1 curve and self-limits at 5,000,000 after 118 clasps.",
    repeatable: true,
    cost: (game, owned = game.state.clasps) => game.db.claspCost(owned),
    owned: (game) => game.state.clasps,
    max: () => Infinity,
    buy: (game) => game.buyClasp(),
  },
];

export const VIRTUAL_BY_SHELF = (shelf) => VIRTUAL_ENTRIES.filter((v) => v.shelf === shelf);

/* -------------------------------------------------------------------------
   THE BUY-QUANTITY SELECTOR
   The reference offers 1 / 10 / 100 / All. Ours stops at 25 for the repeated
   rows and keeps "All", because the only genuinely repeatable purchases in
   Emberveil are clasps (118 of them) and wings (10) — a "x100" button would
   be a dead control on nine shelves out of ten.
   ------------------------------------------------------------------------- */
export const BUY_QUANTITIES = [
  ["1", "Buy x1"],
  ["5", "x5"],
  ["10", "x10"],
  ["25", "x25"],
  ["all", "All"],
];

/**
 * What `n` purchases of `entry` will ACTUALLY cost, in Cogs.
 *
 * This exists because the shop screen used to print `entry.cost` — one
 * clasp — beside a button reading "Buy x25", and the tap then spent
 * twenty-five rungs of a climbing curve. On the Reliquary Clasp that was
 * 27 Cogs printed against 35,814 Cogs charged; on Reliquary Wing it was
 * 100M printed against 1B charged. The row was not rounding — it was
 * quoting a different transaction from the one the button performed.
 *
 * So the quote and the charge now come from one function. It walks the
 * curve exactly as the buy loop does, which is the only way a curved price
 * can be totalled correctly: on the clasp ladder each purchase raises the
 * price of the next, so 25 x unit is wrong in both directions depending on
 * where you stand.
 *
 * `entry.cost` is a number on a real shop row (flat, repeatable at one
 * price) and a `(game, owned)` function on a virtual one (the curve). Both
 * shapes are totalled here so the screen has one call site.
 */
export function totalCost(game, entry, n) {
  const q = Math.max(0, Math.floor(n));
  if (typeof entry.cost !== "function") return (entry.cost || 0) * q;
  const owned = entry.owned(game);
  let sum = 0;
  for (let i = 0; i < q; i++) sum += entry.cost(game, owned + i);
  return sum;
}

/** How many of `entry` the player can afford right now, capped at `want`. */
export function affordableCount(game, entry, want) {
  const limit = want === "all" ? 1000 : Number(want) || 1;
  let n = 0;
  let cogs = game.state.cogs;
  let owned = entry.owned(game);
  while (n < limit) {
    const price = entry.cost(game, owned);
    if (price > cogs) break;
    cogs -= price;
    owned++;
    n++;
  }
  return n;
}
