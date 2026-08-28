/* =========================================================================
   EMBERVEIL — SKILL: Magic

   One skill, one file. Edit this file to change Magic and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules.

   Magic IS A LEVEL, NOT A PAGE. The parity doc's single most important
   finding (§1) is that the eight combat skills are not separate screens:
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   all route to the one Combat screen and exist there as levels and stat
   contributions. `screen: "combat"` is how this file says so, and the skills
   list reads it rather than guessing from `kind`.
   ========================================================================= */

const MAGIC = {
  id: "magic",
  name: "Magic",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "Making the veil do it for you. Trained by the Focus and Warded styles.",
  /* Magic leans on max hit and pays for it in accuracy, which is the
     mirror of Attack. Its two styles are the aggressive Focus and the
     defensive Warded, the second of which splits its XP with Defence. */
  combatRole: "both",
  accuracyPerLevel: 0.004,
  maxHitPerLevel: 0.007,
  style: "focus",
};

export default MAGIC;
