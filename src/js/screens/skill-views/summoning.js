/* =========================================================================
   EMBERVEIL — SKILL VIEW: SUMMONING   (parity §3f)

   §3f asks for five things and all five are here:

     "Marks discovery — 31 / 61 marks found"
                          the counter is the first thing on the page, because
                          it is the only progress bar in the game that fills
                          while you are looking at a different skill.
     "Marks drop while training the associated skill"
                          every familiar row names its skill and links to it,
                          so the question "where do I find this one" is
                          answered on the row rather than in a wiki.
     "the first mark must be converted into a tablet before more of that mark
      can drop"
                          a found-but-uncrafted mark says so, in those words,
                          and its Create button is the thing that unblocks it.
     "having the familiar equipped doubles its mark rate"
                          the equipped rows say x2 on the mark line.
     "Categories, Create Familiar Tablets, and Synergies between familiar
      pairs"
                          two tabs — Familiars and Synergies — over a shared
                          equipped-slot header.

   Everything numeric is read through the system module, which is the same
   code the tick loop runs, so the batch size a row promises is the batch size
   the craft delivers.
   ========================================================================= */

import { DB, TICK_MS } from "../../engine/index.js";
import { el, esc, num, int, secs, mark, initials, segmented, xpPct } from "../ui.js";
import {
  FAMILIARS, FAMILIAR_BY_ID, MARK_MAX_LEVEL, FAMILIAR_SLOTS,
  tabletsPerCraft, tabletId, craftId,
} from "../../../data/familiars.js";
import {
  sumState, markOf, isEquipped, found, TOTAL_MARKS,
  equip, unequip, canEquip, activeSynergy, synergyList,
} from "../../engine/systems/summoning.js";
import { ensureHooks } from "../../engine/systems/agility.js";

const SKILL = "summoning";
let tab = "familiars";

/* =========================================================================
   THE HEADER — marks found, and the two equipped slots
   ========================================================================= */

function marksPanel(ctx) {
  const { game } = ctx;
  const n = found(game);
  const pct = (n / TOTAL_MARKS) * 100;
  const syn = activeSynergy(game);
  const st = game.state.summoning;

  const slotCell = (i) => {
    const id = st?.equipped?.[i] || null;
    const f = id ? FAMILIAR_BY_ID.get(id) : null;
    const held = f ? game.count(tabletId(f.id)) : 0;
    return `<button class="row-card" type="button" data-slot="${i}" style="margin:0;flex:1 1 0;min-width:0">
      ${mark(f ? tabletId(f.id) : `slot-${i}`, f ? initials(f.name) : "—")}
      <span class="row-card__body">
        <span class="row-card__title" style="font-size:var(--fs-label)">${esc(f ? f.name : `Familiar ${i + 1}`)}</span>
        <span class="row-card__sub">${f ? `${num(held)} tablets left` : "Empty slot"}</span>
      </span></button>`;
  };

  const p = el(`<section class="panel">
    <div class="row--between">
      <p class="t-label">Marks discovery</p>
      <p class="t-value u-tnum" style="color:var(--c-gold-core)">${n} / ${TOTAL_MARKS} marks found</p>
    </div>
    <div class="bar bar--violet" style="margin-top:var(--s-2)"><div class="bar__fill" style="--fill:${pct.toFixed(1)}%"></div></div>
    <p class="t-micro" style="color:var(--c-text-2);margin-top:6px">Marks drop while you train the skill each familiar is marked in — never here.</p>
    <div class="divider" style="margin:var(--s-3) 0"></div>
    <p class="t-label" style="margin-bottom:var(--s-2)">Equipped — one tablet per action, each</p>
    <div style="display:flex;gap:var(--s-2)">${[...Array(FAMILIAR_SLOTS)].map((_, i) => slotCell(i)).join("")}</div>
    <p class="t-micro" id="smSyn" style="color:${syn ? "var(--c-gold-core)" : "var(--c-text-2)"};margin-top:var(--s-2)">${
      syn ? `Synergy — ${esc(syn.name)}: ${esc(syn.text)}` : "No synergy: equip a matched pair."
    }</p>
  </section>`);

  for (const b of p.querySelectorAll("[data-slot]")) {
    b.onclick = () => {
      const i = Number(b.dataset.slot);
      if (game.state.summoning?.equipped?.[i]) {
        unequip(game, i);
        ctx.toast("Familiar unequipped");
      } else {
        ctx.toast("Tap a familiar below to equip it", "");
        tab = "familiars";
      }
      ctx.render();
    };
  }
  return p;
}

/* =========================================================================
   FAMILIAR ROWS  ("Create Familiar Tablets")
   ========================================================================= */

function familiarRow(ctx, f) {
  const { game, toast, markDirty, render } = ctx;
  const lv = game.skillLevel(SKILL);
  const recipe = DB.recipe(craftId(f.id));
  const m = markOf(game, f.id);
  const level = m?.level || 0;
  const crafted = !!m?.crafted;
  const held = game.count(tabletId(f.id));
  const locked = lv < f.level;
  const undiscovered = level === 0;
  const runningThis = game.state.action?.recipeId === recipe.id;
  const equipped = isEquipped(game, f.id);
  const batch = tabletsPerCraft(level);

  const markLine = undiscovered
    ? `Mark undiscovered — train ${esc(DB.skill(f.skill).name)} to find it`
    : !crafted
      ? "Mark found. Create a tablet before more of this mark can drop."
      : `Mark ${level} / ${MARK_MAX_LEVEL}${equipped ? " · x2 rate while equipped" : ""} — deepens in ${esc(DB.skill(f.skill).name)}`;

  const inputs = [
    ...recipe.consumes.map(([i, q]) => `${q}x ${DB.item(i).name}`),
    ...(recipe.shards ? [`${recipe.shards} Aether Shards`] : []),
  ].join(" + ");

  const canCraft = !locked && !undiscovered;
  const ivl = locked ? 0 : (game.actionIntervalTicks(SKILL, recipe.id) * TICK_MS) / 1000;

  const row = el(`<div class="row-card${locked || undiscovered ? " is-locked" : ""}${runningThis ? " is-active" : ""}" data-fam="${esc(f.id)}">
    ${mark(tabletId(f.id), initials(f.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(f.name)}${equipped ? '<span class="badge badge--on">Equipped</span>' : ""}${runningThis ? '<span class="badge badge--on">Creating</span>' : ""}</span>
      <span class="row-card__sub" style="white-space:normal;display:block">${markLine}</span>
      <span class="row-card__meta u-tnum" style="display:block">${locked ? `Requires Summoning ${f.level}` :
        `${esc(inputs)} -> ${batch}x tablet · ${secs(ivl)} · ${int(recipe.xp)} XP · ${num(held)} held`}</span>
      <span class="row-card__meta" style="display:block;color:var(--c-gold-core);opacity:.85">${esc(f.text)}</span>
      ${locked ? "" : `<span class="bar bar--sm bar--violet" style="margin-top:5px"><span class="bar__fill"
        data-mbar style="--fill:${xpPct(game.masteryXp(SKILL, recipe.id), game.masteryLevel(SKILL, recipe.id)).toFixed(1)}%"></span></span>`}
    </span>
    <span class="row-card__right" style="display:flex;flex-direction:column;align-items:stretch;gap:5px;width:84px">
      ${locked || undiscovered
        ? `<span class="row-card__lvl u-tnum">${f.level}</span><span class="row-card__lvl-cap">req</span>`
        : `<button class="btn-gold btn-gold--sm" type="button" data-act="craft" style="font-size:10px;padding:6px 4px;letter-spacing:.04em">${runningThis ? "Stop" : "Create"}</button>
           <button class="btn-ghost" type="button" data-act="equip" style="font-size:10px;padding:6px 4px"${held < 1 && !equipped ? " disabled" : ""}>${equipped ? "Unequip" : "Equip"}</button>`}
    </span></div>`);

  if (canCraft) {
    row.querySelector('[data-act="craft"]').onclick = () => {
      if (runningThis) { game.stop(); markDirty(); render(); return; }
      const missing = recipe.consumes.find(([i, q]) => game.count(i) < q);
      if (missing) return toast(`Need ${missing[1]}x ${DB.item(missing[0]).name}`, "bad");
      if (recipe.shards && game.state.shards < recipe.shards) return toast(`Need ${recipe.shards} Aether Shards`, "bad");
      game.start(SKILL, recipe.id);
      markDirty(); render();
      toast(`Creating ${f.name} Tablets`);
    };
    row.querySelector('[data-act="equip"]').onclick = () => {
      if (equipped) { unequip(game, game.state.summoning.equipped.indexOf(f.id)); toast("Unequipped"); }
      else {
        const why = canEquip(game, f.id);
        if (why) return toast(why, "bad");
        const st = sumState(game, true);
        const slot = st.equipped.indexOf(null) >= 0 ? st.equipped.indexOf(null) : 0;
        equip(game, f.id, slot);
        toast(`${f.name} equipped`, "violet");
      }
      render();
    };
  }
  return row;
}

/* =========================================================================
   SYNERGIES
   ========================================================================= */

function synergyRow(ctx, s) {
  const [a, b] = s.pair.map((id) => FAMILIAR_BY_ID.get(id));
  return el(`<div class="row-card${s.live ? " is-active" : s.known ? "" : " is-locked"}">
    ${mark(s.pair[0], initials(s.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(s.name)}${s.live ? '<span class="badge badge--on">Active</span>' : ""}</span>
      <span class="row-card__sub" style="white-space:normal;display:block">${esc(s.text)}</span>
      <span class="row-card__meta" style="display:block">${esc(a.name)} + ${esc(b.name)}</span>
    </span>
    <span class="row-card__right"><span class="row-card__lvl-cap">${s.live ? "live" : s.known ? "equip both" : "undiscovered"}</span></span>
  </div>`);
}

/* =========================================================================
   THE VIEW
   ========================================================================= */

function render(ctx, skill) {
  ensureHooks(ctx.game);
  const { game } = ctx;
  const out = [marksPanel(ctx)];

  out.push(segmented([["familiars", "Create Familiar Tablets"], ["synergies", "Synergies"]], tab, (v) => {
    tab = v; ctx.render();
  }));

  if (tab === "familiars") {
    out.push(el(`<p class="sect">Familiars — ${FAMILIARS.length}</p>`));
    for (const f of FAMILIARS) out.push(familiarRow(ctx, f));
  } else {
    const list = synergyList(game);
    out.push(el(`<p class="sect">Synergies — ${list.filter((s) => s.known).length} / ${list.length} reachable</p>`));
    for (const s of list) out.push(synergyRow(ctx, s));
  }
  out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(skill.blurb)}</p>`));
  return out;
}

/** Per tick: tablet counts and the mastery bars move while a craft runs. */
function paint(ctx) {
  const { game } = ctx;
  for (const row of document.querySelectorAll("[data-fam]")) {
    const f = FAMILIAR_BY_ID.get(row.dataset.fam);
    if (!f) continue;
    const bar = row.querySelector("[data-mbar]");
    if (bar) {
      const id = craftId(f.id);
      bar.style.setProperty("--fill", `${xpPct(game.masteryXp(SKILL, id), game.masteryLevel(SKILL, id)).toFixed(1)}%`);
    }
  }
}

export default { kind: "summoning", render, paint };
