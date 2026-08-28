/* =========================================================================
   EMBERVEIL — SKILL: TRANSMUTATION   (parity §3i, §5 "Alt. Magic ->
   Transmutation")

   One skill, one file. Edit this file to change TRANSMUTATION and nothing
   else; register it in ./index.js.

   ---------------------------------------------------------------------------
   §3i, CLAUSE BY CLAUSE
   ---------------------------------------------------------------------------
     "Non-combat spellcasting"      every spell is an `artisan` recipe: it eats
                                    material, it eats runes, it makes an item.
     "rune costs"                   EMBERS ARE THE RUNES. Firemaking's output
                                    is worth 0 Cogs on purpose — burning
                                    destroys value — and that makes it the one
                                    material in the game that can be spent
                                    freely as a casting reagent without
                                    distorting a single price. Three tiers of
                                    ember are three tiers of rune.
     "Requires: 1 x, 1 x and: 1 x"  the reference prints the MATERIAL cost and
                                    the RUNE cost as two lists joined by
                                    "and:". `materials` and `runes` below are
                                    those two lists; `consumes` is what the
                                    engine actually takes and is built from
                                    them, so the two can never disagree.
     "Use Combination Runes"        a combination rune replaces several lower
                                    ones with a single higher one. Ours is
                                    `comboRunes`: one Bright or Void Ember in
                                    place of two or three Faint. The toggle
                                    swaps which list is live; where a spell
                                    has nothing to combine the toggle is inert,
                                    exactly as it is in the reference.
     "Cast", "2.00s"                every spell casts in 2.00 s flat. The rung
                                    changes what you cast, never how fast.
     "level-gated spell list"       thirteen spells, level 1 to 96.

   ---------------------------------------------------------------------------
   WHAT THE SPELLS ARE FOR
   ---------------------------------------------------------------------------
   Alt. Magic never invents an item — it moves material sideways through the
   ladders that already exist, which is why nothing in ../items/artisan.js
   belongs to this skill. Three families:

     SUPERHEAT   ore -> billet without the Smithing level, and without the
                 BILLET the Smithing recipe would have wanted. Smithing's
                 Voidglass Lens costs a Gold Bar; this costs six raw
                 Voidglass and three Void Embers. Smithing's Ninefold Ingot
                 costs two Aetherite Cores (eight ore and two alloy) at level
                 99; this costs six ore and three alloy at level 96. That is
                 the trade: Transmutation buys its way past the intermediate
                 rungs with fuel, and pays more raw material for the ones it
                 cannot skip.
     TRANSMUTE   material -> the material above it on the same ladder. Six
                 Copper Ore become a Coal; three Iron Ore become a Gold Ore.
                 Deliberately NOT reachable: the Warden's Tear. Its whole
                 design is that it is the richest ore in the game because it
                 sits behind a four-minute respawn (../items/core.js R2), and
                 a spell that manufactured one every two seconds would delete
                 that decision and, measurably, push the endgame Enchanting
                 loop straight through its own income ceiling.
     SUBLIMATE   twelve of a combat spoil -> one of the spoil above it. It
                 gives a player farming one monster tier something to do with
                 a drop they already have thousands of. Two rungs only, and
                 the ceiling is the Stormcrown Fragment: see the note on the
                 last Sublimate spell for why the ladder cannot climb past it
                 without out-earning the entire non-combat game.

   ---------------------------------------------------------------------------
   WHY IT CARRIES MASTERY WHEN THE REFERENCE'S ALT. MAGIC DOES NOT
   ---------------------------------------------------------------------------
   §2 of the parity doc is explicit that the universal header — including the
   mastery pool bar and its two buttons — opens EVERY non-combat skill page.
   Shipping the one skill in the game without a pool would leave that header
   half-drawn on exactly one screen. Mastery action time is the 2.00 s cast
   itself, so a spell masters at the rate it is cast.
   ========================================================================= */

/* Build one spell. `consumes` is materials ++ runes, in that order, so the
   view can slice it back apart at exactly `materials.length` and the engine
   never sees two lists. */
function spell({ id, name, category, level, xp, produces, materials, runes, comboRunes = null }) {
  return {
    id, name, category, level, xp, produces,
    interval: 2,
    materials,
    runes,
    comboRunes,
    /* What the engine consumes. The Transmutation view rewrites this in place
       when "Use Combination Runes" is toggled — the player has genuinely
       chosen a different reagent mix, and the tick loop reads the mix that is
       live at the moment the cast completes. */
    consumes: [...materials, ...runes],
  };
}

const TRANSMUTATION = {
  id: "transmutation",
  name: "Transmutation",
  kind: "artisan",
  blurb: "Spellwork that makes nothing new and moves everything sideways.",
  mastery: true,
  /* The cast IS the action, so mastery time is the cast time. */
  masteryActionTime: { fixed: 2 },
  intervalMode: "perRecipe",
  /* §3i is its own archetype: the view renders the spell picker, the two-part
     rune cost and the combination toggle instead of §3b's recipe rows. */
  archetype: "spellcasting",
  castSeconds: 2,
  comboToggle: {
    id: "combinationRunes",
    label: "Use Combination Runes",
    help: "Spend one higher ember in place of several lower ones.",
  },
  categories: [
    { id: "superheat", name: "Superheat", blurb: "Ore straight to billet, paid for in embers rather than in Smithing levels." },
    { id: "transmute", name: "Transmute", blurb: "One material into the material above it on its own ladder." },
    { id: "sublimate", name: "Sublimate", blurb: "Twelve of a combat spoil into one of the spoil above it." },
  ],
  recipes: [
    spell({ id: "tm-superheat-copper", name: "Superheat Copper", category: "superheat", level: 1, xp: 9, produces: "shalebrick",
      materials: [["cinder-shale", 2]], runes: [["ember-cinder", 1]] }),

    spell({ id: "tm-superheat-bronze", name: "Superheat Bronze", category: "superheat", level: 12, xp: 20, produces: "palegrit-billet",
      materials: [["palegrit", 2]], runes: [["ember-cinder", 2]], comboRunes: [["ember-bright", 1]] }),

    spell({ id: "tm-transmute-vein", name: "Transmute Vein", category: "transmute", level: 22, xp: 34, produces: "marrowstone",
      materials: [["cinder-shale", 3]], runes: [["ember-cinder", 2]], comboRunes: [["ember-bright", 1]] }),

    spell({ id: "tm-transmute-coal", name: "Transmute Coal", category: "transmute", level: 28, xp: 46, produces: "verdigris",
      materials: [["cinder-shale", 6]], runes: [["ember-cinder", 2]], comboRunes: [["ember-bright", 1]] }),

    spell({ id: "tm-superheat-steel", name: "Superheat Steel", category: "superheat", level: 33, xp: 58, produces: "marrow-billet",
      materials: [["marrowstone", 2], ["verdigris", 1]], runes: [["ember-cinder", 3]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-transmute-lode", name: "Transmute Lode", category: "transmute", level: 42, xp: 88, produces: "emberquartz",
      materials: [["marrowstone", 3]], runes: [["ember-bright", 2]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-superheat-silver", name: "Superheat Silver", category: "superheat", level: 48, xp: 115, produces: "slagbloom-billet",
      materials: [["slagbloom", 3]], runes: [["ember-bright", 2]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-superheat-gold", name: "Superheat Gold", category: "superheat", level: 58, xp: 168, produces: "emberquartz-core",
      materials: [["emberquartz", 2]], runes: [["ember-bright", 2]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-sublimate-cores", name: "Sublimate Cores", category: "sublimate", level: 66, xp: 235, produces: "rift-sliver",
      materials: [["hollow-core", 12]], runes: [["ember-bright", 2]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-superheat-sunmetal", name: "Superheat Sunmetal", category: "superheat", level: 74, xp: 320, produces: "sunmetal-plate",
      materials: [["sunmetal", 5]], runes: [["ember-bright", 3]], comboRunes: [["ember-void", 1]] }),

    spell({ id: "tm-superheat-voidglass", name: "Superheat Voidglass", category: "superheat", level: 80, xp: 400, produces: "voidglass-lens",
      materials: [["voidglass", 6]], runes: [["ember-void", 3]] }),

    /* WHERE THE SUBLIMATE LADDER STOPS, AND WHY IT IS NOT A CONTENT GAP.
       The spoil above a Stormcrown Fragment is a Riftbound Heart, worth
       1,350,000 Cogs off a drop that lands in under a second — 6.1 BILLION
       Cogs an hour on the sell button alone. R5 forces any recipe to beat
       selling its own inputs, so a spell that made one would have had to beat
       the 207M Cogs/hr of the ten Fragments it ate, and it did: 273M, the
       richest non-combat rung in the game by a factor of two. There is no
       price that fixes that, because the price of the output is not this
       file's to set. So the ladder ends one rung down and the level-96 slot
       goes to the Superheat family instead. */
    spell({ id: "tm-sublimate-slivers", name: "Sublimate Slivers", category: "sublimate", level: 88, xp: 540, produces: "stormcrown-shard",
      materials: [["rift-sliver", 12]], runes: [["ember-void", 3]] }),

    /* The thinnest margin in the skill (1.64x) and the clearest statement of
       what Superheat is FOR: Smithing's Ninefold Ingot needs two Aetherite
       Cores, which is eight Aetherite Ore and two Warden Alloy, plus level 99
       Smithing. This does it with six ore and three alloy — cheaper in ore,
       dearer in embers, and no Smithing level at all. */
    spell({ id: "tm-superheat-ninefold", name: "Superheat Ninefold", category: "superheat", level: 96, xp: 760, produces: "ninefold-ingot",
      materials: [["aetherite", 6], ["warden-alloy", 3]], runes: [["ember-void", 5]] }),
  ],
  checkpoints: [
    { pct: 0.10, name: "Clear Sight",   text: "+5% Transmutation mastery XP",           mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Held Word",     text: "+10% chance to preserve embers",         mods: [["preserveChance", 0.10, "skill"]] },
    /* The economy slot. A spell that produces an ore or a billet has no sale
       identity of its own, so the multiplier goes on the OUTPUT instead: one
       cast in eight makes a second copy. */
    { pct: 0.50, name: "Second Word",   text: "+12% chance to double the result of a cast", mods: [["doubleChance", 0.12, "skill"]] },
    /* See bowcraft.js's 95% note. Signed: the whole game levels faster and
       Transmutation itself stops paying as well for what it sells. */
    { pct: 0.95, name: "Transmutewise", text: "+6% skill XP in EVERY skill; -12% Cogs from Transmutation sales",
      mods: [["skillXP", 0.06, "global"], ["saleValue", -0.12, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+5% ember preserve on this spell",  mods: [["preserveChance", 0.05, "recipe"]] },
    { level: 20, text: "-5% interval on this spell",        mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+10% ember preserve on this spell", mods: [["preserveChance", 0.10, "recipe"]] },
    { level: 65, text: "+6% chance to double this cast",    mods: [["doubleChance", 0.06, "recipe"]] },
    { level: 85, text: "-8% interval on this spell",        mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+15% ember preserve on this spell", mods: [["preserveChance", 0.15, "recipe"]] },
    { level: 99, text: "+8% chance to double this cast",    mods: [["doubleChance", 0.08, "recipe"]] },
  ],
};

export default TRANSMUTATION;
