/* =========================================================================
   EMBERVEIL — boot

   The app shell: tab routing, the canonical formatters, and the readiness
   signal the screenshot tooling waits on. Deliberately small — it owns
   nothing about game rules. The tick engine, skills, mastery and offline
   replay land in their own modules and drive this shell through data.
   ========================================================================= */

import { initHero, setAdept, setHeroVisible } from "./hero.js";

/* ---- number & time formatting ------------------------------------------
   Idle games live and die on legible big numbers. These are the canonical
   formatters — use them everywhere so 12.45M never renders three ways.
   ------------------------------------------------------------------------ */

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** 12450000 -> "12.45M". Keeps 3-4 significant digits, never trailing zeros. */
export function compact(n) {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const s = n % 1 === 0 ? String(n) : n.toFixed(1);
    return neg ? `-${s}` : s;
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  const scaled = n / 1000 ** tier;
  const digits = scaled >= 100 ? 1 : 2;
  const s = scaled.toFixed(digits).replace(/\.?0+$/, "") + UNITS[tier];
  return neg ? `-${s}` : s;
}

/** 1250 -> "1,250" */
export function int(n) {
  return Math.trunc(n).toLocaleString("en-US");
}

/** 16338 -> "04:32:18" */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** 0.654 -> "65.4%" */
export function pct(fraction, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/* ---- shell state -------------------------------------------------------- */

const state = {
  tab: "home",
  offlineSeconds: 4 * 3600 + 32 * 60 + 18,
};

/* ---- tab routing --------------------------------------------------------
   Home is authored in index.html. The remaining four tabs are honest
   placeholders until their builders land — they must never pretend to be
   finished screens.
   ------------------------------------------------------------------------ */

const TABS = {
  home:    { label: "Home",    icon: "#i-nav-home" },
  adept:   { label: "Adept",   icon: "#i-nav-adept",   blurb: "Jobs, stats and equipment for your adept." },
  skills:  { label: "Skills",  icon: "#i-nav-skills",  blurb: "Gathering and refining skills, mastery and the tick engine." },
  relics:  { label: "Relics",  icon: "#i-nav-relics",  blurb: "Relic inventory, set bonuses and the sink economy." },
  wardens: { label: "Wardens", icon: "#i-nav-wardens", blurb: "Bound spirits, their bonuses and the summoning ritual." },
};

const els = {
  screen: document.getElementById("screen"),
  body: document.getElementById("screenBody"),
  nav: document.getElementById("nav"),
};

let homeBodyHTML = "";

/* The pixel pipeline, live and inspectable. It lives on the Skills tab rather
   than the home screen so the home screen stays a clean shippable comparison,
   while the art pipeline is still something a builder can look at in the app. */
const PIXEL_PROOF = `
  <section class="panel pixelproof">
    <p class="t-label">Pixel pipeline &middot; authored 16&times;16, &times;3 integer scale</p>
    <div class="pixelproof__row">
      <img class="pixel" data-scale="3" style="--px-w:16; --px-h:16"
           src="src/assets/sprites/aether-shard.png" alt="Aether shard" width="48" height="48">
      <img class="pixel" data-scale="3" style="--px-w:16; --px-h:16"
           src="src/assets/sprites/cog.png" alt="Cog" width="48" height="48">
      <p class="t-micro grow">Sprites ship at 1&times; and scale by whole numbers only.
         Never pre-scale a sprite file; never use a fractional factor.</p>
    </div>
  </section>`;

function renderPlaceholder(tab) {
  const t = TABS[tab];
  els.body.innerHTML = `
    <section class="panel placeholder">
      <svg class="placeholder__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${t.icon}"/></svg>
      <h2 class="placeholder__title">${t.label}</h2>
      <p class="t-body">${t.blurb}</p>
      <div class="ornament-rule placeholder__rule"><span class="ornament-rule__diamond"></span></div>
      <p class="t-label">Not built yet</p>
    </section>
    ${tab === "skills" ? PIXEL_PROOF : ""}`;
}

function setTab(tab) {
  if (!TABS[tab] || tab === state.tab) return;
  state.tab = tab;

  if (tab === "home") {
    els.body.innerHTML = homeBodyHTML;
    setHeroVisible(true);
  } else {
    renderPlaceholder(tab);
    setHeroVisible(false);
  }

  for (const btn of els.nav.querySelectorAll(".nav__item")) {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  }
  els.screen.scrollTop = 0;
}

/* ---- offline clock ------------------------------------------------------ */

function tickClock() {
  const node = document.getElementById("offlineClock");
  if (node) node.textContent = clock(state.offlineSeconds);
}

/* ---- boot --------------------------------------------------------------- */

async function boot() {
  homeBodyHTML = els.body.innerHTML;

  els.nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav__item");
    if (btn) setTab(btn.dataset.tab);
  });

  tickClock();

  // Screenshot tooling waits on this: it stays false until the key art has
  // decoded and two frames have been painted, so tools/shot.mjs never
  // captures a half-laid-out screen or a hero mid-fade.
  window.__APP_READY__ = false;

  await initHero();

  // Expose the formatters and the hero API for quick console work.
  window.EMBERVEIL = { state, compact, int, clock, pct, setTab, setAdept };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => { window.__APP_READY__ = true; });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
