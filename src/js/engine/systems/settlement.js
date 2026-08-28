/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: SETTLEMENT   (parity §3d)

   A town on a five-minute clock. It has nothing to do with `state.action`,
   it never blocks a skill, and it keeps running while the player mines, or
   fights, or has the tab closed. 288 town ticks a day, so a full 24 h replay
   is 288 iterations of the loop below — which is why a passive skill this
   large costs nothing to catch up.

   ---------------------------------------------------------------------------
   THE LOOP CLOSES, AND THAT IS THE DESIGN
   ---------------------------------------------------------------------------
        cottages -> population -> workers -> every other building
                                     |
                                     +-> eats food -> farmland -> workers

   Buildings need labour. Labour lives in cottages. Cottages are worthless
   without food, food needs farmland, farmland needs labour. Build the wrong
   thing and the town does not merely under-perform — it starves, the
   population falls, and every building's output falls with it. That closed
   loop is the difference between a town and a row of counters going up.

   ---------------------------------------------------------------------------
   FOUR RULES THE TICK OBEYS
   ---------------------------------------------------------------------------
   1. LABOUR SCALES EVERYTHING. `efficiency = min(1, population / workers
      needed)`. One number, applied to every building's input and output
      alike, so over-building is self-correcting rather than free.
   2. A PROCESSING BUILDING RUNS ON WHAT IT CAN GET. Inputs are checked as a
      ratio; a sawmill with half the timber it wants runs at half, it does
      not stall and it does not consume what is not there.
   3. STORAGE IS A REAL CAP AND OVERFLOW IS DESTROYED — the same shape as the
      mastery pool, and for the same reason: a cap you can actually hit is
      what makes you build the next granary.
   4. WORSHIP RAMPS. The patron chosen on day one does nothing until a shrine
      is standing, then its bonus AND its drawback fade in together as
      worship accrues. Both halves ramp, because a signed modifier whose
      penalty lands first is a trap rather than a choice.
   ========================================================================= */

import {
  TOWN_TICK_SECONDS, WORSHIP_CHANGE_COST, BASE_STORAGE, BASE_HAPPINESS,
  FOOD_PER_HEAD, GROWTH_RATE, RESOURCE_IDS, BUILDINGS, BUILDING_BY_ID,
  WORSHIP_BY_ID, xpForTick, buildCost,
} from "../../../data/settlement.js";
import { MOD, clamp } from "../modifiers.js";
import { secondsToTicks } from "../interval.js";

const SKILL = "settlement";
const SCOPE = [SKILL];

/** One town tick, in engine ticks. 300 s -> 6,000. */
export const TOWN_TICK_TICKS = secondsToTicks(TOWN_TICK_SECONDS);

/** Worship reaches full strength here. ~70 h of a fully shrined town. */
export const WORSHIP_FULL = 250_000;

/* =========================================================================
   STATE

   Created by `found()` — the one-time worship choice — and by nothing else.
   Before the player has picked a patron there is no `state.settlement` key,
   so the system costs the tick loop exactly one `undefined` check.
   ========================================================================= */

export function townState(game) {
  return game.state.settlement || null;
}

/** The one-time choice the screen opens on (§3d). */
export function found(game, worshipId) {
  if (game.state.settlement) return "already founded";
  if (!WORSHIP_BY_ID.has(worshipId)) return "no such worship";
  const res = {};
  for (const id of RESOURCE_IDS) res[id] = 0;
  game.state.settlement = {
    worship: worshipId,
    built: {},
    res,
    pop: 0,
    worshipPoints: 0,
    happiness: BASE_HAPPINESS,
    ticks: TOWN_TICK_TICKS,
    townTicks: 0,
    wasted: 0,
    /* What the last tick actually did, so the screen can show a live ledger
       instead of a stock count that jumps every five minutes. */
    last: null,
  };
  /* A town starts with enough food and timber to put up its first buildings.
     Zero on every line would make the first ten minutes a blank screen. */
  game.state.settlement.res.food = 200;
  game.state.settlement.res.timber = 100;
  return null;
}

/** Changing patron later. The reference charges 50M; so do we. */
export function changeWorship(game, worshipId) {
  const t = townState(game);
  if (!t) return "no settlement yet";
  if (!WORSHIP_BY_ID.has(worshipId)) return "no such worship";
  if (t.worship === worshipId) return "already your patron";
  if (game.state.cogs < WORSHIP_CHANGE_COST) return "not enough Cogs";
  game.state.cogs -= WORSHIP_CHANGE_COST;
  game.state.stats.cogsSpent += WORSHIP_CHANGE_COST;
  t.worship = worshipId;
  return null;
}

/* =========================================================================
   DERIVED TOWN STATS
   ========================================================================= */

/** 0..1 — how far the patron's bonus AND drawback have faded in. */
export const worshipPower = (t) => clamp((t.worshipPoints || 0) / WORSHIP_FULL, 0, 1);

/**
 * The patron's contribution, already scaled by worship power.
 * `production` is per-resource where the worship names resources, and
 * otherwise applies to every line.
 */
export function worshipEffect(game) {
  const t = townState(game);
  const out = { production: {}, productionAll: 0, trade: 0, storage: 0, growth: 0, happiness: 0, xp: 0 };
  if (!t) return out;
  const w = WORSHIP_BY_ID.get(t.worship);
  if (!w) return out;
  const k = worshipPower(t);
  for (const part of [w.bonus, w.drawback]) {
    if (!part) continue;
    const v = part.value * k;
    if (part.stat === "production") {
      if (!part.scope) out.productionAll += v;
      else for (const res of part.scope) out.production[res] = (out.production[res] || 0) + v;
    } else {
      out[part.stat] += v;
    }
  }
  return out;
}

/** Everything the standing buildings add up to. One pass, read everywhere. */
export function townStats(game) {
  const t = townState(game);
  const zero = {
    popCap: 0, workers: 0, storage: BASE_STORAGE, education: 0,
    happiness: BASE_HAPPINESS, worshipGain: 0, buildings: 0,
  };
  if (!t) return zero;
  const m = game.mods();
  const w = worshipEffect(game);

  const out = { ...zero };
  for (const b of BUILDINGS) {
    const n = t.built[b.id] || 0;
    if (!n) continue;
    out.buildings += n;
    const p = b.provides || {};
    out.popCap += (p.population || 0) * n;
    out.storage += (p.storage || 0) * n;
    out.education += (p.education || 0) * n;
    out.happiness += (p.happiness || 0) * n;
    out.worshipGain += (p.worship || 0) * n;
    out.workers += (b.workers || 0) * n;
  }
  out.storage = Math.max(0, Math.floor(out.storage * (1 + m.sum("storage", SCOPE) + w.storage)));
  out.happiness += m.sum("happiness", SCOPE) + w.happiness;
  out.efficiency = out.workers > 0 ? clamp(t.pop / out.workers, 0, 1) : 1;
  return out;
}

/** Build cost for the next copy, after every cost reduction that applies. */
export function costFor(game, buildingId) {
  const t = townState(game);
  const b = BUILDING_BY_ID.get(buildingId);
  const owned = t?.built[buildingId] || 0;
  const cut = game.mods().sum(MOD.costReduction, SCOPE);
  return buildCost(b, owned, cut);
}

/** @returns {string|null} reason on refusal, null on success */
export function build(game, buildingId) {
  const t = townState(game);
  if (!t) return "no settlement yet";
  const b = BUILDING_BY_ID.get(buildingId);
  if (!b) return "no such building";
  if (game.skillLevel(SKILL) < b.level) return `needs Settlement ${b.level}`;
  const owned = t.built[buildingId] || 0;
  if (owned >= b.max) return "at its limit";

  const cost = costFor(game, buildingId);
  if ((cost.cogs || 0) > game.state.cogs) return "not enough Cogs";
  for (const [res, qty] of Object.entries(cost)) {
    if (res === "cogs") continue;
    if ((t.res[res] || 0) < qty) return `not enough ${res}`;
  }
  if (cost.cogs) { game.state.cogs -= cost.cogs; game.state.stats.cogsSpent += cost.cogs; }
  for (const [res, qty] of Object.entries(cost)) {
    if (res !== "cogs") t.res[res] -= qty;
  }
  t.built[buildingId] = owned + 1;
  return null;
}

/* =========================================================================
   THE TOWN TICK
   ========================================================================= */

function townTick(game) {
  const t = townState(game);
  const m = game.mods();
  const w = worshipEffect(game);
  const st = townStats(game);
  const eff = st.efficiency;

  const gained = {};
  const used = {};
  const add = (bag, res, n) => { bag[res] = (bag[res] || 0) + n; };

  /* --- 1. production, input-limited, labour-scaled ------------------- */
  let cogsEarned = 0;
  for (const b of BUILDINGS) {
    const n = t.built[b.id] || 0;
    if (!n) continue;

    /* Rule 2: a building runs at whatever fraction of its inputs it can get. */
    let ratio = 1;
    for (const [res, qty] of Object.entries(b.consumes || {})) {
      const want = qty * n * eff;
      if (want <= 0) continue;
      const have = res === "cogs" ? game.state.cogs : t.res[res] || 0;
      ratio = Math.min(ratio, have / want);
    }
    ratio = clamp(ratio, 0, 1);
    if (ratio <= 0) continue;

    for (const [res, qty] of Object.entries(b.consumes || {})) {
      const spend = qty * n * eff * ratio;
      if (res === "cogs") game.state.cogs = Math.max(0, game.state.cogs - spend);
      else t.res[res] = Math.max(0, (t.res[res] || 0) - spend);
      add(used, res, spend);
    }
    for (const [res, qty] of Object.entries(b.produces || {})) {
      const bonus = 1 + w.productionAll + (w.production[res] || 0) + m.sum("production", SCOPE)
        + (res === "cogs" ? w.trade + m.sum("trade", SCOPE) : 0);
      const made = qty * n * eff * ratio * Math.max(0, bonus);
      if (res === "cogs") cogsEarned += made;
      else t.res[res] = (t.res[res] || 0) + made;
      add(gained, res, made);
    }
  }
  /* Town income is action income, not a sale, so it goes through the same
     bucket every other faucet does and cannot double-dip the sell button. */
  if (cogsEarned >= 1) game._payCurrency(Math.floor(cogsEarned), SCOPE);

  /* --- 2. the town eats --------------------------------------------- */
  const wanted = t.pop * FOOD_PER_HEAD;
  const eaten = Math.min(wanted, t.res.food || 0);
  t.res.food = Math.max(0, (t.res.food || 0) - eaten);
  add(used, "food", eaten);
  const fed = wanted > 0 ? eaten / wanted : 1;

  /* --- 3. happiness, then population --------------------------------- */
  const hunger = fed >= 1 ? 0 : -40 * (1 - fed);
  t.happiness = clamp(st.happiness + hunger, 0, 100);

  const mood = clamp(t.happiness / BASE_HAPPINESS, 0.2, 1.2);
  const target = clamp(st.popCap * Math.min(1, fed) * mood, 0, st.popCap);
  const rate = GROWTH_RATE * (1 + w.growth);
  t.pop = Math.max(0, t.pop + (target - t.pop) * clamp(rate, 0.01, 1));

  /* --- 4. storage. Rule 3: overflow is destroyed. --------------------- */
  for (const res of RESOURCE_IDS) {
    const cap = st.storage;
    if ((t.res[res] || 0) > cap) {
      t.wasted += t.res[res] - cap;
      t.res[res] = cap;
    }
  }

  /* --- 5. worship and experience ------------------------------------- */
  t.worshipPoints += st.worshipGain;
  const xp = xpForTick(t.pop, st.education, w.xp) * (1 + m.sum(MOD.skillXP, SCOPE));
  if (xp > 0) {
    const before = game.skillLevel(SKILL);
    game.state.skills[SKILL].xp += xp;
    if (game.skillLevel(SKILL) !== before) game._invalidate();
  }

  t.townTicks++;
  t.last = { gained, used, xp, cogs: Math.floor(cogsEarned), fed, pop: t.pop, efficiency: eff };
}

/* =========================================================================
   THE SYSTEM CONTRACT
   ========================================================================= */

function nextEvent(game) {
  const t = game.state.settlement;
  return t ? t.ticks : Infinity;
}

function tick(game, k) {
  const t = game.state.settlement;
  if (!t) return;
  t.ticks -= k;
  /* A `while` and not an `if`: ./index.js chunks by nextEvent so k can never
     span two town ticks, but a save edited by hand or a future caller that
     does not chunk must still land in a correct state rather than a negative
     countdown that never fires again. */
  while (t.ticks <= 0) {
    townTick(game);
    t.ticks += TOWN_TICK_TICKS;
  }
}

/* =========================================================================
   READS FOR THE UI
   ========================================================================= */

export const townTickSeconds = () => TOWN_TICK_SECONDS;
export const secondsToNextTick = (t) => Math.max(0, t.ticks) / 20;
export const tickProgress = (t) => clamp(1 - t.ticks / TOWN_TICK_TICKS, 0, 1);
export { WORSHIP_CHANGE_COST };

/**
 * A settlement does not exist until a patron is chosen, so the fresh-save
 * shape is an explicit null rather than an empty town: §3d's screen opens on
 * that choice, and "no town yet" is a real state the UI has to render.
 */
function init(state) {
  state.settlement = null;
}

export default { id: SKILL, init, nextEvent, tick };
