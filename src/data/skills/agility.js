/* =========================================================================
   EMBERVEIL — SKILL: AGILITY   (parity §3g)

   One skill, one file. Edit this file to change AGILITY and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   Agility is a `route` skill: an obstacle pays Cogs straight out of the
   action rather than dropping an item, which is what lets the obstacles'
   own signed `+X% Cogs from Agility` / `-X% Cogs from Agility` passives
   mean something. The recipe list below IS the obstacle list — the course
   builder in ../obstacles.js decides which eight of them are standing at
   any moment, and the tick system in
   src/js/engine/systems/agility.js walks the course from slot to slot.

   The four pool checkpoints are the reference's own agility row (§2.3):
   more mastery XP, then money, then two cuts to the build cost — because in
   this skill the sink and the stat screen are the same screen.
   ========================================================================= */

import { OBSTACLES } from "../obstacles.js";

const AGILITY = {
  id: "agility",
  name: "Agility",
  kind: "route",
  blurb: "Eight obstacles, chosen and rebuilt. Every one of them changes the whole game.",
  mastery: true,
  /* A gatherer, per melvor-math §2.1: mastery uses the ACTUAL seconds the
     obstacle took, so speeding a course up buys Cogs, never mastery. */
  masteryActionTime: "actual",
  intervalMode: "perRecipe",

  /* Listed in level order, which is what ../index.js validates on. The slot
     an obstacle belongs to lives in ../obstacles.js, not here. */
  recipes: OBSTACLES
    .slice()
    .sort((a, b) => a.level - b.level || a.slot - b.slot)
    .map((o) => ({
      id: o.id,
      name: o.name,
      level: o.level,
      xp: o.xp,
      interval: o.interval,
      cogs: o.cogs,
    })),

  checkpoints: [
    { pct: 0.10, name: "Sure Step",     text: "+5% Agility mastery XP",            mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Course Charter",text: "+10% Cogs from Agility",            mods: [["currency", 0.10, "skill"]] },
    { pct: 0.50, name: "Quarried Kit",  text: "-10% obstacle build cost",          mods: [["costReduction", 0.10, "skill"]] },
    { pct: 0.95, name: "Coursewright",  text: "-15% obstacle material cost",       mods: [["costReduction", 0.15, "skill"]] },
  ],

  /* The three percentage-interval rungs this ladder used to carry are gone.
     The Course Kit in ../shop/exotic.js is the ONE interval source this wing
     ships, sized against tools/check-exotic.mjs --caps; a second one here
     would have pushed a mastered course past the -0.50 clamp and quietly
     stopped paying out. Flat seconds are a different bucket with a different
     limit (§4.1's 0.25 s floor) and survive, so mastery still makes an
     obstacle faster — it just does it in seconds instead of percent. */
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+2% Agility XP from this obstacle",      mods: [["skillXP", 0.02, "recipe"]] },
    { level: 20, text: "+5% Cogs from this obstacle",            mods: [["currency", 0.05, "recipe"]] },
    { level: 50, text: "+4% Agility mastery XP on this obstacle",mods: [["masteryXP", 0.04, "recipe"]] },
    { level: 65, text: "+12% Cogs from this obstacle",           mods: [["currency", 0.12, "recipe"]] },
    { level: 85, text: "-0.5s on this obstacle",                 mods: [["intervalFlat", 0.5, "recipe"]] },
    { level: 95, text: "+5% Agility XP from this obstacle",      mods: [["skillXP", 0.05, "recipe"]] },
    { level: 99, text: "+25% Cogs from this obstacle",           mods: [["currency", 0.25, "recipe"]] },
  ],
};

export default AGILITY;
