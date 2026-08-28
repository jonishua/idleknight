/* =========================================================================
   EMBERVEIL — COMBAT AREAS   (parity §3j "Select Combat Area")

   Nine places to fight, in two kinds.

   COMBAT AREAS are open to anyone and they hold the nine flagship tiers — the
   whole balance spine, every published figure in the report, and the only
   route to the Ninefold Warden. Nothing gates them, because gating the spine
   behind a second skill would mean a player who ignores Bounties can never
   finish the game.

   BOUNTY GROUNDS require a Bounties level, and they hold the eight
   interleaved tiers — which are the ONLY source of relics (Devotion's fuel)
   and of the forty armour pieces. That is what makes Bounties load-bearing
   rather than a side quest: your prayer points and your plate both come from
   ground you had to earn a licence for.

   And the loop bootstraps cleanly. Contracts can name any monster in their
   level band, including everything in the open areas, so a player with no
   Bounties level at all can take a Novice contract on a Hollow Wisp, finish
   it, and walk into Low Ember Reach. Nothing in the chain requires anything
   the chain does not itself provide.

   AREAS ARE A UI GROUPING, NOT AN ENGINE GATE. `Game.fight()` takes a monster
   and does not consult this file, because the balance sandbox measures single
   monsters and must not be able to be locked out of one. The requirement here
   is what the Combat screen enforces; it is deliberately not a second, hidden
   rule inside the tick loop.
   ========================================================================= */

import { MONSTER_BY_ID } from "./monsters.js";

export const AREAS = [
  /* --- open combat areas: the flagship spine ---------------------------- */
  {
    id: "area-cinderfall", name: "Cinderfall Verge", kind: "combat", level: 1,
    blurb: "Where the veil first thinned. Half of it is still somebody's orchard.",
    monsters: ["hollow-wisp", "rust-kite"],
  },
  {
    id: "area-ashen-hollow", name: "The Ashen Hollow", kind: "combat", level: 26,
    blurb: "A shift that ended in the war and never got the message.",
    monsters: ["ashen-revenant", "slag-behemoth"],
  },
  {
    id: "area-slagfen", name: "Slagfen Deeps", kind: "combat", level: 54,
    blurb: "The water is warm. That is not good news.",
    monsters: ["void-harrier", "emberquartz-colossus"],
  },
  {
    id: "area-stormcrown", name: "Stormcrown Reach", kind: "combat", level: 80,
    blurb: "Weather with intent, over a ridge nobody surveyed twice.",
    monsters: ["stormcrown-wyrm", "riftbound-sovereign"],
  },
  {
    id: "area-ninefold-gate", name: "The Ninefold Gate", kind: "combat", level: 99,
    blurb: "The last thing the old guilds built. It is not hostile; it is on duty.",
    monsters: ["the-ninefold-warden"],
  },

  /* --- bounty grounds: relics and armour, licensed ---------------------- */
  {
    id: "area-low-ember", name: "Low Ember Reach", kind: "bounty", level: 1, skill: "bounties",
    blurb: "The first ground the board will licence you for. Relics and Emberweave.",
    monsters: ["ashling-swarm", "scrapjaw"],
  },
  {
    id: "area-kiln-steps", name: "The Kiln Steps", kind: "bounty", level: 20, skill: "bounties",
    blurb: "Hot, loud, and full of Slagplate that used to belong to somebody.",
    monsters: ["kiln-stalker", "cinderfen-lurker"],
  },
  {
    id: "area-glasswing-fen", name: "Glasswing Fen", kind: "bounty", level: 45, skill: "bounties",
    blurb: "Voidmail comes out of the fen. So do the things wearing it.",
    monsters: ["glasswing-drake", "duskheart-sentinel"],
  },
  {
    id: "area-choir", name: "The Choir Deep", kind: "bounty", level: 70, skill: "bounties",
    blurb: "Ninefold plate, and nine voices explaining why you should leave it.",
    monsters: ["riftglass-herald", "the-hollow-choir"],
  },
];

export const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));

/** The first area a monster appears in, for the "you are here" readout. */
export function areaFor(monsterId) {
  return AREAS.find((a) => a.monsters.includes(monsterId)) || null;
}

/** Why this area is shut, or null. `game` is a Game. */
export function areaLocked(game, area) {
  if (!area.skill) return null;
  const lvl = game.skillLevel(area.skill);
  return lvl >= area.level ? null : `Requires ${game.db.skill(area.skill).name} ${area.level}`;
}

/* --- self-validation ------------------------------------------------------
   ../index.js validates skills, items, monsters and the shop; this file is
   imported by the screens rather than by the database, so it carries its own.
   A dangling monster id here would show up as an area that renders one row
   short, forty hours in, on one area. */
(function validate() {
  const problems = [];
  const seen = new Set();
  for (const a of AREAS) {
    if (seen.has(a.id)) problems.push(`duplicate area id "${a.id}"`);
    seen.add(a.id);
    if (!a.monsters.length) problems.push(`${a.id}: no monsters`);
    for (const id of a.monsters) {
      if (!MONSTER_BY_ID.has(id)) problems.push(`${a.id}: unknown monster "${id}"`);
    }
  }
  /* Every monster must be reachable from at least one area, or it is content
     the player can never legitimately meet. */
  const reachable = new Set(AREAS.flatMap((a) => a.monsters));
  for (const id of MONSTER_BY_ID.keys()) {
    if (!reachable.has(id)) problems.push(`monster "${id}" is in no area`);
  }
  if (problems.length) throw new Error(`Emberveil areas are invalid:\n  - ${problems.join("\n  - ")}`);
})();
