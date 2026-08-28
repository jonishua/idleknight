/* =========================================================================
   EMBERVEIL — CROPS, PLOTS AND COMPOST   (the Farming content table)

   Farming is one of the two PASSIVE skills: it has no "active action", it
   grows in the background while another skill holds the tick loop, and the
   only thing the player does to it is plant, compost and harvest.

   THREE CATEGORIES, THREE JOBS. This is the shape the parity bar records and
   it is the whole reason the skill is interesting:

       ALLOTMENTS  food.  Feeds Cooking and the provision ladder.
       HERBS       reagents.  The entire input side of Alchemy.
       TREES       experience.  Awful money, enormous XP, hours to grow.

   Every rung of every category is a real choice between those three, and the
   plots are a fixed, scarce resource, so "what do I put in the ground before
   I close the tab" is the actual decision the skill asks.

   TWENTY-FOUR CROPS, AND THAT NUMBER IS NOT ARBITRARY. The parity capture
   records Farming's mastery pool cap as 12,000,000, and §2.2 of the maths
   reference proves the rule `cap = 500,000 x recipeCount`. 12M / 500k = 24.
   Eight allotments, eight herbs, eight trees reproduces the real cap exactly,
   which is a far better reason to pick a content count than taste.

   GROW CHANCE AND COMPOST. A crop that finishes growing rolls once against
   its grow chance. Base is 50% — half of everything you plant dies — and
   compost is what buys that back, +10% per application to a maximum of five.
   The tension is real: the compost bill is flat while the yield climbs, so
   composting a Potato is a waste and composting Ironbark is mandatory. That
   crossover is the skill's economy.

   PLANTING COSTS COGS, NOT SEED ITEMS. The parity bar prices the bulk
   actions in GP (Plant All 5,000, Harvest All 2,000), and pricing the
   per-plot action the same way keeps one currency in one place instead of
   shipping twenty-four seed items that only exist to be spent. The bulk
   buttons are then exactly what they are in the reference: a convenience tax
   you pay on top of the seed price for not tapping eighteen times.

   ---------------------------------------------------------------------------
   THE YIELD RULE — WHY A BED IS MEASURED IN PLOT-HOURS
   ---------------------------------------------------------------------------
   A flat yield per category is the one thing this table must not have, and
   the reason is arithmetic rather than taste. Yield flat + grow time rising
   means output per plot-hour FALLS the length of the ladder: five potatoes
   an minute became five barley every twenty-five, and the level-99 farm
   supplied a third of what the level-10 farm did. A supply skill whose
   supply shrinks as you master it is not a supply skill.

   So the authored quantity is not the harvest, it is the RATE:

       yield  =  round( perPlotHour(category, rung) x growSeconds / 3600 )

   `perPlotHour` is what one bed delivers in an hour it stands, at 100% grow
   chance, and it RISES up the ladder — 1.12x per rung for allotments, 1.06x
   for herbs, 1.14x for trees. Grow time then only decides how the hour is
   parcelled up: a Potato bed hands you twelve every minute, a Barley bed 645
   every twenty-five, and the second bed is 2.2x the first per hour rather
   than a third of it.

   The absolute rates are set by the two skills that eat this table, measured
   through the real engine by tools/check-passive.mjs and not by eye:

       ALCHEMY eats 3-6 herbs every 2.5-4.5 s — 2,400 to 6,200 sprigs an hour
               from ONE bench. Herbs are therefore ~5x an allotment bed, and
               the herb row needs three beds inside the first ten levels.
       COOKING eats 1-3 crops every 7-8 s — 520 to 1,370 an hour.
       NOBODY  eats timber. Trees are the XP category and are priced like it.

   The gate that tool enforces: at every level tier, the whole row must
   out-supply the best consumer at that tier EVEN UNCOMPOSTED, at the bare
   50% grow chance. Composting is then surplus rather than survival.

   THE SEED RULE. A planting costs `SEED_SHARE` (35%) of what the bed is
   worth ripe, so the margin per cycle is a constant ~65% at 100% grow chance
   and a thin ~15% at 50%. Both the yield and the seed price are DERIVED from
   the ladder below; only value, level, grow time and XP are authored.
   ========================================================================= */

/* -------------------------------------------------------------------------
   THE CATEGORIES

   `masteryDivisor` is §2.1's farming rule: mastery XP action time is the
   HOURS the crop took to grow, times the quantity harvested, divided by 3
   for allotments and herbs and by 10 for trees. Trees grow for forty-five
   minutes, so without that divisor a single tree harvest would outweigh a
   day of allotments.
   ------------------------------------------------------------------------- */

export const CATEGORIES = [
  {
    id: "allotment",
    name: "Allotments",
    blurb: "Food. What the provision ladder is built out of.",
    /* R2's per-plot-hour ladder for this category: the first rung's rate and
       the step between rungs. See THE YIELD RULE above. */
    perPlotHour: { first: 700, step: 1.12 },
    /* §2.1's quantity term, in SEEDS PER BED rather than in leaves. */
    seedsPerBed: 5,
    masteryDivisor: 3,
    /* Plot 1 is free. The rest are a real sink, gated on level AND price. */
    plots: [
      { level: 1,  cost: 0 },
      { level: 5,  cost: 2_000 },
      { level: 15, cost: 10_000 },
      { level: 25, cost: 50_000 },
      { level: 35, cost: 200_000 },
      { level: 45, cost: 800_000 },
      { level: 55, cost: 3_000_000 },
      { level: 65, cost: 10_000_000 },
    ],
  },
  {
    id: "herb",
    name: "Herbs",
    blurb: "Reagents. Every potion in Alchemy starts in one of these beds.",
    /* Five times an allotment bed, because Alchemy eats three to six herbs
       every two and a half seconds and Cooking eats one crop every seven. */
    perPlotHour: { first: 4_000, step: 1.06 },
    seedsPerBed: 4,
    masteryDivisor: 3,
    /* EIGHT beds, three of them inside the first ten levels, and the first
       three priced at nothing / 1,000 / 6,000 so a level-10 farmer can
       actually own them. The herb row is the only bed count the consumer side
       dictates rather than taste: one Alchemy bench at level 10 eats 4,320
       sprigs an hour, and a farm that cannot field three beds by then can
       never keep it lit. The rest multiply 4-10x a step, which is §4's own
       unlock-ladder shape. */
    plots: [
      { level: 3,  cost: 0 },
      { level: 6,  cost: 1_000 },
      { level: 10, cost: 6_000 },
      { level: 22, cost: 60_000 },
      { level: 38, cost: 400_000 },
      { level: 55, cost: 2_200_000 },
      { level: 72, cost: 9_000_000 },
      { level: 88, cost: 35_000_000 },
    ],
  },
  {
    id: "tree",
    name: "Trees",
    blurb: "Experience. Hours in the ground, and the timber is almost a joke.",
    /* A fifth of an allotment bed and a twentieth of a herb row. Trees are
       the XP category; the timber is change found in a coat pocket. */
    perPlotHour: { first: 150, step: 1.14 },
    seedsPerBed: 6,
    masteryDivisor: 10,
    plots: [
      { level: 8,  cost: 0 },
      { level: 26, cost: 25_000 },
      { level: 50, cost: 400_000 },
      { level: 76, cost: 8_000_000 },
    ],
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/* -------------------------------------------------------------------------
   THE CROPS

   [ cropId, name, category, level, growSeconds, xpPerHarvest, itemValue ]

   Yield and seed price are DERIVED, not authored — see THE YIELD RULE and
   THE SEED RULE above. Only the seven columns a designer actually chooses
   are in the table, so a rung can never be internally inconsistent.

   Tree XP is deliberately an order of magnitude above the other two
   categories per harvest, and tree timber is deliberately worth a fraction
   of a herb. That is the whole "three categories, three jobs" claim made
   numerical.

   THE UNLOCK ORDER IS A CONTRACT, NOT A PREFERENCE. Every crop unlocks at or
   below the level of the FIRST recipe in the game that eats it. A Cooking
   recipe that needs a crop the farm cannot grow yet is a recipe the player
   must buy their way around, which is precisely the "Farming supplies
   nothing" failure this table exists to fix. tools/check-passive.mjs walks
   every skill in the database and fails if any crop is late. That constraint
   is why the allotment ladder tops out at 76 while the herb and tree ladders
   run to the low nineties — Cooking's last crop dish is level 78, and Barley
   has to be in the ground before it.
   ------------------------------------------------------------------------- */

const CROP_TABLE = [
  /* id                 name           cat          lvl  grow    xp   value */
  ["potato",           "Potato",       "allotment",   1,    60,     9,     2],
  ["chamomile",        "Chamomile",    "herb",        3,    90,    15,     1],
  ["onion",            "Onion",        "allotment",   5,   120,    20,     3],
  ["alder",            "Alder",        "tree",        8,   300,   150,     2],
  ["sage",             "Sage",         "herb",       12,   180,    32,     2],
  ["cabbage",          "Cabbage",      "allotment",  15,   240,    42,     4],
  ["rowan",            "Rowan",        "tree",       20,   600,   400,     3],
  ["wormwood",         "Wormwood",     "herb",       24,   330,    65,     3],
  ["tomato",           "Tomato",       "allotment",  26,   420,    78,     6],
  ["hazel",            "Hazel",        "tree",       34,   900,   900,     4],
  ["foxglove",         "Foxglove",     "herb",       38,   540,   120,     4],
  ["sweetcorn",        "Sweetcorn",    "allotment",  40,   600,   135,     9],
  ["beech",            "Beech",        "tree",       48,  1260,  1700,     6],
  ["strawberry",       "Strawberry",   "allotment",  48,   900,   210,    13],
  ["mandrake",         "Mandrake",     "herb",       52,   780,   200,     6],
  ["pumpkin",          "Pumpkin",      "allotment",  58,  1200,   310,    20],
  ["ash",              "Ash",          "tree",       62,  1680,  2900,     8],
  ["bloodroot",        "Bloodroot",    "herb",       66,  1080,   310,     8],
  ["hornbeam",         "Hornbeam",     "tree",       74,  2100,  4600,    11],
  ["barley",           "Barley",       "allotment",  76,  1500,   440,    30],
  ["nightbell",        "Nightbell",    "herb",       80,  1440,   460,    11],
  ["blackthorn",       "Blackthorn",   "tree",       85,  2520,  6800,    15],
  ["emberthistle",     "Emberthistle", "herb",       92,  1800,   640,    15],
  ["ironbark",         "Ironbark",     "tree",       95,  2700,  9000,    20],
];

/** The noun each category's product is called, and the item-id prefix. */
const PRODUCT = {
  allotment: { prefix: "crop",   suffix: "",         kind: "crop" },
  herb:      { prefix: "herb",   suffix: "",         kind: "herb" },
  tree:      { prefix: "timber", suffix: " Timber",  kind: "timber" },
};

/** Units a bed of this rung delivers per hour it stands, at 100% grow chance. */
export function perPlotHour(categoryId, rung) {
  const { first, step } = CATEGORY_BY_ID.get(categoryId).perPlotHour;
  return first * step ** rung;
}

/** Two significant figures, so a derived price still reads like a price. */
function tidy(n) {
  if (n <= 0) return 1;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.max(1, Math.round(n / mag) * mag);
}

/** THE SEED RULE: a planting costs 35% of what the bed will be worth ripe. */
export const SEED_SHARE = 0.35;

/* Rung index within the category, in level order — the ladder position every
   derived number is a function of. */
const RUNG = new Map();
{
  const seen = new Map();
  for (const [id, , cat] of CROP_TABLE) {
    const n = (seen.get(cat) ?? -1) + 1;
    seen.set(cat, n);
    RUNG.set(id, n);
  }
}

export const CROPS = CROP_TABLE.map(([id, name, cat, level, grow, xp, value]) => {
  const p = PRODUCT[cat];
  const rung = RUNG.get(id);
  const yieldPerHarvest = Math.round((perPlotHour(cat, rung) * grow) / 3600);
  return {
    id: `plant-${id}`,
    /* The item this crop yields. Piece-to-piece contract: Alchemy consumes
       `herb-*` by id and nothing else defines them. */
    itemId: `${p.prefix}-${id}`,
    itemName: `${name}${p.suffix}`,
    itemKind: p.kind,
    name,
    category: cat,
    rung,
    level,
    growSeconds: grow,
    xp,
    value,
    /* Units per plot-hour: the number the whole supply argument is made in. */
    perPlotHour: perPlotHour(cat, rung),
    yield: yieldPerHarvest,
    seedCost: tidy(SEED_SHARE * value * yieldPerHarvest),
  };
});

export const CROP_BY_ID = new Map(CROPS.map((c) => [c.id, c]));
export const CROPS_IN = (cat) => CROPS.filter((c) => c.category === cat);

/* -------------------------------------------------------------------------
   COMPOST

   Base grow chance is 50%. Five applications take it to 100%, +10% each.
   Compost is bought one application at a time; Emberloam fills all five in
   one go and is gated behind a shop unlock, so the second tier is a real
   progression step rather than a strictly better button from minute one.

   THE SEED RULE IS WHAT GIVES COMPOST ITS TEETH. A planting costs 35% of a
   ripe bed, so an uncomposted plot returns 0.50 x gross against a 0.35 x
   gross bill — a 15% margin — while a composted one returns the full 65%.
   Compost does not merely add yield; below 100% it is most of the profit.

   The bulk prices are the parity bar's own numbers, unchanged. They are a
   CONVENIENCE TAX and they are supposed to look slightly bad per plot: the
   reference charges 2,000 GP to save you eighteen taps, and so do we.
   ------------------------------------------------------------------------- */

export const GROW_CHANCE_BASE = 0.5;
export const COMPOST_PER_APPLICATION = 0.1;
export const COMPOST_MAX = 5;

export const COMPOST_TIERS = [
  {
    id: "compost",
    name: "Compost",
    applications: 1,
    cost: 80,
    unlock: null,
    text: "+10% chance to grow, one application",
  },
  {
    id: "emberloam",
    name: "Emberloam",
    applications: COMPOST_MAX,
    cost: 300,
    unlock: "farm-emberloam-vat",
    text: "Fills a plot's compost outright — 50% straight to 100%",
  },
];

export const COMPOST_BY_ID = new Map(COMPOST_TIERS.map((c) => [c.id, c]));

/** §3c of the parity bar, to the Cog. These five prices are not ours. */
export const BULK_ACTIONS = [
  { id: "harvest-all",  label: "Harvest All",                    cost: 2_000 },
  { id: "compost-all",  label: "Apply Compost to all Plots",     cost: 2_000 },
  { id: "emberloam-all",label: "Apply Emberloam to all Plots",   cost: 2_000, unlock: "farm-emberloam-vat" },
  { id: "plant-all",    label: "Plant All",                      cost: 5_000 },
  { id: "plant-selected", label: "Plant All Selected Crops",     cost: 5_000 },
];

/** Grow chance for a plot carrying `n` compost applications, 0.50 -> 1.00. */
export function growChance(applications) {
  const n = Math.max(0, Math.min(COMPOST_MAX, applications || 0));
  return GROW_CHANCE_BASE + COMPOST_PER_APPLICATION * n;
}

/** Every plot the player could ever own, in build order, flattened. */
export function plotSlots(categoryId) {
  return CATEGORY_BY_ID.get(categoryId).plots;
}

export default { CATEGORIES, CROPS, COMPOST_TIERS, BULK_ACTIONS, growChance };
