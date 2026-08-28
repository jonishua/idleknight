/* =========================================================================
   EMBERVEIL — SKILL: SUMMONING   (parity §3f)

   One skill, one file. Edit this file to change SUMMONING and nothing else;
   register it in ./index.js. See ./index.js for the shared design rules
   (checkpoint ladder, mastery unlock levels, time-to-cap intent).

   Twenty familiars, so the mastery pool caps at exactly 10,000,000 by the
   500,000-a-recipe rule — which is the number the reference's own Summoning
   pool sits at.

   THE RECIPE LIST IS ONLY HALF THE SKILL. Creating a tablet is an ordinary
   artisan action on the flat 5.00 s interval; the other half is mark
   discovery, which happens on the completion of actions in OTHER skills and
   lives in src/js/engine/systems/summoning.js. That system is registered
   through the engine's systems registry rather than reaching into any other
   skill's file, which is the only way a cross-cutting mechanic can be built
   without every skill in the game knowing about it.

   Mastery uses the reference's own Summoning constant of 4.85 s (§2.1), so
   interval reduction genuinely multiplies mastery per second here — this is
   an artisan, not a gatherer.
   ========================================================================= */

import { FAMILIARS, craftId, tabletId } from "../familiars.js";
import "../items/index.js"; // the twenty tablets must exist before validate()

const SUMMONING = {
  id: "summoning",
  name: "Summoning",
  /* Its own `kind`, because its page is nothing like an artisan recipe list —
     the skill-view registry keys on this field (see
     src/js/screens/skill-views/registry.js). */
  kind: "summoning",
  blurb: "Marks found while doing something else, bound into tablets and spent one action at a time.",
  mastery: true,
  masteryActionTime: { fixed: 4.85 },
  intervalMode: "flat",
  baseInterval: 5.0,

  recipes: FAMILIARS.map((f) => ({
    id: craftId(f.id),
    name: `${f.name} Tablet`,
    level: f.level,
    xp: f.xp,
    consumes: f.consumes,
    shards: f.shards,
    produces: tabletId(f.id),
  })),

  checkpoints: [
    { pct: 0.10, name: "Marked Eye",   text: "+5% Summoning mastery XP",           mods: [["masteryXP", 0.05, "skill"]] },
    { pct: 0.25, name: "Even Hand",    text: "+8% chance to preserve tablet inputs", mods: [["preserveChance", 0.08, "skill"]] },
    { pct: 0.50, name: "Tablet Charter", text: "+50% Cogs from tablet sales",      mods: [["saleValue", 0.5, "skill"]] },
    /* The prestige slot. `markRate` is read by the Summoning system and by
       nothing else: half again as many marks, in every skill in the game at
       once, which is the only bonus in Emberveil that makes you better at
       the things you are not currently doing. */
    { pct: 0.95, name: "Marksense",    text: "+50% mark discovery rate in ALL skills", mods: [["markRate", 0.50, "global"]] },
  ],

  /* Speed here is FLAT seconds, never a percentage: `intervalPercent` is one
     shared additive bucket and a mastered account has already filled it (see
     tools/check-exotic.mjs --caps), while flat reductions subtract after the
     percentages and are bounded only by §4.1's 0.25 s floor. 0.8 s off a
     5.00 s craft is real and the report proves it lands. */
  masteryUnlocks: [
    { level: 1,  text: "Unlocked" },
    { level: 10, text: "+4% preserve on this tablet",     mods: [["preserveChance", 0.04, "recipe"]] },
    { level: 20, text: "-0.3s on this tablet",            mods: [["intervalFlat", 0.3, "recipe"]] },
    { level: 50, text: "+8% preserve on this tablet",     mods: [["preserveChance", 0.08, "recipe"]] },
    { level: 65, text: "+1 tablet per craft",             mods: [["flatQuantity", 1, "recipe"]] },
    { level: 85, text: "-0.5s on this tablet",            mods: [["intervalFlat", 0.5, "recipe"]] },
    { level: 95, text: "+12% preserve on this tablet",    mods: [["preserveChance", 0.12, "recipe"]] },
    { level: 99, text: "+2 tablets per craft",            mods: [["flatQuantity", 2, "recipe"]] },
  ],
};

export default SUMMONING;
