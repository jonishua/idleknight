/* =========================================================================
   EMBERVEIL — SKILL: CRAFTING   (parity §3b, §5 "Crafting — unchanged")

   One skill, one file. Edit this file to change CRAFTING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   ---------------------------------------------------------------------------
   THREE CATEGORIES, THREE JOBS
   ---------------------------------------------------------------------------
     LEATHER     Combat's spoils are the hide. Veil Ash, Hollow Cores and Rift
                 Slivers cure into wearable hide with bark tannin off the
                 boughs, and the hide becomes armour. This is the only place
                 in the game where what falls off a monster becomes something
                 you can put on, which is what makes the combat ladder feed a
                 non-combat skill instead of only the sell button.
     STONEWORK   Gems. Amber is fossil resin off a bough; Hollowstone and
                 Riftstone are mid-tier spoils cut on a coal-grit wheel;
                 Stormstone is Riftstone fused with Warden's Tears out of the
                 deep seams.
     JEWELLERY   A billet from Smithing plus a stone from Stonework. Rings and
                 amulets, and the reason the two other categories exist.

   ---------------------------------------------------------------------------
   WHERE THE LADDER STOPS EATING SPOILS, AND WHY
   ---------------------------------------------------------------------------
   The three spoils ABOVE Rift Sliver — Stormcrown Fragment, Riftbound Heart,
   Ninefold Core — are not inputs to anything here, and they never will be.

   R5 says a recipe must beat selling its own inputs. That means a recipe
   inherits the Cogs-per-second of the densest thing it eats. A Stormcrown
   Fragment is 98,000 Cogs off a drop that lands in half a second: 770M
   Cogs/hr for doing nothing but pressing sell. The first draft of this file
   cut six of them into a gem, and the gem then had to clear that bar, and the
   torc built on the gem had to clear the gem's bar. Measured: 1.92B and 3.33B
   Cogs/hr, against 142M for the best loop in the rest of the game.

   The top of this skill is fed from Delving and Smithing instead. Warden's
   Tears sell at 2.7M Cogs/hr, Warden Alloy at 10.6M, the Ninefold Ingot at
   44M — all of them inside the band a non-combat skill is allowed to occupy —
   and the whole seventeen-rung ladder now tops out at 71.6M Cogs/hr on the
   Rifthide Hood, third behind Enchanting and Summoning.

   ---------------------------------------------------------------------------
   THE MARKUP SHAPE
   ---------------------------------------------------------------------------
   R4: markups COMPOUND, so they must SHRINK with depth. Smithing runs 2.00x
   on rung one to 1.12x on rung ten. This ladder is seventeen rungs deep and
   runs 4.00x to 1.30x, monotone non-increasing by level, and every rung still
   clears R5 by at least 15%. A flat 2.6x — which is what shipped last round —
   is 3.5 million times over seventeen rungs, and it showed.

   ---------------------------------------------------------------------------
   WHAT LEAVES THE SKILL
   ---------------------------------------------------------------------------
   Sinew Cord. Every bow in Bowcraft is strung with one, and nothing else in
   the game makes them. That single item is the interlock that stops the two
   new artisan skills from being two unrelated ladders that happen to have
   landed in the same update.

   ---------------------------------------------------------------------------
   MASTERY ACTION TIME
   ---------------------------------------------------------------------------
   §2.1's fixed artisan constant for this skill in the reference is 1.65 s.
   ========================================================================= */

const CRAFTING = {
  id: "crafting",
  name: "Crafting",
  kind: "artisan",
  blurb: "Hide, stone and setting. What the veil leaves behind, made into something worn.",
  mastery: true,
  masteryActionTime: { fixed: 1.65 },
  intervalMode: "perRecipe",
  categories: [
    { id: "leather",   name: "Leather",   blurb: "Cure the spoils with bark tannin, then cut the hide into armour." },
    { id: "stonework", name: "Stonework", blurb: "Amber off the boughs, and the veil's own spoils cut into stones." },
    { id: "jewellery", name: "Jewellery", blurb: "A billet and a stone. Rings and amulets for the trinket slots." },
  ],
  /* markup = value(produces) / sum(value(consumes)). MONOTONE NON-INCREASING
     by level, 4.00x -> 1.30x. tools/check-artisan.mjs asserts it. */
  recipes: [
    /* markup                                                                                                                                                                                    4.00x */
    { id: "craft-amber",           name: "Amber",               category: "stonework", level: 1,  xp: 7,   interval: 2.5, consumes: [["palebirch", 4]],                                                        produces: "gem-amber" },
    /*                                                                                                                                                                                                       2.96x */
    { id: "craft-veilhide",        name: "Cured Veilhide",      category: "leather",   level: 5,  xp: 16,  interval: 3,   consumes: [["veil-ash", 3], ["palebirch", 2]],                                       produces: "veilhide" },
    /*                                                                                                                                                                                                       2.12x */
    { id: "craft-sinew",           name: "Sinew Cord",          category: "leather",   level: 10, xp: 22,  interval: 2,   consumes: [["veilhide", 1]],                                                         produces: "sinew-cord" },
    /*                                                                                                                                                                                                       2.00x */
    { id: "craft-ring-copper",     name: "Copper Band",         category: "jewellery", level: 16, xp: 30,  interval: 3,   consumes: [["shalebrick", 1], ["gem-amber", 1]],                                     produces: "ring-copper" },
    /*                                                                                                                                                                                                       1.94x */
    { id: "craft-hide-boots",      name: "Veilhide Boots",      category: "leather",   level: 22, xp: 40,  interval: 3,   consumes: [["veilhide", 2]],                                                         produces: "hide-boots" },
    /*                                                                                                                                                                                                       1.90x */
    { id: "craft-hide-body",       name: "Veilhide Jerkin",     category: "leather",   level: 30, xp: 58,  interval: 3.5, consumes: [["veilhide", 4]],                                                         produces: "hide-body" },
    /* Coal is the grit on the lap wheel. It costs almost nothing and it is
       there for R5: cutting two spoils that arrive in a second and a half is
       an action whose own time DOMINATES, and a recipe like that has to clear
       nearly 2x before it beats the sell button. Four pence of abrasive
       triples the input time and drops the bar to 1.15x.                                                                                                                                                    1.85x */
    { id: "craft-gem-hollow",      name: "Cut Hollowstone",     category: "stonework", level: 36, xp: 72,  interval: 3,   consumes: [["hollow-core", 2], ["verdigris", 2]],                                    produces: "gem-hollow" },
    /*                                                                                                                                                                                                       1.80x */
    { id: "craft-hollowhide",      name: "Cured Hollowhide",    category: "leather",   level: 42, xp: 92,  interval: 3.5, consumes: [["hollow-core", 3], ["veilcedar", 2]],                                    produces: "hollowhide" },
    /* A pendant hangs on a cord. Same job as the grit above: it is what makes
       the jewellery line's own time stop dominating.                                                                                                                                                        1.75x */
    { id: "craft-amulet-silver",   name: "Silver Pendant",      category: "jewellery", level: 50, xp: 125, interval: 3.5, consumes: [["slagbloom-billet", 1], ["gem-hollow", 1], ["sinew-cord", 2]],           produces: "amulet-silver" },
    /*                                                                                                                                                                                                       1.70x */
    { id: "craft-hollow-legs",     name: "Hollowhide Greaves",  category: "leather",   level: 56, xp: 160, interval: 4,   consumes: [["hollowhide", 3]],                                                       produces: "hollow-legs" },
    /*                                                                                                                                                                                                       1.66x */
    { id: "craft-hollow-body",     name: "Hollowhide Cuirass",  category: "leather",   level: 62, xp: 200, interval: 4,   consumes: [["hollowhide", 4]],                                                       produces: "hollow-body" },
    /*                                                                                                                                                                                                       1.62x */
    { id: "craft-gem-rift",        name: "Cut Riftstone",       category: "stonework", level: 68, xp: 250, interval: 3,   consumes: [["rift-sliver", 2], ["verdigris", 4]],                                    produces: "gem-rift" },
    /*                                                                                                                                                                                                       1.58x */
    { id: "craft-rifthide",        name: "Cured Rifthide",      category: "leather",   level: 74, xp: 310, interval: 4,   consumes: [["rift-sliver", 3], ["glasswillow", 2]],                                  produces: "rifthide" },
    /*                                                                                                                                                                                                       1.54x */
    { id: "craft-ring-gold",       name: "Gold Signet",         category: "jewellery", level: 80, xp: 385, interval: 4,   consumes: [["emberquartz-core", 1], ["gem-rift", 1], ["wardens-tear", 4]],           produces: "ring-gold" },
    /* THE RE-POINTED RUNG. This used to be six Stormcrown Fragments, and a
       Fragment sells for 98,000 Cogs off a spoil that drops in half a second:
       770M Cogs/hr on the sell button, which R5 then forces this recipe to
       beat. It sustained 1.92 BILLION. A Stormstone is now two Riftstones and
       three Warden's Tears fused on the wheel — Delving material, priced in
       the non-combat band — and it sustains 25M.                                                                                                                                                            1.45x */
    { id: "craft-gem-storm",       name: "Cut Stormstone",      category: "stonework", level: 88, xp: 500, interval: 4,   consumes: [["gem-rift", 2], ["wardens-tear", 3], ["verdigris", 6]],                  produces: "gem-storm" },
    /*                                                                                                                                                                                                       1.38x */
    { id: "craft-rift-helm",       name: "Rifthide Hood",       category: "leather",   level: 92, xp: 610, interval: 4.5, consumes: [["rifthide", 5], ["sinew-cord", 2]],                                      produces: "rift-helm" },
    /* The other re-pointed rung, and the thinnest margin in the skill. It
       used to sustain 3.33 BILLION Cogs/hr — more than the endgame combat
       faucet divided by ten — purely because it was a 2.4x markup on top of
       a 2.7x markup on top of the richest spoil in the game.                                                                                                                                                1.30x */
    { id: "craft-amulet-ninefold", name: "Ninefold Torc",       category: "jewellery", level: 96, xp: 780, interval: 5,   consumes: [["ninefold-ingot", 1], ["gem-storm", 2], ["warden-alloy", 2], ["wardens-tear", 6]], produces: "amulet-ninefold" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Steady Awl",   text: "+5% Crafting mastery XP",              mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Close Cut",    text: "+8% chance to preserve hide and stone", mods: [["preserveChance", 0.08, "skill"]] },
    { pct: 0.50, name: "Guild Stamp",  text: "+50% Cogs from crafted gear sales",     mods: [["saleValue", 0.5, "skill"]] },
    /* The wing's ONE global quantity multiplier, and it is sized rather than
       chosen: see bowcraft.js's 95% note. +4% is what lands the endgame
       Enchanting loop inside both of the bands the selftest measures it
       against; +6% pushed it 30% through the ceiling. */
    { pct: 0.95, name: "Craftwise",    text: "+4% chance to double items in EVERY skill",
      mods: [["doubleChance", 0.04, "global"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+3% preserve on this recipe",       mods: [["preserveChance", 0.03, "recipe"]] },
    { level: 20, text: "-5% interval on this recipe",       mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+7% preserve on this recipe",       mods: [["preserveChance", 0.07, "recipe"]] },
    { level: 65, text: "+5% chance to double this piece",   mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-9% interval on this recipe",       mods: [["intervalPercent", -0.09, "recipe"]] },
    { level: 95, text: "+12% preserve on this recipe",      mods: [["preserveChance", 0.12, "recipe"]] },
    { level: 99, text: "+25% sale value for this piece",    mods: [["saleValue", 0.25, "recipe"]] },
  ],
};

export default CRAFTING;
