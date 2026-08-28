/* =========================================================================
   EMBERVEIL — ITEMS: THE COMBAT CORE

   Everything the eight combat skills and Larceny put into the bank:

     RELICS      offerings. Value 0 — they cannot be sold, only spoken over
                 at the Reliquary, which is where Devotion XP and prayer
                 points come from. The reference's Prayer is fed by a drop you
                 choose between burying and selling; ours removes the sale so
                 the choice is "which relic tier do I farm", not "do I bother".
     HAULS       what a Larceny target is actually carrying. One per area, on
                 a rising ladder, dropped on a fraction of successful lifts —
                 a second faucet on top of the coins, so the skill feeds the
                 bank and the sell button rather than only the wallet.
     EQUIPMENT   forty armour pieces, generated in ../equipment.js.

   ONE CONCERN, ONE FILE: default-exports a flat array of item objects, which
   ./index.js concatenates into the single registry. Nothing here edits
   ./core.js and nothing in ./core.js knows this file exists.
   ========================================================================= */

import { EQUIPMENT } from "../equipment.js";

/* -------------------------------------------------------------------------
   RELICS — the Devotion faucet.

   Four tiers, and the prayer points they carry are what the whole skill runs
   on. `devotion.xp` and `devotion.points` are read by the engine's Reliquary
   offering; the ratio between them is deliberately CONSTANT at 0.8 points per
   XP, so a player never has to choose between "the tier that levels me" and
   "the tier that funds me". The tier ladder alone decides the rate.

   Value 0 is load-bearing: an offering that could also be sold would put the
   whole skill in competition with the sell button at every single drop.
   ------------------------------------------------------------------------- */
const RELICS = [
  ["relic-ashen",    "Ashen Relic",     20,   16],
  ["relic-hallowed", "Hallowed Relic",  95,   76],
  ["relic-warden",   "Warden's Relic",  420,  336],
  ["relic-ninefold", "Ninefold Relic",  1800, 1440],
];

/* -------------------------------------------------------------------------
   HAULS — one per Larceny area, climbing 3.5x-4x a step.
   ------------------------------------------------------------------------- */
const HAULS = [
  ["haul-frayed-purse",  "Frayed Purse",       25],
  ["haul-ore-satchel",   "Ore Runner's Satchel", 92],
  ["haul-merchant-pouch","Merchant's Pouch",   340],
  ["haul-sealed-manifest","Sealed Manifest",   1_250],
  ["haul-silver-service","Silver Service",     4_400],
  ["haul-warden-signet", "Warden's Signet",    16_500],
];

const items = [];

for (const [id, name, xp, points] of RELICS) {
  items.push({
    id, name, kind: "relic", value: 0,
    devotion: { xp, points },
  });
}

for (const [id, name, value] of HAULS) {
  items.push({ id, name, kind: "haul", value });
}

items.push(...EQUIPMENT);

/** Relic ids, weakest first — the offering list on the Combat screen. */
export const RELIC_IDS = RELICS.map(([id]) => id);
/** Haul ids in area order, so ../skills/larceny.js can index them by rung. */
export const HAUL_IDS = HAULS.map(([id]) => id);

export default items;
