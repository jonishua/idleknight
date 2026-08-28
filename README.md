# Emberveil

A Final Fantasy VI–inspired idle RPG for mobile browsers, built to the quality bar
of a top-grossing premium mobile game.

- **Systems** follow the Melvor Idle template — skills, XP curve, per-recipe mastery,
  deterministic tick engine, offline replay, designer-priced faucets and sinks.
  We take the *math*, never the content.
- **Art and world** are FFVI-flavoured — SNES pixel art, summoned spirits, jobs,
  magic, steampunk-fantasy melodrama. Every name, character, monster, spell and
  location is invented here. **Zero FFVI proper nouns ship in strings.**
- **Nothing from RuneScape.** No Bronze/Iron/Steel/Mithril/Adamant/Rune metal
  ladder, no RuneScape skill names, no RuneScape item names.

The bar we are measured against lives in `reference/`. `reference/shots/ui-bar.png`
is the real screenshot and **always beats** the `reference/ui-bar.md` transcription
when the two disagree.

---

## ▶ Play it (start here)

```bash
npm start                       # no install step, no dependencies
```

Then open **http://localhost:5174/index.html** on a 390x844 viewport
(iPhone 14/15 in device emulation). That is the whole game.

Every screen is URL-addressable, which is how the screen walk reaches all 28:

```
index.html#combat            a nav tab
index.html#skills/delving    that tab, opened onto one skill page
index.html#other/stats       the OTHER block, opened onto one of its pages
```

`index.html` is wired to the real tick engine — nothing on screen is a fixture —
and is built on the shipped design system: `tokens.css`, `primitives.css`,
`hero.css`, `home.css`, plus `play.css` for the live-game pieces. It shares one
icon sprite (`src/assets/icons.svg`) with `index.html`, so the two cannot drift.

**Poke at it from the console:** `game` and `DB` are exposed globally.

```js
game.state.cogs = 100000        // fund a shopping trip
game.advanceSeconds(3600)       // fast-forward an hour
game.skillLevel('delving')      // note: ids are still the old internal names
```

---

## The 25 skills

The menu is Melvor's, in Melvor's three blocks, with `(level / 99)` beside every
skill. **The eight combat skills are not eight pages** — they are levels, and all
eight route to the single Combat screen. That is the reference's own central
structural finding and it is reproduced exactly.

**COMBAT** — Attack · Strength · Defence · **Vitality** · Ranged · Magic ·
**Devotion** · **Bounties**

**PASSIVE** — Farming · **Settlement**

**NON-COMBAT** — Woodcutting · Fishing · Firemaking · Cooking · Mining ·
Smithing · **Larceny** · **Bowcraft** · Crafting · **Enchanting** · **Alchemy** ·
Agility · Summoning · Astrology · **Transmutation** · *Exploration*

Bold names are ours where Melvor uses a RuneScape coinage: Vitality (Hitpoints),
Devotion (Prayer), Bounties (Slayer), Settlement (Township), Larceny (Thieving),
Bowcraft (Fletching), Enchanting (Runecrafting), Alchemy (Herblore),
Transmutation (Alt. Magic). *Exploration* is ours outright — no Melvor skill maps
to it — which makes 26 skills against the base game's 25.

**26 skills · 238 actions · 237 items · 17 monsters · 110 shop entries.**

Nine screen archetypes cover them: gathering, artisan (with Cooking's three
independent stations), farming, settlement, larceny, the agility course builder,
summoning, astrology, and the one Combat screen. Plus Bank, Shop, Equipment,
Completion Log, Statistics, Settings and the Game Guide.

**Where we stand against the bar, screen by screen, honestly:
[`reference/parity-status.md`](reference/parity-status.md).**

**What works**
- Real-time ticking at 20 ticks/sec, with a deterministic event-jump fast path
  that is asserted identical to tick-by-tick on every rung of every skill
- Per-recipe mastery, per-skill mastery pools, four checkpoints each
- Offline replay (24h cap) with a Welcome Back summary
- Autosave to `localStorage` every 5s; export/reset in Settings
- Driven by `setInterval` on the wall clock, **not** `requestAnimationFrame` —
  rAF is frozen outright in a hidden tab, which would stop an idle game dead the
  moment you switch away. The wall-clock delta means a throttled background tick
  still advances the correct amount, and returning settles the gap immediately.

### Art status

Art is out of scope for the parity work and nothing new was drawn. The build
uses what this project already produced — `src/assets/icons/skills/` (16x16 item
sprites), `src/assets/sprites/atelier/` (monsters, hero sprites, FX, the Slagfen
battle scene) and the Ember Gate key art. `src/js/art.js` binds them to the live
content database; items without a sprite fall back to a coloured block with the
name's initials.

### A note on names

Display names are ordinary RPG vocabulary — Mining, Woodcutting, Fishing,
Firemaking, Smithing, Cooking, Enchanting, Exploration, Combat — and real-world
nouns for materials (Copper, Tin, Iron, Coal, Silver, Gold; Birch, Oak, Willow;
Trout, Bass, Swordfish, Shark). Invented words are reserved for things that are
genuinely ours: Aetherite, Voidglass, Warden's Tear, the Ninefold.

**Internal ids still use the old invented names** (`delving`, `boughcraft`,
`trawling`, `emberrite`, `kilnwork`, `hearthcraft`, `sigilwork`, `wayfaring`,
`warding`). They are load-bearing across the engine, selftest, sandbox and balance
tool, so renaming them is a separate mechanical pass — worth doing, but not worth
risking mid-MVP. `reference/melvor-math.md` §9 now states the naming policy that
governs both, and `selftest.js` enforces it against every shipped string.

**Known gaps** — level-1 combat is slow by design (3s swings, max hit 3), so cook
food first; the bank starts at 20 slots and overflow is dropped. The three that
matter against the bar are the combat triangle, Alchemy's potion economics and
the Settlement's depth — all three are written up with measurements in
[`reference/parity-status.md`](reference/parity-status.md).

## Commands

```bash
npm start          # serve the app  -> http://localhost:5174/index.html
npm run verify     # THE GATE: toolchain + selftest + all four wing checks
npm run walk       # open all 28 screens at 390x844, shoot and probe each
npm run shot -- <url> <outfile.png>   # one screenshot at 390x844
npm run progress   # rebuild progress.html from progress/*.json
npm run sprites    # regenerate the placeholder pixel sprites
```

### The gates

Nothing lands that reduces any of these.

```bash
npm run verify          # runs everything below, 25 / 25
```

| Gate | What it holds | Today |
|---|---|---|
| engine selftest | every formula against `reference/melvor-math.md`, plus the naming policy against every shipped string | **146 / 146** |
| `tools/check-artisan.mjs` | recipe chains, markup decay, the income ceiling, Cooking's stations | clean |
| `tools/check-passive.mjs` | Farming supply measured against measured Cooking and Alchemy demand | 63 / 63 |
| `tools/check-exotic.mjs` | Agility, Summoning, Astrology; modifier caps; tablets spent in combat | 100 / 100 |
| `tools/check-meta.mjs` | Bank, Shop, Completion and Statistics against the engine, string by string | 100 / 100 |
| `tools/walk.mjs` | all 28 screens render, throw nothing, and fit inside 390px | 28 / 28 |

The selftest alone, if you want just that one:

```bash
node -e "import('./src/js/engine/index.js').then(async E=>{const fs=await import('fs');
  const r=E.runSelftest(E.DB,fs.readFileSync('reference/melvor-math.md','utf8'));
  const res=r.results||r.tests||[];const f=res.filter(x=>!(x.pass??x.ok??true));
  console.log(res.length-f.length+'/'+res.length); f.forEach(x=>console.log('FAIL',x.name));})"
```

The content database also self-validates on import and refuses to boot on a
dangling id, an unobtainable item, or recipes listed out of level order.

### Walking the whole game

```bash
npm run walk                       # 28 screens -> progress/shots/parity-*.png
node tools/walk.mjs --only combat,shop
node tools/walk.mjs --level 99     # seed a capped account first
```

The stop list is *derived* from `src/data/skills/index.js`, so a skill added to
the registry is walked on the day it lands and cannot quietly go unrendered. Each
stop is screenshotted **and probed**: a screen that throws, renders almost
nothing, or pushes the page past 390px fails the run. "It screenshotted" is not
the bar.

There is **no install step and no dependencies** — `npm install` is not needed.
Everything runs on Node's standard library (Node 20+; developed on 25).

### Run the app

```bash
npm run dev
```

Then open <http://localhost:5174/>. To pick a different port: `node tools/serve.mjs 5175`.

Set your browser to a 390×844 viewport (iPhone 14/15 in device emulation). The home
screen is tuned to fit that viewport exactly, with zero scroll.

### Take a screenshot

```bash
npm run shot -- http://localhost:5174/ progress/shots/home-screen-r1.png
# or directly:
node tools/shot.mjs http://localhost:5174/ out.png
```

**Screenshots work on this machine** — verified producing a real 780×1688 PNG
(390×844 at devicePixelRatio 2).

`tools/shot.mjs` drives headless Chrome over the DevTools Protocol using Node's
built-in `WebSocket` and `fetch`. No puppeteer, no playwright, nothing to install
or keep up to date. It finds a browser in this order: `$CHROME_PATH`, then any
headless shell already in the playwright cache, then installed Chrome/Chromium/Edge.

| Flag | Default | Meaning |
|---|---|---|
| `--width <n>` | 390 | CSS viewport width |
| `--height <n>` | 844 | CSS viewport height |
| `--scale <n>` | 2 | device pixel ratio |
| `--full` | off | capture the whole scrollable page |
| `--wait <ms>` | 350 | extra settle time after load |
| `--desktop` | off | turn off mobile emulation |
| `--eval <js>` | — | run JS in the page after load, before the capture — drive the app to a screen a URL cannot reach. Awaited if it returns a promise; a throw is a hard failure, because a capture of the wrong screen looks exactly like a capture of the right one |
| `--probe <js>` | — | run JS **after** the capture and print its result as one `PROBE <json>` line. For asserting on what a screenshot cannot show: thrown errors, overflow, an empty render. `tools/walk.mjs` is built on it |

It waits for `document.fonts.ready` and for the app to set `window.__APP_READY__`,
so it never captures a half-laid-out screen. If no browser can be found it exits
non-zero with a loud message — **critics must never describe a screenshot they did
not actually take.**

---

## The design system comes first

`src/styles/tokens.css` is the single source of truth: the full palette, spacing
scale, type scale, radii, component metrics and motion. Every hex in it was sampled
programmatically from `reference/shots/ui-bar.png`, not eyeballed.

**Downstream CSS must consume the tokens. No raw hex, no bare gap px, no bare
font-size.** If a value you need is missing, add it to `tokens.css` first.
`npm run verify` enforces the no-raw-hex rule and will fail the build if you break it.

Three things the reference does that intuition gets wrong. All three are encoded as
comments in `tokens.css`, and all three are what a critic will catch first:

1. **Secondary labels are light (`#C4C8CA`), not dimmed.** Hierarchy is carried by
   size and letter-spacing, never by fading text out. Muted labels are the single
   fastest way to look cheap.
2. **Dividers are darker than their panel**, not lighter. Separation is a cut groove
   (`--c-groove`), never a bright hairline.
3. **The empty progress track is the same value as the panel.** Verified by sampling:
   both are `#14181C`. The gold is simply painted onto the panel surface.

### Files

| Path | What it is |
|---|---|
| `src/styles/tokens.css` | design tokens — the source of truth |
| `src/styles/base.css` | reset, self-hosted display face, 390×844 app frame |
| `src/styles/primitives.css` | panel, bar, gold button, chip, card, nav, ornaments, pixel |
| `src/styles/home.css` | home screen composition only |
| `src/js/main.js` | shell: tab routing, number/time formatters, readiness signal |
| `src/assets/fonts/` | Cinzel, self-hosted (no runtime network, reproducible shots) |
| `src/assets/sprites/` | original 16×16 sprites from `tools/make-sprite.mjs` |

### Primitives available

`.panel` · `.divider` / `.divider--v` · `.bar` + `.bar__fill` (+ `--violet`, `--sm`)
· `.btn-gold` (chamfered pressed metal) · `.btn-ghost` · `.chip` (+ `--wide`)
· `.card` (+ `--violet`) · `.ornament-rule` with diamond · `.emblem` · `.dot-gold`
· `.nav` · `.hero` · `.pixel` · type: `.t-label` `.t-value` `.t-value-lg` `.t-body`
`.t-micro` `.t-display` `.t-numeral` `.t-rarity`

### Pixel art rule

Sprites ship at **1×** and are scaled by **whole numbers only**, via
`class="pixel" data-scale="3" style="--px-w:16; --px-h:16"`. Never pre-scale a
sprite file; never use a fractional factor. Fractional scaling is the most obvious
possible tell that we got the 16-bit half wrong.

The live pipeline demo is on the **Skills** tab (16×16 authored → 48×48 rendered,
`image-rendering: pixelated`).

---

## Live progress page

`progress.html` is regenerated from `progress/*.json` and uses our own design
system, so it is also a standing check that the tokens look right.

```bash
npm run progress   # then open http://localhost:5174/progress.html
```

**Critics: write one JSON file per verdict** at `progress/<piece>-r<round>.json`:

```json
{
  "piece": "home-screen",
  "round": 1,
  "score": 64,
  "wins": false,
  "biggestGap": "The one thing to fix next, stated concretely.",
  "evidence": ["What you saw", "Another specific observation"],
  "timestamp": "2026-08-26T21:40:00Z"
}
```

- `piece` — kebab-case id; groups rounds together and orders the page.
- `score` — 0–100 overall mark.
- `wins` — did **our** build win the blind side-by-side pick?
- `biggestGap` — the single highest-value fix. The latest round's gap is headlined
  on the piece card; that is what gets sent back to the builder.
- `evidence` — string or array of strings.

Drop screenshots at `progress/shots/<piece>-r<round>.png` and they are matched to
their round automatically. Malformed JSON is reported on the page rather than
silently skipped.

---

## Current state

Scaffold only. What exists:

- Home screen, fitting 390×844 exactly with zero scroll, built entirely from tokens.
- The full chrome vocabulary listed above.
- Working dev server, screenshot tool, progress page generator, and health check.
- Proven pixel-art pipeline with original sprites.

What does not exist yet, honestly:

- **The hero has no art.** The reference gives ~40% of the screen to full-bleed
  painterly art; ours is a vector placeholder explicitly marked as such in
  `index.html`. This is the biggest gap and the first thing worth attacking.
- No game systems at all — no tick engine, skills, mastery, XP curve or offline
  replay. The numbers on the home screen are static placeholders.
- Four of the five nav tabs are honest "not built yet" placeholders.

Round 0 baseline and its screenshot are recorded in `progress/scaffold-r0.json`.
That entry is the scaffold's **self-assessment**, clearly labelled as such — it has
not been through a blind comparison.
