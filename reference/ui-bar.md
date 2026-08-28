# The UI Bar — `reference/shots/ui-bar.png`

**The real screenshot IS on disk at `reference/shots/ui-bar.png` (1008×1792).**
Open it. Compare against it directly. This document is a companion, not a
substitute — every hex below was **sampled programmatically from that PNG**, so the
numbers are measured, not eyeballed.

It is a portrait mobile idle-RPG home screen at premium production quality. Match
its polish, palette discipline, and layout rhythm. Ignore its words, characters,
and logo — we copy craft, never content.

---

## Overall impression

Roughly 9:16 portrait. Reads as expensive, dark, and restrained. **Two accents
only** — metallic gold and violet — over a near-black cool ground. Nothing is
bright; nothing is flat grey. Gold and violet are the only saturated things on the
screen, which is exactly why they land.

Vertical rhythm, top to bottom:
1. Currency bar (pinned, ~5%)
2. Full-bleed hero art with overlaid title block (~40%)
3. Stack of dark panels (~45%)
4. Bottom navigation (~8%)

## Palette (measured)

| Role | Hex | Notes |
|---|---|---|
| Page ground | `#050A10` | near-black with a cool blue bias — **darker than it looks** |
| Panel surface | `#13171B` | the panels sit only ~14 values above the ground |
| Panel divider | `#0E1318` | **darker than the panel** — dividers are cut lines, not highlights |
| Nav active bg | `#191917` | subtly *warm* dark, not cool like everything else |
| Gold light | `#F8DCA2` | top of gradients, numeral highlight |
| Gold core | `#D7A747` | the gold you'd name; progress bar fill |
| Gold mid | `#CEA042` | bar fill body |
| Gold deep | `#B08539` | button face, gradient bottom, bevel shadow |
| Violet light | `#B394D8` | the rarity word |
| Violet bright | `#7E34E2` | crystal glow, rim light |
| Violet core | `#763CC3` | the violet progress bar |
| Violet deep | `#44169E` | gradient bottom, crystal core |
| Text primary | `#FFFFFF` | values and numbers, genuinely pure white |
| Text secondary | `#C4C8CA` | **light warm-grey, NOT a muted blue-grey** |
| Nav active label | `#FFFECD` | faint cream tint, pairs with the warm active bg |

### Three corrections worth internalizing

These are the places intuition gets it wrong, and they're exactly what a critic
will catch:

1. **Secondary labels are light (`#C4C8CA`), not dim.** The instinct is to mute
   labels to ~40% grey. This screen doesn't — labels stay highly legible and the
   hierarchy is carried by *size and letter-spacing* instead of by fading things
   out. Muted labels are the single fastest way to look cheap here.
2. **Dividers are darker than their panel, not lighter.** There is no lighter 1px
   hairline. Separation is done by cutting a darker groove (`#0E1318` inside a
   `#13171B` panel). Panel edges are near-invisible; the panel reads as a surface
   because of the value shift from the ground, not because of an outline.
3. **The empty progress-bar track is the same value as the panel** (`#13171B`).
   The track isn't a darker well — the gold fill is simply painted onto the panel.

## Typography

- **Display serif** — logo, big numeral, `KNIGHT LEVEL`. High-contrast Trajan /
  Cinzel family, uppercase, letter-spaced ~0.08–0.15em at small sizes. The numeral
  is enormous — ~130px on a 1008px-wide screen — gold with a vertical gradient from
  `#F8DCA2` down through `#BD9142`.
- **Uppercase label sans** — small (~11–13px), letter-spaced ~0.1em, `#C4C8CA`.
- **Value sans** — bold, pure white, tabular figures so digits align in columns.

## Component anatomy

**Currency chips.** Pill-shaped, translucent dark fill: icon + value + a circular
`+` with a thin outline. Three of them (coin, gem, energy-with-fraction). Icons are
small rendered 3D-ish objects, not flat glyphs.

**Hero block.** Full-bleed painterly art, darkened by a vertical scrim toward the
bottom so text stays legible. Centered over it: gold emblem → letter-spaced gold
serif label → giant numeral → violet rarity word → **a thin rule interrupted by a
small diamond ornament at its center** → status line with a small gold dot. That
diamond is the kind of micro-detail that separates premium from generic.

**Panels.** ~16px rounded corners, `#13171B` fill, generous inner padding (~20px),
internal structure expressed with darker groove dividers rather than nested boxes.

**Progress bars.** ~10px tall, fully rounded caps, gold gradient fill on the panel
color. The percentage sits to the right of the label row, never inside the bar. A
violet variant (`#763CC3`) marks the upgrade axis.

**Action cards (row of three).** Equal-width grid, ~12px gaps. Icon, colored
uppercase title, muted subtitle, mini progress bar, right-aligned percentage. Icon
color matches that card's axis (gold or violet).

**Primary button.** Gold gradient (`#F8DCA2` → `#B08539`), **chamfered corners**
rather than rounded, an inner bevel line, dark serif uppercase text. Reads as a
physical pressed-metal plate. The only high-saturation element in its panel.

**Bottom nav.** Five items, icon above uppercase letter-spaced label. Active gets
the warm raised background (`#191917`), a gold icon, and a cream label; inactive
are silver-grey.

## What actually makes it read as premium

1. **Palette discipline** — two accents; everything else is one hue at different values.
2. **Beveled metal, not flat color** — gold always has gradient + highlight + shadow.
3. **A consistent spacing scale** — gaps repeat at 12/16/20px; nothing is off-grid.
4. **Hierarchy by size, not by fading** — one enormous number anchors the screen.
5. **Ornamental micro-detail** — diamond divider, chamfered corners, tiny clock glyph.
6. **Depth without noise** — value shifts imply layering. No drop shadows, no
   glassmorphism, no gratuitous glow.

## Our synthesis (the hard part)

This chrome has to wrap **SNES-era pixel art content**. Reconcile the two
deliberately: crisp integer-scaled pixel art for sprites, monsters, items, and
battle scenes (`image-rendering: pixelated`, ×3 or ×4, **never fractional**),
framed inside this high-DPI gold-and-violet cabinet. The pixel art is the content;
this is the case it sits in. The seam where a 16-bit sprite meets a 2026 mobile UI
is the hardest visual problem in the project and the first thing a critic should
attack.

Real FFVI screenshots for the pixel-art half of the bar are in
`reference/shots/ffvi-*.png`.
