/* =========================================================================
   EMBERVEIL — SKILLS, RECIPES, CHECKPOINTS

   Every skill in the game, one module each. The eight COMBAT skills — Attack,
   Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties — carry no
   recipes and no mastery: parity §1's central finding is that they are levels
   and stat contributions, not pages, and all eight route to the single Combat
   screen. They declare `screen: "combat"` so the skills list can say so
   without inferring it.

   ONE SKILL, ONE FILE. Every skill is its own module in this directory and
   this file only lists them, so two people can edit two skills at the same
   time without touching the same bytes.

   Modifier scopes in those files are symbolic — "global", "skill" or "recipe"
   — and the engine resolves them to real ids when it assembles the modifier
   set. Data never hard-codes an id it doesn't own.

   CHECKPOINT LADDER. Every mastery skill spends its four pool checkpoints in
   the same order, which is the structure worth stealing from the reference:

        10%  more mastery XP        (a uniform onboarding gift)
        25%  a throughput or quality-of-life fix
        50%  an economy multiplier
        95%  a prestige or global bonus

   MASTERY LADDER. Every recipe in a skill shares one mastery unlock ladder,
   fired at the levels the reference uses: 1, 10, 20, 50, 65, 85, 95, 99.

   TIME-TO-CAP INTENT. The XP numbers in those files are tuned so the best
   rung of a gathering skill caps it in roughly 190-320 hours and the first
   rung would take about four times as long. That 4x spread inside one skill
   is what makes climbing the content ladder feel like progress rather than
   like the same grind with bigger nouns.
   ========================================================================= */

/* -------------------------------------------------------------------------
   THE REGISTRY.

   One skill, one file. To ADD a skill: drop src/data/skills/<id>.js next to
   this file with a default export, then add its import and one entry to the
   SKILLS array below. Order in that array is the order the UI lists them in,
   and it is the only thing this file decides.
   ------------------------------------------------------------------------- */

import DELVING from "./delving.js";
import BOUGHCRAFT from "./boughcraft.js";
import TRAWLING from "./trawling.js";
import EMBERRITE from "./emberrite.js";
import KILNWORK from "./kilnwork.js";
import HEARTHCRAFT from "./hearthcraft.js";
import SIGILWORK from "./sigilwork.js";
import WAYFARING from "./wayfaring.js";
import ATTACK from "./attack.js";
import STRENGTH from "./strength.js";
import DEFENCE from "./defence.js";
import RANGED from "./ranged.js";
import MAGIC from "./magic.js";
import VITALITY from "./vitality.js";
import DEVOTION from "./devotion.js";
import BOUNTIES from "./bounties.js";
import LARCENY from "./larceny.js";
import BOWCRAFT from "./bowcraft.js";
import CRAFTING from "./crafting.js";
import ALCHEMY from "./alchemy.js";
import TRANSMUTATION from "./transmutation.js";
import ASTROLOGY from "./astrology.js";
import SUMMONING from "./summoning.js";
import AGILITY from "./agility.js";
import FARMING from "./farming.js";
import SETTLEMENT from "./settlement.js";

/* MENU ORDER = REFERENCE ORDER. parity §1 lists the menu in three blocks and
   a fixed order inside each, and this array reproduces it exactly, so the
   skills screen can render the menu by walking the registry rather than by
   keeping a second hand-sorted list that drifts. The blocks are:

     COMBAT       Attack, Strength, Defence, Vitality, Ranged, Magic,
                  Devotion, Bounties          — all eight route to Combat
     PASSIVE      Farming, Settlement
     NON-COMBAT   Woodcutting, Fishing, Firemaking, Cooking, Mining,
                  Smithing, Larceny, Bowcraft, Crafting, Enchanting,
                  Alchemy, Agility, Summoning, Astrology, Transmutation

   Exploration is ours, not the reference's — no Melvor skill maps to it — so
   it sits at the end of NON-COMBAT rather than pretending to a slot in a
   sequence it was never part of. */
export const SKILLS = [
  /* COMBAT — §1: not eight screens, eight levels on one screen. */
  ATTACK,
  STRENGTH,
  DEFENCE,
  VITALITY,
  RANGED,
  MAGIC,
  DEVOTION,
  BOUNTIES,
  /* PASSIVE */
  FARMING,
  SETTLEMENT,
  /* NON-COMBAT */
  BOUGHCRAFT,
  TRAWLING,
  EMBERRITE,
  HEARTHCRAFT,
  DELVING,
  KILNWORK,
  LARCENY,
  BOWCRAFT,
  CRAFTING,
  SIGILWORK,
  ALCHEMY,
  AGILITY,
  SUMMONING,
  ASTROLOGY,
  TRANSMUTATION,
  WAYFARING,
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const MASTERY_SKILLS = SKILLS.filter((s) => s.mastery);
