/* =========================================================================
   EMBERVEIL — SHOP: THE PASSIVE WING

   Sinks for Farming and Settlement. Same four rules as ../shop.js:

     1. a flagship sink costs about five hours of the tier it is aimed at
     2. the first purchase of a ladder is affordable almost immediately
     3. benefit stays flat while price multiplies
     4. nothing costs more because the player is rich

   Two of these are UNLOCKS rather than modifiers, and that is the point.
   Emberloam and the Grange Steward do not make the numbers bigger, they
   change what the screen can do — the second compost tier and the ability to
   run the whole farm unattended. A passive skill's best purchases should buy
   fewer taps, not a bigger multiplier.

   EVERY MODIFIER HERE IS SCOPED TO ITS OWN SKILL. A passive skill quietly
   handing a global bonus to the nine skills that actually hold the tick loop
   is the kind of cross-skill leak the additive pipeline exists to make
   auditable, and the balance sandbox grants every non-comfort shop entry when
   it measures a mastered rung — so an unscoped modifier here would silently
   move every economy number in the report.
   ========================================================================= */

export const PASSIVE_SHOP = [
  /* --- Farming ------------------------------------------------------- */
  {
    id: "farm-glasshouse",
    name: "Glasshouse",
    category: "passive",
    skill: "farming",
    level: 25,
    cost: 750_000,
    text: "-10% grow time on every crop",
    mods: [["intervalPercent", -0.10, "farming"]],
  },
  {
    id: "farm-emberloam-vat",
    name: "Emberloam Vat",
    category: "passive",
    skill: "farming",
    level: 30,
    cost: 250_000,
    text: "Unlocks Emberloam — fills a plot's compost in one application",
    mods: [],
  },
  {
    id: "farm-seed-vault",
    name: "Seed Vault",
    category: "passive",
    skill: "farming",
    level: 40,
    cost: 1_000_000,
    text: "-20% seed cost on every planting",
    mods: [["costReduction", 0.20, "farming"]],
  },
  {
    id: "farm-grange-steward",
    name: "Grange Steward",
    category: "passive",
    skill: "farming",
    level: 55,
    cost: 5_000_000,
    text: "Harvests, replants and re-composts every plot the moment it ripens, even offline",
    mods: [],
  },
  {
    id: "farm-deep-beds",
    name: "Deep Beds",
    category: "passive",
    skill: "farming",
    level: 60,
    cost: 3_000_000,
    text: "+10% chance for a crop to grow",
    mods: [["growChance", 0.10, "farming"]],
  },
  {
    id: "farm-almanac",
    name: "Grower's Almanac",
    category: "passive",
    skill: "farming",
    level: 80,
    cost: 12_000_000,
    text: "+6% Farming XP and +6% Farming mastery XP",
    mods: [["skillXP", 0.06, "farming"], ["masteryXP", 0.06, "farming"]],
  },

  /* --- Settlement ---------------------------------------------------- */
  {
    id: "settle-surveyors",
    name: "Surveyor's Office",
    category: "passive",
    skill: "settlement",
    level: 20,
    cost: 2_000_000,
    text: "-15% Settlement build cost",
    mods: [["costReduction", 0.15, "settlement"]],
  },
  {
    id: "settle-storehouse",
    name: "Storehouse Charter",
    category: "passive",
    skill: "settlement",
    level: 40,
    cost: 8_000_000,
    text: "+50% Settlement storage on every resource",
    mods: [["storage", 0.50, "settlement"]],
  },
  {
    id: "settle-guild-seal",
    name: "Guild Seal",
    category: "passive",
    skill: "settlement",
    level: 60,
    cost: 30_000_000,
    text: "+8% Settlement XP and +6 town happiness",
    mods: [["skillXP", 0.08, "settlement"], ["happiness", 6, "settlement"]],
  },
  {
    id: "settle-road-network",
    name: "Road Network",
    category: "passive",
    skill: "settlement",
    level: 75,
    cost: 120_000_000,
    text: "+25% Cogs from the trading post, -5% every other production",
    /* §7.4 — the best sources carry real drawbacks, and the town is the one
       place in the game where the player can see both halves land on the
       same screen, tick by tick. */
    mods: [["trade", 0.25, "settlement"], ["production", -0.05, "settlement"]],
  },
];

export default PASSIVE_SHOP;
