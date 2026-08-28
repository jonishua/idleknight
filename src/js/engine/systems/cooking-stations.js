/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: THE ARTISAN WING'S TIMERS   (parity §3b)

   Named for its headline job — Cooking's Passive Cook — and it owns every
   background timer the artisan wing has, which is two. Two files would have
   meant two registry entries, two `nextEvent` implementations and two save
   keys for one skill wing; one system with one save key (`state.artisan`) is
   simpler and hashes cleaner.

   ---------------------------------------------------------------------------
   1. THE PASSIVE COOK
   ---------------------------------------------------------------------------
   §3b singles Cooking out as the richest artisan: "three independent stations
   (Magic Cooking Fire, Magic Furnace, Magic Pot), each with its own selected
   recipe, an Active Cook (11.00s) and a Passive Cook (55.00s) that fills a
   Stockpile you 'Collect from'."

   The engine holds exactly ONE foreground action, which is right and is not
   negotiable. So ONE station is the Active Cook — the ordinary `state.action`
   the base loop already resolves — and the other two run here, at
   `passiveMultiplier` x their own interval, into a per-station stockpile the
   player has to come back and collect. 55.00 / 11.00 is exactly 5, and that
   is the multiplier shipped in ../../../data/skills/hearthcraft.js.

   What the passive cook does NOT do is pay experience. It consumes real
   ingredients, honours preservation and rolls the same success and perfect
   chances the active cook does, and it hands you the food — not the levels.
   That is what stops "set three stations and leave" from being strictly
   better than cooking.

   A station whose stockpile is full, whose ingredients have run out, or whose
   recipe is the one being actively cooked simply rolls its timer over without
   producing and without drawing from the RNG. It is a no-op event every 40-65
   seconds, which is nothing next to the 1.7 million ticks of a 24 h replay,
   and it buys the thing that matters: the timer is never stale, so a station
   that regains its ingredients starts cooking again on its own.

   ---------------------------------------------------------------------------
   2. THE POTION DOSE
   ---------------------------------------------------------------------------
   Alchemy's potions grant modifiers for a stretch of time. They arrive
   through `mods(game, set)` — the same hook Agility's obstacles and
   Astrology's constellations use — so a live dose is an ORDINARY modifier
   (§7.1): one bucket per name, additive with tools, waystations, checkpoints
   and mastery, and visible in the same audit. There is no parallel potion
   pipeline anywhere in the engine.

   Duration is held in TICKS and decremented here, which is what makes it
   exact: the fast event-jump path and the tick-by-tick path expire a dose on
   the same tick, and a 24 h offline replay expires it at the right moment
   instead of carrying it through the whole session.

   ---------------------------------------------------------------------------
   STATE IS LAZY
   ---------------------------------------------------------------------------
   `state.artisan` is created the first time a station is selected or a potion
   is drunk. A save that has never opened Cooking's station panel carries no
   key at all and hashes identically with or without this module loaded —
   which is exactly why the balance sandbox's measurements are untouched by
   the whole feature.
   ========================================================================= */

import { MOD } from "../modifiers.js";
import { secondsToTicks, ticksToSeconds } from "../interval.js";
import { registerExoticHook } from "./agility.js";

const SKILL = "hearthcraft";

/* =========================================================================
   STATE
   ========================================================================= */

export function artisanState(game, create = false) {
  const s = game.state;
  if (!s.artisan && create) s.artisan = { stations: {}, potions: [], perfectCooks: true, comboRunes: false };
  return s.artisan || null;
}

/** One station's slice, or null. */
export function stationState(game, stationId) {
  const st = game.state.artisan;
  return (st && st.stations[stationId]) || null;
}

/** Definition lookup, straight off the skill so the two cannot disagree. */
export const stationsOf = (db) => db.skill(SKILL).stations;
export const stationDef = (db, id) => db.skill(SKILL).stations.find((s) => s.id === id) || null;

/** Which station the foreground action is occupying, or null. */
export function activeStationId(game) {
  const a = game.state.action;
  if (!a || a.skillId !== SKILL || game.state.combat) return null;
  return game.db.recipe(a.recipeId)?.station || null;
}

/* =========================================================================
   THE PASSIVE INTERVAL
   ========================================================================= */

/**
 * A station's passive interval in ticks: the recipe's own effective interval
 * (§4.1, tools and checkpoints included) times the skill's passive multiplier.
 * Derived, never stored, so buying a bench speeds the stockpile up too.
 */
export function passiveIntervalTicks(game, recipeId) {
  const mult = game.db.skill(SKILL).passiveMultiplier || 5;
  return Math.max(1, game.actionIntervalTicks(SKILL, recipeId) * mult);
}

/** Seconds, for the screen. */
export const passiveSeconds = (game, recipeId) => ticksToSeconds(passiveIntervalTicks(game, recipeId));

/* =========================================================================
   PLAYER ACTIONS
   ========================================================================= */

/**
 * Point a station at a recipe (or at nothing, with `null`). Selecting is what
 * creates the state, so an untouched save stays untouched.
 */
export function selectStation(game, stationId, recipeId) {
  if (!stationDef(game.db, stationId)) return "no such station";
  if (recipeId) {
    const r = game.db.recipe(recipeId);
    if (!r || r.station !== stationId) return "that recipe is not cooked here";
    if (game.skillLevel(SKILL) < r.level) return "level too low";
  }
  const st = artisanState(game, true);
  const prev = st.stations[stationId];
  st.stations[stationId] = {
    recipeId: recipeId || null,
    ticks: recipeId ? passiveIntervalTicks(game, recipeId) : 0,
    stock: prev ? prev.stock : {},
  };
  return null;
}

/** Everything one station is holding: [{id, name, qty}], richest first. */
export function stockpile(game, stationId) {
  const st = stationState(game, stationId);
  if (!st) return [];
  return Object.entries(st.stock)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ id, name: game.db.item(id).name, qty, value: game.db.item(id).value }))
    .sort((a, b) => b.value - a.value);
}

export function stockpileCount(game, stationId) {
  const st = stationState(game, stationId);
  if (!st) return 0;
  let n = 0;
  for (const q of Object.values(st.stock)) n += q;
  return n;
}

/** §3b's "Collect from". Moves a station's stockpile into the bank. */
export function collect(game, stationId) {
  const st = stationState(game, stationId);
  if (!st) return 0;
  let moved = 0;
  for (const [id, qty] of Object.entries(st.stock)) {
    if (qty > 0) { game._deliver(id, qty); moved += qty; }
  }
  st.stock = {};
  return moved;
}

/** §3b's "Enable Perfect Cooks?" toggle. */
export function perfectCooksEnabled(game) {
  const st = game.state.artisan;
  return st ? st.perfectCooks !== false : true;
}

/**
 * Flip the toggle. The quality block in the skill data holds the authored
 * perfect rate in `perfectPerMasteryDefault`; turning the toggle off writes
 * `perfectPerMastery` to 0 and turning it on restores it from the default, so
 * the content file is the only place the real number is ever written.
 */
export function setPerfectCooks(game, on) {
  const st = artisanState(game, true);
  st.perfectCooks = !!on;
  applyPerfectCooks(game);
}

export function applyPerfectCooks(game) {
  const q = game.db.skill(SKILL).quality;
  if (!q) return;
  q.perfectPerMastery = perfectCooksEnabled(game) ? q.perfectPerMasteryDefault : 0;
}

/* =========================================================================
   §3i's "USE COMBINATION RUNES"

   Transmutation's toggle, which lives here because `state.artisan` is the
   artisan wing's one save key. A combination rune replaces several lower
   runes with a single higher one, so the toggle genuinely changes what a cast
   COSTS. The spell data carries both lists — `runes` and `comboRunes` — and
   this writes the live one into `consumes`, which is the only thing the tick
   loop reads. The player has chosen a different reagent mix; the engine takes
   the mix that is live at the moment the cast completes.
   ========================================================================= */

export function comboRunesEnabled(game) {
  const st = game.state.artisan;
  return st ? !!st.comboRunes : false;
}

export function setComboRunes(game, on) {
  const st = artisanState(game, true);
  st.comboRunes = !!on;
  applyComboRunes(game);
}

export function applyComboRunes(game) {
  const skill = game.db.skill("transmutation");
  if (!skill) return;
  const on = comboRunesEnabled(game);
  for (const r of skill.recipes) {
    if (!r.materials || !r.runes) continue;
    const runes = on && r.comboRunes ? r.comboRunes : r.runes;
    r.consumes = [...r.materials, ...runes];
  }
}

/* =========================================================================
   PASSIVE RESOLUTION
   ========================================================================= */

/** Is this station's timer live? Pure function of state, on both paths. */
function stationLive(game, stationId) {
  const st = stationState(game, stationId);
  if (!st || !st.recipeId) return false;
  if (activeStationId(game) === stationId) return false;
  return true;
}

/** Take the inputs for one passive cook, honouring preservation (§7.2). */
function passiveConsume(game, recipe, scopes) {
  const preserve = game.mods().preserve(scopes);
  for (const [id, qty] of recipe.consumes || []) if (game.count(id) < qty) return false;
  for (const [id, qty] of recipe.consumes || []) {
    for (let i = 0; i < qty; i++) if (!game.rng.chance(preserve)) game.takeItem(id, 1);
  }
  return true;
}

/**
 * One passive cook completing. Produces into the stockpile, never into the
 * bank, and never pays XP or mastery — see the header for why.
 */
function passiveCook(game, stationId) {
  const st = stationState(game, stationId);
  const skill = game.db.skill(SKILL);
  const recipe = game.db.recipe(st.recipeId);
  st.ticks = passiveIntervalTicks(game, st.recipeId);

  if (!recipe || game.skillLevel(SKILL) < recipe.level) return;
  const cap = skill.stockpileCap || 20;
  if (stockpileCount(game, stationId) >= cap) return;
  const scopes = [SKILL, recipe.id];
  if (!passiveConsume(game, recipe, scopes)) return;

  /* The same quality roll the active cook makes, from the same numbers. */
  let outId = recipe.produces;
  const q = skill.quality;
  if (q) {
    const lvl = game.masteryLevel(SKILL, recipe.id);
    const success = Math.min(1, q.successBase + q.successPerMastery * lvl);
    if (!game.rng.chance(success)) return;
    const perfect = Math.min(1, (q.perfectPerMastery || 0) * lvl);
    if (perfect > 0 && game.rng.chance(perfect)) outId = `perfect-${recipe.produces}`;
  }

  let qty = 1;
  if (game.rng.chance(game.mods().sum(MOD.doubleChance, scopes))) qty *= 2;
  st.stock[outId] = Math.min(cap, (st.stock[outId] || 0) + qty);
}

/* =========================================================================
   POTIONS
   ========================================================================= */

/** Which Alchemy recipe makes this potion — for the recipe-scoped duration. */
function recipeForPotion(db, itemId) {
  for (const r of db.skill("alchemy")?.recipes || []) if (r.produces === itemId) return r;
  return null;
}

/** How long one dose of `itemId` would last right now, in seconds. */
export function doseSeconds(game, itemId) {
  const it = game.db.item(itemId);
  if (!it?.potion) return 0;
  const r = recipeForPotion(game.db, itemId);
  const bonus = game.mods().sum("potionDuration", ["alchemy", r ? r.id : null]);
  return it.potion.seconds * (1 + bonus);
}

/**
 * Drink one. A second dose of the same potion REPLACES the first rather than
 * stacking it — two live copies of the same modifier would double a bonus the
 * player only paid for once, which is precisely the kind of silent
 * multiplication §7.1 exists to prevent.
 */
export function drinkPotion(game, itemId) {
  const it = game.db.item(itemId);
  if (!it?.potion) return "not a potion";
  if (game.count(itemId) < 1) return "none held";
  const st = artisanState(game, true);
  game.takeItem(itemId, 1);
  const ticks = Math.max(1, secondsToTicks(doseSeconds(game, itemId)));
  const existing = st.potions.find((p) => p.itemId === itemId);
  if (existing) existing.ticks = ticks;
  else st.potions.push({ itemId, ticks });
  game._invalidate();
  return null;
}

/** Every live dose: [{ itemId, name, ticks, seconds, text }]. */
export function activePotions(game) {
  const st = game.state.artisan;
  if (!st) return [];
  return st.potions.map((p) => {
    const it = game.db.item(p.itemId);
    return { itemId: p.itemId, name: it.name, ticks: p.ticks, seconds: ticksToSeconds(p.ticks), text: it.potion.text };
  });
}

/** Stop a dose early. */
export function clearPotion(game, itemId) {
  const st = game.state.artisan;
  if (!st) return;
  const before = st.potions.length;
  st.potions = st.potions.filter((p) => p.itemId !== itemId);
  if (st.potions.length !== before) game._invalidate();
}

/* =========================================================================
   THE SYSTEM
   ========================================================================= */

/** Ticks until the next passive cook or the next dose running out. */
function nextEvent(game) {
  const st = game.state.artisan;
  if (!st) return Infinity;
  let m = Infinity;
  for (const id of Object.keys(st.stations)) {
    if (!stationLive(game, id)) continue;
    const s = st.stations[id];
    if (s.ticks > 0 && s.ticks < m) m = s.ticks;
  }
  for (const p of st.potions) if (p.ticks > 0 && p.ticks < m) m = p.ticks;
  return m;
}

/**
 * Advance by exactly k ticks: decrement everything live, then resolve what
 * hit zero. Resolution never decrements, so a jump of k and k single steps
 * land in the same place — the property the selftest hashes.
 */
function tick(game, k) {
  const st = game.state.artisan;
  if (!st) return;

  const done = [];
  for (const id of Object.keys(st.stations)) {
    if (!stationLive(game, id)) continue;
    const s = st.stations[id];
    s.ticks -= k;
    if (s.ticks <= 0) done.push(id);
  }

  let expired = false;
  for (const p of st.potions) {
    p.ticks -= k;
    if (p.ticks <= 0) expired = true;
  }
  if (expired) {
    st.potions = st.potions.filter((p) => p.ticks > 0);
    game._invalidate();
  }

  for (const id of done) passiveCook(game, id);
}

/** Live potion modifiers, into the same additive set everything else feeds. */
function mods(game, set) {
  const st = game.state.artisan;
  if (!st || !st.potions.length) return;
  for (const p of st.potions) {
    if (p.ticks <= 0) continue;
    const it = game.db.item(p.itemId);
    if (!it?.potion) continue;
    for (const [name, value, sym] of it.potion.mods) {
      set.add(name, value, {
        scope: !sym || sym === "global" ? null : sym,
        source: `${it.name} (potion)`,
      });
    }
  }
}

const system = {
  id: "artisan",
  nextEvent,
  tick,
  /* ./agility.js's bridge calls `advance` on the older shape; both names
     point at the same function so the module works under either. */
  advance: tick,
  mods,
};

registerExoticHook(system);

export default system;
