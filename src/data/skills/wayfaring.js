/* =========================================================================
   EMBERVEIL — SKILL: WAYFARING

   One skill, one file. Edit this file to change WAYFARING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const WAYFARING = {
  id: "wayfaring",
  name: "Exploration",
  kind: "route",
  blurb: "Walking the emberveil roads and keeping the waystations lit.",
  mastery: true,
  masteryActionTime: "actual",
  intervalMode: "perRecipe",
  /* Wayfaring pays Cogs directly rather than items, which makes it the only
     faucet in the game that cannot be improved by a sale-value modifier — and
     the only place where the signed waystation modifiers in shop.js are
     applied, turning a stat screen into a recurring economic drain. */
  recipes: [
    { id: "route-cinder",   name: "The Cinder Track",     level: 1,  xp: 20,  interval: 6,  cogs: 4 },
    { id: "route-causeway", name: "The Stone Causeway",    level: 15, xp: 45,  interval: 10, cogs: 26 },
    { id: "route-span",     name: "The Sunken Span",      level: 30, xp: 78,  interval: 14, cogs: 130 },
    { id: "route-climb",    name: "Emberwatch Climb",     level: 45, xp: 130, interval: 20, cogs: 600 },
    { id: "route-ferry",    name: "Willowmere Ferry",    level: 58, xp: 200, interval: 26, cogs: 2200 },
    { id: "route-duskrun",  name: "The Duskheart Run",    level: 70, xp: 300, interval: 32, cogs: 7000 },
    { id: "route-ascent",   name: "Stormcrown Ascent",    level: 82, xp: 440, interval: 38, cogs: 14000 },
    { id: "route-circuit",  name: "The Ninefold Circuit", level: 92, xp: 590, interval: 42, cogs: 28000 },
  ],
  checkpoints: [
    { pct: 0.10, name: "Sure Footing",  text: "+5% Exploration mastery XP",       mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Toll Charter",  text: "+10% Cogs from Exploration",        mods: [["currency", 0.10, "skill"]] },
    { pct: 0.50, name: "Quarried Stone",text: "-10% waystation build cost",       mods: [["costReduction", 0.10, "skill"]] },
    { pct: 0.95, name: "Roadwarden",    text: "-15% waystation material cost",    mods: [["costReduction", 0.15, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+1% Cogs per mastery level on this route" },
    { level: 20, text: "-4% interval on this route",   mods: [["intervalPercent", -0.04, "recipe"]] },
    { level: 50, text: "-0.5s interval on this route", mods: [["intervalFlat", 0.5, "recipe"]] },
    { level: 65, text: "-6% interval on this route",   mods: [["intervalPercent", -0.06, "recipe"]] },
    { level: 85, text: "+15% Cogs from this route",    mods: [["currency", 0.15, "recipe"]] },
    { level: 95, text: "-8% interval on this route",   mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 99, text: "+25% Cogs from this route",    mods: [["currency", 0.25, "recipe"]] },
  ],
  /** +1% Cogs per mastery level on that leg, as the level-10 unlock promises. */
  currencyPerMastery: 0.01,
};

export default WAYFARING;
