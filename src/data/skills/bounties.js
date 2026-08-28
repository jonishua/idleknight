/* =========================================================================
   EMBERVEIL — SKILL: BOUNTIES   (the reference's Slayer, renamed per §5)

   One skill, one file. Edit this file to change Bounties and nothing else;
   register it in ./index.js.

   BOUNTIES IS A LEVEL, NOT A PAGE (§1). It lives on the Combat screen, as a
   contract card and a Marks counter.

   HOW IT WORKS
   ------------
   Take a contract and the board names one monster and a number. Every kill of
   that monster pays Bounties XP and ticks the counter down; finishing it pays
   BOUNTY MARKS, which are the one currency in the game no other activity
   produces. Marks buy the Bounty Board shelf in ../shop/combat.js, and that
   shelf is the only reason to fight what you are told to instead of what is
   convenient. Remove the shelf and the skill is a chore; that is the whole
   lesson of the reference's Slayer.

   THE FIVE TIERS
   --------------
   A tier is a LEVEL BAND, not a monster list: the board rolls a monster whose
   level falls inside `band` from the whole bestiary, so adding a monster adds
   it to the rotation with no edit here. Bands OVERLAP by design — a level-45
   player can still be handed the easy contract they can clear in ten minutes,
   which keeps the low tiers alive as a deliberate choice rather than retiring
   them the moment the next unlocks.

   THE NUMBERS
   -----------
   `count` climbs 15 -> 35 while the monsters climb four orders of magnitude,
   so a contract is always about the same fraction of an hour. Marks pay
   `monster.level * count * marksPer`, which means a hard contract on a weak
   monster is worth less than an easy contract on a strong one — the reward
   tracks what you actually killed, not which drawer the task came out of.
   XP is a SHARE OF THE COMBAT XP THE KILL ITSELF PAID — combat XP is per
   point of damage, and a kill is exactly `monster.hp` points of it, so a
   contract kill pays `hp * STYLE_XP_PER_DAMAGE * xpShare` — plus the same
   again per kill as a completion bonus, so abandoning a contract at 90%
   costs you half its value. Nothing here names a monster's XP, because no
   monster has one.
   ========================================================================= */

const BOUNTIES = {
  id: "bounties",
  name: "Bounties",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb:
    "Contracts from the board. Kill what you are told and the Marks are the only currency that buys the board's own shelf.",

  /** Share of a monster's combat XP that a bounty kill pays into Bounties. */
  xpShare: 0.4,

  tiers: [
    { id: "bounty-novice",   name: "Novice Contract",   level: 1,  band: [1, 20],  count: 15, marksPer: 1.6 },
    { id: "bounty-standing", name: "Standing Contract", level: 25, band: [12, 47], count: 20, marksPer: 1.9 },
    { id: "bounty-hard",     name: "Hard Contract",     level: 50, band: [40, 74], count: 25, marksPer: 2.2 },
    { id: "bounty-warden",   name: "Warden Contract",   level: 75, band: [61, 91], count: 30, marksPer: 2.6 },
    { id: "bounty-ninefold", name: "Ninefold Contract", level: 90, band: [80, 99], count: 35, marksPer: 3.1 },
  ],
};

export const BOUNTY_TIER_BY_ID = new Map(BOUNTIES.tiers.map((t) => [t.id, t]));

export default BOUNTIES;
