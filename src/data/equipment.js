/* =========================================================================
   EMBERVEIL — EQUIPMENT SLOTS AND THE ARMOUR LADDER   (parity §3j)

   The Combat screen's equipment grid, its "View Equipment Stats" table and
   its "Change Equipment Set" control all read this file. It ships two things:

     SLOTS       the eleven places a thing can be worn, in grid order
     EQUIPMENT   forty armour pieces, generated from four sets x ten slots

   WHY THE STATS ARE PERCENTAGES AND NOT FLAT NUMBERS
   --------------------------------------------------
   The relic ladder in ../data/shop/ladder.js is the FLAT spine of combat: it
   is the only source of raw accuracy, max hit and evasion, it climbs from +5
   to +33,000 across nine rungs, and every balance number in the game is
   derived from it. If armour also granted flat points it would be decisive at
   level 5 and literally invisible at level 90 — a whole equipment system that
   stops existing halfway through the game.

   So armour is a MULTIPLIER LAYER instead. Each piece grants a percentage of
   accuracy / max hit / evasion plus flat damage reduction, all of which sum
   additively (§7.1) into the same buckets the waystations and Ascension Rites
   already feed. A full best-in-slot set is worth roughly +46% accuracy,
   +36% max hit, +70% evasion and 14% damage reduction — a real, bounded,
   permanently-relevant second axis rather than a second spine.

   The selftest measures exactly that: it runs an hour of tier-nine combat
   naked and an hour fully kitted and asserts the ratio lands between 1.15x
   and 3x. Below that the system is decoration; above it, it is the spine.

   THE WEAPON SLOT IS DERIVED, NOT EQUIPPED
   ----------------------------------------
   Relics are cumulative attunements bought from the shop, not swappable
   objects — every relic you own contributes for ever, which is what the whole
   economy was measured against. Letting the player unequip damage would be a
   lie, so the weapon slot DISPLAYS the strongest relic owned and cannot be
   changed. It is a readout, and it is marked `derived: true` here so the UI
   knows not to offer a picker for it.
   ========================================================================= */

/* -------------------------------------------------------------------------
   THE SLOTS.
   `acc` / `hit` / `eva` are percentage weights, multiplied by the set's tier
   multiplier below; `dr` is flat damage reduction, likewise scaled. `value`
   is the share of the set's price this piece carries. `req` names the skill
   whose level gates it — armour asks for Defence, trinkets for Attack, which
   is what makes the five-way skill split matter outside the XP bar.
   ------------------------------------------------------------------------- */
export const SLOTS = [
  { id: "helmet", name: "Helmet", acc: 0.02, hit: 0.01, eva: 0.05, dr: 0.010, value: 0.6, req: "defence" },
  { id: "cape",   name: "Cape",   acc: 0.02, hit: 0.02, eva: 0.02, dr: 0.004, value: 0.5, req: "attack" },
  { id: "amulet", name: "Amulet", acc: 0.04, hit: 0.03, eva: 0.01, dr: 0.002, value: 0.9, req: "attack" },
  { id: "weapon", name: "Weapon", derived: true },
  { id: "body",   name: "Body",   acc: 0.02, hit: 0.02, eva: 0.08, dr: 0.015, value: 1.0, req: "defence" },
  { id: "shield", name: "Shield", acc: 0.01, hit: 0.01, eva: 0.07, dr: 0.015, value: 0.8, req: "defence" },
  { id: "legs",   name: "Legs",   acc: 0.02, hit: 0.01, eva: 0.06, dr: 0.012, value: 0.8, req: "defence" },
  { id: "gloves", name: "Gloves", acc: 0.03, hit: 0.02, eva: 0.02, dr: 0.004, value: 0.4, req: "defence" },
  { id: "boots",  name: "Boots",  acc: 0.01, hit: 0.01, eva: 0.03, dr: 0.006, value: 0.4, req: "defence" },
  { id: "ring",   name: "Ring",   acc: 0.03, hit: 0.03, eva: 0.01, dr: 0.002, value: 0.9, req: "attack" },
  { id: "ammo",   name: "Ammo",   acc: 0.03, hit: 0.02, eva: 0.00, dr: 0.000, value: 0.3, req: "ranged" },
];

export const SLOT_BY_ID = new Map(SLOTS.map((s) => [s.id, s]));
/** Every slot the player can actually put something in. */
export const WEARABLE_SLOTS = SLOTS.filter((s) => !s.derived);

/** How many equipment sets a player starts with; the shop sells the rest. */
export const BASE_EQUIPMENT_SETS = 2;
/** The reference caps a real save at twelve sets, so we do too. */
export const MAX_EQUIPMENT_SETS = 12;

/* -------------------------------------------------------------------------
   THE FOUR SETS.
   Level gates land on the same rungs the relic ladder does, so a player
   climbing one is always within reach of the other. The multiplier climbs
   0.4 / 0.8 / 1.3 / 2.0 — a shrinking relative step (2.0x, 1.6x, 1.5x) for
   the same reason the billet markup shrinks with depth: percentage layers
   compound, and a constant step across four tiers would end up doubling the
   endgame twice over.
   ------------------------------------------------------------------------- */
const SETS = [
  { id: "emberweave", name: "Emberweave", level: 1,  mult: 0.4, price: 900 },
  { id: "slagplate",  name: "Slagplate",  level: 25, mult: 0.8, price: 26_000 },
  { id: "voidmail",   name: "Voidmail",   level: 55, mult: 1.3, price: 480_000 },
  { id: "ninefold",   name: "Ninefold",   level: 80, mult: 2.0, price: 7_400_000 },
];

const pct = (v) => Math.round(v * 1000) / 1000;

function buildEquipment() {
  const out = [];
  for (const set of SETS) {
    for (const slot of WEARABLE_SLOTS) {
      const acc = pct(slot.acc * set.mult);
      const hit = pct(slot.hit * set.mult);
      const eva = pct(slot.eva * set.mult);
      const dr = pct(slot.dr * set.mult);
      const mods = [];
      if (acc) mods.push(["accuracyPercent", acc, "combat"]);
      if (hit) mods.push(["maxHitPercent", hit, "combat"]);
      if (eva) mods.push(["evasionPercent", eva, "combat"]);
      if (dr) mods.push(["damageReduction", dr, "combat"]);
      const bits = [];
      if (acc) bits.push(`+${(acc * 100).toFixed(1)}% accuracy`);
      if (hit) bits.push(`+${(hit * 100).toFixed(1)}% max hit`);
      if (eva) bits.push(`+${(eva * 100).toFixed(1)}% evasion`);
      if (dr) bits.push(`+${(dr * 100).toFixed(1)}% damage reduction`);
      out.push({
        id: `gear-${set.id}-${slot.id}`,
        name: `${set.name} ${slot.name}`,
        kind: "equipment",
        value: Math.round(set.price * slot.value),
        equip: {
          slot: slot.id,
          set: set.id,
          setName: set.name,
          level: set.level,
          skill: slot.req,
          text: bits.join(", "),
          mods,
        },
      });
    }
  }
  return out;
}

/** Forty item objects, item-registry shaped. ../items/combat.js ships them. */
export const EQUIPMENT = buildEquipment();
export const EQUIPMENT_BY_ID = new Map(EQUIPMENT.map((e) => [e.id, e]));

/** Every piece that fits a slot, weakest set first. */
export function equipmentForSlot(slotId) {
  return EQUIPMENT.filter((e) => e.equip.slot === slotId);
}

/** The set ids, for the "you are wearing 7/10 of Voidmail" readout. */
export const EQUIPMENT_SETS = SETS.map((s) => ({ id: s.id, name: s.name, level: s.level }));

/* --- self-validation ------------------------------------------------------
   The content database refuses to boot on a dangling id, and this file is
   loaded by the item registry rather than by ../index.js's validate(), so it
   carries its own. A slot with no pieces or a piece in no slot is a bug that
   would otherwise show up as an empty picker forty hours in. */
(function validate() {
  const problems = [];
  for (const slot of WEARABLE_SLOTS) {
    if (!equipmentForSlot(slot.id).length) problems.push(`slot "${slot.id}" has no equipment`);
  }
  for (const e of EQUIPMENT) {
    if (!SLOT_BY_ID.has(e.equip.slot)) problems.push(`${e.id}: unknown slot "${e.equip.slot}"`);
    if (!(e.value > 0)) problems.push(`${e.id}: no sale value`);
    if (!e.equip.mods.length) problems.push(`${e.id}: grants nothing`);
  }
  if (problems.length) throw new Error(`Emberveil equipment is invalid:\n  - ${problems.join("\n  - ")}`);
})();
