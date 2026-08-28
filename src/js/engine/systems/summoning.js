/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: SUMMONING   (parity §3f)

   THE ONE GENUINELY CROSS-CUTTING MECHANIC IN THE GAME.

   A mark does not drop from Summoning. It drops from the skill the familiar
   is marked in — the Stonewarden Mole's mark falls out of Mining, the Reef
   Lantern's out of Fishing — so this system hangs off `afterAction`, which
   fires on the completion of every action in every skill. Mining's file does
   not know Summoning exists, and it never will: the hook goes through the
   systems registry, not through anybody else's module.

   THE THREE RULES §3f STATES, AND WHERE EACH ONE IS
   -------------------------------------------------
     "the first mark must be converted into a tablet before more of that mark
      can drop"        -> `crafted` gates every level past the first, and it is
                          set by `afterAction` when a craft of that tablet
                          completes. Discovery is fast and the second level is
                          gated on actually visiting the screen.
     "having the familiar equipped doubles its mark rate"
                       -> x2 in `rollMarks`.
     "31 / 61 marks found"
                       -> `found(game)`, counted off the same state.

   DETERMINISM. Mark rolls draw from THEIR OWN serialised stream, kept at
   `state.summoning.rng`, rather than from `game.rng`. Two reasons, and the
   second is the important one:

     1. an offline replay must reproduce the marks exactly, so the stream has
        to be part of the save — `Math.random()` is unusable and a stream held
        only in memory is the same bug with extra steps;
     2. a roll on every action in every skill, drawn from the MAIN stream,
        would shift every other roll in the game by one draw. Every measured
        number in the balance report would move the day this file landed, and
        it would move for a reason that has nothing to do with the skill being
        measured. A private stream costs four words in the save and keeps the
        rest of the engine bit-identical.

   The whole slice is created lazily, so a save that has never trained a
   marked skill has no `state.summoning` key at all.
   ========================================================================= */

import { Rng } from "../rng.js";
import { MOD } from "../modifiers.js";
import {
  FAMILIARS, FAMILIAR_BY_ID, MARKS_BY_SKILL, MARK_MAX_LEVEL, FAMILIAR_SLOTS,
  SYNERGIES, synergyFor, tabletsPerCraft, tabletId, craftId, markChanceAt,
} from "../../../data/familiars.js";
import { registerExoticHook } from "./agility.js";

/** recipe id -> familiar, so the completion hook is a lookup, never a scan. */
const FAM_BY_CRAFT = new Map(FAMILIARS.map((f) => [craftId(f.id), f]));

export const TOTAL_MARKS = FAMILIARS.length;

/* =========================================================================
   STATE
   ========================================================================= */

function fresh(game) {
  /* Seeded off the main stream's current word so the seed is a function of
     the save, not of the wall clock — the same tick reached by any path
     produces the same seed. */
  const seed = (game.rng.save()[0] ^ 0x5c1d21af) >>> 0;
  return {
    marks: {},                                   // famId -> { level, crafted }
    equipped: new Array(FAMILIAR_SLOTS).fill(null),
    rng: new Rng(seed).save(),
    discovered: 0,
  };
}

export function sumState(game, create = false) {
  const s = game.state;
  if (!s.summoning && create) s.summoning = fresh(game);
  return s.summoning || null;
}

/** The private stream, rebuilt on demand after a load. */
function stream(game, st) {
  if (!game.__markRng) game.__markRng = new Rng(st.rng);
  return game.__markRng;
}
function keep(st, rng) {
  const s = rng.s;
  st.rng[0] = s[0]; st.rng[1] = s[1]; st.rng[2] = s[2]; st.rng[3] = s[3];
}

export const markOf = (game, famId) => game.state.summoning?.marks?.[famId] || null;
export const markLevel = (game, famId) => markOf(game, famId)?.level || 0;
export const isEquipped = (game, famId) => !!game.state.summoning?.equipped?.includes(famId);

/** "31 / 61 marks found" — the counter the screen opens with. */
export function found(game) {
  const st = game.state.summoning;
  if (!st) return 0;
  let n = 0;
  for (const k of Object.keys(st.marks)) if (st.marks[k].level > 0) n++;
  return n;
}

/* =========================================================================
   MARK DISCOVERY  —  fired off OTHER skills' actions
   ========================================================================= */

/** Can this mark still deepen right now? */
function deepenable(st, fam) {
  const m = st && st.marks[fam.id];
  if (!m) return true;                                  // never found
  if (m.level >= MARK_MAX_LEVEL) return false;
  return !!m.crafted;                                   // §3f's first-tablet rule
}

function rollMarks(game, skillId) {
  const fams = MARKS_BY_SKILL.get(skillId);
  if (!fams) return;
  const st = game.state.summoning;

  /* Cheap gate first: if nothing in this skill can deepen, do not even ask
     the engine for a level. This runs after EVERY action in the game. */
  let any = false;
  for (const f of fams) if (deepenable(st, f)) { any = true; break; }
  if (!any) return;

  const lvl = game.skillLevel("summoning");
  const bonus = 1 + game.mods().sum("markRate", ["summoning"]);
  let live = st;
  let rng = null;

  for (const f of fams) {
    if (f.level > lvl) continue;
    if (!deepenable(live, f)) continue;
    if (!live) live = sumState(game, true);
    if (!rng) rng = stream(game, live);
    let p = markChanceAt(f.mark, live.marks[f.id]?.level || 0) * bonus;
    if (live.equipped.includes(f.id)) p *= 2;           // §3f: equipped doubles it
    if (!rng.chance(p)) continue;
    const m = live.marks[f.id] || (live.marks[f.id] = { level: 0, crafted: false });
    m.level = Math.min(MARK_MAX_LEVEL, m.level + 1);
    live.discovered = found(game);
    game._invalidate();                                 // batch size moved
  }
  if (rng) keep(live, rng);
}

/* =========================================================================
   TABLETS  —  crafted, then spent one per action
   ========================================================================= */

/** Completing a craft satisfies §3f's "must be converted into a tablet". */
function noteCraft(game, recipeId) {
  const fam = FAM_BY_CRAFT.get(recipeId);
  if (!fam) return;
  const st = sumState(game, true);
  const m = st.marks[fam.id] || (st.marks[fam.id] = { level: 0, crafted: false });
  if (m.level < 1) m.level = 1;                         // crafting it IS finding it
  if (!m.crafted) { m.crafted = true; game._invalidate(); }
  st.discovered = found(game);
}

/**
 * One tablet per equipped familiar per completed action. Summoning is the
 * only modifier source in the game that is consumed as it is used, which is
 * what stops a full pair of familiars from being a permanent free upgrade —
 * and an empty slot un-equips itself rather than silently doing nothing.
 */
function spendTablets(game, st) {
  for (let i = 0; i < st.equipped.length; i++) {
    const id = st.equipped[i];
    if (!id) continue;
    if (!game.takeItem(tabletId(id), 1)) {
      st.equipped[i] = null;
      game._invalidate();
    }
  }
}

/* =========================================================================
   EQUIPPING
   ========================================================================= */

export function canEquip(game, famId) {
  const f = FAMILIAR_BY_ID.get(famId);
  if (!f) return "no such familiar";
  if (game.count(tabletId(famId)) < 1) return "no tablets";
  return null;
}

export function equip(game, famId, slot) {
  const reason = canEquip(game, famId);
  if (reason) return reason;
  const st = sumState(game, true);
  const at = st.equipped.indexOf(famId);
  if (at >= 0) st.equipped[at] = null;                  // never twice
  st.equipped[slot] = famId;
  game._invalidate();
  return null;
}

export function unequip(game, slot) {
  const st = game.state.summoning;
  if (!st) return "nothing equipped";
  st.equipped[slot] = null;
  game._invalidate();
  return null;
}

/** The synergy the current pair forms, or null. */
export function activeSynergy(game) {
  const st = game.state.summoning;
  if (!st) return null;
  return synergyFor(st.equipped[0], st.equipped[1]);
}

/** Every synergy, flagged with whether it is live and whether it is reachable. */
export function synergyList(game) {
  const st = game.state.summoning;
  const eq = st ? st.equipped : [];
  return SYNERGIES.map((s) => ({
    ...s,
    live: eq.includes(s.pair[0]) && eq.includes(s.pair[1]),
    known: s.pair.every((id) => markLevel(game, id) > 0),
  }));
}

/* =========================================================================
   MODIFIERS
   ========================================================================= */

function mods(game, set) {
  const st = game.state.summoning;

  /* The mark level IS the batch size. Only the recipe currently being worked
     can matter this tick, which is the same rule the engine's own recipe-
     scoped mastery unlocks follow. */
  const a = game.state.action;
  if (a && a.skillId === "summoning") {
    const fam = FAM_BY_CRAFT.get(a.recipeId);
    if (fam) {
      const extra = tabletsPerCraft(st?.marks?.[fam.id]?.level || 0) - 1;
      if (extra > 0) {
        set.add(MOD.flatQuantity, extra, {
          scope: a.recipeId,
          source: `${fam.name} mark ${st.marks[fam.id].level}`,
        });
      }
    }
  }

  if (!st) return;
  for (const id of st.equipped) {
    if (!id) continue;
    const f = FAMILIAR_BY_ID.get(id);
    if (!f) continue;
    for (const [name, value, scope] of f.mods) {
      set.add(name, value, {
        scope: scope === "global" ? null : scope,
        source: `Familiar — ${f.name}`,
      });
    }
  }
  const syn = synergyFor(st.equipped[0], st.equipped[1]);
  if (syn) {
    for (const [name, value, scope] of syn.mods) {
      set.add(name, value, {
        scope: scope === "global" ? null : scope,
        source: `Synergy — ${syn.name}`,
      });
    }
  }
}

/* =========================================================================
   THE HOOK
   ========================================================================= */

function afterAction(game, skillId, recipeId) {
  if (skillId === "summoning") noteCraft(game, recipeId);
  const st = game.state.summoning;
  if (st && (st.equipped[0] || st.equipped[1])) spendTablets(game, st);
  rollMarks(game, skillId);
}

/**
 * ...and the same thing for a player swing.
 *
 * §3f says marks drop while training "the associated skill", and five of the
 * twenty-five skills a familiar can be associated with are combat skills.
 * Before this hook existed they could not be: combat never called
 * `_completeAction`, so an hour of fighting consumed no tablets and dropped
 * no marks, and Summoning's cost side was payable only by players who never
 * fought. A familiar that raises max hit was funded entirely by Alchemy.
 *
 * A swing is charged exactly as an action is — one tablet per equipped
 * familiar. At a 2.4-3.0 s attack interval that is roughly 1,200 swings an
 * hour, so a full pair costs about 2,400 tablets an hour against the ~8,300
 * an hour the endgame craft produces. The ratio is deliberately the same
 * shape as the non-combat one: a familiar pair is affordable, and it is not
 * free.
 *
 * `styleSkillId` is the weapon skill the current attack style trains, which
 * is what a combat-marked familiar is marked in — so switching from Attack
 * to Ranged switches which marks can fall, exactly as switching from Mining
 * to Fishing does.
 */
function afterCombatAction(game, styleSkillId) {
  const st = game.state.summoning;
  if (st && (st.equipped[0] || st.equipped[1])) spendTablets(game, st);
  rollMarks(game, styleSkillId);
}

/* No background timer: marks only fall while something is being done. */
const system = {
  id: "summoning",
  /* No timer, and no `nextEvent`/`tick`: ./agility.js installs the shared
     prototype bridge for the whole wing on the first loop iteration. */
  mods,
  afterAction,
  afterCombatAction,
};

registerExoticHook(system);

export default system;
