/* =========================================================================
   EMBERVEIL — SHARED SCREEN HELPERS

   The pure rendering vocabulary every play-screen speaks: DOM construction,
   escaping, number and duration formatting, XP-bar maths, the placeholder
   marks, and the handful of composite controls the parity screens need
   (a "Select <thing>" dropdown, a segmented toggle, a modal sheet).

   Two things here are NOT pure, and both are deliberate:

     setNumberFormat()  flips every number in the game between compact
                        ("12.4M") and full ("12,400,000"). It is a Settings
                        toggle, and a formatter that only some screens honour
                        would be worse than no toggle at all — so the switch
                        lives with the formatter.

     prefs(game)        the UI's own slice of the save. Bank tab assignments,
                        the sell-mode flag, the chosen shop category, the
                        discovery ledger and the player's name are UI state,
                        not simulation state — the engine neither reads nor
                        writes them. They live under `state.ui` so they travel
                        with an exported save and die with a wiped one, and
                        they are created lazily so an old save upgrades on
                        first read instead of needing a migration.

   ART IS OUT OF SCOPE. `mark()` falls back to a tinted initials block when no
   sprite exists in ../art.js; that gap is deliberate.
   ========================================================================= */

import { xpAt } from "../engine/index.js";
import { ITEM_ICON, MOB_SPRITE } from "../art.js";

export const $ = (id) => document.getElementById(id);
export const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstElementChild; };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* =========================================================================
   NUMBERS
   ========================================================================= */

/** Settings switch. Compact is the default because the faucet ladder spans
 *  eight orders of magnitude (§5) and a raw 12,400,000,000 does not fit in a
 *  bank cell on a 390px phone. */
let COMPACT = true;
export function setNumberFormat(compact) { COMPACT = !!compact; }

/** Full digits with thousands separators. Never abbreviated — the parity
 *  screens quote exact XP totals ("581,032 / 605,032") and an abbreviation
 *  there would be a different number. */
export const int = (n) => Math.floor(n || 0).toLocaleString("en-US");

export function num(n) {
  n = Math.floor(n || 0);
  if (!COMPACT) return n.toLocaleString("en-US");
  if (n < 10000) return n.toLocaleString("en-US");
  const U = ["", "K", "M", "B", "T", "Qa"];
  const t = Math.min(Math.floor(Math.log10(n) / 3), U.length - 1);
  const v = n / 1000 ** t;
  return v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, "") + U[t];
}

export function dur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

/** "0h 3m 9s" — the shape the save clock in the skill header uses. */
export function hms(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 3600)}h ${Math.floor(sec / 60) % 60}m ${sec % 60}s`;
}

/** "4y 21d" / "21d 4h" / "4h 12m" — an account age, not a stopwatch. */
export function age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  if (d >= 365) return `${Math.floor(d / 365)}y ${d % 365}d`;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export const pct2 = (f) => `${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}%`;
export const secs = (s) => `${s.toFixed(2)}s`;

/* =========================================================================
   XP
   ========================================================================= */

export const xpForLevel = (l) => xpAt(Math.max(1, l));
export function xpPct(xp, lv) {
  const lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
  return hi <= lo ? 100 : Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100));
}

/**
 * The parity header's XP line, as the reference spells it:
 * `581,032 / 605,032` — CUMULATIVE XP over the cumulative XP that reaches the
 * next level — collapsing to a single total once the level is capped
 * (`23,743,761`). Mastery rows use exactly the same pair, which is why it
 * lives here rather than in either screen.
 */
export function xpPair(xp, level, cap) {
  if (level >= cap) return int(xp);
  return `${int(xp)} / ${int(xpAt(level + 1))}`;
}

/** XP still owed for the next level — the honest "how much more" number. */
export const xpToNext = (xp, level, cap) => (level >= cap ? 0 : Math.max(0, xpAt(level + 1) - xp));

/* =========================================================================
   MARKS  (placeholder art — see the header)
   ========================================================================= */

/** Stable colour per id so every skill and item reads as a distinct mark. */
export function hue(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
export const initials = (name) => name.split(/[\s'-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export function mark(id, label, round) {
  /* 16x16 art, drawn at exactly 2x so the pixel grid stays square. */
  const art = ITEM_ICON[id];
  if (art) return `<span class="mark mark--art" aria-hidden="true"><img src="${art}" width="32" height="32" alt=""></span>`;
  const h = hue(id);
  return `<span class="mark${round ? " mark--round" : ""}" aria-hidden="true"
    style="background:linear-gradient(160deg,hsl(${h} 48% 58%),hsl(${(h + 38) % 360} 44% 34%))">${esc(label)}</span>`;
}
/** Foes always have a sprite; show it shrunk into the row's mark box. */
export function mobMark(id) {
  const s = MOB_SPRITE[id];
  if (!s) return mark(id, "??", true);
  return `<span class="mark mark--mob" aria-hidden="true"><img src="${s.src}" width="${s.w}" height="${s.h}" alt=""></span>`;
}
export const icon = (sym, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><use href="#${sym}"/></svg>`;

/** The rank word under the hero numeral. Flavour, driven by real level. */
export function rank(lv) {
  if (lv >= 99) return "Ascendant";
  if (lv >= 80) return "Master";
  if (lv >= 60) return "Adept";
  if (lv >= 40) return "Journeyman";
  if (lv >= 20) return "Apprentice";
  if (lv >= 5) return "Novice";
  return "Unproven";
}

/* =========================================================================
   COMPOSITE CONTROLS
   Built from primitives.css only — this piece ships no new stylesheet, so
   anything the design system does not already have is expressed as inline
   layout over existing tokens rather than as a new class.
   ========================================================================= */

/* THIS IS A SHARED VOCABULARY. Every screen and every skill view imports from
   here, so an export in this section is part of the app's public surface:
   ADD freely, but never delete one because your own screen stopped using it.
   Deleting `sect` for five minutes took the whole app down. */

/** A `STATISTIC / value` row, the shape §3n's table is made of. */
export const line = (k, v) => `<div class="stat-line"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

/** `<p class="sect">` — the section heading every screen separates blocks with. */
export const sect = (t) => el(`<p class="sect">${esc(t)}</p>`);

/**
 * The reference's "Select <Thing>" control: a labelled native dropdown.
 * Native on purpose — it is the only picker on a phone that is guaranteed to
 * be reachable, scrollable and screen-reader-legible without a stylesheet.
 * @param {string} label      e.g. "Select Shop Category"
 * @param {[string,string][]} options  [value, text]
 * @param {string} value      currently selected value
 * @param {(v:string)=>void} onChange
 */
export function selector(label, options, value, onChange) {
  const wrap = el(`<section class="panel panel--tight">
    <p class="t-label" style="margin-bottom:var(--s-2)">${esc(label)}</p>
    <select style="width:100%;background:var(--c-track);color:var(--c-text-1);
      border:1px solid var(--c-panel-edge);border-radius:var(--r-sm);
      padding:10px var(--s-3);font:inherit;font-size:var(--fs-body);
      font-family:var(--ff-sans);appearance:auto">
      ${options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`).join("")}
    </select></section>`);
  wrap.querySelector("select").onchange = (e) => onChange(e.target.value);
  return wrap;
}

/**
 * A row of mutually exclusive buttons — the Show All / Discovered /
 * Undiscovered filter, the Buy x1 quantity picker, the stats tabs.
 * @param {[string,string][]} options [value, text]
 */
export function segmented(options, value, onPick, opts = {}) {
  const row = el(`<div style="display:flex;gap:var(--s-1);flex-wrap:wrap;margin:var(--s-2) 0"></div>`);
  for (const [v, t] of options) {
    const on = v === value;
    const b = el(`<button type="button" class="${on ? "btn-gold btn-gold--sm" : "btn-ghost"}"
      style="flex:${opts.grow === false ? "0 0 auto" : "1 1 auto"};min-width:0;font-size:var(--fs-micro);padding:7px var(--s-2)">${esc(t)}</button>`);
    b.onclick = () => onPick(v);
    row.appendChild(b);
  }
  return row;
}

/** A row of independent actions (Sort / Move items to new Tab / …). */
export function toolbar(buttons) {
  const row = el(`<div style="display:flex;gap:var(--s-1);flex-wrap:wrap;margin-bottom:var(--s-2)"></div>`);
  for (const b of buttons) {
    if (!b) continue;
    const n = el(`<button type="button" class="${b.on ? "btn-gold btn-gold--sm" : "btn-ghost"}"
      style="flex:1 1 auto;min-width:0;font-size:var(--fs-micro);padding:7px var(--s-2)">${esc(b.text)}</button>`);
    n.onclick = b.onClick;
    row.appendChild(n);
  }
  return row;
}

/** Three little `label / value` cells across a panel — Space / Bank / Tab. */
export function statSplit(cells) {
  return el(`<section class="panel panel--tight"><div class="stat-split">
    ${cells.map(([k, v], i) => (i ? `<div class="divider divider--v"></div>` : "") +
      `<div><p class="t-label">${esc(k)}</p><p class="t-value u-tnum" style="color:var(--c-gold-core)">${esc(v)}</p></div>`).join("")}
  </div></section>`);
}

/**
 * A modal sheet over the screen. Returns the scrim so a caller can close it.
 * @param {string} title
 * @param {string} sub
 * @param {(Element|string)[]} body
 * @param {string} [closeText]
 */
export function sheet(title, sub, body, closeText = "Close") {
  const scrim = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <p class="sheet__title">${esc(title)}</p>
    <p class="sheet__sub">${esc(sub)}</p>
    <div class="sheet__body"></div>
    <button class="btn-gold" type="button">${esc(closeText)}</button>
  </div></div>`);
  const host = scrim.querySelector(".sheet__body");
  for (const n of body) host.append(typeof n === "string" ? el(n) : n);
  const close = () => scrim.remove();
  scrim.querySelector(".sheet > .btn-gold").onclick = close;
  scrim.onclick = (e) => { if (e.target === scrim) close(); };
  document.body.appendChild(scrim);
  return scrim;
}

/** A "‹ back" row, the same affordance every drill-down in the app uses. */
export function backRow(text, onClick) {
  const b = el(`<button class="row-card" type="button"><span class="row-card__body">
    <span class="row-card__title">‹ ${esc(text)}</span></span></button>`);
  b.onclick = onClick;
  return b;
}

/* =========================================================================
   UI STATE  (see the file header for why it lives on the save)
   ========================================================================= */

const UI_DEFAULTS = () => ({
  name: "Adept",
  createdAt: 0,
  compact: true,
  confirmSell: true,
  autoSell: false,
  bankTab: 0,
  bankTabs: {},        // itemId -> tab index
  bankTabNames: ["Reliquary"],
  bankSort: "name",
  sellMode: false,
  sellQty: "all",
  selected: null,      // item id in the bank detail pane
  shopCat: "reliquary",
  shopQty: 1,
  statsCat: "general",
  completionFilter: "all",
  found: {},           // itemId -> 1, every item ever held
  slain: {},           // monsterId -> 1
  itemsSold: 0,        // stacks sold
  unitsSold: 0,        // individual items sold
});

/**
 * The UI's slice of the save, created on first read.
 *
 * It is also where the two preferences that do NOT live on the save object
 * get pushed back into the things that read them — the shared formatter, and
 * the Game instance's auto-sell flag, which is a constructor option and so is
 * lost every time the page reloads. Doing it here rather than on a timer is
 * what guarantees the very first frame after a reload already honours them:
 * every screen reads prefs() before it draws a number.
 */
export function prefs(game) {
  const s = game.state;
  if (!s.ui) s.ui = UI_DEFAULTS();
  else {
    const d = UI_DEFAULTS();
    for (const k of Object.keys(d)) if (s.ui[k] === undefined) s.ui[k] = d[k];
  }
  if (!s.ui.createdAt) s.ui.createdAt = s.lastSaveAt || Date.now();
  setNumberFormat(s.ui.compact);
  game.autoSell = !!s.ui.autoSell;
  return s.ui;
}
