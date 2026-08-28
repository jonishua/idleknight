/* =========================================================================
   EMBERVEIL — SKILL: FARMING   (passive)

   One skill, one file. Edit this file to change FARMING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   ---------------------------------------------------------------------------
   WHY THIS SKILL LOOKS DIFFERENT FROM THE OTHER NINE
   ---------------------------------------------------------------------------
   Farming is PASSIVE. It never holds `state.action`: plots grow on their own
   timers while Mining or Warding owns the foreground, and the live tick loop
   and the 24 h offline replay resolve them identically because they are the
   same loop. The plot machinery lives in
   ../../js/engine/systems/farming.js; the crop table lives in ../crops.js;
   this file is the SKILL — its level curve, its mastery pool, its four
   checkpoints and its per-crop unlock ladder.

   The `recipes` array is still the real recipe list, because everything the
   mastery system does is keyed off it: the pool cap is 500,000 x 24 =
   12,000,000, which is exactly the Farming pool cap the parity capture
   recorded off a live save. Twenty-four crops is not a taste call, it is
   that number solved backwards.

   MASTERY ACTION TIME. §2.1 gives Farming its own rule — the HOURS the crop
   spent in the ground, times the quantity harvested, divided by 3 for
   allotments and herbs or by 10 for trees. `ofBase: 1/10800` is exactly
   "grow seconds -> hours, then / 3": the systems module applies the quantity
   and swaps in the tree divisor, and this constant is what the balance
   sandbox uses when it walks the recipe list generically.
   ========================================================================= */

import { CROPS, CATEGORY_BY_ID } from "../crops.js";

const FARMING = {
  id: "farming",
  name: "Farming",
  kind: "farming",
  /* §1 of the parity bar files this under PASSIVE, and the menu reads the
     flag rather than the kind — the kind names the SCREEN archetype, and
     Farming and Settlement are both passive without sharing a page. */
  passive: true,
  blurb: "Beds, herb rows and slow trees. It grows whether you are watching or not.",
  mastery: true,
  /* grow seconds -> hours, then §2.1's allotment/herb divisor of 3. The
     quantity term §2.1 multiplies in is the category's `seedsPerBed`, not the
     harvest in leaves — see ../../js/engine/systems/farming.js. */
  masteryActionTime: { ofBase: 1 / 10800 },
  intervalMode: "perRecipe",
  /* The category a crop belongs to and the plot grid it grows in. */
  categories: CATEGORY_BY_ID,
  recipes: CROPS.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    xp: c.xp,
    /* The engine's generic `interval` is the crop's grow time, so the
       balance sandbox can price a farmed herb in seconds of play without
       knowing anything about plots. */
    interval: c.growSeconds,
    produces: c.itemId,
    category: c.category,
    seedCost: c.seedCost,
    yield: c.yield,
  })),
  /* The checkpoint ladder every skill in the game spends the same way:
       10%  more mastery XP        25%  a throughput fix
       50%  an economy multiplier  95%  a prestige/global bonus
     Farming's throughput is grow chance, and its economy multiplier is the
     seed bill — the two numbers a farmer actually feels. */
  checkpoints: [
    { pct: 0.10, name: "Green Thumb",   text: "+5% Farming mastery XP",              mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Deep Rooting",  text: "+10% chance for a crop to grow",      mods: [["growChance", 0.10, "skill"]] },
    { pct: 0.50, name: "Saved Seed",    text: "-25% seed cost on every planting",    mods: [["costReduction", 0.25, "skill"]] },
    /* Scoped to the skill, not global. A global doubling modifier from a
       passive skill would silently multiply every other skill's output the
       moment the pool filled, which is exactly the kind of invisible
       cross-skill leak the additive pipeline exists to make auditable. */
    { pct: 0.95, name: "Harvest Rite",  text: "+15% yield on every harvest",         mods: [["yieldPercent", 0.15, "skill"]] },
  ],
  /* The reference's own unlock levels: 1, 10, 20, 50, 65, 85, 95, 99. Farming
     spends them on the two things a plot has — how likely it is to live and
     how much it yields — plus the one thing the player pays for it.

     YIELD BONUSES ARE PERCENTAGES, NOT "+N". A flat +1 was a fifth of a
     five-potato bed and 0.15% of a 645-barley one; the same modifier cannot
     be a headline early and a rounding error late. ../crops.js measures a bed
     in units per plot-hour, so every yield bonus here is a share of it. */
  masteryUnlocks: [
    { level: 1,  text: "Base grow chance is 50%, +10% per compost application" },
    { level: 10, text: "+4% chance for this crop to grow",       mods: [["growChance", 0.04, "recipe"]] },
    { level: 20, text: "-10% seed cost for this crop",           mods: [["costReduction", 0.10, "recipe"]] },
    { level: 50, text: "+8% chance for this crop to grow",       mods: [["growChance", 0.08, "recipe"]] },
    { level: 65, text: "+10% yield on this crop",                mods: [["yieldPercent", 0.10, "recipe"]] },
    { level: 85, text: "-8% grow time for this crop",            mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+10% chance to double this harvest",     mods: [["doubleChance", 0.10, "recipe"]] },
    { level: 99, text: "+25% yield and +15% sale value",         mods: [["yieldPercent", 0.25, "recipe"], ["saleValue", 0.15, "recipe"]] },
  ],
};

export default FARMING;
