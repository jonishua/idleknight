/* =========================================================================
   EMBERVEIL — WARDEN CODEX DATA

   Standalone. This module owns the roster, the economy and the progression
   maths for the Wardens screen; the view imports it and nothing else.

   THE MATHS ARE MELVOR'S, THE WORDS ARE OURS.
   Everything numeric below is traceable to reference/melvor-math.md:

     §1.1  the exact cumulative XP table — a Warden's Bond level is a
           per-recipe MASTERY level, 1-99, on that same table.
     §2.2  the mastery pool: 25% of every point of bond XP is *also*
           deposited, the pool is spent 1:1 to push a level, and the cap is
           a flat multiple of the roster size.
     §2.3  live checkpoints at 10 / 25 / 50 / 95% — thresholds, not unlocks.
           Spend back below one and the bonus goes away until you re-earn it.
           Checkpoint ladder shape: more XP -> a throughput fix -> an economy
           multiplier -> a prestige bonus.
     §2.4  per-recipe unlocks land on the 1 / 10 / 20 / 50 / 65 / 85 / 95 / 99
           ladder. Our ascension rungs sit on it.
     §5    faucet magnitudes: 1M is the "arrived in the midgame" price point.
     §6.1  sink shape: the first step is affordable inside two minutes, the
           curve is smooth rather than stepped, and it self-limits.
     §7    the modifier pipeline: one summed bucket per named family, and
           the strongest sources carry real, signed drawbacks (§7.4).
     §7.5  the signature "surprise" rates live in the sub-1%-to-3% band.

   Nothing here is borrowed from Melvor's *content*. Every name, creature,
   epithet, skill and currency in this file is invented for Emberveil.
   ========================================================================= */

/* =========================================================================
   1. THE XP TABLE  (melvor-math §1.1)

   delta(L)  = floor( (1/4) * ( (L-1) + 300 * 2^((L-1)/7) ) )
   xpAt(L)   = floor( (1/4) * SUM(n = 1..L-1) floor( n + 300 * 2^(n/7) ) )

   Note the two floors sit in different places. Precomputed once at boot,
   never per frame. XP_TABLE[99] === 13034431 — asserted below, because a
   silently-wrong curve is the worst bug an idle game can ship.
   ========================================================================= */

export const MAX_BOND = 99;

export const XP_TABLE = (() => {
  const t = [0, 0];
  let acc = 0;
  for (let n = 1; n <= 120; n++) {
    acc += Math.floor(n + 300 * Math.pow(2, n / 7));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;
})();

if (XP_TABLE[99] !== 13034431) {
  throw new Error(`XP table is wrong: XP_TABLE[99] = ${XP_TABLE[99]}, expected 13034431`);
}

/** XP required for the single step from L-1 into L. */
export function deltaXp(level) {
  if (level <= 1 || level > MAX_BOND) return 0;
  return XP_TABLE[level] - XP_TABLE[level - 1];
}

/** Total XP -> bond level. */
export function levelFromXp(xp) {
  let lo = 1;
  for (let l = 1; l <= MAX_BOND; l++) if (xp >= XP_TABLE[l]) lo = l;
  return lo;
}

/** 0..1 progress through the current level. Returns 1 at cap. */
export function levelProgress(xp) {
  const l = levelFromXp(xp);
  if (l >= MAX_BOND) return 1;
  const base = XP_TABLE[l];
  const need = XP_TABLE[l + 1] - base;
  return need <= 0 ? 1 : (xp - base) / need;
}

/* =========================================================================
   2. RARITY — the violet axis, and only the violet axis.

   Five tiers. Rarity is never carried by hue: every tier is the same violet
   at a different VALUE, plus a redundant pip count so the ladder still reads
   in a screenshot, in greyscale, and to anyone who does not see the
   difference between two violets.
   ========================================================================= */

export const RARITY = [
  { id: 1, key: "faded",     name: "Faded",     pips: 1 },
  { id: 2, key: "waking",    name: "Waking",    pips: 2 },
  { id: 3, key: "kindled",   name: "Kindled",   pips: 3 },
  { id: 4, key: "sovereign", name: "Sovereign", pips: 4 },
  { id: 5, key: "ascendant", name: "Ascendant", pips: 5 },
];

export const rarityOf = (n) => RARITY[n - 1];

/* =========================================================================
   3. DOMAINS — the elemental axes a Warden draws from.
   ========================================================================= */

export const DOMAIN = {
  void:    "Void",
  tide:    "Tide",
  dawn:    "Dawn",
  dusk:    "Dusk",
  cog:     "Cogwork",
  bone:    "Ossuary",
  storm:   "Storm",
  ember:   "Ember",
  frost:   "Rime",
  verdant: "Verdure",
  stone:   "Deepstone",
};

/* =========================================================================
   4. THE MODIFIER PIPELINE  (melvor-math §7)

   One summed bucket per named family. Percentages of the same family add;
   they never multiply. Flat interval reductions subtract after the
   percentages and are quantised to a 0.05s tick with a 0.25s floor.

   The strongest Wardens carry a signed drawback, which is what turns a
   loadout into a linear optimisation the player can actually reason about.
   ========================================================================= */

/** Our skills. Invented — none of these is anybody else's skill name. */
export const SKILLS = ["Quarry", "Kiln", "Sigil", "Tidewalk", "Grove", "Reliquary"];

const FAMILY_TEXT = {
  skillXP:       (s) => `${s} skill XP`,
  bondXP:        (s) => (s ? `${s} bond XP` : "bond XP, all Wardens"),
  intervalPct:   (s) => `${s} interval`,
  intervalFlat:  (s) => `${s} interval`,
  doubleChance:  (s) => (s ? `chance to double ${s} yield` : "chance to double any yield"),
  preserve:      (s) => `chance to preserve ${s} inputs`,
  cogs:          (s) => (s ? `Cogs from ${s}` : "Cogs from sales"),
  shards:        (s) => (s ? `Aether Shards from ${s}` : "Aether Shards"),
  flatQuantity:  (s) => `base ${s} yield`,
  costReduction: (s) => `${s} build cost`,
};

const MINUS = "−"; // a real minus sign; a hyphen reads as a dash at 11px
const signed = (v, digits = 0) =>
  `${v < 0 ? MINUS : "+"}${Math.abs(v).toFixed(digits)}`;

/** "+6% Sigil skill XP" / "-0.2s Quarry interval" / "+1 base Ore yield" */
export function bonusText(b) {
  const tail = (FAMILY_TEXT[b.family] || (() => b.family))(b.scope);
  if (b.family === "intervalFlat") return `${signed(b.value, 2)}s ${tail}`;
  if (b.family === "flatQuantity") return `${signed(b.value)} ${tail}`;
  return `${signed(b.value * 100, 0)}% ${tail}`;
}

/* Families where a NEGATIVE number is the good outcome. Everywhere else,
   positive is the gain. This is the only place the sign is interpreted. */
const GOOD_WHEN_NEGATIVE = new Set(["intervalPct", "intervalFlat", "costReduction"]);

export const isDrawback = (b) =>
  GOOD_WHEN_NEGATIVE.has(b.family) ? b.value > 0 : b.value < 0;

/* =========================================================================
   5. THE ROSTER

   24 bound spirits. Names, epithets and flavour are all invented here.
   Ascension rungs sit on Melvor's per-recipe unlock ladder (§2.4): the
   deeper tiers simply get more of them.
   ========================================================================= */

const W = (id, name, epithet, rarity, domain, flavour, rungs) =>
  ({ id, name, epithet, rarity, domain, flavour, rungs, sprite: `src/assets/art/wardens/${id}.png`, sealed: `src/assets/art/wardens/${id}-sealed.png` });

const b = (level, family, scope, value) => ({ level, family, scope, value });

export const WARDENS = [
  /* --- ASCENDANT (5) ---------------------------------------------------- */
  W("vharnys", "Vharnys", "The Sunless Crown", 5, "void",
    "Wore out four kingdoms before deciding that thrones were the problem. Now it only crowns the dark.",
    [
      b(1,  "skillXP",      "Sigil",     0.08),
      b(20, "doubleChance", "Sigil",     0.07),
      b(50, "intervalFlat", "Sigil",    -0.20),
      b(85, "cogs",          null,      -0.14),
    ]),
  W("orrolek", "Orrolek", "The Tidewright", 5, "tide",
    "Built the first harbour by lying still for eleven years until the water learned the shape of it.",
    [
      b(1,  "skillXP",      "Tidewalk",  0.08),
      b(20, "preserve",     "Tidewalk",  0.10),
      b(50, "shards",        null,       0.18),
      b(85, "intervalPct",  "Quarry",    0.08),
    ]),
  W("kethrivane", "Kethrivane", "The Ninefold Dawn", 5, "dawn",
    "Nine mornings happen at once inside it. Standing too close makes a week feel like an afternoon.",
    [
      b(1,  "bondXP",        null,       0.10),
      b(20, "skillXP",      "Kiln",      0.07),
      b(50, "flatQuantity", "Ingot",     1),
      b(85, "preserve",     "Kiln",     -0.10),
    ]),

  /* --- SOVEREIGN (4) ---------------------------------------------------- */
  W("sulmara", "Sulmara", "The Glass Widow", 4, "dusk",
    "Spins from a single strand of cooled lamplight. Everything caught in it is returned, eventually, politely.",
    [
      b(1,  "doubleChance", "Reliquary", 0.06),
      b(20, "skillXP",      "Reliquary", 0.06),
      b(50, "costReduction","Reliquary",-0.12),
      b(85, "skillXP",      "Quarry",   -0.06),
    ]),
  W("draimund", "Draimund", "The Ashen Bell", 4, "cog",
    "Struck once at the founding of the works. It has been finishing that note ever since.",
    [
      b(1,  "intervalPct",  "Kiln",     -0.07),
      b(20, "cogs",         "Kiln",      0.15),
      b(50, "intervalFlat", "Kiln",     -0.20),
      b(85, "skillXP",      "Kiln",     -0.05),
    ]),
  W("ythra", "Ythra", "The Hollow Choir", 4, "void",
    "Three voices, no throat. Miners who hear the middle one climb out and take up other work.",
    [
      b(1,  "bondXP",        null,       0.07),
      b(20, "shards",       "Sigil",     0.12),
      b(50, "doubleChance",  null,       0.05),
      b(85, "intervalPct",  "Grove",     0.06),
    ]),
  W("corvidge", "Corvidge", "The Storm Auger", 4, "storm",
    "Reads weather the way a clerk reads a ledger, and is just as unmoved by what it finds there.",
    [
      b(1,  "intervalPct",  "Tidewalk", -0.08),
      b(20, "doubleChance", "Tidewalk",  0.06),
      b(50, "skillXP",      "Tidewalk",  0.07),
      b(85, "cogs",         "Tidewalk", -0.10),
    ]),

  /* --- KINDLED (3) ------------------------------------------------------ */
  W("pellune", "Pellune", "The Moth Vicar", 3, "dusk",
    "Keeps a congregation of one. Preaches to the lamp, and the lamp has never once interrupted.",
    [
      b(1,  "skillXP",      "Reliquary", 0.05),
      b(20, "preserve",     "Reliquary", 0.08),
      b(65, "bondXP",        null,       0.05),
    ]),
  W("baskarel", "Baskarel", "The Kiln Hound", 3, "ember",
    "Sleeps in the ash pit and will not be moved. The smiths have learned to work around it.",
    [
      b(1,  "intervalPct",  "Kiln",     -0.06),
      b(20, "cogs",         "Kiln",      0.12),
      b(65, "doubleChance", "Kiln",      0.05),
    ]),
  W("nimreth", "Nimreth", "The Frost Verger", 3, "frost",
    "Carries the cold from door to door as though it were a candle, and sets it down where it is needed.",
    [
      b(1,  "preserve",     "Grove",     0.09),
      b(20, "skillXP",      "Grove",     0.05),
      b(65, "intervalFlat", "Grove",    -0.20),
    ]),
  W("tessivar", "Tessivar", "The Copper Sermon", 3, "cog",
    "Recites the whole works manual in ninety seconds. Nobody has asked it to stop, which it takes as praise.",
    [
      b(1,  "skillXP",      "Sigil",     0.05),
      b(20, "costReduction","Sigil",    -0.10),
      b(65, "shards",       "Sigil",     0.10),
    ]),
  W("halvane", "Halvane", "The Reed Sovereign", 3, "verdant",
    "Rules a stretch of marsh four paces wide. Its borders are respected by absolutely everything that lives there.",
    [
      b(1,  "skillXP",      "Grove",     0.06),
      b(20, "doubleChance", "Grove",     0.05),
      b(65, "cogs",         "Grove",     0.14),
    ]),

  /* --- WAKING (2) ------------------------------------------------------- */
  W("ossuline", "Ossuline", "The Quiet Rib", 2, "bone",
    "Left the rest of itself somewhere warm. Says it will collect the remainder when the weather turns.",
    [
      b(1,  "preserve",     "Reliquary", 0.06),
      b(20, "skillXP",      "Reliquary", 0.04),
      b(65, "flatQuantity", "Relic",     1),
    ]),
  W("delvarn", "Delvarn", "The Ninth Furrow", 2, "stone",
    "Digs the same nine tunnels in the same nine places, and has been right about the ninth one twice.",
    [
      b(1,  "intervalPct",  "Quarry",   -0.05),
      b(20, "flatQuantity", "Ore",       1),
      b(65, "doubleChance", "Quarry",    0.05),
    ]),
  W("ashquill", "Ashquill", "The Cinder Wren", 2, "ember",
    "Small, furious, and entirely uninterested in being put out. Nests in flues out of spite.",
    [
      b(1,  "skillXP",      "Kiln",      0.04),
      b(20, "intervalPct",  "Kiln",     -0.05),
      b(65, "bondXP",        null,       0.04),
    ]),
  W("verrow", "Verrow", "The Bramble Sexton", 2, "verdant",
    "Buries what the grove is finished with, and grows a thorn over each one so nobody forgets where.",
    [
      b(1,  "preserve",     "Grove",     0.06),
      b(20, "skillXP",      "Grove",     0.04),
      b(65, "costReduction","Grove",    -0.08),
    ]),
  W("lorquin", "Lorquin", "The Salt Pilgrim", 2, "tide",
    "Walks the tideline end to end each year and arrives back exactly one grain of salt heavier.",
    [
      b(1,  "skillXP",      "Tidewalk",  0.04),
      b(20, "flatQuantity", "Brine",     1),
      b(65, "cogs",         "Tidewalk",  0.10),
    ]),
  W("mirevail", "Mirevail", "The Bog Lantern", 2, "dusk",
    "Hangs from nothing over the deepest water. Follow it and you will certainly get somewhere.",
    [
      b(1,  "shards",       "Sigil",     0.06),
      b(20, "doubleChance", "Sigil",     0.04),
      b(65, "skillXP",      "Sigil",     0.05),
    ]),

  /* --- FADED (1) -------------------------------------------------------- */
  W("cindren", "Cindren", "The Match Sprite", 1, "ember",
    "One strike of use, hoarded for two centuries. It has not decided what is worth it yet.",
    [
      b(1,  "skillXP",      "Kiln",      0.03),
      b(50, "intervalPct",  "Kiln",     -0.04),
    ]),
  W("kellow", "Kellow", "The Sill Toad", 1, "verdant",
    "Occupies one windowsill in the lower works and reviews everyone who passes. Nobody scores well.",
    [
      b(1,  "preserve",     "Grove",     0.04),
      b(50, "skillXP",      "Grove",     0.03),
    ]),
  W("tallow", "Tallow", "The Guttered Mote", 1, "dusk",
    "Burned down to almost nothing during a long argument it insists it won.",
    [
      b(1,  "shards",       "Reliquary", 0.04),
      b(50, "bondXP",        null,       0.03),
    ]),
  W("nettlejack", "Nettlejack", "The Hedge Watch", 1, "verdant",
    "Guards a gap in a hedge that no longer leads anywhere. The post has not been formally abolished.",
    [
      b(1,  "skillXP",      "Grove",     0.03),
      b(50, "doubleChance", "Grove",     0.03),
    ]),
  W("quillow", "Quillow", "The Paper Fox", 1, "storm",
    "Folded from a discharge notice by a clerk who could not bear to file it. Very light. Very quick.",
    [
      b(1,  "intervalPct",  "Reliquary",-0.04),
      b(50, "skillXP",      "Reliquary", 0.03),
    ]),
  W("dunmoss", "Dunmoss", "The Sleeping Stone", 1, "stone",
    "Woke once during the founding, looked around, and made a considered decision about it.",
    [
      b(1,  "flatQuantity", "Ore",       1),
      b(50, "intervalPct",  "Quarry",   -0.03),
    ]),
];

export const wardenById = (id) => WARDENS.find((w) => w.id === id);

/* =========================================================================
   6. THE CODEX RESONANCE POOL  (melvor-math §2.2 / §2.3)

   Cap is a flat multiple of the roster size, exactly as Melvor's pool cap is
   500,000 x recipe count. 25% of every point of bond XP earned is *also*
   deposited here, and the pool is spent 1:1 to push a Bond level.

   The checkpoints are LIVE thresholds. Spend the pool back down below one
   and the bonus is gone until it is re-earned. That tension is the entire
   point of the mechanic and it is the thing most clones drop.
   ========================================================================= */

export const RESONANCE_PER_WARDEN = 25000;
export const RESONANCE_CAP = RESONANCE_PER_WARDEN * WARDENS.length; // 600,000

/** 25% of earned bond XP is mirrored into the pool. */
export const POOL_SHARE = 0.25;

export const CHECKPOINTS = [
  { at: 0.10, effect: "+5% bond XP for every Warden" },
  { at: 0.25, effect: `${MINUS}10% Ascension Cog cost` },
  { at: 0.50, effect: "+50% Cogs from a released sigil" },
  { at: 0.95, effect: "+1 Warden Seal per Codex milestone" },
];

export const checkpointXp = (cp) => Math.round(cp.at * RESONANCE_CAP);
export const isCheckpointLive = (cp, resonance) => resonance >= checkpointXp(cp);

/* =========================================================================
   7. SINKS

   Two of them, and between them they consume all four currencies.

     Rite of Binding   <- Warden Seals + Aether Shards   (acquisition)
     Ascension         <- Codex Resonance + Cogs         (progression)

   Ascension is priced off deltaXp, so it inherits the doubling-every-seven
   ramp for free: the first rung is pocket change and rung 85 is a real
   decision. Cost is driven by the Warden's level, never by player wealth —
   no rubber-banding (§6.1).
   ========================================================================= */

export const RITE_COST = { seals: 1, shards: 850 };

export function ascendCost(warden, resonance) {
  const level = levelFromXp(warden.bondXp);
  if (level >= MAX_BOND) return null;
  const next = level + 1;
  const pool = deltaXp(next);
  const discount = isCheckpointLive(CHECKPOINTS[1], resonance) ? 0.9 : 1;
  const cogs = Math.floor(pool * (18 + 6 * warden.rarity) * discount);
  return { next, pool, cogs, discounted: discount !== 1 };
}

/** A duplicate binding is converted to pool XP rather than wasted. */
export const DUPE_RESONANCE = [1500, 4000, 12000, 36000, 110000];

/* =========================================================================
   8. THE RITE  (melvor-math §7.5 — the surprise band is sub-1% to 3%)

   Tier weights put Ascendant at 1.5%, which sits squarely in the band
   Melvor reserves for its signature rare drops. A hard pity counter is
   ours, not Melvor's: 20 Rites without a Sovereign or better guarantees
   one, so the tail is bounded and the player can see it coming.
   ========================================================================= */

export const RITE_WEIGHTS = [46, 30, 16, 6.5, 1.5]; // Faded -> Ascendant
export const PITY_AT = 20;

/** Deterministic PRNG so a seeded run reproduces exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollRarity(rand, pity) {
  if (pity >= PITY_AT) {
    // Guaranteed Sovereign+, weighted between the two top tiers.
    const [s, a] = [RITE_WEIGHTS[3], RITE_WEIGHTS[4]];
    return rand() * (s + a) < s ? 4 : 5;
  }
  const total = RITE_WEIGHTS.reduce((x, y) => x + y, 0);
  let r = rand() * total;
  for (let i = 0; i < RITE_WEIGHTS.length; i++) {
    r -= RITE_WEIGHTS[i];
    if (r <= 0) return i + 1;
  }
  return 1;
}

/**
 * One Rite. Returns the Warden drawn and whether it was already bound.
 * A new Warden is favoured 3:1 over a duplicate inside the rolled tier —
 * the dupe is not wasted, it becomes pool XP.
 */
export function rollWarden(rand, pity, owned) {
  const rarity = rollRarity(rand, pity);
  const tier = WARDENS.filter((w) => w.rarity === rarity);
  const fresh = tier.filter((w) => !owned.has(w.id));
  const pickFrom = fresh.length && rand() < 0.75 ? fresh : tier;
  const warden = pickFrom[Math.floor(rand() * pickFrom.length) % pickFrom.length];
  return { warden, duplicate: owned.has(warden.id) };
}

/* =========================================================================
   9. THE SAVE

   A plausible mid-game state. Cog balance sits in melvor-math §5's
   mid-game non-combat band; the pool sits at 62% of cap so three of the
   four checkpoints are live and the fourth is visibly out of reach.
   ========================================================================= */

const BOUND = {
  vharnys: 62, sulmara: 44, ythra: 31, pellune: 55, baskarel: 28,
  tessivar: 37, ossuline: 22, ashquill: 49, lorquin: 17, cindren: 71,
  kellow: 12, nettlejack: 9,
};

/** Bond level -> a believable XP total partway into that level. */
function xpAtLevelPlus(level, frac) {
  return XP_TABLE[level] + Math.floor(deltaXp(level + 1) * frac);
}

const PARTIALS = [0.64, 0.18, 0.41, 0.87, 0.33, 0.55, 0.72, 0.09, 0.48, 0.26, 0.93, 0.61];

export function createSave() {
  const wardens = WARDENS.map((w, i) => ({
    ...w,
    bound: w.id in BOUND,
    bondXp: w.id in BOUND ? xpAtLevelPlus(BOUND[w.id], PARTIALS[i % PARTIALS.length]) : 0,
  }));

  return {
    wardens,
    cogs: 4182600,
    shards: 8945,
    seals: 3,
    resonance: 372400,
    ritesSincePity: 12,
    ritesTotal: 47,
  };
}

export const boundCount = (save) => save.wardens.filter((w) => w.bound).length;

/* =========================================================================
   10. FORMATTERS
   Idle games live and die on legible big numbers. One formatter, used
   everywhere, so 4.18M never renders three different ways.
   ========================================================================= */

const UNITS = ["", "K", "M", "B", "T"];

export function compact(n) {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const s = String(Math.round(n));
    return neg ? MINUS + s : s;
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  const scaled = n / 1000 ** tier;
  const s = scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2).replace(/\.?0+$/, "") + UNITS[tier];
  return neg ? MINUS + s : s;
}

export const int = (n) => Math.trunc(n).toLocaleString("en-US");
export const pct = (f, d = 0) => `${(f * 100).toFixed(d)}%`;
