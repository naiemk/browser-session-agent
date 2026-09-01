import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import { selectCountryUnitedStates } from "../../src/plan/examples.ts";
import {
  closeV1,
  connectHelper,
  exchangePair,
  issuePairCode,
  register,
  startV1Api,
  uniqueUser,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-05-T02 harness + plan cards", () => {
  it("shows harness verification and plan progress in the chat UI", async () => {
    const world = await withFixture(await startV1Api({ requirePaid: false }));
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    const { deviceToken } = await exchangePair(world.origin, await issuePairCode(world.origin, cookie));
    connectHelper(world, deviceToken);
    const hub = world.api.registry.hubFor(account.id);

    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(world.origin, { waitUntil: "domcontentloaded" });
      await page.locator("#auth-email").fill(user.email);
      await page.locator("#auth-password").fill(user.password);
      await page.locator("#auth-login").click();
      await page.locator("#auth").waitFor({ state: "hidden", timeout: 10_000 });
      await page.locator("#node-pill").filter({ hasText: "Connected" }).waitFor({ timeout: 20_000 });

      await page.locator("#node-pill").filter({ hasText: "Connected" }).waitFor({ timeout: 20_000 });

      await page.locator("#input").fill(`/browser-start --url ${world.fixtureOrigin}/dead-click dead`);
      await page.locator("#composer button[type=submit]").click();
      await page.locator(".msg.system").filter({ hasText: /Started/ }).waitFor({ timeout: 20_000 });

      const observation = await hub.call<{
        controls: Array<{ ref: string; name: string }>;
      }>("inspect", []);
      const ref = observation.controls.find((c) => c.name.toLowerCase().includes("do nothing"))?.ref;
      assert.ok(ref);
      await hub.call("act", [{ action: "click", ref }]);
      await page.locator(".msg.tool").filter({ hasText: /harness/i }).waitFor({ timeout: 15_000 });

      await page.locator("#input").fill(
        `/browser-start --url ${world.fixtureOrigin}/combobox?mode=united-states-first select country`,
      );
      await page.locator("#composer button[type=submit]").click();
      await page.locator(".msg.system").filter({ hasText: /Started/ }).nth(1).waitFor({ timeout: 20_000 });
      await hub.call("runPlan", [selectCountryUnitedStates]);
      await page.locator(".msg.plan").first().waitFor({ timeout: 15_000 });
      const planText = await page.locator(".msg.plan").allInnerTexts();
      assert.ok(planText.some((t) => /plan/i.test(t)), planText.join(" | "));
    } finally {
      await browser.close();
    }
  });
});
