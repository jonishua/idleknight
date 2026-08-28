/* =========================================================================
   EMBERVEIL — SCREEN: COMBAT  (nav tab "combat")   parity §3j

   The one page all eight combat skills land on (§1's critical finding), built
   block for block from §3j:

     Select Combat Area                      the area dropdown and its monsters
     Player container                        HP, prayer points, attack interval
     Food                                    dropdown, count, healing, Eat
     Equipment                               slots, View Equipment Stats,
                                             Change Equipment Set
     Attack Style                            Stab / Slash / Block (+ ranged,
                                             magic), which decides XP routing
     Enemy panel                             interval, HP, View Monster Drops,
                                             Run / Area Select
     Offensive Stats                         damage type, attack type, min and
                                             max hit, chance to hit, accuracy
     Defensive Stats                         three evasions, damage reduction
     Loot to Collect ( n / 100 )             Loot All, Destroy Loot
     Devotion                                lit prayers, points, offerings
     Bounties                                the contract and the Marks

   paint() is the per-tick half: the HP bars, the enemy bar, the prayer
   counter and the loot count move every tick without rebuilding any DOM.

   ART IS OUT OF SCOPE. Monsters without a sprite in ../art.js fall back to
   the shared initials mark; nothing new is drawn here.
   ========================================================================= */

import { DB, STYLE_XP_PER_DAMAGE, VITALITY_XP_PER_DAMAGE } from "../engine/index.js";
import {
  el, esc, num, int, secs, pct2, mark, initials, sect, line, selector,
  segmented, toolbar, statSplit, sheet, prefs,
} from "./ui.js";
import { MOB_SPRITE, PLAYER_SPRITE, BATTLE_SCENE } from "../art.js";
import { AREAS, AREA_BY_ID, areaLocked, areaFor } from "../../data/areas.js";
import { ATTACK_STYLES, COMBAT_BLOCK, DAMAGE_TYPES } from "../engine/combat.js";
import { SLOTS } from "../../data/equipment.js";

/* Which area the player is browsing. Module state, like every other
   drill-down in the app; reset() clears it when the tab is re-entered. */
let openArea = null;

/** Monsters always have a sprite where one exists, initials where one does not. */
function foeMark(m) {
  const s = MOB_SPRITE[m.id];
  if (!s) return mark(m.id, initials(m.name), true);
  return `<span class="mark mark--mob" aria-hidden="true"><img src="${s.src}" width="${s.w}" height="${s.h}" alt=""></span>`;
}

/* =========================================================================
   THE SUB-NAV

   Combat, Gear and Larceny are three faces of one system — they share the hit
   points, the food and the auto-ward — and the tab bar has five slots that
   are all spoken for. So the three route between themselves with this strip,
   the same way the reference's own combat screen carries a menu row.
   ========================================================================= */
export function combatNav(ctx, here) {
  return segmented(
    [["combat", "Combat"], ["equipment", "Gear"], ["larceny", "Larceny"]],
    here,
    (v) => { if (v !== here) ctx.goTab(v); }
  );
}

/* =========================================================================
   THE PLAYER CONTAINER
   ========================================================================= */

function playerPanel(ctx) {
  const { game } = ctx;
  const s = game.state;
  const max = game.maxHp(), hp = game.hp();
  const swing = (game._playerAttackTicks() * ctx.TICK_MS) / 1000;
  const drain = game.prayerDrain();

  return el(`<section class="panel">
    <div class="panel__head">
      <p class="t-label">You</p>
      <p class="t-label u-tnum" id="cbSwing">Attack Interval: ${secs(swing)}</p>
    </div>
    <div class="row--between" style="margin-bottom:6px">
      <p class="t-value u-tnum" id="cbHpTxt">${int(hp)} / ${int(max)} HP</p>
      <p class="t-label u-tnum" id="cbPrayer">${int(s.prayer)} prayer points${drain ? ` · -${drain}/swing` : ""}</p>
    </div>
    <div class="bar" role="progressbar" aria-label="Hit points">
      <div class="bar__fill" id="cbHpBar" style="--fill:${((hp / max) * 100).toFixed(1)}%"></div>
    </div>
  </section>`);
}

/** §3j: "Food: (6,579) +686 HP [dropdown] — Hold down the Eat button." */
function foodPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const s = game.state;
  const held = Object.keys(s.items)
    .filter((i) => DB.items.get(i)?.kind === "provision" && s.items[i] > 0)
    .sort((a, b) => DB.item(b).heal - DB.item(a).heal);

  if (!held.length) {
    return el(`<div class="row-card"><span class="row-card__body">
      <span class="row-card__title badge--warn">No food</span>
      <span class="row-card__sub">Cook something first. Larceny and combat both eat from this bar.</span>
    </span></div>`);
  }

  const chosen = held.includes(s.food) ? s.food : held[0];
  const it = DB.item(chosen);
  const wrap = el(`<section class="panel panel--tight">
    <div class="row--between" style="margin-bottom:var(--s-2)">
      <p class="t-label">Food — eaten automatically</p>
      <p class="t-label u-tnum">(${num(s.items[chosen])}) +${int(it.heal)} HP</p>
    </div>
  </section>`);
  wrap.append(selector("Select Food", held.map((i) => [i, `${DB.item(i).name} — ${num(s.items[i])} held, +${int(DB.item(i).heal)} HP`]),
    chosen, (v) => { s.food = v; rerender(); }));
  wrap.append(toolbar([
    { text: "Eat one", onClick: () => { const err = game.eat(chosen); toast(err || `Ate ${it.name}`, err ? "bad" : ""); rerender(); } },
  ]));
  return wrap;
}

/* =========================================================================
   EQUIPMENT  (§3j: slots, View Equipment Stats, Change Equipment Set)
   ========================================================================= */

function equipmentPanel(ctx) {
  const { game, goTab } = ctx;
  const set = game.equipmentSet();
  const relic = game.equippedRelic();
  const sets = game.equipmentSets();

  const cells = SLOTS.map((slot) => {
    const worn = slot.derived ? relic : (set[slot.id] ? DB.item(set[slot.id]) : null);
    /* Item name over slot name, and "Empty" over slot name when nothing is
       worn — the same cell the Gear screen draws. Printing the slot name on
       both lines, as this did, reads as a rendering fault. */
    return `<button class="bank-cell" type="button" data-slot="${esc(slot.id)}"
      ${slot.derived ? "disabled" : ""} style="${worn ? "" : "opacity:.5"}">
      ${worn ? mark(worn.id, initials(worn.name)) : mark(slot.id, initials(slot.name))}
      <div class="bank-cell__name">${esc(worn ? worn.name : "Empty")}</div>
      <div class="bank-cell__each">${esc(slot.name)}</div>
    </button>`;
  }).join("");

  const wrap = el(`<section class="panel panel--tight">
    <div class="row--between" style="margin-bottom:var(--s-2)">
      <p class="t-label">Equipment — set ${game.state.equipment.active + 1} of ${sets}</p>
    </div>
    <div class="bank-grid">${cells}</div>
  </section>`);

  for (const b of wrap.querySelectorAll("[data-slot]")) {
    if (b.disabled) continue;
    b.onclick = () => goTab("equipment");
  }

  const bar = toolbar([
    { text: "View Equipment Stats", onClick: () => statsSheet(ctx) },
    { text: `Change Equipment Set (${sets})`, onClick: () => setSheet(ctx) },
  ]);
  wrap.prepend(bar);
  return wrap;
}

function setSheet(ctx) {
  const { game, render: rerender } = ctx;
  const rows = [];
  for (let i = 0; i < game.equipmentSets(); i++) {
    const set = game.equipmentSet(i);
    const worn = Object.values(set).filter(Boolean).length;
    const on = game.state.equipment.active === i;
    const b = el(`<button class="row-card${on ? " is-active" : ""}" type="button">
      <span class="row-card__body">
        <span class="row-card__title">Set ${i + 1}${on ? '<span class="badge badge--on">Active</span>' : ""}</span>
        <span class="row-card__sub">${worn} of ${SLOTS.length - 1} slots filled</span>
      </span></button>`);
    b.onclick = () => { game.setEquipmentSet(i); scrim.remove(); rerender(); };
    rows.push(b);
  }
  rows.push(el(`<p class="row-card__sub" style="white-space:normal;padding:var(--s-2)">Only the active set contributes. More sets are on the shop's Equipment Sets shelf.</p>`));
  const scrim = sheet("Change Equipment Set", "Twelve loadouts, two of them free.", rows);
  return scrim;
}

function statsSheet(ctx) {
  const { game } = ctx;
  const st = game.combatStats();
  const style = game.attackStyle();
  const rows = [
    line("Damage Type", DAMAGE_TYPES[style.type]),
    line("Attack Style", style.name),
    line("Min Hit", int(st.minHit)),
    line("Max Hit", int(st.maxHit)),
    line("Accuracy Rating", int(st.accuracy)),
    line("Evasion Rating", int(st.evasion)),
    line("Damage Reduction", `${(st.damageReduction * 100).toFixed(1)}%`),
    line("Attack Interval", secs((game._playerAttackTicks() * 50) / 1000)),
  ];
  const contributors = [];
  const set = game.equipmentSet();
  for (const slot of SLOTS) {
    if (slot.derived) continue;
    const id = set[slot.id];
    if (!id) continue;
    const it = DB.item(id);
    contributors.push(line(it.name, it.equip.text));
  }
  const relic = game.equippedRelic();
  if (relic) contributors.unshift(line(relic.name, relic.text));
  sheet("Equipment Stats", "Every source, with its sign — the modifier pipeline is meant to be auditable.",
    [el(`<section class="panel">${rows.join("")}</section>`),
     el(`<p class="sect">Worn</p>`),
     el(`<section class="panel">${contributors.length ? contributors.join("") : line("Nothing worn", "—")}</section>`)]);
}

/* =========================================================================
   ATTACK STYLE  (§3j "Attack Style: Stab / Slash / Block")
   ========================================================================= */

function stylePanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const cur = game.attackStyle();
  const wrap = el(`<section class="panel panel--tight">
    <div class="row--between"><p class="t-label">Attack Style</p>
    <p class="t-label">${esc(cur.text)}</p></div>
  </section>`);
  for (const type of ["melee", "ranged", "magic"]) {
    const group = ATTACK_STYLES.filter((s) => s.type === type);
    wrap.append(el(`<p class="row-card__meta" style="margin-top:var(--s-2)">${esc(DAMAGE_TYPES[type])}</p>`));
    wrap.append(segmented(group.map((s) => [s.id, s.name]), cur.id, (v) => {
      game.setAttackStyle(v);
      const st = ATTACK_STYLES.find((x) => x.id === v);
      toast(`${st.name}: ${st.text}`);
      rerender();
    }));
  }
  return wrap;
}

/* =========================================================================
   THE FIGHT
   ========================================================================= */

function enemyPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const s = game.state;
  const m = DB.monster(s.combat.monsterId);
  const sp = MOB_SPRITE[m.id];
  const st = game.combatStats();
  const chance = game.chanceToHit(m.id);

  const wrap = el(`<section class="panel panel--flush">
    <div class="scene" style="background-image:url('${BATTLE_SCENE}')">
      <img class="scene__hero" src="${PLAYER_SPRITE.src}" width="${PLAYER_SPRITE.w * 2}" height="${PLAYER_SPRITE.h * 2}" alt="">
      ${sp ? `<img class="scene__mob" src="${sp.src}" width="${sp.w}" height="${sp.h}" alt="">` : ""}
    </div>
    <div style="padding:var(--s-3)">
      <div class="row--between">
        <p class="t-value">${esc(m.name)}</p>
        <p class="t-label u-tnum">Attack Interval: ${secs(m.attack)}</p>
      </div>
      <p class="t-label u-tnum" id="cbFoeTxt" style="margin:4px 0">${int(s.combat.mHp)} / ${int(m.hp)} HP</p>
      <span class="bar bar--violet"><span class="bar__fill" id="cbFoeBar" style="--fill:${((s.combat.mHp / m.hp) * 100).toFixed(1)}%"></span></span>
      <p class="row-card__sub" style="white-space:normal;margin-top:var(--s-2)">${esc(m.blurb || "")}</p>
      <p class="row-card__meta">Chance to hit ${pct2(chance)} · your max hit ${int(st.maxHit)} · its max hit ${int(m.maxHit)}</p>
    </div>
  </section>`);

  wrap.append(toolbar([
    { text: "View Monster Drops", onClick: () => dropsSheet(m) },
    { text: "Run", onClick: () => { game.stop(); toast("You disengage"); rerender(); } },
    { text: "Area Select", onClick: () => { game.stop(); openArea = null; rerender(); } },
  ]));
  return wrap;
}

/* Combat XP is per point of damage, so a monster's worth is derived, never
   stored: killing it deals exactly its hit points. Printing the derived
   figure means the screen can never disagree with the engine. */
const weaponXp = (m) => m.hp * STYLE_XP_PER_DAMAGE;
const vitalityXp = (m) => m.hp * VITALITY_XP_PER_DAMAGE;

function dropsSheet(m) {
  const rows = [
    line("Weapon XP per kill", `${int(weaponXp(m))} (${m.hp} damage x ${STYLE_XP_PER_DAMAGE})`),
    line("Vitality XP per kill", int(vitalityXp(m))),
    line("Cogs", `${num(m.cogs[0])} – ${num(m.cogs[1])}`),
  ];
  for (const d of m.drops || []) {
    rows.push(line(DB.item(d.item).name,
      `${d.qty[0] === d.qty[1] ? d.qty[0] : `${d.qty[0]}–${d.qty[1]}`} @ ${(d.chance * 100).toFixed(1)}%`));
  }
  if (m.shards) rows.push(line("Aether Shards", `${m.shards.qty[0]}–${m.shards.qty[1]} @ ${(m.shards.chance * 100).toFixed(0)}%`));
  if (m.seals) rows.push(line("Warden Seals", `${m.seals.qty[0]}–${m.seals.qty[1]} @ ${(m.seals.chance * 100).toFixed(1)}%`));
  sheet(m.name, `Level ${m.level} · ${int(m.hp)} HP`, [el(`<section class="panel">${rows.join("")}</section>`)]);
}

/* =========================================================================
   STAT BLOCKS  (§3j Offensive / Defensive)
   ========================================================================= */

function statBlocks(ctx) {
  const { game } = ctx;
  const st = game.combatStats();
  const style = game.attackStyle();
  const foe = game.state.combat ? DB.monster(game.state.combat.monsterId) : null;
  const out = [];

  out.push(sect("Offensive Stats"));
  out.push(el(`<section class="panel">${[
    line("Damage Type", DAMAGE_TYPES[style.type]),
    line("Attack Type", style.name),
    line("Min Hit", int(st.minHit)),
    line("Max Hit", int(st.maxHit)),
    line("Chance to Hit", foe ? pct2(game.chanceToHit(foe.id)) : "—"),
    line("Accuracy Rating", int(st.accuracy)),
    /* Experience is paid per point of damage, not per kill, so the screen
       states the rate rather than a per-kill number that does not exist.
       It also names where the weapon share lands, which is the one thing
       the attack style actually decides. */
    line("Weapon XP", `${STYLE_XP_PER_DAMAGE} per damage → ${style.xp.map(([id]) => DB.skill(id).name).join(" + ")}`),
    line("Vitality XP", `${VITALITY_XP_PER_DAMAGE} per damage`),
  ].join("")}</section>`));

  /* §3j's defence block lists THREE evasions, one per damage type, because
     Melvor has a combat triangle: an attack is rolled against the evasion
     matching the attacker's damage type. Emberveil does not have one yet —
     `combatStats()` returns a single scalar and every monster carries a
     single `evasion` — so this screen prints ONE number under ONE label.

     It used to print the same number three times under three labels. That is
     worse than the gap it was papering over: a player reading "Melee 1,240 /
     Ranged 1,240 / Magic 1,240" reasonably concludes their gear is
     triangle-neutral, and builds around a mechanic that does not exist. One
     honest line, and the missing two are recorded in
     reference/parity-status.md rather than faked here. */
  out.push(sect("Defensive Stats"));
  out.push(el(`<section class="panel">${[
    line("Evasion Rating", int(st.evasion)),
    line("Damage Reduction", `${(st.damageReduction * 100).toFixed(1)}%`),
    line("Pure Resistance", "0%"),
  ].join("")}</section>`));
  return out;
}

/* =========================================================================
   LOOT CONTAINER  (§3j "Loot to Collect ( 0 / 100 ) [Loot All] [Destroy Loot]")
   ========================================================================= */

function lootPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const ids = Object.keys(game.state.loot);
  const out = [sect(`Loot to Collect ( ${ids.length} / 100 )`)];
  out.push(toolbar([
    { text: "Loot All", onClick: () => { const n = game.lootAll(); toast(n ? `Collected ${num(n)} items` : "Nothing to collect"); rerender(); } },
    { text: "Destroy Loot", onClick: () => { const n = game.destroyLoot(); toast(n ? `Destroyed ${num(n)} items` : "Nothing to destroy", "bad"); rerender(); } },
    { text: game.state.autoLoot ? "Auto Loot: On" : "Auto Loot: Off", on: game.state.autoLoot,
      onClick: () => { game.state.autoLoot = !game.state.autoLoot; rerender(); } },
  ]));
  if (!ids.length) {
    out.push(el(`<p class="empty">The container is empty. Drops queue here until you collect them.</p>`));
    return out;
  }
  const grid = el(`<div class="bank-grid"></div>`);
  for (const id of ids) {
    /* A container filled by an older build can hold an id this one no longer
       ships; price it as nothing rather than taking the screen down. */
    const it = DB.items.get(id) || { id, name: id, value: 0 };
    grid.append(el(`<div class="bank-cell">${mark(id, initials(it.name))}
      <div class="bank-cell__qty u-tnum">${num(game.state.loot[id])}</div>
      <div class="bank-cell__name">${esc(it.name)}</div>
      <div class="bank-cell__each">${num(it.value)} ea</div></div>`));
  }
  out.push(grid);
  return out;
}

/* =========================================================================
   DEVOTION AND BOUNTIES — §1's last two combat entries
   ========================================================================= */

function devotionPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const s = game.state;
  const skill = DB.skill("devotion");
  const lvl = game.skillLevel("devotion");
  const out = [sect(`Devotion — level ${lvl}, ${int(s.prayer)} points`)];

  const held = Object.keys(s.items).filter((i) => DB.items.get(i)?.devotion && s.items[i] > 0);
  if (held.length) {
    const bar = toolbar(held.map((id) => ({
      text: `Offer ${DB.item(id).name} (${num(s.items[id])})`,
      onClick: () => {
        const held0 = game.count(id);
        const err = game.offerRelic(id);
        toast(err || `Spoke over ${num(held0)}× ${DB.item(id).name}`, err ? "bad" : "violet");
        rerender();
      },
    })));
    out.push(bar);
  } else {
    out.push(el(`<p class="row-card__sub" style="white-space:normal;padding:0 var(--s-2) var(--s-2)">No relics held. They drop in the Bounty Grounds and cannot be sold — offering them is the only thing they are for.</p>`));
  }

  for (const d of skill.devotions) {
    const locked = lvl < d.level;
    const on = s.devotions.includes(d.id);
    const b = el(`<button class="row-card${locked ? " is-locked" : ""}${on ? " is-active" : ""}" type="button"${locked ? " disabled" : ""}>
      ${mark(d.id, initials(d.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(d.name)}${on ? '<span class="badge badge--on">Lit</span>' : ""}</span>
        <span class="row-card__sub">${locked ? `Unlocks at Devotion ${d.level}` : esc(d.text)}</span>
        ${locked ? "" : `<span class="row-card__meta">${d.cost} point${d.cost > 1 ? "s" : ""} per swing</span>`}
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${d.level}</span><span class="row-card__lvl-cap">req</span></span>
    </button>`);
    if (!locked) b.onclick = () => { const err = game.toggleDevotion(d.id); if (err) toast(err, "bad"); rerender(); };
    out.push(b);
  }
  return out;
}

function bountyPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const s = game.state;
  const lvl = game.skillLevel("bounties");
  const out = [sect(`Bounties — level ${lvl}, ${num(s.marks)} Marks`)];

  if (s.bounty) {
    const m = DB.monster(s.bounty.monsterId);
    const done = s.bounty.total - s.bounty.remaining;
    const row = el(`<div class="row-card is-active">
      ${foeMark(m)}
      <span class="row-card__body">
        <span class="row-card__title">${esc(m.name)}<span class="badge badge--on">Contract</span></span>
        <span class="row-card__sub" id="cbBounty">${done} / ${s.bounty.total} killed</span>
        <span class="bar bar--sm" style="margin-top:6px"><span class="bar__fill" id="cbBountyBar" style="--fill:${((done / s.bounty.total) * 100).toFixed(1)}%"></span></span>
      </span></div>`);
    out.push(row);
    out.push(toolbar([
      { text: "Hunt it", onClick: () => { game.fight(s.bounty.monsterId, areaFor(s.bounty.monsterId)?.id); rerender(); } },
      { text: "Abandon", onClick: () => { game.abandonBounty(); toast("Contract abandoned", "bad"); rerender(); } },
    ]));
    return out;
  }

  for (const t of game.bountyTiers()) {
    const locked = lvl < t.level;
    const b = el(`<button class="row-card${locked ? " is-locked" : ""}" type="button"${locked ? " disabled" : ""}>
      ${mark(t.id, initials(t.name))}
      <span class="row-card__body">
        <span class="row-card__title">${esc(t.name)}</span>
        <span class="row-card__sub">${locked ? `Unlocks at Bounties ${t.level}` : `${t.count} kills, monsters level ${t.band[0]}–${t.band[1]}`}</span>
        ${locked ? "" : `<span class="row-card__meta">Pays about ${num(Math.round(t.band[1] * t.count * t.marksPer))} Marks</span>`}
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${t.level}</span><span class="row-card__lvl-cap">req</span></span>
    </button>`);
    if (!locked) b.onclick = () => {
      const err = game.takeBounty(t.id);
      if (err) return toast(err, "bad");
      toast(`Contract: ${DB.monster(game.state.bounty.monsterId).name} ×${game.state.bounty.total}`, "violet");
      rerender();
    };
    out.push(b);
  }
  return out;
}

/* =========================================================================
   AREA SELECT AND THE MONSTER LIST
   ========================================================================= */

function areaPanel(ctx) {
  const { game, render: rerender, toast } = ctx;
  const out = [];
  const options = AREAS.map((a) => [a.id, `${a.name}${areaLocked(game, a) ? " (locked)" : ""}`]);
  /* Open on whatever the player is actually looking at: their own pick
     first, then the area they entered the fight from, then — for a fight
     restored from a save that predates area tracking, or started from a
     bounty contract rather than from this list — the area the monster in
     front of them lives in. Falling straight to AREAS[0] would show a
     tier-one list to someone mid-fight at tier four. */
  const fighting = game.state.combat?.monsterId;
  const current =
    openArea || game.state.areaId || (fighting && areaFor(fighting)?.id) || AREAS[0].id;
  out.push(selector("Select Combat Area", options, current, (v) => { openArea = v; rerender(); }));

  const area = AREA_BY_ID.get(current) || AREAS[0];
  const locked = areaLocked(game, area);
  out.push(el(`<p class="row-card__sub" style="white-space:normal;padding:0 var(--s-2) var(--s-2)">${esc(area.blurb)}${locked ? ` — ${esc(locked)}.` : ""}</p>`));

  for (const id of area.monsters) {
    const m = DB.monster(id);
    const fighting = game.state.combat?.monsterId === id;
    const b = el(`<button class="row-card${fighting ? " is-active" : ""}${locked ? " is-locked" : ""}" type="button"${locked ? " disabled" : ""}>
      ${foeMark(m)}
      <span class="row-card__body">
        <span class="row-card__title">${esc(m.name)}${fighting ? '<span class="badge badge--on">Fighting</span>' : ""}</span>
        <span class="row-card__sub">${num(m.hp)} HP · max hit ${num(m.maxHit)} · ${num(Math.round(weaponXp(m)))} xp</span>
        <span class="row-card__meta">Chance to hit ${pct2(game.chanceToHit(id))} · ${num(m.cogs[0])}–${num(m.cogs[1])} cogs</span>
      </span>
      <span class="row-card__right"><span class="row-card__lvl">${m.level}</span><span class="row-card__lvl-cap">level</span></span>
    </button>`);
    if (!locked) b.onclick = () => { game.fight(id, area.id); ctx.markDirty(); toast(`Engaging ${m.name}`); };
    out.push(b);
  }
  return out;
}

/* =========================================================================
   RENDER
   ========================================================================= */

function render(ctx) {
  const { game, render: rerender } = ctx;
  prefs(game);
  const s = game.state;
  const out = [combatNav(ctx, "combat")];

  /* §1's COMBAT block: the eight levels, and the derived Combat Level. */
  out.push(statSplit([
    ["Combat Level", int(game.combatLevel())],
    ["Prayer", num(s.prayer)],
    ["Marks", num(s.marks)],
  ]));
  out.push(el(`<section class="panel panel--tight"><div class="bank-grid">${
    COMBAT_BLOCK.map((id) => `<div class="bank-cell">
      <div class="bank-cell__qty u-tnum">${game.skillLevel(id)}</div>
      <div class="bank-cell__name">${esc(DB.skill(id).name)}</div>
      <div class="bank-cell__each">/ ${game.levelCap}</div></div>`).join("")
  }</div></section>`));

  out.push(playerPanel(ctx));
  out.push(foodPanel(ctx));

  if (s.combat) out.push(enemyPanel(ctx));
  else out.push(el(`<div class="row-card"><span class="row-card__body">
    <span class="row-card__title">No Monster Selected</span>
    <span class="row-card__sub">Pick an area below, then something in it.</span></span></div>`));

  out.push(sect("Equipment"));
  out.push(equipmentPanel(ctx));
  out.push(stylePanel(ctx));
  out.push(...statBlocks(ctx));
  out.push(...lootPanel(ctx));

  /* No sect() here: the dropdown inside areaPanel already carries the
     reference's own "Select Combat Area" label, and printing it twice reads
     as a rendering fault. */
  out.push(...areaPanel(ctx));

  out.push(...bountyPanel(ctx));
  out.push(...devotionPanel(ctx));

  out.push(sect("Offline combat"));
  const t = el(`<button class="row-card" type="button">
    <span class="row-card__body"><span class="row-card__title">Fight while away</span>
    <span class="row-card__sub">Off by default — combat and Larceny can both kill you.</span></span>
    <span class="badge${s.offlineCombat ? " badge--on" : ""}">${s.offlineCombat ? "On" : "Off"}</span></button>`);
  t.onclick = () => { s.offlineCombat = !s.offlineCombat; rerender(); };
  out.push(t);
  return out;
}

/** Per-tick: the bars and the counters, written in place. */
function paint(ctx) {
  const { game, set, fill } = ctx;
  const s = game.state;
  const max = game.maxHp(), hp = game.hp();
  set("cbHpTxt", `${int(hp)} / ${int(max)} HP`);
  fill("cbHpBar", (hp / max) * 100);
  const drain = game.prayerDrain();
  set("cbPrayer", `${int(s.prayer)} prayer points${drain ? ` · -${drain}/swing` : ""}`);

  if (s.combat) {
    const m = DB.monster(s.combat.monsterId);
    set("cbFoeTxt", `${int(s.combat.mHp)} / ${int(m.hp)} HP`);
    fill("cbFoeBar", (s.combat.mHp / m.hp) * 100);
  }
  if (s.bounty) {
    const done = s.bounty.total - s.bounty.remaining;
    set("cbBounty", `${done} / ${s.bounty.total} killed`);
    fill("cbBountyBar", (done / s.bounty.total) * 100);
  }
}

export default { id: "combat", label: "Combat", render, paint, reset: () => { openArea = null; } };
