#!/usr/bin/env node
/* =========================================================================
   build-progress.mjs — regenerate progress.html from progress/*.json

   Scans one JSON per critic verdict and rebuilds the live progress page.
   Zero dependencies. Safe to run on every verdict.

   VERDICT FILE   progress/<piece>-r<round>.json
   SCHEMA
     {
       "piece":      "home-screen",      // kebab-case id; groups the rounds
       "round":      1,                  // integer, 1-based
       "score":      64,                 // 0-100, the critic's overall mark
       "wins":       false,              // did OUR build win the blind pick?
       "biggestGap": "Panels read flat…", // the ONE thing to fix next
       "evidence":   ["…", "…"],         // string or array of strings
       "timestamp":  "2026-08-26T21:40:00Z"
     }

   SCREENSHOTS    progress/shots/<piece>-r<round>.png  (jpg/webp also picked up)
                  are matched to their round automatically.

   Usage:  node tools/build-progress.mjs        (or: npm run progress)
   ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_DIR = resolve(ROOT, "progress");
const SHOTS_DIR = resolve(PROGRESS_DIR, "shots");
const OUT = resolve(ROOT, "progress.html");

/* ---- helpers ------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "home-screen" -> "Home Screen" */
const titleize = (s) =>
  String(s).split(/[-_\s]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** Accepts true / "yes" / "win" / 1 as a win. */
function isWin(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return /^(y|yes|true|win|won|pass)$/i.test(v.trim());
  return false;
}

function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function fmtDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts ?? "");
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/* ---- load verdicts ------------------------------------------------------ */

mkdirSync(PROGRESS_DIR, { recursive: true });
mkdirSync(SHOTS_DIR, { recursive: true });

const verdicts = [];
const problems = [];

for (const file of readdirSync(PROGRESS_DIR).sort()) {
  if (extname(file).toLowerCase() !== ".json") continue;
  const path = resolve(PROGRESS_DIR, file);
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    problems.push(`${file}: not valid JSON — ${err.message}`);
    continue;
  }
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      problems.push(`${file}: expected an object`);
      continue;
    }
    // Fall back to the filename when the fields are missing: home-screen-r2.json
    const m = /^(.*)-r(\d+)$/.exec(basename(file, ".json"));
    const piece = row.piece ?? m?.[1] ?? basename(file, ".json");
    const round = Number(row.round ?? m?.[2] ?? 0);
    const score = row.score == null ? null : Number(row.score);
    if (score !== null && !Number.isFinite(score)) {
      problems.push(`${file}: score "${row.score}" is not a number`);
    }
    verdicts.push({
      piece: String(piece),
      round,
      score: Number.isFinite(score) ? score : null,
      wins: isWin(row.wins),
      biggestGap: row.biggestGap ?? row.biggest_gap ?? "",
      evidence: asList(row.evidence),
      timestamp: row.timestamp ?? null,
      file,
    });
  }
}

/* ---- index screenshots -------------------------------------------------- */

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const shotsByKey = new Map();   // "piece-r3" -> [relative paths]
const shotsByPiece = new Map(); // "piece"    -> [relative paths]

if (existsSync(SHOTS_DIR)) {
  for (const f of readdirSync(SHOTS_DIR).sort()) {
    if (!IMG_EXT.has(extname(f).toLowerCase())) continue;
    const rel = `progress/shots/${f}`;
    const stem = basename(f, extname(f));
    const m = /^(.*)-r(\d+)/.exec(stem);
    if (m) {
      const key = `${m[1]}-r${Number(m[2])}`;
      if (!shotsByKey.has(key)) shotsByKey.set(key, []);
      shotsByKey.get(key).push(rel);
      if (!shotsByPiece.has(m[1])) shotsByPiece.set(m[1], []);
      shotsByPiece.get(m[1]).push(rel);
    } else {
      if (!shotsByPiece.has(stem)) shotsByPiece.set(stem, []);
      shotsByPiece.get(stem).push(rel);
    }
  }
}

/* ---- group by piece ----------------------------------------------------- */

const pieces = new Map();
for (const v of verdicts) {
  if (!pieces.has(v.piece)) pieces.set(v.piece, []);
  pieces.get(v.piece).push(v);
}
for (const rounds of pieces.values()) rounds.sort((a, b) => a.round - b.round);

// Most recently touched piece first.
const ordered = [...pieces.entries()].sort((a, b) => {
  const last = (rs) => rs[rs.length - 1];
  const ta = Date.parse(last(a[1]).timestamp ?? 0) || 0;
  const tb = Date.parse(last(b[1]).timestamp ?? 0) || 0;
  return tb - ta;
});

/* ---- summary ------------------------------------------------------------ */

const scored = verdicts.filter((v) => v.score !== null);
const avgScore = scored.length
  ? Math.round(scored.reduce((s, v) => s + v.score, 0) / scored.length)
  : null;
const piecesWon = [...pieces.values()].filter((rs) => rs[rs.length - 1].wins).length;
const latestScore = ordered.length ? ordered[0][1][ordered[0][1].length - 1].score : null;

/* ---- rendering ---------------------------------------------------------- */

/** Score -> a colour token. Gold is good; violet flags the work still to do. */
function scoreClass(score) {
  if (score === null) return "is-none";
  if (score >= 85) return "is-high";
  if (score >= 65) return "is-mid";
  return "is-low";
}

function sparkline(rounds) {
  const pts = rounds.filter((r) => r.score !== null);
  if (pts.length === 0) return "";
  const W = 240, H = 56, PAD = 6;
  const n = pts.length;
  const x = (i) => (n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1));
  const y = (s) => H - PAD - (Math.max(0, Math.min(100, s)) / 100) * (H - PAD * 2);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const dots = pts.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3"
             fill="${p.wins ? "#F8DCA2" : "#D7A747"}"
             stroke="#050A10" stroke-width="1.5"><title>Round ${p.round}: ${p.score}</title></circle>`
  ).join("");

  return `
  <svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score trend across rounds">
    <line x1="${PAD}" y1="${y(100).toFixed(1)}" x2="${W - PAD}" y2="${y(100).toFixed(1)}"
          stroke="rgba(255,255,255,.07)" stroke-dasharray="3 4"/>
    <path d="${area}" fill="url(#sparkfill)"/>
    <path d="${line}" fill="none" stroke="url(#sparkline)" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

function renderShots(paths) {
  if (!paths || paths.length === 0) return "";
  return `<div class="shots">${paths.map((p) => `
      <a class="shot" href="${esc(p)}" target="_blank" rel="noopener">
        <img src="${esc(p)}" alt="${esc(basename(p))}" loading="lazy">
        <span class="shot__cap">${esc(basename(p))}</span>
      </a>`).join("")}</div>`;
}

function renderRound(r, piece, isLatest) {
  const shots = shotsByKey.get(`${piece}-r${r.round}`) || [];
  const scoreTxt = r.score === null ? "—" : r.score;
  // The latest round's gap is already headlined on the card; don't repeat it.
  const showGap = r.biggestGap && !isLatest;
  return `
  <li class="round">
    <div class="round__head">
      <span class="round__n">Round ${r.round}</span>
      <span class="round__score ${scoreClass(r.score)}">${scoreTxt}</span>
      ${r.wins ? `<span class="badge badge--win">Won blind pick</span>` : `<span class="badge">Lost blind pick</span>`}
      ${r.timestamp ? `<span class="round__time">${esc(fmtDate(r.timestamp))}</span>` : ""}
    </div>

    <div class="bar" aria-hidden="true">
      <div class="bar__fill${r.score !== null && r.score < 65 ? " bar__fill--violet" : ""}"
           style="--fill:${r.score === null ? 0 : Math.max(0, Math.min(100, r.score))}%"></div>
    </div>

    ${showGap ? `
      <div class="gap">
        <span class="gap__label">Biggest gap</span>
        <p class="gap__text">${esc(r.biggestGap)}</p>
      </div>` : ""}

    ${r.evidence.length ? `
      <ul class="evidence">
        ${r.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}
      </ul>` : ""}

    ${renderShots(shots)}
  </li>`;
}

function renderPiece([piece, rounds]) {
  const latest = rounds[rounds.length - 1];
  const first = rounds[0];
  const delta =
    latest.score !== null && first.score !== null && rounds.length > 1
      ? latest.score - first.score
      : null;

  // Screenshots that never matched a round still deserve to be seen.
  const matched = new Set(rounds.flatMap((r) => shotsByKey.get(`${piece}-r${r.round}`) || []));
  const loose = (shotsByPiece.get(piece) || []).filter((p) => !matched.has(p));

  return `
  <section class="piece panel">
    <header class="piece__head">
      <div class="piece__id">
        <h2 class="piece__name">${esc(titleize(piece))}</h2>
        <p class="piece__meta">${rounds.length} round${rounds.length === 1 ? "" : "s"} &middot;
          <code>${esc(piece)}</code></p>
      </div>

      <div class="piece__score">
        <span class="piece__num ${scoreClass(latest.score)}">${latest.score === null ? "—" : latest.score}</span>
        ${delta !== null ? `<span class="delta ${delta >= 0 ? "is-up" : "is-down"}">${delta >= 0 ? "+" : ""}${delta}</span>` : ""}
      </div>
    </header>

    ${latest.wins
      ? `<p class="verdict verdict--win">Currently winning the blind comparison.</p>`
      : `<p class="verdict">Still losing the blind comparison.</p>`}

    ${rounds.length > 1 ? sparkline(rounds) : ""}

    ${latest.biggestGap ? `
      <div class="gap gap--current">
        <span class="gap__label">Current biggest gap</span>
        <p class="gap__text">${esc(latest.biggestGap)}</p>
      </div>` : ""}

    <details class="history"${rounds.length <= 2 ? " open" : ""}>
      <summary>Round history</summary>
      <ol class="rounds">${rounds.map((r, i) => renderRound(r, piece, i === rounds.length - 1)).join("")}</ol>
    </details>

    ${loose.length ? `<div class="loose"><p class="t-label">Unmatched screenshots</p>${renderShots(loose)}</div>` : ""}
  </section>`;
}

/* ---- page --------------------------------------------------------------- */

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Emberveil — Build Progress</title>

<!-- The progress page eats our own design system: same tokens, same primitives. -->
<link rel="stylesheet" href="src/styles/tokens.css">
<link rel="stylesheet" href="src/styles/primitives.css">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--c-ground);
    color: var(--c-text-1);
    font-family: var(--ff-sans);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, p, ul, ol, li, figure { margin: 0; padding: 0; }
  ul, ol { list-style: none; }
  a { color: inherit; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--fs-micro);
    color: var(--c-text-2);
  }

  .wrap { max-width: 1080px; margin-inline: auto; padding: var(--s-7) var(--s-5) var(--s-8); }

  /* ---- page header ---- */
  .head { display: flex; align-items: flex-end; justify-content: space-between;
          gap: var(--s-5); flex-wrap: wrap; margin-bottom: var(--s-6); }
  .head__title {
    font-family: var(--ff-display); font-weight: 900; font-size: 26px;
    letter-spacing: var(--ls-display); text-transform: uppercase;
    background: var(--grad-gold-text); -webkit-background-clip: text;
    background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
  }
  .head__sub { color: var(--c-text-2); font-size: var(--fs-label);
               letter-spacing: var(--ls-label); text-transform: uppercase; margin-top: var(--s-2); }

  /* ---- summary tiles ---- */
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
             gap: var(--s-3); margin-bottom: var(--s-6); }
  .tile { background: var(--c-surface); border: 1px solid var(--c-hairline);
          border-radius: var(--r-panel); padding: var(--s-4); }
  .tile__label { font-size: var(--fs-label); letter-spacing: var(--ls-label);
                 text-transform: uppercase; color: var(--c-text-2); }
  .tile__value { font-family: var(--ff-display); font-weight: 900; font-size: 34px;
                 line-height: 1.1; margin-top: var(--s-2);
                 background: var(--grad-gold-text); -webkit-background-clip: text;
                 background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
                 font-variant-numeric: tabular-nums; }

  /* ---- piece card ---- */
  .pieces { display: flex; flex-direction: column; gap: var(--s-4); }
  .piece { padding: var(--s-5); }
  .piece__head { display: flex; align-items: flex-start; justify-content: space-between;
                 gap: var(--s-4); }
  .piece__name { font-family: var(--ff-display); font-weight: var(--fw-display);
                 font-size: var(--fs-title); letter-spacing: 0.06em;
                 text-transform: uppercase; color: var(--c-gold-core); }
  .piece__meta { color: var(--c-text-2); font-size: var(--fs-micro); margin-top: var(--s-1); }
  .piece__score { display: flex; align-items: baseline; gap: var(--s-2); }
  .piece__num { font-family: var(--ff-display); font-weight: 900; font-size: 46px;
                line-height: 1; font-variant-numeric: tabular-nums; }

  .is-high { background: var(--grad-gold-text); -webkit-background-clip: text;
             background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
  .is-mid  { color: var(--c-gold-core); }
  .is-low  { color: var(--c-violet-light); }
  .is-none { color: var(--c-text-2); }

  .delta { font-size: var(--fs-label); font-weight: var(--fw-bold);
           font-variant-numeric: tabular-nums; }
  .delta.is-up   { color: var(--c-gold-core); }
  .delta.is-down { color: var(--c-violet-light); }

  .verdict { margin-top: var(--s-3); font-size: var(--fs-label);
             letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--c-text-2); }
  .verdict--win { color: var(--c-gold-light); }

  .spark { width: 240px; height: 56px; margin-top: var(--s-4); display: block; }

  /* ---- biggest gap ---- */
  .gap { margin-top: var(--s-4); padding: var(--s-3) var(--s-4);
         background: var(--c-groove); border-radius: var(--r-card);
         border-left: 2px solid var(--c-violet-core); }
  .gap--current { border-left-color: var(--c-gold-core); }
  .gap__label { font-size: var(--fs-micro); letter-spacing: var(--ls-label);
                text-transform: uppercase; color: var(--c-text-2); }
  .gap__text { margin-top: var(--s-1); color: var(--c-text-1); }

  /* ---- rounds ---- */
  .history { margin-top: var(--s-4); }
  .history > summary { cursor: pointer; font-size: var(--fs-label);
                       letter-spacing: var(--ls-label); text-transform: uppercase;
                       color: var(--c-text-2); padding: var(--s-2) 0; }
  .rounds { display: flex; flex-direction: column; gap: var(--s-4); margin-top: var(--s-2); }
  .round { padding-top: var(--s-4); border-top: 1px solid var(--c-groove); }
  .round__head { display: flex; align-items: baseline; gap: var(--s-3);
                 flex-wrap: wrap; margin-bottom: var(--s-2); }
  .round__n { font-size: var(--fs-label); letter-spacing: var(--ls-label);
              text-transform: uppercase; color: var(--c-text-2); }
  .round__score { font-weight: var(--fw-bold); font-size: var(--fs-value-lg);
                  font-variant-numeric: tabular-nums; }
  .round__time { margin-left: auto; font-size: var(--fs-micro); color: var(--c-text-2); }

  .bar__fill--violet { background: var(--grad-violet-bar); }

  .badge { font-size: var(--fs-micro); letter-spacing: var(--ls-label);
           text-transform: uppercase; padding: 2px var(--s-2); border-radius: var(--r-pill);
           border: 1px solid var(--c-hairline); color: var(--c-text-2); }
  .badge--win { color: var(--c-gold-light); border-color: var(--c-hairline-gold); }

  .evidence { margin-top: var(--s-3); display: flex; flex-direction: column; gap: var(--s-2); }
  .evidence li { position: relative; padding-left: var(--s-4);
                 color: var(--c-text-2); font-size: var(--fs-body); }
  .evidence li::before { content: ""; position: absolute; left: 0; top: 8px;
                         width: 5px; height: 5px; transform: rotate(45deg);
                         border: 1px solid var(--c-gold-core); }

  /* ---- screenshots ---- */
  .shots { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-4); }
  .shot { display: block; text-decoration: none; }
  .shot img { width: 156px; height: auto; border-radius: var(--r-card);
              border: 1px solid var(--c-hairline); display: block; background: var(--c-ground); }
  .shot__cap { display: block; margin-top: var(--s-1); font-size: var(--fs-micro);
               color: var(--c-text-2); max-width: 156px; overflow: hidden;
               text-overflow: ellipsis; white-space: nowrap; }
  .loose { margin-top: var(--s-4); }

  /* ---- empty / problems ---- */
  .empty { text-align: center; padding: var(--s-8) var(--s-5); }
  .empty__title { font-family: var(--ff-display); font-weight: var(--fw-display);
                  font-size: var(--fs-title); letter-spacing: var(--ls-display);
                  text-transform: uppercase; color: var(--c-gold-core); }
  .empty pre { margin-top: var(--s-4); text-align: left; overflow-x: auto;
               background: var(--c-groove); padding: var(--s-4);
               border-radius: var(--r-card); color: var(--c-text-2);
               font-size: var(--fs-micro); line-height: 1.6; }
  .problems { margin-top: var(--s-6); border-left: 2px solid var(--c-violet-core); }

  .foot { margin-top: var(--s-7); color: var(--c-text-2); font-size: var(--fs-micro);
          display: flex; gap: var(--s-4); flex-wrap: wrap; }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="sparkline" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#B08539"/><stop offset="100%" stop-color="#F8DCA2"/>
  </linearGradient>
  <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#D7A747" stop-opacity=".26"/>
    <stop offset="100%" stop-color="#D7A747" stop-opacity="0"/>
  </linearGradient>
</defs></svg>

<div class="wrap">

  <header class="head">
    <div>
      <h1 class="head__title">Emberveil</h1>
      <p class="head__sub">Build progress &middot; blind-comparison scoreboard</p>
    </div>
    <p class="head__sub">Generated ${esc(fmtDate(new Date().toISOString()))}</p>
  </header>

  <section class="summary">
    <div class="tile">
      <p class="tile__label">Pieces tracked</p>
      <p class="tile__value">${pieces.size}</p>
    </div>
    <div class="tile">
      <p class="tile__label">Verdicts</p>
      <p class="tile__value">${verdicts.length}</p>
    </div>
    <div class="tile">
      <p class="tile__label">Average score</p>
      <p class="tile__value">${avgScore === null ? "—" : avgScore}</p>
    </div>
    <div class="tile">
      <p class="tile__label">Pieces winning</p>
      <p class="tile__value">${piecesWon}<span style="font-size:18px">/${pieces.size}</span></p>
    </div>
  </section>

  ${ordered.length === 0 ? `
    <div class="panel empty">
      <p class="empty__title">No verdicts yet</p>
      <p class="t-body" style="margin-top:12px">
        Drop one JSON per critic verdict into <code>progress/</code> and re-run
        <code>npm run progress</code>.
      </p>
      <pre>progress/home-screen-r1.json

{
  "piece": "home-screen",
  "round": 1,
  "score": 64,
  "wins": false,
  "biggestGap": "Panels read flat — no bevel on the gold.",
  "evidence": ["Bar track is darker than the panel", "Labels muted to 40%"],
  "timestamp": "${new Date().toISOString()}"
}

Screenshots: progress/shots/home-screen-r1.png</pre>
    </div>` : `
    <div class="pieces">${ordered.map(renderPiece).join("")}</div>`}

  ${problems.length ? `
    <section class="panel problems">
      <p class="t-label">${problems.length} file${problems.length === 1 ? "" : "s"} could not be read</p>
      <ul class="evidence">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>` : ""}

  <footer class="foot">
    <span>Regenerate: <code>npm run progress</code></span>
    <span>Screenshot: <code>npm run shot -- &lt;url&gt; &lt;out.png&gt;</code></span>
    <span>App: <code>npm run dev</code></span>
  </footer>
</div>
</body>
</html>
`;

writeFileSync(OUT, html, "utf8");

console.log(`progress.html rebuilt`);
console.log(`  ${verdicts.length} verdict(s) across ${pieces.size} piece(s)`);
console.log(`  ${[...shotsByPiece.values()].reduce((n, a) => n + a.length, 0)} screenshot(s) indexed`);
if (avgScore !== null) console.log(`  average score ${avgScore}, ${piecesWon}/${pieces.size} piece(s) winning`);
if (problems.length) {
  console.log(`\n  ${problems.length} problem file(s):`);
  for (const p of problems) console.log(`    ${p}`);
}
console.log(`\n  ${OUT}`);
