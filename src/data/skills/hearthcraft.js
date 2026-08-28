/* =========================================================================
   EMBERVEIL — SKILL: COOKING   (parity §3b, "Cooking is the richest artisan")

   One skill, one file. Edit this file to change Cooking and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   ---------------------------------------------------------------------------
   THREE STATIONS, AND WHY THAT IS THE WHOLE DESIGN
   ---------------------------------------------------------------------------
   §3b singles Cooking out: "three independent stations, each with its own
   selected recipe, an Active Cook and a Passive Cook that fills a Stockpile
   you 'Collect from', plus an 'Enable Perfect Cooks?' toggle and per-recipe
   bonus percentages."

   The engine holds exactly ONE foreground action, which is the correct model
   and is not negotiable — so one station is the Active Cook and the other two
   run PASSIVE, at a fifth of the rate, into a stockpile the player comes back
   for. That is the reference's own arrangement (11.00 s active against
   55.00 s passive is exactly 5x) and it is what turns a flat recipe list into
   a standing decision: which dish do I want to be cooking while I am busy?

   The passive half lives in ../../js/engine/systems/cooking-stations.js. It
   is absolute-tick, not incremental, so live play, a throttled tab and the
   24 h offline replay all resolve it identically.

   §4.3's intervals are shipped literally:
     FIRE      2 s -> 10 s, per recipe. The fish ladder, one grill per catch.
     FURNACE   8 s FLAT. Smoking and baking — every dish costs the same time,
               so the station's tiers are about ingredients, never speed.
     POT       7 s FLAT. Stews and chowders, which is where Farming's crops
               meet Fishing's catches.

   ---------------------------------------------------------------------------
   THE PRICE RULE THAT BINDS THIS FILE
   ---------------------------------------------------------------------------
   ../items/core.js's R3 holds a FLAT 2.4x markup across the SINGLE-INPUT
   grills, because a markup that moved with tier would make one rung of the
   fish ladder strictly dominant and kill the other seven. Every dish added
   here has two or more inputs and is therefore outside that rule by
   construction — and earns it, because a Pot dish competes for a farm plot as
   well as for a catch.

   IT IS NOT OUTSIDE R4. Twelve of the twenty recipes are composites and they
   sit on the same catch ladder the grills do, so their margins compound off
   the same base and have to thin as the ladder climbs. Two ladders, both
   monotone by level, both asserted:

     CATCH CHAIN   nine dishes, 4.00x on Thin Broth to 1.49x on the Ninefold
                   Feast. It used to end at 11.75x.
     FARM SHELF    three dishes made of nothing but crops, 5.83x to 4.38x. It
                   used to run 8.8x, 17.4x and 25.7x, with the 25.7x in the
                   middle of the ladder rather than at the bottom.

   tools/check-artisan.mjs measures both and fails the build on a rung that
   climbs. It keeps them apart because a crop's Cog price is a rounding error
   next to its real cost — a plot-hour — so the two kinds of margin are not
   comparable numbers. R5 agrees: `needed` is 1.00x for all three farm dishes
   and 1.01x-1.29x for the catch chain.

   Healing per Cog still falls the length of the ladder: 13.3 HP a Cog at the
   first rung, 0.05 at the last. Late provisions buy FEWER INTERRUPTIONS in a
   fight, never efficiency.

   ---------------------------------------------------------------------------
   QUALITY
   ---------------------------------------------------------------------------
   Success is 70% at mastery 1 and climbs 0.6 points a level, reaching
   certainty at mastery 50 (§7.5). Past that the same climb keeps paying into
   the PERFECT roll — a result worth +50% on sale and +10% healing. The
   "Enable Perfect Cooks?" toggle switches `perfectPerMastery` between the
   authored rate and zero; `perfectPerMasteryDefault` is the authored value
   the view restores from, so the toggle can never silently rewrite content.
   ========================================================================= */

const HEARTHCRAFT = {
  id: "hearthcraft",
  name: "Cooking",
  kind: "artisan",
  blurb: "Provisions. The only reason anyone walks back out of the veil.",
  mastery: true,
  masteryActionTime: { ofBase: 0.85 },
  intervalMode: "perRecipe",
  quality: {
    successBase: 0.7,
    successPerMastery: 0.006,
    perfectPerMastery: 0.0096,
    /* The authored perfect rate. The "Enable Perfect Cooks?" toggle writes
       `perfectPerMastery` from this and back to 0; nothing else may. */
    perfectPerMasteryDefault: 0.0096,
  },

  /* -----------------------------------------------------------------------
     THE STATIONS
     `passiveMultiplier` is §3b's 11.00 s / 55.00 s ratio. `stockpileCap` is
     ours: a passive cook that never filled up would be a reason never to open
     the screen again, and a stockpile you must come back for is the reason
     the mechanic exists at all.
     --------------------------------------------------------------------- */
  stations: [
    { id: "fire",    name: "Cooking Fire", verb: "Cook",  blurb: "Open flame. One grill per catch, 2 s to 10 s.", flat: null },
    { id: "furnace", name: "Furnace",      verb: "Bake",  blurb: "Smoking and baking, 8 s flat whatever is in it.", flat: 8 },
    { id: "pot",     name: "Pot",          verb: "Simmer", blurb: "Stews and chowders, 7 s flat. Crops meet catches.", flat: 7 },
  ],
  passiveMultiplier: 5,
  stockpileCap: 20,

  recipes: [
    /* --- Cooking Fire: the fish ladder, one grill per catch -------------
       Single-input, flat 2.4x markup, and the selftest asserts it over
       exactly this set. Do not add a single-input dish outside this line. */
    { id: "cook-silverfin",  name: "Cooked Minnow",     station: "fire",    level: 1,  xp: 7,   interval: 2,   consumes: [["silverfin", 1]],  produces: "ration-silverfin" },     // grill, R3 flat
    { id: "cook-broth",      name: "Thin Broth",        station: "pot",     level: 6,  xp: 16,  interval: 7,   consumes: [["silverfin", 2], ["crop-potato", 1]], produces: "ration-broth" },   // 4.00x
    { id: "cook-bogskate",   name: "Cooked Trout",      station: "fire",    level: 12, xp: 22,  interval: 3,   consumes: [["bogskate", 1]],   produces: "ration-bogskate" },      // grill, R3 flat
    { id: "cook-hardtack",   name: "Hardtack",          station: "furnace", level: 18, xp: 34,  interval: 8,   consumes: [["crop-cabbage", 3], ["ember-cinder", 1]], produces: "ration-hardtack" },  // 5.83x
    { id: "cook-stew",       name: "Root Stew",         station: "pot",     level: 24, xp: 48,  interval: 7,   consumes: [["bogskate", 2], ["crop-onion", 1], ["crop-cabbage", 1]], produces: "ration-stew" },  // 3.67x
    { id: "cook-glimmereel", name: "Cooked Eel",        station: "fire",    level: 28, xp: 48,  interval: 4,   consumes: [["glimmereel", 1]], produces: "ration-glimmereel" },    // grill, R3 flat
    { id: "cook-smoked-eel", name: "Smoked Eel",        station: "furnace", level: 34, xp: 82,  interval: 8,   consumes: [["glimmereel", 2], ["ember-cinder", 1]], produces: "ration-smoked-eel" },  // 2.92x
    { id: "cook-ashray",     name: "Cooked Bass",       station: "fire",    level: 38, xp: 72,  interval: 5,   consumes: [["ashray", 1]],     produces: "ration-ashray" },        // grill, R3 flat
    { id: "cook-chowder",    name: "Deepwater Chowder", station: "pot",     level: 44, xp: 110, interval: 7,   consumes: [["ashray", 3], ["crop-tomato", 1], ["crop-sweetcorn", 1]], produces: "ration-chowder" },  // 2.68x
    /* THE FARM SHELF — Hardtack, Harvest Loaf, Harvest Pie. Three dishes made
       of nothing but crops and a free ember, and the only three in the skill
       whose margin is NOT comparable to anything else here.

       A crop costs 2 to 30 Cogs and an hour in the ground. Its Cog price is a
       rounding error next to its real cost, which is a PLOT-HOUR, so the
       Cog-markup on a crop dish measures nothing: R5's own `needed` figure for
       all three is 1.00x, because the input time is enormous while the input
       price is not. That is the same situation Alchemy's potion shelf is in,
       and check-artisan.mjs classifies both the same way.

       They were still absurd — 8.8x, 17.4x and 25.7x — so the prices came down
       (the Loaf from 540 to 300, the Pie from 1,800 to 1,050, with their
       healing scaled to match so HP-per-Cog did not move) and the baskets went
       up as far as the farm can actually feed. They now run 5.83x, 5.26x,
       4.38x — thinning with level like everything else, at a third of what
       they were.

       "AS FAR AS THE FARM CAN FEED" IS A MEASURED BOUND, NOT A GUESS.
       tools/check-passive.mjs runs the farm and the bench through the tick
       engine at five level tiers and fails if the hungriest Cooking recipe
       outruns the beds at the bare 50% grow chance. Four cabbage in a Hardtack
       is 0.97x there; three is 1.28x. Ten sweetcorn and nine strawberries in a
       Loaf — which is what a 2.6x markup would have cost — is 0.33x, a farm
       three times too small to run its own kitchen. Every quantity on this
       shelf is the largest one that clears 1.25x. */
    { id: "cook-loaf",       name: "Harvest Loaf",      station: "furnace", level: 50, xp: 140, interval: 8,   consumes: [["crop-sweetcorn", 2], ["crop-strawberry", 3], ["ember-bright", 1]], produces: "ration-loaf" },  // 5.26x
    { id: "cook-voidmaw",    name: "Cooked Tuna",       station: "fire",    level: 52, xp: 128, interval: 6.5, consumes: [["voidmaw", 1]],    produces: "ration-voidmaw" },       // grill, R3 flat
    { id: "cook-deepstew",   name: "Veilroot Stew",     station: "pot",     level: 60, xp: 190, interval: 7,   consumes: [["voidmaw", 3], ["crop-strawberry", 2], ["crop-pumpkin", 2]], produces: "ration-deepstew" },  // 2.58x
    { id: "cook-tidewyrm",   name: "Cooked Swordfish",  station: "fire",    level: 64, xp: 205, interval: 8,   consumes: [["tidewyrm", 1]],   produces: "ration-tidewyrm" },      // grill, R3 flat
    { id: "cook-smoked-swordfish", name: "Smoked Swordfish", station: "furnace", level: 68, xp: 250, interval: 8, consumes: [["tidewyrm", 2], ["ember-bright", 2]], produces: "ration-smoked-swordfish" },  // 2.35x
    { id: "cook-stormgar",   name: "Cooked Shark",      station: "fire",    level: 72, xp: 265, interval: 9,   consumes: [["stormgar", 1]],   produces: "ration-stormgar" },      // grill, R3 flat
    { id: "cook-pie",        name: "Harvest Pie",       station: "furnace", level: 78, xp: 330, interval: 8,   consumes: [["crop-pumpkin", 3], ["crop-barley", 6], ["ember-void", 1]], produces: "ration-pie" },  // 4.38x
    { id: "cook-aetherray",  name: "Cooked Aetherray",  station: "fire",    level: 80, xp: 340, interval: 10,  consumes: [["aetherray", 1]],  produces: "ration-aetherray" },     // grill, R3 flat
    { id: "cook-smoked-aetherray", name: "Smoked Aetherray", station: "furnace", level: 84, xp: 400, interval: 8, consumes: [["aetherray", 3], ["ember-void", 1]], produces: "ration-smoked-aetherray" },  // 1.89x
    /* The two composites that were always here, now shelved on the station
       each of them obviously belongs to, and now buying their thin margins
       with a BASKET rather than with a dish.

       NOTHING IN THIS LIST CONSUMES ANOTHER DISH ANY MORE, and that is a bug
       fix rather than a style choice. `_consume` matches item ids exactly, and
       the perfect-cook roll ships its output as `perfect-<id>`: at mastery 99
       a Cooked Swordfish comes out Flawless about 95% of the time, so a Hearty
       Stew that asked for `ration-tidewyrm` was gated on the WORSE half of its
       own supply and starved while the Flawless ones piled up unused. Raw
       catches have no such split. The Feast is sixty fish because a 78,000-Cog
       dish at 1.49x has to cost 52,000 Cogs of something, and sixty fish is
       what a feast looks like. */
    { id: "cook-warding",    name: "Hearty Stew",       station: "pot",     level: 88, xp: 470, interval: 7,   consumes: [["tidewyrm", 4], ["ember-bright", 1]], produces: "ration-warding" },  // 1.76x
    { id: "cook-ninefold",   name: "Ninefold Feast",    station: "furnace", level: 96, xp: 720, interval: 8,   consumes: [["aetherray", 30], ["tidewyrm", 30], ["ember-void", 2]], produces: "ration-ninefold" },  // 1.49x
  ],

  checkpoints: [
    { pct: 0.10, name: "Hearth Sense",  text: "+5% Cooking mastery XP",              mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Second Plate",  text: "+5% chance to double provisions",     mods: [["doubleChance", 0.05, "skill"]] },
    { pct: 0.50, name: "Thrift",        text: "+10% chance to preserve ingredients", mods: [["preserveChance", 0.10, "skill"]] },
    { pct: 0.95, name: "Hearthmaster",  text: "+10% healing from every provision",   mods: [["healing", 0.10, "global"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "70% success, climbing 0.6% per mastery level" },
    { level: 10, text: "-4% interval on this recipe",       mods: [["intervalPercent", -0.04, "recipe"]] },
    { level: 20, text: "+4% preserve on this recipe",       mods: [["preserveChance", 0.04, "recipe"]] },
    { level: 50, text: "Success reaches 100%" },
    { level: 65, text: "+5% chance to double this dish",    mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this recipe",       mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+10% preserve on this recipe",      mods: [["preserveChance", 0.10, "recipe"]] },
    { level: 99, text: "+25% sale value for this dish",     mods: [["saleValue", 0.25, "recipe"]] },
  ],
};

export default HEARTHCRAFT;
