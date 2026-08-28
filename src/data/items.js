/* =========================================================================
   EMBERVEIL — ITEMS (compatibility re-export)

   The item table used to live here as one file. It now lives in ./items/,
   one module per concern, so parallel work on two skills' item ladders never
   touches the same bytes.

   DO NOT ADD CONTENT TO THIS FILE. To add items:
     1. create/edit ./items/<concern>.js — it default-exports an array of items
     2. add its import + one array entry in ./items/index.js

   This shim exists only so that ./index.js and anything else that already
   imports "./items.js" keeps resolving. It will never hold data again.
   ========================================================================= */

export {
  ITEMS, item, itemValue, PROVISION_IDS, provisionsByHealing,
  relics, equipment, PERFECT_VALUE_BONUS, PERFECT_HEAL_BONUS,
} from "./items/index.js";
