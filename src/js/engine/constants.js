/* =========================================================================
   EMBERVEIL ENGINE — CONSTANTS

   Every magic number in the systems core lives here, with the line of
   reference/melvor-math.md it comes from. Nothing downstream may inline a
   systems constant; if you need one that isn't here, add it here first.
   ========================================================================= */

/* --- §3 Tick engine ------------------------------------------------------ */

/** 1 tick = 0.05 s. 20 ticks per second. The atomic unit of the whole game. */
export const TICK_MS = 50;
export const TICKS_PER_SECOND = 1000 / TICK_MS; // 20

/** §4.1 rule 5 — hard floor of 0.25 s on any action, i.e. 5 ticks. */
export const MIN_INTERVAL_SECONDS = 0.25;
export const MIN_ACTION_TICKS = MIN_INTERVAL_SECONDS * TICKS_PER_SECOND; // 5

/** §3 — offline is replayed, not extrapolated, and it is capped at 24 h. */
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_CAP_TICKS = OFFLINE_CAP_MS / TICK_MS; // 1,728,000

/* --- §1 Skill XP --------------------------------------------------------- */

/** Base cap. Reaching it is a career, not a milestone. */
export const SKILL_CAP = 99;
/** Ascension cap — unlocked by the endgame capstone, §1.2 "expansion cap". */
export const ASCENSION_CAP = 120;
/** How far the precomputed table runs. Levels past the cap are "virtual"
 *  levels: display-only, but they feed rare-drop math (§1.2). */
export const TABLE_MAX = 200;

/* --- §2 Mastery ---------------------------------------------------------- */

export const MASTERY_CAP = 99;
/** §2.2 — pool cap = 500,000 x recipeCount. Verified against six real skills. */
export const POOL_PER_RECIPE = 500_000;
/** §2.2 — 25% of every mastery XP point is also deposited in the pool ... */
export const POOL_DEPOSIT = 0.25;
/** ... and 50% once the skill itself is capped. */
export const POOL_DEPOSIT_CAPPED = 0.5;
/** §2.3 — live thresholds, not unlocks. Spend back below one and it turns off. */
export const CHECKPOINTS = [0.1, 0.25, 0.5, 0.95];
/** §2.2 — a mastery token refills 0.1% of the pool cap. */
export const TOKEN_POOL_FRACTION = 0.001;
/** §2.1 — MXP is halved before bonuses. */
export const MXP_SCALE = 0.5;
/** §2.4 — every recipe unlocks something at these mastery levels. */
export const MASTERY_UNLOCK_LEVELS = [1, 10, 20, 50, 65, 85, 95, 99];

/* --- §7 Modifier pipeline ------------------------------------------------ */

/** §7.2 exception 3 — resource preservation is capped at 80% globally. */
export const PRESERVE_CAP = 0.8;
/** Our own cap on hit chance, so no monster is ever a formality. */
export const HIT_CHANCE_CAP = 0.95;
/** §4.2 — bound the stacked interval reduction; the throughput term is
 *  hyperbolic (rate = 1/(1-r)), so an unbounded ladder detonates the economy.
 *  The reference's own base-game gathering ladders top out around -40% to
 *  -50%; we cap at -50%, which a fully invested loadout genuinely reaches
 *  (-40% tools plus -20% from waystations, clipped) and cannot exceed. */
export const INTERVAL_REDUCTION_CAP = 0.5;

/* --- Combat -------------------------------------------------------------- */

/** §1 — the eight combat skills are levels, not pages. All of them route to
 *  the one Combat screen, and they all read and write this modifier scope. */
export const COMBAT_SCOPE = "combat";
/** How much one level of the skill your attack style trains is worth, as a
 *  fraction, on accuracy / max hit / evasion. Deliberately small: the relic
 *  ladder is the flat spine the whole economy was measured against, so a
 *  capped weapon skill is worth about one armour set and no more. See the
 *  long note at the top of ./combat.js. */
export const LEVEL_STAT_SCALE = 0.0025;
/** §7.2 exception 3 — every unbounded-looking modifier has a named cap. */
export const DAMAGE_REDUCTION_CAP = 0.8;
/** §3j — "Loot to Collect ( 0 / 100 )". Overflow past this is destroyed. */
export const LOOT_SLOTS = 100;
/** §3h/§4.3 — three seconds of standing still every time a lift is caught. */
export const LARCENY_STUN_SECONDS = 3.0;
/** §7.5 — the constant in min(1, (100 + Stealth) / (100 + Perception)). */
export const STEALTH_BASE = 100;
/** How many devotions can be lit at once. The reference allows two. */
export const DEVOTION_SLOTS = 2;

/** §7.5 — 0.133 XP per point of damage dealt, into Vitality. */
export const VITALITY_XP_PER_DAMAGE = 0.133;
/**
 * The same rule, one line up: combat XP is paid PER POINT OF DAMAGE, never
 * per kill, and it goes to whichever of the five weapon skills the attack
 * style trains.
 *
 * WHY THIS IS A CONSTANT AND NOT A FIELD ON EVERY MONSTER. A per-kill `xp`
 * number is a second, hand-written balance spine sitting beside the real one.
 * It drifts: our bestiary's hit points climb 17 -> 282,000 across seventeen
 * rungs while a hand-written per-kill figure only ever climbed 58 -> 462, so
 * the Vitality-to-weapon-XP ratio swung from 0.04 to 81, and weapon XP/hr
 * actually FELL every time the player advanced a tier — a bigger monster took
 * longer to kill and paid barely more for it. Paying per point of damage
 * makes both curves the same curve: the ratio is a constant
 * VITALITY_XP_PER_DAMAGE / STYLE_XP_PER_DAMAGE = 0.3325 on every rung, and
 * weapon XP/hr becomes exactly a multiple of DPS, so it can only go up when
 * the player's damage goes up. Melvor's own combat XP works this way, which
 * is why its Hitpoints rate is a fixed fraction of its Attack rate.
 *
 * WHY 0.4. It is the number that puts a fresh account's first hour of combat
 * on the same footing as its first hour of gathering (a Hollow Wisp fight
 * pays ~1,370 weapon XP/hr against a first-rung gathering loop's ~12,000
 * total, split over five bars instead of one) while letting the top of the
 * bestiary pay the millions per hour the reference's endgame combat does.
 * Three times VITALITY_XP_PER_DAMAGE, so Vitality caps roughly a third of the
 * way through a weapon skill and stays the long pole exactly as it does in
 * the reference.
 */
export const STYLE_XP_PER_DAMAGE = 0.4;
/** Out-of-combat regeneration: 1% of max HP every 10 s. */
export const REGEN_INTERVAL_TICKS = 10 * TICKS_PER_SECOND;
export const REGEN_FRACTION = 0.01;
/** Base HP before Vitality levels. */
export const BASE_MAX_HP = 100;
export const HP_PER_VITALITY_LEVEL = 10;

/* --- Reliquary (the stack-slot sink) ------------------------------------- */

/** Free slots at the start; §6.1's shape says the sink must introduce itself
 *  inside the first two minutes, so this number is deliberately small. */
export const RELIQUARY_FREE_SLOTS = 20;
/** Purchasable slots on the smooth curve; past this each is a flat price. */
export const RELIQUARY_CURVE_SLOTS = 118;

/* --- Numerics ------------------------------------------------------------ */

/** Guards tick quantisation against binary-float dust (4.55 * 20 = 91.000…1). */
export const EPS = 1e-9;

/** Save-format version. Bump when the shape of a save changes.
 *  v2 added the combat core: persistent HP, prayer points, lit devotions,
 *  the bounty contract, equipment sets, the attack style and the loot
 *  container. A v1 save has none of those fields, so it is refused rather
 *  than silently resumed into a half-initialised combat model. */
export const SAVE_VERSION = 2;
