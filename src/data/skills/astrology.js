/* =========================================================================
   EMBERVEIL — SKILL: ASTROLOGY   (parity §3e)

   One skill, one file. Edit this file to change ASTROLOGY and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   Eight constellations, two actions each — Study and Explore — on the flat
   3.00 s interval the reference quotes. Sixteen actions, so the mastery pool
   caps at 8,000,000 by the 500,000-a-recipe rule.

   TIME TO CAP. Study climbs 9 XP -> 36 XP across the eight constellations,
   which at 3.00 s is 3.0 XP/s at the first rung and 12.0 XP/s at the last:
   the house 4x spread, and 302 hours from 1 to 99 at the top rung's unlock
   rate. Explore pays roughly 40% of that, and pays it in Prism Motes instead
   — the constellation upgrades are the reason to run it, not the Cogs.
   ========================================================================= */

import { CONSTELLATIONS, studyId, exploreId } from "../constellations.js";
import "../items/index.js"; // Star and Prism Motes must exist before validate()

/* XP per Study, one entry per constellation. Explore is 40% of it. */
const STUDY_XP = [9, 12, 15, 19, 23, 27, 31, 36];
/* Explore opens four levels after its constellation's Study does. */
const EXPLORE_OFFSET = 4;

const recipes = [];
CONSTELLATIONS.forEach((c, i) => {
  recipes.push({
    id: studyId(c), name: `Study ${c.name}`, level: c.level,
    xp: STUDY_XP[i], produces: "star-mote",
  });
  recipes.push({
    id: exploreId(c), name: `Explore ${c.name}`, level: c.level + EXPLORE_OFFSET,
    xp: Math.round(STUDY_XP[i] * 0.4), produces: "prism-mote",
  });
});
recipes.sort((a, b) => a.level - b.level);

const ASTROLOGY = {
  id: "astrology",
  name: "Astrology",
  /* Its own `kind`: the skill-view registry keys on this field, and the
     constellation page shares nothing with the flat action list. */
  kind: "astrology",
  blurb: "Reading the sky for percentages. The largest block of chosen modifiers in the game.",
  mastery: true,
  /* A gatherer, per melvor-math §2.1 — mastery uses the actual seconds. */
  masteryActionTime: "actual",
  intervalMode: "flat",
  baseInterval: 3.0,
  recipes,

  checkpoints: [
    { pct: 0.10, name: "Clear Night",  text: "+5% Astrology mastery XP",        mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Long Look",    text: "+5% chance to double motes",      mods: [["doubleChance", 0.05, "skill"]] },
    { pct: 0.50, name: "Mote Charter", text: "+50% Cogs from mote sales",       mods: [["saleValue", 0.5, "skill"]] },
    /* The prestige slot. `constellationPower` is read by the Astrology system
       and by nothing else, so a fifth of every constellation percentage the
       player has ever bought turns on at once — a global bonus that is
       genuinely global in feel without leaking into another skill's maths. */
    { pct: 0.95, name: "Skywise",      text: "+20% to every constellation modifier", mods: [["constellationPower", 0.20, "global"]] },
  ],

  /* As in the other two skills of this wing: the percentage-interval rungs
     are gone because the bucket is full (tools/check-exotic.mjs --caps), the
     Star Glass ladder is not an interval ladder at all, and the one flat
     rung survives because flat seconds are bounded by the 0.25 s floor
     rather than by the -0.50 clamp. */
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+2% Astrology XP from this action", mods: [["skillXP", 0.02, "recipe"]] },
    { level: 20, text: "+3% chance to double this mote",    mods: [["doubleChance", 0.03, "recipe"]] },
    { level: 50, text: "+4% mastery XP on this action",     mods: [["masteryXP", 0.04, "recipe"]] },
    { level: 65, text: "+5% chance to double this mote",    mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-0.2s on this action",              mods: [["intervalFlat", 0.2, "recipe"]] },
    { level: 95, text: "+20% sale value for this mote",     mods: [["saleValue", 0.20, "recipe"]] },
    { level: 99, text: "+1 mote per action",                mods: [["flatQuantity", 1, "recipe"]] },
  ],
};

export default ASTROLOGY;
