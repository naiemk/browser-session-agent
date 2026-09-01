import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import { selectCountryUnitedStates } from "../../src/plan/examples.ts";
import {
  closeV1,
  connectUnpaidConsumer,
  startV1Api,
  waitFor,
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
    const { chat, hub, cookie, account } = await connectUnpaidConsumer(world);
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/dead-click dead`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);

      const page = await browser.newPage();
      await page.context().addCookies([
        {
          name: "bsa_session",
          value: cookie.replace(/^bsa_session=/, ""),
          url: world.origin,
        },
      ]);
      await page.goto(world.origin, { waitUntil: "domcontentloaded" });
      await page.locator("#composer").waitFor();
      await page.locator("#node-pill").filter({ hasText: "Connected" }).waitFor({ timeout: 15_000 });

      const observation = await hub.call<{
        controls: Array<{ ref: string; name: string }>;
      }>("inspect", []);
      const ref = observation.controls.find((c) => c.name.toLowerCase().includes("do nothing"))?.ref;
      assert.ok(ref);
      await hub.call("act", [{ action: "click", ref }]);
      await page.locator(".msg.tool").filter({ hasText: /harness/i }).waitFor({ timeout: 15_000 });

      chat.send({
        type: "command",
        name: "browser-stop",
        args: "",
      });
      await waitFor(chat.inbox, (m) => m.type === "notify", 10_000).catch(() => undefined);
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/combobox?mode=united-states-first select country`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      await hub.call("runPlan", [selectCountryUnitedStates]);
      await page.locator(".msg.plan").waitFor({ timeout: 15_000 });
      const planText = await page.locator(".msg.plan").allInnerTexts();
      assert.ok(planText.some((t) => /plan/i.test(t)), planText.join(" | "));
      assert.ok(account.id);
    } finally {
      chat.close();
      await browser.close();
    }
  });
});
