import express from "express";
import path from "path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFirebase = JSON.parse(readFileSync(path.join(__dirname, "adedonha", "public-firebase.json"), "utf8"));
app.get("/adedonha/runtime-config.js", (_req, res) => {
  const firebase = Object.fromEntries(
    [
      "apiKey",
      "authDomain",
      "projectId",
      "appId",
      "messagingSenderId",
      "storageBucket",
    ].map((key) => [
      key,
      process.env[
        `ADEDONHA_FIREBASE_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`
      ] || defaultFirebase[key] || "",
    ]),
  );
  const config = {
    apiBase: process.env.ADEDONHA_API_BASE || "",
    firebase,
    feedbackUrl: process.env.ADEDONHA_FEEDBACK_URL || "",
  };
  res
    .type("application/javascript")
    .set("Cache-Control", "no-store")
    .send(
      `window.ADEDONHA_CONFIG = ${JSON.stringify(config).replace(/</g, "\\u003c")};`,
    );
});
app.get(["/adedonha", "/adedonha/", "/stop", "/stop/"], (_req, res) =>
  res.sendFile(path.join(__dirname, "adedonha", "index.html")),
);
app.use(
  "/adedonha",
  express.static(path.join(__dirname, "adedonha"), {
    index: false,
    fallthrough: false,
  }),
);
app.use(express.static(__dirname));
app.get(["/elianeOrganizada", "/elianeOrganizada/"], (_req, res) =>
  res.sendFile(path.join(__dirname, "elianeOrganizada", "index.html")),
);
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use((error, _req, res, _next) =>
  res
    .status(error.status || 500)
    .type("text")
    .send(
      error.status === 404
        ? "Asset not found"
        : "Unable to serve this resource",
    ),
);
const PORT = process.env.PORT || 3000;
export { app };
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  app.listen(PORT, () =>
    console.log(`Frontend running on http://localhost:${PORT}`),
  );
}
