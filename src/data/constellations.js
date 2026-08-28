/* =========================================================================
   EMBERVEIL — ASTROLOGY CONSTELLATIONS  (parity §3e)

   Eight constellations. Each carries two actions and three modifier slots.

   THE TWO ACTIONS
   ---------------
   STUDY pays experience and drops a Star Mote. EXPLORE pays a third of the
   experience and drops a Prism Mote instead. Both run on the same 3.00 s
   interval the reference quotes, so the choice between them is a pure
   XP-versus-currency decision made every time you open the screen — the same
   non-monotonic choice §4.3 praises in the woodcutting ladder, moved inside
   a single constellation.

   THE THREE MODIFIER SLOTS
   ------------------------
   Every slot has three rollable states and shows all three at once, exactly
   as the reference screen does:

        0%        not yet bought
        2.00%     tier one, paid for in Star Motes
        5.00%     tier two, paid for in Star Motes AND Prism Motes

   That is why Astrology is deliberately the POOREST faucet in the game — a
   Star Mote is worth 2 Cogs and a Prism Mote 8, so nobody ever grinds this
   skill for money. Its whole output is the twenty-four modifier slots below,
   which is the largest single block of player-chosen modifiers in Emberveil
   and the reason the "View All Active Modifiers" panel exists.

   Slot values are read by src/js/engine/systems/astrology.js and pushed into
   the ordinary modifier pipeline, so a constellation percentage stacks
   additively with a tool, a waystation and an Agility obstacle exactly as §7.1
   says it must.

   ---------------------------------------------------------------------------
   NO SLOT SELLS `intervalPercent`, AND THAT IS THE POINT OF THIS PARAGRAPH
   ---------------------------------------------------------------------------
   Three slots used to: Mining interval on The Lantern, Fishing interval on
   The Net, and interval in ALL skills on The Ninefold Wheel. A player pays
   for a slot in motes, so a slot that hands back nothing is the worst trade
   in the game — and `intervalPercent` hands back nothing to the player who
   has enough Astrology levels to reach the Wheel. Run
   `node tools/check-exotic.mjs --caps`: a mastered account mid-action is
   already at -0.60 on Mining and -0.72 on Fishing against a -0.50 clamp,
   from a -40% tool ladder, two waystations and the skill's own mastery
   ladder — none of which this file can do anything about.

   Every slot below therefore sits in an UNCAPPED bucket — `skillXP`,
   `masteryXP`, `doubleChance`, `currency`, `saleValue` — or in one the cap
   report proves has room. A slot only shows a percentage the player will
   actually be paid, and because nothing here is a "negative is better"
   modifier any more, every number on the Astrology screen reads as a plain
   positive percentage.
   ========================================================================= */

/** The three rollable states every slot offers, in the order the UI shows. */
export const TIER_VALUES = [0, 0.02, 0.05];

/**
 * A modifier slot.
 *   mod    engine modifier name. Must be a bucket where a POSITIVE number is
 *          a benefit — there is no sign flip anywhere in this skill, which is
 *          exactly why an interval slot cannot live here.
 *   scope  "global" or a skill id — resolved the same way skill data is
 *   text   how the player reads it, with % filled in at render time
 */
const slot = (mod, scope, text) => ({ mod, scope, text });

export const CONSTELLATIONS = [
  {
    id: "con-lantern", name: "The Lantern", level: 1,
    blurb: "The first light anyone learns to find. It favours the deep places.",
    /* Star-mote cost of tier 1; [star, prism] cost of tier 2. */
    cost1: 320, cost2: [840, 130],
    slots: [
      slot("skillXP", "delving", "Mining skill XP"),
      slot("doubleChance", "delving", "chance to double ore"),
      slot("masteryXP", "delving", "Mining mastery XP"),
    ],
  },
  {
    id: "con-anvil", name: "The Anvil", level: 8,
    blurb: "Four flat stars and a hammer-fall. Smiths swear by it.",
    cost1: 480, cost2: [1_140, 180],
    slots: [
      slot("skillXP", "kilnwork", "Smithing skill XP"),
      slot("doubleChance", "kilnwork", "chance to double the billet"),
      slot("masteryXP", "kilnwork", "Smithing mastery XP"),
    ],
  },
  {
    id: "con-net", name: "The Net", level: 18,
    blurb: "It hangs low over the drowned reaches for half the year.",
    cost1: 660, cost2: [1_600, 260],
    slots: [
      slot("skillXP", "trawling", "Fishing skill XP"),
      slot("doubleChance", "trawling", "chance to double the catch"),
      slot("saleValue", "trawling", "Cogs from every catch sold"),
    ],
  },
  {
    id: "con-wanderer", name: "The Wanderer", level: 30,
    blurb: "A star that never sits still, and neither does anyone who follows it.",
    cost1: 900, cost2: [2_000, 350],
    slots: [
      slot("skillXP", "wayfaring", "Exploration skill XP"),
      slot("currency", "wayfaring", "Cogs from Exploration"),
      slot("skillXP", "agility", "Agility skill XP"),
    ],
  },
  {
    id: "con-kiln", name: "The Kiln", level: 42,
    blurb: "Two stars close enough to look like one fire.",
    cost1: 1_140, cost2: [2_480, 460],
    slots: [
      slot("skillXP", "emberrite", "Firemaking skill XP"),
      slot("skillXP", "hearthcraft", "Cooking skill XP"),
      slot("doubleChance", "hearthcraft", "chance to double provisions"),
    ],
  },
  {
    id: "con-hollow-crown", name: "The Hollow Crown", level: 55,
    blurb: "Nine stars in a ring with nothing in the middle. Wardens navigate by it.",
    cost1: 1_400, cost2: [2_960, 580],
    slots: [
      slot("maxHitPercent", "combat", "max hit"),
      slot("accuracyPercent", "combat", "accuracy rating"),
      slot("healing", "global", "healing from every provision"),
    ],
  },
  {
    id: "con-drowned-ship", name: "The Drowned Ship", level: 70,
    blurb: "A hull of stars going down bow-first, one degree a century.",
    cost1: 1_700, cost2: [3_540, 700],
    slots: [
      slot("skillXP", "sigilwork", "Enchanting skill XP"),
      slot("doubleChance", "sigilwork", "chance to double the sigil"),
      slot("masteryXP", "summoning", "Summoning mastery XP"),
    ],
  },
  {
    /* The prestige constellation: the only three slots in the skill that are
       scoped to every skill at once, which is why it opens at Astrology 85
       and costs the most motes on the list. */
    id: "con-ninefold-wheel", name: "The Ninefold Wheel", level: 85,
    blurb: "The whole sky turns on it. Nobody has ever counted its stars twice the same.",
    cost1: 2_000, cost2: [4_200, 820],
    slots: [
      slot("skillXP", "global", "skill XP in ALL skills"),
      slot("masteryXP", "global", "mastery XP in ALL skills"),
      slot("currency", "global", "Cogs from every action"),
    ],
  },
];

export const CONSTELLATION_BY_ID = new Map(CONSTELLATIONS.map((c) => [c.id, c]));

/** Recipe ids, so the skill file and the system agree without duplication. */
export const studyId = (c) => `study-${c.id.replace(/^con-/, "")}`;
export const exploreId = (c) => `explore-${c.id.replace(/^con-/, "")}`;

/** The upgrade key kept in the save: one entry per constellation slot. */
export const slotKey = (constellationId, index) => `${constellationId}:${index}`;
