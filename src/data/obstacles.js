/* =========================================================================
   EMBERVEIL — AGILITY OBSTACLES  (parity §3g)

   Agility is not a recipe list. It is a COURSE BUILDER: eight slots, each
   unlocked by skill level, each filled with one of three level-gated designs,
   and the course is run end to end, obstacle after obstacle, forever.

   THE POINT OF THE SKILL IS THE SIGNED MODIFIER (melvor-math §7.4). Every
   obstacle grants a GLOBAL passive that applies to the whole game while it
   stands — and every one of them carries a real drawback. Because the
   modifier pipeline is strictly additive (§7.1), choosing eight designs out
   of twenty-four is a genuine linear optimisation the player can do on paper.
   That is the single most interesting economy in the reference and it is the
   whole reason this skill exists.

   AND IT IS A SINK (§6.2). An obstacle costs Cogs AND crafted material, it
   must be REBUILT to change it, and the 50% / 95% pool checkpoints pay
   -10% / -15% of that cost back. A stat-choice screen turned into a
   recurring economic drain.

   ---------------------------------------------------------------------------
   WHY NOT ONE OBSTACLE ON THIS LIST TOUCHES `intervalPercent`
   ---------------------------------------------------------------------------
   A modifier is only worth printing on a screen if the player receives it,
   and `intervalPercent` is the one bucket in Emberveil where that is no
   longer true. Run tools/check-exotic.mjs --caps and read the first table: a
   MASTERED player already sums -0.60 of interval reduction on Mining before
   this file contributes anything (a -40% tool ladder, -20% from two
   waystations), and past the Ascension Rites it is -0.76. The clamp is
   -0.50. So "-6% interval in ALL skills" printed on an obstacle is a number
   that changes nothing: three such obstacles bolted onto a capped miner move
   its hourly XP by exactly zero while still charging the player the signed
   PENALTY in full, which turns §7.4's bargain into pure downside.

   The fix is not a smaller interval number, it is a different bucket. Every
   design below trades in `skillXP`, `masteryXP`, `doubleChance`, `currency`,
   `saleValue` or `preserveChance` — buckets that are uncapped, or (for
   preservation) verified to have room on EVERY skill in the game by the same
   report. Both halves of each bargain land in a live bucket, so the upside is
   received and the penalty genuinely bites. That is what makes the course a
   real optimisation rather than a decorated one.

   Agility's own speed ladder still exists; it is the Course Kit in
   ../shop/exotic.js, which is the single interval source this whole wing
   ships and is sized against the same report.

   THE NUMBERS AND WHY
   -------------------
   Intervals run 6 s -> 42 s, which is the reference's own agility band
   (§4.3). Every design pays XP at roughly 12 per second of its own length and
   Cogs at roughly 1,950 per second at the top rung, so the completed
   eight-obstacle endgame course is:

        166 s a lap · 1,992 XP a lap · 324,000 Cogs a lap
        = 12.0 XP/s  ->  302 hours from 1 to 99
        = 7.03M Cogs/hr, which sits between Exploration's top route and
          the sustained Enchanting loop — mid-game money, exactly where the
          reference puts base-game agility (1.1M - 6.3M GP/hr).

   The first rung is deliberately hour-one shaped instead: 6 s for 18 XP and
   5 Cogs is 3 XP/s and 3,000 Cogs/hr, the same opening band as Mining and
   Woodcutting, because an obstacle you have to save 500 Cogs to build should
   pay like a starting skill and not like a jackpot.

   THE SHAPE OF EACH SLOT. Every slot offers the same three archetypes so the
   choice reads the same way at every rung of the ladder:

        an INCOME design   (+Cogs, paid for in XP or mastery)
        a  YIELD design    (+double / +preserve / +sale, paid for in Cogs)
        an  XP design      (+skill or mastery XP, paid for in Cogs)
   ========================================================================= */

/**
 * Eight slots. `level` is the AGILITY level that opens the slot itself;
 * a design inside it carries its own, higher, requirement.
 */
export const SLOTS = [
  { index: 0, name: "Obstacle 1", level: 1 },
  { index: 1, name: "Obstacle 2", level: 10 },
  { index: 2, name: "Obstacle 3", level: 20 },
  { index: 3, name: "Obstacle 4", level: 35 },
  { index: 4, name: "Obstacle 5", level: 50 },
  { index: 5, name: "Obstacle 6", level: 65 },
  { index: 6, name: "Obstacle 7", level: 80 },
  { index: 7, name: "Obstacle 8", level: 90 },
];

/**
 * id        recipe id, also the obstacle id
 * slot      which of the eight slots it can be built into
 * level     Agility level required to build it
 * interval  seconds it takes to run
 * xp        Agility XP for clearing it
 * cogs      Cogs paid for clearing it (Agility is a `route` skill: it pays
 *           currency straight from the action, never items)
 * cost      Cogs to build, before the pool checkpoints' reductions
 * material  [itemId, qty] burnt on build, before the 95% checkpoint's cut
 * text      the passive, written the way the player reads it
 * mods      the passive, in the engine's own vocabulary. Scope "global"
 *           really is global — this is the only place in the game where a
 *           player-chosen passive reaches every other skill. Scope "skill"
 *           resolves to Agility itself.
 */
export const OBSTACLES = [
  /* --- Slot 1 ------------------------------------------------------ */
  {
    id: "obs-rope-ladder", name: "Rope Ladder", slot: 0, level: 1,
    interval: 6, xp: 18, cogs: 5, cost: 500, material: ["shalebrick", 25],
    text: "+2% skill XP in ALL skills; -4% Cogs from Agility",
    mods: [["skillXP", 0.02, "global"], ["currency", -0.04, "skill"]],
  },
  {
    id: "obs-cinder-steps", name: "Cinder Steps", slot: 0, level: 12,
    interval: 7, xp: 45, cogs: 400, cost: 5_000, material: ["shalebrick", 60],
    text: "+4% Cogs from Agility; -3% Agility skill XP",
    mods: [["currency", 0.04, "skill"], ["skillXP", -0.03, "skill"]],
  },
  {
    id: "obs-ash-vault", name: "Ash Vault", slot: 0, level: 26,
    interval: 8, xp: 96, cogs: 2_000, cost: 40_000, material: ["palegrit-billet", 120],
    text: "+3% chance to double items in ALL skills; -2% mastery XP in ALL skills",
    mods: [["doubleChance", 0.03, "global"], ["masteryXP", -0.02, "global"]],
  },

  /* --- Slot 2 ------------------------------------------------------ */
  {
    id: "obs-log-balance", name: "Log Balance", slot: 1, level: 10,
    interval: 8, xp: 40, cogs: 300, cost: 4_000, material: ["shalebrick", 50],
    text: "+3% Cogs from every action; -2% skill XP in ALL skills",
    mods: [["currency", 0.03, "global"], ["skillXP", -0.02, "global"]],
  },
  {
    id: "obs-rubble-scramble", name: "Rubble Scramble", slot: 1, level: 22,
    interval: 9, xp: 78, cogs: 1_400, cost: 30_000, material: ["palegrit-billet", 100],
    text: "+4% mastery XP in ALL skills; -6% Cogs from Agility",
    mods: [["masteryXP", 0.04, "global"], ["currency", -0.06, "skill"]],
  },
  {
    /* Was "-6% interval in ALL skills" and delivered nothing to a capped
       player. The same four points of Cogs are still the price. */
    id: "obs-wind-bridge", name: "Wind Bridge", slot: 1, level: 38,
    interval: 10, xp: 120, cogs: 6_000, cost: 180_000, material: ["marrow-billet", 200],
    text: "+4% chance to double items in ALL skills; -4% Cogs from every action",
    mods: [["doubleChance", 0.04, "global"], ["currency", -0.04, "global"]],
  },

  /* --- Slot 3 ------------------------------------------------------ */
  {
    id: "obs-cargo-net", name: "Cargo Net", slot: 2, level: 20,
    interval: 10, xp: 72, cogs: 1_000, cost: 25_000, material: ["palegrit-billet", 90],
    text: "+8% Cogs from Agility; -4% Agility skill XP",
    mods: [["currency", 0.08, "skill"], ["skillXP", -0.04, "skill"]],
  },
  {
    /* The wing's ONLY global preservation source. The cap report checks it
       against every skill in the game, including the artisan skills whose own
       mastery ladders already carry it into the fifties. */
    id: "obs-gap-leap", name: "Gap Leap", slot: 2, level: 33,
    interval: 11.5, xp: 112, cogs: 5_000, cost: 150_000, material: ["marrow-billet", 180],
    text: "+3% resource preservation; -3% mastery XP in ALL skills",
    mods: [["preserveChance", 0.03, "global"], ["masteryXP", -0.03, "global"]],
  },
  {
    id: "obs-chain-traverse", name: "Chain Traverse", slot: 2, level: 48,
    interval: 13, xp: 156, cogs: 12_000, cost: 600_000, material: ["slagbloom-billet", 300],
    text: "+3% skill XP in ALL skills; -10% Cogs from Agility",
    mods: [["skillXP", 0.03, "global"], ["currency", -0.10, "skill"]],
  },

  /* --- Slot 4 ------------------------------------------------------ */
  {
    id: "obs-slag-hurdles", name: "Slag Hurdles", slot: 3, level: 35,
    interval: 13, xp: 126, cogs: 4_500, cost: 200_000, material: ["marrow-billet", 200],
    text: "+5% chance to double items in ALL skills; -8% Cogs from Agility",
    mods: [["doubleChance", 0.05, "global"], ["currency", -0.08, "skill"]],
  },
  {
    id: "obs-pipe-crawl", name: "Pipe Crawl", slot: 3, level: 46,
    interval: 14.5, xp: 160, cogs: 11_000, cost: 700_000, material: ["slagbloom-billet", 300],
    text: "+4% skill XP in ALL skills; -10% Cogs from every action",
    mods: [["skillXP", 0.04, "global"], ["currency", -0.10, "global"]],
  },
  {
    id: "obs-molten-run", name: "Molten Run", slot: 3, level: 58,
    interval: 16, xp: 192, cogs: 24_000, cost: 2_500_000, material: ["emberquartz-core", 400],
    text: "+15% Cogs from Agility; -4% skill XP in ALL skills",
    mods: [["currency", 0.15, "skill"], ["skillXP", -0.04, "global"]],
  },

  /* --- Slot 5 ------------------------------------------------------ */
  {
    /* Was "-6% interval in ALL skills". Skill XP is the bucket a gatherer
       actually feels once its interval is clamped. */
    id: "obs-glass-beam", name: "Glass Beam", slot: 4, level: 50,
    interval: 16, xp: 168, cogs: 12_000, cost: 900_000, material: ["slagbloom-billet", 320],
    text: "+4% skill XP in ALL skills; -4% chance to double items in ALL skills",
    mods: [["skillXP", 0.04, "global"], ["doubleChance", -0.04, "global"]],
  },
  {
    id: "obs-spire-climb", name: "Spire Climb", slot: 4, level: 61,
    interval: 18, xp: 204, cogs: 26_000, cost: 3_000_000, material: ["emberquartz-core", 450],
    text: "+6% mastery XP in ALL skills; -6% Cogs from every action",
    mods: [["masteryXP", 0.06, "global"], ["currency", -0.06, "global"]],
  },
  {
    /* §7.3 keeps income from an ACTION and income from a SALE in separate
       buckets, and this is the one obstacle that pays into the second one. */
    id: "obs-shard-gauntlet", name: "Shard Gauntlet", slot: 4, level: 72,
    interval: 20, xp: 240, cogs: 40_000, cost: 9_000_000, material: ["voidglass-lens", 500],
    text: "+25% Cogs from every item sold; -12% Cogs from Agility",
    mods: [["saleValue", 0.25, "global"], ["currency", -0.12, "skill"]],
  },

  /* --- Slot 6 ------------------------------------------------------ */
  {
    id: "obs-storm-rigging", name: "Storm Rigging", slot: 5, level: 65,
    interval: 20, xp: 216, cogs: 26_000, cost: 6_000_000, material: ["emberquartz-core", 500],
    text: "+20% Cogs from Agility; -6% mastery XP in ALL skills",
    mods: [["currency", 0.20, "skill"], ["masteryXP", -0.06, "global"]],
  },
  {
    id: "obs-cliff-runner", name: "Cliff Runner", slot: 5, level: 75,
    interval: 22.5, xp: 264, cogs: 42_000, cost: 18_000_000, material: ["voidglass-lens", 700],
    text: "+5% chance to double items in ALL skills; -8% Agility skill XP",
    mods: [["doubleChance", 0.05, "global"], ["skillXP", -0.08, "skill"]],
  },
  {
    id: "obs-wind-tunnel", name: "Wind Tunnel", slot: 5, level: 84,
    interval: 25, xp: 300, cogs: 60_000, cost: 40_000_000, material: ["sunmetal-plate", 900],
    text: "+7% skill XP in ALL skills; -15% Cogs from every action",
    mods: [["skillXP", 0.07, "global"], ["currency", -0.15, "global"]],
  },

  /* --- Slot 7 ------------------------------------------------------ */
  {
    /* Was "-8% interval in ALL skills". Mastery XP is uncapped and it is the
       one number a capped player is still grinding. */
    id: "obs-rift-steps", name: "Rift Steps", slot: 6, level: 80,
    interval: 26, xp: 300, cogs: 46_000, cost: 30_000_000, material: ["sunmetal-plate", 800],
    text: "+6% mastery XP in ALL skills; -20% Cogs from Agility",
    mods: [["masteryXP", 0.06, "global"], ["currency", -0.20, "skill"]],
  },
  {
    id: "obs-void-ledge", name: "Void Ledge", slot: 6, level: 88,
    interval: 29, xp: 342, cogs: 62_000, cost: 55_000_000, material: ["warden-alloy", 1_200],
    text: "+6% chance to double items in ALL skills; -10% Agility skill XP",
    mods: [["doubleChance", 0.06, "global"], ["skillXP", -0.10, "skill"]],
  },
  {
    id: "obs-hollow-descent", name: "Hollow Descent", slot: 6, level: 94,
    interval: 32, xp: 384, cogs: 80_000, cost: 75_000_000, material: ["warden-alloy", 1_600],
    text: "+30% Cogs from Agility; -6% skill XP in ALL skills",
    mods: [["currency", 0.30, "skill"], ["skillXP", -0.06, "global"]],
  },

  /* --- Slot 8 ------------------------------------------------------ */
  {
    id: "obs-ninefold-stair", name: "Ninefold Stair", slot: 7, level: 90,
    interval: 34, xp: 396, cogs: 68_000, cost: 60_000_000, material: ["warden-alloy", 1_500],
    text: "+10% mastery XP in ALL skills; -10% chance to double items in ALL skills",
    mods: [["masteryXP", 0.10, "global"], ["doubleChance", -0.10, "global"]],
  },
  {
    /* The reference's own worked example of a signed obstacle, §7.4 line 1:
       four modifiers, two of them drawbacks, all four in live buckets. */
    id: "obs-wardens-gate", name: "Warden's Gate", slot: 7, level: 95,
    interval: 38, xp: 450, cogs: 84_000, cost: 120_000_000, material: ["aetherite-core", 1_200],
    text: "+6% skill XP in ALL skills, +25% Cogs from Agility; -8% Agility mastery XP, -3% chance to double items in ALL skills",
    mods: [
      ["skillXP", 0.06, "global"], ["currency", 0.25, "skill"],
      ["masteryXP", -0.08, "skill"], ["doubleChance", -0.03, "global"],
    ],
  },
  {
    id: "obs-long-fall", name: "The Long Fall", slot: 7, level: 99,
    interval: 42, xp: 504, cogs: 100_000, cost: 250_000_000, material: ["ninefold-ingot", 900],
    text: "+10% skill XP and +10% chance to double in ALL skills; -10% mastery XP in ALL skills, -35% Cogs from Agility",
    mods: [
      ["skillXP", 0.10, "global"], ["doubleChance", 0.10, "global"],
      ["masteryXP", -0.10, "global"], ["currency", -0.35, "skill"],
    ],
  },
];

export const OBSTACLE_BY_ID = new Map(OBSTACLES.map((o) => [o.id, o]));

/** Designs that can go in slot `i`, cheapest first. */
export const obstaclesForSlot = (i) => OBSTACLES.filter((o) => o.slot === i);

/** How many blueprint presets the player may keep. */
export const BLUEPRINT_SLOTS = 3;
