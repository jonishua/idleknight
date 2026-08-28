# Parity Status — Emberveil vs. Melvor Idle base game

Measured 28 Aug 2026 against `reference/melvor-parity.md`, which is the bar.
Every row below was checked by opening the screen at 390x844 and reading it —
`node tools/walk.mjs` reproduces the whole pass and writes
`progress/shots/parity-*.png`.

**Legend.** ✅ match · 🟡 partial (present, but something the bar lists is
missing or faked) · ❌ missing.

**Verdict in one line: 25 / 25 base-game skills present and wired, 28 / 28
screens render clean, and the three gaps that matter are the combat triangle,
Alchemy's potion economics, and the Settlement's depth.**

## Gate status

| Gate | Command | Result |
|---|---|---|
| Engine selftest | see README | **146 / 146** |
| Artisan wing | `node tools/check-artisan.mjs` | clean |
| Passive wing | `node tools/check-passive.mjs` | 63 / 63 |
| Exotic wing | `node tools/check-exotic.mjs` | 100 / 100 |
| Meta screens | `node tools/check-meta.mjs` | 100 / 100 |
| Screen walk | `node tools/walk.mjs` | 28 / 28 clean |
| Toolchain | `npm run verify` | 25 / 25 |

---

## 1. Navigation (§1)

| Bar | Ours | |
|---|---|---|
| Shop, showing GP | Shop tab, showing Cogs / Aether Shards / Warden Seals | ✅ |
| Bank, showing slots | Bank tab, showing `Space: 237 / 277` | ✅ |
| COMBAT / PASSIVE / NON-COMBAT blocks | the same three, in the bar's order | ✅ |
| `Combat Level 96` above the block | `Combat Level N`, derived from the eight | ✅ |
| every skill shows `(current / 99)` | every skill shows `N / 99` | ✅ |
| Hitpoints shows HP, Prayer shows points, Slayer shows coins | Vitality shows HP, Devotion shows points, Bounties shows marks | ✅ |
| **the eight combat skills are NOT pages** | all eight route to the one Combat screen | ✅ |
| OTHER: Completion Log, Statistics, Settings, Game Guide | all four, under the "Other" tab | ✅ |
| OTHER: Golbin Raid, Lore, News & Changelog | — | ❌ (out of scope: a raid mode, a lore codex and a changelog are content, not systems) |

The bar's menu order is reproduced in `src/data/skills/index.js`, so the menu
is a walk of the registry rather than a second hand-sorted list.

Deep links: `index.html#combat`, `#skills/delving`, `#other/stats`. Every screen
is URL-addressable, which is how the walk reaches all 28.

## 2. The universal skill header (§2)

| Bar | Ours | |
|---|---|---|
| `<Skill name>` + Game Guide | ✅ | ✅ |
| `Last Cloud Save : 0h 3m 9s` + Force Save + character name | ✅, live | ✅ |
| `Skill Level 99 / 99` | ✅ | ✅ |
| `Skill XP 581,032 / 605,032` | ✅, same two forms (pair below cap, total at cap) | ✅ |
| mastery pool bar with cap and % | ✅ | ✅ |
| View Checkpoints / Spend Mastery Pool XP | ✅, both open working sheets | ✅ |
| per-skill pool cap that scales with action count | ✅ — `500,000 x recipes`; Cooking 10M, Mining 5M, Farming 12M | ✅ |

## 3. Screen archetypes

| § | Screen | Status | Notes |
|---|---|---|---|
| 3a | **Gathering** — Woodcutting, Fishing, Mining | ✅ | Flat action list, `7 Skill XP / 3.56s`, mastery level + XP pair, a Current Pick/Axe/Rod tool indicator and the live action-status line. Node HP and respawn are modelled, so a rung's action time is not its swing interval. |
| 3b | **Artisan** — Firemaking, Smithing, Cooking, Bowcraft, Crafting, Enchanting, Alchemy, Transmutation | ✅ | Category selector, Requires / You Have / Produces / Grants, preserve + double percentages, per-recipe mastery, live interval. Eight artisan skills against the bar's six. |
| 3b | **Cooking's three stations** | ✅ | Cooking Fire / Furnace / Pot, each with its own selected recipe, an Active Cook and a 5x-interval Passive Cook filling a Stockpile you collect from, plus Perfect Cooks. Passive-cook determinism is asserted event-jump vs tick-by-tick. |
| 3c | **Farming** | 🟡 | Three categories (Allotments / Herbs / Trees), a plot grid with growth state, compost raising grow chance from 50% toward 100%, and the bulk actions with Cog costs. **One compost material, not two**: the bar has a second, stronger tier and ours has a single material applied up to five times at +10% each. Same curve, one fewer decision. |
| 3d | **Township → Settlement** | 🟡 | The one-time Worship choice and a building screen that ticks passively are both there. **Thin against the bar**: the reference's Township is one of its largest screens and ours is a compact resource loop. It is the shallowest of the 25. |
| 3e | **Astrology** | ✅ | Constellations with Study and Explore, rollable modifier percentages, a fixed action interval, level-gated unlocks, and View All Active Modifiers. |
| 3f | **Summoning** | ✅ | Marks discovery counter, the first-tablet rule, equipped-doubles-mark-rate, Create Familiar Tablets, and Synergies between pairs. **Fixed this round**: combat now fires `afterCombatAction`, so an hour of fighting consumes 3,026 tablets against the 8,349 the endgame craft makes (0.362x) and drops marks — before this it consumed and dropped exactly zero. |
| 3g | **Agility** | ✅ | Eight-slot course builder, three level-gated designs per slot, trade-off passives, Start/Stop, Load/Save Blueprint, course time total, and View All Global Active Passives. |
| 3h | **Thieving → Larceny** | ✅ | NPC targets grouped by area, Perception, Success Rate, Maximum Hit, level gates, the shared HP bar and food, 3s stun on failure, and Continue on Stun. |
| 3i | **Alt. Magic → Transmutation** | ✅ | Item selection, rune costs with You Have, Produces, Grants, a combination-rune toggle, Cast, and a level-gated spell list. |
| 3j | **Combat** | 🟡 | Area select, player HP + devotion points + attack interval, food with a dropdown, equipment and sets, attack style, enemy panel, offensive stats, defensive stats, and the loot container with Loot All / Destroy Loot. **The combat triangle is missing** — see below. |
| 3k | **Bank** | ✅ | Sort, Move items to new Tab, Toggle Sell Mode, `Space: 237 / 277`, Bank and Tab totals, the item grid with stack counts and unit prices, tabs behind Reliquary Wings, and a detail pane. Every printed price is asserted equal to what the sale pays. |
| 3l | **Shop** | ✅ | Category selector, quantity selector, name / effect / level requirement / cost. **Fixed this round**: the row printed the UNIT price beside a button reading "Buy x25" — 27 Cogs printed against 35,814 charged. It now prints the total for the selected quantity with the unit price demoted, and asks before any purchase over 10x the unit. Asserted in `check-meta`. |
| 3m | **Completion Log** | ✅ | True Completion over five axes (Skills / Mastery / Items / Monsters / Wardens, where the bar's fifth axis is Pets), item counts and the three filters. |
| 3n | **Statistics** | ✅ | Category selector and the STATISTIC / # table; Total Skill Level, Total XP, Total Mastery Level and Total Mastery XP are each asserted against an independent engine read. |
| — | **Settings** | ✅ | Save, offline, number format, export/reset. Not a §3 archetype; the bar lists it under OTHER. |
| — | **Equipment / loadout** | ✅ | Slots, stat totals, multiple sets. §3j puts it on the Combat screen and so do we. |

## 4. The 25 skills

All 25 are present, wired to the tick engine, and reachable from the menu.

| Melvor | Ours | Screen | Actions |
|---|---|---|---|
| Attack, Strength, Defence, Ranged, Magic | unchanged | Combat | levels, not pages |
| Hitpoints | **Vitality** | Combat | 0.133 XP per damage |
| Prayer | **Devotion** | Combat | relics → points + XP |
| Slayer | **Bounties** | Combat | contracts → Bounty Marks |
| Farming | Farming | Farming | 24 crops |
| Township | **Settlement** | Settlement | passive tick |
| Woodcutting | Woodcutting | Gathering | 9 |
| Fishing | Fishing | Gathering | 8 |
| Firemaking | Firemaking | Artisan | 9 |
| Cooking | Cooking | Artisan (3 stations) | 20 |
| Mining | Mining | Gathering | 10 |
| Smithing | Smithing | Artisan | 10 |
| Thieving | **Larceny** | Larceny | 13 |
| Fletching | **Bowcraft** | Artisan | 15 |
| Crafting | Crafting | Artisan | 17 |
| Runecrafting | **Enchanting** | Artisan | 8 |
| Herblore | **Alchemy** | Artisan | 14 |
| Agility | Agility | Course builder | 24 |
| Summoning | Summoning | Summoning | 20 |
| Astrology | Astrology | Astrology | 16 |
| Alt. Magic | **Transmutation** | Artisan | 13 |
| — | *Exploration* | Route | 8 — ours, no Melvor counterpart |

**26 skills, 238 actions, 237 items, 17 monsters, 110 shop entries.**

Internal ids are still the pre-rename invented words (`delving`, `boughcraft`,
`trawling`, `emberrite`, `kilnwork`, `hearthcraft`, `sigilwork`, `wayfaring`).
Every *display* name is generic RPG vocabulary as §9 of `melvor-math.md`
requires, and the selftest scans every shipped string against the banned list.

---

## The three things still missing

### 1. The combat triangle — Ranged and Magic are XP bars, not weapon skills

`combatStats()` in `src/js/engine/combat.js:183` returns a single scalar
`evasion`, and every monster in `src/data/monsters.js` carries a single
`evasion` field. There is no damage type on a monster, no per-type evasion on
either side, and `hitChance()` has nothing to choose between.

The consequence is that two of the eight combat skills are decoration.
Choosing "Accurate" over "Stab" applies a percentage; it does not put a bow in
your hand. The relic ladder in `src/data/shop/` is one nine-rung melee line, so
there is no bow line and no staff line to hold. And there are **zero
magic-gated equipment items** in `src/data/items/combat.js`.

Fixed this round only in that the screen stopped lying about it: it printed
`Melee Evasion / Ranged Evasion / Magic Evasion` against the same number three
times, which told the player a triangle existed. It now prints one honest
`Evasion Rating`.

To close it: `damageType` + three evasions on every monster, a `{ meleeEvasion,
rangedEvasion, magicEvasion }` return from `combatStats()`, `hitChance()`
reading the evasion matching the attacker's type, the relic ladder split into
three parallel lines with their own base intervals, and magic-gated armour.

### 2. Alchemy — a potion still costs more play-time than it returns

Measured through the sandbox at the mastered profile, input seconds against
dose seconds:

| Potion | to make | dose lasts | ratio |
|---|---|---|---|
| Vigour Potion | 145 s | 300 s | 0.48x |
| Keen Edge Potion | 285 s | 300 s | 0.95x |
| Greater Vigour Potion | 1,023 s | 480 s | 2.13x |
| Greater Thrift Potion | 3,425 s | 600 s | 5.71x |
| Warden's Draught | 2,537 s | 300 s | 8.46x |

Ten of the twelve are above 1.0x, and the ratio above is generous — it compares
raw seconds, where the honest comparison is against `dose seconds x effect
size`, which pushes Greater Vigour from 2.13x to roughly 24x. Two rungs are
worth brewing; ten are not. This is much better than the 10x–98x the previous
round measured, and it is not yet at the "under 1.0x on every row" bar.

To close it: multi-dose batches, 1–2 herbs a brew, and a fourth asserted block
in `tools/check-artisan.mjs` that fails the build on any ratio above 1.0x —
because R5 prices a potion by what it *sells* for and will keep certifying a
negative shelf green until something measures the effect.

### 3. The Settlement is the shallowest of the 25

§3d's Township is one of the reference's largest screens. Ours has the parts
the bar names — the one-time Worship choice, a building screen, a passive tick
— and stops there. It is the only screen where "partial" means "thin" rather
than "one feature short".

---

## Known cosmetic notes

- The topbar floats over the scrolling screen so the key art can run under it
  edge to edge. It now earns a scrim once scrolled (`#app.is-scrolled`), which
  fixed panel text reading through the Cogs chip on every screen.
- A skill page no longer draws the shell's progress panel and axis cards: §2's
  header repeats every number in them, and the duplicate cost 220px of an
  844px phone. Screens opt out via `chrome(ctx)` in the screen contract.
- `.row-card__sub` was an inline span, so its `text-overflow: ellipsis` was
  inert and a long sub-line widened its flex parent past 390px. Alchemy's
  potion shelf was the one that showed it, at 444px.
