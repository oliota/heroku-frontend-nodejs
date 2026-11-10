import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
async function files(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(dir, entry.name))
          : path.join(dir, entry.name),
      ),
    )
  ).flat();
}
const command = process.argv[2] || "help";
if (["check", "build", "install"].includes(command)) {
  const sources = [
    "server.js",
    ...(await files("adedonha")),
    ...(await files("scripts")),
    ...(await files("tests")),
  ].filter((file) => /\.(m?js)$/.test(file));
  for (const file of sources) {
    const result = spawnSync(
      process.execPath,
      ["--check", path.join(root, file)],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
  if (command === "build") {
    const html = await readFile(path.join(root, "adedonha/index.html"), "utf8");
    for (const asset of html.matchAll(/(?:src|href)="(\/adedonha\/[^"#?]+)"/g))
      if (!asset[1].endsWith("runtime-config.js"))
        await readFile(path.join(root, asset[1]));
    console.log(
      "Build verified: native browser modules and assets need no compilation. Express serves the source.",
    );
  } else console.log(`Checked ${sources.length} JavaScript files.`);
} else if (command === "logs") {
  const file = path.join(root, "logs/frontend.log");
  try {
    console.log(await readFile(file, "utf8"));
  } catch {
    console.log(
      "No saved local log. Use npm start for live output, or npm start *> logs/frontend.log after creating logs/. Heroku: heroku logs --tail.",
    );
  }
} else {
  const pkg = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  console.log(
    Object.entries(pkg.scripts)
      .map(([name, value]) => `${name.padEnd(18)} ${value}`)
      .join("\n"),
  );
}
