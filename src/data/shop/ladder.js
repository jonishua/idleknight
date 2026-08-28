/* =========================================================================
   EMBERVEIL — SHOP: THE FOUNDING LADDER (sinks)

   ONE CONCERN, ONE FILE. This module owns the reliquary curve, the tool and
   bench ladders, the Warding relics, the waystations, the comforts and the
   Ascension Rites — everything the eight founding skills spend Cogs on. It
   exports its rows; ./index.js concatenates every module's rows into the one
   SHOP array the engine reads. Adding a shelf for a new skill means adding a
   FILE next to this one and one line to ./index.js.

   Where the Cogs go. Four rules price everything in this file, and the
   balance report checks all four:

     RULE 1 — Every flagship sink costs about FIVE HOURS of the income tier it
              is aimed at. The reliquary curve totals 93.7M, which is five
              hours of a mid-game loop; the Ascension Rites total 64.4B, which
              is five hours of endgame Warding. A sink sized to matter without
              becoming the whole game.

     RULE 2 — The first purchase of every ladder must be affordable inside the
              first two minutes. The first reliquary clasp costs 27 Cogs; the
              first tool costs 50. A sink that introduces itself immediately is
              a sink the player understands forever.

     RULE 3 — Tool ladders hold their BENEFIT flat at -5% per step and let the
              PRICE multiply 4-10x per step. This looks wrong on a spreadsheet
              and is right in play, because throughput is 1/(1-reduction): the
              first -5% buys +5.3% actions per hour, and the -5% that takes you
              from -35% to -40% buys +8.3%. The hyperbola carries the pricing.

     RULE 4 — Nothing costs more because the player is rich. Every price here
              is a function of WHAT is being bought, never of what is held.
   ========================================================================= */

/* =========================================================================
   THE RELIQUARY  — the flagship smooth sink
   ========================================================================= */

/**
 * Cost of the (n+1)-th purchased clasp, where `n` clasps are already owned.
 *
 * Note the denominator is an EXPONENT, not a multiplication. That is what
 * makes the curve self-limiting: the exponent term flattens as n grows, so
 * the price asymptotes toward the flat ceiling instead of exploding.
 *
 * Tuned so that: cost(0) = 27 (two minutes of play), the curve is strictly
 * increasing across all 118 purchasable clasps, cost(117) = 4,686,083 and the
 * whole ladder totals 93,706,920 Cogs.
 */
export const CLASP_CURVE = { A: 190_650_000, B: 90_000, C: 180, D: 125 };
export const CLASP_FLAT_COST = 5_000_000;

export function claspCost(owned) {
  const { A, B, C, D } = CLASP_CURVE;
  if (owned >= 118) return CLASP_FLAT_COST;
  return Math.floor((A * (owned + 2)) / Math.pow(B, C / (D + owned)));
}

export function claspCumulative(count) {
  let total = 0;
  for (let n = 0; n < count; n++) total += claspCost(n);
  return total;
}

/* =========================================================================
   TOOL LADDERS
   Seven steps, level 1 to 80, six at -5% and a final -10%, ending at -40%.
   Guild ranks replace the metal ladder entirely: an Emberveil tool is named
   for the hand that made it, not for what it is made of.
   ========================================================================= */

const TOOL_RANKS = [
  ["apprentice",  "Apprentice",  1,  0.05],
  ["journeyman",  "Journeyman",  10, 0.05],
  ["guildwright", "Guildwright", 20, 0.05],
  ["emberforged", "Emberforged", 35, 0.05],
  ["voidtempered","Voidtempered",50, 0.05],
  ["ascendant",   "Ascendant",   60, 0.05],
  ["wardens",     "Warden's",    80, 0.10],
];

function toolLadder(skill, noun, costs) {
  return TOOL_RANKS.map(([rankId, rank, level, cut], i) => ({
    id: `tool-${skill}-${rankId}`,
    name: `${rank} ${noun}`,
    category: "tool",
    skill,
    level,
    cost: costs[i],
    requires: i === 0 ? null : `tool-${skill}-${TOOL_RANKS[i - 1][0]}`,
    text: `-${(cut * 100).toFixed(0)}% ${skill} interval`,
    mods: [["intervalPercent", -cut, skill]],
  }));
}

/* Three ladders, three price shapes. Delving's is cheapest at the top because
   Delving's real cost is respawn downtime, not interval; Trawling's is dearest
   because its top rung is also the best Cogs-per-second in the game. */
const TOOLS = [
  ...toolLadder("delving",    "Pick",   [250, 1_000, 4_000, 15_000, 60_000, 250_000, 1_000_000]),
  ...toolLadder("boughcraft", "Limbsaw",[50,  750,   2_500, 10_000, 50_000, 200_000, 2_000_000]),
  ...toolLadder("trawling",   "Trawlnet",[100, 900,  3_000, 12_000, 55_000, 220_000, 1_500_000]),
];

/* Artisan skills get a shorter three-step bench: -20% total, priced so the
   last step lands on the same 1M "you have arrived in the midgame" shelf as
   the multi-vein charm and the first auto-ward. */
const BENCH_RANKS = [
  ["guild",     "Guild",     20, 0.05, 5_000],
  ["ascendant", "Ascendant", 55, 0.05, 100_000],
  ["wardens",   "Warden's",  85, 0.10, 1_500_000],
];

function benchLadder(skill, noun) {
  return BENCH_RANKS.map(([rankId, rank, level, cut, cost], i) => ({
    id: `bench-${skill}-${rankId}`,
    name: `${rank} ${noun}`,
    category: "tool",
    skill,
    level,
    cost,
    requires: i === 0 ? null : `bench-${skill}-${BENCH_RANKS[i - 1][0]}`,
    text: `-${(cut * 100).toFixed(0)}% ${skill} interval`,
    mods: [["intervalPercent", -cut, skill]],
  }));
}

const BENCHES = [
  ...benchLadder("emberrite",   "Firebox"),
  ...benchLadder("kilnwork",    "Bellows"),
  ...benchLadder("hearthcraft", "Hearthstone"),
  ...benchLadder("sigilwork",   "Stylus"),
];

/* =========================================================================
   WARDING RELICS — the FLAT damage spine, and the biggest early-to-mid sink
   Every point of raw accuracy, max hit and evasion in the game is traceable
   to one purchase on this list. Armour (../equipment.js) is a percentage
   layer stacked on top of it, never a second source of flat points, so the
   spine stays the thing the economy was measured against. Relics are
   cumulative attunements rather than swappable objects — the ninth does not
   replace the first, it adds to it — which is why the Combat screen's weapon
   slot is a readout of your strongest relic and not a picker.
   Level requirements read the Attack skill.
   ========================================================================= */

const RELICS = [
  ["relic-1", "Emberbrand Cleaver",   1,  100,             5,     8,     11,   0],
  ["relic-2", "Guildwright Halberd",  12, 2_000,           14,    22,    22,   0],
  ["relic-3", "Marrowbound Glaive",   26, 30_000,          42,    62,    48,   0],
  ["relic-4", "Slagfire Maul",        40, 400_000,         128,   180,   96,   0],
  ["relic-5", "Voidtempered Saber",   54, 4_000_000,       390,   520,   210,  0.1],
  ["relic-6", "Emberquartz Warblade", 68, 30_000_000,      1180,  1500,  480,  0.1],
  ["relic-7", "Stormcrown Pike",      80, 200_000_000,     3600,  4300,  1150, 0.2],
  ["relic-8", "Riftbound Scythe",     91, 1_200_000_000,   11000, 12400, 2700, 0.2],
  ["relic-9", "The Ninefold Edge",    99, 8_000_000_000,   33000, 36000, 6400, 0.3],
];

const RELIC_ENTRIES = RELICS.map(([id, name, level, cost, maxHit, accuracy, evasion, flat], i) => ({
  id,
  name,
  category: "relic",
  skill: "attack",
  level,
  cost,
  seals: id === "relic-9" ? 9 : 0,
  requires: i === 0 ? null : RELICS[i - 1][0],
  text:
    `+${maxHit} max hit, +${accuracy} accuracy, +${evasion} evasion` +
    (flat ? `, -${flat}s attack interval` : ""),
  mods: [
    ["maxHit", maxHit, "combat"],
    ["accuracy", accuracy, "combat"],
    ["evasion", evasion, "combat"],
    ...(flat ? [["intervalFlat", flat, "combat"]] : []),
  ],
}));

/* =========================================================================
   WAYSTATIONS — the signed-modifier puzzle
   Eight slots on the road, twelve designs to fill them with, and every design
   past the first carries a real drawback. Because stacking is additive (§7.1)
   and modifiers are signed, choosing eight of twelve is a genuine linear
   optimisation the player can reason about on paper. That is the payoff for
   additive stacking, and it is the most interesting economy in the reference.
   Waystations must be REBUILT to reconfigure, so the puzzle is also a drain.
   ========================================================================= */

export const WAYSTATION_SLOTS = 8;

const WAYSTATIONS = [
  {
    id: "way-milestone", name: "Ashen Milestone", level: 1,
    cost: 5_000, material: ["shalebrick", 50],
    text: "-4% Exploration interval; -3% Exploration XP",
    mods: [["intervalPercent", -0.04, "wayfaring"], ["skillXP", -0.03, "wayfaring"]],
  },
  {
    id: "way-lamppost", name: "Lampwright's Post", level: 20,
    cost: 60_000, material: ["palegrit-billet", 250],
    text: "+8% Cogs from Exploration; +6% Exploration interval",
    mods: [["currency", 0.08, "wayfaring"], ["intervalPercent", 0.06, "wayfaring"]],
  },
  {
    id: "way-windbreak", name: "Windbreak Arch", level: 30,
    cost: 500_000, material: ["marrow-billet", 1_000],
    text: "-8% interval in ALL skills; -12% Cogs from Exploration",
    mods: [["intervalPercent", -0.08, "global"], ["currency", -0.12, "wayfaring"]],
  },
  {
    id: "way-shrine", name: "The Quiet Shrine", level: 40,
    cost: 500_000, material: ["slagbloom-billet", 1_000],
    text: "+4% skill XP in ALL skills; -15% Cogs from every action",
    mods: [["skillXP", 0.04, "global"], ["currency", -0.15, "global"]],
  },
  {
    id: "way-beacon", name: "Gold Ore Beacon", level: 50,
    cost: 2_000_000, material: ["emberquartz-core", 1_200],
    text: "+6% mastery XP in ALL skills; +8% Exploration interval",
    mods: [["masteryXP", 0.06, "global"], ["intervalPercent", 0.08, "wayfaring"]],
  },
  {
    id: "way-ford", name: "The Drowned Ford", level: 58,
    cost: 6_000_000, material: ["voidglass-lens", 1_500],
    text: "+12% chance to double items in ALL skills; -30% Cogs from Exploration",
    mods: [["doubleChance", 0.12, "global"], ["currency", -0.30, "wayfaring"]],
  },
  {
    id: "way-tollgate", name: "Sunmetal Toll-gate", level: 66,
    cost: 18_000_000, material: ["sunmetal-plate", 2_000],
    text: "+25% Cogs from Exploration; -8% skill XP in ALL skills",
    mods: [["currency", 0.25, "wayfaring"], ["skillXP", -0.08, "global"]],
  },
  {
    id: "way-watchpost", name: "Warden's Watchpost", level: 74,
    cost: 50_000_000, material: ["sunmetal-plate", 5_000],
    text: "+7% accuracy and +5% max hit; -10% resource preservation",
    mods: [["accuracyPercent", 0.07, "combat"], ["maxHitPercent", 0.05, "combat"], ["preserveChance", -0.10, "global"]],
  },
  {
    id: "way-hollowgate", name: "The Hollow Gate", level: 82,
    cost: 60_000_000, material: ["warden-alloy", 5_000],
    text: "-12% interval in ALL skills; -2% mastery XP in ALL skills",
    mods: [["intervalPercent", -0.12, "global"], ["masteryXP", -0.02, "global"]],
  },
  {
    id: "way-aetherstone", name: "Aetherite Waystone", level: 88,
    cost: 75_000_000, material: ["aetherite-core", 5_000],
    text: "+10% mastery XP in ALL skills; +6% interval in ALL skills",
    mods: [["masteryXP", 0.10, "global"], ["intervalPercent", 0.06, "global"]],
  },
  {
    id: "way-reliquary", name: "Silent Reliquary", level: 92,
    cost: 250_000_000, material: ["ninefold-ingot", 2_000],
    text: "+15% preservation and +50% mastery pool cap; -12% Cogs from every action",
    mods: [["preserveChance", 0.15, "global"], ["poolCap", 0.50, "global"], ["currency", -0.12, "global"]],
  },
  {
    id: "way-ninefold-arch", name: "The Ninefold Arch", level: 95,
    cost: 400_000_000, material: ["ninefold-ingot", 3_000],
    text: "+18% Cogs and +6% skill XP; +10% Exploration interval, -20% chance to double",
    mods: [
      ["currency", 0.18, "global"], ["skillXP", 0.06, "global"],
      ["intervalPercent", 0.10, "wayfaring"], ["doubleChance", -0.20, "global"],
    ],
  },
];

/* =========================================================================
   COMFORTS AND CAPSTONES
   1M is the "you have arrived in the midgame" shelf and three things land on
   it at once — a deliberate decision point, not an accident. 5M-20M is the
   comfort tier. 100M+ is late. Beyond that lies the Ascension.
   ========================================================================= */

const COMFORTS = [
  {
    id: "charm-twin-vein", name: "Twin-Vein Charm", category: "comfort", level: 1, cost: 1_000_000,
    text: "Mining yields two of every ore. Multiplies WITH the doubling roll, not into it.",
    /* §7.2 exception 2 — a deterministic quantity multiplier is its own
       multiplicative layer, so charm x doubling-roll really is 4 ore. */
    mods: [["quantityMultiplier", 2, "delving"]],
  },
  { id: "ward-auto-1", name: "Auto-Ward Sigil I",   category: "comfort", level: 1, cost: 1_000_000,
    text: "Eats at 60% HP, heals to 40%, 20% efficiency", autoWard: { trigger: 0.6, healTo: 0.4, efficiency: 0.2 }, mods: [] },
  { id: "ward-auto-2", name: "Auto-Ward Sigil II",  category: "comfort", level: 1, cost: 5_000_000, requires: "ward-auto-1",
    text: "Eats at 80% HP, heals to 60%, 30% efficiency", autoWard: { trigger: 0.8, healTo: 0.6, efficiency: 0.3 }, mods: [] },
  { id: "ward-auto-3", name: "Auto-Ward Sigil III", category: "comfort", level: 1, cost: 20_000_000, requires: "ward-auto-2",
    text: "Eats at 100% HP, heals to 80%, 40% efficiency", autoWard: { trigger: 1.0, healTo: 0.8, efficiency: 0.4 }, mods: [] },
  { id: "lens-focus", name: "Deep Focus Lens", category: "comfort", level: 1, cost: 5_000_000,
    text: "+5% skill XP in ALL skills", mods: [["skillXP", 0.05, "global"]] },

  /* The three pool-cap raisers. +25 / +50 / +25, additive to +100%. Raising
     the cap does NOT move the checkpoint thresholds — that is the point of
     them: they let the 95% checkpoint be held comfortably while still
     banking XP to spend on mastery levels. */
  { id: "codex-1", name: "Mastery Codex I",   category: "comfort", level: 1, cost: 10_000_000,
    text: "+25% mastery pool cap", mods: [["poolCap", 0.25, "global"]] },
  { id: "codex-2", name: "Mastery Codex II",  category: "comfort", level: 1, cost: 60_000_000, requires: "codex-1",
    text: "+50% mastery pool cap", mods: [["poolCap", 0.50, "global"]] },
  { id: "codex-3", name: "Mastery Codex III", category: "comfort", level: 1, cost: 250_000_000, requires: "codex-2",
    text: "+25% mastery pool cap", mods: [["poolCap", 0.25, "global"]] },

  /* Pure organisation, priced at roughly the whole clasp ladder each. The
     reference sells ten of these at 1x the entire slot curve; ours are the
     same idea and the same relative price. */
  { id: "reliquary-wing", name: "Reliquary Wing", category: "comfort", level: 1, cost: 100_000_000, repeatable: 10,
    text: "One more wing of the reliquary. Organisation only.", mods: [] },
];

/* =========================================================================
   THE ASCENSION RITES — the designed endgame
   Nine Wardens, bound one at a time. Costs 64.4 billion Cogs and 30 Warden
   Seals in total, which is about five hours of tier-nine Warding for the Cogs
   and about eight for the seals — so the capstone is gated by the rarer of the
   two, exactly as intended. The ninth rite raises the level cap from 99 to 120,
   which re-opens the XP curve for another 91 million XP per skill.
   ========================================================================= */

const ASCENSION = [
  { id: "warden-vharn",    name: "Vharn, the Cinderbound",   cost: 200_000_000,    seals: 1, ingots: 20,
    text: "+8% skill XP in ALL skills",            mods: [["skillXP", 0.08, "global"]] },
  { id: "warden-ilexa",    name: "Ilexa, the Tidebound",     cost: 500_000_000,    seals: 1, ingots: 40,
    text: "+8% chance to double items everywhere", mods: [["doubleChance", 0.08, "global"]] },
  { id: "warden-sorrel",   name: "Sorrel of the Grove",      cost: 1_200_000_000,  seals: 2, ingots: 70,
    text: "+10% resource preservation",            mods: [["preserveChance", 0.10, "global"]] },
  { id: "warden-kestrel",  name: "Kestrel, the Stormbound",  cost: 2_500_000_000,  seals: 2, ingots: 110,
    text: "-6% interval in ALL skills",            mods: [["intervalPercent", -0.06, "global"]] },
  { id: "warden-ravel",    name: "Ravel, the Voidbound",     cost: 4_500_000_000,  seals: 3, ingots: 160,
    text: "+25% Cogs from every action",           mods: [["currency", 0.25, "global"]] },
  { id: "warden-ossian",   name: "Ossian the Emberwright",   cost: 7_500_000_000,  seals: 3, ingots: 220,
    text: "+12% mastery XP in ALL skills",         mods: [["masteryXP", 0.12, "global"]] },
  { id: "warden-thessaly", name: "Thessaly, the Riftbound",  cost: 12_000_000_000, seals: 4, ingots: 300,
    text: "+15% max hit and +15% accuracy",        mods: [["maxHitPercent", 0.15, "combat"], ["accuracyPercent", 0.15, "combat"]] },
  { id: "warden-nym",      name: "Nym the Silent",           cost: 16_000_000_000, seals: 5, ingots: 400,
    text: "+40% Cogs from every sale",             mods: [["saleValue", 0.40, "global"]] },
  { id: "warden-aureth",   name: "Aureth, the Ninefold",     cost: 20_000_000_000, seals: 9, ingots: 600,
    text: "Raises every skill cap from 99 to 120, and +10% to interval, XP and Cogs",
    raisesCap: true,
    mods: [["intervalPercent", -0.10, "global"], ["skillXP", 0.10, "global"], ["currency", 0.10, "global"]] },
].map((w, i) => ({
  ...w,
  category: "ascension",
  level: 1,
  requires: i === 0 ? null : ["warden-vharn","warden-ilexa","warden-sorrel","warden-kestrel","warden-ravel","warden-ossian","warden-thessaly","warden-nym"][i - 1],
  material: ["ninefold-ingot", w.ingots],
}));

/** This module's rows, in shelf order. ./index.js does the concatenating. */
export const ENTRIES = [...TOOLS, ...BENCHES, ...RELIC_ENTRIES, ...COMFORTS, ...ASCENSION];
export const WAYSTATION_LIST = WAYSTATIONS;
export const WAYSTATION_BY_ID = new Map(WAYSTATIONS.map((w) => [w.id, w]));
export const RELIC_LADDER = RELIC_ENTRIES;
export const TOOL_LADDERS = { delving: TOOLS.slice(0, 7), boughcraft: TOOLS.slice(7, 14), trawling: TOOLS.slice(14, 21) };
export const ASCENSION_RITES = ASCENSION;

/** Base combat profile before any relic is bought. */
export const PLAYER_BASE = {
  maxHit: 3,
  accuracy: 12,
  evasion: 15,
  attackInterval: 3.0,
  /* Without an Auto-Ward Sigil the adept eats one provision at a time from
     45% HP up to 90%. The sigils buy a better trigger and better efficiency,
     which is what makes them worth a million Cogs. */
  autoWard: { trigger: 0.45, healTo: 0.9, efficiency: 1.0 },
};
