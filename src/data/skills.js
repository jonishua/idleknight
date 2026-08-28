/* =========================================================================
   EMBERVEIL — SKILLS (compatibility re-export)

   The skill table used to live here as one 400-line file. It now lives in
   ./skills/, one module per skill, so parallel work on two skills never
   touches the same bytes.

   DO NOT ADD CONTENT TO THIS FILE. To add or edit a skill:
     1. create/edit ./skills/<id>.js — it default-exports the skill object
     2. add its import + one array entry in ./skills/index.js

   This shim exists only so that ./index.js and anything else that already
   imports "./skills.js" keeps resolving. It will never hold data again.
   ========================================================================= */

export { SKILLS, SKILL_BY_ID, MASTERY_SKILLS } from "./skills/index.js";
