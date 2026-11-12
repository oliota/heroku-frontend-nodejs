import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "package.json");
const pkg = JSON.parse(await readFile(file, "utf8"));
const scripts = {
  "----": "echo ---------- SETUP / RUN ----------",
  "install": "node scripts/commands.mjs check",
  "install:deps": "npm install",
  "start": "node server.js",
  "hub": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-hub.ps1",
  "gui": "npm run hub",
  "run": "npm start",
  "dev": "node scripts/hub.mjs dev",
  "debug": "node --inspect server.js",
  "-----": "echo ---------- QUALITY ----------",
  "test": "node --test tests/*.test.js",
  "test:adedonha": "node --test tests/adedonha.test.js",
  "test:ui": "playwright test",
  "build": "node scripts/commands.mjs build",
  "lint": "node scripts/commands.mjs check && prettier --check adedonha server.js scripts tests docs playwright.config.js package.json README.md",
  "format": "prettier --write adedonha server.js scripts tests docs playwright.config.js package.json README.md",
  "------": "echo ---------- AUTH / DEPLOY ----------",
  "login": "node scripts/hub.mjs login",
  "heroku:login": "node scripts/hub.mjs heroku-login",
  "heroku:link": "node scripts/hub.mjs heroku-link",
  "heroku:open": "node scripts/hub.mjs heroku-open",
  "heroku:logs": "node scripts/hub.mjs heroku-logs",
  "firebase:login": "node scripts/hub.mjs firebase-login",
  "firebase:logout": "node scripts/hub.mjs firebase-logout",
  "firebase:status": "node scripts/hub.mjs firebase-status",
  "deploy": "node scripts/hub.mjs deploy",
  "deploy:github": "node scripts/hub.mjs github",
  "deploy:heroku": "node scripts/hub.mjs heroku",
  "heroku:push": "node scripts/hub.mjs heroku",
  "status": "node scripts/hub.mjs status",
  "logs": "node scripts/hub.mjs heroku-logs",
  "list": "npm run",
  "help": "node scripts/hub.mjs help"
};
const old = pkg.scripts || {};
const owned = new Set(Object.keys(scripts));
pkg.scripts = { ...scripts, ...Object.fromEntries(Object.entries(old).filter(([key]) => !owned.has(key))) };
await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
process.stdout.write("Command Hub installed in package.json.\n");
