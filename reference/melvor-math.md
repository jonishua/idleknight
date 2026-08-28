# Melvor Math — the numeric bar

Source: https://wiki.melvoridle.com, game version **v1.3.1** (30 Oct 2024). Every
formula below was pulled from the wiki and re-derived/verified in code against the
wiki's own published tables (see "Verification" at the end).

**How to use this file.** Take the *shape* of these curves — the doubling XP ramp,
the mastery pool percentages, the tick quantisation, the bank-slot exponential, the
faucet magnitudes. Invent our own names, items and flavour. Melvor's shop ladder is
literally `Iron / Steel / Black / Mithril / Adamant / Rune / Dragon` — those names are
**forbidden** in our game. The *numbers* attached to them are not.

---

## 1. Skill XP

### 1.1 The formula

XP required to go from level `L-1` to level `L`:

```
delta(L) = floor( (1/4) * ( (L-1) + 300 * 2^((L-1)/7) ) )
```

Cumulative XP to reach level `L` (this is the number you store and compare against):

```
xpAt(L) = floor( (1/4) * SUM(n = 1 .. L-1) floor( n + 300 * 2^(n/7) ) )
```

Note the two floors are in different places: the per-term floor is *inside* the sum
for the cumulative form. Implement the cumulative form as a precomputed lookup array
of 121 entries at boot — do not recompute per frame.

```js
const XP_TABLE = (() => {
  const t = [0, 0]; let acc = 0;              // index by level, 1-based
  for (let n = 1; n <= 120; n++) {
    acc += Math.floor(n + 300 * Math.pow(2, n / 7));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;                                    // XP_TABLE[99] === 13034431
})();
```

### 1.2 The properties that matter

- **XP doubles every 7 levels.** Verified: `delta(L+7) / delta(L)` = 1.995 at L=10 and
  converges to exactly 2.000 by L=66. This is the single most important property —
  it is what makes level 50 feel like a milestone and level 99 feel like a career.
- **The back half is the whole game.** XP from 1→92 equals XP from 92→99. Level 92 is
  the halfway point of a 99 grind, not level 50.
- Base cap **99**. Expansion cap **120**. "Virtual levels" past 99 are a display toggle
  but are used for real in pet drop-rate math.
- Mastery levels use the **exact same table** (see §2).

### 1.3 Thresholds

| Level | Cumulative XP | XP for that level |
|---|---|---|
| 1 | 0 | 0 |
| 2 | 83 | 83 |
| 3 | 174 | 91 |
| 4 | 276 | 102 |
| 5 | 388 | 112 |
| 6 | 512 | 124 |
| 7 | 650 | 138 |
| 8 | 801 | 151 |
| 9 | 969 | 168 |
| 10 | 1,154 | 185 |
| 20 | 4,470 | 497 |
| 30 | 13,363 | 1,332 |
| 40 | 37,224 | 3,576 |
| 50 | 101,333 | 9,612 |
| 60 | 273,742 | 25,856 |
| 70 | 737,627 | 69,576 |
| 80 | 1,986,068 | 187,260 |
| 90 | 5,346,332 | 504,037 |
| 92 | 6,517,253 | 614,422 |
| 99 | **13,034,431** | 1,228,825 |
| 110 | 38,737,661 | 3,652,007 |
| 120 | 104,273,167 | 9,830,430 |

Intermediate checkpoints for pacing sanity: L25 = 7,842 · L35 = 22,406 · L45 = 61,512 ·
L55 = 166,636 · L65 = 449,428 · L75 = 1,210,421 · L85 = 3,258,594 · L95 = 8,771,558.

### 1.4 What that costs in wall-clock time

The lowest-tier gathering action pays ~3.3 XP/s. Melvor's first skill to 99 is therefore
roughly **1,090 hours** if you never upgrade. The player is expected to climb the
content ladder: top-tier base-game woodcutting is 12 XP/s, so ~300h, and with a −40%
interval it is ~180h. **Design read: a single skill to cap is a 200–1000 hour arc, and
the ratio between worst and best rate inside one skill is about 4x.**

---

## 2. Mastery

Every recipe/action in a non-combat skill carries its own mastery level 1–99, on the
same XP table as §1.1.

### 2.1 Mastery XP per action

```
MXP = [ (UnlockedActions * PlayerTotalMasteryInSkill / MaxTotalMasteryInSkill)
      + (ItemMasteryLevel * TotalItemsInSkill / 10) ]
      * ActionTime * 0.5 * (1 + Bonus)
```

- `MaxTotalMasteryInSkill` = `TotalItemsInSkill * 99`.
- `UnlockedActions` = number of recipes the player has unlocked in this skill.
- `Bonus` = summed mastery-XP percentage modifiers (§7).
- `ActionTime`:
  - **Gathering skills** (woodcutting, mining, fishing, agility, thieving, astrology):
    the *actual* seconds the action took. Consequence: **MXP/sec is invariant to
    interval reduction** for gatherers — speeding up gets you more loot, not more mastery.
  - **Artisan skills** (consume input → produce output): a **fixed constant**, so
    interval reduction *does* multiply MXP/sec. Melvor's constants:
    smithing 1.7 · fletching 1.3 · crafting 1.65 · runecrafting 1.7 · herblore 1.7 ·
    summoning 4.85 · firemaking = 60% of the log's base burn interval ·
    cooking = 85% of the recipe's base cook interval.
  - **Farming**: hours the crop took to grow, then `* quantity harvested`, then
    `/ 3` (allotment & herb) or `/ 10` (tree).

Two readable halves: term 1 scales with *how far along you are in the whole skill*
(max contribution = `UnlockedActions`, i.e. +1 per fully-mastered recipe); term 2
scales with *this recipe's own level* times one tenth of the recipe count. So mastery
accelerates hard as you go, and skills with many recipes master far faster than skills
with few.

### 2.2 The Mastery Pool

- **25%** of every point of mastery XP earned is *also* deposited in that skill's pool.
  After skill level 99 the "Skill Mastery" perk raises this to **50%**.
- **Pool cap = 500,000 × (number of recipes in the skill).** Overflow is destroyed.
- Pool XP can be **spent 1:1** to push any recipe's mastery level up.
- Cap can be raised +25% / +50% / +25% by three late-game sources (stacking additively
  to +100%). Raising the cap does **not** raise the checkpoint XP thresholds — it makes
  the 95% checkpoint easy to hold while still banking XP.
- A "mastery token" item refills **0.1% of the pool cap** per token.

Real pool caps (which also confirm the ×500k rule): woodcutting 20 recipes → 10,000,000 ·
mining 23 → 11,500,000 · fishing 40 → 20,000,000 · cooking 54 → 27,000,000 ·
agility 79 obstacles → 39,500,000.

### 2.3 Checkpoints — 10 / 25 / 50 / 95 %

Checkpoints are **live thresholds, not unlocks**: spend pool XP back down below a
threshold and you lose the bonus until you re-earn it. This is the mechanic that gives
the pool tension. Copy it.

The 10% checkpoint is `+5% mastery XP in that skill` for **every** skill except thieving —
a deliberate, uniform onboarding gift. The other three are skill-flavoured:

| Skill | 10% (XP) | 25% | 50% | 95% |
|---|---|---|---|---|
| Woodcutting | 1,000,000 · +5% WC mastery XP | 2,500,000 · +5% double items | 5,000,000 · +50% GP from log sales | 9,500,000 · +1 base rare-drop qty |
| Mining | 1,150,000 · +5% mastery XP | 2,875,000 · −10% node respawn | 5,750,000 · **−0.2s mining interval** | 10,925,000 · +10 node HP |
| Fishing | 2,000,000 · +5% mastery XP | 5,000,000 · **no junk items** | 10,000,000 · +5% double items | 19,000,000 · +25% extra special roll |
| Firemaking | 1,000,000 · +5% mastery XP | 2,500,000 · −10% FM interval | 5,000,000 · +25% of log base value as GP when burnt | 9,500,000 · **+5% mastery XP in ALL skills** |
| Cooking | 2,700,000 · +5% mastery XP | 6,750,000 · +5% double items | 13,500,000 · +10% preserve resources | 25,650,000 · +10% food healing |
| Agility | 3,950,000 · +5% mastery XP | 9,875,000 · +10% GP from agility | 19,750,000 · −10% obstacle build cost | 37,525,000 · −15% obstacle item cost |
| Thieving | (no mastery-XP gift) | **−0.2s thieving interval** | — | — |

Design read: the four checkpoint slots are consistently **(1) more mastery XP →
(2) a throughput or quality-of-life fix → (3) an economy multiplier → (4) a
prestige/global bonus.** Use that ladder.

### 2.4 Per-recipe mastery unlock ladder

Melvor gives every recipe unlocks at mastery **1, 10, 20, 50, 65, 85, 95, 99**. Worked
examples:

- **Mining**: `RockHP = 5 + MasteryLevel + Boosts`. A rock regenerates 1 HP / 10s and
  respawns when depleted. So mastery directly buys *uptime* — level 1 rock has 6 HP,
  level 99 rock has 104. Full respawn-immunity requires ≥92% "deal no damage" chance at
  0.85s interval; the game caps achievable at 91%, deliberately just short.
- **Cooking**: base success chance **70%**, `+0.6% per mastery level`, hitting 100% at
  mastery **50**. Perfect-cook chance climbs to **+95% from mastery alone**, and perfect
  food is +10% healing / **+50% sale value**.
- **Thieving**: `+1 stealth and +1% GP per mastery level` on that NPC; **−0.2s interval
  at mastery 50**.
- **Fishing**: mastery 99 on a fish grants a guaranteed extra item; stacked with the
  skillcape perk it guarantees ≥4 fish/action and can reach 8.

---

## 3. Tick engine and offline replay

- **1 tick = 0.05 s. 20 ticks per second.** This is the atomic unit of the entire game.
- Every action's remaining time is stored in **ticks**, not seconds. Every interval is
  quantised down to a multiple of 0.05 s (§4).
- Offline is **not** simulated in the background. On resume the game computes
  `elapsed = min(now - lastSaveTimestamp, 24h)` and **replays the tick loop** from the
  stored action state.
- **Offline cap: 24 hours.** (Historically 12h in v0.21; raised to 24h.)
- The replay is *not* an approximation. Because it re-runs the real tick loop it
  correctly applies: mastery levels gained mid-session (each level-up changes the rate
  for subsequent ticks), newly-unlocked synergies, resource consumption, rock HP
  depletion and respawn, and death. Melvor explicitly fixed this over ~6 months of
  updates (v0.21 → v1.0.3); the "freeze the rate at the starting mastery level" shortcut
  was considered a **bug**. Build the replay right the first time.
- Combat and thieving are offline-capable but *dangerous* — the player can die offline
  and lose the session. Gated behind an explicit opt-in toggle.
- The player is shown a **"Welcome Back" summary** of everything gained.
- The same replay path fires when the tab is merely throttled by the browser. On mobile
  this is the common case, not the edge case — a backgrounded tab must resume identically
  to a cold start.
- Cost note: replay is O(ticks). 24h at 20 ticks/s = **1,728,000 iterations**. That must
  run in well under a second on a phone, so the per-tick body has to be branch-light.
  Consider a fast path that closed-forms whole actions between state-change events.

---

## 4. Action intervals and how reduction stacks

### 4.1 The one formula

```
EffectiveInterval = max(
    floor( (BaseInterval * (1 - SumOfPercentReductions) - SumOfFlatReductions) / 0.05 ) * 0.05,
    0.25
)
```

Rules encoded there:

1. **Percentage reductions always apply to the BASE interval**, never to the current one.
   A −10% on a 5s action removes 0.5s, always, no matter what else is equipped.
2. **All percentage reductions sum additively.** Global −10% and skill-specific −10% are
   identical in effect and simply add to −20%.
3. **Flat reductions (`−0.2s Interval`) are subtracted after**, unmodified by the percentages.
4. Result is **floored to a 0.05s tick**.
5. **Hard floor of 0.25 s** on any action.

### 4.2 The consequence to design around

Because reductions are linear on base but the *rate* is `1/interval`, the marginal value
of reduction is **hyperbolic**:

```
ThroughputMultiplier = 1 / (1 - TotalReduction)
```

The first −10% is worth +11% actions/hr. A −10% added on top of an existing −50% takes
2.5s → 2.0s, which is **+25%** actions/hr. Late-game interval items are therefore
super-linear in value and players chase them hard. That is intentional and it is a
good chase. Just make sure the max stacked reduction is bounded (Melvor's base-game
gathering ladders top out around **−40% to −50%**).

### 4.3 Base intervals shipped

| Skill | Base interval | Notes |
|---|---|---|
| Mining | **3.0 s flat**, every rock | Depth comes from rock HP + respawn, not interval |
| Thieving | **3.0 s flat**, every NPC | 3.0 s stun on failure |
| Astrology | **3.0 s flat** | No inputs consumed |
| Woodcutting | **3 s → 20 s**, per tree | Rises with tier |
| Fishing | **min/max range, rolled per action** | 4–8 s at tier 1, up to 25–40 s at cap |
| Firemaking | **2 s → 27 s** burn time per log | |
| Cooking | 2–13 s (fire, per recipe), **8 s flat** (furnace), **7 s flat** (pot) | |
| Agility | per-obstacle, ~6 s → 42 s | |

Melvor's fishing is the interesting one: it rolls uniformly in `[min, max]` each action,
and reduction scales **both** endpoints. It costs nothing to implement and it makes the
skill feel alive instead of metronomic.

**Woodcutting ladder** (level · XP · cut time · XP/s · GP/s):
1 · 10 · 3s · 3.33 · 0.33 — 10 · 15 · 4s · 3.75 · 1.25 — 25 · 22 · 5s · 4.40 · 2.00 —
35 · 30 · 6s · 5.00 · 3.33 — 45 · 40 · 8s · 5.00 · 4.38 — 55 · 60 · 10s · 6.00 · 5.00 —
60 · 80 · 12s · 6.67 · 6.25 — 75 · 100 · 20s · 5.00 · 20.00 — 90 · 180 · 15s · 12.00 · 1.67.

Note that the curve is deliberately **not monotonic**: level 75 has poor XP/s but the best
GP/s of the base tier, and level 90 inverts it. Melvor makes the player *choose* between
XP and GP at several rungs. Steal this.

**Mining ladder** (level · XP · respawn · ore value): 1 · 7 · 5s · 2 — 15 · 14 · 10s · 5 —
30 · 18 · 10s · 13 — 30 · 25 · 15s · 25 — 40 · 28 · 15s · 30 — 50 · 65 · 20s · 65 —
70 · 71 · 30s · 88 — 80 · 86 · 60s · 100 — 85 · 95 · 4m · **750** — 95 · 101 · 2m · 135.
Respawn time grows ~12x across the ladder while XP grows ~14x — the sink that balances
high tiers is **downtime**, and mastery (rock HP) is what buys it back.

**Fishing ladder** (level · min–max · XP · value): 1 · 4–8s · 5 · 1 — 20 · 4–10s · 22 · 19 —
40 · 4–11s · 50 · 65 — 50 · 5–12s · 80 · 80 — 70 · 7–15s · 150 · 270 — 80 · 12–30s · 325 · 960 —
95 · 10–25s · 575 · 750.

### 4.4 The interval-reduction ladder players buy

Melvor's woodcutting axes (names redacted — they are RuneScape's metal ladder and are
banned for us). The *cost curve* is the lesson:

| Unlock level | Cost (GP) | This step | Cumulative |
|---|---|---|---|
| 1 | 50 | −5% | −5% |
| 10 | 750 | −5% | −10% |
| 20 | 2,500 | −5% | −15% |
| 35 | 10,000 | −5% | −20% |
| 50 | 50,000 | −5% | −25% |
| 60 | 200,000 | −5% | −30% |
| 80 | 2,000,000 | −10% | **−40%** |

Seven steps, level 1 → 80, cost 50 → 2,000,000 GP. **Cost multiplies ~4–10x per step
while benefit stays flat at −5%** — the pricing is carried entirely by the hyperbolic
throughput term in §4.2. Mining's pickaxes follow the same shape at 250 → 1,000,000 GP
and also reach −40%.

---

## 5. GP faucets across the progression

Melvor's currency faucet spans roughly **five orders of magnitude** from hour 1 to endgame.
Published per-hour figures:

| Stage | Method | GP/hr |
|---|---|---|
| Hour 1 | Lowest-tier woodcutting (1 gp log / 3 s) | **~1,200** |
| Hour 1 | Lowest-tier mining (2 gp ore / 3 s) | **~2,400** |
| Early | Thieving tier-1 NPC (avg 50 gp, ~48% success, 3 s) | **~29,000** |
| Early-mid | Mining with gem gloves (lvl 50) | **306k – 2M** |
| Mid | Fishing top base-game fish (lvl 95) | **310k – 3M** |
| Mid | Agility, base game (lvl 99 + support) | **1.1M – 6.3M** |
| Mid-late | Base-game combat at 99s | **~18M** |
| Mid-late | Alt-magic-assisted artisan loop | **~18M** |
| Late | High-tier mining (lvl 85 rare ore) | **4M – 39.5M** |
| Late | Mid-high slayer farming | **148M – 480M** |
| Late | Thieving high-tier NPC (lvl 115) | **15.4M – 105M** |
| Late | High-level agility (expansion) | **16.8M – 63M** |
| Endgame | Expansion combat | **110B – 225B** |

**Shape to copy:**
- The very first hour pays **~1–2 thousand**. It has to, because the first upgrade costs 50.
- Non-combat mid-game plateaus around **1–5M/hr**. Late non-combat around **20–100M/hr**.
- **Combat out-earns every gathering skill by 10–100x** at equivalent investment. Melvor
  uses skills for XP and progression, and combat for wealth.
- Every entry is a **range** (typically 3–8x wide between "just unlocked" and "fully
  boosted"). Never a single number. The spread *is* the build-crafting.
- Ratio of hour-1 GP/hr to endgame GP/hr is about **10^8**. Number formatting must handle
  that from day one (K / M / B suffixes).

Skill-specific GP faucets worth naming:
- **Woodcutting 50% pool checkpoint**: +50% GP from log sales.
- **Firemaking 50% pool checkpoint**: burning a log grants **+25% of the log's base sale
  price as GP** — i.e. a processing skill that normally *destroys* value is converted into
  a faucet by a mastery checkpoint. Elegant; steal the idea.
- **Cooking**: perfect food sells for **+50%**. A quality roll is a faucet multiplier.
- **Thieving**: `+1% GP per mastery level` on that NPC, and a late-game cape gives
  **+150% GP from thieving**.
- **Agility**: obstacles carry explicit `+X% GP gained from Agility` (up to +40%) —
  and some carry **negatives** (`−30% GP`, `+10% interval`, `−16% skill XP`) alongside
  their upside. Melvor's agility is a **build-crafting puzzle of signed modifiers**, not a
  straight ladder. This is the single most interesting economy design in the game.

---

## 6. Sinks

### 6.1 Bank slots — the flagship sink

```
Cost(n) = floor( 132728500 * (n + 2) / 142015^(163 / (122 + n)) )
```

where `n` = slots already purchased. Note the denominator is an **exponent**, not a
multiplication. Player starts with **20** free slots; **118** are purchasable, after
which each further slot is a flat **5,000,000**.

| Slots bought | Next slot costs | Cumulative spent |
|---|---|---|
| 0 | 34 | 34 |
| 1 | 59 | 93 |
| 2 | 89 | 182 |
| 5 | 226 | 706 |
| 10 | 691 | 3,081 |
| 15 | 1,672 | 9,206 |
| 20 | 3,557 | 22,756 |
| 25 | 6,937 | 49,932 |
| 30 | 12,673 | 100,671 |
| 40 | 36,481 | 341,141 |
| 50 | 90,413 | 968,978 |
| 60 | 199,941 | 2,415,915 |
| 70 | 403,812 | 5,438,738 |
| 80 | 757,183 | 11,269,486 |
| 90 | 1,334,404 | 21,795,238 |
| 100 | 2,231,229 | 39,762,736 |
| 110 | 3,566,344 | 69,001,445 |
| 117 | 4,837,000 | **98,870,826** |

Why this curve is good, and why we should clone its *shape*:
- **First slot costs 34 GP** — affordable in the first two minutes. The sink introduces
  itself immediately.
- It is **smooth**, not stepped. Every single purchase is a visible, affordable-ish next goal.
- It **self-limits**: the exponent term flattens the curve near n≈118 so it asymptotes to
  ~5M rather than exploding. Cumulative total ≈ **98.9M GP**, which is roughly *5 hours of
  mid-game income* — a sink sized to matter without being the whole game.
- Cost is driven by `n`, not by player wealth. No rubber-banding.

Melvor also sells **bank tabs** at a flat **100,000,000** each (10 purchasable) — a pure
late-game vanity/organisation sink priced at 1x the entire slot curve.

### 6.2 Other real prices

| Sink | Cost (GP) | Effect |
|---|---|---|
| First tool upgrade | 50 | −5% interval |
| Tool ladder complete (base) | 2,000,000 (2.26M cumulative) | −40% interval |
| Multi-tree unlock | 1,000,000 | Gather 2 resources at once |
| Auto-eat tier I | 1,000,000 | 20% eff · triggers at 60% HP · heals to 40% |
| Auto-eat tier II | 5,000,000 | 30% · 80% · 60% |
| Auto-eat tier III | 20,000,000 | 40% · 100% · 80% |
| Extra loadout slot (late) | 5,000,000 | |
| Agility obstacle build (mid) | 500,000 + 1,000 material | Per obstacle, per rebuild |
| Agility obstacle build (late) | 50,000,000 – 75,000,000 + 5,000 material | |
| Bank tab | 100,000,000 | Organisation only |

Design read on sink pacing: **1M is the "you have arrived in the midgame" price point**
(multi-tree, auto-eat I, the level-80 tool), **5M–20M is the comfort tier**, and
**50M–100M+ is late-game**. Three sinks land on 1M simultaneously — that is a deliberate
decision point, not an accident.

Agility is the standout sink design: obstacles cost **both GP and crafted materials**, must
be **rebuilt** to reconfigure, and the 50%/95% pool checkpoints give **−10%/−15% build cost**.
It converts a stat-choice screen into a recurring economic drain.

---

## 7. The modifier pipeline

Melvor's modifier system is deliberately, almost aggressively, **additive**. This is what
makes it auditable and un-exploitable.

### 7.1 Core rule

**All modifiers of the same named type sum together, then apply once.**

```
finalValue = base * (1 + sum(percentModifiers)) + sum(flatModifiers)
```

- Two sources of "+10% chance to double" and "+5% chance to double" = **15%**, not
  1.10 × 1.05.
- Global and skill-specific modifiers of the same type are the **same pool**: "−10%
  interval for all skills" and "−10% woodcutting interval" both land in
  `SumOfPercentReductions` and are worth exactly the same.
- There is no separate "additive bucket" vs "multiplicative bucket". One bucket per
  modifier name.

### 7.2 The exceptions — and there are very few

1. **Interval** (§4.1): percentages apply to **base**, flats subtract **after**, result is
   tick-quantised and floored at 0.25s. The percentage-of-base rule is what makes the
   *effective* value compound hyperbolically even though the *stacking* is additive.
2. **Guaranteed-quantity multipliers are multiplicative with chance-to-double.** Melvor's
   mining gloves grant "collect 2x items", and that 2x multiplies on top of a doubling
   roll → **4x**. Fishing stacks a guaranteed-double perk with a mastery-99 guaranteed-double
   for **≥4**, and a doubling roll on top for **up to 8**. So: *chance-based doubling is
   additive within itself; deterministic multipliers are a separate multiplicative layer.*
3. **Caps.** Preservation is capped at **80%** globally (raisable by specific modifiers).
   Cooking success caps at 100%. Perfect-cook caps at 100%. Interval floors at 0.25s.
   Township build-cost reduction caps at −80%. Every unbounded-looking modifier has a
   named cap somewhere.

### 7.3 Named modifier families to implement

Give each of these its own summed bucket:

- `skillXP` (global) / `skillXP:<skill>` — Melvor's sources run +3% to +8% each.
- `masteryXP` (global) / `masteryXP:<skill>` — +5% to +8% each.
- `intervalPercent` (global) / `intervalPercent:<skill>` — one shared pool.
- `intervalFlat:<skill>` — in seconds, e.g. `−0.2s`.
- `doubleChance` (global) / `doubleChance:<skill>` — probability, summed.
- `preserveChance` — summed, capped at 0.80.
- `gp` (global, "except item sales") / `gp:<skill>` — Melvor is careful to distinguish
  *income from an action* from *income from selling an item*. Keep that distinction; it
  prevents a global GP modifier from double-dipping through the sell button.
- `flatQuantity:<resource>` — "+1 base quantity", explicitly tagged **"cannot be doubled"**
  where it should not multiply. Tag it in data, not in code.
- `costReduction:<skill>`.

### 7.4 Signed modifiers

This is the piece most idle games miss. A large fraction of Melvor's best modifier
sources carry **real drawbacks**:

- Agility obstacle: `−12% agility interval, +15% GP from agility` **but**
  `−8% agility skill XP, −2% mastery XP in all skills`.
- Late obstacle: `+5% double items globally` **but** `+10% agility interval, −30% GP from agility`.
- `+3% skill XP for all skills` **but** `−15% global GP (except item sales)`.
- `+4% skill XP for all skills, +3% mastery XP` **but** `−10% ammo/rune/resource preservation`.

Because stacking is additive and modifiers are signed, the player's loadout is a genuine
**linear optimisation problem** they can reason about. That is the payoff for choosing
additive stacking, and it is why the modifier pipeline must be transparent in the UI —
a tooltip listing every contributing source and its sign.

### 7.5 Ancillary formulas worth having

- **Thieving success**: `min(1, (100 + Stealth) / (100 + Perception))`. Perception is
  fixed per NPC and cannot be reduced. Some NPCs have perception above max achievable
  stealth — permanent, intentional sub-100% success.
- **Thieving double-item chance** scales on stealth vs perception; guaranteed doubles at
  `stealth >= 4 * perception`.
- **Mining rock HP**: `5 + MasteryLevel + Boosts`; regen 1 HP / 10 s; effective HP under
  a preserve chance is `HP / (1 - preserveChance)`.
- **Cooking success**: `0.70 + 0.006 * masteryLevel`, capped at 1.0 (reached at mastery 50).
- **Combat HP XP**: `0.133 XP per point of damage dealt`.
- **Rare drop rates** sit at **0.5% – 3%** per action for the signature collectibles, and
  gem-vein discovery at **0.533%** — Melvor's "surprise" rates live in the sub-1%-to-3% band.

---

## 8. Verification

Every formula above was re-implemented and checked against the wiki's own published tables:

- `xpAt(26) = 8,740`, `xpAt(51) = 111,945`, `xpAt(76) = 1,336,443`, `xpAt(99) = 13,034,431`,
  `xpAt(101) = 15,889,109`, `xpAt(120) = 104,273,167` — all exact matches.
- `delta(L+7)/delta(L)` computed across L = 10…94: 1.995 → 2.000. Doubling claim confirmed.
- Bank slot: `Cost(0) = 34`, `Cost(117) = 4,837,000`, cumulative to 118 slots = `98,870,826`
  — matches the wiki's stated 5,000,000 ceiling at 118 slots purchased.
- Pool caps back-derived from published checkpoint XP values confirm
  `cap = 500,000 * recipeCount` for all six skills checked.

## 9. Forbidden

Two different things get confused here, and the distinction decides our vocabulary.

**Generic RPG vocabulary is FREE.** Nobody owns the words every game in the genre
shares, and inventing synonyms for them makes our game harder to read, not more
original. Use plainly: Mining, Woodcutting, Fishing, Cooking, Firemaking, Smithing,
Crafting, Farming, Magic, Ranged, Melee, Combat, Attack, Defense, Enchanting,
Alchemy, Exploration, bank, ore, bar, ingot, log, plank, potion.

Real-world nouns are equally free — nobody owns a fish, a tree or a metal: Copper,
Tin, Iron, Steel, Coal, Silver, Gold, Bronze, Trout, Salmon, Bass, Tuna, Cod, Eel,
Pike, Minnow, Swordfish, Shark, Lobster, Oak, Birch, Willow, Pine, Cedar, Elm.

RuneScape's own coinages are a different matter. These are invented words and
invented sequences, and they are the actual intellectual property. **None of these
strings may appear in our game:**
Runecrafting, Fletching, Herblore, Slayer, Thieving, Mithril, Adamant, Adamantite,
Runite, Dragonite, Rune Essence, Pure Essence, Magic Logs, Redwood, Manta Ray,
Bird Nest, Golbin, Tinderbox, Wintertodt, Zamorak, Saradomin, Guthix, Gielinor,
Varrock, Lumbridge, Falador, Ardougne, Karamja, Zulrah, Barrows, Abyssal Whip,
Party Hat, Cannonball, Amulet of Glory, Grand Exchange.

Also forbidden as an ordered progression, even though the individual metals are
fine on their own: **Bronze - Iron - Steel - Mithril - Adamant - Rune**. Our ladder
runs Copper - Bronze - Steel - Silver - Gold and then into invented tiers, which is
a different shape.

The FFVI proper-noun list (Terra, Kefka, Esper, Gil, Chocobo, Magitek...) is
hand-kept in `selftest.js` and is unchanged - those stay forbidden.

**The test of a good name:** would a player who has never touched RuneScape know
what it does? "Mining" passes. "Delving" fails. Take the curves and the mechanics,
use ordinary words for ordinary things, and save invented words for things that are
genuinely ours (Aetherite, Warden's Tear, the Ninefold).
