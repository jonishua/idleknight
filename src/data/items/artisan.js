/* =========================================================================
   EMBERVEIL — ITEMS: THE ARTISAN WING

   Everything Bowcraft, Crafting, Alchemy and the two new Cooking stations put
   into the bank. Transmutation appears nowhere in this file on purpose: it is
   the reference's Alt. Magic, and Alt. Magic never invents an item — it moves
   material sideways through the ladders that already exist.

   ---------------------------------------------------------------------------
   WHERE THE PRICES COME FROM
   ---------------------------------------------------------------------------
   ../items/core.js states five pricing rules and the selftest enforces them.
   Two of the five bind this file, and one of them is the only rule in the
   game that is genuinely load-bearing:

     R5 — THE INVARIANT. Every processing recipe must beat selling its own
          inputs, measured in Cogs per second of TOTAL play including the time
          to gather those inputs:

              craft   = value(output) / (ownSeconds + inputSeconds)
              sellRaw = sum(value(inputs)) / inputSeconds

          Rearranged, the markup a recipe needs is

              value(out) / value(in)  >  1 + ownSeconds / inputSeconds

          which is why the markups below are NOT a constant. A first-stage
          recipe whose inputs arrive in under a second (four Birch Logs) has
          to clear nearly 2x before it beats the sell button; a recipe ten
          links down a chain clears it at 1.3x. Every markup here was chosen
          against that formula and then MEASURED by tools/check-artisan.mjs,
          which runs the real engine rather than trusting the arithmetic.

     R4 — markups SHRINK with chain depth, because they compound. Smithing
          runs 2.00x on rung one down to 1.12x on rung ten and that is the
          shape every value chain in the wing now copies:

              Crafting        4.00x -> 1.30x over seventeen rungs, MONOTONE
              Bowcraft        4.00x -> 1.28x over fifteen rungs, MONOTONE
              Cooking (catch) 4.00x -> 1.49x over nine composites, MONOTONE
              Cooking (farm)  5.83x -> 4.38x over three crop dishes, MONOTONE

          The farm shelf is a separate ladder because a crop's Cog price is a
          rounding error next to its real cost, which is a plot-hour — the same
          reason Alchemy's potion shelf is not a chain either. Both are
          classified and bounded rather than made monotone against a number
          that does not mean anything.

          The first draft of this file held Crafting flat near 2.6x the whole
          way up. That is the mistake R4 exists to catch: 2.6^17 is 3.5 x 10^6,
          and the two top rungs really did come out at 1.9 BILLION and 3.3
          BILLION Cogs an hour against the best loop in the rest of the game at
          142M. tools/check-artisan.mjs now prints the monotonicity check and
          the sustained Cogs/hr of every rung so it cannot come back.

   ---------------------------------------------------------------------------
   THE RULE THAT DECIDES THE TOP OF THE LADDER
   ---------------------------------------------------------------------------
   A NON-COMBAT LOOP MAY NOT SIT ON TOP OF AN ENDGAME COMBAT SPOIL.

   This is not a taste call, it is arithmetic. R5 forces every recipe to beat
   selling its own inputs, so a recipe INHERITS the Cogs-per-second of the
   densest thing it consumes and then adds to it. A Stormcrown Fragment is
   worth 98,000 Cogs and falls in under half a second of tier-eight fighting —
   770M Cogs/hr on the sell button alone. Cutting one into a gem cannot
   therefore be worth less than 770M/hr no matter what price the gem carries,
   and the game's whole economy claim (§5: "combat out-earns every gathering
   skill by 10-100x") dies on that one line of data.

   So Crafting's leather line still eats what falls off a monster — Veil Ash,
   Hollow Cores and Rift Slivers, whose own sale rates are 11M, 168K and 24M
   Cogs/hr and sit comfortably inside the non-combat band — and the top of the
   stonework and jewellery lines is fed from Delving and Smithing instead:
   Warden's Tears, grit off the coal seams, Warden Alloy and the Ninefold
   Ingot. The three richest spoils in the game (Stormcrown Fragment, Riftbound
   Heart, Ninefold Core) are now consumed by NOTHING. They are pure combat
   income, which is exactly what §5 says they should be.

   ---------------------------------------------------------------------------
   WHY THE BOWS ARE NOT WEAPONS
   ---------------------------------------------------------------------------
   ../equipment.js marks the weapon slot `derived: true`: relics are cumulative
   attunements, not swappable objects, and every balance number in the game was
   measured against owning all of them. So arrows are real equipment — they
   fill the ammo slot and carry the same percentage modifiers every other
   wearable does — and bows are trade goods: the Bowcraft value ladder, worth
   2.35x their materials at the bottom and 1.28x at the top, which is exactly
   what the reference's own unstrung-bow loop is for. Changing that would mean
   letting a player unequip damage, which would be a lie about how this game's
   combat is priced.

   ---------------------------------------------------------------------------
   THE FARMING CONTRACT
   ---------------------------------------------------------------------------
   Alchemy consumes `herb-*` and Cooking consumes `crop-*`. Both id families
   are defined by ../crops.js and NOT here — one owner, one definition. This
   file defines only what the artisan wing itself makes.
   ========================================================================= */

import { SLOT_BY_ID } from "../equipment.js";
import { PERFECT_VALUE_BONUS, PERFECT_HEAL_BONUS } from "./core.js";

/* =========================================================================
   1. MATERIALS — hide, fibre, gem, shaft, vial, reagent
   ========================================================================= */

/*  id                  name                  kind      value   markup over inputs */
const MATERIALS = [
  /* --- Crafting: the leather line ------------------------------------
     Veil creatures leave ash and sinew behind; bark tannin turns it into
     something you can wear. The markup thins as the chain deepens: 2.96x on
     raw ash, 1.80x on hollow cores, 1.58x on rift slivers. */
  ["veilhide",       "Cured Veilhide",      "hide",       130],   // 2.96x
  ["hollowhide",     "Cured Hollowhide",    "hide",      1330],   // 1.80x
  ["rifthide",       "Cured Rifthide",      "hide",     24800],   // 1.58x
  /* The one material that leaves Crafting entirely: Bowcraft strings every
     bow in the game with it, which is the interlock between the two skills.
     Its price therefore sets the whole bow ladder — 275 is what leaves a
     Birch Shortbow at 2.35x and an Aetherwood Warbow at 1.28x. */
  ["sinew-cord",     "Sinew Cord",          "fibre",      275],   // 2.12x

  /* --- Crafting: the stonework line ----------------------------------
     Amber is fossil resin off the boughs; Hollowstone and Riftstone are the
     veil's own mid-tier spoils cut on a coal-grit wheel. Stormstone is NOT a
     spoil — see the header: it is two Riftstones fused with Warden's Tears,
     because the spoil that would otherwise sit here is worth 770M Cogs/hr on
     its own and would drag the entire skill up with it. */
  ["gem-amber",      "Amber",               "gem",         16],   // 4.00x
  ["gem-hollow",     "Cut Hollowstone",     "gem",        985],   // 1.85x
  ["gem-rift",       "Cut Riftstone",       "gem",      17000],   // 1.62x
  ["gem-storm",      "Cut Stormstone",      "gem",      53000],   // 1.45x

  /* --- Bowcraft: shafts, which are half of every arrow ---------------- */
  ["shafts-birch",   "Birch Shafts",        "shaft",       16],   // 4.00x
  ["shafts-cedar",   "Cedar Shafts",        "shaft",      102],   // 2.04x
  ["shafts-willow",  "Willow Shafts",       "shaft",      440],   // 1.76x

  /* --- Bowcraft: the bow ladder. Trade goods; see the header. ---------
     Each rung takes MORE stave and MORE cord than the one below it and a
     THINNER margin on top, which is the only way a ladder can climb in
     absolute value while its markup falls. */
  ["bow-birch",      "Birch Shortbow",      "bow",        650],   // 2.35x
  ["bow-elm",        "Elm Shortbow",        "bow",       1230],   // 2.16x
  ["bow-cedar",      "Cedar Longbow",       "bow",       1710],   // 1.93x
  ["bow-oak",        "Oak Longbow",         "bow",       2290],   // 1.82x
  ["bow-willow",     "Willow Longbow",      "bow",       2550],   // 1.70x
  ["bow-duskheart",  "Duskheart Warbow",    "bow",       3060],   // 1.55x
  ["bow-aetherwood", "Aetherwood Warbow",   "bow",      15000],   // 1.28x

  /* --- Alchemy: the vessel. Blown over an ember, which is the only thing
     in the game that makes Firemaking's worthless output worth having
     outside a kiln. */
  ["vial-pewter",    "Pewter Vial",         "vial",        26],
  ["vial-voidglass", "Voidglass Phial",     "vial",       400],
];

/* =========================================================================
   2. POTIONS — Alchemy's output, and the only items in the game that carry
   modifiers WITHOUT being worn.

   `potion.mods` is the real modifier list, in the same [name, value, scope]
   shape every other modifier source in the game uses (§7.1: one bucket per
   name, everything additive). `potion.seconds` is how long a dose holds.

   SIGNED EFFECTS (§7.4). Three of the twelve carry a real drawback, because
   a potion list where every entry is strictly good is a list the player never
   thinks about. The Deft Hand line trades experience for speed; the Bounty
   Draught trades mastery for money.
   ========================================================================= */

/*  id  name  value  seconds  mods  text  */
const POTIONS = [
  ["potion-vigour", "Vigour Potion", 110, 300,
    [["skillXP", 0.05, "global"]],
    "+5% skill XP in all skills"],

  ["potion-keen", "Keen Edge Potion", 175, 300,
    [["maxHitPercent", 0.08, "combat"]],
    "+8% max hit"],

  ["potion-deft", "Deft Hand Potion", 330, 240,
    [["intervalPercent", -0.06, "global"], ["skillXP", -0.04, "global"]],
    "-6% interval in all skills, but -4% skill XP"],

  ["potion-vigour-greater", "Greater Vigour Potion", 570, 480,
    [["skillXP", 0.09, "global"]],
    "+9% skill XP in all skills"],

  ["potion-thrift", "Thrift Potion", 620, 360,
    [["preserveChance", 0.12, "global"]],
    "+12% chance to preserve resources"],

  ["potion-keen-greater", "Greater Keen Edge Potion", 1150, 480,
    [["maxHitPercent", 0.14, "combat"], ["accuracyPercent", 0.06, "combat"]],
    "+14% max hit and +6% accuracy"],

  ["potion-insight", "Insight Potion", 1150, 360,
    [["masteryXP", 0.10, "global"]],
    "+10% mastery XP in all skills"],

  ["potion-deft-greater", "Greater Deft Hand Potion", 2200, 480,
    [["intervalPercent", -0.10, "global"], ["skillXP", -0.06, "global"]],
    "-10% interval in all skills, but -6% skill XP"],

  ["potion-bounty", "Bounty Draught", 3200, 300,
    [["currency", 0.15, "global"], ["masteryXP", -0.05, "global"]],
    "+15% Cogs from every action, but -5% mastery XP"],

  ["potion-thrift-greater", "Greater Thrift Potion", 5200, 600,
    [["preserveChance", 0.20, "global"]],
    "+20% chance to preserve resources"],

  ["potion-warden", "Warden's Draught", 4900, 300,
    [["accuracyPercent", 0.12, "combat"], ["maxHitPercent", 0.10, "combat"]],
    "+12% accuracy and +10% max hit"],

  /* The one potion with a crafted stone in it, and therefore the one whose
     price is set by an ingredient rather than by its dose. Two Cut Riftstones
     at 17,000 hold it to 1.92x, which is what keeps the shelf's last rung the
     thinnest rung. */
  ["potion-ninefold", "Ninefold Elixir", 66000, 480,
    [["intervalPercent", -0.10, "global"], ["skillXP", 0.10, "global"],
     ["doubleChance", 0.10, "global"]],
    "-10% interval, +10% skill XP and +10% chance to double, everywhere"],
];

/** Potion ids in ladder order — ../shop/artisan.js turns each into the
 *  effect record the engine reads while a dose is live. */
export const POTION_IDS = POTIONS.map(([id]) => id);
/** id -> { seconds, mods, text }, for the shop record and the Alchemy view. */
export const POTION_EFFECTS = Object.fromEntries(
  POTIONS.map(([id, name, , seconds, mods, text]) => [id, { name, seconds, mods, text }])
);

/* =========================================================================
   3. WEARABLES — Crafting's gear, and Bowcraft's arrows

   Stats are derived from ../equipment.js's own slot weights times a tier
   multiplier, exactly the way the four shop sets are, so a crafted piece and
   a bought piece are priced on the same curve and neither can quietly become
   strictly better. Crafted gear sits BETWEEN the shop sets: the Veilhide line
   is worth more than Emberweave and less than Slagplate, so the crafting
   ladder is a real alternative rather than a parallel one.

   `equip.skill` is read straight off the slot, so a crafted piece asks for
   the same skill a bought piece in that slot does. One rule, one place.
   ========================================================================= */

/*  id  name  slot  tier  value  set  setName  level  */
const WEARABLES = [
  /* --- Crafting: the leather sets ------------------------------------- */
  ["hide-boots",     "Veilhide Boots",     "boots",  0.55,     505, "veilhide",   "Veilhide",   22],
  ["hide-body",      "Veilhide Jerkin",    "body",   0.55,     990, "veilhide",   "Veilhide",   30],
  ["hollow-legs",    "Hollowhide Greaves", "legs",   1.05,    6780, "hollowhide", "Hollowhide", 56],
  ["hollow-body",    "Hollowhide Cuirass", "body",   1.05,    8830, "hollowhide", "Hollowhide", 62],
  ["rift-helm",      "Rifthide Hood",      "helmet", 1.70,  172000, "rifthide",   "Rifthide",   92],

  /* --- Crafting: jewellery --------------------------------------------
     STATS ARE UNCHANGED. Only the sale prices moved, and they moved because
     the ladder's markup has to decay (see R4 above), not because the pieces
     got worse: the Ninefold Torc still carries the 2.30 tier multiplier and
     is still the best trinket a player can make. What it no longer does is
     pay 3.3 BILLION Cogs an hour to the person selling them. */
  ["ring-copper",    "Copper Band",        "ring",   0.60,      48, "trinket", "Crafted Trinket", 16],
  ["amulet-silver",  "Silver Pendant",     "amulet", 1.20,    2980, "trinket", "Crafted Trinket", 50],
  ["ring-gold",      "Gold Signet",        "ring",   1.80,   31500, "trinket", "Crafted Trinket", 80],
  ["amulet-ninefold","Ninefold Torc",      "amulet", 2.30,  194000, "trinket", "Crafted Trinket", 96],

  /* --- Bowcraft: the ammo slot ----------------------------------------
     Arrows are the one thing in the wing that a Ranged build genuinely
     equips. The tier multipliers below are set against ../equipment.js's four
     shop sets (0.4 / 0.8 / 1.3 / 2.0): a crafted line should be a real
     alternative, so it starts under Emberweave, crosses the middle two, and
     the level-90 rung tops the level-80 Ninefold set by 20% rather than
     doubling it. A crafted best-in-slot that is twice the bought one is not a
     second axis, it is a replacement. */
  ["arrow-copper",   "Copper Arrows",      "ammo",   0.50,      92, "arrows", "Arrows", 12],
  ["arrow-steel",    "Steel Arrows",       "ammo",   1.00,     585, "arrows", "Arrows", 30],
  ["arrow-silver",   "Silver Arrows",      "ammo",   1.50,     700, "arrows", "Arrows", 45],
  ["arrow-voidglass","Voidglass Arrows",   "ammo",   2.00,    3490, "arrows", "Arrows", 72],
  ["arrow-sunmetal", "Sunmetal Arrows",    "ammo",   2.40,    4150, "arrows", "Arrows", 90],
];

const round3 = (v) => Math.round(v * 1000) / 1000;

function wearable([id, name, slotId, mult, value, set, setName, level]) {
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) throw new Error(`${id}: unknown equipment slot "${slotId}"`);
  const acc = round3(slot.acc * mult);
  const hit = round3(slot.hit * mult);
  const eva = round3(slot.eva * mult);
  const dr = round3(slot.dr * mult);
  const mods = [];
  if (acc) mods.push(["accuracyPercent", acc, "combat"]);
  if (hit) mods.push(["maxHitPercent", hit, "combat"]);
  if (eva) mods.push(["evasionPercent", eva, "combat"]);
  if (dr) mods.push(["damageReduction", dr, "combat"]);
  const bits = [];
  if (acc) bits.push(`+${(acc * 100).toFixed(1)}% accuracy`);
  if (hit) bits.push(`+${(hit * 100).toFixed(1)}% max hit`);
  if (eva) bits.push(`+${(eva * 100).toFixed(1)}% evasion`);
  if (dr) bits.push(`+${(dr * 100).toFixed(1)}% damage reduction`);
  if (!mods.length) throw new Error(`${id}: grants nothing`);
  return {
    id, name, kind: "equipment", value,
    equip: { slot: slotId, set, setName, level, skill: slot.req, text: bits.join(", "), mods },
  };
}

/* =========================================================================
   4. PROVISIONS — the Furnace and the Pot

   The eight Cooking Fire grills stay in ../items/core.js where they were
   written; these ten are what the two new stations make. Every one of them
   has TWO OR MORE inputs, which matters: core.js's R3 holds a flat 2.4x
   markup across the SINGLE-input grills so no rung of the fish ladder is
   strictly dominant, and the selftest asserts it over exactly that filter.
   Composite dishes are outside that rule by construction, and they earn it —
   a Pot dish costs a crop as well as a catch, so it competes for the farm.

   BUT THEY ARE NOT OUTSIDE R4. The composite line is a real chain (a Hearty
   Stew is two Cooked Swordfish; a Ninefold Feast is six Hearty Stews and
   eight Cooked Aetherray), so its markup decays exactly the way the billet
   ladder's does: 4.00x on Thin Broth down to 1.39x on the Feast, monotone by
   level, twelve rungs. It used to end at 11.75x, which is what a chain looks
   like when nobody checks the shape.

   Healing per Cog still falls the length of the combined ladder: Cooked
   Minnow buys 13.3 HP a Cog and the Ninefold Feast buys 0.05. The expensive
   dish is bought for FEWER INTERRUPTIONS in a fight, never for efficiency.
   ========================================================================= */

/*  id  name  value  heal   composite markup over its basket  */
const PROVISIONS = [
  ["ration-broth",              "Thin Broth",         16,   120],  // 4.00x
  ["ration-hardtack",           "Hardtack",           70,   210],  // 5.83x farm shelf
  ["ration-stew",               "Root Stew",         165,   320],  // 3.67x
  ["ration-smoked-eel",         "Smoked Eel",        380,   470],  // 2.92x
  ["ration-chowder",            "Deepwater Chowder",  700,  760],  // 2.68x
  ["ration-loaf",               "Harvest Loaf",       300,  360],  // 5.26x farm shelf
  ["ration-deepstew",           "Veilroot Stew",     2300,  1450], // 2.58x
  ["ration-smoked-swordfish",   "Smoked Swordfish",  4600,  1800], // 2.35x
  ["ration-pie",                "Harvest Pie",       1050,  1250], // 4.38x farm shelf
  ["ration-smoked-aetherray",   "Smoked Aetherray",  4300,  2600], // 1.89x
];

/* =========================================================================
   BUILD
   ========================================================================= */

function buildItems() {
  const out = [];

  for (const [id, name, kind, value] of MATERIALS) out.push({ id, name, kind, value });

  for (const [id, name, value, seconds, mods, text] of POTIONS) {
    out.push({ id, name, kind: "potion", value, potion: { seconds, mods, text } });
  }

  for (const row of WEARABLES) out.push(wearable(row));

  /* Perfect variants are generated, never hand-listed — the same +50% value
     and +10% healing core.js applies, read from core.js so the two halves of
     the provision ladder can never disagree about what "flawless" is worth. */
  for (const [id, name, value, heal] of PROVISIONS) {
    out.push({ id, name, kind: "provision", value, heal });
    out.push({
      id: `perfect-${id}`,
      name: `Flawless ${name}`,
      kind: "provision",
      value: Math.round(value * (1 + PERFECT_VALUE_BONUS)),
      heal: Math.round(heal * (1 + PERFECT_HEAL_BONUS)),
      perfectOf: id,
    });
  }

  return out;
}

/** A flat array of item objects. ./index.js turns the modules into the map. */
export default buildItems();
