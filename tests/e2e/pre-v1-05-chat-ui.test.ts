import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import {
  closeV1,
  connectHelper,
  exchangePair,
  issuePairCode,
  startV1Api,
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
    try {
      const page = await browser.newPage();
      await page.goto(world.origin, { waitUntil: "domcontentloaded" });
      assert.equal(new URL(page.url()).search.includes("token="), false);
      await page.locator("#auth-email").fill(user.email);
      await page.locator("#auth-password").fill(user.password);
      await page.locator("#auth-register").click();
      await page.locator("#auth").waitFor({ state: "hidden", timeout: 10_000 });
      await page.locator("#composer").waitFor();
      assert.equal(new URL(page.url()).search.includes("token="), false);

      const session = (await page.context().cookies()).find((c) => c.name === "bsa_session");
      assert.ok(session);
      const cookie = `bsa_session=${session.value}`;
      const { deviceToken } = await exchangePair(world.origin, await issuePairCode(world.origin, cookie));
      connectHelper(world, deviceToken);
      await page.locator("#node-pill").filter({ hasText: "Connected" }).waitFor({ timeout: 20_000 });

      await page.locator("#input").fill(
        `/browser-start --url ${world.fixtureOrigin}/apply apply`,
      );
      await page.locator("#composer button[type=submit]").click();
      await page.locator(".msg.system").filter({ hasText: /Started/ }).waitFor({ timeout: 20_000 });
      await page.locator("#live.has-frame").waitFor({ timeout: 20_000 });
      const src = await page.locator("#frame").getAttribute("src");
      assert.ok(src?.startsWith("data:image/jpeg"));

      await page.getByRole("button", { name: "/browser-takeover" }).click();
      await page.locator("#takeover-pill:not(.hidden)").waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: "/browser-resume" }).click();
      await page.locator("#takeover-pill").waitFor({ state: "hidden", timeout: 10_000 });
      assert.equal(new URL(page.url()).search.includes("token="), false);
    } finally {
      await browser.close();
    }
  });
});
