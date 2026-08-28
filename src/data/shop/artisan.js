/* =========================================================================
   EMBERVEIL — SHOP: THE ARTISAN WING

   Two very different things live here, and only the first is a purchase.

   ---------------------------------------------------------------------------
   1. BENCHES — the artisan tool ladder
   ---------------------------------------------------------------------------
   ./ladder.js gives every artisan skill a three-step bench: -5%, -5%, -10%,
   ending at -20% interval, priced 5,000 / 100,000 / 1,500,000 so the last rung
   lands on the same "you have arrived in the midgame" shelf as the multi-vein
   charm and the first auto-ward. The four new artisan skills get the same
   ladder at the same prices, from the same rank table, because a shorter or
   cheaper ladder on a newer skill would be a balance decision made by
   accident.

   ---------------------------------------------------------------------------
   2. WHERE THE POTIONS ARE NOT
   ---------------------------------------------------------------------------
   A live potion grants real modifiers, and an earlier draft of this file
   shipped them here as unbuyable shop rows so that Game#_buildMods would pick
   them up off `state.purchases`. That was a trick, and it is gone.

   ../../js/engine/systems/cooking-stations.js registers a `mods(game, set)`
   hook instead — the same one Agility's obstacles and Astrology's
   constellations use — so a live dose lands in the ordinary additive bucket
   (§7.1) alongside a tool, a waystation and a checkpoint, and expires on the
   tick it is supposed to, on both loop paths and through a 24 h offline
   replay. Potion modifiers are authored on the ITEM, in ../items/artisan.js.
   ========================================================================= */

/* =========================================================================
   BENCHES
   ========================================================================= */

/** The same three rungs ./ladder.js ships, kept identical on purpose. */
const BENCH_RANKS = [
  ["guild",     "Guild",     20, 0.05, 5_000],
  ["ascendant", "Ascendant", 55, 0.05, 100_000],
  ["wardens",   "Warden's",  85, 0.10, 1_500_000],
];

function benchLadder(skill, noun) {
  return BENCH_RANKS.map(([rankId, rank, level, cut, cost], i) => ({
    id: `bench-${skill}-${rankId}`,
    name: `${rank} ${noun}`,
    category: "tool",
    skill,
    level,
    cost,
    requires: i === 0 ? null : `bench-${skill}-${BENCH_RANKS[i - 1][0]}`,
    text: `-${(cut * 100).toFixed(0)}% ${skill} interval`,
    mods: [["intervalPercent", -cut, skill]],
  }));
}

const BENCHES = [
  ...benchLadder("bowcraft",      "Jig"),
  ...benchLadder("crafting",      "Awl"),
  ...benchLadder("alchemy",       "Alembic"),
  ...benchLadder("transmutation", "Lectern"),
];

export const ENTRIES = [...BENCHES];
export default ENTRIES;
