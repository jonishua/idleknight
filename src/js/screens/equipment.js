/* =========================================================================
   EMBERVEIL — SCREEN: EQUIPMENT  (routed from Combat, parity §3j)

   §3j puts equipment ON the combat screen: a grid of slots, a "View Equipment
   Stats" readout and a "Change Equipment Set" control. The grid and both
   controls are there; this page is what the grid opens — the per-slot picker
   and the full stat table, which do not fit next to two HP bars on a 390px
   phone.

   It is registered in ./registry.js without a nav button of its own, the same
   way `completion` and `stats` are: the five-slot tab bar is spoken for, and
   Combat routes here with ctx.goTab("equipment").

   THE WEAPON SLOT HAS NO PICKER. Relics are cumulative attunements bought
   from the shop rather than swappable objects — the ninth does not replace
   the first, it adds to it, and the whole economy was measured that way. So
   the weapon slot is a readout of your strongest relic. See the long note in
   ../../data/equipment.js.
   ========================================================================= */

import { DB } from "../engine/index.js";
import {
  el, esc, num, int, mark, initials, sect, line, sheet, toolbar, segmented, statSplit,
} from "./ui.js";
import { SLOTS, SLOT_BY_ID, EQUIPMENT_SETS } from "../../data/equipment.js";
import { combatNav } from "./combat.js";

/** Which slot's picker is open, or null for the grid. */
let openSlot = null;

/* =========================================================================
   THE PICKER
   ========================================================================= */

function picker(ctx, slotId) {
  const { game, render: rerender, toast } = ctx;
  const slot = SLOT_BY_ID.get(slotId);
  const set = game.equipmentSet();
  const out = [];

  const back = el(`<button class="row-card" type="button"><span class="row-card__body">
    <span class="row-card__title">‹ All slots</span></span></button>`);
  back.onclick = () => { openSlot = null; rerender(); };
  out.push(back, sect(slot.name));

  if (set[slotId]) {
    const worn = DB.item(set[slotId]);
    out.push(el(`<div class="row-card is-active">${mark(worn.id, initials(worn.name))}
      <span class="row-card__body"><span class="row-card__title">${esc(worn.name)}<span class="badge badge--on">Worn</span></span>
      <span class="row-card__sub">${esc(worn.equip.text)}</span></span></div>`));
    out.push(toolbar([{ text: "Unequip", onClick: () => { game.unequip(slotId); toast(`Removed ${worn.name}`); rerender(); } }]));
  }

  /* Everything that fits, whether held or not: a picker that hides what you
     have not found yet is a picker that never tells you what to go and get. */
  const fits = [...DB.items.values()].filter((i) => i.equip?.slot === slotId);
  for (const it of fits) {
    const held = game.count(it.id);
    const worn = set[slotId] === it.id;
    const why = game.canEquip(it.id);
    const b = el(`<button class="row-card${why && !worn ? " is-locked" : ""}" type="button"${why && !worn ? " disabled" : ""}>
      ${mark(it.id, initials(it.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(it.name)}</span>
        <span class="row-card__sub">${esc(it.equip.text)}</span>
        <span class="row-card__meta">${held ? `${num(held)} held` : "none held"} · needs ${esc(DB.skill(it.equip.skill).name)} ${it.equip.level} · ${num(it.value)} cogs</span>
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${it.equip.level}</span><span class="row-card__lvl-cap">req</span></span>
    </button>`);
    if (!why && !worn) b.onclick = () => { const err = game.equip(it.id); toast(err || `Equipped ${it.name}`, err ? "bad" : ""); rerender(); };
    out.push(b);
  }
  return out;
}

/* =========================================================================
   THE GRID
   ========================================================================= */

function grid(ctx) {
  const { game, render: rerender, toast } = ctx;
  const set = game.equipmentSet();
  const relic = game.equippedRelic();
  const st = game.combatStats();
  const out = [combatNav(ctx, "equipment")];

  out.push(statSplit([
    ["Max Hit", int(st.maxHit)],
    ["Accuracy", int(st.accuracy)],
    ["Evasion", int(st.evasion)],
  ]));

  /* Change Equipment Set, inline: this is the page where switching loadout is
     the thing you came to do. */
  const sets = [];
  for (let i = 0; i < game.equipmentSets(); i++) sets.push([String(i), `Set ${i + 1}`]);
  out.push(el(`<p class="sect">Change Equipment Set</p>`));
  out.push(segmented(sets, String(game.state.equipment.active), (v) => {
    game.setEquipmentSet(Number(v)); rerender();
  }));

  out.push(sect("Slots"));
  const g = el(`<div class="bank-grid"></div>`);
  for (const slot of SLOTS) {
    const worn = slot.derived ? relic : (set[slot.id] ? DB.item(set[slot.id]) : null);
    const cell = el(`<button class="bank-cell" type="button" ${slot.derived ? "disabled" : ""}
      style="${worn ? "" : "opacity:.55"}">
      ${worn ? mark(worn.id, initials(worn.name)) : mark(slot.id, initials(slot.name))}
      <div class="bank-cell__name">${esc(worn ? worn.name : "Empty")}</div>
      <div class="bank-cell__each">${esc(slot.name)}</div>
    </button>`);
    if (!slot.derived) cell.onclick = () => { openSlot = slot.id; rerender(); };
    g.append(cell);
  }
  out.push(g);
  if (relic) {
    out.push(el(`<p class="row-card__sub" style="white-space:normal;padding:var(--s-2)">The weapon slot shows your strongest relic — ${esc(relic.name)}. Relics are cumulative attunements from the shop, so there is nothing to swap.</p>`));
  }

  /* How close each set is to complete: the reason to keep farming one area. */
  out.push(sect("Sets"));
  for (const s of EQUIPMENT_SETS) {
    const pieces = [...DB.items.values()].filter((i) => i.equip?.set === s.id);
    const held = pieces.filter((i) => game.count(i.id) > 0 || set[i.equip.slot] === i.id).length;
    out.push(el(`<div class="row-card">${mark(s.id, initials(s.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(s.name)}</span>
        <span class="row-card__sub">${held} of ${pieces.length} pieces found</span>
        <span class="bar bar--sm" style="margin-top:6px"><span class="bar__fill" style="--fill:${((held / pieces.length) * 100).toFixed(1)}%"></span></span>
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${s.level}</span><span class="row-card__lvl-cap">req</span></span>
    </div>`));
  }

  out.push(toolbar([{
    text: "View Equipment Stats",
    onClick: () => {
      const rows = SLOTS.filter((sl) => !sl.derived && set[sl.id])
        .map((sl) => line(DB.item(set[sl.id]).name, DB.item(set[sl.id]).equip.text));
      if (relic) rows.unshift(line(relic.name, relic.text));
      sheet("Equipment Stats", "Every worn source, with its sign.",
        [el(`<section class="panel">${rows.length ? rows.join("") : line("Nothing worn", "—")}</section>`)]);
    },
  }]));
  if (!Object.values(set).some(Boolean)) {
    out.push(el(`<p class="empty">Nothing equipped. Armour drops in the Bounty Grounds — the areas the contract board licences you for.</p>`));
  }
  return out;
}

export default {
  id: "equipment",
  label: "Equipment",
  render: (ctx) => (openSlot ? picker(ctx, openSlot) : grid(ctx)),
  reset: () => { openSlot = null; },
};
