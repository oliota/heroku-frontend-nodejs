import { spawn } from "node:child_process";
import { openSync, writeSync, closeSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [file, encoded] = process.argv.slice(2);
if (!file || !encoded) process.exit(2);
const command = Buffer.from(encoded, "base64").toString("utf8");
const output = openSync(file, "a");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn("cmd.exe", ["/d", "/s", "/c", `chcp 65001>nul & ${command}`], {
  cwd: root,
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"]
});
child.stdin.end("\n");
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => writeSync(output, chunk));
child.on("error", error => { writeSync(output, Buffer.from(error.message)); process.exitCode = 1; });
child.on("close", code => { closeSync(output); process.exitCode = code ?? 1; });
