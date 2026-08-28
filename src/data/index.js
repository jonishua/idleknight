/* =========================================================================
   EMBERVEIL — CONTENT DATABASE

   Assembles items, skills, monsters and the shop into one validated object
   and refuses to boot if the content is inconsistent. A dangling item id in a
   recipe is a bug that only shows up forty hours into a save; catching it at
   load costs nothing.
   ========================================================================= */

import { ITEMS, item, PROVISION_IDS } from "./items.js";
import { SKILLS, SKILL_BY_ID, MASTERY_SKILLS } from "./skills.js";
import { MONSTERS, MONSTER_BY_ID, MONSTER_RESPAWN_SECONDS } from "./monsters.js";
import {
  SHOP, SHOP_BY_ID, WAYSTATION_LIST, WAYSTATION_BY_ID, RELIC_LADDER,
  TOOL_LADDERS, ASCENSION_RITES, PLAYER_BASE, WAYSTATION_SLOTS,
  claspCost, claspCumulative, CLASP_CURVE, CLASP_FLAT_COST,
} from "./shop.js";

/* --- validation ---------------------------------------------------------- */

function validate() {
  const problems = [];
  const seenRecipe = new Set();

  const needItem = (id, where) => {
    if (!ITEMS.has(id)) problems.push(`${where}: unknown item "${id}"`);
  };

  for (const skill of SKILLS) {
    if (!skill.recipes) continue;
    let lastLevel = 0;
    for (const r of skill.recipes) {
      if (seenRecipe.has(r.id)) problems.push(`duplicate recipe id "${r.id}"`);
      seenRecipe.add(r.id);
      if (r.level < lastLevel) problems.push(`${r.id}: recipes must be listed in level order`);
      lastLevel = r.level;
      if (r.produces) needItem(r.produces, r.id);
      for (const [id] of r.consumes || []) needItem(id, r.id);
      if (skill.intervalMode === "range" && !r.range) problems.push(`${r.id}: missing range`);
      if (skill.intervalMode === "perRecipe" && !(r.interval > 0)) problems.push(`${r.id}: missing interval`);
      if (skill.kind !== "route" && !r.produces) problems.push(`${r.id}: produces nothing`);
      if (skill.kind === "route" && !(r.cogs > 0)) problems.push(`${r.id}: route pays nothing`);
    }
  }

  for (const m of MONSTERS) {
    for (const d of m.drops || []) needItem(d.item, m.id);
    /* No `xp` check: combat XP is paid per point of damage, so a monster's
       XP value IS its hit points and there is no separate number to get
       wrong. See ../js/engine/constants.js STYLE_XP_PER_DAMAGE. */
    if (!(m.hp > 0 && m.maxHit > 0 && m.attack > 0)) problems.push(`${m.id}: bad stats`);
  }

  for (const e of SHOP) {
    if (e.requires && !SHOP_BY_ID.has(e.requires)) problems.push(`${e.id}: unknown prerequisite "${e.requires}"`);
    if (e.material) needItem(e.material[0], e.id);
  }
  for (const w of WAYSTATION_LIST) {
    if (w.material) needItem(w.material[0], w.id);
  }

  /* Every item must be reachable: produced by a recipe, dropped by a monster,
     or generated as a perfect variant. An item nothing can obtain is dead
     weight in the reliquary sink and a lie in the balance report. */
  const obtainable = new Set();
  for (const skill of SKILLS) {
    for (const r of skill.recipes || []) {
      if (r.produces) {
        obtainable.add(r.produces);
        if (skill.quality) obtainable.add(`perfect-${r.produces}`);
      }
      if (r.junk) obtainable.add("tangleweed");
    }
  }
  for (const m of MONSTERS) for (const d of m.drops || []) obtainable.add(d.item);
  for (const it of ITEMS.values()) {
    if (!obtainable.has(it.id)) problems.push(`item "${it.id}" cannot be obtained by any means`);
  }

  if (problems.length) {
    throw new Error(`Emberveil content is invalid:\n  - ${problems.join("\n  - ")}`);
  }
}

validate();

/* --- derived indices ----------------------------------------------------- */

const recipeIndex = new Map();
const recipeSkill = new Map();
for (const skill of SKILLS) {
  for (const r of skill.recipes || []) {
    recipeIndex.set(r.id, r);
    recipeSkill.set(r.id, skill.id);
  }
}

/** Recipe counts drive every pool cap: cap = 500,000 x recipeCount. */
export const RECIPE_COUNTS = Object.fromEntries(
  MASTERY_SKILLS.map((s) => [s.id, s.recipes.length])
);

export const DB = {
  items: ITEMS,
  item,
  provisionIds: PROVISION_IDS,
  skills: SKILLS,
  skill: (id) => SKILL_BY_ID.get(id),
  masterySkills: MASTERY_SKILLS,
  recipe: (id) => recipeIndex.get(id),
  recipeSkillId: (id) => recipeSkill.get(id),
  recipeCounts: RECIPE_COUNTS,
  monsters: MONSTERS,
  monster: (id) => MONSTER_BY_ID.get(id),
  monsterRespawnSeconds: MONSTER_RESPAWN_SECONDS,
  shop: SHOP,
  shopEntry: (id) => SHOP_BY_ID.get(id),
  waystations: WAYSTATION_LIST,
  waystation: (id) => WAYSTATION_BY_ID.get(id),
  waystationSlots: WAYSTATION_SLOTS,
  relics: RELIC_LADDER,
  toolLadders: TOOL_LADDERS,
  ascension: ASCENSION_RITES,
  playerBase: PLAYER_BASE,
  claspCost,
  claspCumulative,
  claspCurve: CLASP_CURVE,
  claspFlatCost: CLASP_FLAT_COST,
};

export { ITEMS, SKILLS, MONSTERS, SHOP, claspCost, claspCumulative };
export default DB;
