/* =========================================================================
   EMBERVEIL — SKILL: Ranged

   One skill, one file. Edit this file to change Ranged and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules.

   Ranged IS A LEVEL, NOT A PAGE. The parity doc's single most important
   finding (§1) is that the eight combat skills are not separate screens:
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   all route to the one Combat screen and exist there as levels and stat
   contributions. `screen: "combat"` is how this file says so, and the skills
   list reads it rather than guessing from `kind`.
   ========================================================================= */

const RANGED = {
  id: "ranged",
  name: "Ranged",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "Hitting it from where it cannot reach. Trained by the Accurate, Rapid and Longrange styles.",
  /* Ranged buys BOTH halves at half rate — accuracy and max hit together —
     which is what makes it the flat, safe option against the melee split. Its
     three styles trade the same total across accuracy, speed and evasion. */
  combatRole: "both",
  accuracyPerLevel: 0.005,
  maxHitPerLevel: 0.005,
  style: "accurate",
};

export default RANGED;
