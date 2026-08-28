/* =========================================================================
   EMBERVEIL — ITEMS: THE CORE LADDERS

   ONE CONCERN, ONE FILE. This module owns the ores, boughs, catches, embers,
   billets, sigils, spoils and provisions that the eight founding skills make.
   It default-exports a flat array of item objects; ./index.js concatenates
   every module's array into the single registry the rest of the game reads.
   Adding items for a new skill means adding a FILE next to this one and one
   line to ./index.js — never editing this file.

   Every object in the world, with the price it sells for in Cogs.

   THE VALUE LADDER IS A DESIGN, NOT A LIST OF NUMBERS. Five rules govern
   every price in this file. Each one is asserted in the selftest against the
   numbers as shipped, because a stated rule nothing checks is decoration —
   and rule 5 caught a real trap recipe the first time it ran.

   R1 — RAW LADDERS climb a geometric mean of 1.5x-2.6x a tier and span 25x
        to 800x end to end. Not a constant ratio: the steps are uneven on
        purpose so that "the next tier" is sometimes a big jump and sometimes
        a shrug, which is what makes the player look at the numbers.

   R2 — EXACTLY ONE INVERSION per gathering skill: a tier whose value is far
        ahead of its own rung while its experience is far behind — and, in two
        skills, the mirror of that. This is the single best idea in the
        reference's own woodcutting ladder. It forces a real choice between
        wealth and levels several times per skill instead of "always take the
        highest thing unlocked".

   R3 — PROVISIONS carry a flat 2.4x markup over their catch, the length of
        the ladder. A constant is right here and nowhere else, because a
        provision exists to be cooked and eaten: a markup that moved with tier
        would make one rung strictly dominant and kill the other nine. The two
        composite recipes at the top break it upward, deliberately.

   R4 — BILLETS DO NOT get a flat markup. Theirs SHRINKS with chain depth,
        from 2.0x at the first rung to about 1.1x at the tenth. Markups
        compound: a flat 2.4x across a ten-deep chain would multiply the
        endgame faucet by 2.4^10, about 6,300x, and detonate the economy. A
        deep chain has to be paid for in value density per second of play, not
        in per-step markup. The report prints both.

   R5 — THE INVARIANT, and the only one that is really load-bearing:
        EVERY processing recipe must beat selling its own inputs, measured in
        Cogs per second of TOTAL play including the time to gather those
        inputs:

            craft    = value(output) / (ownSeconds + inputSeconds)
            sellRaw  = sum(value(inputs)) / inputSeconds

        If craft <= sellRaw the recipe is a trap, and a player who does the
        arithmetic will correctly refuse to play that part of the game.

   THE ONE DELIBERATE EXCEPTION. Emberrite's embers are worth 0 and always
   will be: burning a bough destroys its sale value outright. That is the
   point of the skill, and it is what makes its 50% pool checkpoint — which
   pays back a quarter of the bough's price in Cogs — the most interesting
   faucet in the game. Fuel recipes are exempt from R5 by name, not by
   accident, and the report says so.

   Currencies are not items: Cogs, Aether Shards and Warden Seals live on the
   save directly. Sigils are priced against Aether Shard income rather than
   against their billet, so their nominal margin (11x to 180x) is meaningless
   and only the sustained rate in the report means anything.
   ========================================================================= */


/**
 * kind:   ore | bough | catch | ember | billet | provision | sigil | spoil | token
 * value:  sale price in Cogs. 0 means "cannot be sold" (pure fuel).
 * heal:   HP restored when eaten (provisions only).
 */
const RAW = [
  /* --- Delving: what the Underveil gives up ---------------------------- */
  ["cinder-shale",  "Copper Ore",     "ore",   2],
  ["palegrit",      "Tin Ore",     "ore",   5],
  ["marrowstone",   "Iron Ore",      "ore",   13],
  ["verdigris",     "Coal",    "ore",   26],
  ["slagbloom",     "Silver Ore",    "ore",   32],
  ["emberquartz",   "Gold Ore",      "ore",   68],
  ["voidglass",     "Voidglass",        "ore",   92],
  ["sunmetal",      "Sunmetal Ore",     "ore",   105],
  // INVERSION: worth seven times the rung above it, pays the worst XP per
  // second in the skill, and sits behind a four-minute respawn.
  ["wardens-tear",  "Warden's Tear",    "ore",   780],
  ["aetherite",     "Aetherite Ore",    "ore",   140],

  /* --- Boughcraft: heartwood from the veilwoods ------------------------ */
  ["palebirch",     "Birch Logs",  "bough", 1],
  ["ashen-elm",     "Elm Logs",  "bough", 5],
  ["veilcedar",     "Cedar Logs",  "bough", 10],
  ["emberoak",      "Oak Logs",   "bough", 20],
  ["stormpine",     "Pine Logs",  "bough", 35],
  ["glasswillow",   "Willow Logs","bough", 50],
  ["duskheart",     "Duskheart Logs",  "bough", 75],
  // INVERSION A: the wealth rung. Best Cogs per second in the skill, worst XP.
  ["sunwood",       "Sunwood Logs",    "bough", 400],
  // INVERSION B: the mirror. Best XP per second in the skill, almost worthless.
  ["aetherwood",    "Aetherwood Logs", "bough", 25],

  /* --- Trawling: the drowned reaches ----------------------------------- */
  ["silverfin",     "Minnow",        "catch", 1],
  ["bogskate",      "Trout",         "catch", 19],
  ["glimmereel",    "Eel",       "catch", 65],
  ["ashray",        "Bass",           "catch", 82],
  ["voidmaw",       "Tuna",          "catch", 275],
  // INVERSION: the twelve-to-thirty-second cast. Enormous value, dreadful XP rate.
  ["tidewyrm",      "Swordfish",         "catch", 980],
  ["stormgar",      "Shark",         "catch", 480],
  ["aetherray",     "Aetherray",        "catch", 760],
  // The junk roll. Trawling's 25% checkpoint removes it entirely.
  ["tangleweed",    "Tangleweed",       "spoil", 0],

  /* --- Emberrite: boughs burned down to fuel ---------------------------
     Value 0 on purpose. Burning DESTROYS value — which is exactly why the
     skill's 50% pool checkpoint, which pays back a quarter of the bough's
     price in Cogs, is the most interesting faucet in the game. A processing
     skill converted into an income source by a mastery threshold. */
  ["ember-cinder",  "Faint Ember",     "ember", 0],
  ["ember-bright",  "Bright Ember",     "ember", 0],
  ["ember-void",    "Void Ember",       "ember", 0],

  /* --- Kilnwork: ore + ember -> billet ---------------------------------- */
  ["shalebrick",       "Copper Bar",         "billet", 8],
  ["palegrit-billet",  "Bronze Bar",    "billet", 26],
  ["marrow-billet",    "Steel Bar",      "billet", 96],
  ["slagbloom-billet", "Silver Bar",   "billet", 168],
  ["emberquartz-core", "Gold Bar",   "billet", 320],
  // Was 690, which made this the one TRAP recipe in the game: crafting a lens
  // paid 154 Cogs a second while simply selling its three Voidglass and one
  // Emberquartz Core paid 171. A player who did the arithmetic would correctly
  // skip a rung. Repriced so the craft beats the raw sale by 1.6x, in line with
  // its neighbours. The selftest now asserts this for every recipe in the game.
  ["voidglass-lens",   "Voidglass Lens",     "billet", 1250],
  ["sunmetal-plate",   "Sunmetal Plate",     "billet", 1150],
  ["warden-alloy",     "Warden Alloy",       "billet", 5400],
  ["aetherite-core",   "Aetherite Core",     "billet", 9800],
  ["ninefold-ingot",   "Ninefold Ingot",     "billet", 28000],

  /* --- Sigilwork: aether bound into a sigil ----------------------------
     Sigils are the late non-combat faucet, and they are deliberately NOT
     limited by their own interval — they are limited by Aether Shard income,
     which only ever arrives on sub-3% rare rolls. The balance report prints
     both the burst rate and the sustained rate for exactly that reason. */
  ["sigil-spark",   "Spark Sigil",     "sigil", 120],
  ["sigil-ward",    "Ward Sigil",   "sigil", 620],
  ["sigil-ember",   "Ember Sigil",     "sigil", 2400],
  ["sigil-tide",    "Tide Sigil",      "sigil", 8600],
  ["sigil-void",    "Void Sigil",      "sigil", 31000],
  ["sigil-storm",   "Storm Sigil",     "sigil", 112000],
  ["sigil-rift",    "Rift Sigil",      "sigil", 420000],
  ["sigil-ninefold","Ninefold Sigil",  "sigil", 1600000],

  /* --- Warding: what falls off the things in the veil ------------------- */
  ["veil-ash",       "Veil Ash",             "spoil", 14],
  ["hollow-core",    "Hollow Core",          "spoil", 240],
  ["rift-sliver",    "Rift Sliver",          "spoil", 5200],
  ["stormcrown-shard","Stormcrown Fragment", "spoil", 98000],
  ["riftbound-heart","Riftbound Heart",      "spoil", 1350000],
  ["ninefold-core",  "Ninefold Core",        "spoil", 21000000],
];

/* --- Hearthcraft provisions ----------------------------------------------
   Each cooked from a catch, at a flat 2.4x markup the length of the ladder
   (R3). Healing per Cog falls from 13.3 at the first rung to 0.05 at the
   last, which is the deliberate part: high-tier provisions are bought for
   FEWER INTERRUPTIONS during a fight, not for efficiency, and a player who
   only cares about Cogs per point healed should keep eating the cheap ones.

   A PERFECT result (a mastery-driven quality roll) sells for +50% and heals
   +10% — a quality roll used as a faucet multiplier, which is the cheapest
   good idea in the reference.
                                                    value   heal            */
const PROVISIONS = [
  ["ration-silverfin",  "Cooked Minnow",   3,       40],
  ["ration-bogskate",   "Cooked Trout",    46,      95],
  ["ration-glimmereel", "Cooked Eel",   158,     185],
  ["ration-ashray",     "Cooked Bass",       200,     260],
  ["ration-voidmaw",    "Cooked Tuna",       665,     420],
  ["ration-tidewyrm",   "Cooked Swordfish",     2350,    690],
  ["ration-stormgar",   "Cooked Shark",    1180,    840],
  ["ration-aetherray",  "Cooked Aetherray",  1850,    1120],
  ["ration-warding",    "Hearty Stew",     6900,    1900],
  ["ration-ninefold",   "Ninefold Feast",     78000,   3600],
];

/** Perfect variants are generated, never hand-listed: +50% value, +10% healing. */
export const PERFECT_VALUE_BONUS = 0.5;
export const PERFECT_HEAL_BONUS = 0.1;

function buildItems() {
  const out = [];
  for (const [id, name, kind, value] of RAW) out.push({ id, name, kind, value });

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
