/* =========================================================================
   EMBERVEIL — SKILL: SETTLEMENT   (passive)

   One skill, one file. Edit this file to change SETTLEMENT and nothing else;
   register it in ./index.js.

   NO RECIPES AND NO MASTERY, on purpose. Settlement has no actions to master:
   it has twelve buildings, one worship choice and a five-minute clock. A
   per-recipe mastery track would be a second progression bar measuring the
   same thing the town's own population already measures — the exact reason
   Warding and Vitality carry no mastery either.

   That also keeps it out of `db.masterySkills`, so it costs no pool cap, no
   checkpoint ladder and no mastery unlocks. Its whole content table is
   ../settlement.js and its whole loop is
   ../../js/engine/systems/settlement.js.
   ========================================================================= */

const SETTLEMENT = {
  id: "settlement",
  name: "Settlement",
  kind: "settlement",
  /* Filed under PASSIVE in the menu; the kind names its own screen. */
  passive: true,
  mastery: false,
  blurb: "A town on its own clock. It grows, eats and builds while you are elsewhere.",
  /* One town tick every five real minutes; see ../settlement.js. */
};

export default SETTLEMENT;
