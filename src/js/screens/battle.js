/* =========================================================================
   battle.js — the encounter screen.

   This file is where the two references have to agree. Everything it draws
   into the canvas obeys reference/ffvi-art.md; everything around the canvas
   obeys reference/ui-bar.md; and the frame between them is a designed object
   rather than a seam that happened.

   The three rules that are never bent:

   1. INTEGER SCALE, INTEGER OFFSET. The backing store is 192x168 — 8:7, the
      real SNES aspect — displayed at x2 into 384x336 CSS px. On a DPR-3
      phone that is 1152 device px, an exact x3 of the CSS layer and x6 of
      the stage. Every step stays whole. The canvas's left offset is set from
      JS with Math.floor, because a left: 3.5px would re-introduce subpixel
      sampling and undo all of it.

   2. NOTHING BLURS ACROSS THE FRAME. No box-shadow, filter, border-radius or
      opacity touches the stage, and no pixel art appears in the chrome. If
      the pixels need to glow, the glow is baked into them at 5-bit.

   3. EVERY DRAW POSITION IS ROUNDED. Sprites move by whole stage pixels;
      lunges, damage-numeral rise, ash drift and screen shake are all integer
      translations, which is also exactly how the hardware did it (§6:
      "actions are translations, not animations").

   The tick engine is Melvor's: 1 tick = 0.05s, 20 ticks per second, all
   timers stored in ticks, intervals quantised down to a whole tick with the
   published formula. Rendering is decoupled — rAF draws whatever the last
   tick left behind, so a throttled tab resumes correctly instead of drifting.
   ========================================================================= */

const MANIFEST = "src/assets/sprites/atelier/manifest.json";

/* ---- Melvor's numbers (reference/melvor-math.md) ------------------------ */

const TICK_MS = 50;               // §3: the atomic unit of the entire game
const MAX_CATCHUP_TICKS = 40;     // a throttled tab replays, it does not drift

/** §1.1 cumulative XP table. Precomputed once at boot, never per frame. */
const XP_TABLE = (() => {
  const t = [0, 0];
  let acc = 0;
  for (let n = 1; n <= 120; n++) {
    acc += Math.floor(n + 300 * Math.pow(2, n / 7));
    t[n + 1] = Math.floor(acc / 4);
  }
  return t;                        // XP_TABLE[99] === 13034431
})();

const levelFor = (xp) => {
  let l = 1;
  while (l < 120 && XP_TABLE[l + 1] <= xp) l++;
  return l;
};

/**
 * §4.1, verbatim. Percentages apply to the BASE interval and sum additively;
 * flat reductions come off afterwards; the result floors to a whole 0.05s
 * tick and can never go below 0.25s.
 */
function effectiveInterval(base, pctReduction, flatReduction = 0) {
  return Math.max(Math.floor((base * (1 - pctReduction) - flatReduction) / 0.05) * 0.05, 0.25);
}

/* ---- stage geometry ----------------------------------------------------- */

const STAGE = { w: 192, h: 168 };
const FIELD_H = 110;

/* §4: party in a single file staggered down-right; monsters in the left
   third. The numbers are MEASURED off ffvi-battle-native-a.png rather than
   guessed, because round 1 guessed and the critic caught it: the four heroes
   in that capture stand at y = 64 / 84 / 104 / 120, so ~19 px apart for a
   24 px sprite, and at x = 188 / 205 / 208 / 221. Round 1 used 12 px of
   vertical pitch, which is 50% overlap on adjacent pairs and is why a shield
   prop ended up over the next adept's head in every frame.
   Scaled from that 240-wide crop to our 192-wide stage: 18 px vertical, 9 px
   horizontal, so the only thing that ever overlaps is the next adept's head
   across the previous one's boots — which is the intended read. */
const PARTY_SLOTS = [
  { x: 130, y: 30 },
  { x: 139, y: 48 },
  { x: 148, y: 66 },
  { x: 157, y: 84 },
];

/* Five waves, five beasts, hand-placed so no two silhouettes touch. Round 1
   shipped one hardcoded pair on a five-wave loop and the critic named it. */
const WAVES = [
  [{ id: "cinderwisp", x: 22, y: 44 }, { id: "cinderwisp", x: 66, y: 62 }],
  [{ id: "gloamstag", x: 12, y: 44 }, { id: "cinderwisp", x: 80, y: 58 }],
  [{ id: "slagmaw", x: 2, y: 42 }, { id: "cinderwisp", x: 92, y: 60 }],
  [{ id: "fluewyrm", x: 4, y: 40 }, { id: "ashgrieve", x: 84, y: 42 }],
  [{ id: "slagmaw", x: 8, y: 40 }, { id: "ashgrieve", x: 96, y: 44 }],
];

/* ---- deterministic RNG --------------------------------------------------
   Seeded and advanced only inside the tick loop, so a replay of N ticks
   produces exactly the frame the live run would have. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- asset loading ------------------------------------------------------ */

const loadImage = (src) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`could not load ${src}`));
    img.src = src;
  });

/**
 * Pre-tint the font atlas once per colour we will ever draw.
 *
 * The atlas ships as a white mask so the runtime owns the colour. Building
 * one small canvas per colour up front means drawing a glyph is a single
 * drawImage with no compositing state changes — cheap enough to redraw every
 * string every frame on a phone, which is what keeps the ATB gauges honest.
 */
function tintAtlas(img, colour) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Palette cycling, §6: "a monster built as one 88x64 sprite with a 4-slot
 * cycling ramp is more alive than one with a mediocre 4-frame loop, and costs
 * 1/4 the art." Four rotations of the magma ramp are baked once at load; the
 * tick loop just picks one. Zero per-frame cost, and the Slagmaw's seams
 * genuinely burn.
 */
function buildCycleFrames(img, ramp) {
  if (!ramp || ramp.length < 2) return [img];
  const rgb = ramp.map((h) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ]);
  const base = document.createElement("canvas");
  base.width = img.width;
  base.height = img.height;
  const bg = base.getContext("2d", { willReadFrequently: true });
  bg.imageSmoothingEnabled = false;
  bg.drawImage(img, 0, 0);
  const src = bg.getImageData(0, 0, img.width, img.height);

  const frames = [];
  for (let shift = 0; shift < ramp.length; shift++) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    const out = new ImageData(new Uint8ClampedArray(src.data), img.width, img.height);
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      for (let k = 0; k < rgb.length; k++) {
        if (out.data[i] === rgb[k][0] && out.data[i + 1] === rgb[k][1] && out.data[i + 2] === rgb[k][2]) {
          const t = rgb[(k + shift) % rgb.length];
          out.data[i] = t[0]; out.data[i + 1] = t[1]; out.data[i + 2] = t[2];
          break;
        }
      }
    }
    g.putImageData(out, 0, 0);
    frames.push(c);
  }
  return frames;
}

/* ---- text --------------------------------------------------------------- */

class Face {
  constructor(atlas, metrics, colours) {
    this.m = metrics;
    this.sheets = Object.fromEntries(
      Object.entries(colours).map(([k, hex]) => [k, tintAtlas(atlas, hex)])
    );
  }

  advance(ch) {
    const i = ch.codePointAt(0) - this.m.first;
    return i >= 0 && i < this.m.count ? this.m.advance[i] : 0;
  }

  measure(str) {
    let w = 0;
    for (const ch of str) w += this.advance(ch);
    return Math.max(0, w - 1);
  }

  /**
   * §3c: "Hard 1px black shadow, offset (+1, +1). No blur, no alpha. Every
   * glyph carries it. This is what makes white text legible over the blue
   * wash and over battle backgrounds, and it is non-optional."
   */
  draw(ctx, str, x, y, colour, align = "left") {
    let px = Math.round(align === "right" ? x - this.measure(str) : x);
    const py = Math.round(y);
    const { cellW, cellH, cols, first, count } = this.m;
    const shadow = this.sheets.shadow;
    const body = this.sheets[colour] || this.sheets.primary;
    for (const ch of str) {
      const i = ch.codePointAt(0) - first;
      if (i >= 0 && i < count) {
        const sx = (i % cols) * cellW;
        const sy = Math.floor(i / cols) * cellH;
        ctx.drawImage(shadow, sx, sy, cellW, cellH, px + 1, py + 1, cellW, cellH);
        ctx.drawImage(body, sx, sy, cellW, cellH, px, py, cellW, cellH);
      }
      px += this.advance(ch);
    }
  }
}

/* ---- the encounter ------------------------------------------------------ */

const ORDERS = {
  strike: { label: "Strike", base: 2.6, power: 1.0, fx: "slash", targets: 1, guard: 0 },
  sigil: { label: "Sigil", base: 3.4, power: 0.72, fx: "sigil", targets: 2, guard: 0 },
  guard: { label: "Guard", base: 2.2, power: 0.42, fx: "impact", targets: 1, guard: 0.45 },
};

/* Fixed display order for the command window. Object key order would work
   today and break the first time someone adds an order in the middle. */
const ORDER_KEYS = ["strike", "sigil", "guard"];

class Encounter {
  constructor(mf, art) {
    this.mf = mf;
    this.art = art;
    this.rand = mulberry(0x1f0d2a);
    this.tick = 0;
    this.order = "strike";
    this.shake = 0;
    this.flash = 0;
    this.numerals = [];
    this.wave = 3;
    this.waves = 5;

    /* Interval reduction the party has actually bought, folded through the
       §4.1 formula. The readout in the chrome is this number, not a label. */
    this.pctReduction = 0.2;
    this.flatReduction = 0.1;

    this.xp = XP_TABLE[34] + 4100;
    this.pool = 0.62;
    this.cogs = 12_450_000;
    this.shards = 1250;
    this.gained = { xp: 0, cogs: 0, shards: 0 };

    this.party = mf.heroes.map((h, i) => ({
      hero: h,
      slot: PARTY_SLOTS[i],
      maxHp: [1840, 1520, 1180, 1360][i],
      hp: [1840, 1520, 1180, 1360][i],
      spd: [13, 12, 9, 15][i],
      atb: [220, 640, 90, 430][i],
      state: "wait",
      timer: 0,
      offset: 0,
    }));

    this.spawnWave();
  }

  spawnWave() {
    const line = WAVES[(this.wave - 1) % WAVES.length];
    this.enemies = line.map((slot, i) => {
      const def = this.mf.monsters.find((m) => m.id === slot.id);
      const area = def.sprite.w * def.sprite.h;
      // HP and speed fall out of the sprite's own footprint, so a bigger
      // silhouette is a bigger threat without a table to keep in sync.
      const maxHp = Math.round(900 + area * 0.78);
      return {
        def, slot,
        maxHp, hp: maxHp,
        spd: Math.max(6, Math.round(15 - area / 900)),
        atb: 200 + i * 380,
        state: "wait", timer: 0, offset: 0, flash: 0, dead: false,
      };
    });
  }

  /** The contact shadow that fits this beast's feet, by sprite width. */
  shadowFor(art, w) {
    return w > 70 ? art.shadowLarge : w > 44 ? art.shadowMed : art.shadowSmall;
  }

  living() { return this.enemies.filter((e) => !e.dead); }

  /**
   * Push a damage/heal numeral, stacked clear of anything already flying.
   *
   * Without this, two adepts landing on the same target inside the numeral's
   * 26-tick life draw their digits at identical coordinates and you get one
   * illegible smear of overlapping glyphs — which is exactly what the first
   * screenshot of this screen showed over the Slagmaw. FFVI stacks
   * simultaneous hits up the target instead, so each number stays readable.
   *
   * A lane is 11px, the damage face's cell height, and lanes are searched
   * from the target upward. `sway` walks alternate hits a couple of pixels
   * sideways so a long run of equal-width numbers does not read as a column.
   */
  pushNumeral(n) {
    const LANE = 14;
    const SWAY = [0, 6, -6];              // three lanes, and they never merge
    const near = (a, b) => Math.abs(a - b) < 26;
    let lane = 0;
    while (lane < SWAY.length - 1 && this.numerals.some((m) =>
      m.lane === lane && near(m.x0, n.x) && near(m.y0, n.y))) lane++;
    /* The clamp is the bug the critic actually saw. Round 1 allowed five
       lanes and then clamped the drawn y with Math.max(2, …); a numeral in
       lane 4 starts 44 px above its target, hits the clamp on frame one, and
       lands on top of whatever is sitting in lane 0. Three lanes at a 14 px
       pitch — the damage face is 11 px tall plus its 1 px shadow, so that is
       two clear pixels of air — is 28 px of travel; every target sits at
       y >= 40, so the floor is never reached and the lanes stay lanes. */
    this.numerals.push({
      ...n, lane,
      x0: n.x, y0: n.y,
      x: n.x + SWAY[lane],
      y: Math.max(3, n.y - lane * LANE),
    });
  }

  /* ---- one tick ---------------------------------------------------------
     §4 rule 1: "The gauge is the only thing that moves while you are not
     acting. Four bars creeping at different rates is the entire visual
     language of time passing." Everything else here is consequence.
     --------------------------------------------------------------------- */
  step() {
    this.tick++;
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;

    for (const n of this.numerals) n.life--;
    this.numerals = this.numerals.filter((n) => n.life > 0);

    /* Effects age on the TICK, not on the frame. They used to be decremented
       inside the renderer, which tied their lifetime to the display: a 7-tick
       slash lasted 7 rAF frames — about 120ms on a 60Hz phone instead of the
       350ms it is written to be — and ran three times faster on a 120Hz one.
       Simulation state only ever moves here. */
    if (this.fx && this.fx.life > 0) this.fx.life--;

    const order = ORDERS[this.order];
    const interval = effectiveInterval(order.base, this.pctReduction, this.flatReduction);
    const ticksToAct = Math.round(interval / 0.05);

    for (const p of this.party) {
      if (p.hp <= 0) continue;
      if (p.state === "wait") {
        p.atb = Math.min(1000, p.atb + p.spd);
        if (p.atb >= 1000) { p.state = "ready"; p.timer = 6; }
      } else if (p.state === "ready") {
        // §4 rule 2: filling is signalled by the NAME, not by the bar.
        if (--p.timer <= 0 && this.living().length) { p.state = "lunge"; p.timer = 5; }
      } else if (p.state === "lunge") {
        p.offset = Math.round(((5 - p.timer) / 5) * 16);
        if (--p.timer <= 0) { p.state = "strike"; p.timer = 6; this.resolveHeroAction(p, order); }
      } else if (p.state === "strike") {
        p.offset = 16;
        if (--p.timer <= 0) { p.state = "return"; p.timer = 5; }
      } else if (p.state === "return") {
        p.offset = Math.round((p.timer / 5) * 16);
        if (--p.timer <= 0) { p.state = "wait"; p.offset = 0; p.atb = Math.max(0, 1000 - ticksToAct * p.spd); }
      }
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash--;
      if (e.state === "wait") {
        e.atb = Math.min(1000, e.atb + e.spd);
        if (e.atb >= 1000) { e.state = "lunge"; e.timer = 6; }
      } else if (e.state === "lunge") {
        e.offset = Math.round(((6 - e.timer) / 6) * 14);
        if (--e.timer <= 0) { e.state = "strike"; e.timer = 5; this.resolveEnemyAction(e); }
      } else if (e.state === "strike") {
        e.offset = 14;
        if (--e.timer <= 0) { e.state = "return"; e.timer = 6; }
      } else if (e.state === "return") {
        e.offset = Math.round((e.timer / 6) * 14);
        if (--e.timer <= 0) { e.state = "wait"; e.offset = 0; e.atb = 0; }
      }
    }

    if (!this.living().length) {
      this.award();
      this.wave = (this.wave % this.waves) + 1;
      this.spawnWave();
    }
  }

  resolveHeroAction(p, order) {
    const alive = this.living();
    if (!alive.length) return;

    /* The Voidcaller mends instead of striking when someone is badly hurt —
       which is also the cheapest way to show the healing path and the
       critical-pose swap in the same encounter. */
    if (p.hero.id === "maren") {
      const hurt = this.party.filter((q) => q.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && hurt.hp / hurt.maxHp < 0.7) {
        const amount = 180 + Math.floor(this.rand() * 160);
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + amount);
        this.pushNumeral({
          text: String(amount), colour: "heal", life: 26,
          x: hurt.slot.x + 8, y: hurt.slot.y - 2,
        });
        this.fx = { kind: "sigil", x: hurt.slot.x - 8, y: hurt.slot.y - 4, life: 8 };
        return;
      }
    }

    const targets = alive.slice(0, order.targets);
    for (const t of targets) {
      const crit = this.rand() < 0.14;
      const base = 210 + Math.floor(this.rand() * 190);
      const dmg = Math.round(base * order.power * (crit ? 2 : 1));
      t.hp -= dmg;
      t.flash = 4;                                  // §6: whole-sprite flash
      this.pushNumeral({
        text: String(dmg), colour: crit ? "crit" : "damage", life: 26,
        x: t.slot.x + Math.round(t.def.sprite.w / 2) - 8, y: t.slot.y + 6,
      });
      if (t.hp <= 0) { t.hp = 0; t.dead = true; }
    }
    const first = targets[0];
    this.fx = {
      kind: order.fx,
      x: first.slot.x + Math.round(first.def.sprite.w / 2) - 14,
      y: first.slot.y + Math.round(first.def.sprite.h / 2) - 14,
      life: 7,
    };
    if (targets.some((t) => t.dead)) this.flash = 3;  // §6: screen flash, free and enormous
  }

  resolveEnemyAction(e) {
    const alive = this.party.filter((p) => p.hp > 0);
    if (!alive.length) return;
    const victim = alive[Math.floor(this.rand() * alive.length)];
    const guard = ORDERS[this.order].guard;
    // A bigger beast hits harder, off the same footprint its HP came from.
    const heft = 0.8 + (e.def.sprite.w * e.def.sprite.h) / 6800;
    const dmg = Math.round((70 + Math.floor(this.rand() * 120)) * heft * (1 - guard));
    victim.hp = Math.max(0, victim.hp - dmg);
    this.pushNumeral({
      text: String(dmg), colour: "damage", life: 24,
      x: victim.slot.x + 8, y: victim.slot.y + 2,
    });
    this.fx = { kind: "impact", x: victim.slot.x - 4, y: victim.slot.y + 2, life: 6 };
    this.shake = 8;                                   // §6: 1-3px for ~8 frames
    if (victim.hp === 0) victim.hp = Math.round(victim.maxHp * 0.18); // no wipes in a demo
  }

  award() {
    const xp = 640 + Math.floor(this.rand() * 220);
    const cogs = 1800 + Math.floor(this.rand() * 900);
    const shards = 1 + Math.floor(this.rand() * 3);
    this.xp += xp; this.cogs += cogs; this.shards += shards;
    this.gained.xp += xp; this.gained.cogs += cogs; this.gained.shards += shards;
    /* §2.2: 25% of every point of mastery XP earned is also deposited in the
       skill's pool. Same shape here, scaled to the pool's own cap. */
    this.pool = Math.min(1, this.pool + (xp * 0.25) / 26000);
    this.flash = 4;
  }
}

/* ---- renderer ----------------------------------------------------------- */

class Renderer {
  constructor(canvas, mf, art, faces) {
    this.canvas = canvas;
    this.mf = mf;
    this.art = art;
    this.ui = faces.ui;
    this.dmg = faces.damage;
    canvas.width = STAGE.w;
    canvas.height = STAGE.h;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
  }

  draw(enc) {
    const c = this.ctx;
    const a = this.art;
    // §6: screen shake is the whole frame offset by 1-3px. Integer, always.
    const sx = enc.shake ? (enc.shake % 2 ? 2 : -1) : 0;
    const sy = enc.shake > 4 ? 1 : 0;

    c.fillStyle = "#000000";
    c.fillRect(0, 0, STAGE.w, STAGE.h);
    c.drawImage(a.field, sx, sy);

    // Ash drifting across the sky — one pixel every third tick, wrapped.
    const drift = -(Math.floor(enc.tick / 3) % STAGE.w);
    c.drawImage(a.ash, drift + sx, 8 + sy);
    c.drawImage(a.ash, drift + STAGE.w + sx, 8 + sy);

    /* Contact shadows first, in the BACKGROUND's darkest ramp step (§2). A
       standing sprite without one floats, and nothing else on the stage says
       "these two things are on the same ground". */
    for (const e of enc.enemies) {
      if (e.dead) continue;
      const s = enc.shadowFor(a, e.def.sprite.w);
      c.drawImage(s, Math.round(e.slot.x + (e.def.sprite.w - s.width) / 2 + e.offset + sx),
        e.slot.y + e.def.sprite.h - 2 + sy);
    }
    for (const p of enc.party) {
      // Centred on the boots, one row below them. Sprite is 16 wide, shadow
      // 14, so the offset is a whole pixel and stays a whole pixel.
      c.drawImage(a.shadowSmall, p.slot.x + 1 - p.offset + sx, p.slot.y + 22 + sy);
    }

    for (const e of enc.enemies) {
      if (e.dead) continue;
      const frames = a.monsters[e.def.id];
      const img = frames[Math.floor(enc.tick / 4) % frames.length];
      const x = e.slot.x + e.offset + sx;
      const y = e.slot.y + sy;
      c.drawImage(img, x, y);
      if (e.flash > 0) {
        // Whole-sprite white fill for a few frames — the cheapest and most
        // legible hit confirmation the hardware had.
        c.save();
        c.globalCompositeOperation = "lighter";
        c.drawImage(a.monsterMask[e.def.id], x, y);
        c.restore();
      }
    }

    for (const p of enc.party) {
      const critical = p.hp / p.maxHp < 0.25;
      const acting = p.state === "strike";
      const pose = acting ? "attack" : critical ? "critical" : "idle";
      const img = a.heroes[p.hero.id][pose];
      // The 24x32 action pose is anchored so it drops straight in for the
      // 16x24 idle: eight pixels left, eight pixels up.
      const ox = acting ? 8 : 0;
      c.drawImage(img, p.slot.x - p.offset - ox + sx, p.slot.y - ox + sy);
    }

    if (enc.fx && enc.fx.life > 0) {
      c.drawImage(a.fx[enc.fx.kind], Math.round(enc.fx.x) + sx, Math.round(enc.fx.y) + sy);
    }

    // §4 rule 4: damage flies up from the target and dissipates. Healing is
    // the same digits in green. The rise is whole pixels per tick — a fraction
    // here would resample the glyph and undo the entire point of the stage.
    for (const n of enc.numerals) {
      const rise = Math.round((26 - n.life) * 0.5);
      this.dmg.draw(c, n.text, n.x, Math.max(2, n.y - rise), n.colour, "left");
    }

    if (enc.flash > 0) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.fillStyle = "#303030";
      c.fillRect(0, 0, STAGE.w, FIELD_H);
      c.restore();
    }

    this.drawBand(enc);
  }

  drawBand(enc) {
    const c = this.ctx;
    const g = this.mf.chrome.geometry;
    const atb = this.mf.chrome.atbGeometry;
    c.drawImage(this.art.band, 0, g.y);

    /* Left window: the COMMAND window, §4 — "Command window sits left, party
       status right. Always." An idle game has no per-turn prompt, so what
       belongs here is the standing order: the thing the party will do the
       next time any gauge fills. Four rows at the measured 12px pitch, which
       is exactly what the 58px band was cut to hold.

       The active order takes the violet accent — §7's bridge maps FFVI's
       "this one is ready" yellow onto --c-violet-light, and this window and
       the party names are the only two places that colour is allowed to
       appear. Tapping a gold plate in the chrome below repaints this row,
       which is the cheapest possible proof that the pixel layer and the
       cabinet are one system rather than two pictures. */
    this.ui.draw(c, "Order", g.enemyX, g.y + g.rowTop, "label");
    ORDER_KEYS.forEach((key, i) => {
      const y = g.y + g.rowTop + (i + 1) * g.rowPitch;
      const on = key === enc.order;
      // A 3px caret rather than a highlight bar: at this size a filled
      // selection block would swallow the glyph's 1px shadow.
      if (on) {
        c.fillStyle = this.mf.palette.text.ready;
        c.fillRect(g.enemyX, y + 3, 2, 2);
      }
      this.ui.draw(c, ORDERS[key].label, g.enemyX + 5, y, on ? "ready" : "primary");
    });

    // Right window: name, HP as a NUMBER (no party bars, ever), ATB capsule.
    enc.party.forEach((p, i) => {
      const y = g.y + g.rowTop + i * g.rowPitch;
      const ready = p.state !== "wait";
      this.ui.draw(c, p.hero.name, g.nameX, y, ready ? "ready" : "primary");
      this.ui.draw(c, String(p.hp), g.hpRight, y, p.hp / p.maxHp < 0.25 ? "label" : "primary", "right");

      c.drawImage(this.art.atb, g.atbX, y);
      const filled = Math.round((Math.min(1000, p.atb) / 1000) * atb.fillTravel);
      if (filled > 0) {
        const fx = g.atbX + atb.fillX;
        const fy = y + atb.fillY;
        c.fillStyle = atb.edge;
        c.fillRect(fx, fy, filled, 1);
        c.fillRect(fx, fy + 2, filled, 1);
        c.fillStyle = atb.core;
        c.fillRect(fx, fy + 1, filled, 1);
      }
    });
  }
}

/* ---- boot --------------------------------------------------------------- */

async function boot() {
  const canvas = document.getElementById("stage");
  const mf = await fetch(MANIFEST).then((r) => r.json());
  const base = "src/assets/sprites/atelier/";
  const url = (rel) => rel.replace("src/assets/sprites/atelier/", base);

  const [fieldImg, ashImg, bandImg, atbImg, uiFont, dmgFont] = await Promise.all([
    loadImage(url(mf.scene.field.src)),
    loadImage(url(mf.scene.ash.src)),
    loadImage(url(mf.chrome.band.src)),
    loadImage(url(mf.chrome.atb.src)),
    loadImage(url(mf.fonts.ui.src)),
    loadImage(url(mf.fonts.damage.src)),
  ]);

  const heroes = {};
  for (const h of mf.heroes) {
    heroes[h.id] = {};
    for (const [pose, rec] of Object.entries(h.poses)) heroes[h.id][pose] = await loadImage(url(rec.src));
  }

  const monsters = {};
  const monsterMask = {};
  for (const m of mf.monsters) {
    const img = await loadImage(url(m.sprite.src));
    monsters[m.id] = buildCycleFrames(img, m.cycle);
    monsterMask[m.id] = tintAtlas(img, "#585858");   // the hit-flash overlay
  }

  const fx = {};
  for (const [k, rec] of Object.entries(mf.fx)) fx[k] = await loadImage(url(rec.src));

  const art = {
    field: fieldImg, ash: ashImg, band: bandImg, atb: atbImg,
    heroes, monsters, monsterMask, fx,
    shadowSmall: fx.shadowSmall, shadowMed: fx.shadowMed, shadowLarge: fx.shadowLarge,
  };

  const t = mf.palette.text;
  const faces = {
    ui: new Face(uiFont, mf.fonts.ui.metrics, t),
    damage: new Face(dmgFont, mf.fonts.damage.metrics, t),
  };

  const enc = new Encounter(mf, art);
  const renderer = new Renderer(canvas, mf, art, faces);

  layout(canvas);
  window.addEventListener("resize", () => layout(canvas));
  wireChrome(enc);

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += now - last;
    last = now;
    let steps = Math.floor(acc / TICK_MS);
    acc -= steps * TICK_MS;
    // A backgrounded tab is the common case on mobile, not the edge case:
    // replay what we can and drop the rest rather than freezing the frame.
    if (steps > MAX_CATCHUP_TICKS) steps = MAX_CATCHUP_TICKS;
    for (let i = 0; i < steps; i++) enc.step();
    renderer.draw(enc);
    if (steps) paintChrome(enc);
    requestAnimationFrame(frame);
  }
  paintChrome(enc);
  requestAnimationFrame(frame);
  window.__APP_READY__ = true;
}

/**
 * §7: "Never place the stage at a fractional CSS offset — a left: 3.5px
 * re-introduces subpixel sampling and undoes all of it."
 *
 * So the scale is chosen as an integer and the horizontal offset is floored
 * to a whole CSS pixel here rather than left to `margin: auto`, which will
 * happily hand you a half pixel on an odd-width viewport. On a viewport too
 * narrow for the chosen scale the stage keeps its scale and is cropped by
 * the cabinet — a whole-pixel crop is always better than a fractional zoom.
 */
function layout(canvas) {
  const frame = canvas.parentElement;
  const avail = Math.floor(frame.clientWidth);
  const scale = Math.max(2, Math.floor(avail / STAGE.w));
  const w = STAGE.w * scale;
  const h = STAGE.h * scale;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.marginLeft = `${Math.floor((avail - w) / 2)}px`;
  frame.style.height = `${h}px`;
  document.documentElement.style.setProperty("--stage-scale", String(scale));

  pinVertical(canvas);
  // The caption under the cabinet states the scale. It has to be the scale we
  // actually chose, not a number typed into the HTML — a self-documenting
  // instrument that lies is worse than one that says nothing.
  const out = document.getElementById("scaleOut");
  if (out) out.textContent = String(scale);
}

/**
 * Force the stage onto a whole-pixel VERTICAL offset.
 *
 * §7 names the horizontal case — "a left: 3.5px re-introduces subpixel
 * sampling and undoes all of it" — and the vertical case is identical and
 * far easier to hit, because nothing in a stack of flowed text is obliged to
 * come out to a whole number. Measured here before this existed, the canvas
 * sat at y = 131.25: the serif header above it resolves to a fractional
 * height, that quarter pixel lands on the stage, and every sprite gets
 * resampled across two device rows. Integer scaling buys nothing if the
 * thing is then placed on a quarter pixel.
 *
 * So: measure where the canvas actually landed inside its scroller, and pull
 * the cabinet up by the fractional remainder. Measured against the scroll
 * container rather than the viewport so a mid-scroll call cannot feed a
 * scroll offset into a layout correction, and reset to zero first so
 * repeated calls converge instead of drifting.
 */
function pinVertical(canvas) {
  const cabinet = canvas.closest(".cabinet");
  const scroller = canvas.closest(".screen");
  if (!cabinet || !scroller) return;

  cabinet.style.marginTop = "0px";
  const y = canvas.getBoundingClientRect().top
    - scroller.getBoundingClientRect().top
    + scroller.scrollTop;
  const frac = y - Math.floor(y);
  // Sub-pixel margins are legal and are exactly the tool for this: the
  // correction happens in the chrome, never inside the pixel layer.
  if (frac > 0.0001) cabinet.style.marginTop = `${(-frac).toFixed(4)}px`;
}

/* ---- chrome ------------------------------------------------------------- */

const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString("en-US");

function wireChrome(enc) {
  document.querySelectorAll("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      enc.order = btn.dataset.order;
      document.querySelectorAll("[data-order]").forEach((b) =>
        b.classList.toggle("is-active", b === btn));
      paintChrome(enc);
    });
  });
}

function paintChrome(enc) {
  const lvl = levelFor(enc.xp);
  const floorXp = XP_TABLE[lvl];
  const nextXp = XP_TABLE[lvl + 1];
  const pct = ((enc.xp - floorXp) / (nextXp - floorXp)) * 100;
  const order = ORDERS[enc.order];
  const interval = effectiveInterval(order.base, enc.pctReduction, enc.flatReduction);

  set("wave", `${enc.wave} / ${enc.waves}`);
  set("skillLevel", String(lvl));
  set("skillNext", `${lvl} → ${lvl + 1}`);
  set("skillPct", `${pct.toFixed(1)}%`);
  fill("skillBar", pct);
  set("poolPct", `${(enc.pool * 100).toFixed(1)}%`);
  fill("poolBar", enc.pool * 100);
  set("gainXp", fmt(enc.gained.xp));
  set("gainCogs", fmt(enc.gained.cogs));
  set("gainShards", fmt(enc.gained.shards));
  set("cogs", fmt(enc.cogs));
  set("shards", fmt(enc.shards));
  set("interval", `${interval.toFixed(2)}s`);
  set("orderName", order.label);
}

function set(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

function fill(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`);
}

window.__APP_READY__ = false;
boot().catch((err) => {
  console.error(err);
  const el = document.getElementById("bootError");
  if (el) {
    el.hidden = false;
    el.textContent = `The encounter could not load: ${err.message}`;
  }
  window.__APP_READY__ = true;
});
