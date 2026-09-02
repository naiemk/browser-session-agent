import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import { closeV1, startV1Api, uniqueUser, type V1World } from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-01-T03 chat UI sign-in", () => {
  it("signs in through the form and shows a reply without ?token=", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(world.origin, { waitUntil: "domcontentloaded" });
      assert.equal(new URL(page.url()).search.includes("token="), false);
      await page.locator("#auth-register").waitFor();
      await page.locator("#auth-email").fill(user.email);
      await page.locator("#auth-password").fill(user.password);
      await page.locator("#auth-register").click();
      await page.locator("#composer").waitFor();
      await page.locator("#chat-pill").filter({ hasText: "Live" }).waitFor({ timeout: 8_000 });
      assert.match(await page.locator(".msg.system").first().innerText(), /Browser operator ready/);
      assert.equal(new URL(page.url()).search.includes("token="), false);
      await page.locator("#input").fill("hello ui");
      await page.locator("#composer button[type=submit]").click();
      await page.locator(".msg.assistant").waitFor({ timeout: 8_000 });
      assert.match(await page.locator(".msg.assistant").innerText(), /hello ui/);
      assert.equal(new URL(page.url()).search.includes("token="), false);

      await page.evaluate("globalThis.__bsaCloseChat && globalThis.__bsaCloseChat()");
      await page.locator("#chat-pill").filter({ hasText: "Reconnecting" }).waitFor({ timeout: 8_000 });
      const transcript = await page.locator("#messages .msg").allInnerTexts();
      assert.equal(transcript.some((text) => /Chat disconnected/.test(text)), false);
      await page.locator("#chat-pill").filter({ hasText: "Live" }).waitFor({ timeout: 8_000 });
    } finally {
      await browser.close();
    }
  });
});
