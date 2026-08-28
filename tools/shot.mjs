#!/usr/bin/env node
/* =========================================================================
   shot.mjs — render a URL at 390x844 and write a PNG.

   Zero dependencies. Drives a headless Chrome over the DevTools Protocol
   using Node's built-in WebSocket and fetch, so there is no puppeteer or
   playwright install to go stale.

   Usage:
     node tools/shot.mjs <url> <outfile> [options]

   Options:
     --width <n>     CSS viewport width      (default 390)
     --height <n>    CSS viewport height     (default 844)
     --scale <n>     device pixel ratio      (default 2  -> 780x1688 PNG)
     --full          capture the full scrollable page, not just the viewport
     --wait <ms>     extra settle time after load (default 350)
     --desktop       disable mobile emulation
     --eval <js>     run JS in the page after load, before the settle wait.
                     Await-able: if the expression returns a promise it is
                     awaited. Use it to drive the app to a screen a URL
                     cannot reach on its own, e.g.
                       --eval "game.grantLevels(50)"
     --probe <js>    run JS AFTER the capture and print its result to stdout
                     as one `PROBE <json>` line. For asserting on the state a
                     screenshot cannot show — thrown errors, overflow, an
                     empty render. See tools/walk.mjs.

   Examples:
     node tools/shot.mjs http://localhost:5174/ progress/shots/home-r1.png
     node tools/shot.mjs http://localhost:5174/ /tmp/full.png --full
   ========================================================================= */

import { spawn } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer } from "node:net";
import { homedir } from "node:os";

/* ---- args --------------------------------------------------------------- */

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const url = positional[0];
const outFile = positional[1];

if (!url || !outFile) {
  console.error("usage: node tools/shot.mjs <url> <outfile> [--width 390] [--height 844] [--scale 2] [--full]");
  process.exit(2);
}

const WIDTH = Number(flag("width", 390));
const HEIGHT = Number(flag("height", 844));
const SCALE = Number(flag("scale", 2));
const SETTLE = Number(flag("wait", 350));
const FULL = has("full");
const MOBILE = !has("desktop");
const EVAL = flag("eval", null);
const PROBE = flag("probe", null);

/* ---- locate a browser ---------------------------------------------------
   Preference order: an explicit CHROME_PATH, then any headless shell that a
   playwright install already dropped on this machine, then real Chrome.
   ------------------------------------------------------------------------ */

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  // Playwright browser cache: pick the highest build number available.
  const pwRoot = resolve(homedir(), "Library/Caches/ms-playwright");
  const pwRootLinux = resolve(homedir(), ".cache/ms-playwright");
  for (const root of [pwRoot, pwRootLinux]) {
    if (!existsSync(root)) continue;
    let dirs;
    try {
      dirs = readdirSync(root);
    } catch {
      continue;
    }
    const builds = dirs
      .filter((d) => d.startsWith("chromium_headless_shell-") || d.startsWith("chromium-"))
      .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
    for (const b of builds) {
      const candidates = [
        `${root}/${b}/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
        `${root}/${b}/chrome-headless-shell-mac-x64/chrome-headless-shell`,
        `${root}/${b}/chrome-headless-shell-linux/chrome-headless-shell`,
        `${root}/${b}/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
        `${root}/${b}/chrome-linux/chrome`,
      ];
      for (const c of candidates) if (existsSync(c)) return c;
    }
  }

  const installed = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of installed) if (existsSync(c)) return c;

  return null;
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- minimal CDP client ------------------------------------------------- */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve: ok, reject: no } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? no(new Error(msg.error.message)) : ok(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }

  static connect(wsUrl) {
    return new Promise((ok, no) => {
      const ws = new WebSocket(wsUrl);
      ws.addEventListener("open", () => ok(new CDP(ws)));
      ws.addEventListener("error", () => no(new Error(`could not connect to ${wsUrl}`)));
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      this.pending.set(id, { resolve: ok, reject: no });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((ok) => {
      const fns = this.listeners.get(method) || [];
      const fn = (p) => {
        this.listeners.set(method, (this.listeners.get(method) || []).filter((f) => f !== fn));
        ok(p);
      };
      fns.push(fn);
      this.listeners.set(method, fns);
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

/* ---- main --------------------------------------------------------------- */

const browser = findBrowser();

if (!browser) {
  console.error(`
=============================================================================
  NO HEADLESS BROWSER FOUND — SCREENSHOTS ARE UNAVAILABLE
=============================================================================
  tools/shot.mjs could not locate Chrome, Chromium, Edge, or a playwright
  headless shell on this machine.

  CRITICS: you cannot screenshot the app. Do not silently skip the visual
  comparison and do not describe a screenshot you did not take. Either
  install a browser, or state plainly in your verdict that the comparison
  was not performed.

  To fix, either install Google Chrome, or:
      npx --yes playwright install chromium
  then re-run. You can also point at any Chrome build directly:
      CHROME_PATH=/path/to/chrome node tools/shot.mjs <url> <out.png>
=============================================================================
`);
  process.exit(3);
}

const port = await freePort();
const isHeadlessShell = /headless[-_]shell/.test(browser);

const args = [
  `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--mute-audio",
  "--hide-scrollbars",
  // Consistent colour across machines — critics compare pixels.
  "--force-color-profile=srgb",
  "--disable-features=DialMediaRouteProvider,Translate",
  `--user-data-dir=${resolve(process.env.TMPDIR || "/tmp", `emberveil-shot-${process.pid}`)}`,
];
// A headless shell is already headless; real Chrome needs to be told.
if (!isHeadlessShell) args.push("--headless=new");
args.push("about:blank");

const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
let browserStderr = "";
child.stderr.on("data", (d) => { browserStderr += d.toString(); });

let cdp;
let exitCode = 0;

try {
  // Wait for the DevTools endpoint to come up.
  let version = null;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) {
      throw new Error(`browser exited early (code ${child.exitCode})\n${browserStderr}`);
    }
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(100);
  }
  if (!version) throw new Error(`browser never opened a DevTools port\n${browserStderr}`);

  // Open a page target.
  const targetRes = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" }
  );
  if (!targetRes.ok) throw new Error(`could not open a page target (${targetRes.status})`);
  const target = await targetRes.json();

  cdp = await CDP.connect(target.webSocketDebuggerUrl);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: SCALE,
    mobile: MOBILE,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  });

  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000)]);

  // Wait for webfonts to finish so text metrics are final in the capture.
  await cdp.send("Runtime.evaluate", {
    expression: "document.fonts ? document.fonts.ready.then(() => true) : true",
    awaitPromise: true,
    returnByValue: true,
  }).catch(() => {});

  // Let the app signal readiness if it wants to (set window.__APP_READY__).
  for (let i = 0; i < 30; i++) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: "window.__APP_READY__ !== false",
      returnByValue: true,
    }).catch(() => ({ result: { value: true } }));
    if (r?.result?.value) break;
    await sleep(100);
  }

  /* --eval runs AFTER the app has booted and BEFORE the settle wait, so the
     script can navigate or mutate state and the settle still covers the
     re-render it triggers. A throwing script is a hard failure: a capture of
     the wrong screen is worse than no capture, because it looks like one. */
  if (EVAL) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: `(async () => { ${EVAL} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`--eval threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
  }

  await sleep(SETTLE);

  const shotOpts = { format: "png", captureBeyondViewport: FULL };
  if (FULL) {
    const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
    shotOpts.clip = {
      x: 0, y: 0,
      width: WIDTH,
      height: Math.ceil(cssContentSize.height),
      scale: 1,
    };
  }

  const { data } = await cdp.send("Page.captureScreenshot", shotOpts);
  const png = Buffer.from(data, "base64");

  if (png.length === 0 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("capture did not produce a valid PNG");
  }

  const outPath = resolve(process.cwd(), outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);

  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  console.log(`${outPath}  ${w}x${h}px  ${(png.length / 1024).toFixed(1)} KB`);

  if (PROBE) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: `(() => { ${PROBE} })()`,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`--probe threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    console.log(`PROBE ${typeof r.result.value === "string" ? r.result.value : JSON.stringify(r.result.value)}`);
  }
} catch (err) {
  console.error(`shot.mjs failed: ${err.message}`);
  exitCode = 1;
} finally {
  cdp?.close();
  child.kill("SIGKILL");
}

process.exit(exitCode);
