/* =========================================================================
   EMBERVEIL — SKILL VIEW: GATHERING   (parity §3a)

   The archetype behind Mining, Woodcutting and Fishing, and the fallback for
   any skill kind that has no purpose-built view yet.

   §3a is a short spec and every clause of it is on screen here:

     "A flat list of actions"          — no categories, no drill-down. One row
                                         per recipe, in level order.
     "[Cut] <Normal Tree>"             — the verb is the button, and it is the
                                         skill's own verb, not a generic Start.
     "10 Skill XP / 1.8 seconds"       — the recipe's XP and the seconds a
                                         whole ACTION takes, which for a node
                                         skill is NOT the swing interval. See
                                         WHAT "SECONDS" MEANS below.
     "<mastery lvl 41>"                — per row.
     "45,131 / 45,529"                 — that row's mastery XP against the XP
                                         that reaches its next mastery level.
     "Current Axe"                     — the tool indicator, read off the real
                                         ladder in src/data/shop.js, showing
                                         what is owned, what it is worth, and
                                         what the next rung costs.
     "Information about your cutting
      actions will display here"       — the live status line, which is that
                                         sentence when idle and the running
                                         action's real telemetry when not.

   RATES ARE DERIVED, NEVER STORED. Every per-second figure on this page is
   computed from the same modifier set the tick loop uses, so it cannot drift
   from what the engine actually pays out.

   ---------------------------------------------------------------------------
   WHAT "SECONDS" MEANS ON A ROW, AND WHY IT IS NOT THE INTERVAL
   ---------------------------------------------------------------------------
   Delving's whole design (math §4.3) is that every vein takes exactly three
   seconds and the LADDER IS CARRIED BY DOWNTIME: a node has hit points, each
   swing takes one off, and when it hits zero the action pauses for the
   recipe's respawn. Print the interval and every rung of Mining reads "3.00s"
   and an xp/s up to twelve times what the engine pays — the row would rank
   the slowest rung in the game as the best one to train.

   So the row prints the AMORTISED seconds per completed action, derived from
   exactly the quantities ../../engine/game.js counts down:

       swing        = actionIntervalTicks(skill, recipe)          §4.1
       swings/node  = swingsToDeplete(nodeMaxHp, swing, preserve)
                      a node loses one HP per swing unless preservation saves
                      it, and regains one every REGEN_INTERVAL_TICKS while it
                      is below full — so the pick has to outrun the regen
       seconds      = swing + respawn / swingsPerNode

   When the drain is zero or negative the node never empties, there is no
   respawn to amortise, and the answer is the swing interval. When a tick
   SYSTEM owns the skill's resolution (a Larceny stun, a crop's growth hours,
   a settlement's clock) this model does not describe it at all, so rates()
   returns null and the row prints the XP alone rather than a fabricated rate.

   tools/check-meta.mjs pins every one of those cases: it boots a Game on each
   gathering recipe, runs the real tick loop for a day of game time, and fails
   the build if the xp/s this file would render is more than 5% off what the
   engine actually paid.
   ========================================================================= */

import {
  DB, MOD, SYSTEMS, TICK_MS, REGEN_INTERVAL_TICKS, ticksToSeconds,
} from "../../engine/index.js";
import { el, esc, num, int, secs, mark, initials, xpPair, xpPct } from "../ui.js";

/* -------------------------------------------------------------------------
   THE VERB
   The reference labels the button with the skill's own verb because that is
   what makes a list of nouns read as a list of actions. Unknown skills fall
   back to "Start", which is honest rather than wrong.
   ------------------------------------------------------------------------- */
const VERBS = {
  delving:     { go: "Mine",   ing: "mining" },
  boughcraft:  { go: "Cut",    ing: "cutting" },
  trawling:    { go: "Fish",   ing: "fishing" },
  emberrite:   { go: "Burn",   ing: "burning" },
  kilnwork:    { go: "Smelt",  ing: "smelting" },
  hearthcraft: { go: "Cook",   ing: "cooking" },
  sigilwork:   { go: "Bind",   ing: "binding" },
  wayfaring:   { go: "Walk",   ing: "walking" },
};
/** Archetype verbs, for a skill this view is only the fallback for. */
const KIND_VERBS = {
  gather:  { go: "Gather", ing: "gathering" },
  artisan: { go: "Craft",  ing: "crafting" },
  route:   { go: "Travel", ing: "travelling" },
};
export const verbFor = (id, kind) =>
  VERBS[id] || KIND_VERBS[kind] || { go: "Start", ing: "working" };

/* -------------------------------------------------------------------------
   THE CURRENT TOOL
   Read off the shipped ladder rather than a hard-coded list, so a new tool
   rung appears here the moment it appears in the shop.
   ------------------------------------------------------------------------- */
export function toolState(game, skillId) {
  const ladder = DB.shop.filter((e) => e.category === "tool" && e.skill === skillId);
  if (!ladder.length) return null;
  let owned = null, cut = 0, next = null;
  for (const e of ladder) {
    if (game.state.purchases[e.id]) {
      owned = e;
      for (const [name, value] of e.mods || []) if (name === MOD.intervalPercent) cut += -value;
    } else if (!next) next = e;
  }
  /* The noun is the last word of the tool's name — "Guildwright Pick" is a
     Pick. That keeps the label in step with the data instead of with a map
     that has to be edited twice. */
  const noun = (owned || ladder[0]).name.split(" ").pop();
  return { owned, cut, next, noun };
}

/* -------------------------------------------------------------------------
   PER-ACTION RATES
   The same reads the tick loop makes, so the preview cannot lie.
   ------------------------------------------------------------------------- */

/** Skills whose finished actions a registered tick system resolves end to end
 *  (../../engine/systems/index.js). Their clock is not "one interval, then
 *  paid", so the model above does not describe them and this file refuses to
 *  guess. See rates(). */
const SYSTEM_SKILLS = new Set(SYSTEMS.filter((s) => s.skill).map((s) => s.skill));

/**
 * Run `fn` with the engine standing in the state it would be in while this
 * exact action is the one in flight, then put it back.
 *
 * This is not a convenience. `Game._buildMods()` only admits a skill's
 * RECIPE-SCOPED mastery unlocks for the recipe currently being worked — the
 * +2 node HP, the -10% respawn, the -4% interval — and `Game._nodeMaxHp()`
 * and `_nodeRespawnTicks()` read `state.action` directly. A preview computed
 * without them is a preview of a different action. Restoring the ORIGINAL
 * action object (not a copy) leaves the live countdown untouched.
 */
export function withAction(game, skillId, recipeId, fn) {
  const held = game.state.action;
  if (held && held.skillId === skillId && held.recipeId === recipeId) return fn();
  game.state.action = { skillId, recipeId, ticks: 0, intervalTicks: 0, paused: false };
  game._invalidate();
  try { return fn(); }
  finally { game.state.action = held; game._invalidate(); }
}

/**
 * Swings to empty a node, counted the way the loop counts them.
 *
 * The regeneration is not a rate, it is a countdown, and rounding it into one
 * is worth 5% on a six-HP node — enough to reorder the ladder at the level a
 * player first meets it. So this solves the integer question the loop asks:
 * after n swings the node has lost `n * (1 - preserve)` HP and regained one
 * per REGEN_INTERVAL_TICKS since it first dropped below full, plus the one
 * free tick of regeneration it gets the instant it does (Game._advanceBy
 * seeds `node.regen` at zero, and resolves a regeneration BEFORE the swing
 * that shares its tick).
 *
 * Verified against the loop at both ends of the range: a mastery-1 node
 * (6 HP, 2.85 s swings) empties in 8 swings, a mastery-99 node (119 HP,
 * 3.00 s swings) in 170 — both exactly what the tick loop does.
 */
function swingsToDeplete(maxHp, swingTicks, preserve) {
  const free = maxHp >= 2 ? 1 : 0;   // a 1-HP node is gone before it can regen
  const lost = (n) => n * (1 - preserve) - free - Math.floor((swingTicks * (n - 1)) / REGEN_INTERVAL_TICKS);
  let n = Math.max(1, Math.ceil((maxHp + free) / ((1 - preserve) - swingTicks / REGEN_INTERVAL_TICKS)));
  while (n > 1 && lost(n - 1) >= maxHp) n--;
  while (lost(n) < maxHp) n++;
  return n;
}

/**
 * Seconds one completed action takes, amortised over a node's whole
 * deplete-and-respawn cycle. See WHAT "SECONDS" MEANS at the top of the file.
 * @returns {number|null} null when this skill's action time is not expressible
 *          this way, in which case the caller must print no rate at all.
 */
export function actionSeconds(game, skillId, recipeId) {
  const skill = DB.skill(skillId);
  if (!skill) return null;
  /* A system-owned skill can spend an action stunned, growing or idle. */
  if (SYSTEM_SKILLS.has(skillId)) return null;

  return withAction(game, skillId, recipeId, () => {
    const swing = game.actionIntervalTicks(skillId, recipeId, false);
    if (!Number.isFinite(swing) || swing <= 0) return null;
    if (!skill.node) return ticksToSeconds(swing);

    const maxHp = game._nodeMaxHp();
    const respawn = game._nodeRespawnTicks();
    const preserve = game.mods().preserve([skillId, recipeId]);
    /* §2.4's "full respawn-immunity" case: once preservation plus regeneration
       replace HP faster than the pick removes it the node never empties, so
       there is no downtime left to amortise. */
    const drain = (1 - preserve) - swing / REGEN_INTERVAL_TICKS;
    if (drain <= 0) return ticksToSeconds(swing);
    const swingsPerNode = swingsToDeplete(maxHp, swing, preserve);
    return ticksToSeconds(swing + respawn / swingsPerNode);
  });
}

export function rates(game, skillId, r) {
  const seconds = actionSeconds(game, skillId, r.id);
  if (seconds === null || !(seconds > 0)) return null;
  const skill = DB.skill(skillId);

  return withAction(game, skillId, r.id, () => {
    const scopes = [skillId, r.id];
    const m = game.mods();
    const swing = ticksToSeconds(game.actionIntervalTicks(skillId, r.id, false));
    const xpPerAction = (r.xp || 0) * (1 + m.sum(MOD.skillXP, scopes));

    /* §7.2 exception 2: the doubling ROLL is additive within itself, a
       deterministic multiplier is a separate multiplicative layer, and a
       tagged flat quantity is added last and never doubled. */
    const qty =
      (1 + m.sum(MOD.doubleChance, scopes)) * Math.max(1, m.sum("quantityMultiplier", scopes)) +
      m.sum(MOD.flatQuantity, scopes);

    /* Trawling's junk roll replaces the catch outright — `Game._produce()`
       delivers one tangleweed and returns nothing — so it costs the row a
       fraction of every action and the Cogs figure has to know that. */
    const junk = r.junk && !m.sum("noJunk", scopes)
      ? Math.max(0, Math.min(1, r.junk * (1 + m.sum("junkPercent", scopes))))
      : 0;

    const perAction = r.produces
      ? (1 - junk) * game.salePrice(r.produces) * qty + junk * game.salePrice("tangleweed")
      : (r.cogs || 0) * (1 + m.sum(MOD.currency, scopes));

    return {
      seconds,                       // one whole action, downtime included
      swingSeconds: swing,           // one swing of the pick
      nodeHp: skill.node ? game._nodeMaxHp() : 0,
      respawnSeconds: skill.node ? ticksToSeconds(game._nodeRespawnTicks()) : 0,
      qty: qty * (1 - junk),
      junk,
      xpPerSecond: xpPerAction / seconds,
      cogsPerSecond: perAction / seconds,
    };
  });
}

/* -------------------------------------------------------------------------
   ROWS
   ------------------------------------------------------------------------- */
function actionRow(ctx, skill, r) {
  const { game, toast, markDirty } = ctx;
  const lv = game.skillLevel(skill.id);
  const locked = lv < r.level;
  const running = game.state.action?.recipeId === r.id;
  const verb = verbFor(skill.id, skill.kind);

  const ml = skill.mastery ? game.masteryLevel(skill.id, r.id) : 0;
  const mx = skill.mastery ? game.masteryXp(skill.id, r.id) : 0;
  let rt = null;
  try { rt = locked ? null : rates(game, skill.id, r); } catch { rt = null; }

  /* What the action costs and what it leaves behind. The gathering archetype
     consumes nothing, but the fallback covers artisan recipes too. */
  const itemName = (id) => (DB.items.has(id) ? DB.item(id).name : id);
  const bits = [];
  if (r.consumes) bits.push(r.consumes.map(([i, q]) => `${q}x ${itemName(i)}`).join(" + "));
  if (r.shards) bits.push(`${r.shards} Aether Shards`);
  if (r.produces) bits.push(`-> ${itemName(r.produces)}`);
  if (r.cogs) bits.push(`-> ${num(r.cogs)} Cogs`);

  /* Where the seconds on the line above came from. Mining's whole ladder is
     downtime rather than interval, so a row that prints 4.50s without saying
     "3.00s swing, 119 HP, 255s respawn" is asking the player to take it on
     faith. Only shown when the two numbers actually differ. */
  if (rt && rt.nodeHp && rt.seconds - rt.swingSeconds > 0.005) {
    bits.push(`${secs(rt.swingSeconds)} swing · ${int(rt.nodeHp)} node HP · ${secs(rt.respawnSeconds)} respawn`);
  }
  if (rt && rt.junk > 0.0001) bits.push(`${(rt.junk * 100).toFixed(0)}% tangleweed`);

  /* §3a's middle column, exactly: "10 Skill XP / 1.8 seconds". */
  const line = locked
    ? `Requires ${esc(skill.name)} level ${r.level}`
    : rt ? `${int(r.xp || 0)} Skill XP / ${secs(rt.seconds)}` : `${int(r.xp || 0)} Skill XP`;
  const right = locked
    ? `<span class="row-card__lvl">${r.level}</span><span class="row-card__lvl-cap">req</span>`
    : `${rt ? `<span class="row-card__lvl u-tnum">${rt.xpPerSecond.toFixed(1)}</span>
         <span class="row-card__lvl-cap">xp / s</span>` : ""}
       <button class="btn-gold btn-gold--sm" type="button" style="margin-top:6px">${esc(running ? "Stop" : verb.go)}</button>`;

  /* .row-card__sub and .row-card__meta are inline spans in the design system,
     which is right for a two-line row and wrong for a four-line one — this
     piece ships no stylesheet, so the stacking is declared here. */
  const B = ' style="display:block"';

  const row = el(`<div class="row-card${locked ? " is-locked" : ""}${running ? " is-active" : ""}"
      ${skill.mastery ? `data-recipe="${esc(r.id)}"` : ""}>
    ${mark(r.produces || r.id, initials(r.name))}
    <span class="row-card__body">
      <span class="row-card__title">${esc(r.name)}${running ? '<span class="badge badge--on">Running</span>' : ""}</span>
      <span class="row-card__sub u-tnum"${B}>${line}</span>
      ${skill.mastery ? `<span class="row-card__meta u-tnum"${B} data-mastery>Mastery ${ml} · ${xpPair(Math.floor(mx), ml, 99)}</span>` : ""}
      ${bits.length ? `<span class="row-card__meta"${B}>${esc(bits.join("  ·  "))}</span>` : ""}
      ${locked || !skill.mastery ? "" : `<span class="bar bar--sm bar--violet" style="margin-top:5px"><span class="bar__fill"
        data-mbar style="--fill:${xpPct(mx, ml).toFixed(1)}%"></span></span>`}
    </span>
    <span class="row-card__right">${right}</span></div>`);

  if (!locked) {
    const act = () => {
      if (running) { game.stop(); markDirty(); return; }
      const missing = (r.consumes || []).find(([i, q]) => game.count(i) < q);
      if (missing) return toast(`Need ${missing[1]}x ${itemName(missing[0])}`, "bad");
      if (r.shards && game.state.shards < r.shards) return toast(`Need ${r.shards} Aether Shards`, "bad");
      game.start(skill.id, r.id);
      markDirty();
      toast(`${verb.go} ${r.name}`);
    };
    row.querySelector("button").onclick = act;
    row.onclick = (e) => { if (e.target.tagName !== "BUTTON") act(); };
  }
  return row;
}

/* -------------------------------------------------------------------------
   THE TOOL INDICATOR AND THE STATUS LINE
   ------------------------------------------------------------------------- */
function toolPanel(ctx, skill) {
  const { game } = ctx;
  const t = toolState(game, skill.id);
  if (!t) return null;
  const have = t.owned
    ? `${t.owned.name} &nbsp;·&nbsp; -${(t.cut * 100).toFixed(0)}% interval`
    : "Bare hands — no tool owned";
  const next = t.next
    ? `Next: ${esc(t.next.name)} · level ${t.next.level} · ${num(t.next.cost)} Cogs`
    : "Ladder complete.";
  const p = el(`<section class="panel panel--tight">
    <div class="row--between">
      <div style="min-width:0">
        <p class="t-label">Current ${esc(t.noun)}</p>
        <p class="t-value u-tnum" style="color:var(--c-gold-core)">${have}</p>
        <p class="t-micro" style="color:var(--c-text-2);opacity:.75">${next}</p>
      </div>
      <button class="btn-ghost" type="button" style="flex:0 0 auto">Shop</button>
    </div></section>`);
  p.querySelector("button").onclick = () => ctx.goTab("shop");
  return p;
}

function statusPanel(ctx, skill) {
  const verb = verbFor(skill.id, skill.kind);
  return el(`<section class="panel panel--tight">
    <p class="t-label">Action status</p>
    <p class="t-body" id="gvStatus" style="color:var(--c-text-2)">Information about your ${esc(verb.ing)} actions will display here.</p>
    <div class="bar bar--sm" style="margin-top:var(--s-2)"><div class="bar__fill" id="gvBar" style="--fill:0%"></div></div>
    <p class="t-micro u-tnum" id="gvRates" style="color:var(--c-text-2);margin-top:6px">&nbsp;</p>
  </section>`);
}

/* -------------------------------------------------------------------------
   THE VIEW
   ------------------------------------------------------------------------- */
function render(ctx, skill) {
  const out = [];
  const recipes = skill.recipes || [];
  const tool = toolPanel(ctx, skill);
  if (tool) out.push(tool);
  out.push(statusPanel(ctx, skill));
  out.push(el(`<p class="sect">${esc(skill.name)} actions — ${recipes.length}</p>`));
  if (!recipes.length) out.push(el(`<p class="empty">This skill has no direct actions — it trains from what you do elsewhere.</p>`));
  for (const r of recipes) out.push(actionRow(ctx, skill, r));
  if (skill.blurb) {
    out.push(el(`<p class="t-micro" style="color:var(--c-text-2);opacity:.7;padding:var(--s-3) var(--s-1)">${esc(skill.blurb)}</p>`));
  }
  return out;
}

/** Per tick: the status line, the action bar, and every visible mastery row. */
function paint(ctx, skill) {
  const { game } = ctx;
  const s = game.state;
  const verb = verbFor(skill.id, skill.kind);
  const status = document.getElementById("gvStatus");
  const bar = document.getElementById("gvBar");
  const ratesLine = document.getElementById("gvRates");

  if (status) {
    const a = s.action;
    const r = a ? DB.recipe(a.recipeId) : null;
    if (a && r && a.skillId === skill.id && !s.combat) {
      let rt = null;
      try { rt = rates(game, skill.id, r); } catch { rt = null; }
      const left = (a.ticks * TICK_MS) / 1000;
      let text = `${verb.ing[0].toUpperCase()}${verb.ing.slice(1)} ${r.name} — ${secs(left)} to go`;
      if (s.node) {
        text += s.node.respawn > 0
          ? ` · node depleted, ${secs((s.node.respawn * TICK_MS) / 1000)} to respawn`
          : ` · node ${s.node.hp} HP`;
      }
      if (status.textContent !== text) status.textContent = text;
      const pct = a.intervalTicks > 0 ? (1 - a.ticks / a.intervalTicks) * 100 : 0;
      bar.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
      const line = rt
        ? `${rt.xpPerSecond.toFixed(2)} skill XP / s · ${rt.cogsPerSecond.toFixed(2)} Cogs / s · ${rt.qty.toFixed(2)} per action`
        : " ";
      if (ratesLine.textContent !== line) ratesLine.textContent = line;
    } else {
      const idle = `Information about your ${verb.ing} actions will display here.`;
      if (status.textContent !== idle) status.textContent = idle;
      bar.style.setProperty("--fill", "0%");
      if (ratesLine.textContent !== " ") ratesLine.textContent = " ";
    }
  }

  for (const row of document.querySelectorAll("[data-recipe]")) {
    const id = row.dataset.recipe;
    const ml = game.masteryLevel(skill.id, id);
    const mx = game.masteryXp(skill.id, id);
    const cell = row.querySelector("[data-mastery]");
    if (cell) {
      const v = `Mastery ${ml}  ·  ${xpPair(Math.floor(mx), ml, 99)}`;
      if (cell.textContent !== v) cell.textContent = v;
    }
    const mbar = row.querySelector("[data-mbar]");
    if (mbar) mbar.style.setProperty("--fill", `${xpPct(mx, ml).toFixed(1)}%`);
  }
}

export default { kind: "gather", render, paint };
