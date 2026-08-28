/* =========================================================================
   EMBERVEIL — SKILL: EMBERRITE

   One skill, one file. Edit this file to change EMBERRITE and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const EMBERRITE = {
  id: "emberrite",
  name: "Firemaking",
  kind: "artisan",
  blurb: "The rite that burns heartwood down to a light the kilns will accept.",
  mastery: true,
  /* Artisan mastery time is a fixed constant, not the real duration, so
     interval reduction DOES multiply mastery per second here — the opposite
     of what it does for a gatherer. Emberrite's constant is 60% of the burn. */
  masteryActionTime: { ofBase: 0.6 },
  intervalMode: "perRecipe",
  recipes: [
    { id: "burn-palebirch",   name: "Burn Birch",   level: 1,  xp: 9,   interval: 2.5, consumes: [["palebirch", 1]],   produces: "ember-cinder" },
    { id: "burn-ashen-elm",   name: "Burn Elm",   level: 10, xp: 18,  interval: 4,   consumes: [["ashen-elm", 1]],   produces: "ember-cinder" },
    { id: "burn-veilcedar",   name: "Burn Cedar",   level: 25, xp: 32,  interval: 6,   consumes: [["veilcedar", 1]],   produces: "ember-cinder" },
    { id: "burn-emberoak",    name: "Burn Oak",    level: 35, xp: 50,  interval: 8,   consumes: [["emberoak", 1]],    produces: "ember-bright" },
    { id: "burn-stormpine",   name: "Burn Pine",   level: 45, xp: 78,  interval: 11,  consumes: [["stormpine", 1]],   produces: "ember-bright" },
    { id: "burn-glasswillow", name: "Burn Willow", level: 55, xp: 112, interval: 14,  consumes: [["glasswillow", 1]], produces: "ember-bright" },
    { id: "burn-duskheart",   name: "Burn Duskheart",   level: 65, xp: 168, interval: 18,  consumes: [["duskheart", 1]],   produces: "ember-void" },
    { id: "burn-sunwood",     name: "Burn Sunwood",     level: 75, xp: 250, interval: 22,  consumes: [["sunwood", 1]],     produces: "ember-void" },
    { id: "burn-aetherwood",  name: "Burn Aetherwood",  level: 90, xp: 420, interval: 27,  consumes: [["aetherwood", 1]],  produces: "ember-void" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Caught Light",  text: "+5% Firemaking mastery XP",   mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Draught Vents", text: "-10% Firemaking interval",     mods: [["intervalPercent", -0.10, "skill"]] },
    /* The elegant one. A skill whose entire job is to DESTROY value becomes a
       faucet at 50%: burning a bough refunds a quarter of its price in Cogs.
       Worth stealing wholesale. */
    { pct: 0.50, name: "Ashright",      text: "Burning pays back 25% of the log's price in Cogs", mods: [["ashright", 0.25, "skill"]] },
    { pct: 0.95, name: "Emberwise",     text: "+5% mastery XP in EVERY skill", mods: [["masteryXP", 0.05, "global"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "-4% interval on this burn",      mods: [["intervalPercent", -0.04, "recipe"]] },
    { level: 20, text: "+5% Firemaking mastery XP",       mods: [["masteryXP", 0.05, "recipe"]] },
    { level: 50, text: "-8% interval on this burn",      mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 65, text: "+5% chance to double the ember", mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-10% interval on this burn",     mods: [["intervalPercent", -0.10, "recipe"]] },
    { level: 95, text: "+8% chance to double the ember", mods: [["doubleChance", 0.08, "recipe"]] },
    { level: 99, text: "+1 ember per burn",              mods: [["flatQuantity", 1, "recipe"]] },
  ],
};

export default EMBERRITE;
