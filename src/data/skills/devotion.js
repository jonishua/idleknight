/* =========================================================================
   EMBERVEIL — SKILL: DEVOTION   (the reference's Prayer, renamed per §5)

   One skill, one file. Edit this file to change Devotion and nothing else;
   register it in ./index.js.

   DEVOTION IS A LEVEL, NOT A PAGE (§1). It lives on the Combat screen, next
   to the HP bar, as a points counter and a pair of toggles.

   HOW IT WORKS
   ------------
   Monsters drop RELICS (../items/combat.js). Relics cannot be sold — value 0
   — so the only thing to do with one is speak over it at the Reliquary, which
   converts it into Devotion XP and PRAYER POINTS. Points are then spent, a
   few at a time, on every single swing you take: each active devotion costs
   its `cost` in points per player attack, and when the pool runs dry every
   devotion switches itself off mid-fight.

   That drain is the whole design. A combat bonus you pay for by the swing is
   a bonus you have to keep farming, so Devotion is the one combat skill whose
   benefit is a CONSUMABLE rather than a permanent unlock — the exact shape
   the reference gives Prayer, and the reason it never inflates the balance
   report the way a permanent +25% would.

   TWO AT A TIME. Melvor allows two prayers; so do we. Two slots turns ten
   devotions into forty-five real loadouts, and because every modifier here
   lands in the same additive buckets the relics and armour feed (§7.1), the
   choice is arithmetic the player can do on paper.

   THE COST CURVE. Points per attack climbs 1 -> 6 across the ladder while the
   benefit climbs about 5x, so the late devotions are strictly worse per point
   and strictly better per swing. A player with a deep relic stock burns the
   top of the ladder; a player without one runs Steady Hand for ever. That is
   the intended tension and it is why the cheap devotions are never retired.
   ========================================================================= */

const DEVOTION = {
  id: "devotion",
  name: "Devotion",
  kind: "combat",
  screen: "combat",
  mastery: false,
  blurb:
    "Prayer points, spoken over relics and spent a few at a time on every swing.",

  /** How many devotions can be lit at once. */
  slots: 2,

  /**
   * cost — prayer points drained per PLAYER ATTACK while lit.
   * mods — scoped "combat", so they sum with relics, armour and the Rites.
   */
  devotions: [
    { id: "dev-steady",   name: "Steady Hand",    level: 1,  cost: 1,
      text: "+5% accuracy",
      mods: [["accuracyPercent", 0.05, "combat"]] },
    { id: "dev-grip",     name: "Iron Grip",      level: 4,  cost: 1,
      text: "+5% max hit",
      mods: [["maxHitPercent", 0.05, "combat"]] },
    { id: "dev-warded",   name: "Warded Skin",    level: 10, cost: 1,
      text: "+6% evasion",
      mods: [["evasionPercent", 0.06, "combat"]] },
    { id: "dev-keen",     name: "Keen Eye",       level: 20, cost: 2,
      text: "+11% accuracy",
      mods: [["accuracyPercent", 0.11, "combat"]] },
    { id: "dev-burning",  name: "Burning Blood",  level: 25, cost: 2,
      text: "+11% max hit",
      mods: [["maxHitPercent", 0.11, "combat"]] },
    { id: "dev-stonehide",name: "Stonehide",      level: 31, cost: 2,
      text: "+12% evasion, +3% damage reduction",
      mods: [["evasionPercent", 0.12, "combat"], ["damageReduction", 0.03, "combat"]] },
    { id: "dev-fervour",  name: "Ember Fervour",  level: 43, cost: 3,
      text: "+15% accuracy, +8% max hit",
      mods: [["accuracyPercent", 0.15, "combat"], ["maxHitPercent", 0.08, "combat"]] },
    { id: "dev-veilguard",name: "Veilguard",      level: 55, cost: 3,
      text: "+20% evasion, +5% damage reduction",
      mods: [["evasionPercent", 0.20, "combat"], ["damageReduction", 0.05, "combat"]] },
    { id: "dev-zeal",     name: "Warden's Zeal",  level: 68, cost: 4,
      text: "+20% max hit, +12% accuracy",
      mods: [["maxHitPercent", 0.20, "combat"], ["accuracyPercent", 0.12, "combat"]] },
    { id: "dev-vow",      name: "The Ninefold Vow", level: 85, cost: 6,
      text: "+25% max hit, +25% accuracy, +10% evasion",
      mods: [
        ["maxHitPercent", 0.25, "combat"], ["accuracyPercent", 0.25, "combat"],
        ["evasionPercent", 0.10, "combat"],
      ] },
  ],
};

export const DEVOTION_BY_ID = new Map(DEVOTION.devotions.map((d) => [d.id, d]));

export default DEVOTION;
