#!/usr/bin/env node
/* =========================================================================
   serve.mjs — zero-dependency static server for the app.

   No install step, no node_modules. Serves the project root so that
   /index.html, /src/**, and /progress.html are all reachable.

   Usage:  node tools/serve.mjs [port]
           npm run dev
   ========================================================================= */

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 5174);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }

  if (pathname === "/") pathname = "/index.html";

  // Contain every request inside ROOT — no traversal out of the project.
  const filePath = resolve(ROOT, "." + normalize(pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    return send(res, 403, "Forbidden");
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return send(res, 404, `Not found: ${pathname}`);
  }
  if (stat.isDirectory()) return send(res, 404, `Not found: ${pathname}`);

  const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": stat.size,
    // Always fresh: critics and builders must never screenshot a stale build.
    "cache-control": "no-store, must-revalidate",
  });
  createReadStream(filePath).pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Either something is already serving the app there, or pass another port:`);
    console.error(`     node tools/serve.mjs 5175\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  EMBERVEIL dev server`);
  console.log(`  app       http://localhost:${PORT}/`);
  console.log(`  progress  http://localhost:${PORT}/progress.html`);
  console.log(`  root      ${ROOT}\n`);
});
