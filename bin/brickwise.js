#!/usr/bin/env node
/* eslint-disable */
"use strict";

// Zero-config launcher for Brickwise.
// Run directly (`npx github:eljommys/brickwise`) or after cloning (`node bin/brickwise.js`).
// It installs dependencies if missing, builds once, then starts the local server.

const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function step(msg) {
  process.stdout.write(`\n\x1b[1m\x1b[34m▸ ${msg}\x1b[0m\n`);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\n\x1b[31m✖ Falló: ${cmd} ${args.join(" ")}\x1b[0m`);
    process.exit(r.status || 1);
  }
}

const has = (...p) => fs.existsSync(path.join(root, ...p));

function findFreePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(findFreePort(start + 1)));
    srv.listen(start, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : isWin ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: isWin });
  } catch {
    /* the printed URL is enough */
  }
}

(async () => {
  const needBuild = !has(".next", "BUILD_ID");

  if (!has("node_modules", "next") || (needBuild && !has("node_modules", "typescript"))) {
    step("Instalando dependencias (solo la primera vez)…");
    run(npm, ["install", "--include=dev", "--no-audit", "--no-fund"]);
  }

  if (needBuild) {
    step("Compilando la app (solo la primera vez, ~1 min)…");
    run(npm, ["run", "build"]);
  }

  const port = await findFreePort(Number(process.env.PORT) || 3000);
  const url = `http://localhost:${port}`;

  step(`Arrancando Brickwise en ${url}`);
  console.log("  (Ctrl+C para parar · tus datos se guardan en ~/.brickwise/brickwise.db)\n");

  const child = spawn(npm, ["run", "start", "--", "-p", String(port)], {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
  });

  setTimeout(() => openBrowser(url), 2500);

  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code || 0));
})();
