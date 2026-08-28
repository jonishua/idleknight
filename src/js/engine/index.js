/* =========================================================================
   EMBERVEIL ENGINE — public surface

   The whole systems core, DOM-free. A UI layer imports from here and never
   reaches into the internals.

       import { Game, DB } from "./src/js/engine/index.js";
       const game = new Game(DB, { autoSell: false });
       game.start("delving", "vein-cinder-shale");
       game.advance(20);                       // one second
       const summary = game.offlineReplay(Date.now());
   ========================================================================= */

export * from "./constants.js";
export * from "./xp.js";
export * from "./rng.js";
export * from "./modifiers.js";
export * from "./interval.js";
export * from "./mastery.js";
export * from "./format.js";
export { Game, freshState, canonical } from "./game.js";
/* The tick-system registry installs itself into ./game.js when it loads, and
   ./game.js deliberately does not import it back (see the note there). This
   line is what guarantees every consumer of the public surface has the
   systems registered before it can construct a Game. */
export { SYSTEMS, system, systemIds } from "./systems/index.js";
export * from "./combat.js";
export { measure, positioned, economyRates, secondsPerUnit, sustained, REFERENCE_WAYSTATIONS } from "./sandbox.js";
export { runSelftest, parseReference, scanForbidden, shippedStrings } from "./selftest.js";
export { default as DB } from "../../data/index.js";
