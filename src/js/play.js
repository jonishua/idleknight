/* =========================================================================
   EMBERVEIL — the playable build (SHELL)

   The UI layer over the real tick engine. Every number on screen comes from
   the simulation; nothing here is a fixture. Chrome is the shipped design
   system (tokens + primitives); only the per-skill marks are placeholder
   blocks until sprite art lands.

   THIS FILE OWNS THE CHROME AND NOTHING ELSE: boot, save/load, the wall-clock
   tick loop, toasts, the welcome sheet, the topbar, the hero header, the
   progress panel and the three axis cards.

   It owns NO knowledge of which screens exist. Screens live one-per-file in
   ./screens/ and are listed in ./screens/registry.js — read that file's
   header for the screen contract and the ctx object documented below.
   ========================================================================= */

import { Game, DB } from "./engine/index.js";
import { $, el, esc, num, dur, xpPct, icon, rank } from "./screens/ui.js";
import { screen, screenIds } from "./screens/registry.js";
import { openSkillAt } from "./screens/skills.js";
import { openAt as openOther } from "./screens/settings.js";

const SAVE_KEY = "emberveil.mvp.save.v1";
const TICK_MS = 50;                       // engine tick = 50ms (20/sec)

/* ---- state ------------------------------------------------------------- */

let game, tab = "skills", acc = 0, lastReal = Date.now(), dirty = false;

/* ---- the screen context -------------------------------------------------
   Everything a screen is allowed to reach. `game` is a getter because boot()
   assigns it after this object is built, and because a save wipe replaces it.
   ------------------------------------------------------------------------- */

const setText = (id, v) => { const n = $(id); if (n && n.textContent !== v) n.textContent = v; };
const setFill = (id, pct) => { const n = $(id); if (n) n.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`); };

const ctx = {
  get game() { return game; },
  TICK_MS,
  SAVE_KEY,
  toast: (msg, kind) => toast(msg, kind),
  markDirty: () => { dirty = true; },
  render: () => render(),
  goTab: (id) => document.querySelector(`.nav__item[data-tab="${id}"]`)?.click(),
  save: () => save(),
  set: setText,
  fill: setFill,
};

/* ---- boot -------------------------------------------------------------- */

function save() {
  try {
    game._syncRng?.();
    game.state.lastSaveAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.state));
  } catch (e) { console.warn("save failed", e); }
}

async function boot() {
  /* One sprite, shared with index.html, injected rather than duplicated. */
  try {
    const svg = await fetch("src/assets/icons.svg").then((r) => r.text());
    $("sprite").innerHTML = svg;
    $("sprite").removeAttribute("hidden");
    $("sprite").style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  } catch (e) { console.warn("icon sprite failed to load", e); }

  /* hero.css keeps the key art at opacity 0 until it has decoded, so a
     half-painted image never lands in a screenshot. Flip it when ready. */
  const art = document.querySelector(".hero__art");
  if (art) {
    const reveal = () => $("hero").classList.add("is-art-ready");
    if (art.complete) reveal();
    else { art.onload = reveal; art.onerror = reveal; }
  }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch {}
  try { game = new Game(DB, saved ? { state: saved } : {}); }
  catch (e) { console.warn("save incompatible, starting fresh", e); game = new Game(DB); }
  window.game = game; window.DB = DB;

  if (saved?.lastSaveAt) {
    const away = Date.now() - saved.lastSaveAt;
    if (away > 30_000 && (game.state.action || game.state.combat)) {
      const sum = game.offlineReplay(Date.now());
      if (sum && sum.seconds > 30) welcome(sum);
    } else { game.state.lastSaveAt = Date.now(); }
  }

  /* A nav button with no registered screen renders a blank tab, which is a
     silent failure. Say so at boot instead. */
  for (const b of document.querySelectorAll(".nav__item")) {
    if (!screen(b.dataset.tab)) {
      console.warn(`nav tab "${b.dataset.tab}" has no screen registered in screens/registry.js (have: ${screenIds().join(", ")})`);
    }
    b.onclick = () => {
      tab = b.dataset.tab;
      screen(tab)?.reset?.();
      for (const x of document.querySelectorAll(".nav__item")) x.classList.toggle("is-active", x === b);
      $("screen").scrollTop = 0;
      render();
    };
  }

  /* The floating topbar needs a ground once the key art has scrolled out from
     under it — see .topbar::before in styles/home.css. The threshold is one
     chip-height, so the scrim is already solid by the time any panel text
     reaches the bar. */
  const scr = $("screen");
  const syncScrim = () => document.getElementById("app").classList.toggle("is-scrolled", scr.scrollTop > 32);
  scr.addEventListener("scroll", syncScrim, { passive: true });
  syncScrim();

  routeFromHash();
  render();
  setInterval(save, 5000);
  lastReal = Date.now();
  setInterval(loop, 100);
}

/* ---- the URL hash ------------------------------------------------------
   A twenty-six-skill game has more screens than a five-slot tab bar can
   address, and "open every screen and screenshot it" is a thing both the
   player and the build tooling need to be able to do. One deep-link grammar
   serves both:

       #combat              a nav tab
       #skills/delving      that tab, opened onto one skill page
       #other/stats         the OTHER block, opened onto one of its pages

   The router only ever calls the same two openAt() functions the in-game
   buttons call, so a deep link cannot reach a state the UI itself cannot.
   ------------------------------------------------------------------------ */

const HASH_ALIASES = { other: "settings", skill: "skills" };

function routeFromHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return;
  const [head, arg] = raw.split("/").map(decodeURIComponent);
  const id = HASH_ALIASES[head] || head;
  if (!screen(id)) return;
  if (arg && id === "skills") openSkillAt(arg);
  if (arg && id === "settings") openOther(arg);
  const btn = document.querySelector(`.nav__item[data-tab="${id}"]`);
  if (btn) btn.click();
}

window.addEventListener("hashchange", routeFromHash);

/* ---- the loop ---------------------------------------------------------- */

/* Driven by setInterval on the WALL clock, not requestAnimationFrame.
   rAF stops entirely in a hidden tab, which for an idle game means the world
   freezes the moment you switch away; setInterval is merely throttled, and
   because the delta comes from Date.now() a throttled tick still advances the
   right amount. The cap matches the engine's own 24h offline limit. */
const CATCHUP_CAP_MS = 24 * 3600 * 1000;

function loop() {
  const now = Date.now();
  const dt = Math.max(0, Math.min(now - lastReal, CATCHUP_CAP_MS));
  lastReal = now;
  acc += dt;
  const ticks = Math.floor(acc / TICK_MS);
  if (ticks > 0) {
    acc -= ticks * TICK_MS;
    const before = {}; for (const s of DB.skills) before[s.id] = game.skillLevel(s.id);
    try { game.advance(ticks); } catch (e) { console.error("tick error", e); }
    for (const s of DB.skills) {
      if (game.skillLevel(s.id) > before[s.id]) { toast(`${s.name} level ${game.skillLevel(s.id)}`, "violet"); dirty = true; }
    }
    checkStops();
    paint();
  }
}

/* The engine halts for three reasons. Dropping the player back to an idle
   screen with no explanation is the fastest way to feel broken. */
const STOP_TEXT = {
  "death": "You were slain — combat stopped",
  "out-of-materials": "Out of materials — action stopped",
  "offline-combat-disabled": "Combat paused while you were away",
};
let lastStop = null;
function checkStops() {
  const r = game.state.stoppedReason;
  if (r && r !== lastStop) { toast(STOP_TEXT[r] || r, "bad"); dirty = true; }
  lastStop = r;
}

/* ---- toasts and the welcome sheet -------------------------------------- */

function toast(msg, kind = "") {
  const t = el(`<div class="toast${kind ? ` toast--${kind}` : ""}">${esc(msg)}</div>`);
  $("toasts").appendChild(t);
  setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 2200);
}

function welcome(sum) {
  const line = (k, v) => `<div class="stat-line"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const rows = [line("Away", dur(sum.cappedSeconds))];
  for (const lv of sum.levels || []) rows.push(line(lv.name, `${lv.from} → ${lv.to}`));
  if (sum.cogs) rows.push(line("Cogs", `+${num(sum.cogs)}`));
  if (sum.shards) rows.push(line("Aether Shards", `+${num(sum.shards)}`));
  if (sum.kills) rows.push(line("Kills", num(sum.kills)));
  if (sum.deaths) rows.push(line("Deaths", String(sum.deaths)));
  for (const it of (sum.items || []).slice(0, 8)) rows.push(line(it.name, `+${num(it.delta)}`));

  const scrim = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Welcome back">
    <p class="sheet__title">Welcome back</p>
    <p class="sheet__sub">${sum.cappedByLimit ? "Offline progress caps at 24 hours." : "The veil kept turning while you were away."}</p>
    ${rows.join("")}
    <button class="btn-gold" type="button">Continue</button>
  </div></div>`);
  scrim.querySelector("button").onclick = () => scrim.remove();
  scrim.onclick = (e) => { if (e.target === scrim) scrim.remove(); };
  document.body.appendChild(scrim);
}

/* ---- per-tick painting -------------------------------------------------- */

function paint() {
  const s = game.state;
  $("c-cogs").textContent = num(s.cogs);
  $("c-shards").textContent = num(s.shards);

  const max = game.maxHp();
  const hp = s.combat ? s.combat.pHp : max;
  $("c-hp").firstChild.nodeValue = num(hp);
  $("c-hpmax").textContent = `/${num(max)}`;
  $("c-hpstate").textContent = s.combat ? (hp < max * 0.4 ? "Hurt" : "Fight") : "Rested";

  paintHero();
  if (dirty) { dirty = false; render(); return; }
  paintLive();
}

function paintHero() {
  const s = game.state;
  let eyebrow, lv, rarity, status;
  if (s.combat) {
    const m = DB.monster(s.combat.monsterId);
    /* The derived level across all eight combat skills — NOT the level of
       whichever style is currently being trained, which is what the pre-split
       "warding" alias resolves to and which made a level-99 Attack account
       read "Combat Level 99" while fighting with a bow. */
    eyebrow = "Combat Level"; lv = game.combatLevel();
    rarity = m.name; status = `${num(s.combat.mHp)} / ${num(m.hp)} HP`;
  } else if (s.action) {
    const sk = DB.skill(s.action.skillId);
    const r = sk.recipes.find((x) => x.id === s.action.recipeId);
    eyebrow = `${sk.name} Level`; lv = game.skillLevel(sk.id);
    rarity = r ? r.name : sk.name;
    status = `${((s.action.intervalTicks * TICK_MS) / 1000).toFixed(2)}s per action`;
  } else {
    let best = 1, bestName = "Adept";
    for (const sk of DB.skills) { const l = game.skillLevel(sk.id); if (l > best) { best = l; bestName = sk.name; } }
    eyebrow = best > 1 ? `${bestName} Level` : "Adept Level";
    lv = best; rarity = rank(best); status = "Nothing underway";
  }
  $("heroEyebrow").textContent = eyebrow;
  $("heroNumeral").textContent = num(lv);
  $("heroRarity").textContent = rarity;
  $("heroStatus").firstChild.nodeValue = status + " ";
}

/** Elements that must move every tick without a full re-render. */
function paintLive() {
  const s = game.state;
  const set = setText, fill = setFill;

  /* level progress panel */
  const ctxSkill = activeSkill();
  if (ctxSkill && $("lvlBar")) {
    const lv = game.skillLevel(ctxSkill);
    fill("lvlBar", xpPct(game.skillXp(ctxSkill), lv));
    set("lvlPct", `${xpPct(game.skillXp(ctxSkill), lv).toFixed(1)}%`);
    set("lvlFromTo", `${lv} → ${lv + 1}`);
  }
  /* the three axis cards */
  if ($("cardActionBar")) {
    /* fight() also populates state.action, but with intervalTicks 0 — so combat
       has to be tested FIRST or the percentage divides by zero. */
    if (s.combat) {
      const m = DB.monster(s.combat.monsterId);
      const done = 100 - (s.combat.mHp / m.hp) * 100;
      fill("cardActionBar", done);
      set("cardActionPct", `${done.toFixed(0)}%`);
    } else if (s.action && s.action.intervalTicks > 0) {
      const pct = (s.action.ticks / s.action.intervalTicks) * 100;
      fill("cardActionBar", pct);
      set("cardActionPct", `${pct.toFixed(0)}%`);
    } else {
      fill("cardActionBar", 0);
      set("cardActionPct", "0%");
    }
  }
  if ($("cardMasteryBar") && ctxSkill && s.action && !s.combat && DB.recipe(s.action.recipeId)) {
    const ml = game.masteryLevel(ctxSkill, s.action.recipeId);
    const mx = game.masteryXp(ctxSkill, s.action.recipeId);
    fill("cardMasteryBar", xpPct(mx, ml));
    set("cardMasteryPct", `${ml}`);
  }
  if ($("cardBankBar")) {
    const used = Object.keys(s.items).filter((i) => s.items[i] > 0).length;
    const cap = game.reliquarySlots();
    fill("cardBankBar", (used / cap) * 100);
    set("cardBankPct", `${used}/${cap}`);
  }

  /* whatever the active screen wants moving, it moves itself */
  screen(tab)?.paint?.(ctx);
}
const activeSkill = () => game.state.combat ? "warding" : (game.state.action ? game.state.action.skillId : null);

/* ---- render ------------------------------------------------------------ */

function render() {
  const m = $("main");
  m.innerHTML = "";
  const sc = screen(tab);
  /* A screen may decline the shell's progress panel and axis cards — see the
     `chrome` entry in screens/registry.js. Skill pages do, because §2's
     universal header repeats every number in them. */
  if (sc?.chrome?.(ctx) !== false) m.append(...headerPanels());
  if (sc) m.append(...sc.render(ctx));
  paintHero();
  paintLive();
}

/** The persistent progress panel + three axis cards, as on the key screen. */
function headerPanels() {
  const ctxSkill = activeSkill();
  const lv = ctxSkill ? game.skillLevel(ctxSkill) : 1;
  const pct = ctxSkill ? xpPct(game.skillXp(ctxSkill), lv) : 0;
  const s = game.state;
  const stopBtn = (s.action || s.combat)
    ? `<button class="btn-ghost" type="button" id="stopBtn" style="width:100%;margin-top:var(--s-3)">Stop</button>` : "";

  const panel = el(`<section class="panel">
    <p class="t-label">${ctxSkill ? "Progress to next level" : "No skill underway"}</p>
    <div class="panel__head progress__head">
      <p class="t-value-lg" id="lvlFromTo">${ctxSkill ? `${lv} → ${lv + 1}` : "—"}</p>
      <p class="t-value-lg u-tnum" id="lvlPct">${pct.toFixed(1)}%</p>
    </div>
    <div class="bar" role="progressbar" aria-label="Progress to next level"><div class="bar__fill" id="lvlBar" style="--fill:${pct.toFixed(1)}%"></div></div>
    ${stopBtn}
  </section>`);
  if (stopBtn) panel.querySelector("#stopBtn").onclick = () => { game.stop(); dirty = true; };

  const used = Object.keys(s.items).filter((i) => s.items[i] > 0).length;
  const cards = el(`<section class="cards">
    <button class="card" type="button" data-go="skills">
      <span class="card__head">${icon("i-delve")}<span class="card__title">Task</span></span>
      <span class="card__sub">${s.combat ? "In combat" : s.action ? esc(DB.recipe(s.action.recipeId)?.name || "") : "Idle"}</span>
      <span class="card__foot"><span class="bar bar--sm"><span class="bar__fill" id="cardActionBar" style="--fill:0%"></span></span>
        <span class="card__pct" id="cardActionPct">0%</span></span>
    </button>
    <button class="card card--violet" type="button" data-go="skills">
      <span class="card__head">${icon("i-sigil")}<span class="card__title">Mastery</span></span>
      <span class="card__sub">${s.action ? "This action" : "None active"}</span>
      <span class="card__foot"><span class="bar bar--sm bar--violet"><span class="bar__fill" id="cardMasteryBar" style="--fill:0%"></span></span>
        <span class="card__pct" id="cardMasteryPct">—</span></span>
    </button>
    <button class="card" type="button" data-go="bank">
      <span class="card__head">${icon("i-crown")}<span class="card__title">Bank</span></span>
      <span class="card__sub">Reliquary slots</span>
      <span class="card__foot"><span class="bar bar--sm"><span class="bar__fill" id="cardBankBar" style="--fill:0%"></span></span>
        <span class="card__pct" id="cardBankPct">${used}/${game.reliquarySlots()}</span></span>
    </button>
  </section>`);
  for (const b of cards.querySelectorAll(".card")) {
    b.onclick = () => ctx.goTab(b.dataset.go);
  }
  return [panel, cards];
}

/* ---- go ---------------------------------------------------------------- */

window.addEventListener("beforeunload", save);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
  else loop();          // settle the time spent hidden immediately
});
boot();
