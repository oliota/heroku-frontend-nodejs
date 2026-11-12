import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const app = process.env.HEROKU_APP || "heroku-frontend-nodejs";
const args = process.argv.slice(2);
const command = args.shift() || "help";
const bin = (name) => process.platform === "win32" && ["npm", "npx", "heroku", "nodemon"].includes(name) ? `${name}.cmd` : name;

function run(name, params = []) {
  const result = spawnSync(bin(name), params, { stdio: "inherit", shell: process.platform === "win32" && ["npm", "npx", "heroku"].includes(name) || (process.platform === "win32" && name.endsWith(".cmd")) });
  if (result.error || result.status !== 0) {
    process.stderr.write(`${name} failed.\n`);
    process.exit(result.status || 1);
  }
}

function capture(name, params = []) {
  try {
    return execFileSync(bin(name), params, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function assertRepository() {
  if (capture("git", ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    process.stderr.write("Run this command inside the frontend Git repository.\n");
    process.exit(1);
  }
}

function ensureHerokuRemote() {
  const remote = capture("git", ["remote", "get-url", "heroku"]);
  if (remote && remote.includes(`${app}.git`)) return;
  run("heroku", ["git:remote", "-a", app]);
}

function github() {
  assertRepository();
  if (!capture("git", ["remote", "get-url", "origin"])) {
    process.stderr.write("GitHub origin remote is not configured.\n");
    process.exit(1);
  }
  run("git", ["add", "-A"]);
  if (capture("git", ["status", "--porcelain"])) {
    run("git", ["commit", "-m", args.join(" ") || "chore: deploy frontend"]);
  }
  run("git", ["push", "origin", "HEAD"]);
}

function heroku() {
  assertRepository();
  ensureHerokuRemote();
  run("git", ["push", "heroku", "HEAD:main"]);
}

switch (command) {
  case "dev":
    if (existsSync(path.join("node_modules", ".bin", bin("nodemon")))) run(path.join("node_modules", ".bin", bin("nodemon")), ["server.js"]);
    else run("node", ["--watch", "server.js"]);
    break;
  case "login":
    run("heroku", ["login"]);
    run("npx", ["--yes", "firebase-tools", "login"]);
    break;
  case "heroku-login":
    run("heroku", ["login"]);
    break;
  case "heroku-link":
    ensureHerokuRemote();
    break;
  case "heroku-open":
    run("heroku", ["open", "-a", app]);
    break;
  case "heroku-logs":
    run("heroku", ["logs", "--tail", "-a", app]);
    break;
  case "firebase-login":
    run("npx", ["--yes", "firebase-tools", "login"]);
    break;
  case "firebase-logout":
    run("npx", ["--yes", "firebase-tools", "logout"]);
    break;
  case "firebase-status":
    run("npx", ["--yes", "firebase-tools", "login:list"]);
    break;
  case "github":
    github();
    break;
  case "heroku":
    heroku();
    break;
  case "deploy":
    run("npm", ["test"]);
    run("npm", ["run", "build"]);
    github();
    heroku();
    break;
  case "status":
    run("git", ["status", "--short", "--branch"]);
    run("git", ["remote", "-v"]);
    break;
  case "help":
    process.stdout.write(`Frontend Command Hub\n\nSetup: npm install\nRun: npm start | npm run dev\nQuality: npm test | npm run build | npm run lint | npm run format\nAuth: npm run heroku:login | npm run firebase:login | npm run firebase:status\nDeploy: npm run deploy -- "message" | npm run deploy:github | npm run deploy:heroku\nUtilities: npm run heroku:link | npm run heroku:open | npm run heroku:logs | npm run status | npm run list\nHeroku app: ${app} (override with HEROKU_APP)\n`);
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exit(1);
}
