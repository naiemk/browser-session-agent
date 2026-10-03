/**
 * Throwaway: Minsk → Tbilisi on belavia.by.
 * Keyboard, then clickable-element refs, then one downsampled GLM screenshot click.
 * Does not print the API key.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

const URL = "https://belavia.by/booking/";
const PROFILE = path.join(homedir(), ".browser-session-agent/profile");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim();
  const raw = readFileSync(path.join(ROOT, ".env"), "utf8");
  const line = raw.split("\n").find((row) => row.startsWith("OPENROUTER_API_KEY="));
  const key = line?.slice("OPENROUTER_API_KEY=".length).trim();
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  return key;
}

function log(step: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ step, ...extra }));
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 500));
}

function fareHit(url: string, text: string): boolean {
  const place = /Тбилиси|Tbilisi|\bTBS\b/i.test(`${url} ${text}`);
  const results = /\/results\//.test(url) || /График цен/i.test(text);
  const price = /\d[\d\s\u00a0]{0,8}\s*BYN/i.test(text);
  return place && (results || price);
}

function cdpUrl(): string | undefined {
  const out = execSync("ps aux", { encoding: "utf8" });
  const line = out
    .split("\n")
    .find((row) => row.includes(".browser-session-agent/profile") && row.includes("--remote-debugging-port="));
  const port = line?.match(/--remote-debugging-port=(\d+)/)?.[1];
  return port ? `http://127.0.0.1:${port}` : undefined;
}

async function openPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  try {
    const context = await chromium.launchPersistentContext(PROFILE, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-dev-shm-usage"],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    return { page, close: () => context.close() };
  } catch (error) {
    if (!/existing browser session/i.test(String(error))) throw error;
    const endpoint = cdpUrl();
    if (!endpoint) throw error;
    log("attach", { endpoint });
    const browser: Browser = await chromium.connectOverCDP(endpoint);
    const context: BrowserContext = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    return {
      page,
      close: async () => {
        await page.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      },
    };
  }
}

async function fieldValue(locator: Locator): Promise<string> {
  return (await locator.inputValue().catch(() => "")).trim();
}

function originCommitted(value: string): boolean {
  return /MSQ/i.test(value) || /минск/i.test(value) && value.length > "Минск".length;
}

function destCommitted(value: string): boolean {
  return /TBS/i.test(value) || (/тбилиси/i.test(value) && value.replace(/\s/g, "").length > "Тбилиси".length);
}

async function focusType(field: Locator, text: string): Promise<void> {
  await field.click({ timeout: 8_000 });
  await field.fill("");
  await field.pressSequentially(text, { delay: 30 });
  await field.page().waitForTimeout(500);
}

async function keyboardCommit(page: Page, field: Locator, text: string, kind: "origin" | "dest"): Promise<boolean> {
  await focusType(field, text);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const value = await fieldValue(field);
  const ok = kind === "origin" ? originCommitted(value) : destCommitted(value);
  log("keyboard", { kind, value, ok });
  return ok;
}

async function clickMatching(page: Page, pattern: RegExp): Promise<boolean> {
  const clicked = await page.evaluate((source) => {
    const re = new RegExp(source, "i");
    const nodes = Array.from(document.querySelectorAll("div, li, span, a, button"));
    const hits: Element[] = [];
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const shown =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (shown && text.length > 0 && text.length <= 80 && re.test(text)) hits.push(el);
    }
    hits.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
    const cityHits = hits.filter((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return text.length > 5 && /Минск|Тбилиси/.test(text);
    });
    const pool = cityHits.length > 0 ? cityHits : hits;
    let target: Element | undefined;
    for (const el of pool) {
      let node: Element | null = el;
      for (let depth = 0; depth < 5 && node; depth += 1) {
        const tag = node.tagName.toLowerCase();
        const style = window.getComputedStyle(node);
        const tab = node.getAttribute("tabindex");
        const pointer =
          tag !== "input" &&
          tag !== "textarea" &&
          tag !== "select" &&
          (style.cursor === "pointer" ||
            (tab != null && tab !== "" && Number(tab) >= 0) ||
            tag === "a" ||
            tag === "button" ||
            tag === "li");
        if (pointer) {
          target = node;
          break;
        }
        node = node.parentElement;
      }
      if (target) break;
    }
    if (!target) {
      return {
        ok: false as const,
        sample: hits.slice(0, 6).map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60)),
      };
    }
    target.setAttribute("data-bsa-ref", "poc-hit");
    const rect = target.getBoundingClientRect();
    return {
      ok: true as const,
      name: (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  }, pattern.source);
  log("clickable", { pattern: pattern.source, ...clicked });
  if (clicked.ok) await page.mouse.click(clicked.x, clicked.y);
  await page.waitForTimeout(400);
  return clicked.ok;
}

async function visionClick(page: Page, key: string, hint: string): Promise<boolean> {
  await page.setViewportSize({ width: 800, height: 700 });
  const jpeg = await page.screenshot({ type: "jpeg", quality: 40 });
  const models = ["z-ai/glm-5.3-flash", "z-ai/glm-4.6v"];
  let point: { x: number; y: number } | undefined;
  let used = "";
  for (const model of models) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "The image is a Belavia booking page, 800x700 CSS pixels. " +
                  `Return only JSON {\"x\":number,\"y\":number} for the center of ${hint}. ` +
                  "Coordinates are image pixels. If it is not visible, return {\"x\":-1,\"y\":-1}.",
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
            ],
          },
        ],
      }),
    });
    const payload = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? payload.error?.message ?? "";
    log("vision-model", { model, status: response.status, content: String(content).slice(0, 180) });
    const match = String(content).match(/\{[^{}]*"x"\s*:\s*(-?\d+(?:\.\d+)?)[^{}]*"y"\s*:\s*(-?\d+(?:\.\d+)?)[^{}]*\}/);
    if (response.ok && match) {
      point = { x: Number(match[1]), y: Number(match[2]) };
      used = model;
      break;
    }
  }
  if (!point || point.x < 0 || point.y < 0) {
    log("vision", { ok: false, used });
    return false;
  }
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(500);
  log("vision", { ok: true, used, x: point.x, y: point.y });
  return true;
}

async function fieldMeta(page: Page, name: string): Promise<{ value: string; placeholder: string; around: string }> {
  return page.evaluate((fieldName) => {
    const input = document.querySelector(`input[name="${fieldName}"]`) as HTMLInputElement | null;
    const around = input?.parentElement?.parentElement?.innerText || "";
    return {
      value: input?.value || "",
      placeholder: input?.placeholder || "",
      around: around.replace(/\s+/g, " ").slice(0, 160),
    };
  }, name);
}

function metaCommitted(meta: { value: string; placeholder: string; around: string }, kind: "origin" | "dest"): boolean {
  const code = kind === "origin" ? /MSQ/i : /TBS/i;
  if (code.test(meta.value)) return true;
  if (code.test(meta.placeholder)) return false;
  return meta.value === "" && code.test(meta.around);
}

async function finishSearch(page: Page): Promise<boolean> {
  await page.getByText("Дата вылета", { exact: true }).click({ timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  for (let hop = 0; hop < 4; hop += 1) {
    const month = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ");
      return text.match(/(сентябр|октябр|ноябр|декабр)[а-я]*\s*20\d{2}/i)?.[0] || "";
    });
    log("calendar", { hop, month });
    if (/ноябр/i.test(month)) break;
    const next = page.locator('[class*="nav_next"]').last();
    if (!(await next.count())) break;
    await next.click({ timeout: 2_000 });
    await page.waitForTimeout(400);
  }
  const outbound = await pickCalendarDay(page, "10");
  log("date-day", { day: "10", point: outbound });
  await page.waitForTimeout(500);
  const inbound = await pickCalendarDay(page, "17");
  log("date-return", { day: "17", point: inbound });
  if (inbound) await page.waitForTimeout(400);
  const submitPoint = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("button, a, div, span"));
    const rows = nodes
      .map((el) => {
        const text = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const rect = el.getBoundingClientRect();
        return {
          text: text.slice(0, 40),
          className: String(el.className || "").slice(0, 48),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
      })
      .filter((item) => item.w >= 24 && item.h >= 24 && item.w <= 280 && item.y > 80 && item.y < 520);
    const labeled = rows.find((item) => /Найти|Search|Поиск/i.test(`${item.text} ${item.className}`));
    return { labeled: labeled || null, sample: rows.filter((item) => item.text.length < 24).slice(0, 12) };
  });
  log("submit-candidates", submitPoint);
  if (submitPoint.labeled) await page.mouse.click(submitPoint.labeled.x, submitPoint.labeled.y);
  else await page.keyboard.press("Enter");
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 8_000) {
    await page.waitForTimeout(1_000);
    text = await page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1500));
    if (fareHit(page.url(), text)) break;
  }
  const ok = fareHit(page.url(), text);
  log("search", { url: page.url(), ok, snippet: text.slice(0, 320) });
  return ok;
}

async function pickCalendarDay(page: Page, day: string): Promise<string | null> {
  const point = await page.evaluate((dayText) => {
    const cells = Array.from(document.querySelectorAll("td, button, div, span, a"));
    const hits = cells
      .map((el) => {
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const compact = text.replace(/\s/g, "");
        const rect = el.getBoundingClientRect();
        return { text, compact, rect };
      })
      .filter(
        (item) =>
          item.rect.width >= 8 &&
          item.rect.width <= 160 &&
          item.rect.height >= 8 &&
          item.rect.height <= 80 &&
          item.compact.length <= dayText.length + 5 &&
          (item.text === dayText ||
            item.text.startsWith(`${dayText} `) ||
            new RegExp(`^${dayText}\\d{3,4}$`).test(item.compact)),
      );
    hits.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
    const cell = hits[0];
    if (!cell) return null;
    return {
      x: cell.rect.x + cell.rect.width / 2,
      y: cell.rect.y + cell.rect.height / 2,
      text: cell.text.slice(0, 24),
    };
  }, day);
  if (!point) return null;
  await page.mouse.click(point.x, point.y);
  return point.text;
}

async function main(): Promise<void> {
  const key = apiKey();
  const { page, close } = await openPage();
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const origin = page.locator('input[name="departure_0"]');
    const dest = page.locator('input[name="arrival_0"]');
    const ready = await origin.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false);
    if (!ready || /verification/i.test(await page.title())) {
      log("blocked", { url: page.url(), title: await page.title(), snippet: await bodyText(page) });
      process.exitCode = 2;
      return;
    }

    let originOk = await keyboardCommit(page, origin, "Минск", "origin");
    if (!originOk) {
      await focusType(origin, "Минск");
      await clickMatching(page, /Минск|MSQ/);
      const meta = await fieldMeta(page, "departure_0");
      originOk = metaCommitted(meta, "origin") || originCommitted(meta.value);
      log("origin-click", meta);
      if (!originOk) {
        await focusType(origin, "Минск");
        await visionClick(page, key, "the Minsk (MSQ) suggestion row in the open dropdown, not the input");
        const after = await fieldMeta(page, "departure_0");
        originOk = metaCommitted(after, "origin") || originCommitted(after.value);
        log("origin-vision", after);
      }
    }
    log("origin-done", { ok: originOk, value: await fieldValue(origin) });

    let destOk = await keyboardCommit(page, dest, "Тбилиси", "dest");
    if (!destOk) {
      await focusType(dest, "Тбилиси");
      await clickMatching(page, /Тбилиси|TBS/);
      const meta = await fieldMeta(page, "arrival_0");
      destOk = metaCommitted(meta, "dest") || destCommitted(meta.value);
      log("dest-click", meta);
      if (!destOk) {
        await focusType(dest, "Тбилиси");
        await visionClick(page, key, "the Tbilisi (TBS) suggestion row in the open dropdown, not the input");
        const after = await fieldMeta(page, "arrival_0");
        destOk = metaCommitted(after, "dest") || destCommitted(after.value);
        log("dest-vision", after);
      }
    }
    log("dest-done", { ok: destOk, value: await fieldValue(dest) });

    if (!originOk || !destOk) {
      log("failed", { originOk, destOk, url: page.url(), snippet: await bodyText(page) });
      process.exitCode = 2;
      return;
    }
    const ok = await finishSearch(page);
    if (!ok) process.exitCode = 2;
  } finally {
    await close();
  }
}

await main();
