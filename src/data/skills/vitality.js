/* =========================================================================
   EMBERVEIL — SKILL: VITALITY   (the reference's Hitpoints, renamed per §5)

   One skill, one file. Edit this file to change VITALITY and nothing else;
   register it in ./index.js.

   VITALITY IS A LEVEL, NOT A PAGE (§1). It is the fourth entry in the Combat
   block and it has no screen of its own; `screen: "combat"` says so.

   It has no recipes and no action. Its XP arrives at §7.5's flat rate of
   0.133 per point of damage DEALT — never dealt to you, which is what stops a
   player farming hit points by standing still — and its level is the size of
   the HP pool every fight and every failed Larceny lift draws from. The
   combat ladder therefore feeds its own survivability, and Larceny borrows
   that pool without contributing to it, which is precisely why Larceny wants
   food and Warding mostly does not.
   ========================================================================= */

const VITALITY = {
  id: "vitality",
  name: "Vitality",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb: "What is left of you after. Earns 0.133 XP per point of damage dealt.",
  combatRole: "hp",
};

export default VITALITY;
