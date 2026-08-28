/* =========================================================================
   EMBERVEIL — SKILL: KILNWORK

   One skill, one file. Edit this file to change KILNWORK and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const KILNWORK = {
  id: "kilnwork",
  name: "Smithing",
  kind: "artisan",
  blurb: "Ore and ember into billets, and billets into everything that matters.",
  mastery: true,
  masteryActionTime: { fixed: 1.7 },
  intervalMode: "perRecipe",
  recipes: [
    { id: "kiln-shalebrick",   name: "Copper Bar",       level: 1,  xp: 8,   interval: 3,   consumes: [["cinder-shale", 2]],                                    produces: "shalebrick" },
    { id: "kiln-palegrit",     name: "Bronze Bar",  level: 15, xp: 17,  interval: 3,   consumes: [["palegrit", 3], ["ember-cinder", 1]],                    produces: "palegrit-billet" },
    { id: "kiln-marrow",       name: "Steel Bar",    level: 30, xp: 30,  interval: 3,   consumes: [["marrowstone", 2], ["verdigris", 1], ["ember-cinder", 1]], produces: "marrow-billet" },
    { id: "kiln-slagbloom",    name: "Silver Bar", level: 40, xp: 46,  interval: 3.5, consumes: [["slagbloom", 3], ["ember-bright", 1]],                   produces: "slagbloom-billet" },
    { id: "kiln-emberquartz",  name: "Gold Bar", level: 50, xp: 70,  interval: 4,   consumes: [["emberquartz", 2], ["ember-bright", 2]],                 produces: "emberquartz-core" },
    { id: "kiln-voidglass",    name: "Voidglass Lens",   level: 62, xp: 105, interval: 4,   consumes: [["voidglass", 3], ["emberquartz-core", 1]],               produces: "voidglass-lens" },
    { id: "kiln-sunmetal",     name: "Sunmetal Plate",   level: 75, xp: 155, interval: 4.5, consumes: [["sunmetal", 4], ["ember-void", 2]],                      produces: "sunmetal-plate" },
    { id: "kiln-warden-alloy", name: "Warden Alloy",     level: 85, xp: 240, interval: 5,   consumes: [["wardens-tear", 2], ["sunmetal-plate", 2]],              produces: "warden-alloy" },
    { id: "kiln-aetherite",    name: "Aetherite Core",   level: 92, xp: 330, interval: 5,   consumes: [["aetherite", 4], ["warden-alloy", 1]],                   produces: "aetherite-core" },
    { id: "kiln-ninefold",     name: "Ninefold Ingot",   level: 99, xp: 520, interval: 6,   consumes: [["aetherite-core", 2], ["warden-alloy", 1], ["ember-void", 3]], produces: "ninefold-ingot" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Kiln Sense",   text: "+5% Smithing mastery XP",        mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Ash Bed",      text: "+5% chance to preserve inputs",   mods: [["preserveChance", 0.05, "skill"]] },
    { pct: 0.50, name: "Double Pour",  text: "+5% chance to double the billet", mods: [["doubleChance", 0.05, "skill"]] },
    { pct: 0.95, name: "Kilnmaster",   text: "-0.3s Smithing interval",         mods: [["intervalFlat", 0.3, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+3% preserve on this recipe",     mods: [["preserveChance", 0.03, "recipe"]] },
    { level: 20, text: "-5% interval on this recipe",     mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+7% preserve on this recipe",     mods: [["preserveChance", 0.07, "recipe"]] },
    { level: 65, text: "+5% chance to double the billet", mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this recipe",     mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+10% preserve on this recipe",    mods: [["preserveChance", 0.10, "recipe"]] },
    { level: 99, text: "+8% chance to double the billet", mods: [["doubleChance", 0.08, "recipe"]] },
  ],
};

export default KILNWORK;
