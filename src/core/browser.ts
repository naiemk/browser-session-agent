/**
 * Browser port for the new core.
 *
 * The core depends only on this interface. `LocalBrowser` is the direct-Playwright
 * implementation used by tests and the task suite. At cutover (AGENT-09) an adapter
 * over the kept CDP plumbing in src/worker/browser-worker.ts implements the same
 * port, so the persistent-profile and screencast work is not rewritten (D34).
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { perceive, visibleText } from "./perceive.ts";
import { CoreError, type Observation, type PageFacts } from "./types.ts";

export interface BrowserPort {
  /**
   * A tab in the shared session: it sees the same cookies and storage as every other
   * ordinary tab, which is what makes a side tab a second window onto *our* session
   * rather than a stranger's.
   */
  openTab(url?: string): Promise<string>;
  /**
   * A tab with no cookies and no storage: the same page as an anonymous visitor sees it.
   *
   * This is the one primitive the agent needs to work out where it stands, and it needs no
   * knowledge of any particular site. Comparing a page as itself against the same page as a
   * stranger reveals whether a session exists, what it grants, and whether the content is
   * reachable by anyone. Read-only by construction: a context with no credentials cannot
   * change the user's account.
   */
  openIsolatedTab(url: string): Promise<string>;
  closeTab(tabId: string): Promise<void>;
  pageFor(tabId?: string): Page;
  observe(tabId?: string): Promise<Observation>;
  facts(tabId?: string): Promise<PageFacts>;
  lastObservation(tabId?: string): Observation | undefined;
  screenshot(tabId: string | undefined, path: string): Promise<void>;
  consoleErrors(tabId?: string): string[];
  failedRequests(tabId?: string): string[];
  close(): Promise<void>;
}

const MAX_CAPTURED = 20;

export class LocalBrowser implements BrowserPort {
  private readonly pages = new Map<string, Page>();
  private readonly consoleByTab = new Map<string, string[]>();
  private readonly failedByTab = new Map<string, string[]>();
  private readonly observations = new Map<string, Observation>();
  /** Contexts owned by isolated tabs, closed with the tab so they cannot leak. */
  private readonly isolated = new Map<string, BrowserContext>();
  private seq = 0;

  private constructor(
    private readonly browser: Browser,
    /**
     * The session every ordinary tab shares.
     *
     * `browser.newPage()` is documented as creating a page *in a new browser context*, so
     * using it per tab gives each one its own cookie jar. That silently breaks the whole
     * point of a second tab: it would open signed out, so peeking would show us a
     * stranger's view of our own account. One explicit context is the fix.
     */
    private readonly shared: BrowserContext,
  ) {}

  static async launch(options: { headless?: boolean } = {}): Promise<LocalBrowser> {
    const browser = await chromium.launch({
      headless: options.headless ?? true,
      args: ["--no-sandbox"],
    });
    return new LocalBrowser(browser, await browser.newContext());
  }

  async openTab(url?: string): Promise<string> {
    return this.register(await this.shared.newPage(), url);
  }

  async openIsolatedTab(url: string): Promise<string> {
    // A fresh context, so nothing from the signed-in session comes with it.
    const context = await this.browser.newContext();
    const tabId = await this.register(await context.newPage(), url);
    this.isolated.set(tabId, context);
    return tabId;
  }

  async closeTab(tabId: string): Promise<void> {
    const page = this.pages.get(tabId);
    this.pages.delete(tabId);
    this.consoleByTab.delete(tabId);
    this.failedByTab.delete(tabId);
    this.observations.delete(tabId);

    const context = this.isolated.get(tabId);
    this.isolated.delete(tabId);

    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
  }

  private async register(page: Page, url?: string): Promise<string> {
    const tabId = `tab_${++this.seq}`;
    this.pages.set(tabId, page);
    this.consoleByTab.set(tabId, []);
    this.failedByTab.set(tabId, []);

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      this.push(this.consoleByTab, tabId, msg.text().slice(0, 200));
    });
    page.on("pageerror", (err) => {
      this.push(this.consoleByTab, tabId, String(err).slice(0, 200));
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "failed";
      this.push(this.failedByTab, tabId, `${request.method()} ${request.url()} — ${failure}`);
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      this.push(this.failedByTab, tabId, `${response.status()} ${response.url()}`);
    });

    if (url) await page.goto(url, { waitUntil: "domcontentloaded" });
    return tabId;
  }

  pageFor(tabId?: string): Page {
    const id = tabId ?? this.firstTabId();
    const page = id ? this.pages.get(id) : undefined;
    if (!page) throw new CoreError("missing_tab", `No such tab: ${tabId ?? "(none open)"}`);
    return page;
  }

  tabIdFor(tabId?: string): string {
    const id = tabId ?? this.firstTabId();
    if (!id) throw new CoreError("missing_tab", "No tab is open");
    return id;
  }

  async observe(tabId?: string): Promise<Observation> {
    const id = this.tabIdFor(tabId);
    const observation = await perceive(this.pageFor(id), {
      tabId: id,
      previous: this.observations.get(id),
      consoleErrors: this.consoleByTab.get(id) ?? [],
      failedRequests: this.failedByTab.get(id) ?? [],
    });
    this.observations.set(id, observation);
    return observation;
  }

  async facts(tabId?: string): Promise<PageFacts> {
    const observation = await this.observe(tabId);
    const text = await visibleText(this.pageFor(tabId));
    return { url: observation.url, title: observation.title, text, observation };
  }

  lastObservation(tabId?: string): Observation | undefined {
    const id = tabId ?? this.firstTabId();
    return id ? this.observations.get(id) : undefined;
  }

  async screenshot(tabId: string | undefined, path: string): Promise<void> {
    await this.pageFor(tabId).screenshot({ path, fullPage: false });
  }

  consoleErrors(tabId?: string): string[] {
    return [...(this.consoleByTab.get(this.tabIdFor(tabId)) ?? [])];
  }

  failedRequests(tabId?: string): string[] {
    return [...(this.failedByTab.get(this.tabIdFor(tabId)) ?? [])];
  }

  async close(): Promise<void> {
    await this.browser.close().catch(() => undefined);
    this.pages.clear();
  }

  private firstTabId(): string | undefined {
    return this.pages.keys().next().value as string | undefined;
  }

  private push(store: Map<string, string[]>, tabId: string, value: string): void {
    const list = store.get(tabId) ?? [];
    list.push(value);
    store.set(tabId, list.slice(-MAX_CAPTURED));
  }
}
