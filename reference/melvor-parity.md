# The Parity Bar — Melvor Idle v1.3.1, base game only

Captured live on 27 Aug 2026 from a real save (character "CLOUD", 1,165 total
level, 127.6M total XP, 4-year-old account) by walking every screen in the game's
own navigation. This document, not the wiki, is the bar: it records what each
screen actually *contains*.

**Scope: BASE GAME ONLY.** Excluded as expansion content — Corruption (ItA),
Cartography + Archaeology (AoD), Harvesting (ItA), Ancient Relics, Skill Trees,
the Abyssal Realm and the Realm selector.

---

## 1. Navigation — the complete menu

```
Shop                     (shows GP)
Bank                     (shows 111 / 130 slots)

COMBAT
  Combat Level 96
  Attack, Strength, Defence, Hitpoints(800), Ranged, Magic,
  Prayer (shows prayer points), Slayer (shows slayer coins)

PASSIVE
  Farming, Township

NON-COMBAT
  Woodcutting, Fishing, Firemaking, Cooking, Mining, Smithing, Thieving,
  Fletching, Crafting, Runecrafting, Herblore, Agility, Summoning,
  Astrology, Alt. Magic

OTHER
  Golbin Raid, Completion Log (Skills / Mastery / Items / Monsters / Pets),
  Lore, Statistics, Settings, News & Changelog, Game Guide
```

**25 base-game skills**: 8 combat + 2 passive + 15 non-combat.
Every skill shows `(current / 99)` in the menu.

**Critical finding:** Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer
and Slayer are **not separate screens**. All eight route to the single Combat
screen. They are levels and stat contributions, not pages.

---

## 2. The universal skill-page header

Every non-combat skill page opens with exactly this block:

```
<Skill name>            Game Guide
Last Cloud Save : 0h 3m 9s   [Force Save]   CLOUD
Skill Level      99 / 99
Skill XP         23,743,761        (or "581,032 / 605,032" when not capped)
<mastery pool bar>  15,500,000 / 15,500,000 (100.00%) XP
[View Checkpoints]  [Spend Mastery Pool XP]
```

The mastery pool cap is per-skill and large (Woodcutting 4.5M, Cooking 15.5M,
Smithing 57.5M, Runecrafting 42M, Agility 25.5M, Farming 12M, Summoning 10M,
Astrology 5.5M, Thieving 11.5M) — it scales with the number of actions in the skill.

---

## 3. Screen archetypes

### 3a. Gathering (Woodcutting, Fishing, Mining)
A flat list of actions. Each row:
`[Cut] <Normal Tree>  |  10 Skill XP / 1.8 seconds  |  <mastery lvl 41>  |  45,131 / 45,529`
Plus a "Current Axe" / tool indicator and a live action-status line
("Information about your cutting actions will display here").
Woodcutting ladder: Normal, Oak, Willow, Teak, Maple, Mahogany, Yew, Magic, Redwood.

### 3b. Artisan (Smithing, Cooking, Fletching, Crafting, Runecrafting, Herblore)
```
Select <Skill> Category        <owned count of selected output>
[Create]  <Dragonite Bar>   50% preserve  45% double   mastery 99   54,627,423
Requires:  1 x, 2 x, 12 x        You Have: 132K, 59,973, 2
Produces:  1 x
Grants:    60 xp, 1065 mastery, 532 pool
[Create]   2.00s
--- recipe list with per-recipe mastery levels ---
Bronze Bar 11 | Iron Bar 1 | Steel Bar 12 | Silver Bar 1 | Gold Bar 1 |
Mithril Bar 14 | Adamantite Bar 16 | Runite Bar 18 | Dragonite Bar 12
```
**Cooking is the richest artisan:** three independent stations (Magic Cooking
Fire, Magic Furnace, Magic Pot), each with its own selected recipe, an
**Active Cook** (11.00s) and a **Passive Cook** (55.00s) that fills a
**Stockpile** you "Collect from", plus an "Enable Perfect Cooks?" toggle and
per-recipe bonus percentages (preserve / double / perfect / success).

### 3c. Farming (passive)
Three categories — **Allotments** (food), **Herbs** (potion ingredients),
**Trees** (skill XP). A grid of plots, each showing crop, growth state,
`Compost Applied: No Compost`, `Chance to grow: 100%`, and a Harvest button.
Bulk actions with GP costs: `Harvest All: 2,000`, `Apply Compost to all Plots:
2,000`, `Apply Weird Gloop to all Plots: 2,000`, `Plant All: 5,000`,
`Plant All Selected Crops: 5,000`. Compost has tiers (Compost, Weird Gloop) and
raises grow chance from 50% toward 100%.

### 3d. Township (passive)
Opens on a one-time **Worship** choice: None, Aeris, Glacia, Terran, Ragnar,
Bane — changeable later for 50M. Then a town-building screen with Toggle Info /
Toggle Resources. Ticks passively in the background.

### 3e. Astrology
Constellations, each with **Study** and **Explore** actions, a set of rollable
modifier percentages (5.00% / 2.00% / 0%), a 3.00s action interval, and
level-gated unlocks. "View All Active Modifiers".

### 3f. Summoning
**Marks discovery** — 31 / 61 marks found. Marks drop while training the
associated skill; the first mark must be converted into a tablet before more of
that mark can drop, and having the familiar equipped doubles its mark rate.
Categories, "Create Familiar Tablets", and Synergies between familiar pairs.

### 3g. Agility
A **course builder**: Obstacle 1, Obstacle 2 (Requires Level 10), … each chosen
from level-gated options that grant global passives with trade-off penalties.
`Start Agility` / `Stop Agility`, `Load Blueprint` / `Save Blueprint`, a course
time total, and "View all Global Active Passives from Agility".

### 3h. Thieving
NPC targets grouped by area (Low Town, Golbin Village, Bandit Hideout, Farmer's
Market, Banquet, Port of Lemvor, Cave of Giants, Outskirts, Fort …), each with
`Perception`, `Success Rate: 49.05%`, `Maximum Hit: 22`, and a level requirement.
Carries the combat HP bar + food, because failure stuns and damages you.
Toggle: "Continue Thieving on Stun".

### 3i. Alt. Magic
Non-combat spellcasting that still trains Magic. "Click Image to Choose Item",
rune costs (`Requires: 1 x, 1 x and: 1 x` / `You Have:`), `Produces`, `Grants`,
`Use Combination Runes` toggle, `Cast`, 2.00s, level-gated spell list.

### 3j. Combat (all 8 combat skills land here)
```
Select Combat Area
Player container:  800/800 HP | 320 prayer points | Attack Interval: 2.40s
Food: (6,579) +686 HP  [dropdown]  "Hold down the Eat button to keep eating."
Menu (row of skill shortcuts)
Equipment: View Equipment Stats | Change Equipment Set (12 sets) | slots
Attack Style: Stab / Slash / Block
Enemy panel: Attack Interval, HP, "No Monster Selected", View Monster Drops,
             Run / Area Select
Offensive Stats: Damage Type, Attack Type, Min Hit 1, Max Hit 118,
                 Chance to Hit, Accuracy Rating
Defensive Stats: 3x Evasion, Damage Reduction 0%, Pure Resistance 0%
Loot to Collect ( 0 / 100 )  [Loot All]  [Destroy Loot]
```

### 3k. Bank
`Sort` | `Move items to new Tab` | `Toggle Sell Mode`
`Space: 111 / 130` | `Bank: 98M GP` | `Tab: 65M GP`
Item grid with stack counts, multiple tabs, and a detail pane
("No item selected.").

### 3l. Shop
`Select Shop Category` (General Upgrades, …), a `Buy x1` quantity selector, and
entries showing name, effect text, level requirement and cost. Real examples:
`1 x Extra Bank Slot / +1 Maximum Bank Space / 3,566K`,
`Extra Bank Tab / 100M`, `Extra Equipment Set / 300K`,
`Dungeon Equipment Swapping / 30M`, `Cooking Upgrade 1 / Requires Level 80 / 10M`,
`Loot Container Stacking`.

### 3m. Completion Log
```
True Completion 25.66%
  Skills 49.03% | Mastery 12.58% | Items 24.67% | Monsters 22.36% | Pets 19.64%
Total Items Found: 316 / 1,281 (24.67%)
[Show All] [Show Discovered Items] [Show Undiscovered Items]
```

### 3n. Statistics
`Select Stats Category` (General, …) then a two-column STATISTIC / # table:
Total Skill Level 1,165 · Total XP 127,615,068 · Total Mastery Level 6,911 ·
Total Mastery XP 345,442,813 · Total GP Gained 152,037,627 ·
Total Items Sold 438,865 · Account Age.

---

## 4. Where Emberveil stands

| Melvor (base) | Emberveil today | Gap |
|---|---|---|
| Mining, Woodcutting, Fishing, Firemaking, Smithing, Cooking | present | tune content depth |
| Runecrafting | Enchanting | present |
| Thieving | Exploration (route skill) | needs rework to NPC/stun model |
| Hitpoints | Vitality | present |
| Attack, Strength, Defence, Ranged, Magic | one "Combat" skill | **split into 5** |
| Prayer, Slayer | — | **missing** |
| Farming, Township | — | **missing** |
| Fletching, Crafting, Herblore | — | **missing** |
| Agility, Summoning, Astrology, Alt. Magic | — | **missing** |

**8 of 25 skills present.** Missing screens: Completion Log, Statistics,
Settings, Equipment/loadout, Combat area & dungeon select, mastery checkpoint UI,
bank tabs + sell mode, shop categories.

## 5. Naming policy for the new skills

Generic where a generic word exists; invent only where Melvor's term is a
RuneScape coinage (see §9 of melvor-math.md):

| Melvor | Ours |
|---|---|
| Attack, Strength, Defence, Ranged, Magic, Crafting, Farming, Agility, Summoning, Astrology, Thieving | unchanged — all generic |
| Hitpoints | Vitality |
| Prayer | **Devotion** |
| Slayer | **Bounties** |
| Fletching | **Bowcraft** |
| Herblore | **Alchemy** |
| Runecrafting | **Enchanting** (already ours) |
| Alt. Magic | **Transmutation** |
| Township | **Settlement** |
