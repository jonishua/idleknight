/* =========================================================================
   EMBERVEIL — SKILL: DELVING

   One skill, one file. Edit this file to change DELVING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).
   ========================================================================= */

const DELVING = {
  id: "delving",
  name: "Mining",
  kind: "gather",
  blurb: "Breaking the Underveil open for ore, glass and the rarer griefs beneath.",
  mastery: true,
  masteryActionTime: "actual",
  intervalMode: "flat",
  baseInterval: 3.0,
  /* Depth in Delving comes from node HP and respawn, never from interval —
     which is why every vein takes exactly three seconds and the ladder is
     carried entirely by downtime. Mastery buys that downtime back:
     nodeHp = 5 + masteryLevel + boosts, regenerating 1 HP every 10 s. */
  node: { baseHp: 5, hpPerMastery: 1, regenSeconds: 10 },
  recipes: [
    { id: "vein-cinder-shale", name: "Copper Vein", level: 1,  xp: 7,  respawn: 5,   produces: "cinder-shale" },
    { id: "vein-palegrit",     name: "Tin Vein",     level: 15, xp: 13, respawn: 10,  produces: "palegrit" },
    { id: "vein-marrowstone",  name: "Iron Vein", level: 28, xp: 18, respawn: 12,  produces: "marrowstone" },
    { id: "vein-verdigris",    name: "Coal Seam",    level: 35, xp: 25, respawn: 15,  produces: "verdigris" },
    { id: "vein-slagbloom",    name: "Silver Vein",    level: 45, xp: 29, respawn: 18,  produces: "slagbloom" },
    { id: "vein-emberquartz",  name: "Gold Vein", level: 55, xp: 44, respawn: 25,  produces: "emberquartz" },
    { id: "vein-voidglass",    name: "Voidglass Fault",   level: 68, xp: 58, respawn: 35,  produces: "voidglass" },
    { id: "vein-sunmetal",     name: "Sunmetal Lode",     level: 78, xp: 70, respawn: 60,  produces: "sunmetal" },
    // The inversion. Five minutes of respawn for one 780-Cog stone.
    { id: "vein-wardens-tear", name: "Warden's Tear Pocket", level: 85, xp: 64, respawn: 300, produces: "wardens-tear" },
    { id: "vein-aetherite",    name: "Aetherite Column",  level: 95, xp: 78, respawn: 240, produces: "aetherite" },
  ],
  /* Aether Shards only ever arrive on a rare roll. Every Delving action gets
     one at 0.6%, which is the reference's sub-1%-to-3% surprise band, and it
     is the sole non-combat source of the currency Sigilwork runs on. */
  rareShards: { chance: 0.006, qty: [1, 2] },
  checkpoints: [
    { pct: 0.10, name: "Deepened Ear",    text: "+5% Mining mastery XP",       mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Settled Ground",  text: "-10% node respawn time",        mods: [["respawnPercent", -0.10, "skill"]] },
    { pct: 0.50, name: "Practised Swing", text: "-0.2s Mining interval",        mods: [["intervalFlat", 0.2, "skill"]] },
    { pct: 0.95, name: "Veinsight",       text: "+10 HP on every Mining node",  mods: [["nodeHp", 10, "skill"]] },
  ],
  masteryUnlocks: [
    { level: 1,  text: "Node HP is 5 + mastery level" },
    { level: 10, text: "+2 HP on this node",                 mods: [["nodeHp", 2, "recipe"]] },
    { level: 20, text: "-5% respawn on this node",           mods: [["respawnPercent", -0.05, "recipe"]] },
    { level: 50, text: "+3 HP on this node",                 mods: [["nodeHp", 3, "recipe"]] },
    { level: 65, text: "+4% chance to double this ore",      mods: [["doubleChance", 0.04, "recipe"]] },
    { level: 85, text: "-10% respawn on this node",          mods: [["respawnPercent", -0.10, "recipe"]] },
    { level: 95, text: "+10 HP on this node",                mods: [["nodeHp", 10, "recipe"]] },
    { level: 99, text: "+6% chance to double, +15% sale value", mods: [["doubleChance", 0.06, "recipe"], ["saleValue", 0.15, "recipe"]] },
  ],
};

export default DELVING;
