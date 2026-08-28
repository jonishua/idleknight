/* =========================================================================
   EMBERVEIL — THE SHOP

   Where the Cogs go, assembled from one module per shelf. The shop table used
   to be one file; it is now a directory for the same reason ../skills/ is, so
   that two people adding two ladders never touch the same bytes.

   ---------------------------------------------------------------------------
   TO ADD SHOP ENTRIES
   ---------------------------------------------------------------------------
     1. write src/data/shop/<shelf>.js, exporting `ENTRIES` — an array of shop
        rows
     2. add its import and one entry to MODULES below

   That is the whole contract. This file decides nothing except the order the
   modules are read in, and duplicate ids are refused at import.

   ./core.js is a different thing and is NOT concatenated here: it is the
   shopfront catalogue (which drawer a shelf lives in, what the buy-quantity
   selector offers), read directly by the shop screen. Prices and modifiers
   live in the modules below; shelving lives there.

   ---------------------------------------------------------------------------
   THE SHOP ROW
   ---------------------------------------------------------------------------
     id          string   unique across every module
     name        string   player-visible
     category    string   tool | relic | comfort | ascension | bounty | gear
     skill       string   which skill's level gates it (also the default mod
                          scope for its modifiers)
     level       number   required level in that skill
     cost        number   Cogs
     seals       number   OPTIONAL Warden Seals as well
     marks       number   OPTIONAL Bounty Marks as well
     material    [id,qty] OPTIONAL items consumed on purchase
     requires    string   OPTIONAL id of the row that must be owned first
     repeatable  number   OPTIONAL how many times it can be bought
     mods        [[name, value, scope]]  scope is "global" | "skill" | an id
   ========================================================================= */

import { ENTRIES as LADDER, WAYSTATION_LIST, WAYSTATION_BY_ID, RELIC_LADDER,
         TOOL_LADDERS, ASCENSION_RITES, PLAYER_BASE, WAYSTATION_SLOTS,
         claspCost, claspCumulative, CLASP_CURVE, CLASP_FLAT_COST } from "./ladder.js";
import { ENTRIES as COMBAT } from "./combat.js";
import { ENTRIES as EXOTIC } from "./exotic.js";
import { PASSIVE_SHOP as PASSIVE } from "./passive.js";
import { ENTRIES as ARTISAN } from "./artisan.js";

/** Registration order. Ids must be unique across all of them. */
const MODULES = [LADDER, COMBAT, PASSIVE, ARTISAN, EXOTIC];

function buildShop() {
  const out = [];
  const seen = new Set();
  for (const mod of MODULES) {
    for (const e of mod) {
      if (seen.has(e.id)) throw new Error(`duplicate shop entry id: ${e.id}`);
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

export const SHOP = buildShop();
export const SHOP_BY_ID = new Map(SHOP.map((e) => [e.id, e]));

export {
  WAYSTATION_LIST, WAYSTATION_BY_ID, RELIC_LADDER, TOOL_LADDERS,
  ASCENSION_RITES, PLAYER_BASE, WAYSTATION_SLOTS,
  claspCost, claspCumulative, CLASP_CURVE, CLASP_FLAT_COST,
};
