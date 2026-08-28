/* =========================================================================
   EMBERVEIL — THE ITEM REGISTRY

   Every object in the world, assembled from one module per concern. The item
   table used to be one file; it is now a directory for the same reason
   ../skills/ is, so that two people adding items for two skills never touch
   the same bytes. ../items.js is a re-export shim and holds no data.

   ---------------------------------------------------------------------------
   TO ADD ITEMS
   ---------------------------------------------------------------------------
     1. write src/data/items/<concern>.js, default-exporting an ARRAY of item
        objects: { id, name, kind, value, ... }
     2. add its import and ONE entry to MODULES below

   That is the whole contract. This file decides nothing except the order the
   modules are read in, and duplicate ids are refused at import.

   A skill file whose outputs must exist before ../index.js runs validate()
   can `import "../items/index.js"` for the side effect; the registry is built
   once, at module evaluation, so the import is idempotent by construction and
   `registerItemModules()` below is a no-op kept for those call sites.

   ---------------------------------------------------------------------------
   THE ITEM OBJECT
   ---------------------------------------------------------------------------
     id        string    unique across every module
     name      string    player-visible; scanned by the selftest for forbidden
                         proper nouns, so keep it ours
     kind      string    ore | bough | catch | ember | billet | provision |
                         sigil | spoil | relic | haul | equipment | crop | ...
     value     number    sale price in Cogs. 0 means "cannot be sold" — used
                         by fuel (embers) and offerings (relics), both of
                         which exist to be destroyed rather than traded
     heal      number    provisions only: HP restored when eaten
     perfectOf string    provisions only: the base item this is the flawless
                         variant of
     devotion  object    relics only: { xp, points } granted when offered
     equip     object    equipment only: see ../equipment.js
   ========================================================================= */

import CORE from "./core.js";
import COMBAT from "./combat.js";
import FARMING from "./farming.js";
import SUMMONING from "./summoning.js";
import ARTISAN from "./artisan.js";

/** One line per item module. Ids must be unique across all of them. */
const MODULES = [CORE, COMBAT, FARMING, SUMMONING, ARTISAN];

function buildRegistry() {
  const items = new Map();
  for (const mod of MODULES) {
    for (const it of mod) {
      if (items.has(it.id)) throw new Error(`duplicate item id: ${it.id}`);
      items.set(it.id, it);
    }
  }
  return items;
}

export const ITEMS = buildRegistry();

/** Kept for call sites that import this module for its side effect. */
export function registerItemModules() {
  return ITEMS;
}

export function item(id) {
  const it = ITEMS.get(id);
  if (!it) throw new Error(`unknown item: ${id}`);
  return it;
}

export function itemValue(id) {
  return item(id).value;
}

/** The base provisions, in ladder order — never the flawless variants. */
export const PROVISION_IDS = [...ITEMS.values()]
  .filter((i) => i.kind === "provision" && !i.perfectOf)
  .map((i) => i.id);

/** Every provision, best healing first — what the auto-ward eats from. */
export function provisionsByHealing() {
  return [...ITEMS.values()].filter((i) => i.kind === "provision").sort((a, b) => b.heal - a.heal);
}

/** Every relic that can be offered, weakest first. Feeds Devotion. */
export function relics() {
  return [...ITEMS.values()].filter((i) => i.devotion).sort((a, b) => a.devotion.xp - b.devotion.xp);
}

/** Every wearable, in registration order. Feeds the equipment pickers. */
export function equipment() {
  return [...ITEMS.values()].filter((i) => i.equip);
}

export { PERFECT_VALUE_BONUS, PERFECT_HEAL_BONUS } from "./core.js";
