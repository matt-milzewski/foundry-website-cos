import { test, expect } from "@playwright/test";

const pages = ["/", "/chronicle/", "/chronicle/session-01/", "/codex/", "/players/", "/in-memoriam/", "/campaigns/", "/404.html"];

async function mockApis(page, { status = { active: true, world: "curse-of-strahd", users: 3 } } = {}) {
  await page.route(/execute-api/, (r) => r.fulfill({ json: { session: "2026-11-08", answers: { Danny: "yes" } } }));
  await page.route(/api\/status/, (r) => r.fulfill({ json: status }));
}

for (const path of pages) {
  test(`${path} loads cleanly with no sideways scroll`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await mockApis(page);
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    const html = await page.content();
    expect(html).not.toMatch(/Jazz|Natasha|\bLucy\b/);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    expect(broken).toEqual([]);
  });
}

test("next session shows QLD and VIC times, RSVP toggles and clears", async ({ page }) => {
  const sent = [];
  await page.clock.setFixedTime(new Date("2026-11-07T00:00:00Z"));
  await page.route(/execute-api/, async (r) => {
    if (r.request().method() === "PUT") {
      const b = r.request().postDataJSON();
      sent.push(b);
      return r.fulfill({ json: { session: b.session, answers: b.answer === "clear" ? {} : { [b.player]: b.answer } } });
    }
    return r.fulfill({ json: { session: "2026-11-08", answers: {} } });
  });
  await page.route(/api\/status/, (r) => r.fulfill({ status: 500, body: "" }));
  await page.goto("/");
  const next = page.locator("#next-session");
  await expect(next).toContainText("Sunday 8 Nov");
  await expect(next).toContainText("8:00 pm QLD");
  await expect(next).toContainText("9:00 pm VIC");
  const up = page.getByRole("button", { name: "Fraser is in" });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-summary]")).toContainText("1 in");
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "false");
  expect(sent.map((s) => [s.session, s.player, s.answer])).toEqual([
    ["2026-11-08", "Fraser", "yes"],
    ["2026-11-08", "Fraser", "clear"],
  ]);
  await expect(page.locator("#foundry-status")).toContainText("Offline");
});

test("a failed save rolls back and says so", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-07T00:00:00Z"));
  await page.route(/execute-api/, (r) =>
    r.request().method() === "PUT" ? r.fulfill({ status: 500, body: "" }) : r.fulfill({ json: { session: "2026-11-08", answers: {} } })
  );
  await page.route(/api\/status/, (r) => r.fulfill({ json: { active: false } }));
  await page.goto("/");
  const down = page.getByRole("button", { name: "Ryan is out" });
  await down.click();
  await expect(page.locator("[data-error]")).toContainText("Couldn't save");
  await expect(down).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#foundry-status")).toContainText("no world running");
});

test("nav links and RSVP buttons are big enough to tap", async ({ page }) => {
  await mockApis(page);
  await page.goto("/");
  const toggle = page.locator("[data-nav-toggle]");
  if (await toggle.isVisible()) await toggle.click();
  const heights = await page.locator("#site-nav a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  const btns = await page.locator(".rsvp__btn").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(btns.length).toBe(8);
  for (const h of btns) expect(h).toBeGreaterThanOrEqual(44);
});

test("codex filter and search narrow the list", async ({ page }) => {
  await mockApis(page);
  await page.goto("/codex/");
  await page.getByRole("button", { name: "Places" }).click();
  await expect(page.locator('.codex-group[data-type="people"]')).toBeHidden();
  await expect(page.locator('.codex-group[data-type="places"]')).toBeVisible();
  await page.getByRole("button", { name: "All" }).click();
  await page.locator("[data-search]").fill("Ravenloft");
  const visible = await page.locator(".codex-item:visible").count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(10);
});

test("old URLs redirect", async ({ page }) => {
  await mockApis(page);
  await page.goto("/wiki.html");
  await expect(page).toHaveURL(/\/codex\/$/);
});
