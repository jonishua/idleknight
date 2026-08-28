# SNES Final Fantasy VI — Visual Language Spec

**Purpose:** reproduce the *look* without copying a single asset. Every number below
was **sampled programmatically from the real screenshots now sitting in
`reference/shots/ffvi-*.png`** (all native resolution, all lossless PNG). Where a
statement is convention/design judgement rather than a measurement, it is marked
**[convention]**. Nothing here is guessed.

Names, characters, monsters, spells and places are OUR invention. This document
describes geometry, palette structure and rendering rules only.

---

## 0. The single most important rule: 5-bit color

The SNES stores color as BGR555 — **5 bits per channel, 32 levels**. Every channel
value in a real FFVI frame is therefore a multiple of 8: `0x00, 0x08, 0x10, … 0xF8`.

I verified this across all 24 downloaded shots — **2,115 unique colors, and with
three trivial exceptions every single channel is a multiple of 8.** "White" in FFVI
is `#F8F8F8`, never `#FFFFFF`.

```js
// Quantize every color the game renders. This one function does more for
// authenticity than any amount of pixel-pushing.
const snes = v => Math.min(248, Math.round(v / 8) * 8);
const snesHex = (r,g,b) => '#' + [r,g,b].map(c => snes(c).toString(16).padStart(2,'0')).join('').toUpperCase();
```

The exceptions are instructive: `ffvi-bg-tower.png` contains 12 colors on a
multiple-of-**4** grid. That is SNES **color math** (the "add-half" blend mode) —
two 5-bit colors averaged land between the steps. So: base art on the /8 grid;
blend results may land on the /4 grid. Never anything finer.

**Corollary:** do not use CSS gradients, `opacity`, blur, or antialiased shapes
*inside* the pixel layer. Any of those emit off-grid colors and instantly read as
"modern engine faking retro". Blends must be pre-quantized.

---

## 1. Resolution and geometry

| Thing | Value | Source |
|---|---|---|
| Native framebuffer | **256 × 224** | `ffvi-menu-*.png` are all exactly 256×224 |
| Aspect ratio | **8:7** (not 4:3 — the CRT stretched it) | 256/224 |
| Overscan-safe area | ~**240 × 208** | every battle/field capture is cropped to 240×211 or 240×208 |
| Tile grid | **8 × 8** | sprite bounding boxes land exactly on 8px lines |
| Text line pitch, battle | **12 px** | measured, party rows at y=160/172/184/196 |
| Text line pitch, menu list | **15–16 px** | measured, `ffvi-menu-main.png` right window |

### Sprite dimensions (measured, not assumed)

| Class | Size | How measured |
|---|---|---|
| Character, field & battle idle | **16 × 24** (2×3 tiles) | overlaid an 8px grid on `ffvi-battle-esper.png`; the sprite fills exactly 2 tiles wide × 3 tall |
| Character, action poses | **24 × 32** (3×4 tiles) **[convention]** | wider poses need the extra tile column for an outstretched weapon |
| Small monster | 32 × 32 – 48 × 48 **[convention]** | |
| Medium monster | ~**88 × 64** | green quadruped in `ffvi-battle-native-a.png` bounded at 85w × 63h → an 88×64 tile block |
| Boss | 96 × 96 up to 128 × 160 **[convention]** | |

**Proportions.** The 16×24 character is roughly **2.7 heads tall** — the head
occupies the top ~9px of 24. This is squat, not chibi-cute: shoulders are as wide
as the head, the torso is ~8px, legs ~7px. Almost nobody has a neck. Feet are
implied by two dark 2×2 blocks, not drawn.

The single most-copied-wrong thing: **the head is a silhouette shape (hair/helmet),
not a face.** At 16px wide you get eyes as 1×2 dark pixels and nothing else. Faces
live in the portrait, never in the sprite.

---

## 2. Palette structure

### Per-sprite budget

SNES sprites are 4bpp: **15 colors + 1 transparent, per palette, per sprite.**

I extracted a single 16×24 character from `ffvi-battle-esper.png` and, after
removing the background colors bleeding into the bounding box, it uses **10–12
distinct colors**. That is the real working number. Sprites do not spend their
whole budget.

A typical allocation (this is the shape to imitate):

| Slots | Role |
|---|---|
| 0 | transparent |
| 1 | outline / darkest — near-black, **tinted toward the scene**, never `#000000` |
| 2–4 | primary garment ramp (3 steps) |
| 5–7 | secondary garment / armor ramp (3 steps) |
| 8–10 | skin ramp (3 steps: shadow, base, highlight) |
| 11–13 | hair ramp (3 steps) |
| 14–15 | one accent (metal glint, gem, weapon edge) |

**Three steps is the standard ramp length.** Not five, not eight. Measured example —
the green monster in `ffvi-battle-native-a.png` resolves to exactly four green
values plus two teal accents:

```
#004830  #007060  #60A860  #B0D070      (+ #184840, #187878 accents)
```

### Per-tile budget for backgrounds

Measured colors per 8×8 tile across five scenes:

| Scene | median colors/tile | max |
|---|---|---|
| `ffvi-battle-snowfield` | 4 | 19 |
| `ffvi-field-village` | 5 | 14 |
| `ffvi-battle-esper` | 6 | 15 |
| `ffvi-battle-native-a` | 6 | 20 |
| `ffvi-bg-tower` | 9 | 20 |

**Median 4–6 colors per 8×8 tile.** Backgrounds are far flatter than people
remember. (Tiles exceeding 15 are places where a sprite on a different palette
overlaps the background.)

### Dithering: the myth

Everyone "knows" 16-bit art is dithered. I measured actual 2×2 checkerboard
coverage:

| Scene | checkerboard pixels |
|---|---|
| `ffvi-battle-snowfield` | **1.3 %** |
| `ffvi-bg-tower` | 2.8 % |
| `ffvi-battle-esper` | 2.9 % |
| `ffvi-battle-native-a` | 2.7 % |
| `ffvi-field-village` | 4.3 % |

**Dithering is 1–4 % of pixels. It is a spice, not a technique.** FFVI shades with
*hard-edged flat regions* separated by one clean ramp step. Where dithering does
appear it is doing one of three specific jobs:

1. A **50 % checkerboard fading a sky/fog gradient** across a band it can't afford
   more palette steps for.
2. A **transparency stand-in** (the SNES could only do one real transparency layer,
   so ghosts, shadows and water get checkerboarded).
3. A **single transition row** between two ramp steps on a large flat area.

It is never used as a texture. If your output looks dithered from three feet away,
you have overdone it by roughly 10×.

### Shading conventions

- **Light comes from the upper-left**, consistently, everywhere, including UI.
- **Shadows are hue-shifted, not just darkened.** Skin `#F8B878` → `#987858` →
  `#784028`: saturation rises and hue rotates toward red-brown as it darkens. Never
  multiply a color by 0.6 and call it a shadow.
- **Highlights desaturate toward the scene's light color**, not toward white.
- **Outlines are colored.** A sprite in a snow scene outlines in `#181820`; in a
  cave, `#081010`; over red fire, `#181818`. Pure black outline is a modern tell.
- **Contact shadow:** every standing sprite gets a 1-2px dark ellipse under it,
  drawn in the *background's* darkest ramp step, not in black.

---

## 3. The window / menu aesthetic

This is FFVI's most recognizable signature and it decodes cleanly. All numbers
below come from `ffvi-menu-main.png`, `ffvi-menu-skills.png` and
`ffvi-battle-native-a.png`.

### 3a. The interior blue gradient

Not a per-window gradient — a **vertical ramp spanning the whole windowed region of
the screen, in ~20 steps of exactly 8 per channel.** Windows at different heights
sample different parts of the same ramp, which is why stacked windows appear to
share one continuous wash.

Menu screens (ramp spans the full 224 lines, one step per 10 scanlines):

```
#5050D0  #4848C8  #4040C0  #3838B8  #3030B0  #2828A8  #2020A0  #181898
#101090  #080888  #000080  #000078  #000070  #000068  #000060  #000058
#000050  #000048  #000040  #000038  #000030  #000028
```

Read it as: subtract 8 from **all three channels** per step, clamping at 0. R and G
hit zero at step 10 (`#000080`); after that only blue keeps falling. That clamp is
what makes the bottom of a FFVI window go deep navy rather than grey-blue.

Battle screens use the same ramp compressed into the ~60px bottom band — about one
step every 3 scanlines — starting slightly lighter at `#6868C0`. Same ramp, steeper
slope.

```css
/* Ramp indices 0..21. Compute per scanline of the windowed region. */
function windowBlue(t /* 0..1 down the windowed band */) {
  const step = Math.round(t * 21);
  const rg = Math.max(0, 0x50 - step * 8);
  const b  = Math.max(0, 0xD0 - step * 8);
  return `rgb(${rg},${rg},${b})`;
}
```

### 3b. The silver rail border

Not a 1px stroke. A **4px-thick lit metal rail** wrapping the window, with the
light source upper-left. Measured cross-sections, reading each side outside → in:

| Edge | Cross-section |
|---|---|
| Top | `#F8F8F8` `#D8D8D8` `#808080` `#505050` → interior |
| Left | `#F8F8F8` `#B8B8B8` `#606060` `#383838` → interior |
| Right | `#606060` `#B8B8B8` `#F8F8F8` `#383838` → interior |
| Bottom | `#000000` `#787878` `#303030` → interior (bottom rail sits in shadow) |

The right rail's bright pixel is one in from the outer edge — that is *not* a
mistake. Both vertical rails are the same tube cross-section `F8 → B8 → 60`
highlighted on its **left**, because the light is on the left. Then a single
`#383838` shadow line separates rail from interior on both sides.

**Corners are chamfered over 4px on a 45° diagonal**, not square and not
round-rectangle. Here is the real top-left corner, pixel for pixel:

```
58 58 A8 D8 F8 F8 F8 F8 F8 …
58 D8 F8 F8 D8 D8 D8 D8 D8 …
A8 F8 F8 D8 A8 80 80 80 80 …
D0 F8 D0 78 78 50 50 50 50 …
F8 F0 A0 78 50 ▓  ▓  ▓  ▓  …      ▓ = interior blue
F8 D0 78 50 ▓  ▓  ▓  ▓  ▓  …
F8 D0 78 50 ▓  ▓  ▓  ▓  ▓  …
```

One more measured subtlety: **the rail greys are subject to the same downward
gradient as the interior.** The right rail of the main menu window reads `#F8F8F8`
at the top of the screen and fades to `#C8C8C8` by y=110. The frame is lit by the
same wash as its contents.

### 3c. The font

Measured from `ffvi-battle-native-a.png` and `ffvi-battle-spellcast.png`:

- **7 px cap height**, 6px x-height, sitting in an 8px cell.
- **2 px vertical stems.** This is the defining trait — FFVI's font is *chunky*, not
  a hairline 8×8 bitmap font. Almost every retro-web attempt gets this wrong by
  using a 1px-stem font.
- **Proportional, not monospaced.** Glyph advances measured at 4–10px in menu text
  (`F`→`i` = 10, `i`→`g` = 6, `g`→`h` = 8). Fixed-width name fields snap to an 8px
  grid; free text does not.
- **Hard 1px black shadow, offset (+1, +1).** No blur, no alpha. Every glyph carries
  it. This is what makes white text legible over the blue wash and over battle
  backgrounds, and it is non-optional.

Text colors, measured:

| Color | Role |
|---|---|
| `#F8F8F8` | primary text |
| `#000000` | the +1/+1 shadow |
| `#00D8D8` | **cyan** — headers and stat labels (`Status`, `Vigor`, `Bat.Pwr`) |
| `#F8D800` | **yellow** — the character whose ATB is full / currently acting |

Two accent colors in the entire UI. Same discipline as `ui-bar.md`, different hues.

---

## 4. Battle screen composition

From `ffvi-battle-native-a.png`, `ffvi-battle-spellcast.png`,
`ffvi-battle-melee.png` (240 × 211 overscan-cropped; native 256 × 224).

### Layout

```
┌──────────────────────────────────────────────┐  y 0
│                                              │
│   BATTLE BACKGROUND (parallax, ~150 lines)   │
│                                              │
│   monsters ←──── left third ...              │
│                      ... right ──→ party     │
│                        (single file,         │
│                         staggered diagonal)  │
│                                              │  y ~147
├────────────────┬─────────────────────────────┤
│ COMMAND WINDOW │   PARTY STATUS WINDOW       │  ~62 lines tall
│  Fight         │   LOCKE   9271  ▭▭▭▭▭░░░    │
│  Steal         │   SHADOW  9999  ▭▭▭▭▭▭▭▭    │  12px row pitch
│  Magic         │   STRAGO  9999  ▭▭▭░░░░░    │
│  Item          │   EDGAR   9999  ▭▭▭▭▭▭░░    │
└────────────────┴─────────────────────────────┘  y 208
```

Measured, in the 240-wide crop:

- Bottom window band: **y 147 → 208, ~62px tall** (≈28 % of screen height).
- Command window: **x 2 → 87** (~85px). Four commands, 12px pitch.
- Party window: **x 93 → right edge** (~147px). Four rows, 12px pitch.
- Command window sits **left**, party status **right**. Always.
- **No HP bars for the party — HP is a number.** `9999` next to the name. The only
  bar on screen is the ATB gauge.
- Party sprites stand in a **single file staggered down-right**, roughly 12px apart
  vertically and 6px apart horizontally, so nobody occludes anybody.
- Monsters occupy the **left third**, arbitrarily placed, often overlapping.
- The background is a **full-bleed painted scene**, not a flat color. Even the
  desert in `ffvi-battle-native-a.png` has 98 unique colors in the top 145 lines.

### The ATB gauge — decoded pixel by pixel

The one bar in the whole game, and worth stealing wholesale. Measured from
`ffvi-battle-native-a.png`:

- **Rounded capsule, 40 px wide × 7 px tall**, one per party member, right-aligned.
- Outline: `#A0A0A0`, a proper 1px lozenge — the end caps step in by 1px on the top
  and bottom rows, giving a genuine rounded pill at 7px tall.
- Inner shading line: `#808080`.
- **Empty track: no color at all.** The window's blue gradient shows straight
  through. There is no darker "well".
- **Fill: exactly 3 rows tall, `#808080` / `#F8F8F8` / `#808080`** — a white core
  with a grey top and bottom, giving the fill a rounded tube read at 3px.
- Fill runs `x+4 → x+37`, so **34 px of travel** inside the 40px capsule.

```
      ░░░███████████████████████████████████░░░     row 0   #A0A0A0 outline
      ░██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██░    row 1
      ██░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░██    row 2   #808080 fill edge
      █░░░█████████████████░░░░░░░░░░░░░░░░░░░░█    row 3   #F8F8F8 fill core
      ██░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░██    row 4   #808080 fill edge
      ░██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██░    row 5
      ░░░███████████████████████████████████░░░     row 6
             ↑ filled 21/34            ↑ empty (window blue shows through)
```

Because the empty portion is transparent to the window gradient, an ATB gauge near
the top of the band and one near the bottom look *different* — and that is correct.

### ATB presentation rules

1. **The gauge is the only thing that moves while you are not acting.** Four bars
   creeping at different rates is the entire visual language of "time is passing".
2. **When a gauge fills, the name turns `#F8D800`** and the command window opens for
   that character. Filling is not signalled by the bar changing color — it is
   signalled by the *name*.
3. **The gauge is per-character, never a party-wide "turn" indicator.**
4. **Damage numbers** fly up from the target in large digits and dissipate; healing
   is the same digits in green. **[convention]**
5. **Actions are translations, not animations.** The attacker slides forward ~16px,
   a static weapon-swing pose is held for a few frames, a flash occurs, the
   attacker slides back. See §6.

---

## 5. Signature palettes (all measured from the shots on disk)

Each is given as a luminance-ordered ramp. These are *scene* palettes — light,
atmosphere and material relationships. Use them as structural templates for our own
invented locations; do not reuse them with FFVI's location names attached.

### 5a. Window Chrome — `ffvi-menu-*.png`

```
interior  #5050D0 #4040C0 #3030B0 #2020A0 #101090 #000080 #000060 #000040 #000028
rail      #F8F8F8 #D8D8D8 #B8B8B8 #A8A8A8 #808080 #606060 #505050 #383838
text      #F8F8F8   accent-a #00D8D8   accent-b #F8D800   shadow #000000
```

### 5b. Frostwaste — night snow, `ffvi-battle-snowfield.png`

The masterclass in cool-value control: 30 % of the frame is one near-black, and the
snow is a **blue-grey**, never white.

```
#181820  #182028  #182830  #283030  #303030   ← sky, rock, night ground
#404858  #385868  #486878  #507078  #587080   ← mid snow in shadow
#587888  #607888  #608090  #688898  #708898   ← lit snow
#7090A0  #7898A8  #8098A8                     ← highlight snow (still not white)
```

Note there is **no value above `#8098A8`** in a snow scene. Snow at night tops out
at 57 % luminance. Restraint like that is what makes it read as night.

### 5c. Emberworks — fire / magitek, `ffvi-battle-castle.png`

A **34-color scene**, one third of which is a single red. Fire is built by holding
red at max and walking green up, with blue pinned at zero the whole way.

```
#181818  #E00800  #E80800  #F00800  #F81000   ← deep body of the flame
#E82800  #F82000  #F82800  #F83000  #F83800   ← mid
#F84000  #F84800  #F85000  #F86800  #F87020   ← rising
#F89040  #E8A828  #F8B868  #F0D868            ← the hot core / sparks
```

The rule: `R = 0xF8` fixed, `G` climbs `0x08 → 0xD8`, `B` stays `0x00` until the
very hottest steps. Fire never goes through orange-grey.

### 5d. Deepstone — cavern, `ffvi-battle-esper.png`

30 colors total for an entire cave. Cool teal-black shadows, warm-grey stone,
desaturated blue-grey floor. The mineral/organic split is done with **temperature**,
not hue.

```
#080808  #081010  #181818  #102828  #203838   ← void, deep shadow (teal-black)
#504848  #405050  #707068                     ← stone body (warm grey)
#888088  #507078  #588088                     ← lit stone
#7090A0  #7898A8  #8098A8                     ← floor / ambient
accents   #98D048 (moss)  #784028 (rust)  #585088 (crystal)
```

### 5e. Nightlands — dusk overworld, `ffvi-field-village.png`

62 % of this frame is two blues. This is how you make a huge scene feel like one
place: pick two ground colors, commit, and spend the remaining budget on accents.

```
#002010  #102048  #102860  #203870  #385880  #587090   ← water / night blue
#203010  #204010  #304828  #285828  #386040  #586848   ← foliage green
#302818  #303818  #787050                              ← earth / roof
#708090  #98A0A8                                       ← moonlit stone (2 steps only)
```

### 5f. Ashfield — battle ground, `ffvi-battle-native-a.png`

The battle-arena ground palette. Note it is genuinely warm — battle backgrounds
carry the mood, the sprites stay neutral.

```
#101008  #181818  #182818  #303820  #483028   ← shadow
#503820  #504030  #584020  #604040  #684828   ← ground body
#705030  #906060  #907078  #B07058            ← lit ground
#B08080  #C08860  #B098A8  #C8A090            ← dust, sky haze, distant rim
```

---

## 6. Animation

FFVI's animation budget was tiny and it looks great anyway. This matters enormously
for us because an idle game runs unattended — we should be leaning on the same
tricks. **[convention throughout this section; frame counts are the established
convention for the era rather than something I could measure from stills.]**

### Field / walk cycle

- **3 frames per direction**, played as a ping-pong: `neutral → step-L → neutral →
  step-R`. Four directions. **12 sprites total** covers all locomotion.
- The step frames differ from neutral by ~2px: one leg forward, the body bobs down
  1px, the hair/cape lags 1px behind. That is the whole animation.
- Total per-character field sheet: ~30 poses, of which only 12 are walking. The rest
  are one-off story poses (kneel, victory, hurt, sleep, raise-item, dead).

### Battle

- Character battle poses: **~14 single-frame poses** per character — idle, ready
  stance, critical-HP stance, attack windup, attack strike, cast, use-item, hurt,
  victory, dead, jump, and a few specials.
- **The idle is one frame.** Characters do not breathe. Life comes from the ATB
  gauge moving and from the background scrolling.
- **The critical-HP idle is a different single pose** (kneeling), which is why low
  HP reads instantly across the whole party without any UI element saying so.
  Steal this: state changes are communicated by *swapping the whole sprite*, not by
  overlaying an icon.
- **Monsters are almost entirely static single frames.** They animate by:
  - translating toward the target and back (an "attack lunge"),
  - **palette cycling** — rotating a few slots in the sprite's 15-color palette to
    make fire flicker, water flow, or eyes pulse, at zero sprite cost,
  - flashing (whole-sprite fill with white or the element color for 2–4 frames),
  - horizontal flip.

  This is the highest-leverage lesson in this document. **Budget zero idle frames
  for monsters and spend everything on palette cycling + transforms.** A monster
  built as one 88×64 sprite with a 4-slot cycling ramp is more alive than one with
  a mediocre 4-frame loop, and costs 1/4 the art.

### Effects

- Spells are **full-screen or large overlay sequences**, not per-sprite animations —
  a summon covers the whole battlefield.
- Heavy use of **screen flash** (whole framebuffer to white/color for 2–4 frames)
  and **screen shake** (offset the entire rendered frame by 1–3px for ~8 frames).
  Both are free and both feel enormously impactful. Use them constantly.
- **Palette-only "status tints":** poison tints the whole sprite green, sleep
  desaturates it, haste cycles a rim. Again — no new art.

---

## 7. Reproducing this in a mobile browser

### Integer scaling — the hard constraint

Target viewport is **390 × 844 CSS px**. Fractional scaling of pixel art is the one
unforgivable sin, so pick a stage size whose integer multiples land inside 390.

**384 CSS px is the magic content width.** It is 6px short of 390 and divides
cleanly:

| Stage width | Scale | Rendered |
|---|---|---|
| 192 px | ×2 | 384 |
| 128 px | ×3 | 384 |
| 96 px | ×4 | 384 |

**Recommended battle stage: `192 × 168` at ×2 → `384 × 336` CSS px.** 192:168 is
exactly 8:7 — FFVI's true aspect ratio — so the composition rules in §4 transfer
directly with every measurement scaled by 0.75.

If you want the authentic 256×224 framebuffer instead, it only fits at ×1 (256 CSS
px, leaving 134px of dead margin) — don't. Design at 192×168 natively.

```css
.pixel-stage {
  width: 384px; height: 336px;
  image-rendering: pixelated;          /* + -moz-crisp-edges for old FF */
  transform: translateZ(0);            /* avoid subpixel compositing */
}
.pixel-stage canvas { width: 100%; height: 100%; }  /* backing store 192×168 */
```

On a DPR-3 phone, 384 CSS px → 1152 device px, an exact ×3 of the CSS layer and ×6
of the 192px stage. Every step stays integer. **Never place the stage at a
fractional CSS offset** — a `left: 3.5px` re-introduces subpixel sampling and
undoes all of it. Round every position to whole CSS pixels, and prefer even
positions.

### Where FFVI ends and `ui-bar.md` begins

This is the seam the critic will attack, so decide it explicitly:

| Layer | Rules |
|---|---|
| **Pixel content** — sprites, monsters, battle stage, item icons, portraits | 5-bit color, 8px grid, integer scale, `pixelated`, hard 1px shadows, no CSS effects of any kind |
| **Chrome** — panels, buttons, currency bar, nav, typography, progress bars | `ui-bar.md` rules: `#050A10` ground, gold + violet, full-resolution vector, gradients and bevels allowed |

Two things must never blur across that line:

1. **No chrome effect touches a pixel.** No `box-shadow`, `filter`, `border-radius`,
   or `opacity` on or over the pixel stage. If you want the pixel art to glow, bake
   the glow *into the pixels* at 5-bit precision.
2. **No pixel art in the chrome.** Nav icons, currency icons, and buttons are
   crisp vector at device resolution. A pixel-art nav icon next to a
   high-DPI gold bevel looks like a bug, not a style.

The **frame** is where they meet, and it should be an explicit, designed object: a
gold-beveled bezel from `ui-bar.md` with a hard 1px inner edge, and the pixel stage
sitting inside it flush at an integer offset. Think of it as a cabinet with a
screen in it — that framing is what makes the two resolutions read as intentional
instead of accidental.

### The palette bridge

Our chrome is **gold + violet**; FFVI's UI is **blue + cyan/yellow**. Do not use
FFVI's window blue for our panels — that fight is unwinnable and it would also be
the most literally-copied thing in the project. Instead, port the *structure*:

- Keep FFVI's **gradient-down-the-window** idea, but run it in our navy
  (`#13171B` → `#0A0D10`) instead of blue.
- Keep the **4px lit rail** with a chamfered corner, but render it in the measured
  gold ramp `#F8DCA2 → #D7A747 → #B08539` instead of silver, light still upper-left.
- Keep **exactly two text accents**, but map cyan→gold (`#D7A747`, labels and
  headers) and yellow→violet-light (`#B394D8`, "this one is ready / active").
- Keep the **ATB capsule geometry verbatim** — 40×7 with a 3-row fill and a
  transparent empty track — recolored to the gold ramp. It is the single best piece
  of UI in FFVI and its proportions are why. For our idle loop, this is the shape
  every action timer should take.

Then, inside the pixel stage, our sprite and scene palettes get built with the §2
rules and the §5 ramps as structural templates — 3-step ramps, hue-shifted shadows,
median 5 colors per tile, dithering under 4 %, everything on the /8 grid.

---

## 8. Ten-item checklist for a critic

1. Is every color in the pixel layer a multiple of 8 per channel?
2. Is the pixel stage at an **integer** scale, at an **integer** offset?
3. Do sprites sit on the 8px grid at 16×24 (or 24×32 for actions)?
4. Are ramps **3 steps**, with shadows hue-shifted rather than just darkened?
5. Is dithering under ~4 % of pixels?
6. Are outlines tinted toward the scene, never `#000000`?
7. Does text have a hard 1px (+1,+1) black shadow and **2px stems**?
8. Are there exactly **two** accent colors in the UI?
9. Does the window/panel border read as a 4px lit rail with chamfered corners,
   lit from the upper-left, rather than a 1px stroke with `border-radius`?
10. Is anything in the pixel layer using CSS `filter`, `opacity`, `box-shadow`, or a
    gradient? (Answer must be no.)

---

## 9. Files on disk

All in `reference/shots/`, all real captures, all lossless PNG at native or
overscan-cropped resolution. Fandom re-encodes to WebP unless you send
`Accept: image/png` and `?format=original` — these were fetched with both, verified
with `file(1)`, and confirmed to be on the 5-bit color grid.

**Battle** (composition, ATB gauge, party/command windows)
`ffvi-battle-native-a.png` 240×211 · `ffvi-battle-native-b.png` 240×211 ·
`ffvi-battle-native-c.png` 240×211 · `ffvi-battle-spellcast.png` 240×211 ·
`ffvi-battle-melee.png` 240×211

**Menus** (window rail, gradient, font, cyan/yellow accents)
`ffvi-menu-main.png` · `ffvi-menu-status.png` · `ffvi-menu-equip.png` ·
`ffvi-menu-item.png` · `ffvi-menu-skills.png` · `ffvi-menu-relic.png` ·
`ffvi-menu-order.png` · `ffvi-menu-save.png` · `ffvi-menu-config.png` — all 256×224

**Field & backgrounds** (tile palettes, sprite scale in world)
`ffvi-battle-esper.png` 240×208 (cave, best sprite-scale reference) ·
`ffvi-field-port-town.png` 240×223 · `ffvi-field-village.png` 240×223 ·
`ffvi-bg-snow-town.png` 240×208 · `ffvi-bg-tower.png` 240×208 ·
`ffvi-battle-bg-city.png` 240×147 · `ffvi-battle-castle.png` 240×208 ·
`ffvi-battle-snowfield.png` 256×223 · `ffvi-gameover.png` 240×211 ·
`ffvi-title.png` 256×224
