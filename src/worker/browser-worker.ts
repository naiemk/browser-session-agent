import { execSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { AgentError, type Observation, type WaitSpec, type WorkerInfo } from "../domain/types.ts";
import { shortId } from "../domain/ids.ts";
import { dataPaths, ensureDir } from "../store/paths.ts";
import { readWorkerInfo, writeWorkerInfo, clearWorkerInfo } from "../store/worker-info.ts";
import { observePage, visibleText } from "./observe.ts";

const TAB_PREFIX = "bsa:";

export interface WorkerOptions {
  home: string;
  headless?: boolean;
  startUrl?: string;
}

/** Pointer/key events from the remote live view. x/y are 0–1 or CSS pixels. */
export type WorkerInputEvent =
  | {
      kind: "mouse";
      action: "move" | "down" | "up" | "wheel";
      x: number;
      y: number;
      button?: number;
      deltaY?: number;
    }
  | { kind: "key"; action: "down" | "up"; key: string; text?: string; modifiers?: number };

function childPids(): number[] {
  try {
    return execSync(`pgrep -P ${process.pid}`, { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function chromePid(browser: Browser | null): number {
  if (!browser) return 0;
  const candidate = browser as Browser & {
    process?: (() => { pid?: number } | null) | { pid?: number };
  };
  if (typeof candidate.process === "function") {
    return candidate.process()?.pid ?? 0;
  }
  if (candidate.process && typeof candidate.process === "object") {
    return candidate.process.pid ?? 0;
  }
  return 0;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function connectCdp(cdpUrl: string, attempts = 15): Promise<Browser> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chromium.connectOverCDP(cdpUrl);
    } catch (err) {
      last = err;
      await delay(200);
    }
  }
  throw last instanceof Error ? last : new Error(`CDP connect failed: ${cdpUrl}`);
}

export class BrowserWorker {
  private readonly home: string;
  private readonly headless: boolean;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private launchedHere = false;
  private trackedPids: number[] = [];
  private readonly pages = new Map<string, Page>();
  private readonly consoleErrors = new Map<string, string[]>();
  private readonly lastObservation = new Map<string, Observation>();
  private info: WorkerInfo | null = null;
  private screencast: { client: CDPSession; tabId: string } | null = null;

  constructor(options: WorkerOptions) {
    this.home = options.home;
    this.headless = options.headless ?? false;
  }

  get workerInfo(): WorkerInfo | null {
    return this.info;
  }

  async start(): Promise<WorkerInfo> {
    if (this.context) return this.info!;

    const existing = await readWorkerInfo(this.home);
    if (existing?.cdpUrl) {
      try {
        await this.attachCdp(existing);
        this.launchedHere = false;
        return this.info!;
      } catch {
        // relaunch a fresh persistent context
      }
    }

    try {
      await this.launchManaged();
      this.launchedHere = true;
      return this.info!;
    } catch (err) {
      const launched = this.context as BrowserContext | null;
      if (launched) {
        try {
          await launched.close();
        } catch {
          // ignore
        }
      }
      this.context = null;
      this.browser = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.launchedHere && this.browser) {
      try {
        const connection = (
          this.browser as unknown as {
            _connection?: { close: () => Promise<void> };
          }
        )._connection;
        if (connection) await connection.close();
      } catch {
        // drop the CDP client only
      }
    }
    if (!this.launchedHere) {
      this.browser = null;
      this.context = null;
      this.pages.clear();
    }
  }

  async stop(): Promise<void> {
    await this.stopScreencast().catch(() => undefined);
    const pids = [...this.trackedPids, this.info?.pid ?? 0, chromePid(this.browser)].filter(
      (pid) => pid > 0 && pid !== process.pid,
    );
    if (this.context) {
      try {
        await Promise.race([this.context.close(), delay(300)]);
      } catch {
        // already closed
      }
    }
    for (const pid of new Set(pids)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    this.launchedHere = false;
    this.browser = null;
    this.context = null;
    this.pages.clear();
    this.info = null;
    await clearWorkerInfo(this.home);
  }

  listTabs(): TabSnapshot[] {
    return [...this.pages.entries()].map(([tabId, page]) => ({
      tabId,
      url: page.url(),
      title: page.url() === "about:blank" ? "" : "",
    }));
  }

  async describeTabs(): Promise<Array<{ tabId: string; url: string; title: string }>> {
    const out = [];
    for (const [tabId, page] of this.pages) {
      out.push({ tabId, url: page.url(), title: await page.title() });
    }
    return out;
  }

  async inspect(tabId?: string): Promise<Observation> {
    const page = this.requirePage(tabId);
    const id = this.idOf(page);
    const observation = await observePage(
      page,
      id,
      this.lastObservation.get(id),
      this.consoleErrors.get(id) ?? [],
    );
    this.lastObservation.set(id, observation);
    return observation;
  }

  async pageText(tabId?: string): Promise<string> {
    return visibleText(this.requirePage(tabId));
  }

  async screenshot(tabId: string | undefined, path: string): Promise<void> {
    await this.requirePage(tabId).screenshot({ path, fullPage: false });
  }

  async screenshotJpeg(tabId?: string): Promise<{ jpeg: string; tabId: string }> {
    const page = this.requirePage(tabId);
    const id = this.idOf(page);
    const buf = await page.screenshot({ type: "jpeg", quality: 50 });
    return { jpeg: buf.toString("base64"), tabId: id };
  }

  async navigate(tabId: string | undefined, url: string): Promise<void> {
    await this.requirePage(tabId).goto(url, { waitUntil: "domcontentloaded" });
  }

  async click(tabId: string | undefined, ref: string): Promise<void> {
    const page = this.requirePage(tabId);
    await this.inspect(this.idOf(page));
    const locator = page.locator(`[data-bsa-ref="${cssEscape(ref)}"]`);
    if ((await locator.count()) === 0) {
      throw new AgentError("missing_ref", `No control with ref ${ref}`, { ref });
    }
    await locator.first().click({ timeout: 5_000, force: true });
  }

  async type(tabId: string | undefined, ref: string, text: string): Promise<string | undefined> {
    const page = this.requirePage(tabId);
    const observation = await this.inspect(this.idOf(page));
    const control = observation.controls.find((c) => c.ref === ref);
    const locator = page.locator(`[data-bsa-ref="${cssEscape(ref)}"]`);
    if ((await locator.count()) === 0) {
      throw new AgentError("missing_ref", `No control with ref ${ref}`, { ref });
    }
    const target = locator.first();
    const useFill = control?.tag === "textarea" || control?.tag === "input";
    if (useFill) {
      await target.fill(text);
      return control?.inputType;
    }

    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height * 0.4, 120));
    } else {
      await target.click({ force: true, timeout: 3_000 });
    }
    let applied = false;
    for (let i = 0; i < 8 && !applied; i++) {
      applied = (await page.evaluate(
        `(() => {
          const api = window.monaco && window.monaco.editor && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0];
          if (!api) return false;
          api.setValue(${JSON.stringify(text)});
          return true;
        })()`,
      )) as boolean;
      if (!applied) await delay(200);
    }
    if (!applied) {
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(text);
    }
    return control?.inputType;
  }

  async select(tabId: string | undefined, ref: string, value: string): Promise<void> {
    const page = this.requirePage(tabId);
    await this.inspect(this.idOf(page));
    const locator = page.locator(`[data-bsa-ref="${cssEscape(ref)}"]`);
    if ((await locator.count()) === 0) {
      throw new AgentError("missing_ref", `No control with ref ${ref}`, { ref });
    }
    await locator.first().selectOption(value);
  }

  async scroll(tabId: string | undefined, ref?: string, dy = 600): Promise<void> {
    const page = this.requirePage(tabId);
    if (ref) {
      await this.inspect(this.idOf(page));
      const locator = page.locator(`[data-bsa-ref="${cssEscape(ref)}"]`);
      if ((await locator.count()) === 0) {
        throw new AgentError("missing_ref", `No control with ref ${ref}`, { ref });
      }
      if (dy) {
        await page.evaluate(
          `(() => {
            const el = document.querySelector('[data-bsa-ref="${cssEscape(ref)}"]');
            if (!el) return;
            const delta = ${Number(dy)};
            const canScroll = (node) =>
              node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2;
            let target = el;
            if (!canScroll(target)) {
              let parent = target.parentElement;
              while (parent && !canScroll(parent)) parent = parent.parentElement;
              if (parent) target = parent;
            }
            target.scrollTop += delta;
          })()`,
        );
        return;
      }
      await locator.first().scrollIntoViewIfNeeded();
      return;
    }
    await page.mouse.wheel(0, dy);
  }

  async wait(tabId: string | undefined, spec: WaitSpec): Promise<void> {
    const page = this.requirePage(tabId);
    const timeout = Math.min(spec.timeoutMs ?? 5000, 15_000);
    switch (spec.kind) {
      case "load":
        await page.waitForLoadState("domcontentloaded", { timeout });
        break;
      case "url":
        await page.waitForURL((url) => url.toString().includes(spec.value ?? ""), { timeout });
        break;
      case "text":
        await page.getByText(spec.value ?? "", { exact: false }).first().waitFor({ timeout });
        break;
      case "ref":
        await this.inspect(this.idOf(page));
        await page.locator(`[data-bsa-ref="${cssEscape(spec.value ?? "")}"]`).first().waitFor({
          timeout,
        });
        break;
      case "timeout":
        await delay(timeout);
        break;
    }
  }

  async bringToFront(tabId: string): Promise<void> {
    await this.requirePage(tabId).bringToFront();
  }

  async openTab(url?: string): Promise<string> {
    const context = this.requireContext();
    const page = await context.newPage();
    const tabId = await this.track(page);
    if (url) await page.goto(url, { waitUntil: "domcontentloaded" });
    return tabId;
  }

  firstTabId(): string | undefined {
    return this.pages.keys().next().value;
  }

  controlInputType(tabId: string, ref: string): string | undefined {
    return this.lastObservation.get(tabId)?.controls.find((c) => c.ref === ref)?.inputType;
  }

  async startScreencast(
    onFrame: (jpeg: string, tabId: string) => void,
    tabId?: string,
  ): Promise<string> {
    await this.stopScreencast();
    const page = this.requirePage(tabId);
    const id = this.idOf(page);
    const client = await page.context().newCDPSession(page);
    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 45,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 2,
    });
    client.on("Page.screencastFrame", (event: { data: string; sessionId: number }) => {
      onFrame(event.data, id);
      void client.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
    });
    this.screencast = { client, tabId: id };
    return id;
  }

  async stopScreencast(): Promise<void> {
    const current = this.screencast;
    this.screencast = null;
    if (!current) return;
    try {
      await current.client.send("Page.stopScreencast");
    } catch {
      // already stopped
    }
    try {
      await current.client.detach();
    } catch {
      // already detached
    }
  }

  async applyInput(event: WorkerInputEvent, tabId?: string): Promise<void> {
    const page = this.requirePage(tabId ?? this.screencast?.tabId);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    if (event.kind === "mouse") {
      const x = event.x <= 1 ? event.x * viewport.width : event.x;
      const y = event.y <= 1 ? event.y * viewport.height : event.y;
      const button = event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
      if (event.action === "move") {
        await page.mouse.move(x, y);
        return;
      }
      if (event.action === "down") {
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
        return;
      }
      if (event.action === "up") {
        await page.mouse.move(x, y);
        await page.mouse.up({ button });
        return;
      }
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, event.deltaY ?? 120);
      return;
    }
    if (event.action === "down") {
      if (event.text) {
        await page.keyboard.insertText(event.text);
        return;
      }
      await page.keyboard.down(event.key);
      return;
    }
    await page.keyboard.up(event.key);
  }

  private async launchManaged(): Promise<void> {
    const paths = dataPaths(this.home);
    await ensureDir(paths.profileDir);
    const port = await freePort();
    this.context = await chromium.launchPersistentContext(paths.profileDir, {
      headless: this.headless,
      viewport: { width: 1280, height: 720 },
      args: [
        `--remote-debugging-port=${port}`,
        "--remote-debugging-address=127.0.0.1",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    this.browser = this.context.browser();
    this.info = {
      pid: chromePid(this.browser),
      cdpUrl: `http://127.0.0.1:${port}`,
      port,
      profileDir: paths.profileDir,
      startedAt: new Date().toISOString(),
    };
    await writeWorkerInfo(this.home, this.info);
    this.trackedPids = childPids();
    await this.hydratePages();
  }

  private async attachCdp(info: WorkerInfo): Promise<void> {
    this.browser = await connectCdp(info.cdpUrl);
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
    this.info = info;
    await this.hydratePages();
  }

  private async hydratePages(): Promise<void> {
    const context = this.requireContext();
    this.pages.clear();
    for (const page of context.pages()) {
      await this.track(page);
    }
    if (this.pages.size === 0) {
      await this.track(await context.newPage());
    }
    context.on("page", (page) => {
      void this.track(page);
    });
  }

  private async track(page: Page): Promise<string> {
    const prefix = JSON.stringify(TAB_PREFIX);
    const existing = (await page.evaluate(
      `window.name.startsWith(${prefix}) ? window.name.slice(${TAB_PREFIX.length}) : ""`,
    )) as string;
    const tabId = existing || shortId("tab");
    const assigned = JSON.stringify(TAB_PREFIX + tabId);
    await page.evaluate(
      `if (!window.name.startsWith(${prefix})) window.name = ${assigned}`,
    );
    this.pages.set(tabId, page);
    this.consoleErrors.set(tabId, []);
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const list = this.consoleErrors.get(tabId) ?? [];
        list.push(msg.text());
        this.consoleErrors.set(tabId, list.slice(-20));
      }
    });
    page.on("pageerror", (err) => {
      const list = this.consoleErrors.get(tabId) ?? [];
      list.push(err.message);
      this.consoleErrors.set(tabId, list.slice(-20));
    });
    page.on("close", () => {
      this.pages.delete(tabId);
    });
    return tabId;
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new AgentError("worker_error", "Browser worker is not started");
    }
    return this.context;
  }

  private requirePage(tabId?: string): Page {
    const id = tabId ?? this.firstTabId();
    if (!id) {
      throw new AgentError("worker_error", "No browser tabs");
    }
    const page = this.pages.get(id);
    if (!page) {
      throw new AgentError("unknown_tab", `Unknown tab ${id}`, { tabId: id });
    }
    return page;
  }

  private idOf(page: Page): string {
    for (const [id, candidate] of this.pages) {
      if (candidate === page) return id;
    }
    throw new AgentError("unknown_tab", "Page is not tracked");
  }
}

export interface TabSnapshot {
  tabId: string;
  url: string;
  title: string;
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
