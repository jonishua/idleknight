/* =========================================================================
   EMBERVEIL ENGINE — THE TICK LOOP AND THE WORLD STATE   (§3)

   No DOM, no timers, no globals. The whole game is a plain object plus a
   function that moves it forward N ticks. Everything else — the UI, the
   offline replay, the balance report — is a caller.

   TWO WAYS TO ADVANCE, AND THEY MUST AGREE
   ----------------------------------------
   `advance(n)`            jumps straight to the next scheduled event.
   `advance(n, {naive:1})` steps one tick at a time.

   Both funnel through the same `_advanceBy(k)`: decrement every live timer by
   k, then resolve whatever hit zero, in a fixed order. Because k is chosen as
   the minimum over live timers, no timer can be skipped past, so the fast path
   is not an approximation of the slow one — it is the same computation with
   the no-ops removed. The selftest asserts they produce identical state
   hashes over hundreds of thousands of ticks, which is the only honest way to
   claim a replay is exact.

   That matters because 24 h of offline is 1,728,000 ticks and has to resolve
   in well under a second on a phone. With the event jump it costs one
   iteration per completed action instead of one per tick.

   OFFLINE IS REPLAYED, NOT EXTRAPOLATED
   -------------------------------------
   `offlineReplay()` re-runs the real loop, so mastery levels gained mid-flight
   change the rate for the ticks that follow, materials genuinely run out,
   nodes genuinely deplete and respawn, and the adept can genuinely die.
   Freezing the rate at the starting mastery level is a bug, not a shortcut.
   ========================================================================= */

import {
  TICK_MS, TICKS_PER_SECOND, OFFLINE_CAP_MS, OFFLINE_CAP_TICKS,
  SKILL_CAP, ASCENSION_CAP, MASTERY_CAP, SAVE_VERSION,
  VITALITY_XP_PER_DAMAGE, STYLE_XP_PER_DAMAGE, REGEN_INTERVAL_TICKS, REGEN_FRACTION,
  BASE_MAX_HP, HP_PER_VITALITY_LEVEL, HIT_CHANCE_CAP,
  RELIQUARY_FREE_SLOTS, COMBAT_SCOPE, LOOT_SLOTS, DEVOTION_SLOTS,
} from "./constants.js";
import { xpAt, levelAt } from "./xp.js";
import { Rng } from "./rng.js";
import { ModifierSet, MOD, clamp } from "./modifiers.js";
import { intervalTicks, secondsToTicks, ticksToSeconds, rollRangeBaseTicks } from "./interval.js";
import {
  masteryXpPerAction, poolCap, poolDepositRate, activeCheckpoints, depositToPool,
} from "./mastery.js";
import {
  COMBAT_SCOPES, COMBAT_BLOCK, WEAPON_SKILLS, ATTACK_STYLES, STYLE_BY_ID,
  DEFAULT_STYLE, styleOf, combatLevel, combatStats, hitChance, afterReduction,
} from "./combat.js";
import { WEARABLE_SLOTS, BASE_EQUIPMENT_SETS, MAX_EQUIPMENT_SETS } from "../../data/equipment.js";

/* ------------------------------------------------------------------------
   Scope symbols in the data files resolve to real ids here, so content never
   hard-codes an id it does not own.
   ------------------------------------------------------------------------ */
function resolveScope(sym, skillId, recipeId) {
  if (sym == null || sym === "global") return null;
  if (sym === "skill") return skillId;
  if (sym === "recipe") return recipeId;
  return sym;
}

/* ========================================================================
   THE TICK-SYSTEM REGISTRY — installed, not imported

   ./systems/index.js lists every registered mechanic and calls
   registerSystems() when it loads. This module does NOT import it back.

   That direction is not a style preference, it is the only one that works: a
   system may legitimately need the Game class itself — to reach into the
   prototype, or to start an action on the player's behalf — and a system
   module that imports ../game.js while ../game.js is importing the registry
   is a cycle whose second half evaluates against a class that does not exist
   yet. Inverting the edge makes the rule simple and permanent: SYSTEMS KNOW
   THE ENGINE, THE ENGINE DOES NOT KNOW THE SYSTEMS.

   ./index.js imports ./systems/index.js, so every consumer of the engine's
   public surface gets the registry populated before it can build a Game.
   ======================================================================== */

let SYSTEMS = [];
let SYSTEM_BY_SKILL = new Map();
/* Pre-filtered, because these two are the hottest loops in the engine: a 24 h
   replay calls them once per resolved event, and an optional-method check
   inside that loop is a per-system branch on every one of them. */
let SYSTEMS_TICK = [];
let SYSTEMS_EVENT = [];
let SYSTEMS_SWING = [];

/** Called once, by ./systems/index.js. */
export function registerSystems(list) {
  SYSTEMS = list;
  SYSTEM_BY_SKILL = new Map(list.filter((s) => s.skill).map((s) => [s.skill, s]));
  SYSTEMS_TICK = list.filter((s) => typeof s.tick === "function");
  SYSTEMS_EVENT = list.filter((s) => typeof s.nextEvent === "function");
  SYSTEMS_SWING = list.filter((s) => typeof s.afterCombatAction === "function");
  return SYSTEMS;
}

/* THE COMBAT COMPLETION SIGNAL.

   Everything outside combat lands in `_completeAction()`, and the exotic wing
   hangs its `afterAction` hook off that. Combat does not go through it: the
   tick resolver branches `if (combat) ... else if (action)`, so for as long
   as a fight was running, `_completeAction` never fired and every hook that
   depended on it was simply switched off. An hour of fighting consumed no
   tablets and dropped no marks — Summoning and combat were two games sharing
   a save file.

   A player swing IS an action: it costs time, it pays XP, it is the unit the
   whole combat economy is priced in. So it gets its own signal, dispatched
   the same way through the same registry, and no system reaches into the
   combat code to get it. */
function afterCombatSwing(game, styleSkillId, monsterId) {
  for (const s of SYSTEMS_SWING) s.afterCombatAction(game, styleSkillId, monsterId);
}

export const registeredSystems = () => SYSTEMS;
const systemForSkill = (skillId) => SYSTEM_BY_SKILL.get(skillId);

function initSystems(state) {
  for (const s of SYSTEMS) s.init?.(state);
  return state;
}

function systemsNextEvent(game) {
  let m = Infinity;
  for (let i = 0; i < SYSTEMS_EVENT.length; i++) {
    const e = SYSTEMS_EVENT[i].nextEvent(game);
    if (e < m) m = e;
  }
  return m;
}

function tickSystems(game, k) {
  for (let i = 0; i < SYSTEMS_TICK.length; i++) SYSTEMS_TICK[i].tick(game, k);
}

/* ========================================================================
   FRESH STATE
   ======================================================================== */

export function freshState(db, { seed = 0x51ede1, now = 0 } = {}) {
  const skills = {};
  for (const s of db.skills) {
    skills[s.id] = { xp: 0, pool: 0, mastery: {} };
  }
  const state = {
    version: SAVE_VERSION,
    tick: 0,
    lastSaveAt: now,
    rng: new Rng(seed).save(),
    cogs: 0,
    shards: 0,
    seals: 0,
    marks: 0,             // Bounty Marks — only contracts pay them
    items: {},
    skills,
    purchases: {},        // shopId -> count
    waystations: [],      // built waystation ids, max db.waystationSlots
    clasps: 0,            // purchased reliquary clasps
    action: null,
    node: null,
    combat: null,
    food: null,
    offlineCombat: false, // §3: combat offline is opt-in, because it can kill you
    stoppedReason: null,

    /* --- the combat core (§3j) --------------------------------------------
       HP is null when FULL rather than a number equal to the maximum. Vitality
       levels raise that maximum, and a save that stored an absolute 100 would
       come back from a level-up still capped at 100 until something healed it;
       worse, a sandbox that sets Vitality to 99 directly would resume a 1,090
       HP adept on 100 HP and die on the first swing. Null means "whatever full
       is right now", which is always the truthful answer. */
    hp: null,
    regen: REGEN_INTERVAL_TICKS,
    areaId: null,         // which combat area the fight was picked from
    style: DEFAULT_STYLE, // §3j Attack Style — decides the XP destination
    prayer: 0,            // Devotion points, drained per player attack
    devotions: [],        // lit devotion ids, at most DEVOTION_SLOTS
    bounty: null,         // { tierId, monsterId, remaining, total }
    equipment: { active: 0, sets: [{}, {}] },
    loot: {},             // §3j Loot to Collect, itemId -> qty
    autoLoot: false,      // off: drops queue in the container, as the reference does

    stats: {
      actions: 0, kills: 0, deaths: 0,
      cogsEarned: 0, cogsSpent: 0, poolWasted: 0, itemsLost: 0,
      provisionsEaten: 0, damageDealt: 0, damageTaken: 0,
      bountiesDone: 0, relicsOffered: 0, lootDestroyed: 0,
    },
  };
  /* Every registered tick system seeds the fields it owns. */
  return initSystems(state);
}

/* ========================================================================
   THE GAME
   ======================================================================== */

export class Game {
  /**
   * @param {object} db   the content database
   * @param {object} [opts]
   * @param {object} [opts.state]     an existing save to resume
   * @param {boolean} [opts.autoSell] sell sellable output the moment it is made
   */
  constructor(db, opts = {}) {
    this.db = db;
    this.autoSell = !!opts.autoSell;
    this.state = opts.state ? structuredClone(opts.state) : freshState(db, opts);
    this.rng = new Rng(this.state.rng);

    /* Which skill produced which item — so a "+50% from bough sales" modifier
       knows what it is allowed to multiply. */
    this.producedBy = new Map();
    for (const s of db.skills) {
      for (const r of s.recipes || []) {
        if (r.produces) {
          this.producedBy.set(r.produces, s.id);
          this.producedBy.set(`perfect-${r.produces}`, s.id);
        }
      }
    }
    for (const m of db.monsters) for (const d of m.drops || []) this.producedBy.set(d.item, COMBAT_SCOPE);

    this._modsDirty = true;
    this._mods = null;
    /** Cleared by _invalidate(); see unlockedActions() for why they exist. */
    this._unlockedCache = new Map();
    this._masteryTotalCache = new Map();
    /** Last-seen checkpoint pattern per skill; see _checkCheckpointDrift. */
    this._ckSig = Object.create(null);
    for (const s of db.masterySkills) {
      this._ckSig[s.id] = this.checkpointsFor(s.id).map((b) => (b ? 1 : 0)).join("");
    }
    this._usedSlots = Object.keys(this.state.items).length;
    /** Runtime-only tally of everything produced, for measurement. Not saved. */
    this.produced = new Map();
  }

  /* --------------------------------------------------------------------
     DERIVED READS
     -------------------------------------------------------------------- */

  get levelCap() {
    return this.hasAscendedCap() ? ASCENSION_CAP : SKILL_CAP;
  }

  hasAscendedCap() {
    return !!this.state.purchases["warden-aureth"];
  }

  /**
   * The eight combat skills are levels, not pages (§1), so there is no single
   * "combat skill" to ask about — but the shell's hero header, the balance
   * report and any save written before the split all say "warding". Both
   * legacy spellings resolve to the skill the CURRENT ATTACK STYLE trains,
   * which is the only answer that keeps a level and its own XP bar agreeing:
   * fight with Slash and the header reads Strength, because Slash is what is
   * being trained. The true derived Combat Level is `combatLevel()`, printed
   * on the Combat screen where §1 puts it.
   */
  _resolveSkillId(id) {
    if (id === "warding" || id === COMBAT_SCOPE) return this.styleSkillId();
    return id;
  }

  skillXp(id) { return this.state.skills[this._resolveSkillId(id)].xp; }
  skillLevel(id) { return levelAt(this.skillXp(id), this.levelCap); }
  masteryXp(skillId, recipeId) { return this.state.skills[skillId].mastery[recipeId] || 0; }
  masteryLevel(skillId, recipeId) { return levelAt(this.masteryXp(skillId, recipeId), MASTERY_CAP); }

  /**
   * Recipes unlocked in a skill — the first term of the MXP formula.
   *
   * Memoised, along with totalMastery() below, because BOTH are read on every
   * completed action and both walk the whole recipe list; totalMastery calls
   * levelAt() per recipe, which is a binary search. On a two-second artisan
   * rung that is half a million binary searches inside one 24 h replay, and
   * the replay has a 250 ms budget on a phone. Both caches are cleared by
   * _invalidate(), which is already called on every skill level-up and every
   * mastery level-up — the only two events that can change either answer.
   */
  unlockedActions(skillId) {
    const hit = this._unlockedCache.get(skillId);
    if (hit !== undefined) return hit;
    const skill = this.db.skill(skillId);
    const lvl = this.skillLevel(skillId);
    let n = 0;
    for (const r of skill.recipes || []) if (r.level <= lvl) n++;
    this._unlockedCache.set(skillId, n);
    return n;
  }

  /** Sum of every recipe's mastery LEVEL in a skill. */
  totalMastery(skillId) {
    const hit = this._masteryTotalCache.get(skillId);
    if (hit !== undefined) return hit;
    const skill = this.db.skill(skillId);
    let total = 0;
    for (const r of skill.recipes || []) total += this.masteryLevel(skillId, r.id);
    this._masteryTotalCache.set(skillId, total);
    return total;
  }

  poolCapFor(skillId) {
    const count = this.db.recipeCounts[skillId] || 0;
    return poolCap(count, this.mods().sum(MOD.poolCap, skillId));
  }

  checkpointsFor(skillId) {
    return activeCheckpoints(this.state.skills[skillId].pool, this.db.recipeCounts[skillId] || 0);
  }

  reliquarySlots() {
    return RELIQUARY_FREE_SLOTS + this.state.clasps;
  }

  /**
   * Memoised on Vitality's XP and the current cap. The regeneration timer
   * reads this TWICE PER TICK, and levelAt() is a binary search over a
   * 200-entry table — 3.5 million searches inside one 24 h replay was
   * measurably most of the offline budget.
   */
  maxHp() {
    const xp = this.state.skills.vitality.xp;
    const cap = this.levelCap;
    if (this._maxHpKey !== xp || this._maxHpCap !== cap) {
      this._maxHpKey = xp;
      this._maxHpCap = cap;
      this._maxHp = BASE_MAX_HP + HP_PER_VITALITY_LEVEL * levelAt(xp, cap);
    }
    return this._maxHp;
  }

  /** Live hit points. `state.hp === null` means "full", whatever full is now. */
  hp() {
    const max = this.maxHp();
    const v = this.state.hp;
    return v == null ? max : Math.max(0, Math.min(max, v));
  }

  /**
   * Write hit points once, in one place, and mirror them into the live fight.
   * `combat.pHp` is a READOUT for the shell, not a second source of truth —
   * two places that both claim to know your HP is how a heal goes missing.
   */
  _setHp(v) {
    const max = this.maxHp();
    const next = Math.max(0, Math.min(max, Math.floor(v)));
    this.state.hp = next >= max ? null : next;
    if (this.state.combat) this.state.combat.pHp = next;
    return next;
  }

  /**
   * Damage from any source — a monster's swing or a caught Larceny lift.
   *
   * ORDER IS LOAD-BEARING: apply, then EAT, then check for death. Checking
   * first means the auto-ward never gets to save you and an endgame fight
   * ends on the first big hit; the whole food economy stops existing and the
   * balance report quietly reports a fortieth of the real combat income.
   */
  takeDamage(raw) {
    const dmg = afterReduction(raw, this.combatStats().damageReduction);
    if (dmg > 0) {
      this.state.stats.damageTaken += dmg;
      this._setHp(this.hp() - dmg);
    }
    this._maybeEat();
    if (this.hp() <= 0) {
      this.state.stats.deaths++;
      this.stop("death");
    }
    return dmg;
  }

  /* --- the combat block (§1) ------------------------------------------- */

  /** Every level in §1's COMBAT block, keyed by skill id. */
  combatLevels() {
    const out = {};
    for (const id of COMBAT_BLOCK) out[id] = levelAt(this.state.skills[id].xp, this.levelCap);
    return out;
  }

  /** The reference's derived "Combat Level 96". A readout, never an input. */
  combatLevel() {
    return combatLevel(this.combatLevels());
  }

  /** The active attack style object (§3j). */
  attackStyle() { return styleOf(this.state); }

  /** Which skill the active style trains, and therefore scales its stats. */
  styleSkillId() { return this.attackStyle().scales; }

  setAttackStyle(id) {
    if (!STYLE_BY_ID.has(id)) return "no such style";
    this.state.style = id;
    this._invalidate();
    return null;
  }

  /* --------------------------------------------------------------------
     MODIFIERS — assembled lazily, invalidated on the few events that
     actually change them. Everything in the game reads through here.
     -------------------------------------------------------------------- */

  mods() {
    if (this._modsDirty) this._buildMods();
    return this._mods;
  }

  _buildMods() {
    const m = new ModifierSet();
    const s = this.state;

    for (const [id, count] of Object.entries(s.purchases)) {
      if (!count) continue;
      const e = this.db.shopEntry(id);
      if (!e) continue;
      for (const [name, value, sym] of e.mods || []) {
        m.add(name, value * (e.repeatable ? count : 1), {
          scope: resolveScope(sym, e.skill, null),
          source: e.name,
        });
      }
    }

    for (const id of s.waystations) {
      const w = this.db.waystation(id);
      if (!w) continue;
      for (const [name, value, sym] of w.mods || []) {
        m.add(name, value, { scope: resolveScope(sym, "wayfaring", null), source: w.name });
      }
    }

    /* Checkpoints are LIVE: read the pool now, never a latched flag. */
    for (const skill of this.db.masterySkills) {
      const active = this.checkpointsFor(skill.id);
      skill.checkpoints.forEach((cp, i) => {
        if (!active[i]) return;
        for (const [name, value, sym] of cp.mods || []) {
          m.add(name, value, {
            scope: resolveScope(sym, skill.id, null),
            source: `${skill.name} ${Math.round(cp.pct * 100)}% — ${cp.name}`,
          });
        }
      });
    }

    /* Only the recipe currently being worked contributes recipe-scoped
       mastery unlocks; nothing else can be affected by them this tick. */
    const a = s.action;
    if (a) {
      const skill = this.db.skill(a.skillId);
      if (skill?.mastery) {
        const lvl = this.masteryLevel(a.skillId, a.recipeId);
        for (const u of skill.masteryUnlocks || []) {
          if (lvl < u.level) continue;
          for (const [name, value, sym] of u.mods || []) {
            m.add(name, value, {
              scope: resolveScope(sym, a.skillId, a.recipeId),
              source: `${this.db.recipe(a.recipeId).name} mastery ${u.level}`,
            });
          }
        }
        /* Wayfaring pays +1% Cogs per mastery level on that leg, and so does
           Larceny. §2.4's companion rule — "+1 stealth per mastery level" —
           is deliberately NOT a modifier: the §3h screen prints a success
           rate on every row, including rows that are not running, and a
           recipe-scoped modifier only exists for the action in flight. It is
           computed in stealthFor() instead, where every row can see it. */
        if (skill.currencyPerMastery) {
          m.add(MOD.currency, skill.currencyPerMastery * lvl, {
            scope: a.recipeId, source: `${this.db.recipe(a.recipeId).name} mastery`,
          });
        }
      }
    }

    /* --- worn equipment (§3j) -------------------------------------------
       Only the ACTIVE set contributes. Changing sets is therefore a real
       decision rather than a way to wear twenty-two things at once. */
    for (const [slot, itemId] of Object.entries(this.equipmentSet())) {
      if (!itemId) continue;
      const it = this.db.items.get(itemId);
      if (!it?.equip) continue;
      for (const [name, value, sym] of it.equip.mods || []) {
        m.add(name, value, { scope: resolveScope(sym, COMBAT_SCOPE, null), source: `${it.name} (${slot})` });
      }
    }

    /* --- lit devotions ---------------------------------------------------
       Lit, not owned: a devotion with no points behind it contributes
       nothing, which is what makes prayer points a consumable rather than a
       second permanent upgrade track. */
    if (s.prayer > 0) {
      for (const d of this.litDevotions()) {
        for (const [name, value, sym] of d.mods || []) {
          m.add(name, value, { scope: resolveScope(sym, COMBAT_SCOPE, null), source: d.name });
        }
      }
    }

    /* --- the attack style's trade (§3j) --------------------------------- */
    for (const [name, value, sym] of this.attackStyle().mods || []) {
      m.add(name, value, { scope: resolveScope(sym, COMBAT_SCOPE, null), source: `${this.attackStyle().name} style` });
    }

    this._mods = m;
    this._modsDirty = false;
  }

  _invalidate() {
    this._modsDirty = true;
    this._unlockedCache.clear();
    this._masteryTotalCache.clear();
  }

  /* --------------------------------------------------------------------
     RELIQUARY
     -------------------------------------------------------------------- */

  count(id) { return this.state.items[id] || 0; }

  addItem(id, qty) {
    if (qty <= 0) return;
    const inv = this.state.items;
    if (inv[id] === undefined) {
      if (this._usedSlots >= this.reliquarySlots()) {
        this.state.stats.itemsLost += qty;
        return;
      }
      inv[id] = 0;
      this._usedSlots++;
    }
    inv[id] += qty;
  }

  takeItem(id, qty) {
    const inv = this.state.items;
    const have = inv[id] || 0;
    if (have < qty) return false;
    inv[id] = have - qty;
    if (inv[id] === 0) { delete inv[id]; this._usedSlots--; }
    return true;
  }

  /**
   * Sale price of one unit, after every sale-value modifier that applies.
   *
   * Worth ZERO for an id the registry does not know, rather than throwing.
   * CONTENT is strict — ../../data/index.js refuses to boot on a dangling id,
   * and that is where a real content bug is caught. A SAVE is a different
   * thing: it was written by an older build, and an item that has since been
   * renamed or removed is an ordinary fact of shipping, not a bug. Throwing
   * here takes the entire Bank screen down over one stale stack, which is a
   * much worse answer than pricing it at nothing.
   */
  salePrice(id) {
    const it = this.db.items.get(id);
    if (!it) return 0;
    const scopes = [id, this.producedBy.get(id)];
    return Math.floor(it.value * (1 + this.mods().sum(MOD.saleValue, scopes)));
  }

  sell(id, qty) {
    if (!this.db.items.has(id)) return 0;
    if (!this.takeItem(id, qty)) return 0;
    const gained = this.salePrice(id) * qty;
    this.state.cogs += gained;
    this.state.stats.cogsEarned += gained;
    return gained;
  }

  /**
   * Currency straight from an action — a different bucket from item sales, so
   * a global income bonus cannot double-dip through the sell button.
   *
   * A positive payout never rounds to nothing. Emberrite's Ashright
   * checkpoint refunds 25% of a burnt bough's price, and a Palebirch Bough is
   * worth one Cog: floored, and then trimmed again by a signed waystation
   * carrying -9% currency, that is zero. The single most interesting faucet
   * in the game would have been completely invisible at the exact rung where
   * a player first meets it, and would have silently switched on forty levels
   * later. A faucet that pays nothing is a mechanic nobody learns exists.
   */
  _payCurrency(amount, scopes) {
    const scaled = amount * (1 + this.mods().sum(MOD.currency, scopes));
    const total = amount > 0 ? Math.max(1, Math.floor(scaled)) : Math.floor(scaled);
    this.state.cogs += total;
    this.state.stats.cogsEarned += total;
    return total;
  }

  /* --------------------------------------------------------------------
     STARTING AND STOPPING
     -------------------------------------------------------------------- */

  /**
   * Push the live RNG position back into the save.
   *
   * `state` has to be a VALID SAVE AT EVERY MOMENT, not only immediately
   * after advance(). Trawling rolls its interval the instant an action
   * starts, so `start()` consumes a draw before a single tick has passed;
   * without this sync, `structuredClone(game.state)` taken between start()
   * and the first advance() would restore an RNG rewound by one draw and
   * replay a different session. That is the kind of bug that only shows up
   * as "my offline summary did not match what I got", months later, on one
   * skill. Called at the end of every method that can draw.
   */
  _syncRng() {
    this.state.rng = this.rng.save();
  }

  /** Begin a non-combat action. */
  start(skillId, recipeId) {
    const skill = this.db.skill(skillId);
    const recipe = this.db.recipe(recipeId);
    if (!skill || !recipe) throw new Error(`no such action ${skillId}/${recipeId}`);
    if (this.skillLevel(skillId) < recipe.level) return false;

    this.state.combat = null;
    this.state.stoppedReason = null;
    this.state.action = { skillId, recipeId, ticks: 0, intervalTicks: 0, paused: false };
    this.state.node = skill.node ? { recipeId, hp: 0, respawn: 0, regen: 0 } : null;
    this._invalidate();
    if (this.state.node) this.state.node.hp = this._nodeMaxHp();
    this._startAction();
    this._syncRng();
    return true;
  }

  /**
   * Begin a fight. `action.skillId` is the skill the current attack style
   * trains, so the shell's "which skill is running" question has the same
   * answer here as it does for any other action.
   *
   * HP is NOT restored on engage. Walking away from a losing fight and
   * immediately re-engaging at full health would make the food economy
   * decorative; the pool carries over and regenerates on the clock instead.
   */
  fight(monsterId, areaId = null) {
    const m = this.db.monster(monsterId);
    if (!m) throw new Error(`no such monster ${monsterId}`);
    this.state.action = { skillId: this.styleSkillId(), recipeId: monsterId, ticks: 0, intervalTicks: 0, paused: false };
    this.state.node = null;
    this.state.stoppedReason = null;
    this.state.areaId = areaId ?? this.state.areaId;
    this._invalidate();
    this.state.combat = {
      monsterId,
      mHp: m.hp,
      pHp: this.hp(),
      pTicks: this._playerAttackTicks(),
      mTicks: secondsToTicks(m.attack),
      respawn: 0,
    };
    this._syncRng();
    return true;
  }

  stop(reason = null) {
    this.state.action = null;
    this.state.node = null;
    this.state.combat = null;
    this.state.stoppedReason = reason;
    this._invalidate();
  }

  /* --------------------------------------------------------------------
     INTERVAL AND NODE MATH
     -------------------------------------------------------------------- */

  _scopes(skillId, recipeId) { return [skillId, recipeId]; }

  /** The one formula from §4.1, with this action's modifiers plugged in. */
  actionIntervalTicks(skillId, recipeId, roll = false) {
    const skill = this.db.skill(skillId);
    const recipe = this.db.recipe(recipeId);
    const scopes = this._scopes(skillId, recipeId);
    const m = this.mods();
    const pct = m.intervalReduction(scopes);
    const flat = m.sum(MOD.intervalFlat, scopes);

    let base;
    if (skill.intervalMode === "range") {
      base = roll
        ? ticksToSeconds(rollRangeBaseTicks(this.rng, recipe.range[0], recipe.range[1]))
        : (recipe.range[0] + recipe.range[1]) / 2;
    } else if (skill.intervalMode === "flat") {
      base = skill.baseInterval;
    } else {
      base = recipe.interval;
    }
    return intervalTicks(base, pct, flat);
  }

  _nodeMaxHp() {
    const a = this.state.action;
    if (!a) return 1;
    const skill = this.db.skill(a.skillId);
    if (!skill?.node) return 1;
    const scopes = this._scopes(a.skillId, a.recipeId);
    const mastery = this.masteryLevel(a.skillId, a.recipeId);
    return Math.max(
      1,
      skill.node.baseHp + skill.node.hpPerMastery * mastery + this.mods().sum(MOD.nodeHp, scopes)
    );
  }

  _nodeRespawnTicks() {
    const a = this.state.action;
    const recipe = this.db.recipe(a.recipeId);
    const scopes = this._scopes(a.skillId, a.recipeId);
    const pct = this.mods().sum(MOD.respawnPercent, scopes);
    return Math.max(1, secondsToTicks(recipe.respawn * (1 + pct)));
  }

  _playerAttackTicks() {
    const m = this.mods();
    const pct = m.intervalReduction(COMBAT_SCOPES);
    const flat = m.sum(MOD.intervalFlat, COMBAT_SCOPES);
    return intervalTicks(this.db.playerBase.attackInterval, pct, flat);
  }

  /* --------------------------------------------------------------------
     THE LOOP
     -------------------------------------------------------------------- */

  /** Ticks until the next state-changing event, or Infinity if idle. */
  _nextEvent() {
    const s = this.state;
    let m = Infinity;
    const n = s.node, c = s.combat, a = s.action;
    if (n) {
      if (n.respawn > 0) m = Math.min(m, n.respawn);
      else if (n.hp < this._nodeMaxHp()) m = Math.min(m, n.regen);
    }
    if (c) {
      if (c.respawn > 0) m = Math.min(m, c.respawn);
      else m = Math.min(m, c.pTicks, c.mTicks);
    } else if (a && !a.paused) {
      m = Math.min(m, a.ticks);
    }
    /* Regeneration is not a combat mechanic any more — Larceny drains the
       same pool and an idle adept still heals — so it is a top-level timer,
       and it is only live while there is something to heal. */
    if (s.hp !== null) m = Math.min(m, s.regen);
    /* Registered systems get to name their own events, or the fast loop
       jumps clean over their timers. See ./systems/index.js. */
    return Math.min(m, systemsNextEvent(this));
  }

  /**
   * Move forward exactly k ticks. Decrement everything live, THEN resolve
   * everything that hit zero, in a fixed order. Resolution never decrements,
   * so a jump of k and k single steps land in the same place.
   */
  _advanceBy(k) {
    const s = this.state;
    s.tick += k;

    const n = s.node, c = s.combat, a = s.action;
    let nodeRespawned = false, nodeRegened = false, actionDone = false;
    let playerSwing = false, monsterSwing = false, monsterRespawned = false, regened = false;

    if (n) {
      if (n.respawn > 0) {
        n.respawn -= k;
        if (n.respawn <= 0) { n.respawn = 0; nodeRespawned = true; }
      } else if (n.hp < this._nodeMaxHp()) {
        n.regen -= k;
        if (n.regen <= 0) nodeRegened = true;
      }
    }

    if (c) {
      if (c.respawn > 0) {
        c.respawn -= k;
        if (c.respawn <= 0) { c.respawn = 0; monsterRespawned = true; }
      } else {
        c.pTicks -= k; if (c.pTicks <= 0) playerSwing = true;
        c.mTicks -= k; if (c.mTicks <= 0) monsterSwing = true;
      }
    } else if (a && !a.paused) {
      a.ticks -= k;
      if (a.ticks <= 0) actionDone = true;
    }

    /* Out-of-combat regeneration, parked at full health so that a jump of k
       and k single steps land on the same timer. The predicate is read here,
       once, before any resolution — which is exactly when the fast loop
       chose k, so it cannot change inside the jump. */
    /* `state.hp === null` IS the "at full health" flag, so the common case —
       an adept who has taken no damage — costs one null check per tick and
       never touches the XP table. The regeneration timer parks itself at full
       so a jump of k and k single steps land on the same value. */
    if (s.hp !== null) {
      s.regen -= k;
      if (s.regen <= 0) regened = true;
    } else if (s.regen !== REGEN_INTERVAL_TICKS) {
      s.regen = REGEN_INTERVAL_TICKS;
    }

    /* Registered systems advance BETWEEN the decrement and the resolution.
       See ./systems/index.js for why that position is load-bearing. */
    tickSystems(this, k);

    /* --- resolve, fixed order --------------------------------------- */
    if (nodeRegened) {
      n.regen = REGEN_INTERVAL_TICKS;
      n.hp = Math.min(this._nodeMaxHp(), n.hp + 1);
    }
    if (regened) {
      s.regen = REGEN_INTERVAL_TICKS;
      this._setHp(s.hp + Math.max(1, Math.floor(this.maxHp() * REGEN_FRACTION)));
    }
    if (monsterRespawned) this._spawnMonster();
    /* The veil does not wait its turn: on a tie the monster swings first. */
    if (monsterSwing && s.combat && s.combat.respawn === 0) this._monsterAttack();
    if (playerSwing && s.combat && s.combat.respawn === 0 && s.combat.mHp > 0) this._playerAttack();
    if (nodeRespawned) {
      n.hp = this._nodeMaxHp();
      a.paused = false;
      this._startAction();
    }
    if (actionDone) this._completeAction();
  }

  /**
   * Advance `ticks` ticks.
   * @param {number} ticks
   * @param {{naive?: boolean}} [opts] naive steps one tick at a time; it exists
   *        so the selftest can prove the event jump is exact, and is never the
   *        path a real client takes.
   * @returns {number} ticks actually consumed (short if the run stopped)
   */
  advance(ticks, opts = {}) {
    let left = Math.max(0, Math.floor(ticks));
    const start = this.state.tick;

    if (opts.naive) {
      while (left > 0) {
        if (this.state.stoppedReason) break;
        this._advanceBy(1);
        left--;
      }
    } else {
      while (left > 0) {
        if (this.state.stoppedReason) break;
        const e = this._nextEvent();
        if (!Number.isFinite(e)) { this.state.tick += left; left = 0; break; }
        const k = Math.min(left, e);
        this._advanceBy(k);
        left -= k;
      }
    }
    this._syncRng();
    return this.state.tick - start;
  }

  /** Seconds of game time. */
  advanceSeconds(seconds, opts) {
    return this.advance(Math.round(seconds * TICKS_PER_SECOND), opts);
  }

  /* --------------------------------------------------------------------
     OFFLINE REPLAY  (§3)
     -------------------------------------------------------------------- */

  /**
   * Resume from a save. Elapsed real time is capped at 24 h, converted to
   * ticks, and fed through the SAME loop that runs live — so everything that
   * would have happened, happens: level-ups change subsequent rates,
   * materials run out, nodes deplete, and the adept can die.
   *
   * @returns {object} a Welcome Back summary of the difference
   */
  offlineReplay(nowMs, opts = {}) {
    const s = this.state;
    const elapsedMs = Math.max(0, nowMs - s.lastSaveAt);
    const cappedMs = Math.min(elapsedMs, OFFLINE_CAP_MS);
    const ticks = Math.floor(cappedMs / TICK_MS);

    /* Combat offline is opt-in because it can end the session in a death —
       and so is Larceny, which drains the same pool and can do the same. */
    const hpLoop = s.combat || s.action?.skillId === "larceny";
    if (hpLoop && !s.offlineCombat) {
      this.stop("offline-combat-disabled");
      s.lastSaveAt = nowMs;
      return this._summary(null, 0, elapsedMs, cappedMs, "offline-combat-disabled");
    }

    const before = this._snapshot();
    const started = performance.now?.() ?? 0;
    const consumed = this.advance(ticks, opts);
    const ms = (performance.now?.() ?? 0) - started;

    s.lastSaveAt = nowMs;
    const summary = this._summary(before, consumed, elapsedMs, cappedMs, s.stoppedReason);
    summary.replayMs = ms;
    summary.ticksPerMs = ms > 0 ? consumed / ms : Infinity;
    return summary;
  }

  _snapshot() {
    const s = this.state;
    const skills = {};
    for (const id of Object.keys(s.skills)) {
      skills[id] = { xp: s.skills[id].xp, level: this.skillLevel(id), pool: s.skills[id].pool };
    }
    return {
      cogs: s.cogs, shards: s.shards, seals: s.seals, marks: s.marks,
      items: { ...s.items }, skills, stats: { ...s.stats },
    };
  }

  _summary(before, consumedTicks, elapsedMs, cappedMs, stoppedReason) {
    const s = this.state;
    if (!before) {
      return {
        seconds: 0, cappedSeconds: 0, ticks: 0, cappedByLimit: false,
        cogs: 0, shards: 0, seals: 0, marks: 0, items: [], levels: [], stoppedReason,
      };
    }
    const items = [];
    const ids = new Set([...Object.keys(before.items), ...Object.keys(s.items)]);
    for (const id of ids) {
      const delta = (s.items[id] || 0) - (before.items[id] || 0);
      if (delta !== 0) items.push({ id, name: this.db.item(id).name, delta });
    }
    items.sort((a, b) => b.delta - a.delta);

    const levels = [];
    for (const id of Object.keys(s.skills)) {
      const now = this.skillLevel(id);
      if (now > before.skills[id].level) {
        levels.push({ id, name: this.db.skill(id).name, from: before.skills[id].level, to: now });
      }
    }

    return {
      seconds: elapsedMs / 1000,
      cappedSeconds: cappedMs / 1000,
      ticks: consumedTicks,
      cappedByLimit: elapsedMs > OFFLINE_CAP_MS,
      cogs: s.cogs - before.cogs,
      shards: s.shards - before.shards,
      seals: s.seals - before.seals,
      marks: s.marks - before.marks,
      xp: Object.fromEntries(
        Object.keys(s.skills)
          .map((id) => [id, s.skills[id].xp - before.skills[id].xp])
          .filter(([, v]) => v > 0)
      ),
      items,
      levels,
      kills: s.stats.kills - before.stats.kills,
      deaths: s.stats.deaths - before.stats.deaths,
      itemsLost: s.stats.itemsLost - before.stats.itemsLost,
      stoppedReason,
    };
  }

  /* --------------------------------------------------------------------
     ACTION RESOLUTION
     -------------------------------------------------------------------- */

  _startAction() {
    const a = this.state.action;
    if (!a) return;
    a.intervalTicks = this.actionIntervalTicks(a.skillId, a.recipeId, true);
    a.ticks = a.intervalTicks;
  }

  _completeAction() {
    const s = this.state;
    const a = s.action;
    const skill = this.db.skill(a.skillId);
    const recipe = this.db.recipe(a.recipeId);
    const scopes = this._scopes(a.skillId, a.recipeId);
    const m = this.mods();

    /* A registered system may own this skill's resolution end to end — the
       generic path below cannot express "half the time you get nothing and
       take a beating instead". Everything after it is bookkeeping every
       action shares, so it still runs. See ./systems/index.js. */
    const sys = systemForSkill(a.skillId);
    if (sys?.completeAction && sys.completeAction(this, skill, recipe)) {
      s.stats.actions++;
      this._checkCheckpointDrift(a.skillId);
      if (s.action && !s.action.paused && !s.stoppedReason) this._startAction();
      return;
    }

    /* --- inputs ---------------------------------------------------- */
    if (recipe.consumes || recipe.shards) {
      if (!this._consume(recipe, scopes, m)) {
        this.stop("out-of-materials");
        return;
      }
    }

    /* --- outputs ---------------------------------------------------- */
    const seconds = ticksToSeconds(a.intervalTicks);
    let produced = 0;

    if (skill.kind === "route") {
      this._payCurrency(recipe.cogs, scopes);
      produced = 1;
    } else {
      produced = this._produce(skill, recipe, scopes, m);
    }

    /* --- skill XP ---------------------------------------------------- */
    const before = this.skillLevel(a.skillId);
    s.skills[a.skillId].xp += recipe.xp * (1 + m.sum(MOD.skillXP, scopes));
    if (this.skillLevel(a.skillId) !== before) this._invalidate();

    /* --- mastery XP and the pool ------------------------------------- */
    if (skill.mastery) this._grantMastery(skill, recipe, scopes, m, seconds);

    /* --- node depletion ---------------------------------------------- */
    if (skill.node && s.node) {
      const preserve = m.preserve(scopes);
      if (!this.rng.chance(preserve)) s.node.hp -= 1;
      if (s.node.hp <= 0) {
        s.node.hp = 0;
        s.node.respawn = this._nodeRespawnTicks();
        a.paused = true;
      }
    }

    /* --- rare rolls -------------------------------------------------- */
    if (skill.rareShards && produced > 0) {
      const extra = 1 + m.sum(MOD.rareChance, scopes);
      if (this.rng.chance(skill.rareShards.chance * extra)) {
        s.shards += this.rng.range(skill.rareShards.qty[0], skill.rareShards.qty[1]);
      }
    }

    s.stats.actions++;
    this._checkCheckpointDrift(a.skillId);
    if (!a.paused) this._startAction();
  }

  /** Consume inputs, honouring preservation. Returns false if short. */
  _consume(recipe, scopes, m) {
    const s = this.state;
    const need = recipe.consumes || [];
    for (const [id, qty] of need) if (this.count(id) < qty) return false;
    if (recipe.shards && s.shards < recipe.shards) return false;

    const preserve = m.preserve(scopes);
    for (const [id, qty] of need) {
      for (let i = 0; i < qty; i++) {
        if (!this.rng.chance(preserve)) this.takeItem(id, 1);
      }
    }
    if (recipe.shards) {
      for (let i = 0; i < recipe.shards; i++) {
        if (!this.rng.chance(preserve)) s.shards--;
      }
    }
    return true;
  }

  /** Produce output, applying doubling, deterministic multipliers and flats. */
  _produce(skill, recipe, scopes, m) {
    const s = this.state;

    /* Trawling's junk roll, removed entirely by the 25% checkpoint. */
    if (recipe.junk && !m.sum("noJunk", scopes)) {
      const chance = recipe.junk * (1 + m.sum("junkPercent", scopes));
      if (this.rng.chance(chance)) {
        this._deliver("tangleweed", 1);
        return 0;
      }
    }

    /* Hearthcraft's quality roll: success climbs to certainty at mastery 50,
       and the same climb keeps paying into the perfect result after that. */
    let outId = recipe.produces;
    if (skill.quality) {
      const lvl = this.masteryLevel(skill.id, recipe.id);
      const success = Math.min(1, skill.quality.successBase + skill.quality.successPerMastery * lvl);
      if (!this.rng.chance(success)) return 0;
      const perfect = Math.min(1, skill.quality.perfectPerMastery * lvl);
      if (this.rng.chance(perfect)) outId = `perfect-${recipe.produces}`;
    }

    let qty = 1;
    if (this.rng.chance(m.sum(MOD.doubleChance, scopes))) qty *= 2;
    /* §7.2 exception 2 — a deterministic multiplier is its own layer, so the
       Twin-Vein Charm and a doubling roll really do stack to four. */
    const mult = m.sum("quantityMultiplier", scopes);
    if (mult > 0) qty *= mult;
    /* "+N base quantity" is tagged non-doublable and is added last. */
    qty += m.sum(MOD.flatQuantity, scopes);

    this._deliver(outId, qty);
    return qty;
  }

  _deliver(id, qty) {
    if (qty <= 0) return;
    /* Counted whether it is banked or auto-sold, because the balance report's
       sustained-rate model needs UNITS PRODUCED, not units held. */
    this.produced.set(id, (this.produced.get(id) || 0) + qty);
    if (this.autoSell && this.db.item(id).value > 0) {
      const gained = this.salePrice(id) * qty;
      this.state.cogs += gained;
      this.state.stats.cogsEarned += gained;
    } else {
      this.addItem(id, qty);
    }
  }

  _grantMastery(skill, recipe, scopes, m, actualSeconds) {
    const s = this.state;
    const skillId = skill.id;
    const at = skill.masteryActionTime;
    let actionTime;
    if (at === "actual") actionTime = actualSeconds;
    else if (at.fixed !== undefined) actionTime = at.fixed;
    else actionTime = at.ofBase * (recipe.interval ?? skill.baseInterval ?? actualSeconds);

    const mxp = masteryXpPerAction({
      unlockedActions: this.unlockedActions(skillId),
      totalMasteryInSkill: this.totalMastery(skillId),
      totalItemsInSkill: this.db.recipeCounts[skillId],
      itemMasteryLevel: this.masteryLevel(skillId, recipe.id),
      actionTime,
      bonus: m.sum(MOD.masteryXP, scopes),
    });

    const bank = s.skills[skillId].mastery;
    const beforeLvl = this.masteryLevel(skillId, recipe.id);
    bank[recipe.id] = Math.min(xpAt(MASTERY_CAP), (bank[recipe.id] || 0) + mxp);
    if (this.masteryLevel(skillId, recipe.id) !== beforeLvl) this._invalidate();

    const rate = poolDepositRate(this.skillLevel(skillId));
    const { pool, wasted } = depositToPool(s.skills[skillId].pool, mxp * rate, this.poolCapFor(skillId));
    s.skills[skillId].pool = pool;
    s.stats.poolWasted += wasted;

    /* Emberrite's 50% checkpoint: burning pays back a share of the bough's
       price in Cogs. A skill whose whole job is destroying value, turned into
       a faucet by a mastery threshold. */
    const ashright = m.sum("ashright", scopes);
    if (ashright > 0 && recipe.consumes) {
      let refund = 0;
      for (const [id, qty] of recipe.consumes) refund += this.db.item(id).value * qty;
      /* _payCurrency carries the "never rounds to nothing" floor; see there
         for why a 25% refund on a 1-Cog bough must still pay a Cog. */
      if (refund > 0) this._payCurrency(refund * ashright, scopes);
    }
  }

  /**
   * Checkpoints are live thresholds (§2.3), so an ordinary pool deposit can
   * silently flip a modifier on. The signature is kept PER SKILL: a single
   * shared signature would report a false flip every time the player changed
   * skills, and — worse — could miss a real one if two skills happened to
   * share a pattern.
   */
  _checkCheckpointDrift(skillId) {
    if (!this.db.recipeCounts[skillId]) return;
    const sig = this.checkpointsFor(skillId).map((b) => (b ? 1 : 0)).join("");
    if (sig !== this._ckSig[skillId]) {
      this._ckSig[skillId] = sig;
      this._invalidate();
    }
  }

  /* --------------------------------------------------------------------
     COMBAT
     -------------------------------------------------------------------- */

  /**
   * The six numbers §3j's Offensive and Defensive blocks print, and the ones
   * the loop actually rolls against. Public, because a screen that recomputes
   * a stat is a screen that will eventually disagree with the engine.
   */
  combatStats() {
    return combatStats(
      this.db.playerBase, this.mods(), COMBAT_SCOPES,
      this.skillLevel(this.styleSkillId()), this.skillLevel("defence")
    );
  }

  /** Chance to hit whatever is in front of us, for the §3j readout. */
  chanceToHit(monsterId = this.state.combat?.monsterId) {
    const mon = monsterId ? this.db.monster(monsterId) : null;
    if (!mon) return 0;
    return hitChance(this.combatStats().accuracy, mon.evasion);
  }

  /** The best Auto-Ward Sigil owned, or the hand-fed baseline. */
  _autoWard() {
    for (const id of ["ward-auto-3", "ward-auto-2", "ward-auto-1"]) {
      if (this.state.purchases[id]) return this.db.shopEntry(id).autoWard;
    }
    return this.db.playerBase.autoWard;
  }

  _playerAttack() {
    const s = this.state;
    const c = s.combat;
    const monster = this.db.monster(c.monsterId);
    const { maxHit, accuracy } = this.combatStats();

    c.pTicks = this._playerAttackTicks();
    /* Devotions are paid for BY THE SWING, before the swing resolves, so a
       pool that runs out mid-fight takes the bonus away from this attack and
       not the next one. */
    this._drainPrayer();

    /* The swing has been taken. It fires the completion signal whether or not
       it connects, because the cost of a swing — the tablet a familiar eats,
       the second of the clock — is paid for making the attack, not for
       landing it. Fired BEFORE the accuracy roll for exactly that reason:
       a missed swing that cost nothing would make accuracy a tablet
       discount. */
    afterCombatSwing(this, this.styleSkillId(), c.monsterId);

    const hit = hitChance(accuracy, monster.evasion);
    if (!this.rng.chance(hit)) return;

    const dmg = Math.min(c.mHp, this.rng.range(1, maxHit));
    c.mHp -= dmg;
    s.stats.damageDealt += dmg;

    /* §7.5 — 0.133 XP per point of damage, into Vitality. */
    const beforeVit = this.skillLevel("vitality");
    s.skills.vitality.xp += dmg * VITALITY_XP_PER_DAMAGE;
    if (this.skillLevel("vitality") !== beforeVit) this._invalidate();

    /* ...and the SAME RULE, one line down, for the weapon skills. Combat XP
       is paid per point of damage, not per kill, and it lands in whichever of
       the five the attack style trains — split where the style splits it.
       Every style pays the same total, so the choice is which bar moves,
       never how fast.

       Paying here rather than in _kill() is what keeps the two curves the
       same curve: Vitality and the weapon skills read the same `dmg`, so
       their ratio is the constant VITALITY_XP_PER_DAMAGE /
       STYLE_XP_PER_DAMAGE on every rung of the bestiary, and both rates are
       exactly proportional to DPS. Under a per-kill number they were not,
       and advancing a tier could lower your weapon XP an hour. */
    const m = this.mods();
    const styleXp =
      dmg * STYLE_XP_PER_DAMAGE * (1 + m.sum(MOD.skillXP, [...COMBAT_SCOPES, monster.id]));
    for (const [skillId, share] of this.attackStyle().xp) {
      const before = this.skillLevel(skillId);
      s.skills[skillId].xp += styleXp * share;
      if (this.skillLevel(skillId) !== before) this._invalidate();
    }

    if (c.mHp <= 0) this._kill(monster);
  }

  /**
   * Spend one attack's worth of prayer points across every lit devotion.
   * When the pool cannot cover the swing, EVERY devotion goes out — not just
   * the one that could not be paid for. Half-lit is a state nobody can read
   * off a screen, and the reference does not have it either.
   */
  _drainPrayer() {
    const s = this.state;
    if (!s.devotions.length) return;
    let cost = 0;
    for (const d of this.litDevotions()) cost += d.cost;
    if (cost <= 0) return;
    if (s.prayer < cost) {
      s.prayer = 0;
      s.devotions = [];
      this._invalidate();
      return;
    }
    s.prayer -= cost;
    if (s.prayer === 0) this._invalidate();
  }

  _kill(monster) {
    const s = this.state;
    const c = s.combat;
    const m = this.mods();
    const scopes = [...COMBAT_SCOPES, monster.id];

    /* NO XP IS PAID HERE. A kill pays loot; the experience for it was already
       paid, point of damage by point of damage, in _playerAttack(). Killing
       something is not an event the XP curve knows about — which is why a
       monster with ten times the hit points is worth ten times the XP without
       anyone having to write that number down. */
    this._payCurrency(this.rng.range(monster.cogs[0], monster.cogs[1]), scopes);

    const doubleLoot = this.rng.chance(m.sum(MOD.doubleChance, scopes));
    for (const d of monster.drops || []) {
      if (d.chance < 1 && !this.rng.chance(d.chance)) continue;
      let qty = this.rng.range(d.qty[0], d.qty[1]);
      if (doubleLoot) qty *= 2;
      this._dropLoot(d.item, qty);
    }
    if (monster.shards && this.rng.chance(monster.shards.chance)) {
      s.shards += this.rng.range(monster.shards.qty[0], monster.shards.qty[1]);
    }
    if (monster.seals && this.rng.chance(monster.seals.chance)) {
      s.seals += this.rng.range(monster.seals.qty[0], monster.seals.qty[1]);
    }

    this._progressBounty(monster, m);

    s.stats.kills++;
    c.mHp = 0;
    c.respawn = secondsToTicks(this.db.monsterRespawnSeconds);
  }

  _spawnMonster() {
    const c = this.state.combat;
    const monster = this.db.monster(c.monsterId);
    c.mHp = monster.hp;
    c.pTicks = this._playerAttackTicks();
    c.mTicks = secondsToTicks(monster.attack);
  }

  _monsterAttack() {
    const s = this.state;
    const c = s.combat;
    const monster = this.db.monster(c.monsterId);
    const { evasion } = this.combatStats();
    c.mTicks = secondsToTicks(monster.attack);

    const hit = hitChance(monster.accuracy, evasion);
    if (this.rng.chance(hit)) this.takeDamage(this.rng.range(1, monster.maxHit));
    else this._maybeEat();
  }

  /**
   * Auto-eat, off the ONE hit-point pool. Larceny drains the same pool, so
   * the same sigil, the same food dropdown and the same efficiency curve
   * cover both — which is the whole reason the stun skill ships with combat.
   */
  _maybeEat() {
    const s = this.state;
    const ward = this._autoWard();
    const max = this.maxHp();
    if (this.hp() > max * ward.trigger) return;

    const healBonus = 1 + this.mods().sum(MOD.healing, null);
    let guard = 0;
    while (this.hp() < max * ward.healTo && guard++ < 64) {
      const id = this._pickProvision();
      const food = id ? this.db.items.get(id) : null;
      if (!food) break;
      const heal = Math.max(1, Math.floor(food.heal * ward.efficiency * healBonus));
      this.takeItem(id, 1);
      this._setHp(this.hp() + heal);
      s.stats.provisionsEaten++;
    }
  }

  /** Eat one provision by hand — §3j's "Hold down the Eat button". */
  eat(id = this._pickProvision()) {
    if (!id || this.count(id) <= 0) return "nothing to eat";
    const it = this.db.items.get(id);
    if (!it || it.kind !== "provision") return "not food";
    if (this.hp() >= this.maxHp()) return "already full";
    const healBonus = 1 + this.mods().sum(MOD.healing, null);
    this.takeItem(id, 1);
    this._setHp(this.hp() + Math.max(1, Math.floor(it.heal * healBonus)));
    this.state.stats.provisionsEaten++;
    return null;
  }

  /**
   * The provision the next bite comes from: the chosen food while it lasts,
   * otherwise the strongest thing held.
   *
   * READS THE RELIQUARY DEFENSIVELY, ON PURPOSE. Both the chosen food id and
   * the reliquary's keys come off the SAVE, and a save written by a build
   * that shipped an item this one does not still loads. db.item() throws on
   * an unknown id, and this runs inside _monsterAttack, which runs inside the
   * tick loop — so one stale id in the bank would take the entire game down
   * mid-fight rather than costing the player one meal. Look ids up through
   * the map and skip what is not there. ../screens/combat.js defends its loot
   * grid the same way and for the same reason.
   */
  _pickProvision() {
    const s = this.state;
    if (s.food && this.db.items.has(s.food) && this.count(s.food) > 0) return s.food;
    let best = null, bestHeal = -1;
    for (const id of Object.keys(s.items)) {
      const it = this.db.items.get(id);
      if (!it || it.kind !== "provision" || s.items[id] <= 0) continue;
      if (it.heal > bestHeal) { best = id; bestHeal = it.heal; }
    }
    return best;
  }

  /* --------------------------------------------------------------------
     THE LOOT CONTAINER  (§3j "Loot to Collect ( 0 / 100 )")

     Monster drops queue here instead of going straight to the bank, exactly
     as the reference does, and the player empties it with Loot All or throws
     it away with Destroy Loot. Two escapes exist and both are deliberate:

       autoSell  the balance sandbox measures THROUGHPUT, and a container it
                 never empties would report every combat rung as earning
                 nothing. Selling implies collecting.
       autoLoot  a player setting, off by default because the container is
                 the reference's behaviour and a full one is a real decision.

     `produced` is written in every case, because the report's sustained-rate
     model needs units PRODUCED, not units held.
     -------------------------------------------------------------------- */

  _dropLoot(id, qty) {
    if (qty <= 0) return;
    this.produced.set(id, (this.produced.get(id) || 0) + qty);
    if (this.autoSell && this.db.item(id).value > 0) {
      const gained = this.salePrice(id) * qty;
      this.state.cogs += gained;
      this.state.stats.cogsEarned += gained;
      return;
    }
    if (this.state.autoLoot) { this.addItem(id, qty); return; }

    const loot = this.state.loot;
    if (loot[id] === undefined && Object.keys(loot).length >= LOOT_SLOTS) {
      this.state.stats.itemsLost += qty;
      return;
    }
    loot[id] = (loot[id] || 0) + qty;
  }

  lootSlots() { return Object.keys(this.state.loot).length; }

  /** Move the container into the bank. Anything the bank cannot hold is lost,
   *  which is the same rule addItem() already applies everywhere else. */
  lootAll() {
    const loot = this.state.loot;
    let moved = 0;
    for (const [id, qty] of Object.entries(loot)) {
      this.addItem(id, qty);
      moved += qty;
      delete loot[id];
    }
    return moved;
  }

  destroyLoot() {
    let lost = 0;
    for (const qty of Object.values(this.state.loot)) lost += qty;
    this.state.loot = {};
    this.state.stats.lootDestroyed += lost;
    return lost;
  }

  /* --------------------------------------------------------------------
     EQUIPMENT  (§3j slots, View Equipment Stats, Change Equipment Set)
     -------------------------------------------------------------------- */

  /** How many loadouts are unlocked — two free, ten on the shop ladder. */
  equipmentSets() {
    let n = BASE_EQUIPMENT_SETS;
    for (const e of this.db.shop) {
      if (e.equipmentSet && this.state.purchases[e.id]) n++;
    }
    return Math.min(MAX_EQUIPMENT_SETS, n);
  }

  /** The active loadout, as { slotId: itemId }. */
  equipmentSet(index = this.state.equipment.active) {
    const sets = this.state.equipment.sets;
    while (sets.length < this.equipmentSets()) sets.push({});
    return sets[index] || (sets[index] = {});
  }

  setEquipmentSet(index) {
    if (index < 0 || index >= this.equipmentSets()) return "no such set";
    this.state.equipment.active = index;
    this._invalidate();
    return null;
  }

  /** Why this piece cannot go on, or null. */
  canEquip(itemId) {
    const it = this.db.items.get(itemId);
    if (!it?.equip) return "not equipment";
    if (this.count(itemId) <= 0 && this.equipmentSet()[it.equip.slot] !== itemId) return "not owned";
    if (this.skillLevel(it.equip.skill) < it.equip.level) {
      return `needs ${this.db.skill(it.equip.skill).name} ${it.equip.level}`;
    }
    return null;
  }

  /**
   * Wear a piece. The item leaves the bank and the piece it replaces returns
   * to it, so "equipped" and "banked" never both count the same object — the
   * single most common way an idle game duplicates items.
   */
  equip(itemId) {
    const reason = this.canEquip(itemId);
    if (reason) return reason;
    const it = this.db.item(itemId);
    const set = this.equipmentSet();
    const slot = it.equip.slot;
    if (set[slot] === itemId) return null;
    if (set[slot]) this.addItem(set[slot], 1);
    this.takeItem(itemId, 1);
    set[slot] = itemId;
    this._invalidate();
    return null;
  }

  unequip(slot) {
    const set = this.equipmentSet();
    const itemId = set[slot];
    if (!itemId) return "nothing there";
    delete set[slot];
    this.addItem(itemId, 1);
    this._invalidate();
    return null;
  }

  /** The weapon slot is a READOUT of the strongest relic owned; see
   *  ../../data/equipment.js for why it cannot be a picker. */
  equippedRelic() {
    let best = null;
    for (const r of this.db.relics) if (this.state.purchases[r.id]) best = r;
    return best;
  }

  /* --------------------------------------------------------------------
     DEVOTION  (§1 "Prayer (shows prayer points)")
     -------------------------------------------------------------------- */

  /** Every devotion the skill defines, with its level gate. */
  devotionList() { return this.db.skill("devotion")?.devotions || []; }

  litDevotions() {
    const by = new Map(this.devotionList().map((d) => [d.id, d]));
    return this.state.devotions.map((id) => by.get(id)).filter(Boolean);
  }

  /** Points spent per player attack with the current pair lit. */
  prayerDrain() {
    let n = 0;
    for (const d of this.litDevotions()) n += d.cost;
    return n;
  }

  toggleDevotion(id) {
    const s = this.state;
    const d = this.devotionList().find((x) => x.id === id);
    if (!d) return "no such devotion";
    const at = s.devotions.indexOf(id);
    if (at >= 0) { s.devotions.splice(at, 1); this._invalidate(); return null; }
    if (this.skillLevel("devotion") < d.level) return "level too low";
    const slots = this.db.skill("devotion").slots || DEVOTION_SLOTS;
    if (s.devotions.length >= slots) return `only ${slots} at a time`;
    s.devotions.push(id);
    this._invalidate();
    return null;
  }

  /**
   * Speak over relics at the Reliquary: the only source of prayer points and
   * the only source of Devotion XP. Relics are worth 0 Cogs, so this is also
   * the only thing that can be done with one.
   */
  offerRelic(id, qty = this.count(id)) {
    const it = this.db.items.get(id);
    if (!it?.devotion) return "not a relic";
    const n = Math.min(qty, this.count(id));
    if (n <= 0) return "none held";
    this.takeItem(id, n);
    const s = this.state;
    s.prayer += it.devotion.points * n;
    const before = this.skillLevel("devotion");
    s.skills.devotion.xp += it.devotion.xp * n * (1 + this.mods().sum(MOD.skillXP, ["devotion"]));
    s.stats.relicsOffered += n;
    if (this.skillLevel("devotion") !== before) this._invalidate();
    else if (before === 1 && s.prayer > 0) this._invalidate();
    return null;
  }

  /* --------------------------------------------------------------------
     BOUNTIES  (§1 "Slayer (shows slayer coins)")
     -------------------------------------------------------------------- */

  bountyTiers() { return this.db.skill("bounties")?.tiers || []; }

  /** Monsters this tier is allowed to name, by level band. */
  bountyPool(tier) {
    return this.db.monsters.filter((m) => m.level >= tier.band[0] && m.level <= tier.band[1]);
  }

  /**
   * Take a contract. The board rolls a monster out of the tier's level band
   * rather than reading a hand-written list, so every monster added to the
   * bestiary joins the rotation with no edit to the skill file.
   */
  takeBounty(tierId) {
    const tier = this.bountyTiers().find((t) => t.id === tierId);
    if (!tier) return "no such contract";
    if (this.state.bounty) return "finish or abandon the current contract first";
    if (this.skillLevel("bounties") < tier.level) return "level too low";
    const pool = this.bountyPool(tier);
    if (!pool.length) return "nothing to hunt in that band";
    const monster = pool[this.rng.int(pool.length)];
    this.state.bounty = {
      tierId, monsterId: monster.id, remaining: tier.count, total: tier.count,
    };
    this._syncRng();
    return null;
  }

  abandonBounty() {
    if (!this.state.bounty) return "no contract";
    this.state.bounty = null;
    return null;
  }

  _progressBounty(monster, m) {
    const s = this.state;
    const b = s.bounty;
    if (!b || b.monsterId !== monster.id) return;
    const tier = this.bountyTiers().find((t) => t.id === b.tierId);
    if (!tier) return;

    const skill = this.db.skill("bounties");
    const share = skill.xpShare ?? 0.4;
    const before = this.skillLevel("bounties");
    /* A bounty kill pays a SHARE OF THE COMBAT XP THAT KILL PRODUCED. Killing
       a monster deals exactly its hit points of damage, so that share is
       hp * STYLE_XP_PER_DAMAGE * xpShare — the same per-damage spine the
       weapon skills are on, read once per kill because the contract counts
       kills, not swings. */
    const perKill = monster.hp * STYLE_XP_PER_DAMAGE * share;
    s.skills.bounties.xp += perKill * (1 + m.sum(MOD.skillXP, ["bounties"]));

    b.remaining--;
    if (b.remaining <= 0) {
      /* Half the contract's value is the completion bonus, so abandoning at
         90% costs the player half of what they earned. */
      s.skills.bounties.xp += perKill * b.total * (1 + m.sum(MOD.skillXP, ["bounties"]));
      const marks = Math.max(1, Math.round(
        monster.level * b.total * tier.marksPer * (1 + m.sum("bountyMarks", ["bounties"]))
      ));
      s.marks += marks;
      s.stats.bountiesDone++;
      s.bounty = null;
    }
    if (this.skillLevel("bounties") !== before) this._invalidate();
  }

  /* --------------------------------------------------------------------
     SHOP
     -------------------------------------------------------------------- */

  canBuy(id) {
    const e = this.db.shopEntry(id);
    if (!e) return "no such entry";
    const owned = this.state.purchases[id] || 0;
    if (owned >= (e.repeatable || 1)) return "already owned";
    if (e.requires && !this.state.purchases[e.requires]) return "prerequisite missing";
    if (e.skill && this.skillLevel(e.skill) < e.level) return "level too low";
    if (this.state.cogs < e.cost) return "not enough Cogs";
    if (e.seals && this.state.seals < e.seals) return "not enough Warden Seals";
    if (e.marks && this.state.marks < e.marks) return "not enough Bounty Marks";
    if (e.material && this.count(e.material[0]) < e.material[1]) return "not enough materials";
    return null;
  }

  buy(id) {
    const reason = this.canBuy(id);
    if (reason) return reason;
    const e = this.db.shopEntry(id);
    this.state.cogs -= e.cost;
    this.state.stats.cogsSpent += e.cost;
    if (e.seals) this.state.seals -= e.seals;
    if (e.marks) this.state.marks -= e.marks;
    if (e.material) this.takeItem(e.material[0], e.material[1]);
    this.state.purchases[id] = (this.state.purchases[id] || 0) + 1;
    this._invalidate();
    return null;
  }

  /** Grant a purchase without paying — used by the balance sandbox only. */
  grant(id, count = 1) {
    this.state.purchases[id] = (this.state.purchases[id] || 0) + count;
    this._invalidate();
  }

  buyClasp() {
    const cost = this.db.claspCost(this.state.clasps);
    if (this.state.cogs < cost) return "not enough Cogs";
    this.state.cogs -= cost;
    this.state.stats.cogsSpent += cost;
    this.state.clasps++;
    return null;
  }

  /** Waystations cost Cogs AND materials, and must be rebuilt to reconfigure. */
  buildWaystation(id) {
    const w = this.db.waystation(id);
    if (!w) return "no such waystation";
    if (this.state.waystations.includes(id)) return "already built";
    if (this.state.waystations.length >= this.db.waystationSlots) return "no free slot";
    if (this.skillLevel("wayfaring") < w.level) return "level too low";
    const cut = this.mods().sum(MOD.costReduction, ["wayfaring"]);
    const cost = Math.floor(w.cost * (1 - cut));
    const mat = Math.floor(w.material[1] * (1 - cut));
    if (this.state.cogs < cost) return "not enough Cogs";
    if (this.count(w.material[0]) < mat) return "not enough materials";
    this.state.cogs -= cost;
    this.state.stats.cogsSpent += cost;
    this.takeItem(w.material[0], mat);
    this.state.waystations.push(id);
    this._invalidate();
    return null;
  }

  /** Force a waystation in place, for the balance sandbox. */
  placeWaystation(id) {
    if (!this.state.waystations.includes(id)) this.state.waystations.push(id);
    this._invalidate();
  }

  /** Spend pool XP 1:1 to push a recipe's mastery up. */
  spendPool(skillId, recipeId, targetLevel) {
    const s = this.state.skills[skillId];
    const cost = Math.max(0, xpAt(Math.min(targetLevel, MASTERY_CAP)) - (s.mastery[recipeId] || 0));
    if (cost <= 0) return "already there";
    if (s.pool < cost) return "not enough pool XP";
    s.pool -= cost;
    s.mastery[recipeId] = xpAt(Math.min(targetLevel, MASTERY_CAP));
    this._invalidate();
    return null;
  }

  /* --------------------------------------------------------------------
     SAVE / LOAD / HASH
     -------------------------------------------------------------------- */

  serialize(nowMs = this.state.lastSaveAt) {
    this._syncRng();
    this.state.lastSaveAt = nowMs;
    return structuredClone(this.state);
  }

  static load(db, save, opts = {}) {
    if (save.version !== SAVE_VERSION) throw new Error(`save version ${save.version} not supported`);
    return new Game(db, { ...opts, state: save });
  }

  /**
   * A stable 64-bit fingerprint of everything that matters, as two 32-bit
   * FNV-1a passes over a canonically ordered serialisation. Used by the
   * selftest to prove that two different ways of reaching the same tick
   * really do land on the same state.
   */
  hash() {
    const json = canonical(this.serialize());
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < json.length; i++) {
      const ch = json.charCodeAt(i);
      a = Math.imul(a ^ ch, 0x01000193) >>> 0;
      b = Math.imul(b + ch, 0x85ebca6b) >>> 0;
      b = (b ^ (b >>> 13)) >>> 0;
    }
    return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0"));
  }
}

/** Deterministic JSON: keys sorted, floats rounded to kill last-bit drift. */
export function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(6);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

export { OFFLINE_CAP_TICKS, TICK_MS, TICKS_PER_SECOND };
export { ATTACK_STYLES, COMBAT_BLOCK, WEAPON_SKILLS, COMBAT_SCOPES };
