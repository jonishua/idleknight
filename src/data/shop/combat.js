/* =========================================================================
   EMBERVEIL — SHOP: THE BOUNTY BOARD

   What Bounty Marks buy. Marks are the one currency in the game that cannot
   be earned by any other means — no gathering loop, no sale, no rare roll
   pays them — so this shelf is the only reason to take a contract instead of
   simply killing whatever is convenient. That is the whole design of the
   reference's Slayer shop and it is worth copying exactly.

   PRICED IN TWO CURRENCIES, ON PURPOSE
   ------------------------------------
   Every row costs Cogs AND Marks. The Cogs price keeps the row legible on the
   general shop screen (a row with no price reads as broken), and the Marks
   price is the real gate: a player who has never taken a bounty cannot buy
   any of these at any level of wealth. Rule 4 of ../shop/ladder.js still
   holds — nothing here costs more because the player is rich.

   WHY THESE ARE EXCLUDED FROM THE BALANCE SANDBOX
   -----------------------------------------------
   ../../js/engine/sandbox.js skips the whole `bounty` category when it builds
   its "mastered" profile, because Bounty Marks are a currency the sandbox
   does not simulate — granting the rewards for free would quietly inflate
   every combat number in the balance report by a fifth. The consequence is
   that the shipped combat figures UNDERSTATE a real capped player, which is
   the safe direction for an assertion band to be wrong in.

   THE EQUIPMENT SET SLOTS
   -----------------------
   The reference sells extra equipment sets at 300K each and a real save ends
   up with twelve. Ours starts with two, sells ten more on a climbing curve,
   and carries no modifiers at all — it is pure convenience, so it is safe for
   the sandbox to own it without touching a single measured number.
   ========================================================================= */

/** Bounty Marks are earned only by completing contracts. */
const BOUNTY = [
  {
    id: "bounty-tracker", name: "Tracker's Charm", level: 1,
    cost: 250_000, marks: 400,
    text: "+8% accuracy in combat. Bought with 400 Bounty Marks.",
    mods: [["accuracyPercent", 0.08, "combat"]],
  },
  {
    id: "bounty-whetstone", name: "Contract Whetstone", level: 20,
    cost: 1_000_000, marks: 900, requires: "bounty-tracker",
    text: "+6% max hit in combat. Bought with 900 Bounty Marks.",
    mods: [["maxHitPercent", 0.06, "combat"]],
  },
  {
    id: "bounty-ledger", name: "Bounty Ledger", level: 40,
    cost: 6_000_000, marks: 2_000, requires: "bounty-whetstone",
    text: "+30% Bounty Marks from every contract. Bought with 2,000 Marks.",
    mods: [["bountyMarks", 0.30, "global"]],
  },
  {
    id: "bounty-wardstone", name: "Hunter's Wardstone", level: 60,
    cost: 30_000_000, marks: 5_000, requires: "bounty-ledger",
    text: "+6% damage reduction and +10% evasion. Bought with 5,000 Marks.",
    mods: [["damageReduction", 0.06, "combat"], ["evasionPercent", 0.10, "combat"]],
  },
  {
    id: "bounty-sigil", name: "Warrant Sigil", level: 85,
    cost: 250_000_000, marks: 15_000, requires: "bounty-wardstone",
    text: "+12% max hit, +12% accuracy and +25% Cogs from combat. 15,000 Marks.",
    mods: [
      ["maxHitPercent", 0.12, "combat"], ["accuracyPercent", 0.12, "combat"],
      ["currency", 0.25, "combat"],
    ],
  },
].map((e) => ({ ...e, category: "bounty", skill: "bounties", requires: e.requires || null }));

/* -------------------------------------------------------------------------
   EQUIPMENT SETS — ten more, on a curve that starts at the reference's own
   300K and doubles-ish. Repeatable rows are charged once per purchase by the
   engine, so a flat price would make the twelfth set as cheap as the third;
   the ladder is expressed as ten separate rows instead, each requiring the
   last, which is also what makes the shop list read as a ladder.
   ------------------------------------------------------------------------- */
const SET_PRICES = [300_000, 600_000, 1_200_000, 2_500_000, 5_000_000,
                    10_000_000, 20_000_000, 45_000_000, 90_000_000, 180_000_000];

const SETS = SET_PRICES.map((cost, i) => ({
  id: `equip-set-${i + 3}`,
  name: `Equipment Set ${i + 3}`,
  category: "gear",
  level: 1,
  cost,
  requires: i === 0 ? null : `equip-set-${i + 2}`,
  text: `A ${i + 3}${["rd", "th", "th", "th", "th", "th", "th", "th", "th", "th"][i]} loadout you can swap between without unequipping.`,
  equipmentSet: true,
  mods: [],
}));

/** This module's rows. ./index.js concatenates them into SHOP. */
export const ENTRIES = [...BOUNTY, ...SETS];

/** The shelves this module adds, for the shop screen's category list. */
export const CATEGORIES = [
  { id: "bounty", name: "Bounty Board", blurb: "Bought with Bounty Marks, which only contracts pay." },
  { id: "gear", name: "Equipment Sets", blurb: "Extra loadouts to swap between. Convenience only — no modifiers." },
];
