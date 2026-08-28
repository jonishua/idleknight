/* =========================================================================
   EMBERVEIL — SHOP (compatibility re-export)

   The sink ladder used to live here as one file. It now lives in ./shop/,
   one module per shelf, so parallel work on two ladders never touches the
   same bytes.

   DO NOT ADD CONTENT TO THIS FILE. To add shop entries:
     1. create/edit ./shop/<shelf>.js — it exports `ENTRIES`
     2. add its import + one array entry in ./shop/index.js

   The shopfront catalogue — categories, buy quantities, the virtual clasp row
   — is a separate concern and lives in ./shop/core.js.

   This shim exists only so that ./index.js and anything else that already
   imports "./shop.js" keeps resolving. It will never hold data again.
   ========================================================================= */

export {
  SHOP, SHOP_BY_ID, WAYSTATION_LIST, WAYSTATION_BY_ID, RELIC_LADDER,
  TOOL_LADDERS, ASCENSION_RITES, PLAYER_BASE, WAYSTATION_SLOTS,
  claspCost, claspCumulative, CLASP_CURVE, CLASP_FLAT_COST,
} from "./shop/index.js";
