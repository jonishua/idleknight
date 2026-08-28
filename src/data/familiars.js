/* =========================================================================
   EMBERVEIL — SUMMONING FAMILIARS, MARKS AND SYNERGIES  (parity §3f)

   Twenty familiars. Each one is three things at once:

     A MARK   — a discovery that drops WHILE YOU TRAIN ANOTHER SKILL. The
                mark on the Stonewarden Mole only ever falls out of Mining;
                the mark on the Reef Lantern only ever falls out of Fishing.
                This is the one genuinely cross-cutting mechanic in the game:
                Summoning levels while you are not looking at Summoning.

     A TABLET — an artisan recipe that turns the mark into something you can
                equip. Marks run 1 to 5 and the mark level is the batch size:
                `1 + 2 x level` tablets a craft, so a level-five mark makes
                eleven at a time and a fresh one makes three.

     A PASSIVE— while equipped, a modifier on the skill it is marked in, paid
                for at ONE TABLET PER ACTION. Summoning is the only modifier
                source in Emberveil that is consumed as you use it.

   THREE RULES THE REFERENCE SPELLS OUT AND THIS FILE ENCODES
   ----------------------------------------------------------
     1. The first mark of a familiar must be CONVERTED INTO A TABLET before
        any more of that mark can drop. Discovery is fast; the second level
        is gated on you actually visiting the Summoning screen. It is the
        best onboarding rule in the reference and it costs nothing.
     2. Having a familiar EQUIPPED DOUBLES its own mark rate — so the way to
        deepen a mark is to spend the tablets you already made of it.
     3. Two equipped familiars can form a SYNERGY, a third modifier that
        neither of them grants alone.

   PRICES. A tablet is worth roughly four times the material it is made of,
   which keeps every rung comfortably clear of the R5 trap invariant in
   items.js while leaving Summoning throttled by Aether Shards exactly the
   way Enchanting is.

   WHICH BUCKETS A FAMILIAR IS ALLOWED TO PAY INTO
   -----------------------------------------------
   An equipped familiar costs a tablet per action, so its passive has to be
   worth paying for — which means it has to be RECEIVED. Four familiars and
   two synergies here used to sell `intervalPercent`, and none of them
   delivered: tools/check-exotic.mjs --caps shows a mastered player mid-action
   already at -0.75 of interval reduction on Woodcutting and -0.72 on Fishing,
   and -0.91 / -0.88 past the Ascension, against a -0.50 clamp. They now trade
   in `skillXP`, `doubleChance`, `masteryXP` and `currency`, which are
   uncapped, and in `preserveChance` only where the report proves there is
   room on the skill in question.

   The one exception is the Stormcrown Roc's `intervalFlat`: flat seconds are
   a different bucket with a different limit (§4.1's 0.25 s floor rather than
   the percentage clamp), the report checks it against that floor, and it is
   the only speed a familiar can still honestly sell.
   ========================================================================= */

/** Marks run 1..5. Level is the batch size of the tablet recipe. */
export const MARK_MAX_LEVEL = 5;

/**
 * The rate a mark deepens at, given the level it is already on. Each level
 * HALVES the chance, so the first sighting of a familiar is quick — a few
 * minutes of the associated skill — and filling a mark out to five is an
 * afternoon. Without the decay a mark caps in one hour flat and the deepest
 * reward in the skill is over before the player has read what it does.
 */
export const markChanceAt = (base, level) => base / 2 ** Math.max(0, level);

/** Tablets produced by one craft at a given mark level. Level 0 makes one. */
export const tabletsPerCraft = (markLevel) => 1 + 2 * Math.max(0, markLevel);

/** Familiars a player may have equipped at once. */
export const FAMILIAR_SLOTS = 2;

/**
 * id        familiar id; its tablet item is `tablet-<id minus the fam- prefix>`
 * name      shown everywhere
 * level     Summoning level to craft the tablet (and to discover the mark)
 * skill     the ASSOCIATED skill — the only skill this mark drops from
 * mark      per-action chance the mark deepens while training that skill
 * consumes  [itemId, qty] burnt per craft
 * shards    Aether Shards burnt per craft
 * value     Cogs one tablet sells for
 * xp        Summoning XP per craft
 * text      the equipped passive, as the player reads it
 * mods      the equipped passive, in engine vocabulary
 */
export const FAMILIARS = [
  {
    id: "fam-emberfly", name: "Emberfly", level: 1, skill: "emberrite", mark: 0.0050,
    consumes: [["palebirch", 4]], shards: 1, value: 24, xp: 25,
    text: "+5% Firemaking skill XP", mods: [["skillXP", 0.05, "emberrite"]],
  },
  {
    id: "fam-stone-mole", name: "Stonewarden Mole", level: 5, skill: "delving", mark: 0.0048,
    consumes: [["cinder-shale", 4]], shards: 1, value: 40, xp: 34,
    text: "+4% chance to double ore", mods: [["doubleChance", 0.04, "delving"]],
  },
  {
    id: "fam-branchling", name: "Branchling", level: 10, skill: "boughcraft", mark: 0.0045,
    consumes: [["ashen-elm", 3]], shards: 1, value: 60, xp: 46,
    text: "+5% chance to double logs", mods: [["doubleChance", 0.05, "boughcraft"]],
  },
  {
    id: "fam-tidewisp", name: "Tidewisp", level: 15, skill: "trawling", mark: 0.0042,
    consumes: [["silverfin", 6]], shards: 1, value: 45, xp: 60,
    text: "+5% chance to double the catch", mods: [["doubleChance", 0.05, "trawling"]],
  },
  {
    id: "fam-kiln-sprite", name: "Kiln Sprite", level: 20, skill: "kilnwork", mark: 0.0040,
    consumes: [["shalebrick", 4]], shards: 2, value: 130, xp: 78,
    text: "+6% chance to preserve Smithing inputs", mods: [["preserveChance", 0.06, "kilnwork"]],
  },
  {
    id: "fam-hearth-marten", name: "Hearth Marten", level: 25, skill: "hearthcraft", mark: 0.0038,
    consumes: [["ration-silverfin", 6]], shards: 2, value: 90, xp: 96,
    text: "+6% Cooking skill XP", mods: [["skillXP", 0.06, "hearthcraft"]],
  },
  {
    id: "fam-roadwarden-hound", name: "Roadwarden Hound", level: 30, skill: "wayfaring", mark: 0.0035,
    consumes: [["veilcedar", 5]], shards: 2, value: 200, xp: 118,
    text: "+8% Cogs from Exploration", mods: [["currency", 0.08, "wayfaring"]],
  },
  {
    id: "fam-glasswing-moth", name: "Glasswing Moth", level: 35, skill: "sigilwork", mark: 0.0033,
    consumes: [["palegrit-billet", 4]], shards: 3, value: 420, xp: 142,
    text: "+7% chance to preserve Aether Shards", mods: [["preserveChance", 0.07, "sigilwork"]],
  },
  {
    id: "fam-wayfinder-owl", name: "Wayfinder Owl", level: 40, skill: "agility", mark: 0.0031,
    consumes: [["marrowstone", 6]], shards: 3, value: 320, xp: 168,
    text: "+7% Agility skill XP", mods: [["skillXP", 0.07, "agility"]],
  },
  {
    id: "fam-star-hare", name: "Star Hare", level: 45, skill: "astrology", mark: 0.0029,
    consumes: [["verdigris", 5]], shards: 3, value: 520, xp: 196,
    text: "+8% Astrology skill XP", mods: [["skillXP", 0.08, "astrology"]],
  },
  {
    id: "fam-ashcat", name: "Ashcat", level: 50, skill: "attack", mark: 0.0027,
    consumes: [["marrow-billet", 3]], shards: 4, value: 1_150, xp: 228,
    text: "+6% accuracy rating", mods: [["accuracyPercent", 0.06, "combat"]],
  },
  {
    id: "fam-deepstone-golem", name: "Deepstone Golem", level: 55, skill: "delving", mark: 0.0025,
    consumes: [["slagbloom", 6]], shards: 4, value: 780, xp: 262,
    text: "+12 HP on every Mining node", mods: [["nodeHp", 12, "delving"]],
  },
  {
    id: "fam-fallow-elk", name: "Fallow Elk", level: 60, skill: "farming", mark: 0.0023,
    consumes: [["duskheart", 5]], shards: 4, value: 1_500, xp: 298,
    text: "+10% Farming skill XP", mods: [["skillXP", 0.10, "farming"]],
  },
  {
    id: "fam-reef-lantern", name: "Reef Lantern", level: 65, skill: "trawling", mark: 0.0022,
    consumes: [["ashray", 5]], shards: 5, value: 1_650, xp: 336,
    text: "+10% Fishing skill XP", mods: [["skillXP", 0.10, "trawling"]],
  },
  {
    id: "fam-cinder-salamander", name: "Cinder Salamander", level: 70, skill: "transmutation", mark: 0.0020,
    consumes: [["stormpine", 8]], shards: 5, value: 1_120, xp: 376,
    text: "+10% chance to double the cast", mods: [["doubleChance", 0.10, "transmutation"]],
  },
  {
    id: "fam-forge-beetle", name: "Forge Beetle", level: 75, skill: "kilnwork", mark: 0.0018,
    consumes: [["emberquartz-core", 2]], shards: 5, value: 2_600, xp: 418,
    text: "+8% chance to double the billet", mods: [["doubleChance", 0.08, "kilnwork"]],
  },
  {
    id: "fam-grave-moth", name: "Grave Moth", level: 80, skill: "strength", mark: 0.0017,
    consumes: [["voidglass-lens", 1]], shards: 6, value: 5_200, xp: 462,
    text: "+8% max hit", mods: [["maxHitPercent", 0.08, "combat"]],
  },
  {
    id: "fam-nightglass-ray", name: "Nightglass Ray", level: 85, skill: "crafting", mark: 0.0015,
    consumes: [["sunmetal-plate", 1]], shards: 6, value: 4_800, xp: 508,
    text: "+10% chance to double crafted items", mods: [["doubleChance", 0.10, "crafting"]],
  },
  {
    id: "fam-stormcrown-roc", name: "Stormcrown Roc", level: 90, skill: "ranged", mark: 0.0013,
    consumes: [["warden-alloy", 1]], shards: 7, value: 22_000, xp: 556,
    text: "-0.3s attack interval", mods: [["intervalFlat", 0.3, "combat"]],
  },
  {
    id: "fam-ninefold-sentinel", name: "Ninefold Sentinel", level: 95, skill: "agility", mark: 0.0012,
    consumes: [["aetherite-core", 1]], shards: 8, value: 42_000, xp: 606,
    text: "+30% Cogs from Agility", mods: [["currency", 0.30, "agility"]],
  },
];

export const FAMILIAR_BY_ID = new Map(FAMILIARS.map((f) => [f.id, f]));

/** The tablet item a familiar makes. */
export const tabletId = (famId) => `tablet-${famId.replace(/^fam-/, "")}`;
/** The recipe that makes it. */
export const craftId = (famId) => `craft-${famId.replace(/^fam-/, "")}`;

/** Which marks can drop while training a given skill. Precomputed: this map
 *  is read on the completion of EVERY action in the game, so it has to be a
 *  lookup and never a scan. */
export const MARKS_BY_SKILL = (() => {
  const m = new Map();
  for (const f of FAMILIARS) {
    if (!m.has(f.skill)) m.set(f.skill, []);
    m.get(f.skill).push(f);
  }
  return m;
})();

/* =========================================================================
   SYNERGIES

   A third modifier that neither familiar grants alone, live only while BOTH
   are equipped. Ten pairs, spread across the ladder so the first one is
   reachable at Summoning 15 and the last is an endgame goal.
   ========================================================================= */

export const SYNERGIES = [
  {
    pair: ["fam-emberfly", "fam-branchling"], name: "Ashfall",
    text: "+10% Firemaking skill XP", mods: [["skillXP", 0.10, "emberrite"]],
  },
  {
    pair: ["fam-stone-mole", "fam-tidewisp"], name: "Wet Stone",
    text: "+6% chance to double ore and catch",
    mods: [["doubleChance", 0.06, "delving"], ["doubleChance", 0.06, "trawling"]],
  },
  {
    pair: ["fam-kiln-sprite", "fam-hearth-marten"], name: "Banked Coals",
    text: "+8% chance to preserve Smithing and Cooking inputs",
    mods: [["preserveChance", 0.08, "kilnwork"], ["preserveChance", 0.08, "hearthcraft"]],
  },
  {
    pair: ["fam-roadwarden-hound", "fam-wayfinder-owl"], name: "The Short Way",
    text: "+15% Cogs from Exploration and Agility",
    mods: [["currency", 0.15, "wayfaring"], ["currency", 0.15, "agility"]],
  },
  {
    pair: ["fam-glasswing-moth", "fam-star-hare"], name: "Bound Light",
    text: "+8% Enchanting and Astrology mastery XP",
    mods: [["masteryXP", 0.08, "sigilwork"], ["masteryXP", 0.08, "astrology"]],
  },
  {
    pair: ["fam-ashcat", "fam-grave-moth"], name: "Cold Hunt",
    text: "+10% max hit and +10% accuracy",
    mods: [["maxHitPercent", 0.10, "combat"], ["accuracyPercent", 0.10, "combat"]],
  },
  {
    pair: ["fam-deepstone-golem", "fam-fallow-elk"], name: "Deep Roots",
    text: "+1 ore per action and +6% Farming skill XP",
    mods: [["flatQuantity", 1, "delving"], ["skillXP", 0.06, "farming"]],
  },
  {
    pair: ["fam-reef-lantern", "fam-cinder-salamander"], name: "Steam Vent",
    text: "+10% Fishing and Transmutation mastery XP",
    mods: [["masteryXP", 0.10, "trawling"], ["masteryXP", 0.10, "transmutation"]],
  },
  {
    pair: ["fam-forge-beetle", "fam-nightglass-ray"], name: "Cut Glass",
    text: "+6% chance to double items in ALL skills",
    mods: [["doubleChance", 0.06, "global"]],
  },
  {
    pair: ["fam-stormcrown-roc", "fam-ninefold-sentinel"], name: "The Ninefold Wing",
    text: "+8% chance to double items and +12% Cogs in ALL skills",
    mods: [["doubleChance", 0.08, "global"], ["currency", 0.12, "global"]],
  },
];

/** Look a synergy up from two equipped ids, in either order. */
export function synergyFor(a, b) {
  if (!a || !b) return null;
  return SYNERGIES.find((s) => (s.pair[0] === a && s.pair[1] === b) || (s.pair[0] === b && s.pair[1] === a)) || null;
}
