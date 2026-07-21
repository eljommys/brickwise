#!/usr/bin/env node
/* eslint-disable */
"use strict";

// Zero-config launcher for Brickwise.
// Run directly (`npx github:eljommys/brickwise`) or after cloning (`node bin/brickwise.js`).
//
// npx installs the package nested under ~/.npm/_npx/<hash>/ next to its own
// lockfile, which confuses Next's workspace-root detection (breaking module
// resolution and the bundler). To avoid that entirely we copy the app into a
// clean, single-lockfile directory (~/.brickwise/app) and run it from there.
// Data lives in ~/.brickwise/brickwise.db, independent of the app copy.

const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const pkgDir = path.resolve(__dirname, "..");
const APP = path.join(os.homedir(), ".brickwise", "app");

function step(msg) {
  process.stdout.write(`\n\x1b[1m\x1b[34m▸ ${msg}\x1b[0m\n`);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\n\x1b[31m✖ Falló: ${cmd} ${args.join(" ")}\x1b[0m`);
    process.exit(r.status || 1);
  }
}

const EXCLUDE = /(^|[\/\\])(node_modules|\.next|\.git|brickwise\.db)/;

function syncSources() {
  fs.mkdirSync(APP, { recursive: true });
  fs.cpSync(pkgDir, APP, {
    recursive: true,
    filter: (src) => !EXCLUDE.test(path.relative(pkgDir, src)),
  });
}

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
  // If already launched from inside the clean copy, run in place; otherwise sync.
  const inPlace = path.resolve(pkgDir) === path.resolve(APP);
  const workdir = inPlace ? pkgDir : APP;

  if (!inPlace) {
    step("Preparando la app…");
    syncSources();
  }

  // Reinstall deps on a fresh copy AND whenever the app version changed — an
  // update can add dependencies (e.g. leaflet.heat), and node_modules is not
  // copied over, so a stale install would be missing them. A version marker
  // inside node_modules tells us what was last installed there.
  const marker = path.join(workdir, "node_modules", ".brickwise-version");
  const currentVer = (() => {
    try {
      return require(path.join(workdir, "package.json")).version || "";
    } catch {
      return "";
    }
  })();
  const installedVer = (() => {
    try {
      return fs.readFileSync(marker, "utf8").trim();
    } catch {
      return null;
    }
  })();
  const nextMissing = !fs.existsSync(path.join(workdir, "node_modules", "next"));
  if (nextMissing || installedVer !== currentVer) {
    step(
      nextMissing
        ? "Instalando dependencias (solo la primera vez, ~1 min)…"
        : "Actualizando dependencias tras la actualización…"
    );
    run(npm, ["install", "--include=dev", "--no-audit", "--no-fund"], workdir);
    try {
      fs.writeFileSync(marker, currentVer);
    } catch {
      /* non-fatal: worst case we reinstall next launch */
    }
  }

  const port = await findFreePort(Number(process.env.PORT) || 3000);
  const url = `http://localhost:${port}`;

  step(`Arrancando Brickwise en ${url}`);
  console.log("  (Ctrl+C para parar · tus datos se guardan en ~/.brickwise/brickwise.db)\n");

  const child = spawn(npm, ["run", "dev", "--", "-p", String(port)], {
    cwd: workdir,
    stdio: "inherit",
    shell: isWin,
  });

  setTimeout(() => openBrowser(url), 2500);

  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code || 0));
})();
