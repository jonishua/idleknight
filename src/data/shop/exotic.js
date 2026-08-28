/* =========================================================================
   EMBERVEIL — SHOP: THE EXOTIC WING  (Agility, Summoning, Astrology)

   Three ladders and four comforts.

   ---------------------------------------------------------------------------
   THE INTERVAL BUDGET, AND WHY THE COURSE KIT IS SHORTER THAN AN ARTISAN BENCH
   ---------------------------------------------------------------------------
   ../shop/ladder.js sells a three-step artisan bench at -5% / -5% / -10% for
   a flat -20% interval, and this shelf used to copy that shape three times.
   It cannot any more, and the reason is arithmetic rather than taste.

   `intervalPercent` is ONE additive bucket (§7.1) with ONE clamp
   (INTERVAL_REDUCTION_CAP = 0.50, §4.2). A mastered player is already
   carrying -0.20 of it globally from two waystations, and -0.36 once the
   Ascension Rites are bound. That leaves 0.14 of real room on any skill
   without a tool ladder of its own — and this wing's three skills are exactly
   those skills. So the Course Kit runs -4% / -4% / -5% for a total of -13%,
   which lands a fully bound, fully mastered Agility player on -0.49 against
   the -0.50 clamp: every point of it received, nothing sold twice.

   That ladder is the ONE interval source this entire wing ships. Nothing else
   in Agility, Summoning or Astrology — no obstacle, no familiar, no synergy,
   no constellation slot, no mastery unlock — writes `intervalPercent` at all,
   because the report at tools/check-exotic.mjs --caps shows there is nowhere
   for it to land. The other two ladders trade in uncapped buckets instead:
   Binding Chalk in `doubleChance`, Star Glass in `constellationPower`.

   NOTHING HERE CARRIES A GLOBAL MODIFIER, and that is a rule rather than an
   accident. The balance sandbox measures its "mastered" profile by granting
   every shop entry that is not a comfort, a relic or an Ascension Rite, so a
   global modifier sold here would silently move every measured number in
   every other skill in the game. Even the two wing-only modifier names
   (`markRate`, `constellationPower`) are scoped to the skill that reads them,
   so the rule holds with no exceptions to remember.

   Agility's real sink is not on this list at all: it is the obstacle build
   cost in ../obstacles.js, which runs from 500 Cogs to 250,000,000 and has to
   be paid again every time the course is reconfigured. The Course Kit and the
   Coursewright's Ledger are the only relief the player can buy from it.
   ========================================================================= */

/** [rankId, rank, level, step, cost] — the house three-step price shape. */
const RANKS = [
  ["guild",     "Guild",     20, 5_000],
  ["ascendant", "Ascendant", 55, 100_000],
  ["wardens",   "Warden's",  85, 1_500_000],
];

/**
 * One three-step ladder.
 * @param {string} skill
 * @param {string} noun   what the thing is called
 * @param {[string, number, number, number]} effect
 *        [modifier name, step 1, step 2, step 3] — the steps are signed the
 *        way the engine wants them, so an interval ladder passes negatives.
 * @param {(v:number)=>string} text  how the step reads on the shelf
 */
function ladder(skill, noun, [mod, ...steps], text) {
  return RANKS.map(([rankId, rank, level, cost], i) => ({
    id: `bench-${skill}-${rankId}`,
    name: `${rank} ${noun}`,
    category: "tool",
    skill,
    level,
    cost,
    requires: i === 0 ? null : `bench-${skill}-${RANKS[i - 1][0]}`,
    text: text(steps[i]),
    mods: [[mod, steps[i], skill]],
  }));
}

const pct = (v) => `${(Math.abs(v) * 100).toFixed(0)}%`;

const LADDERS = [
  /* The wing's only interval source. -4 / -4 / -5 = -13%; see the header. */
  ...ladder("agility", "Course Kit", ["intervalPercent", -0.04, -0.04, -0.05],
    (v) => `-${pct(v)} Agility interval`),
  /* Summoning is throttled by tablets, not by seconds, so its ladder buys
     tablets: a doubled craft is a doubled batch, and the batch is already
     `1 + 2 x mark level`. */
  ...ladder("summoning", "Binding Chalk", ["doubleChance", 0.05, 0.05, 0.10],
    (v) => `+${pct(v)} chance to double a tablet craft`),
  /* Astrology's throughput IS its modifier block, so its ladder raises every
     constellation percentage at once. `constellationPower` is read by
     src/js/engine/systems/astrology.js and by nothing else. */
  ...ladder("astrology", "Star Glass", ["constellationPower", 0.05, 0.05, 0.10],
    (v) => `+${pct(v)} to every constellation modifier`),
];

const COMFORTS = [
  {
    id: "mark-lantern", name: "Mark Lantern", category: "comfort", level: 1, cost: 2_000_000,
    text: "+25% mark discovery rate in every skill",
    /* Scoped to Summoning even though marks fall in every skill: the mark
       roll asks for `markRate` with the Summoning scope, so this is the same
       number with none of the leak into another skill's measured maths. */
    mods: [["markRate", 0.25, "summoning"]],
  },
  {
    id: "binding-rack", name: "Binding Rack", category: "comfort", level: 1, cost: 5_000_000,
    /* Was +10% preserve. Summoning's own mastery ladder already carries
       preservation into the fifties, so a flat extra tablet is both bigger
       and, unlike another slice of a nearly-full bucket, actually paid out. */
    text: "+1 tablet from every craft",
    mods: [["flatQuantity", 1, "summoning"]],
  },
  {
    id: "astral-chart", name: "Astral Chart", category: "comfort", level: 1, cost: 8_000_000,
    text: "+15% to every constellation modifier",
    mods: [["constellationPower", 0.15, "astrology"]],
  },
  {
    id: "course-ledger", name: "Coursewright's Ledger", category: "comfort", level: 1, cost: 12_000_000,
    text: "-15% obstacle build and material cost",
    mods: [["costReduction", 0.15, "agility"]],
  },
];

/** The shop-module contract in ./index.js: every shelf exports `ENTRIES`. */
export const ENTRIES = [...LADDERS, ...COMFORTS];
export const EXOTIC_SHOP = ENTRIES;

/** The three ladders, indexed the way ../shop.js indexes its own. */
export const EXOTIC_TOOL_LADDERS = {
  agility: LADDERS.slice(0, 3),
  summoning: LADDERS.slice(3, 6),
  astrology: LADDERS.slice(6, 9),
};

export default EXOTIC_SHOP;
