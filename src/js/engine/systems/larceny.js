/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: LARCENY   (parity §3h)

   The NPC/stun skill. One system object, registered in ./index.js, and the
   only place in the engine that knows a skill can hit back.

   WHAT MAKES THIS DIFFERENT FROM EVERY OTHER SKILL
   ------------------------------------------------
   A gathering action always succeeds. A Larceny action is a COIN FLIP, and
   the losing side of it costs real resources:

     success  ->  Cogs (mastery-scaled), and sometimes the area's haul item
     failure  ->  nothing at all, a 3.0 s STUN, and 1..maxHit damage taken
                  from the same hit-point pool a monster draws from

   So the skill eats food, it can kill you, and it is the one non-combat loop
   that must not be left running unattended without provisions. That is why it
   ships with the combat core rather than with the gathering skills.

   THE FOUR NUMBERS, all from the reference
   ----------------------------------------
     success   min(1, (100 + Stealth) / (100 + Perception))            (§7.5)
     stealth   Larceny level + this target's mastery + modifiers       (§2.4)
     interval  3.0 s flat                                             (§4.3)
     stun      3.0 s                                                  (§4.3)

   Perception is fixed per target and cannot be reduced, so the only two
   levers are the skill level and that target's mastery — which is exactly
   what makes mastery matter here more than anywhere else in the game.

   "CONTINUE ON STUN"
   ------------------
   §3h's own toggle. On, the stun is three seconds of downtime and the loop
   resumes. Off, being caught ends the session — which is what a player who is
   pushing a target above their level actually wants, because the alternative
   is coming back to a corpse. Default on: a 50%-success skill that stops on
   every failure is not an idle skill.

   OFFLINE. Larceny is a HP-consuming loop, so it obeys the same explicit
   opt-in as combat: ../game.js refuses to replay it while away unless the
   player has turned offline combat on, for the same reason and with the same
   stop reason.
   ========================================================================= */

import { secondsToTicks, ticksToSeconds } from "../interval.js";
import { larcenySuccess, larcenyDoubleChance } from "../combat.js";
import { STEALTH_BASE } from "../constants.js";

const ID = "larceny";

/* -------------------------------------------------------------------------
   READS — pure, and shared with ../../screens/skill-views/larceny.js so the
   number on the row is the number the engine rolls against. A screen that
   recomputes a success rate is a screen that will disagree with the engine.
   ------------------------------------------------------------------------- */

/** §2.4 — Larceny level + this target's mastery + every stealth modifier. */
export function stealthFor(game, recipe) {
  const skill = game.db.skill(ID);
  const scopes = [ID, recipe.id];
  const perMastery = skill.stealthPerMastery || 0;
  return (
    game.skillLevel(ID) +
    perMastery * game.masteryLevel(ID, recipe.id) +
    game.mods().sum("stealth", scopes)
  );
}

/** §7.5, and the number printed on every row of the §3h target list. */
export function successFor(game, recipe) {
  const skill = game.db.skill(ID);
  return larcenySuccess(stealthFor(game, recipe), recipe.perception, skill.stealthBase ?? STEALTH_BASE);
}

/** Ticks of stun still to serve, 0 when free. */
export const stunTicks = (game) => game.state.larceny?.stun || 0;

/* -------------------------------------------------------------------------
   THE SYSTEM
   ------------------------------------------------------------------------- */

const larceny = {
  id: ID,
  skill: ID,

  /** The slice this system owns on every save. */
  init(state) {
    state.larceny = {
      /** Ticks left on the current stun. 0 when free to act. */
      stun: 0,
      /** §3h's "Continue Thieving on Stun" toggle. */
      continueOnStun: true,
      /** Lifetime counters, for the §3h status line and the stats screen. */
      attempts: 0,
      caught: 0,
    };
  },

  /** A live stun is a real event; the fast loop must not jump over it. */
  nextEvent(game) {
    const l = game.state.larceny;
    return l && l.stun > 0 ? l.stun : Infinity;
  },

  /**
   * Serve k ticks of stun. Runs between the core decrement and the core
   * resolution (see ./index.js), so a stun set by this tick's own
   * completeAction is not also decremented by this tick.
   */
  tick(game, k) {
    const s = game.state;
    const l = s.larceny;
    if (!l || l.stun <= 0) return;
    l.stun -= k;
    if (l.stun > 0) return;
    l.stun = 0;

    /* Only a lift that is actually SERVING this stun may be resumed by it.
       A stun outlives the action that earned it — dying mid-stun clears the
       action but not the timer — and without this guard the next lift the
       player starts would be restarted by the ghost of the last one, one
       interval late, on the first action after every death. */
    const a = s.action;
    if (!a || a.skillId !== ID || !a.paused) return;
    if (!l.continueOnStun) {
      game.stop("stunned");
      return;
    }
    a.paused = false;
    game._startAction();
  },

  /**
   * Resolve one lift. Returns true because this system owns the whole
   * resolution: there is no generic path that can express "half the time you
   * get nothing and take a beating instead".
   */
  completeAction(game, skill, recipe) {
    const s = game.state;
    const l = s.larceny;
    const scopes = [skill.id, recipe.id];
    const m = game.mods();
    l.attempts++;

    const stealth = stealthFor(game, recipe);
    if (!game.rng.chance(larcenySuccess(stealth, recipe.perception, skill.stealthBase ?? STEALTH_BASE))) {
      /* Caught. The order here is load-bearing: the stun is set before the
         damage is applied, so a lift that kills you still leaves a save whose
         action is paused rather than mid-swing. */
      l.caught++;
      const a = s.action;
      if (a) a.paused = true;
      l.stun = secondsToTicks(skill.stunSeconds);

      const dmg = game.rng.range(1, recipe.maxHit);
      game.takeDamage(dmg);
      return true;
    }

    /* --- the haul ------------------------------------------------------ */
    game._payCurrency(recipe.cogs, scopes);

    if (recipe.produces && recipe.hauls) {
      if (game.rng.chance(recipe.hauls * (1 + m.sum("rareChance", scopes)))) {
        /* §7.5's stealth-vs-perception double, on top of the ordinary
           doubling bucket — both are chance-based, so both are additive. */
        const dbl = larcenyDoubleChance(stealth, recipe.perception) + m.sum("doubleChance", scopes);
        game._deliver(recipe.produces, game.rng.chance(dbl) ? 2 : 1);
      }
    }

    /* --- XP and mastery, on success only -------------------------------- */
    const before = game.skillLevel(skill.id);
    s.skills[skill.id].xp += recipe.xp * (1 + m.sum("skillXP", scopes));
    if (game.skillLevel(skill.id) !== before) game._invalidate();

    game._grantMastery(skill, recipe, scopes, m, ticksToSeconds(s.action.intervalTicks));
    return true;
  },
};

export default larceny;
