/* =========================================================================
   EMBERVEIL — SKILL-VIEW REGISTRY

   ../skills.js is a DISPATCHER, not a screen. It renders §2's universal skill
   header — the one block every skill page in the reference opens with — and
   then hands the rest of the page to whichever view matches the skill's
   `kind`. This file is the only place that mapping lives, exactly as
   ../registry.js is the only place the nav-tab mapping lives.

   ---------------------------------------------------------------------------
   TO ADD A SKILL VIEW
   ---------------------------------------------------------------------------
     1. write src/js/screens/skill-views/<kind>.js, default-exporting a view
        object (below)
     2. add its import and one entry to VIEWS in this file

   That is the whole contract. Four people can own four archetypes and collide
   on two lines of this file rather than on one 800-line skill screen.

   ---------------------------------------------------------------------------
   THE VIEW OBJECT
   ---------------------------------------------------------------------------
     kind    string      must equal the skill's `kind` in src/data/skills/
     render  (ctx, skill) => Element[]
                         the body of the skill page, BELOW the universal
                         header. Never render the header yourself — the
                         dispatcher owns it, and two copies of the mastery
                         pool bar is the exact failure this registry prevents
     paint   (ctx, skill) => void        OPTIONAL
                         called every engine tick while this skill page is
                         open. Write values in place; the loop runs at 20Hz

   `ctx` is the shell context documented in ../registry.js.

   ---------------------------------------------------------------------------
   THE FALLBACK
   ---------------------------------------------------------------------------
   An unclaimed kind falls back to the gathering view, which renders the flat
   action list every skill can be described by: name, XP, interval, mastery,
   inputs and outputs. It is a genuine, playable page — not a placeholder —
   so a skill whose archetype has not been built yet is still trainable, and
   the fallback simply gets narrower as the other archetypes land.
   ========================================================================= */

import gather from "./gather.js";
import larceny from "./larceny.js";
import agility from "./agility.js";
import summoning from "./summoning.js";
import astrology from "./astrology.js";
import farming from "./farming.js";
import settlement from "./settlement.js";
import artisan from "./artisan.js";

/** kind -> view. The whole mapping. */
export const VIEWS = {
  artisan,
  gather,
  farming,
  settlement,
  larceny,
  /* The exotic wing keys itself off `<view>.kind` so the mapping cannot
     drift from the view's own declaration. Agility declares "route" — it is
     a route skill in the engine, paying Cogs straight out of the action —
     and its view hands any OTHER route skill straight back to `gather`,
     which is exactly what an unclaimed kind gets today. */
  [agility.kind]: agility,
  [summoning.kind]: summoning,
  [astrology.kind]: astrology,
};

/** The view for a skill kind. Never returns undefined; see THE FALLBACK. */
export const viewFor = (kind) => VIEWS[kind] || VIEWS.gather;

/** Which kinds have a purpose-built view, for diagnostics. */
export const viewKinds = () => Object.keys(VIEWS);
