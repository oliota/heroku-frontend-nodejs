import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../server.js";
test("existing routes, game aliases, runtime configuration and module assets", async (t) => {
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [route, text] of [
    ["/", "Expense Manager"],
    ["/elianeOrganizada", "html"],
    ["/adedonha", "Adedonha"],
    ["/stop", "Adedonha"],
    ["/stop/", "Adedonha"],
    ["/adedonha/", "Adedonha"],
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), new RegExp(text, "i"));
  }
  assert.equal(
    await (await fetch(base + "/stop")).text(),
    await (await fetch(base + "/adedonha")).text(),
  );
  for (const route of [
    "/adedonha/css/app.css",
    "/adedonha/css/wheel.css",
    "/adedonha/js/app.js",
    "/adedonha/assets/icon.svg",
  ])
    assert.equal((await fetch(base + route)).status, 200, route);
  const config = await fetch(base + "/adedonha/runtime-config.js");
  assert.match(config.headers.get("content-type"), /javascript/);
  assert.match(await config.text(), /ADEDONHA_CONFIG/);
  assert.equal((await fetch(base + "/adedonha/js/missing.js")).status, 404);
});
