/* =========================================================================
   EMBERVEIL — SKILL: ALCHEMY   (parity §3b, §5 "Herblore -> Alchemy")

   One skill, one file. Edit this file to change ALCHEMY and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   ---------------------------------------------------------------------------
   HERB + VIAL = POTION
   ---------------------------------------------------------------------------
   The reference's Herblore is a two-input skill and both inputs come from
   somewhere else, which is what makes it the most connected skill in the
   game. Ours keeps that exactly:

     THE HERB    from Farming's herb beds. `herb-*` ids are ../crops.js's
                 contract and are NOT defined here — one owner, one
                 definition. Eight herbs, eight potion families, and the herb
                 row is the most contested plot on the farm because of it.
     THE VESSEL  Alchemy's own. Pewter blown over a Faint Ember, and later
                 Voidglass over a Bright one. This is the one recipe in the
                 game that gives Firemaking's deliberately worthless output a
                 use outside a kiln.

   ---------------------------------------------------------------------------
   WHAT A POTION ACTUALLY DOES
   ---------------------------------------------------------------------------
   The modifiers a dose grants live on the ITEM, in ../items/artisan.js, in
   the same [name, value, scope] shape every other modifier source uses. The
   engine reads them through ../shop/artisan.js's effect records while a dose
   is live; the Alchemy view starts and stops them. Nothing about a potion is
   special-cased in the tick loop — a live dose is the same additive bucket
   (§7.1) a waystation or a checkpoint feeds.

   THREE OF THE TWELVE ARE SIGNED (§7.4). The Deft Hand line buys interval
   with skill XP and the Bounty Draught buys Cogs with mastery XP, because a
   potion shelf where every entry is strictly good is a shelf nobody reads.

   ---------------------------------------------------------------------------
   THE GREATER LINE
   ---------------------------------------------------------------------------
   Four families come back a second time at double the herbs, a stronger
   effect and a longer dose. That is the reference's own potion-tier idea and
   it is what keeps a level-30 herb worth farming at level 60.

   §2.1's fixed artisan mastery constant for this skill is 1.7 s.
   ========================================================================= */

const ALCHEMY = {
  id: "alchemy",
  name: "Alchemy",
  kind: "artisan",
  blurb: "Eight herbs, two vessels, and a shelf of things that wear off.",
  mastery: true,
  masteryActionTime: { fixed: 1.7 },
  intervalMode: "perRecipe",
  categories: [
    { id: "vessels", name: "Vessels", blurb: "Pewter and Voidglass, blown over an ember. Every potion needs one." },
    { id: "potions", name: "Potions", blurb: "One family per herb, four of them with a Greater dose." },
  ],
  recipes: [
    { id: "alch-vial-pewter",     name: "Pewter Vial",              category: "vessels", level: 1,  xp: 7,   interval: 2,   consumes: [["palegrit", 2], ["ember-cinder", 1]],                          produces: "vial-pewter" },
    { id: "alch-vigour",          name: "Vigour Potion",            category: "potions", level: 3,  xp: 12,  interval: 2.5, consumes: [["vial-pewter", 1], ["herb-chamomile", 3]],                     produces: "potion-vigour" },
    { id: "alch-keen",            name: "Keen Edge Potion",         category: "potions", level: 14, xp: 28,  interval: 2.5, consumes: [["vial-pewter", 1], ["herb-sage", 3]],                          produces: "potion-keen" },
    { id: "alch-deft",            name: "Deft Hand Potion",         category: "potions", level: 26, xp: 50,  interval: 3,   consumes: [["vial-pewter", 1], ["herb-wormwood", 3]],                      produces: "potion-deft" },
    { id: "alch-vigour-greater",  name: "Greater Vigour Potion",    category: "potions", level: 34, xp: 72,  interval: 3,   consumes: [["vial-pewter", 1], ["herb-wormwood", 6]],                      produces: "potion-vigour-greater" },
    { id: "alch-thrift",          name: "Thrift Potion",            category: "potions", level: 40, xp: 95,  interval: 3,   consumes: [["vial-pewter", 1], ["herb-foxglove", 3]],                      produces: "potion-thrift" },
    { id: "alch-keen-greater",    name: "Greater Keen Edge Potion", category: "potions", level: 48, xp: 130, interval: 3.5, consumes: [["vial-pewter", 1], ["herb-foxglove", 6]],                      produces: "potion-keen-greater" },
    { id: "alch-insight",         name: "Insight Potion",           category: "potions", level: 54, xp: 165, interval: 3.5, consumes: [["vial-pewter", 1], ["herb-mandrake", 3]],                      produces: "potion-insight" },
    { id: "alch-vial-voidglass",  name: "Voidglass Phial",          category: "vessels", level: 60, xp: 200, interval: 3,   consumes: [["voidglass", 2], ["ember-bright", 1]],                         produces: "vial-voidglass" },
    { id: "alch-deft-greater",    name: "Greater Deft Hand Potion", category: "potions", level: 62, xp: 225, interval: 3.5, consumes: [["vial-pewter", 1], ["herb-mandrake", 6]],                      produces: "potion-deft-greater" },
    { id: "alch-bounty",          name: "Bounty Draught",           category: "potions", level: 68, xp: 300, interval: 4,   consumes: [["vial-voidglass", 1], ["herb-bloodroot", 3]],                  produces: "potion-bounty" },
    { id: "alch-thrift-greater",  name: "Greater Thrift Potion",    category: "potions", level: 76, xp: 390, interval: 4,   consumes: [["vial-voidglass", 1], ["herb-bloodroot", 6]],                  produces: "potion-thrift-greater" },
    { id: "alch-warden",          name: "Warden's Draught",         category: "potions", level: 82, xp: 480, interval: 4,   consumes: [["vial-voidglass", 1], ["herb-nightbell", 3]],                  produces: "potion-warden" },
    /* The one potion whose price is set by an INGREDIENT rather than by its
       dose, and therefore the one rung of this shelf R4 has an opinion about:
       two Cut Riftstones hold it to 1.92x, the thinnest margin in the skill,
       so the shelf still opens fat (2.60x on a Pewter Vial) and closes thin. */
    { id: "alch-ninefold",        name: "Ninefold Elixir",          category: "potions", level: 94, xp: 720, interval: 4.5, consumes: [["vial-voidglass", 1], ["herb-emberthistle", 3], ["gem-rift", 2]], produces: "potion-ninefold" },
  ],
  checkpoints: [
    { pct: 0.10, name: "Clean Bench",   text: "+5% Alchemy mastery XP",                mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Careful Pour",  text: "+10% chance to preserve herbs",         mods: [["preserveChance", 0.10, "skill"]] },
    { pct: 0.50, name: "Apothecary",    text: "+50% Cogs from potion sales",           mods: [["saleValue", 0.5, "skill"]] },
    /* The prestige slot spends itself on the thing the whole shelf exists
       for: every dose you drink lasts longer. It is read by the Alchemy view
       when a potion is started, not by the tick loop. */
    { pct: 0.95, name: "Long Draught",  text: "+50% duration on every potion you drink", mods: [["potionDuration", 0.5, "global"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+4% herb preserve on this recipe",   mods: [["preserveChance", 0.04, "recipe"]] },
    { level: 20, text: "-5% interval on this recipe",        mods: [["intervalPercent", -0.05, "recipe"]] },
    { level: 50, text: "+8% herb preserve on this recipe",   mods: [["preserveChance", 0.08, "recipe"]] },
    { level: 65, text: "+5% chance to double this batch",    mods: [["doubleChance", 0.05, "recipe"]] },
    { level: 85, text: "-8% interval on this recipe",        mods: [["intervalPercent", -0.08, "recipe"]] },
    { level: 95, text: "+14% herb preserve on this recipe",  mods: [["preserveChance", 0.14, "recipe"]] },
    { level: 99, text: "+25% duration on this potion",       mods: [["potionDuration", 0.25, "recipe"]] },
  ],
};

export default ALCHEMY;
