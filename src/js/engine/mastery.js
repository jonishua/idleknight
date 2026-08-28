/* =========================================================================
   EMBERVEIL ENGINE — MASTERY   (§2)

   Every recipe in every non-combat skill carries its own mastery level 1-99,
   on the same XP table as the skill itself.

   MXP per action (§2.1):

     MXP = [ (UnlockedActions * PlayerTotalMasteryInSkill / MaxTotalMastery)
           + (ItemMasteryLevel * TotalItemsInSkill / 10) ]
           * ActionTime * 0.5 * (1 + Bonus)

   Two readable halves:
     term 1 scales with how far along you are in the WHOLE skill — its maximum
            contribution is exactly UnlockedActions, i.e. +1 per fully mastered
            recipe;
     term 2 scales with THIS recipe's own level times a tenth of the recipe
            count.
   So mastery accelerates hard as you go, and a skill with many recipes masters
   far faster than one with few. That is the intended shape, not a side effect.

   ActionTime is where gathering and artisan skills split:
     gathering -> the ACTUAL seconds the action took, so mastery per second is
                  invariant to interval reduction. Speeding up a gatherer buys
                  loot, not mastery.
     artisan   -> a fixed constant per skill, so interval reduction DOES
                  multiply mastery per second.
   ========================================================================= */

import {
  POOL_PER_RECIPE,
  POOL_DEPOSIT,
  POOL_DEPOSIT_CAPPED,
  CHECKPOINTS,
  MASTERY_CAP,
  MXP_SCALE,
  TOKEN_POOL_FRACTION,
  SKILL_CAP,
} from "./constants.js";
import { xpAt } from "./xp.js";

/**
 * @param {object} a
 * @param {number} a.unlockedActions        recipes the player has unlocked here
 * @param {number} a.totalMasteryInSkill    sum of every recipe's mastery LEVEL
 * @param {number} a.totalItemsInSkill      recipe count for the skill
 * @param {number} a.itemMasteryLevel       this recipe's mastery level
 * @param {number} a.actionTime             seconds (see the split above)
 * @param {number} [a.bonus]                summed masteryXP modifiers
 */
export function masteryXpPerAction({
  unlockedActions,
  totalMasteryInSkill,
  totalItemsInSkill,
  itemMasteryLevel,
  actionTime,
  bonus = 0,
}) {
  const maxTotalMastery = totalItemsInSkill * MASTERY_CAP;
  const term1 = maxTotalMastery > 0 ? (unlockedActions * totalMasteryInSkill) / maxTotalMastery : 0;
  const term2 = (itemMasteryLevel * totalItemsInSkill) / 10;
  return (term1 + term2) * actionTime * MXP_SCALE * (1 + bonus);
}

/* ------------------------------------------------------------------------
   THE POOL
   ------------------------------------------------------------------------ */

/** §2.2 — the rule, verified against six real skills: 500,000 x recipeCount. */
export function poolCapBase(recipeCount) {
  return POOL_PER_RECIPE * recipeCount;
}

/**
 * The cap the player can actually hold. Three late sources raise it
 * +25% / +50% / +25%, stacking additively to +100%. Raising the cap does NOT
 * move the checkpoint thresholds — that is the point of it: it makes the 95%
 * checkpoint easy to hold while still banking XP.
 */
export function poolCap(recipeCount, capBonus = 0) {
  return Math.floor(poolCapBase(recipeCount) * (1 + capBonus));
}

/** 25% of every mastery XP point, or 50% once the skill itself is capped. */
export function poolDepositRate(skillLevel) {
  return skillLevel >= SKILL_CAP ? POOL_DEPOSIT_CAPPED : POOL_DEPOSIT;
}

/** Absolute pool XP a checkpoint fires at. Always measured on the BASE cap. */
export function checkpointXp(recipeCount, fraction) {
  return poolCapBase(recipeCount) * fraction;
}

/** All four thresholds for a skill, in order. */
export function checkpointThresholds(recipeCount) {
  return CHECKPOINTS.map((f) => checkpointXp(recipeCount, f));
}

/**
 * §2.3 — checkpoints are LIVE thresholds, not unlocks. Spend the pool back
 * down below one and the bonus turns off until it is re-earned. That tension
 * is the whole reason the pool is interesting, so it is recomputed on read and
 * never latched.
 * @returns {boolean[]} one flag per checkpoint, in CHECKPOINTS order
 */
export function activeCheckpoints(poolXp, recipeCount) {
  const base = poolCapBase(recipeCount);
  return CHECKPOINTS.map((f) => poolXp >= base * f);
}

/** A mastery token refills 0.1% of the pool cap. */
export function tokenValue(recipeCount, capBonus = 0) {
  return Math.floor(poolCap(recipeCount, capBonus) * TOKEN_POOL_FRACTION);
}

/**
 * Pool XP needed to push a recipe from its current mastery XP to `level`.
 * Pool XP is spent 1:1 against the same table the skill uses.
 */
export function poolCostToLevel(currentMasteryXp, level) {
  return Math.max(0, xpAt(Math.min(level, MASTERY_CAP)) - currentMasteryXp);
}

/**
 * Deposit into the pool, destroying overflow above the cap (§2.2).
 * @returns {{pool: number, wasted: number}}
 */
export function depositToPool(pool, amount, cap) {
  const next = pool + amount;
  if (next <= cap) return { pool: next, wasted: 0 };
  return { pool: cap, wasted: next - cap };
}
