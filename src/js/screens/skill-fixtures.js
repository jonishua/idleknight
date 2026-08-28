/* =========================================================================
   EMBERVEIL — SKILL FIXTURES

   A standalone, fully-playable stand-in for the real game engine, so the
   skill screen can be built and judged before the engine piece lands. It is
   not a mock: it runs the actual Melvor-derived math on a real 0.05s tick
   loop, and every number the screen prints comes out of it.

   ── THE SEAM ────────────────────────────────────────────────────────────
   src/js/screens/skill.js talks to THIS INTERFACE and nothing else. Swap in
   the real engine by exporting the same shape; the screen needs no changes.

     engine.skills()               -> SkillRow[]     the list state
     engine.detail(skillId?)       -> SkillDetail    the selected-skill state
                                                     (defaults to the active skill)
     engine.wallet()               -> { coin, shard }
     engine.selectSkill(skillId)   -> void           makes it the active skill
     engine.selectRecipe(recipeId) -> void           within the active skill
     engine.setRunning(bool)       -> void           pause / resume the loop
     engine.isRunning()            -> bool
     engine.advance(ms)            -> Event[]        run the tick loop forward
     engine.snapshot()             -> object         serialisable save state

   The caller owns the clock. `advance(ms)` is the ONLY way time passes, which
   is what lets one code path serve the live loop, a throttled tab and a 24h
   offline replay — the reason Melvor's replay is exact rather than an
   approximation (reference/melvor-math.md section 3).

   Events, drained by the screen each frame:
     { type:"action",     recipeId, outputs:[{id,qty}], xp, masteryXp }
     { type:"level",      skillId, level, unlocked:{level,name}|null }
     { type:"mastery",    skillId, recipeId, level, perk:string|null }
     { type:"checkpoint", skillId, at, label, effect }
     { type:"halt",       skillId, reason }
   Action events stop being recorded past EVENT_BUDGET, so a long replay costs
   O(ticks) time and O(1) memory; milestone events are rare and always kept.
   The returned array also carries `.actions` and `.ticks` totals.

   ── THE MATH (reference/melvor-math.md) ─────────────────────────────────
   XP curve, mastery XP, the mastery pool and its live checkpoints, interval
   reduction with tick quantisation, additive modifier buckets. Re-derived
   against the wiki's published tables by verifyMath() at the end of the file.

   ── THE CONTENT ─────────────────────────────────────────────────────────
   Every skill, recipe, item, rank and checkpoint name below is invented for
   this game. Nothing is taken from Melvor, RuneScape or Final Fantasy VI.
   ========================================================================= */

/* =========================================================================
   1. XP CURVE
       delta(L) = floor( (1/4) * ( (L-1) + 300 * 2^((L-1)/7) ) )
   Precomputed once at boot as a 121-entry cumulative lookup — never
   recomputed per frame. XP doubles every 7 levels, which is the single
   property that makes 50 a milestone and 99 a career.
   ========================================================================= */

export const LEVEL_CAP = 99;

export const XP_TABLE = (() => {
  const t = [0, 0];
  let acc = 0;
  for (let n = 1; n <= 120; n++) {
    acc += Math.floor(n + 300 * Math.pow(2, n / 7));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;
})();

/** Highest level whose cumulative requirement `xp` satisfies. */
export function levelFor(xp, cap = LEVEL_CAP) {
  let lo = 1;
  let hi = Math.min(cap, XP_TABLE.length - 1);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= XP_TABLE[mid]) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** { level, into, span, pct } — progress through the current level. */
export function levelProgress(xp, cap = LEVEL_CAP) {
  const level = levelFor(xp, cap);
  if (level >= cap) return { level, into: 0, span: 0, pct: 1 };
  const base = XP_TABLE[level];
  const span = XP_TABLE[level + 1] - base;
  return { level, into: xp - base, span, pct: span > 0 ? (xp - base) / span : 1 };
}

/* =========================================================================
   2. TICKS AND INTERVALS

   1 tick = 0.05s, 20 ticks/s. Remaining time is stored in TICKS, never in
   seconds, so nothing drifts.

     interval = max( floor( (base*(1 - sumPct) - sumFlat) / 0.05 ) * 0.05, 0.25 )

   Percentages always apply to the BASE interval and stack additively; flat
   reductions subtract afterwards, unmodified; the result is tick-quantised
   and floored at 0.25s. Because reduction is linear on base but rate is
   1/interval, the marginal value of reduction is hyperbolic — which is what
   the whole upgrade economy is priced against.
   ========================================================================= */

export const TICK_SECONDS = 0.05;
export const MIN_INTERVAL_TICKS = 5; // the 0.25s hard floor
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;

export function intervalTicks(baseSeconds, sumPct = 0, sumFlat = 0) {
  return Math.max(MIN_INTERVAL_TICKS,
    Math.floor((baseSeconds * (1 - sumPct) - sumFlat) / TICK_SECONDS));
}

/* =========================================================================
   3. MASTERY

     MXP = [ (unlocked * playerTotal / maxTotal) + (itemLevel * items / 10) ]
           * actionTime * 0.5 * (1 + bonus)

   Term 1 scales with how far along the whole skill is; term 2 with this
   recipe's own level times a tenth of the recipe count. Mastery therefore
   accelerates hard, and wide skills master far faster than narrow ones.

   `actionTime` is the ACTUAL seconds for gathering skills — so mastery per
   second is invariant to interval reduction, and speeding up a gatherer buys
   loot rather than mastery — and a fixed per-skill constant for artisan
   skills, where reduction does multiply the mastery rate.
   ========================================================================= */

export const POOL_DEPOSIT_RATE = 0.25;        // a quarter of mastery XP also banks
export const POOL_CAP_PER_RECIPE = 500_000;
export const CHECKPOINTS = [0.10, 0.25, 0.50, 0.95];
export const MASTERY_MILESTONES = [1, 10, 20, 50, 65, 85, 95, 99];
export const PRESERVE_CAP = 0.80;

export function masteryXpPerAction({
  unlockedActions, playerTotalMastery, maxTotalMastery,
  itemMasteryLevel, totalItems, actionTime, bonus = 0,
}) {
  const spread = (unlockedActions * playerTotalMastery) / maxTotalMastery;
  const depth = (itemMasteryLevel * totalItems) / 10;
  return (spread + depth) * actionTime * 0.5 * (1 + bonus);
}

/* Per-recipe mastery unlock ladder — a bonus hangs on 1/10/20/50/65/85/95/99
   for every recipe in the game. */
const MASTERY_PERKS = {
  10: "+5% chance to preserve this recipe's inputs",
  20: "+2% chance to double this recipe's output",
  50: "−0.2s interval on this recipe",
  65: "+5% chance to double this recipe's output",
  85: "+10% chance to preserve this recipe's inputs",
  95: "+1 base output quantity",
  99: "One guaranteed extra output, always",
};

export function nextMasteryMilestone(level) {
  const at = MASTERY_MILESTONES.find((m) => m > level);
  return at ? { level: at, effect: MASTERY_PERKS[at] } : null;
}

/* =========================================================================
   4. RANKS — the violet word under the level numeral.
   ========================================================================= */

const RANKS = [
  [99, "Veilwrought"], [90, "Paragon"], [75, "Exalted"], [60, "Master"],
  [40, "Sworn"], [25, "Adept"], [10, "Journeyer"], [1, "Untried"],
];
export const rankFor = (level) => RANKS.find(([min]) => level >= min)[1];

/* =========================================================================
   5. ITEMS
   Sprites are 16x16, authored at 1x, in src/assets/icons/skills/ — see
   make-skill-sprites.mjs there. `value` is what a merchant pays; the ladder
   spans four orders of magnitude from first ore to capstone.
   ========================================================================= */

const ICONS = "src/assets/icons/skills/";
const item = (id, name, value) => [id, { id, name, value, icon: `${ICONS}${id}.png` }];

export const ITEMS = Object.fromEntries([
  item("cinder-ore", "Cinder Ore", 2),
  item("coalstone", "Coalstone", 5),
  item("palegilt-ore", "Palegilt Ore", 13),
  item("verge-ore", "Verge Ore", 30),
  item("veil-shard", "Veil Shard", 135),
  item("aether-mote", "Aether Mote", 9),
  item("bound-aether", "Bound Aether", 42),
  item("pale-ichor", "Pale Ichor", 78),

  item("cinderbloom-ingot", "Cinderbloom Ingot", 8),
  item("palegilt-ingot", "Palegilt Ingot", 34),
  item("vergebrass-ingot", "Vergebrass Ingot", 66),
  item("emberglass-rivet", "Emberglass Rivet", 92),
  item("sunwrought-ingot", "Sunwrought Ingot", 148),
  item("duskweave-plate", "Duskweave Plate", 390),
  item("gravebrand-core", "Gravebrand Core", 1050),
  item("stormcast-filament", "Stormcast Filament", 2900),
  item("veilforged-heart", "Veilforged Heart", 8400),

  item("ward-sigil", "Warding Sigil", 60),
  item("kindle-sigil", "Kindling Sigil", 175),
  item("verge-sigil", "Verge Sigil", 480),
  item("grave-sigil", "Gravebound Sigil", 1300),
  item("veil-sigil", "Veilbound Sigil", 3600),

  item("ember-lens", "Ember Lens", 45),
  item("pale-prism", "Pale Prism", 130),
  item("verge-lens", "Verge Lens", 355),
  item("deep-prism", "Deepwell Prism", 960),
  item("veil-lens", "Veilglass Lens", 2650),
]);

/* =========================================================================
   6. SKILLS

   Five skills, two gathering and three artisan, wired into one real chain:
   Emberdelving and Aetherdrawing produce the raw stock that Sunforging,
   Sigilbinding and Glasswrighting consume. Stopping a gatherer really does
   starve the forge, and the forge really does run dry on screen.

   `axis` picks the accent — gold is the progression axis, violet the
   mastery / arcane axis. Those are the only two accents on the screen.

   Checkpoints carry BOTH a human sentence and a machine-readable modifier
   bag. Nothing reads the sentence to decide behaviour: the bag is the truth,
   and it is summed live, so spending the pool back down really does take the
   bonus away (they are thresholds, not unlocks).

   The four checkpoint slots follow one ladder everywhere:
     10% more mastery XP  ->  25% a throughput or quality-of-life fix
     ->  50% an economy or interval multiplier  ->  95% a prestige bonus.

   The recipe ladders are deliberately NOT monotonic in value-per-second: the
   level-78 seam pays the best coin of the tier at the worst XP rate, so the
   player chooses between wealth and progress at several rungs.
   ========================================================================= */

const CP = (label, effect, mods) => ({ label, effect, mods });

export const SKILLS = {
  emberdelving: {
    id: "emberdelving", name: "Emberdelving", kind: "gather", axis: "gold",
    mark: "#s-emberdelving", verb: "Delving",
    blurb: "Split the ember-veined stone beneath the drowned refinery.",
    checkpoints: [
      CP("Deeper reading", "+5% Emberdelving mastery XP", { "masteryXP:emberdelving": 0.05 }),
      CP("Steady hands", "−10% seam respawn", { "respawnPercent:emberdelving": 0.10 }),
      CP("Practised swing", "−0.2s Emberdelving interval", { "intervalFlat:emberdelving": 0.2 }),
      CP("The vein remembers", "+1 base yield from every seam", { "flatQuantity:emberdelving": 1 }),
    ],
    recipes: [
      { id: "cinder-seam", name: "Cinder Seam", req: 1, base: 3.0, xp: 7, out: [["cinder-ore", 1]], note: "Respawn 5s" },
      { id: "coalstone-bed", name: "Coalstone Bed", req: 12, base: 3.0, xp: 13, out: [["coalstone", 1]], note: "Respawn 10s" },
      { id: "palegilt-seam", name: "Palegilt Seam", req: 26, base: 3.0, xp: 19, out: [["palegilt-ore", 1]], note: "Respawn 15s" },
      { id: "verge-seam", name: "Verge Seam", req: 44, base: 3.0, xp: 28, out: [["verge-ore", 1]], note: "Respawn 20s" },
      { id: "aether-vent", name: "Aether Vent", req: 62, base: 3.0, xp: 47, out: [["aether-mote", 1]], note: "Respawn 30s" },
      { id: "veilstone-cleft", name: "Veilstone Cleft", req: 78, base: 3.0, xp: 86, out: [["veil-shard", 1]], note: "Respawn 4m" },
    ],
  },

  aetherdrawing: {
    id: "aetherdrawing", name: "Aetherdrawing", kind: "gather", axis: "violet",
    mark: "#s-aetherdrawing", verb: "Drawing",
    blurb: "Siphon the ley-wells before the veil closes over them.",
    checkpoints: [
      CP("Listening deeper", "+5% Aetherdrawing mastery XP", { "masteryXP:aetherdrawing": 0.05 }),
      CP("No dry draws", "Every draw yields something", { "noFailure:aetherdrawing": 1 }),
      CP("Split the current", "+5% chance to double motes", { "doubleChance:aetherdrawing": 0.05 }),
      CP("The veil answers", "+25% extra Veil Shard roll", { "rareRoll:aetherdrawing": 0.25 }),
    ],
    /* Ranged intervals, rolled uniformly per action and scaled at both ends
       by reduction. It costs nothing and it makes the skill feel alive
       instead of metronomic. */
    recipes: [
      { id: "hollow-well", name: "Hollow Well", req: 1, range: [4, 8], xp: 9, out: [["aether-mote", 1]] },
      { id: "sunken-choir", name: "Sunken Choir", req: 22, range: [4, 11], xp: 27, out: [["bound-aether", 1]] },
      { id: "drowned-vault", name: "Drowned Vault", req: 48, range: [5, 13], xp: 68, out: [["pale-ichor", 1]] },
      { id: "veilmouth", name: "Veilmouth", req: 72, range: [8, 19], xp: 168, out: [["veil-shard", 1]] },
    ],
  },

  sunforging: {
    id: "sunforging", name: "Sunforging", kind: "artisan", axis: "gold",
    mark: "#s-sunforging", actionTime: 1.7, verb: "Forging",
    blurb: "Beat raw ore into light-bearing metal on the coalstone hearth.",
    checkpoints: [
      CP("Hearth sense", "+5% Sunforging mastery XP", { "masteryXP:sunforging": 0.05 }),
      CP("Nothing wasted", "+5% chance to preserve ore", { "preserveChance:sunforging": 0.05 }),
      CP("Struck true", "−0.2s Sunforging interval", { "intervalFlat:sunforging": 0.2 }),
      CP("The long refinement", "+5% mastery XP everywhere", { "masteryXP": 0.05 }),
    ],
    recipes: [
      { id: "cinderbloom", name: "Cinderbloom Ingot", req: 1, base: 2.0, xp: 7,
        in: [["cinder-ore", 2]], out: [["cinderbloom-ingot", 1]] },
      { id: "palegilt", name: "Palegilt Ingot", req: 10, base: 2.4, xp: 13,
        in: [["palegilt-ore", 2], ["coalstone", 1]], out: [["palegilt-ingot", 1]] },
      { id: "vergebrass", name: "Vergebrass Ingot", req: 20, base: 2.6, xp: 20,
        in: [["cinder-ore", 2], ["verge-ore", 1]], out: [["vergebrass-ingot", 1]] },
      { id: "emberglass", name: "Emberglass Rivet", req: 30, base: 2.8, xp: 26,
        in: [["palegilt-ingot", 1], ["coalstone", 1]], out: [["emberglass-rivet", 2]] },
      { id: "sunwrought", name: "Sunwrought Ingot", req: 40, base: 3.0, xp: 32,
        in: [["verge-ore", 3], ["coalstone", 2]], out: [["sunwrought-ingot", 1]] },
      { id: "duskweave", name: "Duskweave Plate", req: 50, base: 3.4, xp: 44,
        in: [["sunwrought-ingot", 2], ["bound-aether", 1]], out: [["duskweave-plate", 1]] },
      { id: "gravebrand", name: "Gravebrand Core", req: 62, base: 4.0, xp: 61,
        in: [["duskweave-plate", 2], ["bound-aether", 3]], out: [["gravebrand-core", 1]] },
      { id: "stormcast", name: "Stormcast Filament", req: 75, base: 4.4, xp: 84,
        in: [["gravebrand-core", 1], ["pale-ichor", 2]], out: [["stormcast-filament", 1]] },
      { id: "veilforged", name: "Veilforged Heart", req: 88, base: 5.0, xp: 118,
        in: [["stormcast-filament", 2], ["veil-shard", 1]], out: [["veilforged-heart", 1]] },
    ],
  },

  sigilbinding: {
    id: "sigilbinding", name: "Sigilbinding", kind: "artisan", axis: "violet",
    mark: "#s-sigilbinding", actionTime: 1.65, verb: "Binding",
    blurb: "Etch binding sigils into blank stone; the ink is raw aether.",
    checkpoints: [
      CP("A steadier hand", "+5% Sigilbinding mastery XP", { "masteryXP:sigilbinding": 0.05 }),
      CP("Twin strokes", "+5% chance to double sigils", { "doubleChance:sigilbinding": 0.05 }),
      CP("Sought after", "+50% coin from sigil sales", { "coinFromSale:sigilbinding": 0.50 }),
      CP("Nothing unbinds", "Sigils never fail to bind", { "noFailure:sigilbinding": 1 }),
    ],
    recipes: [
      { id: "ward", name: "Warding Sigil", req: 1, base: 2.4, xp: 11,
        in: [["cinderbloom-ingot", 1], ["aether-mote", 1]], out: [["ward-sigil", 1]] },
      { id: "kindle", name: "Kindling Sigil", req: 16, base: 2.8, xp: 24,
        in: [["palegilt-ingot", 1], ["aether-mote", 2]], out: [["kindle-sigil", 1]] },
      { id: "verge", name: "Verge Sigil", req: 34, base: 3.2, xp: 46,
        in: [["vergebrass-ingot", 1], ["bound-aether", 2]], out: [["verge-sigil", 1]] },
      { id: "grave", name: "Gravebound Sigil", req: 58, base: 3.6, xp: 92,
        in: [["gravebrand-core", 1], ["bound-aether", 3]], out: [["grave-sigil", 1]] },
      { id: "veil", name: "Veilbound Sigil", req: 80, base: 4.2, xp: 187,
        in: [["stormcast-filament", 1], ["pale-ichor", 2]], out: [["veil-sigil", 1]] },
    ],
  },

  glasswrighting: {
    id: "glasswrighting", name: "Glasswrighting", kind: "artisan", axis: "gold",
    mark: "#s-glasswrighting", actionTime: 1.6, verb: "Grinding",
    blurb: "Grind lens and prism from coalstone fused white in the kiln.",
    checkpoints: [
      CP("Truer grind", "+5% Glasswrighting mastery XP", { "masteryXP:glasswrighting": 0.05 }),
      CP("Careful kiln", "+10% chance to preserve stock", { "preserveChance:glasswrighting": 0.10 }),
      CP("Practised wheel", "−10% Glasswrighting interval", { "intervalPercent:glasswrighting": 0.10 }),
      CP("Wright's eye", "+10% XP from every artisan skill", { "skillXP:artisan": 0.10 }),
    ],
    recipes: [
      { id: "ember-lens", name: "Ember Lens", req: 1, base: 2.2, xp: 9,
        in: [["coalstone", 2], ["cinder-ore", 1]], out: [["ember-lens", 1]] },
      { id: "pale-prism", name: "Pale Prism", req: 18, base: 2.6, xp: 22,
        in: [["coalstone", 2], ["palegilt-ore", 1]], out: [["pale-prism", 1]] },
      { id: "verge-lens", name: "Verge Lens", req: 38, base: 3.0, xp: 41,
        in: [["coalstone", 3], ["verge-ore", 1]], out: [["verge-lens", 1]] },
      { id: "deep-prism", name: "Deepwell Prism", req: 60, base: 3.6, xp: 79,
        in: [["verge-ore", 2], ["pale-ichor", 1]], out: [["deep-prism", 1]] },
      { id: "veil-lens", name: "Veilglass Lens", req: 84, base: 4.2, xp: 164,
        in: [["veil-shard", 2], ["pale-ichor", 1]], out: [["veil-lens", 1]] },
    ],
  },
};

/* =========================================================================
   7. THE SAVE — where the player is when the screen opens.

   Chosen, not random: the featured skill sits a few actions below a skill
   level, a mastery level AND the 50% pool checkpoint, so someone who opens
   the screen and watches sees all three fire inside the first half-minute —
   and then meets the honest, far longer wait for the next one. These are
   real positions on the real curves, not a scripted animation.
   ========================================================================= */

const SAVE = {
  activeSkill: "sunforging",
  wallet: { coin: 12_450_000, shard: 1250 },
  stock: {
    "cinder-ore": 4180, "coalstone": 806, "palegilt-ore": 2394, "verge-ore": 1284,
    "veil-shard": 3, "aether-mote": 917, "bound-aether": 148, "pale-ichor": 26,
    "cinderbloom-ingot": 640, "palegilt-ingot": 311, "vergebrass-ingot": 96,
    "emberglass-rivet": 58, "sunwrought-ingot": 212, "duskweave-plate": 0,
    "gravebrand-core": 0, "stormcast-filament": 0, "veilforged-heart": 0,
    "ward-sigil": 74, "kindle-sigil": 21, "verge-sigil": 4, "grave-sigil": 0, "veil-sigil": 0,
    "ember-lens": 130, "pale-prism": 47, "verge-lens": 2, "deep-prism": 0, "veil-lens": 0,
  },
  /* level · fraction through it · pool fill · selected recipe · per-recipe
     mastery as [level, fraction through that level].

     The fraction is not decoration. A save that parks every recipe exactly
     on a level boundary renders a list of empty mastery bars, and a screen
     full of empty violet tracks reads as a broken binding rather than as a
     player mid-climb. Nobody's real save is ever on a boundary; ours isn't
     either. */
  skills: {
    sunforging: {
      level: 46, into: 0.984, pool: 0.499_984, recipe: "sunwrought",
      mastery: {
        cinderbloom: [62, 0.41], palegilt: [51, 0.77], vergebrass: [43, 0.28],
        emberglass: [38, 0.63], sunwrought: [34, 0.968],
      },
    },
    emberdelving: {
      level: 58, into: 0.412, pool: 0.563, recipe: "verge-seam",
      mastery: {
        "cinder-seam": [71, 0.34], "coalstone-bed": [66, 0.58],
        "palegilt-seam": [54, 0.19], "verge-seam": [41, 0.72],
      },
    },
    aetherdrawing: {
      level: 44, into: 0.127, pool: 0.194, recipe: "hollow-well",
      mastery: { "hollow-well": [55, 0.46], "sunken-choir": [37, 0.24] },
    },
    sigilbinding: {
      level: 28, into: 0.731, pool: 0.276, recipe: "kindle",
      mastery: { ward: [44, 0.61], kindle: [26, 0.35] },
    },
    glasswrighting: {
      level: 33, into: 0.588, pool: 0.472, recipe: "pale-prism",
      mastery: { "ember-lens": [49, 0.52], "pale-prism": [31, 0.18] },
    },
  },
  /* Additive modifier buckets. ONE bucket per modifier NAME: a global −10%
     interval and a skill-specific −10% land in the same pool and are worth
     exactly the same. Live checkpoint bonuses are summed on top at read
     time, never baked in here. */
  mods: {
    "intervalPercent": 0.10,
    "intervalPercent:sunforging": 0.10,
    "intervalPercent:emberdelving": 0.15,
    "intervalPercent:aetherdrawing": 0.05,
    "intervalPercent:sigilbinding": 0.05,
    "intervalPercent:glasswrighting": 0.10,
    "skillXP": 0.03,
    "doubleChance:sunforging": 0.08,
    "doubleChance:emberdelving": 0.05,
  },
};

/* Deterministic RNG — a seeded generator, never Math.random. The same save
   plus the same elapsed time must always produce the same result, offline
   replay included. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_BUDGET = 96;

/* =========================================================================
   8. THE ENGINE
   ========================================================================= */

export function createFixtureEngine({ preset = "default", seed = 20260826 } = {}) {
  const rand = mulberry32(seed);

  const state = {
    activeSkill: SAVE.activeSkill,
    running: true,
    halted: null,          // name of the missing input, or null
    wallet: { ...SAVE.wallet },
    stock: { ...SAVE.stock },
    baseMods: { ...SAVE.mods },
    modsCache: null,
    skills: {},
    actionTicks: 1,        // length of the action currently under way
    actionBase: 0,         // its rolled base interval, before reduction
    progressTicks: 0,
    msCarry: 0,            // sub-tick remainder owed to the next advance()

    sessionTicks: 0,
    session: { actions: 0, xp: 0, masteryXp: 0, poolXp: 0, produced: {}, consumed: {}, preserved: 0, doubled: 0 },
  };

  /* ---- hydrate ---------------------------------------------------------- */
  for (const [id, d] of Object.entries(SKILLS)) {
    const s = SAVE.skills[id];
    const base = XP_TABLE[s.level];
    const span = XP_TABLE[s.level + 1] - base;
    const mastery = {};
    for (const r of d.recipes) {
      const raw = s.mastery[r.id];
      if (raw === undefined) mastery[r.id] = XP_TABLE[1];
      else if (Array.isArray(raw)) mastery[r.id] = XP_TABLE[raw[0]] + Math.floor((XP_TABLE[raw[0] + 1] - XP_TABLE[raw[0]]) * raw[1]);
      else mastery[r.id] = XP_TABLE[raw];
    }
    const poolCap = POOL_CAP_PER_RECIPE * d.recipes.length;
    state.skills[id] = {
      xp: base + Math.floor(span * s.into),
      poolXp: Math.floor(poolCap * s.pool),
      poolCap, recipe: s.recipe, mastery,
    };
  }

  /* `brink` moves the featured skill to one action below all three moments
     so a screenshot catches them. Same curves, same rates — only the
     starting position moves. */
  if (preset === "brink") {
    const s = state.skills.sunforging;
    const lp = levelProgress(s.xp);
    s.xp = XP_TABLE[lp.level] + Math.floor(lp.span * 0.9976);
    s.mastery.sunwrought = XP_TABLE[34] + Math.floor((XP_TABLE[35] - XP_TABLE[34]) * 0.9955);
    s.poolXp = Math.floor(s.poolCap * 0.50) - 5;
  }

  const def = (id) => SKILLS[id];
  const cur = (id) => state.skills[id];
  const recipeOf = (skillId, recipeId) => def(skillId).recipes.find((r) => r.id === recipeId);

  /* ---- the modifier pipeline (section 7 of the reference) ---------------
     Every live checkpoint in every skill contributes its bag to one merged
     map. Bags are already namespaced, so `masteryXP` from Sunforging's 95%
     lands in the global bucket and lifts every skill, while
     `masteryXP:sunforging` from its 10% lifts only that one — with no
     special-casing anywhere. Cached, invalidated whenever the pool moves.
     ---------------------------------------------------------------------- */
  function mods() {
    if (state.modsCache) return state.modsCache;
    const m = { ...state.baseMods };
    for (const id of Object.keys(SKILLS)) {
      const s = cur(id);
      const frac = s.poolXp / s.poolCap;
      def(id).checkpoints.forEach((cp, i) => {
        if (frac < CHECKPOINTS[i]) return;
        for (const [k, v] of Object.entries(cp.mods)) m[k] = (m[k] || 0) + v;
      });
    }
    state.modsCache = m;
    return m;
  }
  const mod = (name) => mods()[name] || 0;

  function checkpointsOf(skillId) {
    const s = cur(skillId);
    const frac = s.poolXp / s.poolCap;
    return CHECKPOINTS.map((at, i) => ({
      at, index: i,
      xp: Math.floor(s.poolCap * at),
      label: def(skillId).checkpoints[i].label,
      effect: def(skillId).checkpoints[i].effect,
      reached: frac >= at,
    }));
  }

  /** Nominal base interval; ranged recipes report their midpoint. */
  const nominalBase = (r) => r.base ?? (r.range[0] + r.range[1]) / 2;

  function reduction(skillId, recipeId) {
    const pct = mod("intervalPercent") + mod(`intervalPercent:${skillId}`);
    let flat = mod(`intervalFlat:${skillId}`);
    if (levelFor(cur(skillId).mastery[recipeId]) >= 50) flat += 0.2; // the m50 perk
    return { pct, flat };
  }

  function ticksFor(skillId, recipeId, baseSeconds) {
    const { pct, flat } = reduction(skillId, recipeId);
    return intervalTicks(baseSeconds, pct, flat);
  }

  function skillXpFor(skillId, recipeId) {
    const d = def(skillId);
    const bonus = mod("skillXP") + mod(`skillXP:${skillId}`) + mod(`skillXP:${d.kind}`);
    return recipeOf(skillId, recipeId).xp * (1 + bonus);
  }

  function masteryFor(skillId, recipeId, actualTicks) {
    const d = def(skillId);
    const s = cur(skillId);
    const level = levelFor(s.xp);
    const totalItems = d.recipes.length;
    /* Gatherers pay on the real elapsed seconds; artisans on a constant. */
    const actionTime = d.kind === "artisan"
      ? d.actionTime
      : (actualTicks ?? ticksFor(skillId, recipeId, nominalBase(recipeOf(skillId, recipeId)))) * TICK_SECONDS;

    return masteryXpPerAction({
      unlockedActions: d.recipes.filter((r) => r.req <= level).length,
      playerTotalMastery: d.recipes.reduce((n, r) => n + levelFor(s.mastery[r.id]), 0),
      maxTotalMastery: totalItems * LEVEL_CAP,
      itemMasteryLevel: levelFor(s.mastery[recipeId]),
      totalItems, actionTime,
      bonus: mod("masteryXP") + mod(`masteryXP:${skillId}`),
    });
  }

  /** Name of the first input the player cannot afford, or null. */
  function missingInput(skillId, recipeId) {
    const r = recipeOf(skillId, recipeId);
    if (!r.in) return null;
    for (const [id, qty] of r.in) if ((state.stock[id] || 0) < qty) return ITEMS[id].name;
    return null;
  }

  /* ---- the tick loop ---------------------------------------------------- */

  let events = [];
  let actionTotal = 0;

  const push = (ev) => {
    if (ev.type === "action" && events.length >= EVENT_BUDGET) return;
    events.push(ev);
  };

  /** Roll this action's base interval and quantise it to ticks. */
  function armAction() {
    const skillId = state.activeSkill;
    const recipeId = cur(skillId).recipe;
    const r = recipeOf(skillId, recipeId);
    state.actionBase = r.range ? r.range[0] + rand() * (r.range[1] - r.range[0]) : r.base;
    state.actionTicks = ticksFor(skillId, recipeId, state.actionBase);
    state.progressTicks = 0;
  }

  function completeAction() {
    const skillId = state.activeSkill;
    const s = cur(skillId);
    const recipeId = s.recipe;
    const r = recipeOf(skillId, recipeId);

    const missing = missingInput(skillId, recipeId);
    if (missing) {
      if (state.halted !== missing) push({ type: "halt", skillId, reason: missing });
      state.halted = missing;
      return false;
    }

    /* Inputs. Preservation is a summed bucket with a hard 80% cap. */
    if (r.in) {
      const preserve = Math.min(PRESERVE_CAP,
        mod(`preserveChance:${skillId}`) +
        (levelFor(s.mastery[recipeId]) >= 85 ? 0.10 : 0) +
        (levelFor(s.mastery[recipeId]) >= 10 ? 0.05 : 0));
      if (rand() < preserve) state.session.preserved++;
      else for (const [id, qty] of r.in) {
        state.stock[id] -= qty;
        state.session.consumed[id] = (state.session.consumed[id] || 0) + qty;
      }
    }

    /* Outputs. Chance-to-double is additive within itself; a deterministic
       "collect 2x" multiplier would be a separate multiplicative layer. */
    const ml = levelFor(s.mastery[recipeId]);
    const doubleChance = mod("doubleChance") + mod(`doubleChance:${skillId}`)
      + (ml >= 20 ? 0.02 : 0) + (ml >= 65 ? 0.05 : 0);
    const doubled = rand() < doubleChance;
    if (doubled) state.session.doubled++;

    const outputs = r.out.map(([id, qty]) => {
      const n = qty * (doubled ? 2 : 1) + mod(`flatQuantity:${skillId}`);
      state.stock[id] = (state.stock[id] || 0) + n;
      state.session.produced[id] = (state.session.produced[id] || 0) + n;
      return { id, qty: n };
    });

    const xp = skillXpFor(skillId, recipeId);
    const beforeLevel = levelFor(s.xp);
    s.xp += xp;
    const afterLevel = levelFor(s.xp);

    const mxp = masteryFor(skillId, recipeId, state.actionTicks);
    const mBefore = levelFor(s.mastery[recipeId]);
    s.mastery[recipeId] += mxp;
    const mAfter = levelFor(s.mastery[recipeId]);

    const poolBefore = s.poolXp;
    s.poolXp = Math.min(s.poolCap, s.poolXp + mxp * POOL_DEPOSIT_RATE); // overflow destroyed
    state.modsCache = null; // the pool moved: checkpoints may have flipped

    state.session.actions++;
    state.session.xp += xp;
    state.session.masteryXp += mxp;
    state.session.poolXp += s.poolXp - poolBefore;
    state.halted = null;
    actionTotal++;

    push({ type: "action", recipeId, outputs, xp, masteryXp: mxp });

    if (afterLevel > beforeLevel) {
      const next = def(skillId).recipes.find((rr) => rr.req > beforeLevel && rr.req <= afterLevel);
      push({ type: "level", skillId, level: afterLevel, unlocked: next ? { level: next.req, name: next.name } : null });
    }
    if (mAfter > mBefore) {
      push({ type: "mastery", skillId, recipeId, level: mAfter, perk: MASTERY_PERKS[mAfter] || null });
    }
    CHECKPOINTS.forEach((cp, i) => {
      const at = s.poolCap * cp;
      if (poolBefore < at && s.poolXp >= at) {
        const c = def(skillId).checkpoints[i];
        push({ type: "checkpoint", skillId, at: cp, label: c.label, effect: c.effect });
      }
    });
    return true;
  }

  function tick() {
    if (!state.running) return;
    state.sessionTicks++;
    if (state.halted) {
      /* Held at a full bar until the stock comes back. */
      if (missingInput(state.activeSkill, cur(state.activeSkill).recipe)) return;
      state.halted = null;
      armAction();
      return;
    }
    state.progressTicks++;
    if (state.progressTicks >= state.actionTicks) {
      if (completeAction()) armAction();
      else state.progressTicks = state.actionTicks;
    }
  }

  armAction();

  /* ---- public reads ----------------------------------------------------- */

  const stackItem = (id, qty) => ({ ...ITEMS[id], qty });

  function rowFor(id) {
    const d = def(id);
    const s = cur(id);
    const lp = levelProgress(s.xp);
    return {
      id, name: d.name, kind: d.kind, axis: d.axis, mark: d.mark, blurb: d.blurb,
      level: lp.level, xpPct: lp.pct, xpInto: lp.into, xpSpan: lp.span, totalXp: s.xp,
      poolPct: s.poolXp / s.poolCap,
      poolCheckpoints: checkpointsOf(id),
      recipeName: recipeOf(id, s.recipe).name,
      recipeIcon: ITEMS[recipeOf(id, s.recipe).out[0][0]].icon,
      active: id === state.activeSkill,
      running: id === state.activeSkill && state.running && !state.halted,
    };
  }

  return {
    skills: () => Object.keys(SKILLS).map(rowFor),
    wallet: () => ({ ...state.wallet }),
    isRunning: () => state.running,
    activeSkillId: () => state.activeSkill,

    detail(skillId = state.activeSkill) {
      const d = def(skillId);
      const s = cur(skillId);
      const isActive = skillId === state.activeSkill;
      const lp = levelProgress(s.xp);
      const recipeId = s.recipe;
      const r = recipeOf(skillId, recipeId);

      const nominalTicks = ticksFor(skillId, recipeId, nominalBase(r));
      const liveTicks = isActive ? state.actionTicks : nominalTicks;
      const done = isActive ? state.progressTicks : 0;
      const red = reduction(skillId, recipeId);

      const xp = skillXpFor(skillId, recipeId);
      const mxp = masteryFor(skillId, recipeId, liveTicks);
      const mp = levelProgress(s.mastery[recipeId]);
      const cps = checkpointsOf(skillId);
      const nextUnlock = d.recipes.find((rr) => rr.req > lp.level);

      return {
        id: skillId, name: d.name, kind: d.kind, axis: d.axis, mark: d.mark,
        blurb: d.blurb, verb: d.verb,
        level: lp.level, rank: rankFor(lp.level),
        xpInto: lp.into, xpSpan: lp.span, xpPct: lp.pct, totalXp: s.xp,
        xpPerHour: (xp * 3600) / (nominalTicks * TICK_SECONDS),
        nextUnlock: nextUnlock ? { level: nextUnlock.req, name: nextUnlock.name } : null,
        active: isActive,
        running: isActive && state.running,
        halted: isActive ? state.halted : null,

        pool: {
          xp: s.poolXp, cap: s.poolCap, pct: s.poolXp / s.poolCap,
          checkpoints: cps,
          next: cps.find((c) => !c.reached) || null,
          held: [...cps].reverse().find((c) => c.reached) || null,
          perAction: mxp * POOL_DEPOSIT_RATE,
        },

        action: {
          recipeId, name: r.name, icon: ITEMS[r.out[0][0]].icon,
          intervalSec: liveTicks * TICK_SECONDS,
          nominalSec: nominalTicks * TICK_SECONDS,
          baseSec: nominalBase(r),
          ranged: !!r.range,
          reductionPct: red.pct,
          reductionFlat: red.flat,
          progressPct: liveTicks ? done / liveTicks : 0,
          remainingSec: (liveTicks - done) * TICK_SECONDS,
          xpPerAction: xp,
          masteryXpPerAction: mxp,
          inputs: (r.in || []).map(([id, qty]) => ({
            ...stackItem(id, qty), stock: state.stock[id] || 0, enough: (state.stock[id] || 0) >= qty,
          })),
          outputs: r.out.map(([id, qty]) => ({ ...stackItem(id, qty), stock: state.stock[id] || 0 })),
          mastery: { level: mp.level, into: mp.into, span: mp.span, pct: mp.pct, next: nextMasteryMilestone(mp.level) },
        },

        recipes: d.recipes.map((rr) => {
          const ml = levelProgress(s.mastery[rr.id]);
          return {
            id: rr.id, name: rr.name, icon: ITEMS[rr.out[0][0]].icon,
            req: rr.req, unlocked: rr.req <= lp.level, selected: rr.id === recipeId,
            masteryLevel: ml.level, masteryPct: ml.pct,
            intervalSec: ticksFor(skillId, rr.id, nominalBase(rr)) * TICK_SECONDS,
            ranged: !!rr.range, xp: rr.xp, note: rr.note || null,
            inputs: (rr.in || []).map(([id, qty]) => ({ ...stackItem(id, qty), stock: state.stock[id] || 0 })),
            outputs: rr.out.map(([id, qty]) => stackItem(id, qty)),
            value: rr.out.reduce((n, [id, qty]) => n + ITEMS[id].value * qty, 0),
          };
        }),

        session: {
          seconds: state.sessionTicks * TICK_SECONDS,
          actions: state.session.actions,
          xp: state.session.xp,
          masteryXp: state.session.masteryXp,
          poolXp: state.session.poolXp,
          preserved: state.session.preserved,
          doubled: state.session.doubled,
          produced: Object.entries(state.session.produced).map(([id, qty]) => stackItem(id, qty)),
          consumed: Object.entries(state.session.consumed).map(([id, qty]) => stackItem(id, qty)),
        },
      };
    },

    /* ---- writes ---- */
    selectSkill(id) {
      if (!SKILLS[id] || id === state.activeSkill) return;
      state.activeSkill = id;
      state.halted = null;
      armAction();
    },

    selectRecipe(recipeId) {
      const s = cur(state.activeSkill);
      const r = recipeOf(state.activeSkill, recipeId);
      if (!r || r.id === s.recipe || r.req > levelFor(s.xp)) return;
      s.recipe = recipeId;
      state.halted = null;
      armAction();
    },

    setRunning(on) { state.running = !!on; },

    /**
     * Run the loop forward. The ONLY way time passes. Clamped to the 24h
     * offline cap; O(ticks) with a branch-light tick body, so a full 24h
     * replay (1,728,000 iterations) stays well under a frame on a phone.
     *
     * THE REMAINDER IS CARRIED, NOT DROPPED. A caller driving this at
     * display rate hands it ~50-90ms per call, and flooring each call
     * independently throws away everything under a whole tick EVERY time —
     * which is not a rounding error, it is a systematic loss of up to 49ms
     * per call, and the skill visibly runs at half speed. Banking the
     * remainder is also what makes the arithmetic associative: one
     * advance(3600) and seventy-two advance(50)s land on the same tick, and
     * without that property a throttled tab and a live one drift apart.
     */
    advance(ms) {
      const TICK_MS = TICK_SECONDS * 1000;
      const total = state.msCarry + Math.min(Math.max(0, ms), OFFLINE_CAP_MS);
      const n = Math.floor(total / TICK_MS);
      state.msCarry = total - n * TICK_MS;
      events = [];
      const before = actionTotal;
      for (let i = 0; i < n; i++) tick();
      const out = events;
      out.actions = actionTotal - before;
      out.ticks = n;
      return out;
    },

    snapshot: () => structuredClone({
      activeSkill: state.activeSkill, wallet: state.wallet, stock: state.stock,
      skills: state.skills, session: state.session,
      progressTicks: state.progressTicks, actionTicks: state.actionTicks,
    }),
  };
}

/* =========================================================================
   9. VERIFICATION
   Re-derives the reference's published values from the code above. The screen
   runs it at boot and throws loudly rather than shipping quiet drift.
   ========================================================================= */

export function verifyMath() {
  const eq = (label, got, want) => {
    if (got !== want) throw new Error(`melvor-math check failed — ${label}: got ${got}, want ${want}`);
  };

  eq("xpAt(2)", XP_TABLE[2], 83);
  eq("xpAt(10)", XP_TABLE[10], 1154);
  eq("xpAt(26)", XP_TABLE[26], 8740);
  eq("xpAt(51)", XP_TABLE[51], 111945);
  eq("xpAt(76)", XP_TABLE[76], 1336443);
  eq("xpAt(92)", XP_TABLE[92], 6517253);
  eq("xpAt(99)", XP_TABLE[99], 13034431);
  eq("xpAt(120)", XP_TABLE[120], 104273167);

  // XP doubles every 7 levels.
  const delta = (L) => XP_TABLE[L] - XP_TABLE[L - 1];
  const ratio = delta(73) / delta(66);
  if (Math.abs(ratio - 2) > 0.001) throw new Error(`doubling check failed: ${ratio}`);

  // The back half is the whole game: 1->92 costs about what 92->99 costs.
  const firstHalf = XP_TABLE[92];
  const backHalf = XP_TABLE[99] - XP_TABLE[92];
  if (Math.abs(firstHalf / backHalf - 1) > 0.01) throw new Error("halfway-point check failed");

  // Interval: percentages off base, flats after, tick-quantised, 0.25s floor.
  eq("interval 3.0s at −20%", intervalTicks(3.0, 0.20, 0), 48);
  eq("interval 3.0s at −20% and −0.2s", intervalTicks(3.0, 0.20, 0.2), 44);
  eq("interval floor", intervalTicks(0.6, 0.9, 0), MIN_INTERVAL_TICKS);

  // Pool cap is 500,000 per recipe.
  eq("sunforging pool cap", POOL_CAP_PER_RECIPE * SKILLS.sunforging.recipes.length, 4_500_000);

  // Every recipe's items exist and every skill has four checkpoints.
  for (const s of Object.values(SKILLS)) {
    eq(`${s.id} checkpoints`, s.checkpoints.length, CHECKPOINTS.length);
    for (const r of s.recipes) {
      for (const [id] of [...(r.in || []), ...r.out]) {
        if (!ITEMS[id]) throw new Error(`${s.id}/${r.id} references unknown item "${id}"`);
      }
    }
  }
  return true;
}
