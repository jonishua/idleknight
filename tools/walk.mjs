#!/usr/bin/env node
/* =========================================================================
   walk.mjs — open EVERY screen in the game at 390x844 and screenshot it.

   The parity brief's third task is "walk the whole game: open every screen,
   screenshot each, fix anything broken or visually collided". Doing that by
   hand once is tedious; doing it every round is the only way the answer stays
   true, so it is a script.

   The walk is DERIVED, not hand-listed. It reads the live content database
   for the skill list, so a skill added to src/data/skills/index.js gets
   walked on the day it lands and cannot quietly go unrendered. The only
   hand-written entries are the ones with no data behind them: the four nav
   tabs and the four pages of the OTHER block.

   Each stop is captured twice over, in effect:
     - a 390x844 viewport shot, which is what a phone actually shows, and
     - the page's own error channel (window.__errs, installed by index.html)
       plus a DOM overflow probe, both read back and reported.

   A stop that throws, renders nothing, or overflows the viewport horizontally
   is a FAIL and the script exits non-zero. "It screenshotted" is not the bar;
   "it screenshotted and the page was not on fire" is.

   Usage:
     node tools/walk.mjs                        # every stop, to progress/shots
     node tools/walk.mjs --only combat,bank     # a subset, by stop id
     node tools/walk.mjs --level 60             # seed levels before walking
     node tools/walk.mjs --out /tmp/shots       # elsewhere
   ========================================================================= */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import DB from "../src/data/index.js";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const BASE = flag("base", "http://localhost:5174/index.html");
const OUT = resolve(process.cwd(), flag("out", "progress/shots"));
const PREFIX = flag("prefix", "parity-");
const LEVEL = Number(flag("level", 60));
const ONLY = (flag("only", "") || "").split(",").filter(Boolean);

/* -------------------------------------------------------------------------
   THE SEED

   A level-1 save renders every screen as a wall of locked rows, which hides
   exactly the collisions this walk exists to find — a recipe row's five
   columns only fight each other once they all have numbers in them. So the
   walk seeds a mid-game account first: levels, coin, materials and a lit
   fight. It writes through the same public surface the UI uses, so nothing
   here can put the game into a state the player could not reach.
   ------------------------------------------------------------------------- */
const SEED = `
  const { xpAt } = await import("/src/js/engine/xp.js");
  const g = window.game, s = g.state;
  for (const sk of window.DB.skills) {
    if (s.skills[sk.id]) s.skills[sk.id].xp = xpAt(${LEVEL});
  }
  s.cogs = 25_000_000; s.shards = 40_000; s.marks = 12_500; s.prayer = 640;
  for (const it of window.DB.items.values()) s.items[it.id] = 5000;
  /* Buy the bank space to hold them. Without this the Bank card reads
     "237 / 20" and every shot carries a red herring that looks like a
     capacity bug rather than an over-generous seed. */
  s.clasps = Math.max(s.clasps || 0, window.DB.items.size + 20);
  g._usedSlots = null; g._invalidate?.();
`;

/* -------------------------------------------------------------------------
   THE STOPS
   ------------------------------------------------------------------------- */

/** The four nav tabs plus the two routed-to screens that have no tab. */
const TABS = [
  ["combat", "#combat", "Combat — §3j, where all eight combat skills land"],
  ["bank", "#bank", "Bank — §3k"],
  ["shop", "#shop", "Shop — §3l"],
  ["equipment", "#equipment", "Equipment / loadout — §3j's equipment block"],
];

/** §1's OTHER block. */
const OTHER = [
  ["other-menu", "#other", "OTHER block menu"],
  ["completion", "#other/completion", "Completion Log — §3m"],
  ["statistics", "#other/stats", "Statistics — §3n"],
  ["settings", "#other/settings", "Settings"],
  ["guide", "#other/guide", "Game Guide"],
];

/** Every skill page, derived from the registry so it cannot go stale. */
const skillStops = () => DB.skills
  /* The eight combat skills are not pages (§1) — they route to #combat,
     which TABS already walks. Walking them would be eight copies of one
     screenshot and would hide that fact rather than prove it. */
  .filter((s) => !(s.kind === "combat" || s.id === "vitality"))
  .map((s) => [`skill-${s.id}`, `#skills/${s.id}`, `${s.name} — ${s.kind}`]);

const STOPS = [
  ["skills-menu", "#skills", "The menu — §1, three blocks, (level / 99)"],
  ...TABS,
  ...skillStops(),
  ...OTHER,
].filter(([id]) => !ONLY.length || ONLY.includes(id));

/* -------------------------------------------------------------------------
   THE PROBE

   Read back after the screen has rendered. Three questions, all of which a
   screenshot alone answers wrongly: did anything throw, did the screen
   render at all, and does anything stick out past 390px.
   ------------------------------------------------------------------------- */
const PROBE = `
  const main = document.getElementById("main");
  const wide = [];
  for (const n of document.querySelectorAll("#app *")) {
    const r = n.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > 391.5 || r.left < -1.5) {
      /* An element that scrolls inside its own box is allowed to be wider
         than the phone; that is what overflow-x is for. Only report the
         ones that actually push the page sideways. */
      let scroller = false;
      for (let p = n.parentElement; p; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "auto" || ov === "scroll") { scroller = true; break; }
      }
      if (!scroller) wide.push(n.tagName.toLowerCase() + "." + (n.className.baseVal ?? n.className ?? "").toString().split(" ")[0] + " @" + Math.round(r.right));
    }
  }
  return JSON.stringify({
    errs: window.__errs || [],
    nodes: main ? main.childElementCount : 0,
    text: main ? main.innerText.trim().length : 0,
    scrollW: document.documentElement.scrollWidth,
    wide: wide.slice(0, 6),
  });
`;

/* ------------------------------------------------------------------------- */

mkdirSync(OUT, { recursive: true });

const run = (args) => new Promise((ok) => {
  const c = spawn(process.execPath, [resolve(import.meta.dirname, "shot.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  c.stdout.on("data", (d) => (out += d));
  c.stderr.on("data", (d) => (err += d));
  c.on("close", (code) => ok({ code, out, err }));
});

const pad = (s, n) => String(s).padEnd(n);
let failed = 0;

console.log(`\nwalking ${STOPS.length} screens at 390x844, seeded to level ${LEVEL}\n`);

for (const [id, hash, what] of STOPS) {
  const file = `${OUT}/${PREFIX}${id}.png`;
  /* The hash has to be applied AFTER the seed, because the seed changes what
     several screens render; navigating first and seeding second leaves a
     level-1 render on screen with a level-60 save behind it. */
  const script = `${SEED}
    location.hash = ${JSON.stringify(hash)};
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await new Promise((r) => setTimeout(r, 250));
    /* Scroll the key art off the top. It is 640px of a 844px phone and it is
       the same on all 28 stops, so a shot that includes it is 76% identical
       everywhere and shows almost none of the screen being walked. The
       player sees this view within one thumb-flick of arriving. */
    /* Less the floating topbar's own height, so the screen's first row is not
       sitting behind it in the capture. */
    document.getElementById("screen").scrollTop =
      document.getElementById("main").offsetTop - document.querySelector(".topbar").offsetHeight;
    await new Promise((r) => setTimeout(r, 150));
  `;
  const r = await run([BASE, file, "--width", "390", "--height", "844",
    "--wait", "500", "--eval", script, "--probe", PROBE]);

  if (r.code !== 0) {
    console.log(`  ${pad(id, 24)} FAIL  ${(r.err.trim() || r.out.trim()).split("\n").slice(-1)[0]}`);
    failed++;
    continue;
  }

  const line = /PROBE (\{.*\})/.exec(r.out);
  let note = "";
  if (line) {
    const d = JSON.parse(line[1]);
    const bad = [];
    if (d.errs.length) bad.push(`${d.errs.length} page error(s): ${JSON.stringify(d.errs[0]).slice(0, 120)}`);
    if (d.nodes < 2 || d.text < 40) bad.push(`rendered almost nothing (${d.nodes} nodes, ${d.text} chars)`);
    if (d.wide.length) bad.push(`overflows 390px: ${d.wide.join(", ")}`);
    if (bad.length) { failed++; note = "FAIL  " + bad.join(" · "); }
    else note = `ok    ${d.nodes} blocks`;
  } else note = "ok    (no probe)";

  console.log(`  ${pad(id, 24)} ${pad(note, 60)} ${what}`);
}

console.log(`\n${STOPS.length - failed}/${STOPS.length} screens clean\n`);
process.exit(failed ? 1 : 0);
