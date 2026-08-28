/* =========================================================================
   EMBERVEIL — SKILL: LARCENY   (the reference's §3h NPC/stun skill)

   One skill, one file. Edit this file to change Larceny and nothing else;
   register it in ./index.js.

   THE NAME. Parity §5 says "Thieving — unchanged, generic". §9 of
   melvor-math.md lists **Thieving** among the RuneScape coinages that may not
   appear in our game, and the selftest parses that list out of the document
   and scans every shipped string. The two rules contradict; §9 wins, because
   the suite is the thing that can actually fail. Larceny is the generic word
   for the same act and passes the "would a player who has never touched
   RuneScape know what it does" test.

   WHY THIS SKILL SITS WITH COMBAT
   -------------------------------
   It is the only non-combat skill that eats the HP bar. A failed lift STUNS
   you for three seconds and hits you for up to `maxHit`, drawn from the same
   pool of hit points a monster draws from, healed by the same food, and
   capable of the same death. Everything else in the game can be left running
   in a hidden tab; this cannot.

   THE MATH, all four numbers straight from the reference
   ------------------------------------------------------
     interval   3.0 s flat on every target (§4.3)
     stun       3.0 s on failure (§4.3)
     success    min(1, (100 + Stealth) / (100 + Perception))          (§7.5)
     stealth    Larceny level + this target's mastery level + modifiers (§2.4)

   Perception is fixed per target and cannot be reduced, so the ONLY ways to
   get better at a target are to level the skill and to master that target.
   Perception is set here so that every rung opens at almost exactly 50%
   success at its unlock level with mastery 1 — the reference's own "Success
   Rate: 49.05%" — and the top two rungs are pitched above the maximum
   reachable stealth of 198 (level 99 + mastery 99), so they stay permanently
   short of certain. §7.5 says some NPCs are meant to be impossible to
   perfect; without that, the last twenty levels of the skill buy nothing.

   THE COIN LADDER
   ---------------
   The reference measures its own tier-one NPC at ~29,000 GP/hr: 50 gp average
   at ~48% success on a 3 s action. Ours opens at 48 Cogs for exactly that
   figure, which makes Larceny 15-25x the first hour of any gathering skill —
   as it is in the reference, and for the same reason: it is the one early
   faucet you can die to. The ladder then climbs 25x to the top.

   And it climbs NON-MONOTONICALLY on purpose. The Watch Captain at level 80
   pays more than the Warden's Envoy at level 90 while the Envoy pays the best
   XP in the skill — the reference's own woodcutting trick, so that "the
   highest thing unlocked" is never automatically the right thing to do.

   THE HAULS
   ---------
   Every target also carries something. One haul item per area, dropped on
   `hauls` of successful lifts, which turns a pure-coin skill into one that
   feeds the bank and the sell button too. The item is the recipe's `produces`
   so the content validator can see it; the delivery is the Larceny system's
   (../../js/engine/systems/larceny.js), because a lift that fails produces
   nothing at all.
   ========================================================================= */

const LARCENY = {
  id: "larceny",
  name: "Larceny",
  /* `kind` picks the skill VIEW, and Larceny needs its own: perception,
     success rate, maximum hit, an HP bar and a stun toggle are not a
     gathering list. `route` is how it pays (Cogs, not a guaranteed item),
     which is what the content validator checks; the view is chosen by kind. */
  kind: "larceny",
  screen: "larceny",
  blurb: "Lifting what is not nailed down, from people who will hit you for it.",
  mastery: true,
  masteryActionTime: "actual",
  intervalMode: "flat",
  baseInterval: 3.0,

  /** §4.3 — three seconds of standing still, every time you are caught. */
  stunSeconds: 3.0,
  /** §7.5 — success = min(1, (100 + stealth) / (100 + perception)). */
  stealthBase: 100,
  /** §2.4 — "+1 stealth and +1% GP per mastery level" on that target. */
  stealthPerMastery: 1,
  currencyPerMastery: 0.01,

  /**
   * area       the grouping the §3h screen lists targets under
   * perception fixed; the only fixed number in the success formula
   * maxHit     damage roll is 1..maxHit, taken on a failed lift
   * cogs       average haul in Cogs, before mastery and modifiers
   * hauls      chance a success also yields the area's item
   */
  recipes: [
    { id: "lift-beggar",   name: "Beggar",           area: "Low Town",        level: 1,  xp: 18, perception: 104, maxHit: 24,  cogs: 48,    produces: "haul-frayed-purse",     hauls: 0.12 },
    { id: "lift-hawker",   name: "Street Hawker",    area: "Low Town",        level: 5,  xp: 22, perception: 112, maxHit: 33,  cogs: 62,    produces: "haul-frayed-purse",     hauls: 0.14 },
    { id: "lift-dockhand", name: "Dock Hand",        area: "Kiln Yards",      level: 10, xp: 27, perception: 122, maxHit: 44,  cogs: 82,    produces: "haul-ore-satchel",      hauls: 0.12 },
    { id: "lift-runner",   name: "Ore Runner",       area: "Kiln Yards",      level: 15, xp: 31, perception: 132, maxHit: 55,  cogs: 108,   produces: "haul-ore-satchel",      hauls: 0.14 },
    { id: "lift-merchant", name: "Ash Merchant",     area: "Ash Market",      level: 25, xp: 37, perception: 152, maxHit: 77,  cogs: 145,   produces: "haul-merchant-pouch",   hauls: 0.12 },
    { id: "lift-spicer",   name: "Spice Trader",     area: "Ash Market",      level: 30, xp: 42, perception: 162, maxHit: 88,  cogs: 190,   produces: "haul-merchant-pouch",   hauls: 0.14 },
    { id: "lift-ferryman", name: "Ferryman",         area: "The Long Quay",   level: 40, xp: 48, perception: 182, maxHit: 110, cogs: 250,   produces: "haul-sealed-manifest",  hauls: 0.12 },
    { id: "lift-clerk",    name: "Harbour Clerk",    area: "The Long Quay",   level: 45, xp: 52, perception: 192, maxHit: 121, cogs: 330,   produces: "haul-sealed-manifest",  hauls: 0.14 },
    { id: "lift-cupbearer",name: "Cupbearer",        area: "The Banquet Hall",level: 55, xp: 58, perception: 212, maxHit: 143, cogs: 430,   produces: "haul-silver-service",   hauls: 0.12 },
    { id: "lift-steward",  name: "House Steward",    area: "The Banquet Hall",level: 62, xp: 62, perception: 226, maxHit: 158, cogs: 560,   produces: "haul-silver-service",   hauls: 0.14 },
    { id: "lift-guard",    name: "Keep Guard",       area: "Emberwatch Keep", level: 70, xp: 66, perception: 242, maxHit: 176, cogs: 720,   produces: "haul-warden-signet",    hauls: 0.10 },
    /* The money rung: best Cogs in the skill, and four rungs out-XP it. */
    { id: "lift-captain",  name: "Watch Captain",    area: "Emberwatch Keep", level: 80, xp: 69, perception: 262, maxHit: 198, cogs: 1150,  produces: "haul-warden-signet",    hauls: 0.12 },
    /* The XP rung, and permanently short of certain: perception 282 against a
       maximum reachable stealth of 198 caps success at 78%. */
    { id: "lift-envoy",    name: "Envoy of the Keep",area: "Emberwatch Keep", level: 90, xp: 72, perception: 282, maxHit: 220, cogs: 940,   produces: "haul-warden-signet",    hauls: 0.14 },
  ],

  checkpoints: [
    { pct: 0.10, name: "Light Fingers", text: "+5% Larceny mastery XP",
      mods: [["masteryXP", 0.05, "skill"]] },
    /* The reference gives Thieving exactly this at 25% and nothing else. */
    { pct: 0.25, name: "Quick Hands",   text: "-0.2s Larceny interval",
      mods: [["intervalFlat", 0.2, "skill"]] },
    { pct: 0.50, name: "Fence Network", text: "+25% Cogs from Larceny",
      mods: [["currency", 0.25, "skill"]] },
    { pct: 0.95, name: "Ghost of the Quay", text: "+30 stealth, and +5% skill XP in ALL skills",
      mods: [["stealth", 30, "skill"], ["skillXP", 0.05, "global"]] },
  ],

  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+1 stealth and +1% Cogs per mastery level on this target" },
    { level: 20, text: "-4% interval on this target",   mods: [["intervalPercent", -0.04, "recipe"]] },
    /* §2.4's own worked example: -0.2s at mastery 50. */
    { level: 50, text: "-0.2s interval on this target", mods: [["intervalFlat", 0.2, "recipe"]] },
    { level: 65, text: "+10% Cogs from this target",    mods: [["currency", 0.10, "recipe"]] },
    { level: 85, text: "+8 stealth on this target",     mods: [["stealth", 8, "recipe"]] },
    { level: 95, text: "-6% interval on this target",   mods: [["intervalPercent", -0.06, "recipe"]] },
    { level: 99, text: "+25% Cogs from this target",    mods: [["currency", 0.25, "recipe"]] },
  ],
};

/** The §3h grouping: area name -> its targets, in level order. */
export const LARCENY_AREAS = (() => {
  const map = new Map();
  for (const r of LARCENY.recipes) {
    if (!map.has(r.area)) map.set(r.area, []);
    map.get(r.area).push(r);
  }
  return [...map].map(([name, targets]) => ({ name, targets, level: targets[0].level }));
})();

export default LARCENY;
