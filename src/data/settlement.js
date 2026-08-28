/* =========================================================================
   EMBERVEIL — THE SETTLEMENT   (the Township content table)

   The second passive skill, and the strangest thing in the game: a town that
   runs on its own clock in the background whether or not the player is on
   its screen, whether or not another skill is training, and whether or not
   the tab is open.

   FOUR THINGS MAKE IT WORK, and they are the same four the parity capture
   records off a live save:

     1. A ONE-TIME WORSHIP CHOICE, taken before anything can be built and
        changeable afterwards only for a very large fee. It is the only
        genuinely irreversible-feeling decision in the game.
     2. RESOURCE STOCKS, not an inventory. The town holds its own goods,
        capped by its own storage, and overflow is destroyed — the same
        shape as the mastery pool, and for the same reason: a cap you can
        actually hit is a cap that makes you build something.
     3. A SLOW TICK. One town tick every five minutes. Everything the town
        does happens on that tick and nowhere else, which is what makes a
        24 h offline replay cheap: 288 town ticks, not 1.7 million.
     4. A LABOUR CONSTRAINT. Buildings need workers; workers come from
        housing; housing needs food; food comes from buildings that need
        workers. The loop closes, so building the wrong thing genuinely
        starves the town instead of merely being suboptimal.

   ---------------------------------------------------------------------------
   NAMING
   ---------------------------------------------------------------------------
   The reference's six worships are five elemental deities plus None. Those
   five are its own invented proper nouns, so all five are replaced. Ours are
   named for the thing worshipped rather than for a god — The Deep, The Gale,
   The Rime, The Cinder, The Hollow — which reads in English, needs no lore
   dump, and belongs to this world rather than to anyone else's.
   ========================================================================= */

/* -------------------------------------------------------------------------
   THE CLOCK
   ------------------------------------------------------------------------- */

/** One town tick every five real minutes. 288 of them in a full day. */
export const TOWN_TICK_SECONDS = 300;

/** Changing worship after the fact. The reference charges 50M; so do we —
 *  against a mid-game income of 16-50M Cogs/hr that is one to three hours of
 *  play, which is the right weight for "I picked wrong forty hours ago". */
export const WORSHIP_CHANGE_COST = 50_000_000;

/** Every resource is capped. Base storage before any storehouse is built. */
export const BASE_STORAGE = 1_000;

/* -------------------------------------------------------------------------
   RESOURCES

   Eight, and every one of them is consumed by something. A resource nothing
   eats is a number on a screen.
   ------------------------------------------------------------------------- */

export const RESOURCES = [
  { id: "food",   name: "Food",   note: "Eaten by the population every tick." },
  { id: "timber", name: "Timber", note: "Cut by the logging camp, sawn into planks." },
  { id: "stone",  name: "Stone",  note: "Quarried. Every serious building wants it." },
  { id: "ore",    name: "Ore",    note: "Mined, then smelted." },
  { id: "coal",   name: "Coal",   note: "Mined alongside ore, burnt by the smelter." },
  { id: "planks", name: "Planks", note: "Sawn timber. The trading post's stock in trade." },
  { id: "bars",   name: "Bars",   note: "Smelted ore. The town hall is built out of them." },
  { id: "cloth",  name: "Cloth",  note: "Woven. Traded, and it keeps people happy." },
];

export const RESOURCE_IDS = RESOURCES.map((r) => r.id);
export const RESOURCE_BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));

/* -------------------------------------------------------------------------
   WORSHIP

   Six options including None, exactly as the capture records. Each gives one
   throughput bonus and one drawback, because §7.4's signed-modifier rule is
   the most interesting thing in the reference's design and a six-way choice
   with no downside is not a choice.

   `power` scales with accumulated worship points, which only a Shrine
   produces — so the choice is made on day one and only becomes load-bearing
   once the town is large enough to spare the labour for a shrine.
   ------------------------------------------------------------------------- */

export const WORSHIPS = [
  {
    id: "none",
    name: "None",
    text: "No patron. Nothing gained, nothing owed.",
    bonus: null,
    drawback: null,
  },
  {
    id: "deep",
    name: "The Deep",
    text: "What the ground gives up.",
    bonus: { stat: "production", scope: ["stone", "ore", "coal"], value: 0.20, text: "+20% stone, ore and coal" },
    drawback: { stat: "production", scope: ["food"], value: -0.10, text: "-10% food" },
  },
  {
    id: "gale",
    name: "The Gale",
    text: "Open roads and a following wind.",
    bonus: { stat: "trade", scope: null, value: 0.30, text: "+30% Cogs from trade" },
    drawback: { stat: "storage", scope: null, value: -0.10, text: "-10% storage" },
  },
  {
    id: "rime",
    name: "The Rime",
    text: "Cold keeps. Cold also kills.",
    bonus: { stat: "storage", scope: null, value: 0.35, text: "+35% storage" },
    drawback: { stat: "growth", scope: null, value: -0.15, text: "-15% population growth" },
  },
  {
    id: "cinder",
    name: "The Cinder",
    text: "Everything worth having comes out of a fire.",
    bonus: { stat: "production", scope: ["planks", "bars", "cloth"], value: 0.25, text: "+25% planks, bars and cloth" },
    drawback: { stat: "happiness", scope: null, value: -8, text: "-8 happiness" },
  },
  {
    id: "hollow",
    name: "The Hollow",
    text: "The veil is a teacher, if you can stand the lesson.",
    bonus: { stat: "xp", scope: null, value: 0.25, text: "+25% Settlement XP" },
    drawback: { stat: "production", scope: null, value: -0.08, text: "-8% all production" },
  },
];

export const WORSHIP_BY_ID = new Map(WORSHIPS.map((w) => [w.id, w]));

/* -------------------------------------------------------------------------
   BUILDINGS

   Twelve, level-gated across the whole 1-99 climb, each with:

     cost      Cogs plus materials the town produced itself. Every cost past
               the first two is paid in the town's OWN goods, which is what
               turns a resource screen into a build order.
     escalate  cost multiplier per copy already standing. 1.10 compounds to
               6.7x by the fiftieth copy — steep enough that the tenth
               cottage is a decision and the fiftieth is an ambition.
     workers   labour this copy needs. Total demand above the population
               scales EVERY building down; the town cannot out-build itself.
     produces  per town tick, per copy, at full efficiency.
     consumes  per town tick, per copy. A processing building that cannot
               get its inputs simply does not run that tick.
     provides  population capacity, storage, happiness, education, worship.
   ------------------------------------------------------------------------- */

export const BUILDINGS = [
  {
    id: "cottages", name: "Cottages", level: 1, max: 100, escalate: 1.10,
    blurb: "Where the workers live. Everything else is downstream of this.",
    cost: { cogs: 500, timber: 0, stone: 0 },
    workers: 0,
    provides: { population: 50, happiness: 1 },
    produces: {}, consumes: {},
  },
  {
    id: "farmland", name: "Farmland", level: 1, max: 80, escalate: 1.09,
    blurb: "Feeds the town. Build it first or watch everyone leave.",
    cost: { cogs: 400 },
    workers: 12,
    provides: {},
    produces: { food: 9 }, consumes: {},
  },
  {
    id: "logging-camp", name: "Logging Camp", level: 5, max: 60, escalate: 1.10,
    blurb: "Timber, which becomes planks, which become everything else.",
    cost: { cogs: 1_200, food: 60 },
    workers: 14,
    provides: {},
    produces: { timber: 7 }, consumes: {},
  },
  {
    id: "granary", name: "Granary", level: 10, max: 40, escalate: 1.12,
    blurb: "Storage. Overflow is destroyed, so this is not optional.",
    cost: { cogs: 3_000, timber: 120 },
    workers: 4,
    provides: { storage: 1_500 },
    produces: {}, consumes: {},
  },
  {
    id: "quarry", name: "Quarry", level: 16, max: 50, escalate: 1.10,
    blurb: "Stone, and a great deal of noise.",
    cost: { cogs: 6_000, timber: 200 },
    workers: 18,
    provides: { happiness: -1 },
    produces: { stone: 6 }, consumes: {},
  },
  {
    id: "sawmill", name: "Sawmill", level: 24, max: 40, escalate: 1.11,
    blurb: "Timber in, planks out. The town's first real processing chain.",
    cost: { cogs: 15_000, timber: 400, stone: 150 },
    workers: 16,
    provides: {},
    produces: { planks: 5 }, consumes: { timber: 8 },
  },
  {
    id: "mine", name: "Mine", level: 32, max: 45, escalate: 1.10,
    blurb: "Ore and coal, in the same shaft, at the same cost in backs.",
    cost: { cogs: 30_000, planks: 200, stone: 300 },
    workers: 22,
    provides: { happiness: -2 },
    produces: { ore: 6, coal: 4 }, consumes: {},
  },
  {
    id: "smelter", name: "Smelter", level: 40, max: 35, escalate: 1.11,
    blurb: "Ore and coal in, bars out. Hot, and worth it.",
    cost: { cogs: 80_000, planks: 400, stone: 500 },
    workers: 20,
    provides: { happiness: -2 },
    produces: { bars: 4 }, consumes: { ore: 7, coal: 5 },
  },
  {
    id: "weavers-hall", name: "Weaver's Hall", level: 50, max: 30, escalate: 1.11,
    blurb: "Cloth. Traded abroad, and quietly the reason anyone is happy.",
    cost: { cogs: 200_000, planks: 700, bars: 150 },
    workers: 18,
    provides: { happiness: 3 },
    produces: { cloth: 4 }, consumes: { food: 3 },
  },
  {
    id: "trading-post", name: "Trading Post", level: 58, max: 40, escalate: 1.12,
    blurb: "The only building that pays in Cogs, and it pays in goods.",
    cost: { cogs: 400_000, planks: 1_000, cloth: 200 },
    workers: 16,
    provides: {},
    produces: { cogs: 900 }, consumes: { planks: 6, cloth: 3 },
  },
  {
    id: "town-hall", name: "Town Hall", level: 68, max: 20, escalate: 1.15,
    blurb: "Records, schooling, and somewhere to put the surplus.",
    cost: { cogs: 1_500_000, bars: 800, stone: 2_000 },
    workers: 10,
    provides: { storage: 6_000, education: 4, happiness: 2 },
    produces: {}, consumes: { cogs: 200 },
  },
  {
    id: "shrine", name: "Shrine", level: 78, max: 25, escalate: 1.13,
    blurb: "Worship accrues here and nowhere else. Your patron starts paying.",
    cost: { cogs: 4_000_000, bars: 1_500, cloth: 800 },
    workers: 8,
    provides: { worship: 12, happiness: 4 },
    produces: {}, consumes: { food: 5 },
  },
];

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

/* -------------------------------------------------------------------------
   THE TOWN'S OWN MATHS

   All of it lives here rather than in the systems module, so the numbers a
   designer wants to change are in the content file and the loop that applies
   them is generic.
   ------------------------------------------------------------------------- */

/** Food eaten per town tick per head. 1,000 people eat 50 food a tick. */
export const FOOD_PER_HEAD = 0.05;

/** Population moves this fraction of the way to its target every tick, up
 *  or down. Slow enough that a bad build order costs real time to undo. */
export const GROWTH_RATE = 0.06;

/** Happiness starts here and is pushed around by buildings and by hunger. */
export const BASE_HAPPINESS = 50;

/**
 * Settlement XP for one town tick.
 *
 * Sub-linear in population (^0.85) so a town that has doubled is worth about
 * 1.8x, not 2x — the same diminishing shape the XP curve itself has. Tuned
 * so a fully built town of ~5,000 pays 15.5 XP/s, which caps the skill in
 * about 230 hours: the same 200-400 h arc every other skill is held to.
 */
export function xpForTick(population, education, worshipXpBonus = 0) {
  if (!(population > 0)) return 0;
  return 3 * Math.pow(population, 0.85) * (1 + 0.03 * education + worshipXpBonus);
}

/** Build cost for the (n+1)-th copy, with a signed cost-reduction applied. */
export function buildCost(building, owned, reduction = 0) {
  const mult = Math.pow(building.escalate, owned) * (1 - Math.min(0.8, reduction));
  const out = {};
  for (const [res, qty] of Object.entries(building.cost)) {
    out[res] = Math.max(1, Math.floor(qty * mult));
  }
  return out;
}

export default {
  TOWN_TICK_SECONDS, WORSHIP_CHANGE_COST, BASE_STORAGE,
  RESOURCES, WORSHIPS, BUILDINGS, xpForTick, buildCost,
};
