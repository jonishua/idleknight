/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: AGILITY   (parity §3g)

   A course of eight slots. `Start Agility` begins at the first standing
   obstacle and the course runs forever: when an obstacle completes, this
   system re-points `state.action` at the next standing slot and the loop
   restarts it. The core loop never learns that Agility is a course — it just
   keeps resolving one route action after another, which is exactly why a lap
   boundary replays offline as faithfully as any other tick.

   ---------------------------------------------------------------------------
   THE TWO HOOKS THIS WING NEEDS THAT ./index.js DOES NOT YET OFFER
   ---------------------------------------------------------------------------
   The registry's contract covers a timer (`nextEvent` / `tick`) and per-skill
   resolution (`completeAction`). The exotic wing needs two things neither of
   those can express, so they are installed here, once, by wrapping two
   methods on the prototype of whatever Game instance first reaches us:

     _buildMods   A system that OWNS modifiers has to get them into the set
                  the tick loop reads. A constellation percentage, an
                  obstacle's passive and an equipped familiar are ORDINARY
                  modifiers (§7.1) — they must land in the same additive
                  bucket as a tool or a waystation, which means being added
                  inside `_buildMods` and not applied on the side afterwards.

     _completeAction
                  `completeAction` in the registry is keyed to ONE skill.
                  Summoning's mark discovery fires off the completion of
                  actions in EVERY skill — that is the whole mechanic — so it
                  needs a hook the per-skill contract cannot give it. Agility
                  rides the same wrapper rather than claiming its own skill,
                  which keeps the generic route resolution (currency, XP,
                  mastery, checkpoint drift) in game.js where it belongs and
                  leaves this system with only the course walk.

   NO IMPORT OF ../game.js. `game.js` imports ./index.js, which imports this
   file, so importing the class back would be a cycle and the class would be
   in its temporal dead zone at evaluation time. The prototype is taken from a
   live instance instead, on the first tick — `nextEvent` runs inside
   `_nextEvent`, which the loop calls before it can ever resolve an action, so
   the wrapper is always in place before the first completion.

   WHEN game.js OR ./index.js GROWS `mods` AND `afterAction` HOOKS, delete
   `installExoticHooks` and register the three `{ mods, afterAction }` objects
   there instead. Nothing else in this wing changes.
   ========================================================================= */

import { MOD } from "../modifiers.js";
import { ticksToSeconds } from "../interval.js";
import { SLOTS, OBSTACLE_BY_ID, BLUEPRINT_SLOTS } from "../../../data/obstacles.js";

/* =========================================================================
   THE SHARED PROTOTYPE BRIDGE
   ========================================================================= */

const HOOKS = [];

/** Register a `{ mods?, afterAction? }` participant. Idempotent. */
export function registerExoticHook(hook) {
  if (!HOOKS.includes(hook)) HOOKS.push(hook);
  return hook;
}

/**
 * Install the two wrappers on `game`'s prototype. Safe to call from anywhere,
 * any number of times, on any instance.
 *
 * The module-level flag is checked FIRST and deliberately: this is called from
 * `nextEvent`, which the loop runs on every iteration of a 1,728,000-tick
 * offline replay, and a `getPrototypeOf` on that path is not free.
 */
let INSTALLED = false;
export function ensureHooks(game) {
  if (INSTALLED) return false;
  const G = Object.getPrototypeOf(game);
  if (!G || G.__exoticHooks) { INSTALLED = true; return false; }
  INSTALLED = true;
  G.__exoticHooks = true;

  /* Modifiers. Runs AFTER the base build, so `this._mods` is the finished set
     and a hook may read it — but a hook must never call `this.mods()`, which
     would hand back the half-built set it is standing inside. */
  const baseBuildMods = G._buildMods;
  G._buildMods = function () {
    baseBuildMods.call(this);
    for (const h of HOOKS) if (h.mods) h.mods(this, this._mods);
  };

  /* Completion. The skill and recipe are captured BEFORE the base call,
     because the base may clear or re-point `state.action` — a starved artisan
     stops, and a course walks on. A run that halted resolves nothing more. */
  const baseComplete = G._completeAction;
  G._completeAction = function () {
    const a = this.state.action;
    if (!a) return baseComplete.call(this);
    const skillId = a.skillId, recipeId = a.recipeId;
    baseComplete.call(this);
    if (this.state.stoppedReason) return;
    for (const h of HOOKS) if (h.afterAction) h.afterAction(this, skillId, recipeId);
  };

  /* Anything already cached was built without us. */
  game._invalidate();
  return true;
}

/* =========================================================================
   COURSE STATE

   Created lazily and only when the player actually builds something, so a
   save that has never opened the Agility page carries no `state.agility` key
   and hashes identically with or without this module loaded — which is what
   keeps the selftest's determinism proofs about the rest of the game honest.
   ========================================================================= */

export function courseState(game, create = false) {
  const s = game.state;
  if (!s.agility && create) {
    s.agility = {
      course: new Array(SLOTS.length).fill(null),
      blueprints: new Array(BLUEPRINT_SLOTS).fill(null),
      cursor: 0,
      laps: 0,
    };
  }
  return s.agility || null;
}

/** Which obstacle stands in slot `i`, or null. */
export function builtIn(game, i) {
  const st = game.state.agility;
  return st ? st.course[i] || null : null;
}

/** The standing course, in running order. */
export function courseList(game) {
  const st = game.state.agility;
  if (!st) return [];
  return st.course.filter(Boolean).map((id) => OBSTACLE_BY_ID.get(id));
}

/** Total lap time in seconds, at the modifiers actually in force. */
export function courseSeconds(game) {
  const st = game.state.agility;
  if (!st) return 0;
  let ticks = 0;
  for (const id of st.course) if (id) ticks += game.actionIntervalTicks("agility", id);
  return ticksToSeconds(ticks);
}

/** What one lap pays, at the modifiers actually in force. */
export function courseYield(game) {
  const out = { xp: 0, cogs: 0, seconds: courseSeconds(game), obstacles: 0 };
  const st = game.state.agility;
  if (!st) return out;
  const m = game.mods();
  for (const id of st.course) {
    if (!id) continue;
    const o = OBSTACLE_BY_ID.get(id);
    const scopes = ["agility", id];
    out.obstacles++;
    out.xp += o.xp * (1 + m.sum(MOD.skillXP, scopes));
    out.cogs += Math.max(1, Math.floor(o.cogs * (1 + m.sum(MOD.currency, scopes))));
  }
  return out;
}

/* =========================================================================
   BUILDING  (§6.2 — Cogs AND material, and it must be rebuilt to change it)
   ========================================================================= */

/** What the obstacle costs right now, after the 50% / 95% checkpoints. */
export function buildCost(game, obstacleId) {
  const o = OBSTACLE_BY_ID.get(obstacleId);
  if (!o) return null;
  const cut = Math.min(0.9, game.mods().sum(MOD.costReduction, ["agility"]));
  return {
    cogs: Math.floor(o.cost * (1 - cut)),
    material: [o.material[0], Math.max(1, Math.floor(o.material[1] * (1 - cut)))],
    cut,
  };
}

/** null if it can be built right now, else the reason it cannot. */
export function canBuild(game, obstacleId) {
  const o = OBSTACLE_BY_ID.get(obstacleId);
  if (!o) return "no such obstacle";
  const lvl = game.skillLevel("agility");
  if (lvl < SLOTS[o.slot].level) return "slot locked";
  if (lvl < o.level) return "level too low";
  const c = buildCost(game, obstacleId);
  if (game.state.cogs < c.cogs) return "not enough Cogs";
  if (game.count(c.material[0]) < c.material[1]) return "not enough materials";
  return null;
}

/**
 * Build an obstacle into its slot, paying for it. Whatever stood there is
 * demolished: the reference makes you rebuild to reconfigure, and that is
 * what turns a stat screen into a recurring drain.
 */
export function build(game, obstacleId) {
  const reason = canBuild(game, obstacleId);
  if (reason) return reason;
  const o = OBSTACLE_BY_ID.get(obstacleId);
  const c = buildCost(game, obstacleId);
  game.state.cogs -= c.cogs;
  game.state.stats.cogsSpent += c.cogs;
  game.takeItem(c.material[0], c.material[1]);
  const st = courseState(game, true);
  st.course[o.slot] = obstacleId;
  game._invalidate();
  return null;
}

/** Tear one down. Free, and refunds nothing — the Cogs are spent. */
export function demolish(game, slot) {
  const st = courseState(game);
  if (!st || !st.course[slot]) return "nothing built";
  st.course[slot] = null;
  game._invalidate();
  if (running(game)) retarget(game);
  return null;
}

/* =========================================================================
   BLUEPRINTS  (Save Blueprint / Load Blueprint)

   A blueprint is a saved list of obstacle ids. Saving is free. LOADING PAYS —
   it builds every obstacle in the blueprint that is not already standing, at
   what it costs today. That is the honest reading of the reference: a
   blueprint saves you the tapping, never the Cogs.
   ========================================================================= */

export function saveBlueprint(game, index, name) {
  const st = courseState(game, true);
  if (index < 0 || index >= st.blueprints.length) return "no such blueprint";
  if (!st.course.some(Boolean)) return "nothing to save";
  st.blueprints[index] = { name: name || `Blueprint ${index + 1}`, course: st.course.slice() };
  return null;
}

/** What loading it would cost right now. */
export function blueprintCost(game, index) {
  const st = game.state.agility;
  const bp = st && st.blueprints[index];
  if (!bp) return null;
  let cogs = 0;
  const materials = new Map();
  for (let i = 0; i < bp.course.length; i++) {
    const id = bp.course[i];
    if (!id || st.course[i] === id) continue;
    const c = buildCost(game, id);
    cogs += c.cogs;
    materials.set(c.material[0], (materials.get(c.material[0]) || 0) + c.material[1]);
  }
  return { cogs, materials };
}

export function loadBlueprint(game, index) {
  const st = courseState(game, true);
  const bp = st.blueprints[index];
  if (!bp) return "no such blueprint";
  const c = blueprintCost(game, index);
  if (game.state.cogs < c.cogs) return "not enough Cogs";
  for (const [id, qty] of c.materials) if (game.count(id) < qty) return "not enough materials";
  for (let i = 0; i < bp.course.length; i++) {
    const id = bp.course[i];
    if (!id) { st.course[i] = null; continue; }
    if (st.course[i] === id) continue;
    const reason = build(game, id);
    if (reason) return reason;
  }
  game._invalidate();
  if (running(game)) retarget(game);
  return null;
}

/* =========================================================================
   RUNNING THE COURSE
   ========================================================================= */

/** Start Agility — from the first standing obstacle. */
export function startCourse(game) {
  ensureHooks(game);
  const st = courseState(game);
  if (!st) return "no obstacles built";
  const first = st.course.findIndex(Boolean);
  if (first < 0) return "no obstacles built";
  st.cursor = first;
  return game.start("agility", st.course[first]) ? null : "level too low";
}

export function stopCourse(game) {
  if (running(game)) game.stop();
  return null;
}

/** True while the course is the running action. */
export function running(game) {
  return game.state.action?.skillId === "agility" && !game.state.combat;
}

/** Point the live action at whatever stands in the cursor's slot. */
function retarget(game) {
  const st = game.state.agility;
  const a = game.state.action;
  if (!st || !a || a.skillId !== "agility") return;
  const id = st.course[st.cursor];
  if (!id) { game.stop(); return; }
  if (a.recipeId !== id) {
    a.recipeId = id;
    game._invalidate();
    game._startAction();
  }
}

/**
 * One obstacle done: walk to the next standing slot, wrapping at the end and
 * counting a lap.
 *
 * A course with one obstacle simply repeats it, and a player who has never
 * built anything has no course at all — which is the case the selftest's
 * determinism sweep runs on every rung of this skill, so the empty course
 * must be a clean no-op and nothing here may draw from the RNG.
 */
function afterAction(game, skillId, recipeId) {
  if (skillId !== "agility") return;
  const st = game.state.agility;
  const a = game.state.action;
  if (!st || !a) return;
  const n = st.course.length;
  if (st.course[st.cursor] !== recipeId) {
    /* Started from an action row rather than Start Agility. Honour that: run
       the obstacle they picked, and only take the course over if it is in it. */
    const at = st.course.indexOf(recipeId);
    if (at < 0) return;
    st.cursor = at;
  }
  for (let k = 1; k <= n; k++) {
    const j = (st.cursor + k) % n;
    if (!st.course[j]) continue;
    if (j <= st.cursor) st.laps++;
    st.cursor = j;
    break;
  }
  retarget(game);
}

/* =========================================================================
   MODIFIERS — every standing obstacle's signed passive (§7.4)
   ========================================================================= */

function mods(game, set) {
  const st = game.state.agility;
  if (!st) return;
  for (const id of st.course) {
    if (!id) continue;
    const o = OBSTACLE_BY_ID.get(id);
    if (!o) continue;
    for (const [name, value, scope] of o.mods) {
      set.add(name, value, {
        scope: scope === "global" ? null : scope === "skill" ? "agility" : scope,
        source: `Agility — ${o.name}`,
      });
    }
  }
}

/** Every passive the course is granting — the §3g "View all Global Active
 *  Passives from Agility" panel. */
export function activePassives(game) {
  const st = game.state.agility;
  if (!st) return [];
  const out = [];
  for (const id of st.course) {
    if (!id) continue;
    const o = OBSTACLE_BY_ID.get(id);
    for (const [name, value, scope] of o.mods) {
      out.push({
        obstacle: o.name, name, value,
        scope: scope === "skill" ? "agility" : scope,
      });
    }
  }
  return out;
}

/* =========================================================================
   THE SYSTEM OBJECT

   Agility holds no background timer — a course only turns while it is the
   foreground action — so `nextEvent` reports Infinity and `tick` does
   nothing. Both are still here because `nextEvent` is the earliest guaranteed
   call into this module and is therefore where the prototype bridge goes in.
   ========================================================================= */

const system = {
  id: "agility",
  /* Agility holds no timer of its own; `nextEvent` exists because it is the
     earliest and cheapest guaranteed call into this wing, and is therefore
     where the prototype bridge goes in. The other two systems in the wing
     deliberately expose neither `nextEvent` nor `tick`, so the hot loop pays
     for this exactly once per iteration rather than three times. */
  nextEvent(game) { ensureHooks(game); return Infinity; },
  mods,
  afterAction,
};

registerExoticHook(system);

export default system;
