/* =========================================================================
   EMBERVEIL — WARDEN CODEX (view)

   Standalone screen. Imports warden-data.js and nothing else; it holds no
   game rules of its own, it only renders them and spends the currencies the
   data module prices.

   Three things this file is careful about:

     1. THE PIXEL SEAM. Sprites are swapped, never filtered. Locked art is a
        different PNG. Portraits are hidden while a container is mid-slide
        rather than being dragged across fractional offsets. Scale factors
        are whole numbers, always.
     2. LIVE CHECKPOINTS. Spending the pool on an Ascension can drop the
        codex back below a threshold, and the header must show that
        immediately — that tension is the mechanic, not a bug to smooth over.
     3. THE RITE IS A TIMELINE, NOT A TRANSITION. It is skippable at any
        point and it collapses to its end state under prefers-reduced-motion,
        so nobody ever stares at a blank overlay.
   ========================================================================= */

import {
  WARDENS, RARITY, DOMAIN, MAX_BOND, XP_TABLE,
  levelFromXp, levelProgress, deltaXp,
  RESONANCE_CAP, CHECKPOINTS, checkpointXp, isCheckpointLive, POOL_SHARE,
  RITE_COST, ascendCost, DUPE_RESONANCE,
  RITE_WEIGHTS, PITY_AT, mulberry32, rollWarden,
  bonusText, isDrawback,
  createSave, boundCount,
  compact, int, pct,
} from "./warden-data.js";

/* ---- state -------------------------------------------------------------- */

const params = new URLSearchParams(location.search);
const save = createSave();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let filter = params.get("filter") || "all";
let rand = mulberry32(Number(params.get("seed")) || (Date.now() & 0xffffffff));
let riteTimers = [];

const $ = (id) => document.getElementById(id);
const els = {
  app: $("app"),
  cogs: $("cCogs"), shards: $("cShards"), seals: $("cSeals"),
  bound: $("hBound"), total: $("hTotal"),
  poolPct: $("hPoolPct"), poolFill: $("hPoolFill"),
  poolFigures: $("hPoolFigures"), ckpts: $("hCkpts"),
  seg: $("seg"), grid: $("grid"),
  riteCost: $("riteCost"), riteGo: $("riteGo"),
  pityFill: $("pityFill"), pityLabel: $("pityLabel"),
  sheet: $("sheet"), sheetScrim: $("sheetScrim"), sheetPanel: $("sheetPanel"),
  summon: $("summon"),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (id, size, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
const sprite = (w, scale) =>
  `<img class="pixel" data-scale="${scale}" style="--px-w:24; --px-h:24"
        src="${w.bound ? w.sprite : w.sealed}" width="${24 * scale}" height="${24 * scale}"
        alt="${esc(w.name)}${w.bound ? "" : ", sealed"}">`;

const pips = (rarity, filled) =>
  `<span class="pips" aria-label="${RARITY[rarity - 1].name}">` +
  Array.from({ length: 5 }, (_, i) =>
    i < rarity ? `<span class="pip${filled ? "" : " pip--hollow"}"></span>` : ""
  ).join("") +
  `</span>`;

/* ---- top bar & header --------------------------------------------------- */

function renderCurrencies() {
  els.cogs.textContent = compact(save.cogs);
  els.shards.textContent = int(save.shards);
  els.seals.textContent = int(save.seals);
}

function renderHeader() {
  const n = boundCount(save);
  els.bound.textContent = n;
  els.total.textContent = `/${WARDENS.length}`;

  const frac = save.resonance / RESONANCE_CAP;
  els.poolPct.textContent = pct(frac);
  els.poolFill.style.setProperty("--fill", `${(frac * 100).toFixed(1)}%`);
  els.poolFill.parentElement.setAttribute("aria-valuenow", Math.round(frac * 100));
  els.poolFigures.textContent = `${int(save.resonance)} / ${int(RESONANCE_CAP)}`;

  // Checkpoints are LIVE: they light and go dark as the pool moves.
  els.ckpts.innerHTML = CHECKPOINTS.map((cp) => {
    const live = isCheckpointLive(cp, save.resonance);
    return `<li class="ckpt${live ? " is-live" : ""}" title="${esc(cp.effect)} — at ${int(checkpointXp(cp))}">
      <span class="ckpt__mark"></span>${pct(cp.at)}</li>`;
  }).join("");
}

/* ---- the grid ----------------------------------------------------------- */

function visibleWardens() {
  if (filter === "bound") return save.wardens.filter((w) => w.bound);
  if (filter === "sealed") return save.wardens.filter((w) => !w.bound);
  return save.wardens;
}

function renderGrid() {
  const list = visibleWardens();

  els.grid.innerHTML = list.map((w) => {
    const level = w.bound ? levelFromXp(w.bondXp) : 0;
    return `<li>
      <button class="wcell${w.bound ? "" : " is-sealed"}${w.rarity >= 4 ? " wcell--crested" : ""}"
              type="button" data-tier="${w.rarity}" data-id="${w.id}"
              aria-label="${esc(w.name)}, ${RARITY[w.rarity - 1].name}${w.bound ? `, bond ${level}` : ", sealed"}">
        <span class="wcell__plaque">${sprite(w, 3)}</span>
        <span class="wcell__name">${esc(w.name)}</span>
        <span class="wcell__foot">
          ${pips(w.rarity, w.bound)}
          ${w.bound
            ? `<span class="wcell__bond">${icon("i-bound", 7, "wcell__mark")}${level}</span>`
            : icon("i-sealed", 9, "wcell__lock")}
        </span>
      </button>
    </li>`;
  }).join("");

  for (const btn of els.seg.querySelectorAll(".seg__item")) {
    const on = btn.dataset.filter === filter;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
  }
  const n = boundCount(save);
  const counts = { all: WARDENS.length, bound: n, sealed: WARDENS.length - n };
  for (const btn of els.seg.querySelectorAll(".seg__item")) {
    btn.querySelector(".seg__n").textContent = counts[btn.dataset.filter];
  }
}

/* ---- the primary action bar --------------------------------------------- */

function canRite() {
  return save.seals >= RITE_COST.seals && save.shards >= RITE_COST.shards;
}

function renderRiteBar() {
  const shortSeals = save.seals < RITE_COST.seals;
  const shortShards = save.shards < RITE_COST.shards;

  els.riteCost.innerHTML =
    `<span class="cost${shortSeals ? " is-short" : ""}">${icon("i-seal", 15)}${RITE_COST.seals}</span>` +
    `<span class="cost${shortShards ? " is-short" : ""}">${icon("i-shard", 14)}${int(RITE_COST.shards)}</span>`;

  const left = Math.max(0, PITY_AT - save.ritesSincePity);
  els.pityFill.style.setProperty("--fill", `${(save.ritesSincePity / PITY_AT * 100).toFixed(0)}%`);
  els.pityLabel.textContent = left === 0
    ? "Sovereign guaranteed on the next Rite"
    : `Sovereign guaranteed in ${left}`;

  els.riteGo.disabled = !canRite();
}

/* ---- detail sheet -------------------------------------------------------- */

function riteOdds(rarity) {
  const total = RITE_WEIGHTS.reduce((a, b) => a + b, 0);
  const p = (RITE_WEIGHTS[rarity - 1] / total) * 100;
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
}

function ladderHTML(w, level) {
  return `<div class="ladder">` + w.rungs.map((r) => {
    const held = w.bound && level >= r.level;
    const cost = isDrawback(r);
    return `<div class="rung${held ? " is-held" : ""}${cost ? " is-cost" : ""}">
      <span class="rung__gate">${icon(held ? "i-bound" : "i-sealed", 8, "rung__mark")}${r.level}</span>
      <span class="rung__text">${esc(bonusText(r))}</span>
    </div>`;
  }).join("") + `</div>`;
}

function boundBlockHTML(w) {
  const level = levelFromXp(w.bondXp);
  const frac = levelProgress(w.bondXp);
  const capped = level >= MAX_BOND;
  const cost = ascendCost(w, save.resonance);
  const affordable = cost && save.resonance >= cost.pool && save.cogs >= cost.cogs;

  return `
    <section class="sheet__block">
      <div class="panel__head">
        <p class="t-label">Bond <span class="sheet__lv">${level}</span> / ${MAX_BOND}</p>
        <p class="t-value u-tnum">${capped ? "Bound in full" : pct(frac, 1)}</p>
      </div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(frac * 100)}" aria-label="Bond progress">
        <div class="bar__fill" style="--fill: ${(frac * 100).toFixed(1)}%"></div>
      </div>
      <p class="t-micro ascend__note">${int(w.bondXp)} / ${int(capped ? w.bondXp : XP_TABLE[level + 1])} bond XP</p>
    </section>

    <section class="sheet__block">
      <p class="t-label">Resonance Bonuses</p>
      ${ladderHTML(w, level)}
    </section>

    ${capped ? "" : `
    <div class="ascend">
      <div class="ascend__body">
        <p class="t-label u-gold">Ascend to bond ${cost.next}</p>
        <div class="ascend__costs">
          <span class="cost${save.resonance < cost.pool ? " is-short" : ""}">${icon("i-resonance", 15)}${int(cost.pool)}</span>
          <span class="cost${save.cogs < cost.cogs ? " is-short" : ""}">${icon("i-cog", 15)}${int(cost.cogs)}</span>
        </div>
        <p class="t-micro ascend__note">1:1 from the pool${cost.discounted ? " · −10% checkpoint" : ""}</p>
      </div>
      <button class="btn-gold btn-gold--sm ascend__go" type="button"
              data-ascend="${w.id}" ${affordable ? "" : "disabled"}>Ascend</button>
    </div>`}`;
}

function sealedBlockHTML(w) {
  return `
    <section class="sheet__block">
      <p class="t-label">Resonance Bonuses on binding</p>
      ${ladderHTML(w, 0)}
    </section>

    <div class="ascend">
      <div class="ascend__body">
        <p class="t-label u-gold">Rite of Binding</p>
        <div class="ascend__costs">
          <span class="cost${save.seals < RITE_COST.seals ? " is-short" : ""}">${icon("i-seal", 15)}${RITE_COST.seals}</span>
          <span class="cost${save.shards < RITE_COST.shards ? " is-short" : ""}">${icon("i-shard", 14)}${int(RITE_COST.shards)}</span>
        </div>
        <p class="t-micro ascend__note">${RARITY[w.rarity - 1].name} tier · ${riteOdds(w.rarity)} per Rite</p>
      </div>
      <button class="btn-gold btn-gold--sm ascend__go" type="button"
              data-rite="1" ${canRite() ? "" : "disabled"}>Perform</button>
    </div>`;
}

function openSheet(id) {
  const w = save.wardens.find((x) => x.id === id);
  if (!w) return;

  els.sheetPanel.setAttribute("data-tier", w.rarity);
  els.sheetPanel.classList.toggle("is-sealed", !w.bound);
  els.sheetPanel.innerHTML = `
    <button class="sheet__close" type="button" data-close="1" aria-label="Close">${icon("i-close", 13)}</button>

    <div class="ornament-rule sheet__grab"><span class="ornament-rule__diamond"></span></div>

    <div class="sheet__head">
      <div class="bezel"><div class="bezel__inner">${sprite(w, 4)}</div></div>
      <div class="sheet__id">
        <h2 class="sheet__name" id="sheetName">${esc(w.name)}</h2>
        <p class="sheet__epithet">${esc(w.epithet)}</p>
        <div class="sheet__tier">
          ${pips(w.rarity, w.bound)}
          <span class="sheet__rarity">${RARITY[w.rarity - 1].name}</span>
          <span class="sheet__domain">${DOMAIN[w.domain]}</span>
        </div>
      </div>
    </div>

    <div class="ornament-rule sheet__rule"><span class="ornament-rule__diamond"></span></div>
    <p class="sheet__flavour">${esc(w.flavour)}</p>

    ${w.bound ? boundBlockHTML(w) : sealedBlockHTML(w)}`;

  els.sheet.hidden = false;
  els.sheet.dataset.id = id;
  requestAnimationFrame(() => {
    els.sheet.classList.add("is-open");
    // The portrait only becomes visible once the panel has stopped moving,
    // so a pixel sprite is never painted at a fractional offset.
    setTimeout(() => els.sheet.classList.add("is-settled"), reducedMotion ? 0 : 300);
  });
}

function closeSheet() {
  els.sheet.classList.remove("is-open", "is-settled");
  setTimeout(() => { els.sheet.hidden = true; }, reducedMotion ? 0 : 340);
}

function refreshSheet() {
  if (!els.sheet.hidden && els.sheet.dataset.id) {
    const settled = els.sheet.classList.contains("is-settled");
    openSheet(els.sheet.dataset.id);
    if (settled) els.sheet.classList.add("is-open", "is-settled");
  }
}

/* ---- ascension ----------------------------------------------------------
   Spend pool XP 1:1 to push a bond level, exactly as the mastery pool works.
   Because the pool can fall below a checkpoint on the way, the header is
   re-rendered from the same state and the checkpoint simply goes dark.
   ------------------------------------------------------------------------- */

function ascend(id) {
  const w = save.wardens.find((x) => x.id === id);
  if (!w || !w.bound) return;
  const cost = ascendCost(w, save.resonance);
  if (!cost || save.resonance < cost.pool || save.cogs < cost.cogs) return;

  save.resonance -= cost.pool;
  save.cogs -= cost.cogs;
  w.bondXp = XP_TABLE[cost.next];

  renderCurrencies();
  renderHeader();
  renderGrid();
  refreshSheet();
}

/* ---- the Rite -----------------------------------------------------------
   Spend the seal and the shards, roll, then run the timeline. A duplicate is
   converted to pool XP rather than wasted, which is also the only way the
   pool refills on this screen.
   ------------------------------------------------------------------------- */

function clearRite() {
  riteTimers.forEach(clearTimeout);
  riteTimers = [];
}

function performRite() {
  if (!canRite()) return;

  const before = boundCount(save);
  save.seals -= RITE_COST.seals;
  save.shards -= RITE_COST.shards;
  save.ritesTotal += 1;

  const owned = new Set(save.wardens.filter((w) => w.bound).map((w) => w.id));
  const { warden, duplicate } = rollWarden(rand, save.ritesSincePity, owned);
  const entry = save.wardens.find((w) => w.id === warden.id);

  save.ritesSincePity = warden.rarity >= 4 ? 0 : save.ritesSincePity + 1;

  let gained = 0;
  if (duplicate) {
    gained = DUPE_RESONANCE[warden.rarity - 1];
    save.resonance = Math.min(RESONANCE_CAP, save.resonance + gained);
  } else {
    entry.bound = true;
    entry.bondXp = 0;
    // Binding seeds the pool the same way earned bond XP would: 25% share.
    save.resonance = Math.min(RESONANCE_CAP,
      save.resonance + Math.floor(deltaXp(2) * POOL_SHARE * warden.rarity));
  }

  renderCurrencies();
  renderHeader();
  renderGrid();
  showRite(entry, duplicate, gained, before);
}

function showRite(w, duplicate, gained, before) {
  clearRite();
  const after = boundCount(save);
  els.summon.setAttribute("data-tier", w.rarity);
  els.summon.innerHTML = `
    <div class="summon__ground"></div>
    <div class="summon__rays" aria-hidden="true"></div>
    <div class="summon__aura" aria-hidden="true"></div>
    <div class="summon__flash" aria-hidden="true"></div>

    <div class="summon__stage">
      <header class="summon__top">
        <p class="summon__eyebrow">Rite of Binding</p>
        <div class="ornament-rule summon__brow-rule"><span class="ornament-rule__diamond"></span></div>
      </header>

      <div class="summon__reveal">
        <div class="summon__mid">
          <div class="summon__seal" aria-hidden="true">
            <span class="summon__ring summon__ring--outer"></span>
            <span class="summon__ring summon__ring--inner"></span>
          </div>

          <div class="summon__frame">
            <div class="summon__screen">
              <div class="summon__core"></div>
              <img class="pixel summon__sprite" data-scale="8" style="--px-w:24; --px-h:24"
                   src="${w.sprite}" width="192" height="192" alt="${esc(w.name)}">
            </div>
          </div>
        </div>

        <div class="summon__id">
          <h2 class="summon__name">${esc(w.name)}</h2>
          <p class="summon__epithet">${esc(w.epithet)}</p>
          <div class="summon__tier">
            ${pips(w.rarity, true)}
            <span class="summon__rarity">${RARITY[w.rarity - 1].name}</span>
          </div>
          <p class="summon__domain">${DOMAIN[w.domain]} Domain</p>
        </div>
      </div>

      <footer class="summon__bottom">
        <div class="ornament-rule summon__rule"><span class="ornament-rule__diamond"></span></div>

        <div class="summon__ledger">
          <p class="t-label">${duplicate ? "Already bound — sigil rendered down" : "Bound to the codex"}</p>
          <div class="spend">
            <span class="spend__item">${icon("i-seal", 15)}<span>−${RITE_COST.seals}</span></span>
            <span class="spend__item">${icon("i-shard", 14)}<span>−${int(RITE_COST.shards)}</span></span>
            ${duplicate ? `<span class="spend__item u-gold">${icon("i-resonance", 15)}<span>+${int(gained)}</span></span>` : ""}
          </div>
          <p class="summon__delta">Codex <b>${before}</b> → <b>${after}</b></p>
          <p class="summon__grant">${esc(bonusText(w.rungs[0]))}</p>
        </div>

        <button class="btn-gold summon__cta" type="button" data-rite-done="1">
          ${duplicate ? "Claim Resonance" : "Open Codex"}
        </button>
      </footer>
    </div>

    <button class="summon__skip" type="button" data-rite-skip="1" aria-label="Skip"></button>`;

  els.summon.hidden = false;

  if (reducedMotion) { els.summon.setAttribute("data-step", "5"); return; }

  const step = (n, at) => riteTimers.push(setTimeout(() => {
    els.summon.setAttribute("data-step", String(n));
    if (n === 3) {
      els.app.classList.add("is-shaking");
      riteTimers.push(setTimeout(() => els.app.classList.remove("is-shaking"), 180));
    }
  }, at));

  els.summon.setAttribute("data-step", "1");
  step(2, 240);
  step(3, 1120);
  step(4, 1440);
  step(5, 2000);
}

function endRite() {
  clearRite();
  els.app.classList.remove("is-shaking");
  els.summon.hidden = true;
  els.summon.removeAttribute("data-step");
  els.summon.innerHTML = "";
  renderRiteBar();
}

/* ---- wiring ------------------------------------------------------------- */

els.seg.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg__item");
  if (!btn) return;
  filter = btn.dataset.filter;
  renderGrid();
  $("screen").scrollTop = 0;
});

els.grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".wcell");
  if (btn) openSheet(btn.dataset.id);
});

els.riteGo.addEventListener("click", performRite);
els.sheetScrim.addEventListener("click", closeSheet);

els.sheetPanel.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close]");
  if (close) return closeSheet();

  const asc = e.target.closest("[data-ascend]");
  if (asc && !asc.disabled) return ascend(asc.dataset.ascend);

  const rite = e.target.closest("[data-rite]");
  if (rite && !rite.disabled) { closeSheet(); return performRite(); }
});

els.summon.addEventListener("click", (e) => {
  if (e.target.closest("[data-rite-done]")) return endRite();
  if (e.target.closest("[data-rite-skip]")) {
    clearRite();
    els.app.classList.remove("is-shaking");
    els.summon.setAttribute("data-step", "5");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!els.summon.hidden) endRite();
  else if (!els.sheet.hidden) closeSheet();
});

/* ---- boot --------------------------------------------------------------- */

/* The browser chrome takes its colour from the same token everything else
   does. A hardcoded hex in a <meta> tag is a second source of truth for the
   page ground, and second sources of truth drift. */
{
  const meta = document.querySelector('meta[name="theme-color"]');
  const ground = getComputedStyle(document.documentElement)
    .getPropertyValue("--c-ground").trim();
  if (meta && ground) meta.setAttribute("content", ground);
}

renderCurrencies();
renderHeader();
renderGrid();
renderRiteBar();

/* Deterministic entry points, so a given state can be screenshotted and
   compared frame for frame. No UI advertises these; they are a build tool. */
if (params.get("sheet")) openSheet(params.get("sheet"));
if (params.get("rite")) {
  const w = save.wardens.find((x) => x.id === params.get("rite"));
  if (w) {
    const n = boundCount(save);
    // The ledger's before/after has to agree with the headline: a duplicate
    // leaves the codex count where it was, a fresh binding moves it by one.
    const dupe = params.get("dupe") === "1";
    showRite(w, dupe, DUPE_RESONANCE[w.rarity - 1], dupe ? n : n - 1);
    if (params.get("play") !== "1") { clearRite(); els.summon.setAttribute("data-step", "5"); }
  }
}

window.EMBERVEIL_WARDENS = { save, performRite, openSheet, ascend };

window.__APP_READY__ = false;
requestAnimationFrame(() => requestAnimationFrame(() => {
  // Give a sheet or rite opened from the URL time to finish its transition,
  // so a capture never lands mid-slide.
  const settling = params.get("sheet") ? 420 : 0;
  setTimeout(() => { window.__APP_READY__ = true; }, settling);
}));
