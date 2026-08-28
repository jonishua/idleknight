/* =========================================================================
   EMBERVEIL ENGINE — THE TICK-SYSTEM REGISTRY

   ../game.js owns the world state and the tick loop. It owns NO knowledge of
   which mechanics exist beyond the three it was born with (an action, a node,
   a fight). Everything else — a stun timer, a crop growing, a settlement
   ticking over — lives one-per-file in this directory and is listed here, and
   only here. There is no switch statement to edit anywhere else in the engine.

   This mirrors ../../screens/registry.js exactly, and for the same reason:
   four people can add four mechanics and collide on two lines of this file
   rather than on a 1,100-line loop.

   ---------------------------------------------------------------------------
   TO ADD A SYSTEM
   ---------------------------------------------------------------------------
     1. write src/js/engine/systems/<id>.js, default-exporting a system object
     2. add its import and one entry to SYSTEMS in this file

   ---------------------------------------------------------------------------
   THE SYSTEM OBJECT
   ---------------------------------------------------------------------------
     id       string
                  unique; also the key it is expected to own on the save

     skill    string                                       OPTIONAL
                  the skill id whose actions this system resolves. When set,
                  ../game.js hands `completeAction` every finished action of
                  that skill instead of running its own generic resolution

     init     (state) => void                              OPTIONAL
                  seed the fields this system owns onto a fresh save. Called
                  by freshState(), so anything written here is part of every
                  new game and part of the save format

     nextEvent (game) => number                            OPTIONAL
                  ticks until this system's next state change, or Infinity.
                  REQUIRED IF THE SYSTEM HOLDS A TIMER. The fast loop jumps
                  straight to min(all events); a timer that does not report
                  itself here gets jumped clean over, and the fast path stops
                  agreeing with the tick-by-tick path — which the selftest
                  checks on every rung of every skill, so it will be caught,
                  but by then the mechanic is written

     tick     (game, k) => void                            OPTIONAL
                  advance this system by exactly k ticks. Called AFTER the
                  core decrement phase and BEFORE the core resolution phase,
                  in registry order, so that:
                    - a timer this system starts during a resolution is not
                      also decremented by the same call, and
                    - unpausing an action here does not let the core loop
                      decrement the action it just restarted.
                  Decrement and resolve inside this one call; never decrement
                  by anything other than k

     afterCombatAction (game, styleSkillId, monsterId) => void   OPTIONAL
                  fired by ../game.js once per PLAYER SWING, from
                  `_playerAttack`, before the accuracy roll. Combat does not
                  go through `_completeAction`, so a system that only hooks
                  actions is dark for as long as a fight is running; this is
                  the signal that makes a swing a first-class action. Do not
                  reach into the combat code to get it another way

     completeAction (game, skill, recipe) => boolean       OPTIONAL
                  resolve one finished action of `skill`. Return true if this
                  system handled it end to end (inputs, outputs, XP, mastery);
                  ../game.js then does the bookkeeping every action shares —
                  the action counter, checkpoint drift, and restarting the
                  timer unless the action was paused

   DETERMINISM. Systems run in registry order, every time, on both loop paths.
   Anything random must draw from `game.rng`, which is part of the save.
   ========================================================================= */

import { registerSystems } from "../game.js";
import larceny from "./larceny.js";
import farming from "./farming.js";
import settlement from "./settlement.js";
import agility from "./agility.js";
import summoning from "./summoning.js";
import astrology from "./astrology.js";
import artisan from "./cooking-stations.js";

/** Registration order, and therefore tick order. */
export const SYSTEMS = [larceny, farming, settlement, agility, summoning, astrology, artisan];

const BY_ID = new Map(SYSTEMS.map((s) => [s.id, s]));
const BY_SKILL = new Map(SYSTEMS.filter((s) => s.skill).map((s) => [s.skill, s]));

/** The system with this id, or undefined. */
export const system = (id) => BY_ID.get(id);

/** The system that resolves this skill's actions, or undefined. */
export const systemForSkill = (skillId) => BY_SKILL.get(skillId);

/** Every registered id, for diagnostics. */
export const systemIds = () => [...BY_ID.keys()];

/** Seed every system's slice onto a fresh save. */
export function initSystems(state) {
  for (const s of SYSTEMS) s.init?.(state);
  return state;
}

/** Ticks until the earliest system event, or Infinity if none are live. */
export function systemsNextEvent(game) {
  let m = Infinity;
  for (const s of SYSTEMS) {
    const e = s.nextEvent?.(game);
    if (e !== undefined && e !== null && e < m) m = e;
  }
  return m;
}

/** Advance every system by exactly k ticks, in registry order. */
export function tickSystems(game, k) {
  for (const s of SYSTEMS) s.tick?.(game, k);
}

/* Hand the list to the engine. The edge runs ONE WAY — systems import
   ../game.js, ../game.js never imports this file — because a system may need
   the Game class itself, and a cycle there evaluates against a class that
   does not exist yet. ../index.js imports this module, so every consumer of
   the engine's public surface has the registry before it can build a Game. */
registerSystems(SYSTEMS);
