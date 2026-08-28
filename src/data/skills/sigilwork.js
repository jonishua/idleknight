/* =========================================================================
   EMBERVEIL — SKILL: SIGILWORK

   One skill, one file. Edit this file to change SIGILWORK and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const SIGILWORK = {
  id: "sigilwork",
  name: "Enchanting",
  kind: "artisan",
  blurb: "Aether bound into a shape that will hold it. The late fortune of any adept.",
  mastery: true,
  masteryActionTime: { fixed: 1.7 },
  intervalMode: "perRecipe",
  recipes: [
    { id: "sig-spark",   name: "Spark Sigil",    level: 1,  xp: 12,  interval: 3,   shards: 2,  consumes: [["shalebrick", 1]],       produces: "sigil-spark" },
    { id: "sig-ward",    name: "Ward Sigil",  level: 20, xp: 34,  interval: 3,   shards: 4,  consumes: [["palegrit-billet", 2]],  produces: "sigil-ward" },
    { id: "sig-ember",   name: "Ember Sigil",    level: 35, xp: 70,  interval: 3.5, shards: 7,  consumes: [["marrow-billet", 2]],    produces: "sigil-ember" },
    { id: "sig-tide",    name: "Tide Sigil",     level: 50, xp: 130, interval: 4,   shards: 11, consumes: [["slagbloom-billet", 2]], produces: "sigil-tide" },
    { id: "sig-void",    name: "Void Sigil",     level: 65, xp: 220, interval: 4,   shards: 16, consumes: [["emberquartz-core", 2]], produces: "sigil-void" },
    { id: "sig-storm",   name: "Storm Sigil",    level: 78, xp: 360, interval: 4.5, shards: 22, consumes: [["voidglass-lens", 2]],   produces: "sigil-storm" },
    { id: "sig-rift",    name: "Rift Sigil",     level: 90, xp: 560, interval: 5,   shards: 30, consumes: [["sunmetal-plate", 2]],   produces: "sigil-rift" },
    { id: "sig-ninefold",name: "Ninefold Sigil", level: 99, xp: 900, interval: 5,   shards: 40, consumes: [["aetherite-core", 2]],   produces: "sigil-ninefold" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Steady Line",   text: "+5% Enchanting mastery XP",        mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Held Charge",   text: "+8% chance to preserve Aether Shards", mods: [["preserveChance", 0.08, "skill"]] },
    { pct: 0.50, name: "Sigil Charter", text: "+50% Cogs from sigil sales",       mods: [["saleValue", 0.5, "skill"]] },
    { pct: 0.95, name: "Sigilwise",     text: "+5% chance to double items in EVERY skill", mods: [["doubleChance", 0.05, "global"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+4% shard preserve on this sigil", mods: [["preserveChance", 0.04, "recipe"]] },
    { level: 20, text: "-5% interval on this sigil",       mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+8% shard preserve on this sigil", mods: [["preserveChance", 0.08, "recipe"]] },
    { level: 65, text: "+5% chance to double this sigil",  mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this sigil",       mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+12% shard preserve on this sigil",mods: [["preserveChance", 0.12, "recipe"]] },
    { level: 99, text: "+30% sale value for this sigil",   mods: [["saleValue", 0.30, "recipe"]] },
  ],
};

export default SIGILWORK;
