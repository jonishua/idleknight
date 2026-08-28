#!/usr/bin/env node
/* =========================================================================
   verify.mjs — one-command health check of the whole toolchain.

   Run this first if anything looks broken, and after any change to the
   tools. It boots a server on a scratch port, fetches the app and its
   assets, takes a real screenshot, and rebuilds the progress page.

   Usage:  node tools/verify.mjs        (or: npm run verify)
   ========================================================================= */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
  return ok;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

console.log("\nEmberveil toolchain verification\n");

/* ---- 1. environment ----------------------------------------------------- */
const major = Number(process.versions.node.split(".")[0]);
check("node >= 20", major >= 20, `v${process.versions.node}`);
check("global WebSocket (needed by shot.mjs)", typeof WebSocket === "function");

/* ---- 2. required files -------------------------------------------------- */
for (const f of [
  "index.html",
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/primitives.css",
  "src/styles/home.css",
  "src/js/main.js",
  "src/assets/fonts/cinzel-latin-var.woff2",
  "src/assets/sprites/aether-shard.png",
]) {
  check(`exists ${f}`, existsSync(resolve(ROOT, f)));
}

/* ---- 3. design-system discipline ---------------------------------------
   Feature CSS must not hard-code colour. tokens.css is the only file
   allowed to define hex values.
   ------------------------------------------------------------------------ */
{
  const offenders = [];
  for (const f of ["src/styles/base.css", "src/styles/primitives.css", "src/styles/home.css"]) {
    const css = readFileSync(resolve(ROOT, f), "utf8");
    // Strip comments before looking for literals.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const hexes = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    if (hexes.length) offenders.push(`${f}: ${[...new Set(hexes)].join(" ")}`);
  }
  check(
    "no raw hex outside tokens.css",
    offenders.length === 0,
    offenders.length ? `\n        ${offenders.join("\n        ")}` : ""
  );
}

/* ---- 4. serve ----------------------------------------------------------- */
const port = await freePort();
const server = spawn(process.execPath, [join(ROOT, "tools/serve.mjs"), String(port)], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverUp = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`);
    if (r.ok) { serverUp = true; break; }
  } catch { /* not yet */ }
  await sleep(100);
}
check("dev server boots", serverUp, `port ${port}`);

if (serverUp) {
  for (const [path, label] of [
    ["/", "index.html"],
    ["/src/styles/tokens.css", "tokens.css"],
    ["/src/js/main.js", "main.js"],
    ["/src/assets/fonts/cinzel-latin-var.woff2", "font"],
    ["/src/assets/sprites/cog.png", "sprite"],
  ]) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`).catch(() => null);
    check(`serves ${label}`, !!r && r.ok, r ? `HTTP ${r.status}` : "no response");
  }

  // Path traversal must not escape the project root.
  const esc1 = await fetch(`http://127.0.0.1:${port}/../../../etc/passwd`).catch(() => null);
  check("blocks path traversal", !esc1 || !esc1.ok, esc1 ? `HTTP ${esc1.status}` : "");
}

/* ---- 5. screenshot ------------------------------------------------------ */
let shotWorks = false;
if (serverUp) {
  const tmp = mkdtempSync(join(tmpdir(), "emberveil-verify-"));
  const out = join(tmp, "shot.png");
  const res = spawnSync(process.execPath, [join(ROOT, "tools/shot.mjs"), `http://127.0.0.1:${port}/`, out], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 90000,
  });

  if (res.status === 0 && existsSync(out)) {
    const png = readFileSync(out);
    const isPng = png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const w = isPng ? png.readUInt32BE(16) : 0;
    const h = isPng ? png.readUInt32BE(20) : 0;
    shotWorks = check(
      "screenshot produces a real PNG",
      isPng && png.length > 5000 && w === 780 && h === 1688,
      `${w}x${h}, ${(png.length / 1024).toFixed(0)} KB`
    );
  } else {
    check("screenshot produces a real PNG", false,
      `exit ${res.status}\n${(res.stderr || res.stdout || "").trim().split("\n").slice(-6).join("\n")}`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

server.kill("SIGKILL");

/* ---- 6. the engine selftest and the four wing checks ---------------------
   The toolchain is not healthy if the content is not. These are the gates
   every round is judged against, so `npm run verify` runs them rather than
   leaving five separate commands to remember. */
{
  const sel = spawnSync(process.execPath, ["-e", `
    import("./src/js/engine/index.js").then(async (E) => {
      const fs = await import("fs");
      const r = E.runSelftest(E.DB, fs.readFileSync("reference/melvor-math.md", "utf8"));
      const res = r.results || r.tests || [];
      const f = res.filter((x) => !(x.pass ?? x.ok ?? true));
      console.log(res.length - f.length + "/" + res.length);
      process.exit(f.length ? 1 : 0);
    });`], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  check("engine selftest", sel.status === 0, (sel.stdout || "").trim());

  for (const wing of ["artisan", "passive", "exotic", "meta"]) {
    const r = spawnSync(process.execPath, [join(ROOT, `tools/check-${wing}.mjs`)], {
      cwd: ROOT, encoding: "utf8", timeout: 300000,
    });
    const last = (r.stdout || "").trim().split("\n").filter(Boolean).at(-1) || "";
    check(`check-${wing}`, r.status === 0, last.replace(/\[[0-9;]*m/g, "").trim());
  }
}

/* ---- 7. progress page --------------------------------------------------- */
{
  const res = spawnSync(process.execPath, [join(ROOT, "tools/build-progress.mjs")], {
    cwd: ROOT, encoding: "utf8", timeout: 30000,
  });
  const built = res.status === 0 && existsSync(resolve(ROOT, "progress.html"));
  check("progress.html builds", built, built ? "" : (res.stderr || "").trim());
}

/* ---- report ------------------------------------------------------------- */
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log(`\n  Failing: ${failures.join(", ")}`);
}
if (!shotWorks) {
  console.log(`
  ================================================================
  SCREENSHOTS ARE NOT WORKING. Critics cannot do a visual
  comparison until this is fixed — they must say so in their
  verdict rather than describing a screenshot they never took.
  ================================================================`);
}
console.log("");
process.exit(fail ? 1 : 0);
