import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import {
  closeV1,
  issuePairCode,
  spawnHelper,
  startV1Api,
  stopChild,
  uniqueUser,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-05-T01 UI on same origin (no ?token=)", () => {
  it("signs in, shows Connected, live JPEG, and takeover without token= in the URL", async () => {
    const world = await withFixture(await startV1Api({ requirePaid: false }));
    worlds.push(world);
    const user = await uniqueUser();
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    let child: ReturnType<typeof spawnHelper> | undefined;
    try {
      const page = await browser.newPage();
      await page.goto(world.origin, { waitUntil: "domcontentloaded" });
      assert.equal(new URL(page.url()).search.includes("token="), false);
      await page.locator("#auth-email").fill(user.email);
      await page.locator("#auth-password").fill(user.password);
      await page.locator("#auth-register").click();
      await page.locator("#composer").waitFor();
      assert.equal(new URL(page.url()).search.includes("token="), false);

      const session = (await page.context().cookies()).find((c) => c.name === "bsa_session");
      assert.ok(session);
      const code = await issuePairCode(world.origin, `bsa_session=${session.value}`);
      child = spawnHelper(world.api.port, world.home, { BSA_PAIR_CODE: code });
      await page.locator("#node-pill").filter({ hasText: "Connected" }).waitFor({ timeout: 20_000 });

      page.on("dialog", (dialog) => {
        const message = dialog.message();
        if (/goal/i.test(message)) void dialog.accept("apply");
        else void dialog.accept(`${world.fixtureOrigin}/apply`);
      });
      await page.getByRole("button", { name: "/browser-start" }).click();
      await page.locator("#live.has-frame").waitFor({ timeout: 20_000 });
      const src = await page.locator("#frame").getAttribute("src");
      assert.ok(src?.startsWith("data:image/jpeg"));

      await page.getByRole("button", { name: "/browser-takeover" }).click();
      await page.locator("#takeover-pill:not(.hidden)").waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: "/browser-resume" }).click();
      await page.locator("#takeover-pill.hidden").waitFor({ timeout: 10_000 });
      assert.equal(new URL(page.url()).search.includes("token="), false);
    } finally {
      if (child) await stopChild(child);
      await browser.close();
    }
  });
});
