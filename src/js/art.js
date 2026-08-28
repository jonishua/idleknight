/* =========================================================================
   EMBERVEIL — asset map

   Binds the pixel art that already exists to the live content database.

   The icons in src/assets/icons/skills/ were authored against the skills
   mockup's own item vocabulary, not this database, so the binding is by KIND
   and TIER rather than by id. Where no sprite exists yet — logs, fish, food —
   the UI falls back to a coloured block. That gap is deliberate: no new art
   gets drawn here.
   ========================================================================= */

const ICON = "src/assets/icons/skills/";
const MOB  = "src/assets/sprites/atelier/monsters/";
const HERO = "src/assets/sprites/atelier/heroes/";
const SCENE = "src/assets/sprites/atelier/scenes/";

/** item id -> 16x16 sprite. Ordered to follow each ladder's own tiering. */
export const ITEM_ICON = {
  /* ores — rock sprites for the real metals, crystals for the invented tiers */
  "cinder-shale":      ICON + "cinder-ore.png",
  "palegrit":          ICON + "palegilt-ore.png",
  "marrowstone":       ICON + "verge-ore.png",
  "verdigris":         ICON + "coalstone.png",
  "slagbloom":         ICON + "pale-prism.png",
  "emberquartz":       ICON + "ember-lens.png",
  "voidglass":         ICON + "veil-shard.png",
  "sunmetal":          ICON + "deep-prism.png",
  "wardens-tear":      ICON + "veil-lens.png",
  "aetherite":         ICON + "aether-mote.png",

  /* bars and plates */
  "shalebrick":        ICON + "cinderbloom-ingot.png",
  "palegrit-billet":   ICON + "palegilt-ingot.png",
  "marrow-billet":     ICON + "vergebrass-ingot.png",
  "slagbloom-billet":  ICON + "emberglass-rivet.png",
  "emberquartz-core":  ICON + "sunwrought-ingot.png",
  "voidglass-lens":    ICON + "veil-lens.png",
  "sunmetal-plate":    ICON + "duskweave-plate.png",
  "warden-alloy":      ICON + "gravebrand-core.png",
  "aetherite-core":    ICON + "stormcast-filament.png",
  "ninefold-ingot":    ICON + "veilforged-heart.png",

  /* sigils */
  "sigil-spark":       ICON + "kindle-sigil.png",
  "sigil-ward":        ICON + "ward-sigil.png",
  "sigil-ember":       ICON + "verge-sigil.png",
  "sigil-tide":        ICON + "grave-sigil.png",
  "sigil-void":        ICON + "veil-sigil.png",
  "sigil-storm":       ICON + "verge-lens.png",
  "sigil-rift":        ICON + "deep-prism.png",
  "sigil-ninefold":    ICON + "veilforged-heart.png",

  /* embers and spoils */
  "ember-cinder":      ICON + "bound-aether.png",
  "ember-bright":      ICON + "aether-mote.png",
  "ember-void":        ICON + "pale-ichor.png",
  "veil-ash":          ICON + "pale-ichor.png",
  "hollow-core":       ICON + "bound-aether.png",
  "rift-sliver":       ICON + "veil-shard.png",
  "stormcrown-shard":  ICON + "stormcast-filament.png",
  "riftbound-heart":   ICON + "veilforged-heart.png",
  "ninefold-core":     ICON + "gravebrand-core.png",
};

/** monster id -> battle sprite at its authored size. */
export const MOB_SPRITE = {
  "hollow-wisp":          { src: MOB + "cinderwisp.png", w: 40, h: 40 },
  "rust-kite":            { src: MOB + "fluewyrm.png",   w: 80, h: 48 },
  "ashen-revenant":       { src: MOB + "ashgrieve.png",  w: 48, h: 64 },
  "slag-behemoth":        { src: MOB + "slagmaw.png",    w: 88, h: 64 },
  "void-harrier":         { src: MOB + "gloamstag.png",  w: 64, h: 56 },
  /* The top four tiers reuse sprites until their own art is drawn. */
  "emberquartz-colossus": { src: MOB + "slagmaw.png",    w: 88, h: 64 },
  "stormcrown-wyrm":      { src: MOB + "fluewyrm.png",   w: 80, h: 48 },
  "riftbound-sovereign":  { src: MOB + "ashgrieve.png",  w: 48, h: 64 },
  "the-ninefold-warden":  { src: MOB + "gloamstag.png",  w: 64, h: 56 },
};

export const PLAYER_SPRITE = { src: HERO + "iska-idle.png", w: 16, h: 24 };
export const PLAYER_ATTACK = { src: HERO + "iska-attack.png", w: 16, h: 24 };
export const BATTLE_SCENE  = SCENE + "slagfen.png";
