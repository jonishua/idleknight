/* =========================================================================
   EMBERVEIL — SKILL: BOUGHCRAFT

   One skill, one file. Edit this file to change BOUGHCRAFT and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const BOUGHCRAFT = {
  id: "boughcraft",
  name: "Woodcutting",
  kind: "gather",
  blurb: "Taking heartwood from the veilwoods without waking what nests in them.",
  mastery: true,
  masteryActionTime: "actual",
  intervalMode: "perRecipe",
  recipes: [
    { id: "bough-palebirch",   name: "Birch",   level: 1,  xp: 10,  interval: 3,  produces: "palebirch" },
    { id: "bough-ashen-elm",   name: "Elm",   level: 10, xp: 15,  interval: 4,  produces: "ashen-elm" },
    { id: "bough-veilcedar",   name: "Cedar",   level: 25, xp: 22,  interval: 5,  produces: "veilcedar" },
    { id: "bough-emberoak",    name: "Oak",    level: 35, xp: 30,  interval: 6,  produces: "emberoak" },
    { id: "bough-stormpine",   name: "Pine",   level: 45, xp: 40,  interval: 8,  produces: "stormpine" },
    { id: "bough-glasswillow", name: "Willow", level: 55, xp: 60,  interval: 10, produces: "glasswillow" },
    { id: "bough-duskheart",   name: "Duskheart",   level: 65, xp: 80,  interval: 12, produces: "duskheart" },
    // Inversion A — the wealth rung: 20 s a swing, 400 Cogs a bough, 5 XP/s.
    { id: "bough-sunwood",     name: "Sunwood",     level: 75, xp: 100, interval: 20, produces: "sunwood" },
    // Inversion B — the mirror: the best XP in the skill for pocket change.
    { id: "bough-aetherwood",  name: "Aetherwood",  level: 90, xp: 180, interval: 15, produces: "aetherwood" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Steady Hand",   text: "+5% Woodcutting mastery XP",    mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Clean Fell",    text: "+5% chance to double logs",  mods: [["doubleChance", 0.05, "skill"]] },
    { pct: 0.50, name: "Timber Charter",text: "+50% Cogs from log sales",   mods: [["saleValue", 0.5, "skill"]] },
    { pct: 0.95, name: "Grovewise",     text: "+1 log per action",          mods: [["flatQuantity", 1, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "-3% interval on this log",       mods: [["intervalPercent", -0.03, "recipe"]] },
    { level: 20, text: "+3% chance to double this log",  mods: [["doubleChance", 0.03, "recipe"]] },
    { level: 50, text: "-5% interval on this log",       mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 65, text: "+5% chance to double this log",  mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "+20% sale value for this log",   mods: [["saleValue", 0.2, "recipe"]] },
    { level: 95, text: "-7% interval on this log",       mods: [["intervalPercent", -0.07, "recipe"]] },
    { level: 99, text: "+1 log per action",              mods: [["flatQuantity", 1, "recipe"]] },
  ],
};

export default BOUGHCRAFT;
