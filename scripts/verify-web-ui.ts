import { chromium } from "playwright";

async function main() {
  const ui = process.env.BSA_UI ?? "http://127.0.0.1:8787/?token=dev";
  const start =
    process.env.BSA_START ??
    "/browser-start --url http://127.0.0.1:46785/login Sign in on the fixture";
  const out = process.env.BSA_SHOT ?? "/tmp/web-operator-live.png";

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(ui, { waitUntil: "networkidle" });
  await page.waitForSelector("#node-pill");
  await page.waitForFunction(() => document.querySelector("#node-pill")?.textContent?.includes("online"), {
    timeout: 10_000,
  });
  await page.fill("#input", start);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.querySelector("#live")?.classList.contains("has-frame"), {
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: true });
  const node = await page.textContent("#node-pill");
  const hasFrame = await page.evaluate(() => document.querySelector("#live")?.classList.contains("has-frame"));
  const src = await page.getAttribute("#frame", "src");
  console.log(JSON.stringify({ node, hasFrame, jpeg: Boolean(src?.startsWith("data:image/jpeg")), out }));
  await browser.close();
}

await main();
