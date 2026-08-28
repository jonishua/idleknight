/* =========================================================================
   EMBERVEIL — SCREEN REGISTRY

   The shell (../play.js) owns the chrome: topbar, hero, the progress panel,
   the three axis cards, the tick loop. It owns NO knowledge of which screens
   exist. That lives here, and only here — there is no switch statement to
   edit anywhere else in the app.

   ---------------------------------------------------------------------------
   TO ADD A SCREEN
   ---------------------------------------------------------------------------
     1. write src/js/screens/<id>.js, default-exporting a screen object (below)
     2. add its import and one entry to SCREENS in this file
     3. add a <button class="nav__item" data-tab="<id>"> to index.html

   That is the whole contract. Two people can add two screens at once and
   collide on three lines of this file rather than on a 600-line shell.

   ---------------------------------------------------------------------------
   THE SCREEN OBJECT
   ---------------------------------------------------------------------------
     id      string      must equal the nav button's data-tab
     label   string      human name, for diagnostics
     render  (ctx) => Element[]
                         build the screen from scratch; the returned nodes are
                         appended to #main under the shared header panels
     paint   (ctx) => void            OPTIONAL
                         called every engine tick while this screen is the
                         active one. Write values in place — never rebuild
                         DOM here, the loop runs at 20Hz
     reset   () => void               OPTIONAL
                         called when the player enters this tab, before
                         render(). Clear any drill-down state the screen keeps
     chrome  (ctx) => boolean         OPTIONAL, defaults to true
                         whether the shell should draw its progress panel and
                         three axis cards above this screen. Return false when
                         the screen already shows the same thing — an open
                         skill page renders §2's universal header, whose XP bar
                         IS the progress panel, and two copies of one bar cost
                         220px of a 844px phone to say the same number twice

   ---------------------------------------------------------------------------
   THE CONTEXT OBJECT
   ---------------------------------------------------------------------------
   Screens never import the shell; everything they need arrives as `ctx`:

     game        the live Game instance (a getter — always current)
     TICK_MS     engine tick length in ms
     SAVE_KEY    localStorage key
     toast(msg, kind?)   transient message; kind is "", "violet" or "bad"
     markDirty()         request a full re-render on the next tick
     render()            re-render right now
     goTab(id)           switch tabs as if the nav button were pressed
     save()              force a save
     set(id, text)       paint helper: write textContent if it changed
     fill(id, pct)       paint helper: set a .bar__fill --fill percentage

   DB and the ./ui.js helpers are imported directly by each screen, because
   they are static and shared rather than shell state.
   ========================================================================= */

import skills from "./skills.js";
import combat from "./combat.js";
import bank from "./bank.js";
import shop from "./shop.js";
import stats from "./stats.js";
import completion from "./completion.js";
import settings from "./settings.js";
import equipment from "./equipment.js";
import { screen as larceny } from "./skill-views/larceny.js";

/** Registration order. Nav order lives in index.html; this is just the list.
 *
 *  `completion` and `stats` are registered without a nav button of their own:
 *  they are §1's OTHER block, and on a five-slot tab bar that block shares the
 *  "settings" tab, which opens them. Registering them anyway means the day the
 *  shell grows a wider nav they each take a slot with no further wiring. */
export const SCREENS = [skills, combat, bank, shop, stats, completion, settings, equipment, larceny];

const BY_ID = new Map(SCREENS.map((s) => [s.id, s]));

/** The screen for a nav tab id, or undefined. */
export const screen = (id) => BY_ID.get(id);

/** Every registered id, for the boot-time nav cross-check. */
export const screenIds = () => [...BY_ID.keys()];
