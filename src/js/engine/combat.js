/* =========================================================================
   EMBERVEIL ENGINE — COMBAT RULES   (parity §1 and §3j)

   The eight combat skills, the attack styles, the derived combat level and
   the stat pipeline that turns "what you own and what you have lit" into the
   six numbers the Combat screen prints. No DOM, no state of its own — every
   function here takes a Game and reads it.

   ---------------------------------------------------------------------------
   THE CENTRAL FINDING (§1)
   ---------------------------------------------------------------------------
   Attack, Strength, Defence, Vitality, Ranged, Magic, Devotion and Bounties
   are NOT eight screens. They are eight levels that all route to one Combat
   screen. This module is what makes that true in code: it owns the block, the
   combat-level formula and the XP routing, and ../screens/combat.js is the
   single page they land on.

   ---------------------------------------------------------------------------
   WHERE DAMAGE COMES FROM, AND WHY LEVELS ARE A SMALL TERM
   ---------------------------------------------------------------------------
   The relic ladder in ../../data/shop/ladder.js is the FLAT SPINE: nine rungs
   from +5 to +33,000 max hit, and every published figure in the balance
   report is measured against it. Three more layers sit on top of it, all of
   them percentages, all of them landing in the same additive buckets (§7.1):

     ARMOUR      ../../data/equipment.js — up to +46% acc / +36% hit / +70% eva
     DEVOTIONS   two lit at a time, paid for by the swing
     ATTACK STYLE a signed trade, and the skill your XP goes to
     LEVELS      LEVEL_STAT_SCALE per level of the skill the style trains

   A LEVEL IS WORTH TWICE AS MUCH TO YOUR AIM AS TO YOUR DAMAGE. The level
   term is LEVEL_STAT_SCALE on accuracy and evasion and HALF of it on max hit,
   and that ratio is the single most load-bearing number in this file.

   Damage is the relic ladder's job. A spine you can also buy by levelling is
   not a spine: at a full percent per level a capped weapon skill would double
   every published endgame figure on its own, and every band the economy is
   checked against with it. Aim is the right thing for a level to buy anyway,
   because it self-limits — hit chance is the binding constraint in the early
   and middle game, where you are fighting things whose evasion is close to
   your accuracy, and it saturates on its own at the top, where accuracy is
   already several times a monster's evasion. So a quarter-percent per level
   is worth a great deal at level 20 and almost nothing at 99, which is the
   shape a support term should have. Damage keeps a small share of it so that
   Strength is not a bar with nothing behind it.

   Levels also buy ACCESS, which is the larger half: relics gate on Attack,
   armour on Defence, devotions on Devotion, contracts on Bounties.
   ========================================================================= */

import { DAMAGE_REDUCTION_CAP, LEVEL_STAT_SCALE, HIT_CHANCE_CAP } from "./constants.js";

/** The modifier scope every combat source writes to and reads from. */
export const COMBAT_SCOPE = "combat";

/** The five weapon skills — the ones an attack style can train. */
export const WEAPON_SKILLS = ["attack", "strength", "defence", "ranged", "magic"];

/** §1's whole COMBAT menu block, in the order the reference lists it. */
export const COMBAT_BLOCK = [
  "attack", "strength", "defence", "vitality", "ranged", "magic", "devotion", "bounties",
];

/** Modifier scopes in play for any combat action. */
export const COMBAT_SCOPES = [COMBAT_SCOPE, ...COMBAT_BLOCK];

/* =========================================================================
   ATTACK STYLES   (§3j "Attack Style: Stab / Slash / Block")

   Every style is a TRADE plus an XP destination. Stab is the neutral one — no
   modifiers at all — which is what makes it the safe default and what keeps
   the balance sandbox measuring the same combat it measured yesterday.

   The three melee styles are the reference's own Stab / Slash / Block. The
   ranged and magic styles come from the same screen's ranged and magic modes;
   Longrange and Warded split their XP with Defence, which is the mechanism
   that lets a ranged or magic player ever wear plate.

   `xp` is a list of [skillId, share]; shares sum to 1 so no style pays more
   total combat XP than another. Trading XP breadth for stat focus is the
   choice, not trading XP volume.
   ========================================================================= */
export const ATTACK_STYLES = [
  {
    id: "stab", name: "Stab", type: "melee", scales: "attack",
    xp: [["attack", 1]], text: "No trade. Trains Attack.",
    mods: [],
  },
  {
    id: "slash", name: "Slash", type: "melee", scales: "strength",
    xp: [["strength", 1]], text: "+6% max hit, -6% accuracy. Trains Strength.",
    mods: [["maxHitPercent", 0.06, COMBAT_SCOPE], ["accuracyPercent", -0.06, COMBAT_SCOPE]],
  },
  {
    id: "block", name: "Block", type: "melee", scales: "defence",
    xp: [["defence", 1]], text: "+14% evasion, -8% max hit. Trains Defence.",
    mods: [["evasionPercent", 0.14, COMBAT_SCOPE], ["maxHitPercent", -0.08, COMBAT_SCOPE]],
  },
  {
    id: "accurate", name: "Accurate", type: "ranged", scales: "ranged",
    xp: [["ranged", 1]], text: "+9% accuracy, -5% max hit. Trains Ranged.",
    mods: [["accuracyPercent", 0.09, COMBAT_SCOPE], ["maxHitPercent", -0.05, COMBAT_SCOPE]],
  },
  {
    id: "rapid", name: "Rapid", type: "ranged", scales: "ranged",
    xp: [["ranged", 1]], text: "-0.3s attack interval, -12% max hit. Trains Ranged.",
    mods: [["intervalFlat", 0.3, COMBAT_SCOPE], ["maxHitPercent", -0.12, COMBAT_SCOPE]],
  },
  {
    id: "longrange", name: "Longrange", type: "ranged", scales: "ranged",
    xp: [["ranged", 0.5], ["defence", 0.5]], text: "+16% evasion, -8% accuracy. Trains Ranged and Defence.",
    mods: [["evasionPercent", 0.16, COMBAT_SCOPE], ["accuracyPercent", -0.08, COMBAT_SCOPE]],
  },
  {
    id: "focus", name: "Focus", type: "magic", scales: "magic",
    xp: [["magic", 1]], text: "+11% max hit, -9% evasion. Trains Magic.",
    mods: [["maxHitPercent", 0.11, COMBAT_SCOPE], ["evasionPercent", -0.09, COMBAT_SCOPE]],
  },
  {
    id: "warded", name: "Warded", type: "magic", scales: "magic",
    xp: [["magic", 0.5], ["defence", 0.5]], text: "+16% evasion, -10% max hit. Trains Magic and Defence.",
    mods: [["evasionPercent", 0.16, COMBAT_SCOPE], ["maxHitPercent", -0.10, COMBAT_SCOPE]],
  },
];

export const STYLE_BY_ID = new Map(ATTACK_STYLES.map((s) => [s.id, s]));
export const DEFAULT_STYLE = "stab";

/** The three damage types, for the §3j "Damage Type / Attack Type" readout. */
export const DAMAGE_TYPES = { melee: "Melee", ranged: "Ranged", magic: "Magic" };

export function styleOf(state) {
  return STYLE_BY_ID.get(state?.style) || STYLE_BY_ID.get(DEFAULT_STYLE);
}

/* =========================================================================
   COMBAT LEVEL

   The reference's own derived number — "Combat Level 96" at the top of §1's
   menu — computed from Defence, Vitality and half of Devotion, plus the best
   of the three offensive routes. It is a READOUT, never an input: nothing in
   the engine reads it, which is why it can be a display formula without
   moving a single balance number.
   ========================================================================= */
export function combatLevel(levels) {
  const base = 0.25 * (levels.defence + levels.vitality + Math.floor(levels.devotion / 2));
  const melee = 0.325 * (levels.attack + levels.strength);
  const ranged = 0.325 * Math.floor(levels.ranged * 1.5);
  const magic = 0.325 * Math.floor(levels.magic * 1.5);
  return Math.floor(base + Math.max(melee, ranged, magic));
}

/* =========================================================================
   THE STAT PIPELINE

   One function, six numbers, and every one of them auditable: base + summed
   flats, times one plus the summed percentages, exactly as §7.1 requires.
   ========================================================================= */

/**
 * @param {object} base   db.playerBase
 * @param {ModifierSet} m the assembled modifier set
 * @param {string[]} scopes  COMBAT_SCOPES
 * @param {number} styleLevel  level of the skill the active style trains
 */
export function combatStats(base, m, scopes, styleLevel, defenceLevel) {
  /* Aim scales with the skill the style trains, footwork with Defence, and
     damage with half of the same term — see the note at the top. */
  const levels = Math.max(0, styleLevel - 1);
  const aimBonus = 1 + LEVEL_STAT_SCALE * levels;
  const damageBonus = 1 + (LEVEL_STAT_SCALE / 2) * levels;
  const defenceBonus = 1 + LEVEL_STAT_SCALE * Math.max(0, defenceLevel - 1);

  const maxHit = Math.max(1, Math.floor(
    (base.maxHit + m.sum("maxHit", scopes)) * (1 + m.sum("maxHitPercent", scopes)) * damageBonus
  ));
  const accuracy =
    (base.accuracy + m.sum("accuracy", scopes)) * (1 + m.sum("accuracyPercent", scopes)) * aimBonus;
  const evasion =
    (base.evasion + m.sum("evasion", scopes)) * (1 + m.sum("evasionPercent", scopes)) * defenceBonus;
  const damageReduction = Math.min(DAMAGE_REDUCTION_CAP, Math.max(0, m.sum("damageReduction", scopes)));

  return { maxHit, accuracy, evasion, damageReduction, minHit: 1 };
}

/** The §3j "Chance to Hit" readout, and the number the engine actually rolls. */
export function hitChance(accuracy, evasion) {
  return Math.min(HIT_CHANCE_CAP, accuracy / (accuracy + evasion));
}

/** Incoming damage after §7.2's capped, additive damage reduction. */
export function afterReduction(damage, damageReduction) {
  return Math.max(0, Math.floor(damage * (1 - damageReduction)));
}

/* =========================================================================
   LARCENY'S SHARE OF THE COMBAT MODEL   (§3h, §7.5)

   The stun skill borrows the HP bar and the food, so its two formulas live
   here next to the ones they borrow from rather than in the skill file.
   ========================================================================= */

/** §7.5 — success = min(1, (100 + Stealth) / (100 + Perception)). */
export function larcenySuccess(stealth, perception, stealthBase = 100) {
  return Math.min(1, (stealthBase + stealth) / (stealthBase + perception));
}

/**
 * §7.5 — the double-item chance climbs on stealth against perception, and is
 * guaranteed once stealth reaches four times perception. Expressed as a
 * fraction of the way there so it is a smooth ramp rather than a cliff.
 */
export function larcenyDoubleChance(stealth, perception) {
  if (perception <= 0) return 1;
  return Math.min(1, Math.max(0, stealth / (4 * perception)));
}
