/* =========================================================================
   EMBERVEIL — ITEMS: THE EXOTIC WING  (Astrology motes, Summoning tablets)

   One item module for the three bespoke skills, because they share one
   pricing argument and splitting them across three files would split the
   argument with them. Agility contributes nothing here on purpose: it is a
   `route` skill and pays Cogs straight out of the action, so it has no item
   of its own to price.

   THE PRICES, AND WHY THEY ARE WHAT THEY ARE
   ------------------------------------------
   MOTES ARE DELIBERATELY THE POOREST OUTPUT IN THE GAME. A Star Mote is 2
   Cogs and a Prism Mote is 8. At the flat 3.00 s Astrology interval that is
   2,400 and 9,600 Cogs an hour — the same opening band as Mining and
   Woodcutting, and it never grows, because the eighth constellation drops
   exactly the same mote as the first. Astrology is not a faucet. Its entire
   output is the twenty-four constellation modifier slots, and pricing the
   motes any higher would turn the best modifier screen in the game into a
   money loop nobody reads.

   A TABLET IS WORTH ABOUT FOUR TIMES THE MATERIAL IT IS MADE OF. That is
   deliberately fatter than a billet's late-chain markup (items.js R4) and
   deliberately thinner than a sigil's, for one reason: a tablet is CONSUMED
   AT ONE PER ACTION while its familiar is equipped. Its real price is not
   the sale value below, it is the hour of Summoning you spend to keep a
   modifier switched on. Four times the input is what makes selling a tablet
   a genuine alternative to equipping it rather than an obvious mistake, and
   it keeps every rung clear of the R5 trap invariant.
   ========================================================================= */

import { FAMILIARS, tabletId } from "../familiars.js";

/** Astrology's two outputs. Study drops the first, Explore the second. */
export const MOTES = [
  { id: "star-mote",  name: "Star Mote",  kind: "mote", value: 2 },
  { id: "prism-mote", name: "Prism Mote", kind: "mote", value: 8 },
];

/** One tablet per familiar, priced in ../familiars.js beside its recipe. */
export const TABLETS = FAMILIARS.map((f) => ({
  id: tabletId(f.id),
  name: `${f.name} Tablet`,
  kind: "tablet",
  value: f.value,
  familiar: f.id,
}));

export const EXOTIC_ITEMS = [...MOTES, ...TABLETS];

export default EXOTIC_ITEMS;
