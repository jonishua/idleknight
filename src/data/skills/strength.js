/* =========================================================================
   EMBERVEIL — SKILL: Strength

   One skill, one file. Edit this file to change Strength and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules.

   Strength IS A LEVEL, NOT A PAGE. The parity doc's single most important
   finding (§1) is that the eight combat skills are not separate screens:
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   all route to the one Combat screen and exist there as levels and stat
   contributions. `screen: "combat"` is how this file says so, and the skills
   list reads it rather than guessing from `kind`.
   ========================================================================= */

const STRENGTH = {
  id: "strength",
  name: "Strength",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "How hard you land. Trained by the Slash style.",
  /* +1% max hit per level, on the same additive bucket the relics, armour
     and Ascension Rites feed. Levels are worth exactly what a modifier of the
     same size is worth, which is the point of an additive pipeline (§7.1). */
  combatRole: "maxHit",
  maxHitPerLevel: 0.01,
  style: "slash",
};

export default STRENGTH;
