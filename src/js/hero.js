/* =========================================================================
   EMBERVEIL — HERO

   Owns the home-screen hero block: the key art's load handshake, the ember
   layer, and the small API the rest of the app drives the title stack with.

   Deliberately has no opinion about game rules. It takes numbers and strings
   and paints them; the tick engine decides what they are.
   ========================================================================= */

const MOTE_COUNT = 14;

/* Embers rise out of the forge on the LEFT of the key art, so they are kept
   to the left half. The title block owns the centre and nothing is allowed to
   drift across it. */
const MOTE_X0 = 0.03;
const MOTE_X1 = 0.46;

/** Deterministic stream, so the first painted frame is the same every run
    and a screenshot comparison is not fighting a random particle layout. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Read a colour token out of tokens.css as an "r, g, b" triplet.
    The ember layer is canvas, so it cannot use var() — but it still must not
    invent a colour. It asks the stylesheet instead. */
function tokenRGB(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

class Embers {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.motes = [];
    this.raf = 0;
    this.last = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);

    this.hot = tokenRGB("--c-gold-light", "248, 220, 162");
    this.warm = tokenRGB("--c-gold-core", "215, 167, 71");

    const r = rng(0x3ec0de);
    this.rand = r;
    for (let i = 0; i < MOTE_COUNT; i++) {
      this.motes.push({
        x: MOTE_X0 + r() * (MOTE_X1 - MOTE_X0),
        y: 0.30 + r() * 0.62,
        // Fraction of the hero height per second. Slow: this is heat, not rain.
        vy: 0.012 + r() * 0.022,
        drift: (r() - 0.5) * 0.010,
        size: 0.8 + r() * 1.5,
        alpha: 0.14 + r() * 0.24,
        warm: r() < 0.35,
      });
    }
  }

  resize() {
    const { canvas } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    const bw = Math.round(w * this.dpr);
    const bh = Math.round(h * this.dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    this.w = w;
    this.h = h;
    return true;
  }

  draw(dt) {
    if (!this.resize()) return;
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const m of this.motes) {
      m.y -= m.vy * dt;
      m.x += m.drift * dt;
      if (m.y < 0.16) {
        m.y = 0.94;
        m.x = MOTE_X0 + this.rand() * (MOTE_X1 - MOTE_X0);
      }
      if (m.x < MOTE_X0 || m.x > MOTE_X1) m.drift = -m.drift;

      // Fade in low, fade out high: an ember that pops out of existence at a
      // hard edge is the tell that this is a canvas and not the painting.
      const fade = Math.min(1, (0.94 - m.y) / 0.16) * Math.min(1, (m.y - 0.16) / 0.26);
      const a = m.alpha * fade;
      if (a <= 0.004) continue;

      const px = m.x * w;
      const py = m.y * h;
      const rad = m.size * 3.2;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      const core = m.warm ? this.hot : this.warm;
      g.addColorStop(0, `rgba(${core}, ${a})`);
      g.addColorStop(0.34, `rgba(${core}, ${a * 0.42})`);
      g.addColorStop(1, `rgba(${core}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  start() {
    if (this.raf) return;
    const loop = (t) => {
      const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 0;
      this.last = t;
      this.draw(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }
}

let embers = null;
let els = null;

/**
 * Boot the hero block.
 * @returns {Promise<void>} resolves once the key art has decoded and the first
 *   ember frame is on screen — the app's readiness signal waits on this so a
 *   capture never catches the hero mid-load.
 */
export async function initHero() {
  els = {
    hero: document.getElementById("hero"),
    art: document.getElementById("heroArt"),
    motes: document.getElementById("heroMotes"),
    level: document.getElementById("heroLevel"),
    rarity: document.getElementById("heroRarity"),
    status: document.getElementById("heroStatus"),
  };
  if (!els.hero) return;

  if (els.art) {
    try {
      if (!els.art.complete) {
        await new Promise((res) => {
          els.art.addEventListener("load", res, { once: true });
          els.art.addEventListener("error", res, { once: true });
        });
      }
      if (els.art.decode) await els.art.decode();
    } catch {
      /* A failed decode is survivable: the hero's own background is the page
         ground, so the title block stays legible with no art at all. */
    }
    els.hero.classList.add("is-art-ready");
  }

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (els.motes && !reduced) {
    embers = new Embers(els.motes);
    embers.draw(0);
    embers.start();

    // A hidden tab should not be burning a phone battery on fourteen dots.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) embers.stop();
      else embers.start();
    });
  }
}

/**
 * Drive the title stack from game state.
 * @param {{level?: number|string, rarity?: string, status?: string}} next
 */
export function setAdept(next = {}) {
  if (!els) return;
  if (next.level !== undefined && els.level) els.level.textContent = String(next.level);
  if (next.rarity !== undefined && els.rarity) els.rarity.textContent = next.rarity;
  if (next.status !== undefined && els.status) {
    // Keep the trailing status dot; only the text node ahead of it changes.
    els.status.firstChild.nodeValue = `${next.status} `;
  }
}

/** Show or hide the whole hero block (other tabs do not use it). */
export function setHeroVisible(visible) {
  if (!els?.hero) return;
  els.hero.hidden = !visible;
  if (!embers) return;
  if (visible) embers.start();
  else embers.stop();
}
