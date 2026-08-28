/* =========================================================================
   EMBERVEIL — ITEMS: FARMING

   The twenty-four things that come out of the ground, derived from
   ../crops.js rather than transcribed, so a price can never be right in one
   file and wrong in the other.

   Three kinds, and each one exists for a different downstream skill:

     crop    — food. The supply side of Cooking.
     herb    — reagents. The supply side of Alchemy, and the reason the herb
               beds are the most contested plots in the game. THESE IDS ARE A
               CONTRACT: Alchemy consumes `herb-<name>` and does not define
               them. One owner, one definition.
     timber  — the by-product of the experience category. Worth a fraction of
               a herb on purpose; nobody plants a tree for the timber.

   The item value ladder in ../items.js states five rules and the selftest
   enforces all five against gathering skills. None of them apply here and
   that is deliberate: farming is not a gathering ladder, it is three
   parallel supply lines with a shared scarcity (plots) and a shared tax
   (compost).

   THESE ARE BULK COMMODITY PRICES AND THEY LOOK LIKE IT. A bed hands back
   645 Barley or 2,744 Emberthistle, because ../crops.js sizes a harvest by
   what Alchemy and Cooking actually drink rather than by what reads nicely on
   a card. Unit values are therefore small — 1 to 30 Cogs — and the money is
   in the VOLUME: a capped farm clears ~700k Cogs an hour net of its seed
   bill, which §5 of the maths reference puts at the bottom of the capped
   gathering band and two orders of magnitude below combat. A herb is a weed;
   the value is in the potion.

   Prices are the `value` column of ../crops.js's table and nothing else reads
   or restates them, so a rung cannot be priced twice.
   ========================================================================= */

import { CROPS } from "../crops.js";

export const FARMING_ITEMS = CROPS.map((c) => ({
  id: c.itemId,
  name: c.itemName,
  kind: c.itemKind,
  value: c.value,
}));

export default FARMING_ITEMS;
