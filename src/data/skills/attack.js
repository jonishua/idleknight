/* =========================================================================
   EMBERVEIL — SKILL: Attack

   One skill, one file. Edit this file to change Attack and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules.

   Attack IS A LEVEL, NOT A PAGE. The parity doc's single most important
   finding (§1) is that the eight combat skills are not separate screens:
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   all route to the one Combat screen and exist there as levels and stat
   contributions. `screen: "combat"` is how this file says so, and the skills
   list reads it rather than guessing from `kind`.
   ========================================================================= */

const ATTACK = {
  id: "attack",
  name: "Attack",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "How often you connect. Trained by the Stab style, and the level every relic asks for.",
  /* Attack is the accuracy skill: each level is +1% to the accuracy rating
     the relic ladder supplies, which is what keeps hit chance climbing while
     the monsters' evasion climbs with them. It is also the level the whole
     relic ladder and every trinket gates on, so it is the combat skill a
     player cannot skip.  */
  combatRole: "accuracy",
  accuracyPerLevel: 0.01,
  style: "stab",
};

export default ATTACK;
