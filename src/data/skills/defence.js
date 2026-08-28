/* =========================================================================
   EMBERVEIL — SKILL: Defence

   One skill, one file. Edit this file to change Defence and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules.

   Defence IS A LEVEL, NOT A PAGE. The parity doc's single most important
   finding (§1) is that the eight combat skills are not separate screens:
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   all route to the one Combat screen and exist there as levels and stat
   contributions. `screen: "combat"` is how this file says so, and the skills
   list reads it rather than guessing from `kind`.
   ========================================================================= */

const DEFENCE = {
  id: "defence",
  name: "Defence",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "How often it misses you. Trained by the Block style, and the level armour asks for.",
  /* +1% evasion per level, and the gate on every piece of body armour in
     ../equipment.js. A player who never blocks can still buy relics but
     cannot wear the plate that would have kept them alive — which is the
     trade the three melee styles exist to make interesting. */
  combatRole: "evasion",
  evasionPerLevel: 0.01,
  style: "block",
};

export default DEFENCE;
