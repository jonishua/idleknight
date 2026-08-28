/* =========================================================================
   EMBERVEIL — SKILL: BOWCRAFT   (parity §3b, §5 "Fletching -> Bowcraft")

   One skill, one file. Edit this file to change BOWCRAFT and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   ---------------------------------------------------------------------------
   TWO LINES, ONE LADDER
   ---------------------------------------------------------------------------
   The reference's Fletching runs two parallel chains out of the same logs and
   interleaves their level gates so the player is always mid-way through one
   of them. Ours does the same:

     ARROWS   bough -> shaft bundle -> arrows (shaft + a Smithing billet).
              The output is real equipment: arrows fill the ammo slot.
     BOWS     bough + Sinew Cord -> bow. The Sinew Cord comes from Crafting,
              which is the interlock between the two new artisan skills — you
              cannot string a bow without having tanned something first.

   Interleaving them is the point. Every second unlock is in the other line,
   so a player climbing Bowcraft is pulled through Woodcutting, Smithing AND
   Crafting rather than through one supplier.

   ---------------------------------------------------------------------------
   MASTERY ACTION TIME
   ---------------------------------------------------------------------------
   §2.1 gives every artisan skill a FIXED mastery action time, which is what
   makes interval reduction multiply mastery per second here (the opposite of
   what it does for a gatherer). The reference's constant for this skill is
   1.3 s and that is what is shipped.

   ---------------------------------------------------------------------------
   THE MARKUP SHAPE, AND WHY EVERY RUNG TAKES MORE WOOD THAN THE ONE BELOW IT
   ---------------------------------------------------------------------------
   R4 in ../items/core.js: markups COMPOUND, so a value chain has to open fat
   and close thin. This one runs 4.00x on Birch Shafts to 1.28x on the
   Aetherwood Warbow, monotone by level, and each of the two interleaved lines
   is monotone on its own too.

   That is only possible if the BASKET grows as fast as the margin shrinks. A
   Cedar Longbow at 1.93x has to be worth more than an Elm Shortbow at 2.16x,
   so it takes six staves and three cords where the Elm takes four and two.
   Every rung here does the same thing, and it is also why the arrow line
   stopped taking one shaft: at one shaft plus one billet the recipe's own
   time dominated the gather time and R5 demanded a 1.6x floor it could not
   have while still decaying.

   ---------------------------------------------------------------------------
   THE XP SHAPE
   ---------------------------------------------------------------------------
   6 XP at 2.0 s on the first rung is 3.0 XP/s, which is deliberately the same
   opening rate §1.4 quotes for the game's first gathering action — the wing
   is not a shortcut. The top rung pays 620 XP at 4.0 s, so the worst-to-best
   spread inside the skill is about 50x on raw XP/s and the real limit is
   input supply, not the bench.
   ========================================================================= */

const BOWCRAFT = {
  id: "bowcraft",
  name: "Bowcraft",
  kind: "artisan",
  blurb: "Stave, cord and a straight shaft. Everything that kills at a distance starts here.",
  mastery: true,
  masteryActionTime: { fixed: 1.3 },
  intervalMode: "perRecipe",
  /* §3b's "Select <Skill> Category" control. Order is the order it lists. */
  categories: [
    { id: "arrows", name: "Shafts & Arrows", blurb: "Bundles off the bough, tipped with a billet. The ammo slot." },
    { id: "bows",   name: "Bows",            blurb: "Bough plus Sinew Cord. The value ladder of the skill." },
  ],
  /* markup = value(produces) / sum(value(consumes)), printed at the end of
     each row. MONOTONE NON-INCREASING by level, 4.00x -> 1.28x, and the two
     interleaved lines are each monotone on their own as well.
     tools/check-artisan.mjs asserts both. */
  recipes: [
    { id: "bow-shafts-birch",     name: "Birch Shafts",       category: "arrows", level: 1,  xp: 6,   interval: 2,   consumes: [["palebirch", 4]],                                              produces: "shafts-birch" },   // 4.00x
    { id: "bow-shortbow-birch",   name: "Birch Shortbow",     category: "bows",   level: 5,  xp: 15,  interval: 2.5, consumes: [["palebirch", 2], ["sinew-cord", 1]],                            produces: "bow-birch" },      // 2.35x
    { id: "bow-arrow-copper",     name: "Copper Arrows",      category: "arrows", level: 12, xp: 22,  interval: 2,   consumes: [["shafts-birch", 2], ["shalebrick", 1]],                         produces: "arrow-copper" },   // 2.30x
    { id: "bow-shortbow-elm",     name: "Elm Shortbow",       category: "bows",   level: 20, xp: 36,  interval: 2.5, consumes: [["ashen-elm", 4], ["sinew-cord", 2]],                            produces: "bow-elm" },        // 2.16x
    { id: "bow-shafts-cedar",     name: "Cedar Shafts",       category: "arrows", level: 25, xp: 44,  interval: 2.5, consumes: [["veilcedar", 5]],                                               produces: "shafts-cedar" },   // 2.04x
    { id: "bow-arrow-steel",      name: "Steel Arrows",       category: "arrows", level: 30, xp: 58,  interval: 2,   consumes: [["shafts-cedar", 2], ["marrow-billet", 1]],                      produces: "arrow-steel" },    // 1.95x
    { id: "bow-longbow-cedar",    name: "Cedar Longbow",      category: "bows",   level: 35, xp: 76,  interval: 3,   consumes: [["veilcedar", 6], ["sinew-cord", 3]],                            produces: "bow-cedar" },      // 1.93x
    { id: "bow-arrow-silver",     name: "Silver Arrows",      category: "arrows", level: 45, xp: 108, interval: 2,   consumes: [["shafts-cedar", 2], ["slagbloom-billet", 1]],                   produces: "arrow-silver" },   // 1.88x
    { id: "bow-longbow-oak",      name: "Oak Longbow",        category: "bows",   level: 52, xp: 140, interval: 3,   consumes: [["emberoak", 8], ["sinew-cord", 4]],                             produces: "bow-oak" },        // 1.82x
    { id: "bow-shafts-willow",    name: "Willow Shafts",      category: "arrows", level: 58, xp: 170, interval: 2.5, consumes: [["glasswillow", 5]],                                             produces: "shafts-willow" },  // 1.76x
    { id: "bow-longbow-willow",   name: "Willow Longbow",     category: "bows",   level: 65, xp: 215, interval: 3,   consumes: [["glasswillow", 8], ["sinew-cord", 4]],                          produces: "bow-willow" },     // 1.70x
    { id: "bow-arrow-voidglass",  name: "Voidglass Arrows",   category: "arrows", level: 72, xp: 265, interval: 2,   consumes: [["shafts-willow", 2], ["voidglass-lens", 1]],                    produces: "arrow-voidglass" },// 1.60x
    { id: "bow-warbow-duskheart", name: "Duskheart Warbow",   category: "bows",   level: 80, xp: 340, interval: 3.5, consumes: [["duskheart", 8], ["sinew-cord", 5]],                            produces: "bow-duskheart" },  // 1.55x
    { id: "bow-arrow-sunmetal",   name: "Sunmetal Arrows",    category: "arrows", level: 90, xp: 460, interval: 2,   consumes: [["shafts-willow", 4], ["sunmetal-plate", 1]],                    produces: "arrow-sunmetal" }, // 1.45x
    { id: "bow-warbow-aetherwood",name: "Aetherwood Warbow",  category: "bows",   level: 99, xp: 620, interval: 4,   consumes: [["aetherwood", 10], ["sinew-cord", 6], ["aetherite-core", 1]],   produces: "bow-aetherwood" }, // 1.28x
  ],
  checkpoints: [
    { pct: 0.10, name: "Straight Eye",  text: "+5% Bowcraft mastery XP",             mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Split Grain",   text: "+6% chance to preserve staves and cord", mods: [["preserveChance", 0.06, "skill"]] },
    { pct: 0.50, name: "Bowyer's Mark", text: "+50% Cogs from bow and arrow sales",  mods: [["saleValue", 0.5, "skill"]] },
    /* The prestige slot, and a signed one: §7.4 — the strongest sources carry
       a real drawback, so the loadout stays a decision.

       NOTE ON WHAT A GLOBAL 95% MAY GRANT — this is a measured constraint,
       not a style rule. A global `doubleChance`, `intervalPercent`,
       `currency`, `saleValue` or `flatQuantity` multiplies EVERY loop in the
       game the moment the pool fills, including loops it was never balanced
       against. This wing's first draft spent all three of its new global
       checkpoints that way (-8% and -5% interval, +6% double) and pushed the
       endgame Enchanting loop from 150M to 195M Cogs/hr — 30% through a
       ceiling the balance suite measures. So the wing ships exactly ONE
       global quantity multiplier, Crafting's +4%, sized against that
       measurement, and spends the other two on preservation and experience:
       real, prestigious, and incapable of inflating a Cogs-per-hour figure. */
    { pct: 0.95, name: "Bowyer's Hand", text: "+8% chance to preserve resources in EVERY skill; -6% Bowcraft skill XP",
      mods: [["preserveChance", 0.08, "global"], ["skillXP", -0.06, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+4% preserve on this recipe",       mods: [["preserveChance", 0.04, "recipe"]] },
    { level: 20, text: "-5% interval on this recipe",       mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+8% preserve on this recipe",       mods: [["preserveChance", 0.08, "recipe"]] },
    { level: 65, text: "+5% chance to double this output",  mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this recipe",       mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+12% preserve on this recipe",      mods: [["preserveChance", 0.12, "recipe"]] },
    { level: 99, text: "+8% chance to double this output",  mods: [["doubleChance", 0.08, "recipe"]] },
  ],
};

export default BOWCRAFT;
