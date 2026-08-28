/* =========================================================================
   heroes.mjs — the four adepts of the Emberveil, drawn pixel by pixel.

   Anatomy is the measured one from reference/ffvi-art.md §1, not a guess:

     16 x 24, exactly 2 x 3 tiles         ~2.7 heads tall
     head = the top 9 rows                torso ~8 rows, legs ~7
     almost nobody has a neck             feet are two dark blocks, not drawn
     the head is a SILHOUETTE (hair or helmet), never a face
     eyes are one 1x2 dark pixel pair and nothing else

   Action poses widen to 24 x 32 (3 x 4 tiles) because an outstretched weapon
   needs the extra tile column.

   Palettes follow §2: one tinted outline (never #000000), three-step ramps,
   shadows hue-shifted toward red-brown rather than multiplied, highlights
   desaturated toward the scene light rather than toward white. Every value is
   on the 5-bit grid. Ten to fourteen colours each — sprites do not spend
   their whole 15-slot budget, and neither do ours.

   The characters, their names and their orders are invented for this game.
   ========================================================================= */

import { Surface } from "./raster.mjs";
import { fromHex } from "./palette.mjs";

const C = (h) => fromHex(h);

/* ---- palettes -----------------------------------------------------------
   ROUND 2: every hero is redrawn, and the legend is why.

   Round 1 gave each material three values and let the OUTLINE be the fourth.
   Measured against the reference that is nearly right — FFVI's own hero at
   (188,65) in ffvi-battle-native-a.png spends 122 of its ~290 sprite pixels
   on one near-black, 42% of the sprite — but it is not what makes that sprite
   read. What makes it read is that the near-black is INTERIOR STRUCTURE: it
   cuts the arm off the torso, it goes under the helmet brim, it opens the gap
   between the legs, it sits under the belt. Ours drew a 1px contour and
   filled the inside with flat panels.

   So the legend below is a body plan, not a palette:

     k  outline AND every interior cut — the darkest step of every material
     a b c   skin: shadow, base, light
     m       skin catchlight, 1-3 px, on the lit shoulder or the brow
     d e f   hair: shadow, base, light
     g h i   the LARGEST garment: dark, base, light   (k is its fourth)
     p q r   the second garment / trim: dark, base, light
     z       one accent — a blade edge, a lens, a buckle

   Fifteen slots, which is the budget (§2), and the four-step ramps land on
   the two masses that own the most pixels. The reference's own skin ramp is
   four deep — #784028 #987858 #C87840 #F8B878 — on 71 pixels, so a four-step
   ramp on a small mass is not extravagance, it is the house style.
   ------------------------------------------------------------------------ */

const RELL = {   // Bladewarden — plate steel over a wine tabard
  k: C("#180810"),
  a: C("#683820"), b: C("#B07850"), c: C("#E0A878"), m: C("#F8D8B0"),
  d: C("#281818"), e: C("#503028"), f: C("#785040"),
  g: C("#384050"), h: C("#788090"), i: C("#B0B8C8"),
  p: C("#500820"), q: C("#981038"), r: C("#D84058"),
  z: C("#E0E0E8"),
  j: C("#384050"),
};

/* Iska is the sprite that proves the ramps matter. Her first pass ran the
   coat at #482010 / #784018 / #A86828 — three browns spanning 32% of the
   value range — over copper hair in the same hue family, and at 16x24 the
   whole figure collapsed into one flat brown lozenge. Nothing was wrong with
   the drawing; the palette had no contrast to give it.

   Fixed by widening the coat to a genuine ramp (#281008 -> #D08840, 10% to
   68%) and moving her hair off the coat's hue entirely, to straw. The brass
   stays as the trim on goggles and buckles. */
const ISKA = {   // Cogwright — oiled rust coat, brass goggles, a spanner
  k: C("#180810"),
  a: C("#684830"), b: C("#B08868"), c: C("#E8B890"), m: C("#F8E0C0"),
  d: C("#584828"), e: C("#988048"), f: C("#E0C888"),
  g: C("#281008"), h: C("#804418"), i: C("#D08840"),
  p: C("#806018"), q: C("#C09830"), r: C("#F0D060"),
  z: C("#B0B8C0"),
  j: C("#281008"),
};

/* Maren is the sprite the critic named: "the mage reads as a purple domino".
   That was fair. The robe was two flat vertical fields of indigo covering a
   third of the sprite, and a robe is the LARGEST mass on any mage, so it was
   exactly the wrong place to economise.

   Two changes. The indigo now runs k -> #180830 -> #302068 -> #5038A0, four
   steps with the outline as its foot, and the folds are drawn as vertical
   creases through the field rather than as one lighter stripe. And the sash
   is warm — #907028 through #D8B858 — because eight columns of one hue is a
   domino no matter how many values it has, and the fastest way to break a
   monolith is to put something of a different temperature across it. */
const MAREN = {  // Voidcaller — indigo robe, ash-pale hair, a sigil staff
  k: C("#100818"),
  a: C("#705040"), b: C("#B89078"), c: C("#E8C0A0"), m: C("#F8E0C8"),
  d: C("#605868"), e: C("#A8A0B8"), f: C("#E8E0E8"),
  g: C("#180830"), h: C("#382078"), i: C("#6048B8"),
  p: C("#584018"), q: C("#907028"), r: C("#D8B858"),
  z: C("#E0D8F8"),
  j: C("#180830"),
};

const TESSIN = { // Skyknave — storm-teal scarf over harness leather
  k: C("#081018"),
  a: C("#683820"), b: C("#B07850"), c: C("#E0A878"), m: C("#F8D8B0"),
  d: C("#081810"), e: C("#204030"), f: C("#407860"),
  g: C("#281808"), h: C("#583820"), i: C("#906840"),
  p: C("#084048"), q: C("#107880"), r: C("#48C0C8"),
  z: C("#C0C8D0"),
  j: C("#281808"),
};

/* ---- idle poses, 16 x 24 ------------------------------------------------
   One frame each. §6: "The idle is one frame. Characters do not breathe."
   Life on this screen comes from the ATB gauges and the drifting ash, which
   is exactly the trade the hardware forced and exactly the trade an idle
   game should want.

   The armature is the measured one (§1) and it is the same for all four, so
   they read as a party rather than as four unrelated dolls:

     rows 1-7   head        the head is a SILHOUETTE, and the eye is one dark
                            pixel pair. Faces live in portraits, never here.
     row  8     jaw / neck  one row, because "almost nobody has a neck"
     rows 9-15  torso       col 4 and col 11 are CUT IN OUTLINE, which is what
                            separates each arm from the body
     row  16    belt        a hard horizontal, the sprite's waist
     rows 17-21 legs        with a real gap between them at col 7
     rows 22-23 boots       wider than the leg, in the darkest step

   And the column map is the same for all four, which is what stops the four
   of them reading as four different sizes of doll when they stand in a row:

     col  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
          .  k  A  A  k  F  F  F  B  B  B  k  C  C  k  .

   A = the near arm, F = the FRONT panel of the garment (facing the enemy, so
   it takes the light), B = the back panel a step darker, C = the far arm.
   The two `k` columns at 4 and 11 are the interior cuts, and they are the
   single most important thing on the sprite: without them the arms melt into
   the torso and the figure becomes a slab with a head.

   All four face LEFT, toward the monster side of the field, so the upper-left
   light lands on the front of the figure.
   ------------------------------------------------------------------------ */

const RELL_IDLE = [
  "................",
  "......kkkk......",
  ".....kdeeek.....",
  "....kdefffek....",
  "...kdcbffeeek...",
  "...kdcbbkfeek...",
  "...kcbbbdfeek...",
  "...kabbbdeek....",
  "....kaabkkk.....",
  "...khmhkiihk....",
  "..khhhiiiiijk...",
  ".kihhkiiiiijjk..",
  ".kcbkkrqqiihjk..",
  ".kcbkkrqqiihjk..",
  ".kmbkkrqqiihjk..",
  ".kbbkkqqpiihjk..",
  "..kkkkqqpiihjk..",
  "..kefffffffdjk..",
  "...khiikkihjk...",
  "...kjiikkijjk...",
  "...kjiikkijjk...",
  "...keffkkfejk...",
  "..keffekkeffk...",
  "..kkkkk.kkkkk...",
];

const ISKA_IDLE = [
  "................",
  "......kkkk......",
  ".....keffk......",
  "....keffffek....",
  "...kpqrqpqpqk...",
  "...kcbbfffeek...",
  "...kcbbkfeeek...",
  "...kabbbdeek....",
  "....kaabkkk.....",
  "...kgihkihgk....",
  "..khiiiihhhjk...",
  ".kihikiihhhhjk..",
  ".kcbkkiihqhhjjk.",
  ".kcbkkiihqhhjjk.",
  ".kmbkkiihqhhjjk.",
  ".kbbkkiihqhhjjk.",
  "..kkkkiihhhhjjk.",
  "..kqrqqqqqqqqjk.",
  "..kdiihhhhhhjjk.",
  "...kdiikkihhjk..",
  "...kdiikkihhjk..",
  "...keffkkfehjk..",
  "..keffekkeffk...",
  "..kkkkk.kkkkk...",
];

const MAREN_IDLE = [
  "................",
  "......kkkk......",
  ".....kdeeek.....",
  "....kdefffek....",
  "...kdcbffeeek...",
  "...kcbbkffeeek..",
  "...kcbbbdfeeek..",
  "...kabbbdeeek...",
  "....kaakdeek....",
  "..kzkhiihhhek...",
  "..kqkiiiihhhjk..",
  ".kcbkkiihhihjk..",
  ".kcbkkiihhihjjk.",
  ".kmbkkiihhihjjk.",
  ".kbbkkiihhihjjk.",
  "..kqkkiihhihjjk.",
  "..kqkqrqqqqqqjk.",
  "..kqkrrrrrrrrjk.",
  "..kqkiihhhihjjk.",
  "..kqkiihhhihjjk.",
  "..krkiihhhihjjk.",
  "..kqkgiihhihjjk.",
  "..kpkkgiihhihkk.",
  "...k.kkkkkkkkk..",
];

const TESSIN_IDLE = [
  "................",
  "......kkkk......",
  ".....kdeeek.....",
  "....kdeffeek....",
  "...kdcbffeedk...",
  "...kdcbbkfedk...",
  "...kcbbbdfedk...",
  "...kabbbdedk....",
  "...kqrqqqkk.....",
  "..kqrqqhhqqk....",
  "..kzhiiihhqjk...",
  ".kzcbkkiihhjjk..",
  ".kzcbkkiihhhjjk.",
  ".kzmbkkiiihhjjk.",
  ".kzbbkkiiihhjjk.",
  "..kkkkkiiihhjjk.",
  "..kprppppppphjk.",
  "..kdiihhhhhhjjk.",
  "...kdiikkihhjk..",
  "...kdiikkihhjk..",
  "...kdiikkihhjk..",
  "...keffkkfehjk..",
  "..keffekkeffk...",
  "..kkkkk.kkkkk...",
];

/* ---- critical poses, 16 x 24 -------------------------------------------
   §6 again, and it is the best idea in the whole document: a state change is
   communicated by SWAPPING THE WHOLE SPRITE, not by hanging an icon on it.
   Below a quarter health an adept drops to one knee, and you read the party's
   condition across the field without any UI element saying so.
   ------------------------------------------------------------------------ */

const RELL_CRIT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kddeeek...",
  ".....kdeffeeek..",
  "....kdefffeeek..",
  "....kcbbfeeeek..",
  "....kcbkbfeeek..",
  "....kbbbbdeek...",
  "....kabbbkdek...",
  ".....kaabkkk....",
  "...kiiihhhhiik..",
  "..kihhkhrqqphik.",
  "..kbbkkhrqqphhk.",
  "..kbckhhrqqphhk.",
  "..kmbkhhqqqpihk.",
  "..kbbkiiiiiiihk.",
  "..kkkghhkghhigk.",
  "...kghhkkghhigk.",
  "..kdddkkkgihigk.",
  "..kkkkkkdddddk..",
  "........kkkkk...",
];

const ISKA_CRIT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......keeeffk...",
  ".....keffffeek..",
  "....kdeffffeek..",
  "....kcbbfffeek..",
  "....kpqrqpqpdk..",
  "....kbbbbeeek...",
  "....kabbbkeek...",
  ".....kaabkkk....",
  "...kihhhhhhihk..",
  "..kihiihhhhihgk.",
  "..kbbkkhiihhigk.",
  "..kbckhhiiqhigk.",
  "..kmbkhqqqqqigk.",
  "..kbbkihhhhhigk.",
  "..kkkkhhhkhhigk.",
  "...khhhkkhhhigk.",
  "..kgggkkkhihigk.",
  "..kkkkkkgggggk..",
  "........kkkkk...",
];

const MAREN_CRIT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kdeeeek...",
  ".....kdefffeek..",
  "....kdeffffeek..",
  "....kcbbfffeek..",
  "....kcbkbffeek..",
  "....kbbbbdeeek..",
  "....kabbbdeek...",
  ".....kaakdeek...",
  "..kqkhhhhhhhek..",
  "..kqkhiihhhgek..",
  "..kqkhiihhihgk..",
  "..kqkqqqqqqqgk..",
  "..kqkrrrrrrrgk..",
  "..kqkhiihhihgk..",
  "..krkghiihhhggk.",
  "..kqkkghihhhhgk.",
  "..kqk.kgggggggk.",
  "..kpk..kkkkkkkk.",
  "................",
];

const TESSIN_CRIT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kdeeeek...",
  ".....kdeffeeek..",
  "....kdeffeeedk..",
  "....kcbbfeeedk..",
  "....kcbkbfeedk..",
  "....kbbbbdeedk..",
  "....kabbbdedk...",
  "....kqqrqqkk....",
  "...kqrqqhhqk....",
  "..kzbbkhiihhqk..",
  "..kzbckhiihhhk..",
  "..kzmbkhiiihhk..",
  "..kkkkkppppphk..",
  "...kghiiihhhhk..",
  "..kkkghhkghhigk.",
  "...kghhkkghhigk.",
  "..kgggkkkgihigk.",
  "..kkkkkkgggggk..",
  "........kkkkk...",
];

/* ---- attack poses, 24 x 32 ---------------------------------------------
   §6: "Actions are translations, not animations." The attacker slides
   forward, ONE static strike pose is held for a few frames, a flash happens,
   the attacker slides back. So this is the whole attack animation: one
   drawing per adept, and the engine does the rest with integer offsets.

   The pose is anchored bottom-right so it can be dropped in place of the
   16x24 idle by drawing it 8 px left and 8 px up.
   ------------------------------------------------------------------------ */

const RELL_ATTACK = [
  "........................",
  "..zk....................",
  ".zzk....................",
  ".zzk....................",
  "kzzk....................",
  "kzzk....................",
  "kzzk....................",
  "kzzk....................",
  ".kzzk...................",
  ".kzzk.......kdddeek.....",
  "..kzzk.....kdeffeeek....",
  "..kzzk....kdefffeeeek...",
  "...kzzk...kcbbfeeeeek...",
  "...kbzzk..kcbkbfeeeek...",
  "...kbbzzkkkbbbbdeeek....",
  "....kbbzzkkabbbkdek.....",
  ".....kbbbkkkaabkkk......",
  "......kiiihhhhiiik......",
  ".....kihhkhiiiihkihk....",
  "....kbbkkhrqqqphkihk....",
  "....kbckhhrqqqphhihk....",
  "....kmbkhhrqqqphhigk....",
  ".....kbkihqqqqpihgk.....",
  ".....kkkiiiiiiiikk......",
  "......kghhkkhhgk........",
  "......kghhkkhhgk........",
  "......kgihkkihgk........",
  "......kgihkkihgk........",
  "......kghhkkhhgk........",
  ".....kdddkkkdddk........",
  ".....kkkkk.kkkkk........",
  "........................",
];

const ISKA_ATTACK = [
  "........................",
  "........................",
  "........................",
  "...zzzz.................",
  "..zkkkzz................",
  "..zk..kzz...............",
  "..zk...kzz..............",
  "...zz...kzz.............",
  "....zz...kzz............",
  ".....zz...kzk...........",
  "......zz..kzk.keeeffk...",
  ".......zzkkzkkeffffeek..",
  "........kzzzkdeffffeek..",
  ".........kbzkcbbfffeek..",
  "........kbbbkpqrqpqpdk..",
  ".......kbbbkkbbbbeeek...",
  "......kbbbkkkabbbkeek...",
  ".....kbbbkkihhhaabkk....",
  "....kbbbkkihiihhhhihk...",
  "...kbbkkkhiihhhhhihgk...",
  "...kkkkkkhiihhhhhigk....",
  "........khhiiqhhhigk....",
  "........kihqqqqqigk.....",
  "........kihhhhhhigk.....",
  ".......kzhhhkhhhigk.....",
  "......kzzkhhkhhhigk.....",
  "......kz.khihkhihgk.....",
  ".........khhhkhhhgk.....",
  ".........kgggkgggk......",
  "........kkkkkkkkkk......",
  "........................",
  "........................",
];

const MAREN_CAST = [
  "........................",
  "...........zz...........",
  "..........zrrz..........",
  ".........zrzzrz.........",
  ".........zrzzrz.........",
  "..........zrrz..........",
  "...........zz...........",
  "........................",
  "..........kdeeeek.......",
  ".........kdefffeek......",
  "........kdeffffeeek.....",
  "........kcbbfffeeek.....",
  "........kcbkbffeeek.....",
  "........kbbbbdeeeek.....",
  ".........kabbbdeeek.....",
  "..kbb.....kaakdeek......",
  "..kbba..khhhhhhhhek.....",
  "...kq..khiihhihhhgek....",
  "...kq..kbbkhiihhhhgk....",
  "...kq..kbckhiihhihgk....",
  "...kr..kmbkhiihhihgk....",
  "...kq...kkkhiihhihgk....",
  "...kq...kqqqqqqqqqgk....",
  "...kq...krrrrrrrrrgk....",
  "...kq...khiihhihhhgk....",
  "...kq...khiihhihhhgk....",
  "...kq...kghihhihhhgk....",
  "...kq...kghihhihhhggk...",
  "...kq...kkgggggggggk....",
  "...kp....kkkkkkkkkk.....",
  "........................",
  "........................",
];

const TESSIN_ATTACK = [
  "........................",
  "........................",
  "..................zk....",
  ".................zzk....",
  "................zzk.....",
  "...............zzk......",
  "..............zzk.......",
  ".............zzk........",
  ".....kdeeeek.kzk........",
  "....kdeffeeekkbzk.......",
  "...kdeffeeedkkbbk.......",
  "...kcbbfeeedkkbk........",
  "...kcbkbfeedkk..........",
  "...kbbbbdeedk...........",
  "...kabbbdedk............",
  "...kqqrqqkkk............",
  "..kqrqqhhqqk............",
  ".kzbbkhiihhqgk..........",
  ".kzbckhiihhhgk..........",
  ".kzmbkhiiihhgk..........",
  ".kzbbkhiiihhgk..........",
  "..kkkkhiiihhgk..........",
  "...kghiiihhhgk..........",
  "...kppppppppgk..........",
  "...kgiiihhhhgk..........",
  "...kghhkhhhgk...........",
  "...kghhkhhhgk...........",
  "...kgihkihhgk...........",
  "...kghhkhhhgk...........",
  "..kgggkkgggk............",
  "..kkkkk.kkkkk...........",
  "........................",
];

/* ---- assembly ----------------------------------------------------------- */

function draw(rows, key) {
  const { w, h } = Surface.gridSize(rows);
  return new Surface(w, h).grid(0, 0, rows, key);
}

export const HEROES = [
  {
    id: "rell",
    name: "Rell",
    full: "Rell Vantance",
    order: "Bladewarden",
    blurb: "Holds the line while the sigils charge. Plate steel, wine tabard, a blade older than the refinery.",
    palette: RELL,
    poses: { idle: RELL_IDLE, critical: RELL_CRIT, attack: RELL_ATTACK },
  },
  {
    id: "iska",
    name: "Iska",
    full: "Iska Doryn",
    order: "Cogwright",
    blurb: "Reads a machine the way a physician reads a pulse. Brass goggles, oiled coat, a spanner she swings.",
    palette: ISKA,
    poses: { idle: ISKA_IDLE, critical: ISKA_CRIT, attack: ISKA_ATTACK },
  },
  {
    id: "maren",
    name: "Maren",
    full: "Maren Sable",
    order: "Voidcaller",
    blurb: "Speaks to the things that live between the veils. Ash-pale, indigo-robed, always the last to move.",
    palette: MAREN,
    poses: { idle: MAREN_IDLE, critical: MAREN_CRIT, attack: MAREN_CAST },
  },
  {
    id: "tessin",
    name: "Tessin",
    full: "Tessin Gale",
    order: "Skyknave",
    blurb: "Came down off the mooring towers and never quite landed. Storm-teal scarf, harness leather, two knives.",
    palette: TESSIN,
    poses: { idle: TESSIN_IDLE, critical: TESSIN_CRIT, attack: TESSIN_ATTACK },
  },
];

/** Render one hero pose to a Surface. */
export function heroSurface(hero, pose) {
  const rows = hero.poses[pose];
  if (!rows) throw new Error(`${hero.id} has no "${pose}" pose`);
  return draw(rows, hero.palette);
}
