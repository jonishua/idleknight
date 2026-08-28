/* =========================================================================
   EMBERVEIL ENGINE — SYSTEM: ASTROLOGY   (parity §3e)

   Astrology's ACTIONS are ordinary: Study and Explore are recipes on the flat
   3.00 s interval and the base loop resolves them without help. What this
   system owns is the other half of the screen — the twenty-four modifier
   slots, three per constellation, each rollable through 0% -> 2.00% -> 5.00%
   and each paid for in the motes those actions drop.

   The whole point is that a constellation percentage is an ORDINARY MODIFIER.
   It goes into the same additive bucket as a tool, a waystation and an
   Agility obstacle (§7.1), so +2% Mining XP bought here and +4% bought
   elsewhere is +6% and never 1.02 x 1.04. That is why this is a `mods` hook
   inside `_buildMods` rather than a number applied on the side somewhere.

   EVERY SLOT IS A PLAIN POSITIVE PERCENTAGE. ../../../data/constellations.js
   is forbidden from carrying a "negative is better" modifier — the whole
   skill used to need a per-slot `sign` field so an interval slot could be
   stored negative and printed positive, and that field is gone with the
   interval slots that needed it. One less way for this screen to lie.

   State is created lazily, so a save that has never bought an upgrade has no
   `state.astrology` key at all.
   ========================================================================= */

import {
  CONSTELLATIONS, CONSTELLATION_BY_ID, TIER_VALUES, slotKey,
} from "../../../data/constellations.js";
import { registerExoticHook } from "./agility.js";

const MAX_TIER = TIER_VALUES.length - 1;

export function astroState(game, create = false) {
  const s = game.state;
  if (!s.astrology && create) s.astrology = { upgrades: {} };
  return s.astrology || null;
}

/** Which of 0 / 2.00% / 5.00% a slot is currently rolled to. */
export function tierOf(game, constellationId, index) {
  const st = game.state.astrology;
  return (st && st.upgrades[slotKey(constellationId, index)]) || 0;
}

/**
 * The percentage the slot is actually contributing, after Astrology's own
 * 95% checkpoint and the Astral Chart raise every constellation at once.
 * Kept as one function so the screen and the modifier pipeline can never
 * disagree about the number.
 */
export function slotValue(game, constellationId, index, tier = null) {
  const t = tier === null ? tierOf(game, constellationId, index) : tier;
  const base = TIER_VALUES[Math.min(t, MAX_TIER)];
  if (!base) return 0;
  return base * (1 + game.mods().sum("constellationPower", ["astrology"]));
}

/** What the next roll of this slot costs: [starMotes, prismMotes]. */
export function upgradeCost(game, constellationId, index) {
  const c = CONSTELLATION_BY_ID.get(constellationId);
  if (!c) return null;
  const t = tierOf(game, constellationId, index);
  if (t >= MAX_TIER) return null;
  return t === 0 ? [c.cost1, 0] : [c.cost2[0], c.cost2[1]];
}

export function canUpgrade(game, constellationId, index) {
  const c = CONSTELLATION_BY_ID.get(constellationId);
  if (!c) return "no such constellation";
  if (game.skillLevel("astrology") < c.level) return "level too low";
  const cost = upgradeCost(game, constellationId, index);
  if (!cost) return "already at 5.00%";
  if (game.count("star-mote") < cost[0]) return "not enough Star Motes";
  if (cost[1] && game.count("prism-mote") < cost[1]) return "not enough Prism Motes";
  return null;
}

export function upgrade(game, constellationId, index) {
  const reason = canUpgrade(game, constellationId, index);
  if (reason) return reason;
  const cost = upgradeCost(game, constellationId, index);
  game.takeItem("star-mote", cost[0]);
  if (cost[1]) game.takeItem("prism-mote", cost[1]);
  const st = astroState(game, true);
  const k = slotKey(constellationId, index);
  st.upgrades[k] = (st.upgrades[k] || 0) + 1;
  game._invalidate();
  return null;
}

/* =========================================================================
   MODIFIERS
   ========================================================================= */

function mods(game, set) {
  const st = game.state.astrology;
  if (!st) return;
  /* `constellationPower` is itself an ordinary modifier and is already in the
     set the base build produced, so read it straight off rather than through
     game.mods() — which would hand back the very set being assembled. */
  const power = 1 + set.sum("constellationPower", ["astrology"]);
  for (const c of CONSTELLATIONS) {
    c.slots.forEach((sl, i) => {
      const tier = st.upgrades[slotKey(c.id, i)] || 0;
      if (!tier) return;
      const value = TIER_VALUES[Math.min(tier, MAX_TIER)] * power;
      set.add(sl.mod, value, {
        scope: sl.scope === "global" ? null : sl.scope,
        source: `${c.name} — ${sl.text}`,
      });
    });
  }
}

/** Every constellation modifier currently live — the "View All Active
 *  Modifiers" panel §3e asks for. */
export function activeModifiers(game) {
  const st = game.state.astrology;
  if (!st) return [];
  const out = [];
  for (const c of CONSTELLATIONS) {
    c.slots.forEach((sl, i) => {
      const tier = st.upgrades[slotKey(c.id, i)] || 0;
      if (!tier) return;
      out.push({
        constellation: c.name,
        text: sl.text,
        scope: sl.scope,
        mod: sl.mod,
        tier,
        value: slotValue(game, c.id, i),
      });
    });
  }
  return out;
}

/** How many of the twenty-four slots are rolled above zero. */
export function slotsRolled(game) {
  const st = game.state.astrology;
  if (!st) return 0;
  let n = 0;
  for (const v of Object.values(st.upgrades)) if (v > 0) n++;
  return n;
}

/* Astrology has no background timer: its actions are foreground recipes. */
const system = {
  id: "astrology",
  /* No timer, and no `nextEvent`/`tick`: ./agility.js installs the shared
     prototype bridge for the whole wing on the first loop iteration. */
  mods,
};

registerExoticHook(system);

export default system;
