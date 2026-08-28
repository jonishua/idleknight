/* =========================================================================
   EMBERVEIL — THE THINGS IN THE VEIL

   Nine tiers of Warding, and the only place in the game with real wealth.

   HOW THE LADDER WAS BUILT (this is a derivation, not a wish list):

     1. The relic ladder in shop.js fixes the player's damage per second at
        every tier: DPS = (1 + maxHit)/2 * hitChance / attackInterval.
     2. Kill time is then CHOSEN — 14 s at tier one drifting to 30 s at tier
        nine — and monster HP is set to DPS x killTime. Cadence stays roughly
        constant across the whole arc while every number on screen grows by
        four orders of magnitude. A fight should always feel like a fight.
     3. Every monster's evasion is a quarter of the tier-matched relic's
        accuracy, which pins hit chance at ~80% the whole way up. Progression
        buys damage, never the right to stop missing.
     4. Per-kill value is a geometric ladder, x7.65 a tier, split roughly
        40% raw Cogs to 60% sellable drops so the reliquary sink actually
        bites and so sale-value modifiers have something to multiply.

   The result, measured by the engine rather than asserted here: about
   2,000 Cogs/hr at tier one — the same first hour a gathering skill pays —
   climbing to roughly 12 billion at tier nine. Combat out-earns the best
   non-combat loop by 10-60x at equal investment, which is the split the
   reference draws: skills for experience, combat for money.


   THE INTERLEAVED TIERS
   ---------------------
   Nine flagship tiers is a ladder, not a world: it gives the player one thing
   to fight at a time and nothing to choose between. Eight more monsters sit
   BETWEEN those rungs, at levels 6/19/33/47/61/74/86/95, with stats
   geometrically interpolated from their neighbours so the cadence in rule 2
   holds across sixteen rungs instead of nine. They carry the two drop tables
   the flagship nine deliberately do not:

     RELICS     the Devotion faucet. Worth zero Cogs, so an offering can never
                compete with the sell button.
     EQUIPMENT  the armour ladder from ../equipment.js. Forty pieces, split
                across the eight so every set has two sources and neither is
                the same fight twice.

   The flagship nine are untouched on purpose: every published figure in the
   balance report is measured against them, and a new drop on tier one would
   silently move the first-hour number the whole economy is anchored to.

   Aether Shards drop only from tier five up. That is deliberate. Sigilwork,
   the late non-combat faucet, is throughput-limited by shard income and not
   by its own interval, so the two halves of the endgame need each other.
   ========================================================================= */

export const MONSTER_RESPAWN_SECONDS = 3;

/**
 * hp / evasion / maxHit / accuracy / attack (seconds) — accuracy and maxHit
 * on a monster describe ITS attacks against the player.
 * cogs   -> [min, max] raw currency, rolled per kill
 * drops  -> guaranteed or chance-gated item drops, [min,max] quantity
 * shards -> Aether Shards, the Sigilwork constraint
 * seals  -> Warden Seals, the capstone currency
 *
 * THERE IS NO `xp` FIELD, AND THAT IS THE POINT. Experience is paid per point
 * of damage — VITALITY_XP_PER_DAMAGE into Vitality and STYLE_XP_PER_DAMAGE
 * into whichever weapon skill the attack style trains — so a monster's XP
 * value is exactly `hp * STYLE_XP_PER_DAMAGE` and cannot be written down
 * wrong. See the long note on STYLE_XP_PER_DAMAGE in ../js/engine/constants.js
 * for what a hand-written per-kill number did to this ladder before it went.
 */
export const MONSTERS = [
  {
    id: "hollow-wisp",
    name: "Hollow Wisp",
    tier: 1,
    level: 1,
    blurb: "A lamp that forgot it was carried by somebody.",
    hp: 17, evasion: 5, maxHit: 6, accuracy: 31, attack: 3.0,
    cogs: [2, 6],
    drops: [{ item: "veil-ash", chance: 0.4, qty: [1, 1] }],
  },
  {
    id: "rust-kite",
    name: "Rust Kite",
    tier: 2,
    level: 12,
    blurb: "Sheet metal, ill will, and a five-metre wingspan.",
    hp: 50, evasion: 11, maxHit: 14, accuracy: 58, attack: 3.0,
    cogs: [20, 38],
    drops: [
      { item: "veil-ash", chance: 1, qty: [1, 3] },
      { item: "hollow-core", chance: 0.06, qty: [1, 1] },
    ],
  },
  {
    id: "ashen-revenant",
    name: "Ashen Revenant",
    tier: 3,
    level: 26,
    blurb: "Someone's guildmate, still reporting for a shift that ended in the war.",
    hp: 155, evasion: 26, maxHit: 30, accuracy: 115, attack: 2.8,
    cogs: [180, 260],
    drops: [
      { item: "veil-ash", chance: 1, qty: [2, 5] },
      { item: "hollow-core", chance: 0.6, qty: [1, 1] },
      { item: "rift-sliver", chance: 0.026, qty: [1, 1] },
    ],
  },
  {
    id: "slag-behemoth",
    name: "Slag Behemoth",
    tier: 4,
    level: 40,
    blurb: "Cooled wrong, woke up anyway.",
    hp: 515, evasion: 71, maxHit: 62, accuracy: 252, attack: 2.8,
    cogs: [1600, 1800],
    drops: [
      { item: "hollow-core", chance: 1, qty: [2, 5] },
      { item: "rift-sliver", chance: 0.32, qty: [1, 1] },
    ],
  },
  {
    id: "void-harrier",
    name: "Void Harrier",
    tier: 5,
    level: 54,
    blurb: "It hunts the gap between two seconds and it is very good at it.",
    hp: 1770, evasion: 201, maxHit: 120, accuracy: 576, attack: 2.6,
    cogs: [12000, 14000],
    drops: [
      { item: "rift-sliver", chance: 1, qty: [2, 4] },
      { item: "stormcrown-shard", chance: 0.037, qty: [1, 1] },
    ],
    shards: { chance: 0.35, qty: [1, 2] },
  },
  {
    id: "emberquartz-colossus",
    name: "Gilded Colossus",
    tier: 6,
    level: 68,
    blurb: "Eleven metres of lit stone walking a route nobody surveyed.",
    hp: 6050, evasion: 576, maxHit: 210, accuracy: 1380, attack: 2.6,
    cogs: [98000, 100000],
    drops: [
      { item: "rift-sliver", chance: 1, qty: [8, 16] },
      { item: "stormcrown-shard", chance: 0.86, qty: [1, 1] },
    ],
    shards: { chance: 0.55, qty: [2, 4] },
  },
  {
    id: "stormcrown-wyrm",
    name: "Stormcrown Wyrm",
    tier: 7,
    level: 80,
    blurb: "The weather over the northern reach, with a spine.",
    hp: 21450, evasion: 1651, maxHit: 330, accuracy: 3240, attack: 2.4,
    cogs: [750000, 810000],
    drops: [
      { item: "stormcrown-shard", chance: 1, qty: [6, 14] },
      { item: "riftbound-heart", chance: 0.09, qty: [1, 1] },
    ],
    shards: { chance: 0.75, qty: [3, 6] },
    seals: { chance: 0.008, qty: [1, 1] },
  },
  {
    id: "riftbound-sovereign",
    name: "Riftbound Sovereign",
    tier: 8,
    level: 91,
    blurb: "Crowned by the tear it came through. Extremely aware of this.",
    hp: 76350, evasion: 4751, maxHit: 460, accuracy: 7680, attack: 2.4,
    cogs: [5700000, 6100000],
    drops: [
      { item: "stormcrown-shard", chance: 1, qty: [30, 60] },
      { item: "riftbound-heart", chance: 1, qty: [2, 4] },
    ],
    shards: { chance: 0.9, qty: [5, 10] },
    seals: { chance: 0.016, qty: [1, 1] },
  },
  {
    id: "the-ninefold-warden",
    name: "The Ninefold Warden",
    tier: 9,
    level: 99,
    blurb:
      "The last thing the old guilds built, and the reason there is a veil at all. " +
      "It is not hostile. It is simply still doing its job.",
    hp: 282000, evasion: 13751, maxHit: 620, accuracy: 18000, attack: 2.2,
    cogs: [44000000, 46000000],
    drops: [
      { item: "riftbound-heart", chance: 1, qty: [12, 24] },
      { item: "ninefold-core", chance: 1, qty: [1, 3] },
    ],
    shards: { chance: 1, qty: [10, 20] },
    seals: { chance: 0.035, qty: [1, 1] },
  },
];

/* =========================================================================
   THE INTERLEAVED TIERS — relics, armour, and something to choose between.
   Stats are the geometric mean of the flagship rungs either side, so kill
   cadence and hit chance hold at the same values the nine were tuned to.
   ========================================================================= */

const GEAR = (set, slots, chance) =>
  slots.map((slot) => ({ item: `gear-${set}-${slot}`, chance, qty: [1, 1] }));

const ARMOUR = ["helmet", "body", "legs", "boots", "gloves"];
const TRINKETS = ["cape", "amulet", "shield", "ring", "ammo"];

const INTERLEAVED = [
  {
    id: "ashling-swarm",
    name: "Ashling Swarm",
    tier: 1.5,
    level: 6,
    blurb: "Small, many, and each one certain it is the important one.",
    hp: 29, evasion: 7, maxHit: 9, accuracy: 42, attack: 3.0,
    cogs: [8, 18],
    drops: [
      { item: "veil-ash", chance: 0.7, qty: [1, 2] },
      { item: "relic-ashen", chance: 0.5, qty: [1, 1] },
      ...GEAR("emberweave", ARMOUR, 0.02),
    ],
  },
  {
    id: "scrapjaw",
    name: "Scrapjaw",
    tier: 2.5,
    level: 19,
    blurb: "It eats the fences people build to keep it out. Slowly.",
    hp: 88, evasion: 17, maxHit: 21, accuracy: 82, attack: 2.9,
    cogs: [60, 100],
    drops: [
      { item: "veil-ash", chance: 1, qty: [1, 4] },
      { item: "relic-ashen", chance: 0.8, qty: [1, 1] },
      ...GEAR("emberweave", TRINKETS, 0.02),
    ],
  },
  {
    id: "kiln-stalker",
    name: "Kiln Stalker",
    tier: 3.5,
    level: 33,
    blurb: "Something learned to live in the heat and stopped needing the light.",
    hp: 282, evasion: 43, maxHit: 43, accuracy: 170, attack: 2.8,
    cogs: [540, 700],
    drops: [
      { item: "hollow-core", chance: 0.8, qty: [1, 2] },
      { item: "relic-ashen", chance: 1, qty: [1, 2] },
      { item: "relic-hallowed", chance: 0.25, qty: [1, 1] },
      ...GEAR("slagplate", ARMOUR, 0.015),
    ],
  },
  {
    id: "cinderfen-lurker",
    name: "Cinderfen Lurker",
    tier: 4.5,
    level: 47,
    blurb: "The fen is warm because of what is under it, and it is awake.",
    hp: 955, evasion: 119, maxHit: 86, accuracy: 381, attack: 2.7,
    cogs: [4400, 5100],
    drops: [
      { item: "hollow-core", chance: 1, qty: [2, 4] },
      { item: "relic-hallowed", chance: 0.6, qty: [1, 1] },
      ...GEAR("slagplate", TRINKETS, 0.015),
    ],
  },
  {
    id: "glasswing-drake",
    name: "Glasswing Drake",
    tier: 5.5,
    level: 61,
    blurb: "You hear the wings a half-second after they have already gone past.",
    hp: 3273, evasion: 340, maxHit: 159, accuracy: 892, attack: 2.6,
    cogs: [34000, 37000],
    drops: [
      { item: "rift-sliver", chance: 1, qty: [1, 3] },
      { item: "relic-hallowed", chance: 1, qty: [1, 2] },
      { item: "relic-warden", chance: 0.15, qty: [1, 1] },
      ...GEAR("voidmail", ARMOUR, 0.012),
    ],
  },
  {
    id: "duskheart-sentinel",
    name: "Duskheart Sentinel",
    tier: 6.5,
    level: 74,
    blurb: "Posted to a door that has not existed for two hundred years.",
    hp: 11391, evasion: 975, maxHit: 264, accuracy: 2114, attack: 2.5,
    cogs: [271000, 285000],
    drops: [
      { item: "rift-sliver", chance: 1, qty: [4, 9] },
      { item: "relic-warden", chance: 0.5, qty: [1, 1] },
      ...GEAR("voidmail", TRINKETS, 0.012),
    ],
  },
  {
    id: "riftglass-herald",
    name: "Riftglass Herald",
    tier: 7.5,
    level: 86,
    blurb: "It announces something. Nobody has worked out what, or to whom.",
    hp: 40468, evasion: 2801, maxHit: 390, accuracy: 4989, attack: 2.4,
    cogs: [2070000, 2225000],
    drops: [
      { item: "stormcrown-shard", chance: 1, qty: [2, 6] },
      { item: "relic-warden", chance: 1, qty: [1, 2] },
      { item: "relic-ninefold", chance: 0.1, qty: [1, 1] },
      ...GEAR("ninefold", ARMOUR, 0.008),
    ],
  },
  {
    id: "the-hollow-choir",
    name: "The Hollow Choir",
    tier: 8.5,
    level: 95,
    blurb: "Nine voices, one of them yours, and it has not happened yet.",
    hp: 146700, evasion: 8083, maxHit: 534, accuracy: 11758, attack: 2.3,
    cogs: [15900000, 16700000],
    drops: [
      { item: "riftbound-heart", chance: 0.6, qty: [1, 2] },
      { item: "relic-ninefold", chance: 0.5, qty: [1, 1] },
      ...GEAR("ninefold", TRINKETS, 0.008),
    ],
  },
];

/** Flagship tiers and interleaved tiers, sorted into one level-ordered list. */
MONSTERS.push(...INTERLEAVED);
MONSTERS.sort((a, b) => a.level - b.level || a.tier - b.tier);

export const MONSTER_BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

