import { test, expect } from "@playwright/test";
import { mockAPI } from "./mock-api.js";

test("menu tap, inertial drag without activation, upper navigation and local full game", async ({
  page,
}) => {
  await mockAPI(page);
  await page.goto("/adedonha");
  await expect(page.getByRole("heading", { name: /Uma letra/ })).toBeVisible();
  const wheel = page.getByRole("group", { name: "Roda do menu" });
  const box = await wheel.boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.82, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await expect(page).not.toHaveURL(/#local/);
  const upright = await wheel
    .locator(".wheel-label")
    .first()
    .evaluate((node) => {
      const disc = new DOMMatrix(
        getComputedStyle(node.parentElement).transform,
      );
      const label = new DOMMatrix(getComputedStyle(node).transform);
      return Math.abs(disc.multiply(label).b);
    });
  expect(upright).toBeLessThan(0.01);
  await page.getByRole("button", { name: "Vamos jogar" }).click();
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("pt_pt");
  await expect(page.getByText("CLUBE", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("pt");
  await expect(page.getByText("TIME", { exact: true })).toBeVisible();
  await page.getByLabel("Rodadas", { exact: true }).selectOption("1");
  await page.getByLabel("Tempo por rodada").selectOption("0");
  await page.getByRole("button", { name: "Escolher a letra" }).click();
  await page.getByRole("button", { name: "C", exact: true }).click();
  await expect(page.locator(".selected-letter")).toHaveText("C");
  await page.getByRole("button", { name: "Confirmar letra" }).click();
  await page.locator('[data-answer="0"]').fill("Caio");
  await page.locator('[data-answer="1"]').fill("Cinza");
  await page.locator('[data-answer="2"]').fill("Caju");
  await page.reload();
  await expect(page.locator('[data-answer="0"]')).toHaveValue("Caio");
  await page.getByRole("button", { name: "STOP!", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Palavras que valem ouro." }),
  ).toBeVisible();
  await expect(page.locator(".rank-score")).toHaveText("30");
  await page.getByRole("button", { name: "Nova partida", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vamos de STOP?" }),
  ).toBeVisible();
});

test("3-second hold selects once without a second tap activation; letter hub random requires confirmation", async ({
  page,
}) => {
  await mockAPI(page);
  await page.goto("/stop");
  const label = page.getByRole("button", { name: "Jogar local", exact: true });
  await label.hover();
  await page.mouse.down();
  await page.waitForTimeout(3450);
  await page.mouse.up();
  await expect(
    page.getByRole("heading", { name: "Vamos de STOP?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Escolher a letra" }).click();
  const hub = page.getByRole("button", {
    name: "Mantenha pressionado por 3 segundos para sortear",
  });
  await hub.hover();
  await page.mouse.down();
  await page.waitForTimeout(3450);
  await page.mouse.up();
  await expect(page.locator(".selected-letter")).not.toHaveText("?");
  await expect(
    page.getByRole("button", { name: "Confirmar letra" }),
  ).toBeEnabled();
  await expect(page.locator("[data-answer]")).toHaveCount(0);
});

test("missing services are truthful, rules failure offers recovery, no fake login or checkout", async ({
  page,
}) => {
  await mockAPI(page);
  await page.goto("/stop#profile");
  await expect(
    page.getByRole("button", { name: "Entrar com Google", exact: true }),
  ).toBeDisabled();
  await page.goto("/adedonha#premium");
  await expect(page.getByText(/Ainda não há checkout web/)).toBeVisible();
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.unroute("http://localhost:3002/api/v1/adedonha/**");
  await mockAPI(page, { unavailable: true });
  await page.goto("/adedonha#local");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vamos tentar de novo?" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeVisible();
});

test("online API flow: Google, room, immediate STOP, suggested review and results", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mockAPI(page, { online: true });
  await page.goto("/adedonha#profile");
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  await page.evaluate(() => { location.hash = "create"; });
  const checks = page.locator(".check-list input:checked");
  const total = await checks.count();
  for (let i = total - 1; i >= 3; i--) await checks.nth(i).uncheck();
  await page.getByLabel("Rodadas").selectOption("1");
  await page.getByRole("button", { name: "Criar sala online" }).click();
  fixture.versionConflict = true;
  await page.getByRole("button", { name: "Começar partida" }).click();
  await page.getByRole("button", { name: "C", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar letra" }).click();
  await page.locator('[data-answer="0"]').fill("Caio");
  await page.locator('[data-answer="1"]').fill("Cinza");
  await page.getByRole("button", { name: "STOP!" }).click();
  await expect(page.getByRole("heading", { name: "Revisão da rodada" })).toBeVisible();
  for (let category = 0; category < 3; category++) {
    fixture.room.review.done.b = true;
    await page.getByRole("button", { name: "Concordar e avançar" }).click();
    if (category < 2)
      await expect(page.locator(".review-tabs .active")).toContainText(`${category + 2}.`);
  }
  await expect(page.getByRole("heading", { name: "Pontos da rodada" })).toBeVisible();
  await page.getByRole("button", { name: "Finalizar partida" }).click();
  await expect(page.getByRole("heading", { name: "Partida finalizada!" })).toBeVisible();
  await expect(page.locator(".rank-entry")).toHaveCount(2);
  for (const call of fixture.calls.filter((c) => c.method !== "GET"))
    expect(call.headers["idempotency-key"]).toMatch(/^[\w-]{8,100}$/);
});

test("friends confirmation, request badge, acceptance, removal and cache isolation", async ({
  page,
}) => {
  const fixture = await mockAPI(page, { online: true });
  await page.goto("/adedonha#profile");
  await page
    .getByRole("button", { name: "Entrar com Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ana", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Amigos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pendentes de aprovação" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aceitar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(page.locator("#friends-badge")).toBeHidden();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(
    page.getByText("Sua próxima turma de STOP começa aqui."),
  ).toBeVisible();
  expect(fixture.friendCount).toBe(0);
});

test("real ticket protocol shape, reconnect join, shared benefit and verified Golden Wheel", async ({
  page,
}) => {
  const fixture = await mockAPI(page, { online: true });
  await page.goto("/adedonha#profile");
  await page
    .getByRole("button", { name: "Entrar com Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ana", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "create";
  });
  await page.getByRole("button", { name: "Criar sala online" }).click();
  await expect(page.locator(".code")).toHaveText("ABCDE");
  await page.evaluate(() => {
    location.hash = "join";
  });
  await page.getByLabel("Código da sala", { exact: true }).fill("ABCDE");
  await page.getByRole("button", { name: "Entrar na sala" }).click();
  await expect(page.locator(".code")).toHaveText("ABCDE");
  expect(fixture.calls.find((c) => c.path === "/tickets/intent").body).toEqual({
    room_code: "ABCDE",
  });
  expect(fixture.calls.find((c) => c.path === "/tickets/redeem").body).toEqual({
    intent_id: "intent1",
    source: "free",
  });
  fixture.room.premium.ad_free = true;
  fixture.room.version++;
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page.getByRole("button", { name: "Reconectar à sala ABCDE" }).click();
  await expect(page.getByText(/Benefício compartilhado ativo/)).toBeVisible();
  const joins = fixture.calls.filter((c) => c.path.endsWith("/join"));
  expect(joins.at(-1).body).toEqual({});
  fixture.entitlement = { golden_wheel: true, revoked: false };
  await page.evaluate(() => {
    location.hash = "premium";
  });
  await expect(
    page.getByRole("heading", { name: "✦ Sua Roda Dourada está ativa" }),
  ).toBeVisible();
  await expect(page.locator(".golden")).toBeVisible();
  await expect(page.getByText(/Ainda não há checkout web/)).toBeVisible();
});

for (const [width, height] of [
  [360, 800],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1920, 1080],
])
  test(`responsive layout ${width}×${height}`, async ({ page }) => {
    await mockAPI(page);
    await page.setViewportSize({ width, height });
    await page.goto("/adedonha");
    await expect(
      page.getByRole("heading", { name: /Uma letra/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Vamos jogar" }).click();
    await expect(
      page.getByRole("heading", { name: "Vamos de STOP?" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Escolher a letra" }).click();
    await page.getByRole("button", { name: "C", exact: true }).click();
    await expect(page.locator(".selected-letter")).toHaveText("C");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Confirmar letra", exact: true })
      .click();
    await page.locator('[data-answer="0"]').fill("Caio");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "STOP!", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Essa rodada foi boa!" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
