/* =========================================================================
   EMBERVEIL — SKILL VIEW: ARTISAN   (parity §3b, and §3i for Transmutation)

   The archetype behind Smithing, Cooking, Bowcraft, Crafting, Enchanting,
   Alchemy and Firemaking, plus the one spellcasting variant §3i describes.

   §3b's block, clause by clause, is on screen here:

     "Select <Skill> Category"       a real category picker, from the skill's
                                     own `categories`. Skills with none get a
                                     single "All" entry rather than a missing
                                     control.
     "<owned count of the selected
       output>"                      the stack you already hold of the thing
                                     the selected recipe makes, top right.
     "[Create] <Dragonite Bar>
       50% preserve 45% double
       mastery 99  54,627,423"       the selected recipe's header: its two
                                     percentages, its mastery level and its
                                     mastery XP.
     "Requires: 1 x, 2 x, 12 x
      You Have: 132K, 59,973, 2"     the two aligned rows, so a shortfall is
                                     visible without arithmetic. A line the
                                     player cannot afford is marked.
     "Produces: 1 x"                 including the quantity modifiers actually
                                     in play, so "1.15 x" is the truth when a
                                     doubling roll is live.
     "Grants: 60 xp, 1065 mastery,
      532 pool"                      all three, computed from §2.1's real MXP
                                     formula and §2.2's deposit rate.
     "[Create] 2.00s"                the button and the EFFECTIVE interval.
     "recipe list with per-recipe
      mastery levels"                every recipe in the category, each with
                                     its own mastery level and its own
                                     preserve / double percentages.

   COOKING GETS THE REST OF §3b. Three stations, each holding its own recipe,
   an Active Cook and a Passive Cook filling a Stockpile you Collect from, an
   "Enable Perfect Cooks?" toggle, and per-recipe success and perfect
   percentages on the row. The passive half is a real tick system —
   ../../engine/systems/cooking-stations.js — not a screen timer.

   TRANSMUTATION GETS §3i. "Click Image to Choose Item", a two-part rune cost
   printed the way the reference prints it, a "Use Combination Runes" toggle
   that genuinely changes what a cast consumes, and Cast at 2.00s.

   ---------------------------------------------------------------------------
   WHY THE NUMBERS ARE RE-DERIVED AND NOT READ OFF game.mods()
   ---------------------------------------------------------------------------
   The engine only puts a recipe's OWN mastery unlocks into the modifier set
   while that recipe is the live action — correctly, because no other recipe
   can be affected by them on that tick. A page that showed `game.mods()`
   directly would therefore print one honest row and nine rows missing their
   own mastery bonuses, and the numbers would jump the moment you pressed
   Create. So this file sums the skill-and-global entries out of the live set
   and adds the row's own unlocks itself, through the same §4.1 / §7.1 /
   §7.2 arithmetic the tick loop uses. `rowMods()` is the one place that
   happens, and every percentage on the page comes out of it.
   ========================================================================= */

import {
  DB, MOD, TICK_MS, intervalTicks, ticksToSeconds, masteryXpPerAction,
  poolDepositRate, clamp, PRESERVE_CAP, INTERVAL_REDUCTION_CAP, MASTERY_CAP,
} from "../../engine/index.js";
import {
  el, esc, num, int, secs, pct2, mark, initials, xpPair, xpPct, selector,
  segmented, sheet, sect,
} from "../ui.js";
import {
  activeStationId, applyComboRunes, applyPerfectCooks, collect, comboRunesEnabled,
  passiveSeconds, perfectCooksEnabled, selectStation, setComboRunes, setPerfectCooks,
  stationState, stockpile, stockpileCount, drinkPotion, activePotions, doseSeconds,
  clearPotion,
} from "../../engine/systems/cooking-stations.js";

/* -------------------------------------------------------------------------
   PAGE STATE. Per skill, so leaving Cooking and coming back to Bowcraft does
   not hand you Cooking's selection.
   ------------------------------------------------------------------------- */
const chosen = Object.create(null);    // skillId -> recipeId
const chosenCat = Object.create(null); // skillId -> category id
let stationTab = "fire";               // Cooking only

/** The skill's own verb, so a list of nouns reads as a list of actions. */
const VERBS = {
  kilnwork: "Smelt", hearthcraft: "Cook", sigilwork: "Bind", emberrite: "Burn",
  bowcraft: "Craft", crafting: "Craft", alchemy: "Brew", transmutation: "Cast",
};
const verbFor = (id) => VERBS[id] || "Create";

/* =========================================================================
   CATEGORIES
   ========================================================================= */

function categoriesOf(skill) {
  if (skill.stations) return skill.stations.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb }));
  if (skill.categories) return skill.categories;
  return [{ id: "all", name: "All", blurb: "" }];
}

const catOfRecipe = (skill, r) =>
  skill.stations ? r.station : (skill.categories ? r.category : "all");

function currentCat(skill) {
  const cats = categoriesOf(skill);
  const want = chosenCat[skill.id];
  return cats.some((c) => c.id === want) ? want : cats[0].id;
}

function recipesIn(skill, catId) {
  return skill.recipes.filter((r) => catOfRecipe(skill, r) === catId);
}

function currentRecipe(skill) {
  const list = recipesIn(skill, currentCat(skill));
  const want = chosen[skill.id];
  return list.find((r) => r.id === want) || list[0] || skill.recipes[0];
}

/* =========================================================================
   THE ARITHMETIC — see the file header for why it is done here
   ========================================================================= */

/** Sum this recipe's OWN mastery-unlock contributions to one modifier name. */
function ownUnlocks(skill, masteryLevel, name) {
  let v = 0;
  for (const u of skill.masteryUnlocks || []) {
    if (masteryLevel < u.level) continue;
    for (const [n, val, sym] of u.mods || []) if (n === name && sym === "recipe") v += val;
  }
  return v;
}

/**
 * Everything the page prints about one row, through the same arithmetic the
 * tick loop uses: §4.1 for the interval, §7.1 for the additive stacking,
 * §7.2's 80% cap for preservation, §2.1 for mastery XP and §2.2 for the pool.
 */
export function rowMods(game, skill, r) {
  const m = game.mods();
  const S = [skill.id];
  const lvl = game.masteryLevel(skill.id, r.id);

  const pctRaw = -(m.sum(MOD.intervalPercent, S) + ownUnlocks(skill, lvl, MOD.intervalPercent));
  const flat = m.sum(MOD.intervalFlat, S) + ownUnlocks(skill, lvl, MOD.intervalFlat);
  const base = r.interval ?? skill.baseInterval ?? 3;
  const ticks = intervalTicks(base, Math.min(pctRaw, INTERVAL_REDUCTION_CAP), flat);
  const seconds = ticksToSeconds(ticks);

  const cap = PRESERVE_CAP + m.sum(MOD.preserveCap, S);
  const preserve = clamp(m.sum(MOD.preserveChance, S) + ownUnlocks(skill, lvl, MOD.preserveChance), 0, cap);
  const double = Math.max(0, m.sum(MOD.doubleChance, S) + ownUnlocks(skill, lvl, MOD.doubleChance));
  const flatQty = m.sum(MOD.flatQuantity, S) + ownUnlocks(skill, lvl, MOD.flatQuantity);

  const xp = r.xp * (1 + m.sum(MOD.skillXP, S) + ownUnlocks(skill, lvl, MOD.skillXP));

  const at = skill.masteryActionTime;
  const actionTime = at === "actual" ? seconds
    : at?.fixed !== undefined ? at.fixed
    : at?.ofBase !== undefined ? at.ofBase * base
    : seconds;
  const mxp = skill.mastery
    ? masteryXpPerAction({
        unlockedActions: game.unlockedActions(skill.id),
        totalMasteryInSkill: game.totalMastery(skill.id),
        totalItemsInSkill: DB.recipeCounts[skill.id] || skill.recipes.length,
        itemMasteryLevel: lvl,
        actionTime,
        bonus: m.sum(MOD.masteryXP, S) + ownUnlocks(skill, lvl, MOD.masteryXP),
      })
    : 0;
  const pool = mxp * poolDepositRate(game.skillLevel(skill.id));

  /* §7.5 — Cooking's success climbs to certainty at mastery 50 and the same
     climb keeps paying into the perfect roll after that. */
  let success = 1, perfect = 0;
  if (skill.quality) {
    success = Math.min(1, skill.quality.successBase + skill.quality.successPerMastery * lvl);
    perfect = Math.min(1, (skill.quality.perfectPerMastery || 0) * lvl);
  }

  return {
    seconds, preserve, double, flatQty, xp, mxp, pool, masteryLevel: lvl,
    masteryXp: game.masteryXp(skill.id, r.id),
    quantity: (1 + double) * success + flatQty,
    success, perfect,
  };
}

/** Is every input in the bank? Returns the first shortfall, or null. */
function shortfall(game, r) {
  for (const [id, q] of r.consumes || []) if (game.count(id) < q) return [id, q];
  if (r.shards && game.state.shards < r.shards) return ["shards", r.shards];
  return null;
}

/* =========================================================================
   THE SELECTED-RECIPE PANEL  (§3b's centre block)
   ========================================================================= */

function costRows(game, skill, r) {
  /* §3b prints the cost as TWO ALIGNED ROWS — "Requires: 1 x, 2 x, 12 x" over
     "You Have: 132K, 59,973, 2" — so a shortfall is a column you can read
     rather than arithmetic you have to do. §3i splits the Requires row again,
     into a material list and a rune list joined by "and:". Only the
     spellcasting archetype does that; everything else has one list.

     Every cell is emitted in the same order in both rows, and a cell you
     cannot afford is marked in both. */
  const split = skill.archetype === "spellcasting" && r.materials;
  const runes = comboRunesEnabled(game) && r.comboRunes ? r.comboRunes : r.runes;
  const cells = split ? [...r.materials, ...runes] : [...(r.consumes || [])];
  const andAt = split ? r.materials.length : -1;

  const cell = (text, short, extra = "") =>
    `<span class="t-micro u-tnum" style="${short ? "color:var(--c-gold-light);" : ""}${extra}">${text}</span>`;
  const sep = (i) => (i === andAt ? `<span class="t-label" style="opacity:.7">and:</span>` : "");

  const need = cells.map(([id, q], i) =>
    sep(i) + cell(`${q} x ${esc(DB.item(id).name)}`, game.count(id) < q));
  const have = cells.map(([id, q], i) =>
    sep(i) + cell(num(game.count(id)), game.count(id) < q, "color:var(--c-text-2)"));

  if (r.shards) {
    const short = game.state.shards < r.shards;
    need.push(cell(`${r.shards} x Aether Shards`, short));
    have.push(cell(num(game.state.shards), short, "color:var(--c-text-2)"));
  }
  if (!need.length) return "";

  const row = (label, list) => `<div class="row--between" style="align-items:flex-start;gap:var(--s-2);margin-top:4px">
    <span class="t-label" style="flex:0 0 68px">${esc(label)}</span>
    <span style="flex:1 1 auto;display:flex;flex-wrap:wrap;gap:var(--s-2);justify-content:flex-end;align-items:baseline">
      ${list.join("")}</span></div>`;
  return row("Requires", need) + row("You Have", have);
}

function selectedPanel(ctx, skill, r) {
  const { game, toast, markDirty } = ctx;
  const s = rowMods(game, skill, r);
  const running = game.state.action?.recipeId === r.id && !game.state.combat;
  const locked = game.skillLevel(skill.id) < r.level;
  const verb = verbFor(skill.id);
  const spell = skill.archetype === "spellcasting";

  const panel = el(`<section class="panel">
    <div class="row" style="gap:var(--s-3);align-items:flex-start">
      ${mark(r.produces || r.id, initials(r.name))}
      <div class="grow">
        <p class="t-value" style="color:var(--c-gold-core)">${esc(r.name)}</p>
        <p class="t-micro u-tnum" style="color:var(--c-text-2)">
          ${pct2(s.preserve)} preserve &nbsp;·&nbsp; ${pct2(s.double)} double${
            skill.quality ? ` &nbsp;·&nbsp; ${pct2(s.success)} success &nbsp;·&nbsp; ${pct2(s.perfect)} perfect` : ""}</p>
        <p class="t-micro u-tnum" style="color:var(--c-text-2)">
          mastery ${s.masteryLevel} &nbsp;·&nbsp; ${xpPair(Math.floor(s.masteryXp), s.masteryLevel, MASTERY_CAP)}</p>
      </div>
    </div>

    <div class="divider" style="margin:var(--s-3) 0"></div>
    ${costRows(game, skill, r)}
    <div class="row--between" style="margin-top:var(--s-2)">
      <span class="t-label" style="flex:0 0 68px">Produces</span>
      <span class="t-micro u-tnum">${s.quantity.toFixed(2)} x ${esc(r.produces ? DB.item(r.produces).name : "—")}</span>
    </div>
    <div class="row--between" style="margin-top:4px">
      <span class="t-label" style="flex:0 0 68px">Grants</span>
      <span class="t-micro u-tnum">${int(s.xp)} xp &nbsp;·&nbsp; ${int(s.mxp)} mastery &nbsp;·&nbsp; ${int(s.pool)} pool</span>
    </div>

    <div class="bar" style="margin-top:var(--s-3)"><div class="bar__fill" id="avBar" style="--fill:0%"></div></div>
    <div class="row" style="gap:var(--s-2);margin-top:var(--s-3)">
      <button class="btn-gold" type="button" style="flex:1 1 auto"${locked ? " disabled" : ""}
        >${locked ? `Requires level ${r.level}` : running ? "Stop" : (spell ? "Cast" : verb)}</button>
      <span class="t-value u-tnum" id="avIvl" data-recipe="${esc(r.id)}" style="flex:0 0 auto;color:var(--c-gold-core)">${secs(s.seconds)}</span>
    </div>
  </section>`);

  if (!locked) {
    panel.querySelector("button").onclick = () => {
      if (running) { game.stop(); markDirty(); return; }
      const miss = shortfall(game, r);
      if (miss) {
        return toast(miss[0] === "shards"
          ? `Need ${miss[1]} Aether Shards`
          : `Need ${miss[1]}x ${DB.item(miss[0]).name}`, "bad");
      }
      game.start(skill.id, r.id);
      markDirty();
      toast(`${spell ? "Casting" : verb} ${r.name}`);
    };
  }
  return panel;
}

/* =========================================================================
   THE RECIPE LIST  (§3b's "recipe list with per-recipe mastery levels")
   ========================================================================= */

function recipeRow(ctx, skill, r, selectedId) {
  const { game, render } = ctx;
  const lv = game.skillLevel(skill.id);
  const locked = lv < r.level;
  const running = game.state.action?.recipeId === r.id && !game.state.combat;
  const s = locked ? null : rowMods(game, skill, r);
  const short = locked ? null : shortfall(game, r);

  const meta = locked
    ? `Requires ${esc(skill.name)} level ${r.level}`
    : `${pct2(s.preserve)} preserve · ${pct2(s.double)} double${
        skill.quality ? ` · ${pct2(s.success)} success · ${pct2(s.perfect)} perfect` : ""}`;

  const row = el(`<button class="row-card${locked ? " is-locked" : ""}${running ? " is-active" : ""}${
      r.id === selectedId ? " is-active" : ""}" type="button" data-recipe="${esc(r.id)}"${locked ? " disabled" : ""}>
    ${mark(r.produces || r.id, initials(r.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(r.name)}${
        running ? '<span class="badge badge--on">Running</span>' : ""}${
        !locked && short ? '<span class="badge badge--warn">Short</span>' : ""}</span>
      <span class="row-card__sub u-tnum">${locked ? "" : `${int(r.xp)} xp / ${secs(s.seconds)}`}</span>
      <span class="row-card__meta u-tnum" data-meta>${meta}</span>
      ${locked ? "" : `<span class="bar bar--sm bar--violet" style="margin-top:5px"><span class="bar__fill"
        data-mbar style="--fill:${xpPct(s.masteryXp, s.masteryLevel).toFixed(1)}%"></span></span>`}
    </span>
    <span class="row-card__right">
      <span class="row-card__lvl u-tnum">${locked ? r.level : s.masteryLevel}</span>
      <span class="row-card__lvl-cap">${locked ? "req" : "mastery"}</span>
    </span></button>`);

  if (!locked) row.onclick = () => { chosen[skill.id] = r.id; render(); };
  return row;
}

/* =========================================================================
   COOKING'S THREE STATIONS  (§3b, the Cooking clause)
   ========================================================================= */

function stationPanel(ctx, skill) {
  const { game, render, toast } = ctx;
  const out = [];
  const active = activeStationId(game);

  out.push(sect("Stations — one Active Cook, two Passive"));
  out.push(segmented(
    skill.stations.map((st) => {
      const held = stockpileCount(game, st.id);
      return [st.id, `${st.name}${st.id === active ? " ●" : ""}${held ? ` (${held})` : ""}`];
    }),
    stationTab,
    (v) => { stationTab = v; chosenCat[skill.id] = v; render(); }
  ));

  const st = skill.stations.find((x) => x.id === stationTab) || skill.stations[0];
  const slot = stationState(game, st.id);
  const isActive = active === st.id;
  /* A station has two recipes in play and they are not the same thing: the
     one the foreground action is cooking here, and the one the Passive Cook
     is set to. Show the live one when there is one, because "No recipe set"
     over a station you are visibly cooking at is a lie. */
  const liveRec = isActive ? DB.recipe(game.state.action.recipeId) : null;
  const rec = liveRec || (slot?.recipeId ? DB.recipe(slot.recipeId) : null);
  const held = stockpileCount(game, st.id);
  const cap = skill.stockpileCap;

  const panel = el(`<section class="panel">
    <div class="row--between">
      <div style="min-width:0">
        <p class="t-label">${esc(st.name)}</p>
        <p class="t-value" style="color:var(--c-gold-core)">${esc(rec ? rec.name : "No recipe set")}${
          liveRec ? '<span class="badge badge--on" style="margin-left:6px">Active</span>' : ""}</p>
        <p class="t-micro" style="color:var(--c-text-2);opacity:.8">${esc(st.blurb)}</p>
      </div>
      <button class="btn-ghost" type="button" id="avSet" style="flex:0 0 auto">Set recipe</button>
    </div>
    <div class="divider" style="margin:var(--s-3) 0"></div>
    <div class="stat-line"><span>Active Cook</span><b class="u-tnum">${
      liveRec ? secs(rowMods(game, skill, liveRec).seconds) : "idle"}</b></div>
    <div class="stat-line"><span>Passive Cook</span><b class="u-tnum">${
      isActive ? "paused — cooking here"
        : slot?.recipeId ? `${esc(DB.recipe(slot.recipeId).name)} · ${secs(passiveSeconds(game, slot.recipeId))}`
        : "no recipe set"}</b></div>
    <div class="stat-line"><span>Stockpile</span><b class="u-tnum" id="avStock">${held} / ${cap}</b></div>
    ${stockpile(game, st.id).map((s) => `<p class="t-micro u-tnum" style="color:var(--c-text-2)">
        ${num(s.qty)} x ${esc(s.name)}</p>`).join("")}
    <button class="btn-gold" type="button" id="avCollect" style="width:100%;margin-top:var(--s-3)"${
      held ? "" : " disabled"}>Collect from Stockpile</button>
  </section>`);

  panel.querySelector("#avCollect").onclick = () => {
    const n = collect(game, st.id);
    toast(n ? `Collected ${num(n)} from the ${st.name}` : "Nothing to collect");
    render();
  };
  panel.querySelector("#avSet").onclick = () => {
    const list = recipesIn(skill, st.id).filter((r) => game.skillLevel(skill.id) >= r.level);
    if (!list.length) return toast("Nothing unlocked for this station yet", "bad");
    const body = list.map((r) => {
      const b = el(`<button class="row-card" type="button">${mark(r.produces, initials(r.name))}
        <span class="row-card__body"><span class="row-card__title">${esc(r.name)}</span>
        <span class="row-card__sub u-tnum">passive ${secs(passiveSeconds(game, r.id))} · ${
          esc((r.consumes || []).map(([i, q]) => `${q}x ${DB.item(i).name}`).join(" + "))}</span></span></button>`);
      b.onclick = () => { selectStation(game, st.id, r.id); scrim.remove(); render(); };
      return b;
    });
    const clearBtn = el(`<button class="btn-ghost" type="button" style="width:100%">Clear this station</button>`);
    clearBtn.onclick = () => { selectStation(game, st.id, null); scrim.remove(); render(); };
    const scrim = sheet(st.name, "The Passive Cook runs here whenever you are cooking somewhere else.",
      [...body, clearBtn]);
  };
  out.push(panel);

  /* §3b's "Enable Perfect Cooks?" toggle. */
  const on = perfectCooksEnabled(game);
  const t = el(`<button class="row-card" type="button">
    <span class="row-card__body"><span class="row-card__title">Enable Perfect Cooks?</span>
    <span class="row-card__sub">A perfect dish sells for +50% and heals +10%.</span></span>
    <span class="badge${on ? " badge--on" : ""}">${on ? "On" : "Off"}</span></button>`);
  t.onclick = () => { setPerfectCooks(game, !on); render(); };
  out.push(t);
  return out;
}

/* =========================================================================
   ALCHEMY'S SHELF — held potions, live doses
   ========================================================================= */

const makesPotions = (skill) =>
  skill.recipes.some((r) => r.produces && DB.item(r.produces).potion);

function potionPanel(ctx, skill) {
  const { game, render, toast } = ctx;
  const out = [];
  const live = activePotions(game);

  if (live.length) {
    out.push(sect("Active potions"));
    for (const p of live) {
      const row = el(`<div class="row-card" data-potion="${esc(p.itemId)}">
        ${mark(p.itemId, initials(p.name))}
        <span class="row-card__body">
          <span class="row-card__title">${esc(p.name)}</span>
          <span class="row-card__sub">${esc(p.text)}</span>
          <span class="row-card__meta u-tnum" data-left>${secs(p.seconds)} left</span>
        </span>
        <span class="row-card__right"><button class="btn-ghost" type="button">Stop</button></span></div>`);
      row.querySelector("button").onclick = () => { clearPotion(game, p.itemId); render(); };
      out.push(row);
    }
  }

  const held = skill.recipes
    .map((r) => r.produces)
    .filter((id) => id && DB.item(id).potion && game.count(id) > 0);
  out.push(sect(`Potion shelf — ${held.length} kind${held.length === 1 ? "" : "s"} held`));
  if (!held.length) {
    out.push(el(`<p class="empty">Brew something. A dose lasts minutes, not for ever.</p>`));
    return out;
  }
  for (const id of held) {
    const it = DB.item(id);
    const row = el(`<div class="row-card">${mark(id, initials(it.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(it.name)}</span>
        <span class="row-card__sub">${esc(it.potion.text)}</span>
        <span class="row-card__meta u-tnum">${secs(doseSeconds(game, id))} a dose · ${num(game.count(id))} held</span>
      </span>
      <span class="row-card__right"><button class="btn-gold btn-gold--sm" type="button">Drink</button></span></div>`);
    row.querySelector("button").onclick = () => {
      const err = drinkPotion(game, id);
      if (err) return toast(err, "bad");
      toast(`Drank ${it.name}`, "violet");
      render();
    };
    out.push(row);
  }
  return out;
}

/* =========================================================================
   §3i — THE SPELLCASTING HEAD
   ========================================================================= */

function spellHead(ctx, skill, r) {
  const { game, render } = ctx;
  const out = [];

  /* "Click Image to Choose Item". The reference's picker is the image
     itself, and so is ours: the tile is the button. */
  const tile = el(`<section class="panel panel--tight">
    <div class="row" style="gap:var(--s-3)">
      <button type="button" style="border:0;background:none;padding:0;cursor:pointer">
        ${mark(r.produces || r.id, initials(r.name))}
      </button>
      <div class="grow">
        <p class="t-label">Click Image to Choose Item</p>
        <p class="t-value" style="color:var(--c-gold-core)">${esc(r.produces ? DB.item(r.produces).name : r.name)}</p>
        <p class="t-micro" style="color:var(--c-text-2)">${esc(r.name)} · level ${r.level}</p>
      </div>
    </div></section>`);
  const pick = () => {
    const list = skill.recipes.filter((x) => game.skillLevel(skill.id) >= x.level);
    const body = list.map((x) => {
      const b = el(`<button class="row-card" type="button">${mark(x.produces, initials(x.name))}
        <span class="row-card__body"><span class="row-card__title">${esc(x.name)}</span>
        <span class="row-card__sub">-> ${esc(DB.item(x.produces).name)}</span></span></button>`);
      b.onclick = () => { chosen[skill.id] = x.id; chosenCat[skill.id] = x.category; scrim.remove(); render(); };
      return b;
    });
    const scrim = sheet("Choose Item", "Every spell your level allows.", body.length ? body
      : [el(`<p class="empty">Nothing unlocked yet.</p>`)]);
  };
  tile.querySelector("button").onclick = pick;
  out.push(tile);

  /* "Use Combination Runes" — a real cost change, not a display option. */
  const on = comboRunesEnabled(game);
  const t = el(`<button class="row-card" type="button">
    <span class="row-card__body"><span class="row-card__title">${esc(skill.comboToggle.label)}</span>
    <span class="row-card__sub">${esc(skill.comboToggle.help)}</span></span>
    <span class="badge${on ? " badge--on" : ""}">${on ? "On" : "Off"}</span></button>`);
  t.onclick = () => { setComboRunes(game, !on); render(); };
  out.push(t);
  return out;
}

/* =========================================================================
   THE VIEW
   ========================================================================= */

function render(ctx, skill) {
  const { game, render: rerender } = ctx;
  /* Two data-level toggles have to be pushed back into the content before a
     single number is drawn, or the page would print last session's rules. */
  applyPerfectCooks(game);
  applyComboRunes(game);

  const out = [];
  const cats = categoriesOf(skill);
  const cat = currentCat(skill);
  const r = currentRecipe(skill);
  const spell = skill.archetype === "spellcasting";

  if (skill.stations) {
    stationTab = cats.some((c) => c.id === stationTab) ? stationTab : cats[0].id;
    chosenCat[skill.id] = stationTab;
    out.push(...stationPanel(ctx, skill));
  }

  if (spell) out.push(...spellHead(ctx, skill, r));

  /* §3b's "Select <Skill> Category", and the owned count of the selected
     output on the same line. */
  const ownedLine = el(`<div class="row--between" style="margin:var(--s-3) var(--s-1) 0">
    <span class="t-label">${esc(skill.name)} — ${skill.recipes.length} recipes</span>
    <span class="t-value u-tnum" style="color:var(--c-gold-core)">${
      r?.produces ? `${num(game.count(r.produces))} ${esc(DB.item(r.produces).name)}` : ""}</span>
  </div>`);
  out.push(ownedLine);
  out.push(selector(
    `Select ${skill.name} Category`,
    cats.map((c) => [c.id, c.name]),
    cat,
    (v) => { chosenCat[skill.id] = v; if (skill.stations) stationTab = v; rerender(); }
  ));

  if (r) out.push(selectedPanel(ctx, skill, r));

  const blurb = cats.find((c) => c.id === cat)?.blurb;
  if (blurb) out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.75;padding:0 var(--s-1) var(--s-2)">${esc(blurb)}</p>`));

  const list = recipesIn(skill, cat);
  /* sect() escapes for itself — passing esc() through it double-encodes,
     which is how "Shafts & Arrows" became "Shafts &amp; Arrows" on screen. */
  out.push(sect(`${cats.find((c) => c.id === cat)?.name || "All"} — ${list.length}`));
  for (const x of list) out.push(recipeRow(ctx, skill, x, r?.id));

  if (makesPotions(skill)) out.push(...potionPanel(ctx, skill));

  if (skill.blurb) {
    out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(skill.blurb)}</p>`));
  }
  return out;
}

/** Per tick: the action bar, the interval, the stockpile, the dose timers. */
function paint(ctx, skill) {
  const { game } = ctx;
  const a = game.state.action;
  const bar = document.getElementById("avBar");
  if (bar) {
    const live = a && a.skillId === skill.id && !game.state.combat && a.intervalTicks > 0;
    const p = live ? (1 - a.ticks / a.intervalTicks) * 100 : 0;
    bar.style.setProperty("--fill", `${Math.max(0, Math.min(100, p)).toFixed(1)}%`);
  }
  /* The figure beside the button is the INTERVAL, which is what §3b prints
     there — not a countdown. The bar is the countdown. It still has to be
     repainted, because buying a bench or gaining a mastery level changes it
     between renders. */
  const ivl = document.getElementById("avIvl");
  if (ivl && ivl.dataset.recipe) {
    const r = DB.recipe(ivl.dataset.recipe);
    if (r) {
      const v = secs(rowMods(game, skill, r).seconds);
      if (ivl.textContent !== v) ivl.textContent = v;
    }
  }

  if (skill.stations) {
    const n = document.getElementById("avStock");
    if (n) {
      const v = `${stockpileCount(game, stationTab)} / ${skill.stockpileCap}`;
      if (n.textContent !== v) n.textContent = v;
    }
  }

  for (const row of document.querySelectorAll("[data-potion]")) {
    const p = activePotions(game).find((x) => x.itemId === row.dataset.potion);
    const cell = row.querySelector("[data-left]");
    if (cell) {
      const v = p ? `${secs(p.seconds)} left` : "expired";
      if (cell.textContent !== v) cell.textContent = v;
    }
  }

  for (const row of document.querySelectorAll("[data-recipe]")) {
    const mbar = row.querySelector("[data-mbar]");
    if (!mbar) continue;
    const id = row.dataset.recipe;
    mbar.style.setProperty("--fill", `${xpPct(game.masteryXp(skill.id, id), game.masteryLevel(skill.id, id)).toFixed(1)}%`);
  }
}

export default { kind: "artisan", render, paint };
