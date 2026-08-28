/* =========================================================================
   EMBERVEIL — SKILL: TRAWLING

   One skill, one file. Edit this file to change TRAWLING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const TRAWLING = {
  id: "trawling",
  name: "Fishing",
  kind: "gather",
  blurb: "Weighted nets in the drowned reaches, where the water has opinions.",
  mastery: true,
  masteryActionTime: "actual",
  /* The interesting one: a range rolled uniformly every single cast, with
     reduction scaling BOTH endpoints. Costs nothing, and it is the difference
     between a skill that feels alive and a metronome. */
  intervalMode: "range",
  recipes: [
    { id: "cast-silverfin",  name: "Minnow Shoal",   level: 1,  xp: 20,  range: [4, 8],   produces: "silverfin",  junk: 0.20 },
    { id: "cast-bogskate",   name: "Trout Stream",    level: 20, xp: 35,  range: [4, 10],  produces: "bogskate",   junk: 0.14 },
    { id: "cast-glimmereel", name: "Eel Marsh",    level: 40, xp: 48,  range: [4, 11],  produces: "glimmereel", junk: 0.09 },
    { id: "cast-ashray",     name: "Bass Shallows",   level: 50, xp: 62,  range: [5, 12],  produces: "ashray",     junk: 0.05 },
    { id: "cast-voidmaw",    name: "Tuna Deep",    level: 70, xp: 95,  range: [7, 15],  produces: "voidmaw",    junk: 0 },
    // Inversion — the long cast. Worst XP/s above level 50, best Cogs/s bar none.
    { id: "cast-tidewyrm",   name: "Swordfish Run",     level: 80, xp: 130, range: [12, 30], produces: "tidewyrm",   junk: 0 },
    { id: "cast-stormgar",   name: "Shark Race",     level: 88, xp: 168, range: [9, 20],  produces: "stormgar",   junk: 0 },
    { id: "cast-aetherray",  name: "Aetherray Drift",   level: 95, xp: 245, range: [10, 25], produces: "aetherray",  junk: 0 },
  ],
  checkpoints: [
    { pct: 0.10, name: "Reading Water",  text: "+5% Fishing mastery XP",       mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Clean Net",      text: "No more tangleweed",            mods: [["noJunk", 1, "skill"]] },
    { pct: 0.50, name: "Full Haul",      text: "+5% chance to double the catch", mods: [["doubleChance", 0.05, "skill"]] },
    { pct: 0.95, name: "Deepcalled",     text: "+25% chance of an extra rare roll", mods: [["rareChance", 0.25, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "-25% tangleweed on this cast",     mods: [["junkPercent", -0.25, "recipe"]] },
    { level: 20, text: "-4% interval on this cast",        mods: [["intervalPercent", -0.04, "recipe"]] },
    { level: 50, text: "-50% tangleweed on this cast",     mods: [["junkPercent", -0.5, "recipe"]] },
    { level: 65, text: "+5% chance to double this catch",  mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this cast",        mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+25% sale value for this catch",   mods: [["saleValue", 0.25, "recipe"]] },
    { level: 99, text: "+1 guaranteed extra catch",        mods: [["flatQuantity", 1, "recipe"]] },
  ],
};

export default TRAWLING;
