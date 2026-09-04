/**
 * Browser port for the new core.
 *
 * The core depends only on this interface. `LocalBrowser` is the direct-Playwright
 * implementation used by tests and the task suite. At cutover (AGENT-09) an adapter
 * over the kept CDP plumbing in src/worker/browser-worker.ts implements the same
 * port, so the persistent-profile and screencast work is not rewritten (D34).
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { perceive, refSelector, visibleText } from "./perceive.ts";
import { probe, type ProbeResult } from "./probe.ts";
import { surveyAffordances, type AffordanceSurvey } from "./survey.ts";
import { CoreError, type Observation, type PageFacts, type WaitSpec } from "./types.ts";

/** Read-only limits a caller may tighten. Serializable, so it can cross a wire. */
export interface ProbeLimits {
  maxResultChars?: number;
  timeoutMs?: number;
}

/**
 * The browser, as the agent is allowed to see it.
 *
 * Every method is *serializable*: arguments and results are data, never live objects.
 * That is the whole design constraint, and it used to be violated. The port exposed
 * `pageFor(): Page`, and `act`, `probe` and `survey` all took that raw Playwright page —
 * which made the port implementable only when the browser was in the same process. In the
 * product the browser runs on the user's desktop and the agent runs on a server, talking
 * over RPC, and a `Page` cannot cross that boundary. So the new runtime was structurally
 * incapable of driving the product's browser, whichever tests passed.
 *
 * The split that fixes it: this port owns *primitives* and no judgement at all. Deciding
 * what an action means, whether it worked, whether it can be undone, and what to record
 * stays in `act` and the rest of the core, where there is exactly one copy of it.
 */
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

  // Reads.
  observe(tabId?: string): Promise<Observation>;
  facts(tabId?: string): Promise<PageFacts>;
  lastObservation(tabId?: string): Observation | undefined;
  /** One read-only query. The query is validated data, and so is the answer. */
  probe(query: unknown, tabId?: string, limits?: ProbeLimits): Promise<ProbeResult>;
  /** What this page advertises, following none of it. */
  survey(tabId?: string): Promise<AffordanceSurvey>;

  /*
   * Primitives. Deliberately dumb: no verification, no reversibility judgement, no
   * evidence. `act` is the only caller and it owns all three, so there is one place
   * where an action can be performed and exactly one place where it is judged.
   */
  navigate(tabId: string | undefined, url: string, timeoutMs: number): Promise<void>;
  click(tabId: string | undefined, ref: string, timeoutMs: number): Promise<void>;
  fill(tabId: string | undefined, ref: string, text: string, timeoutMs: number): Promise<void>;
  selectOption(
    tabId: string | undefined,
    ref: string,
    value: string,
    timeoutMs: number,
  ): Promise<void>;
  scroll(
    tabId: string | undefined,
    ref: string | undefined,
    dy: number | undefined,
    timeoutMs: number,
  ): Promise<void>;
  setInputFiles(
    tabId: string | undefined,
    ref: string,
    files: string[],
    timeoutMs: number,
  ): Promise<void>;
  waitFor(tabId: string | undefined, spec: WaitSpec, timeoutMs: number): Promise<void>;

  // Evidence and lifecycle.
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

  /**
   * Not on the port, on purpose: a live page cannot cross a wire. Kept public because
   * tests and local-only tooling legitimately want direct Playwright access.
   */
  pageFor(tabId?: string): Page {
    const id = tabId ?? this.firstTabId();
    const page = id ? this.pages.get(id) : undefined;
    if (!page) throw new CoreError("missing_tab", `No such tab: ${tabId ?? "(none open)"}`);
    return page;
  }

  async probe(query: unknown, tabId?: string, limits: ProbeLimits = {}): Promise<ProbeResult> {
    return probe(this.pageFor(tabId), query, limits);
  }

  async survey(tabId?: string): Promise<AffordanceSurvey> {
    return surveyAffordances(this.pageFor(tabId));
  }

  async navigate(tabId: string | undefined, url: string, timeoutMs: number): Promise<void> {
    await this.pageFor(tabId).goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  }

  async click(tabId: string | undefined, ref: string, timeoutMs: number): Promise<void> {
    await this.locator(tabId, ref).click({ timeout: timeoutMs });
  }

  async fill(
    tabId: string | undefined,
    ref: string,
    text: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.locator(tabId, ref).fill(text, { timeout: timeoutMs });
  }

  async selectOption(
    tabId: string | undefined,
    ref: string,
    value: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.locator(tabId, ref).selectOption(value, { timeout: timeoutMs });
  }

  async scroll(
    tabId: string | undefined,
    ref: string | undefined,
    dy: number | undefined,
    timeoutMs: number,
  ): Promise<void> {
    const page = this.pageFor(tabId);
    if (ref && dy) {
      // Scroll *within* the referenced container: hover it, then wheel. This is what a
      // virtualized listbox needs; scrollIntoViewIfNeeded cannot reach unrendered rows.
      await this.locator(tabId, ref).hover({ timeout: timeoutMs });
      await page.mouse.wheel(0, dy);
      return;
    }
    if (ref) {
      await this.locator(tabId, ref).scrollIntoViewIfNeeded({ timeout: timeoutMs });
      return;
    }
    await page.mouse.wheel(0, dy ?? 600);
  }

  async setInputFiles(
    tabId: string | undefined,
    ref: string,
    files: string[],
    timeoutMs: number,
  ): Promise<void> {
    await this.locator(tabId, ref).setInputFiles(files, { timeout: timeoutMs });
  }

  async waitFor(tabId: string | undefined, spec: WaitSpec, timeoutMs: number): Promise<void> {
    const page = this.pageFor(tabId);
    switch (spec.kind) {
      case "load":
        await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
        return;
      case "url":
        await page.waitForURL((url) => url.href.includes(spec.value ?? ""), {
          timeout: timeoutMs,
        });
        return;
      case "text":
        await page
          .getByText(spec.value ?? "", { exact: false })
          .first()
          .waitFor({ timeout: timeoutMs });
        return;
      case "ref":
        await this.locator(tabId, spec.value ?? "").waitFor({ timeout: timeoutMs });
        return;
      case "timeout":
        await page.waitForTimeout(timeoutMs);
        return;
    }
  }

  private locator(tabId: string | undefined, ref: string) {
    return this.pageFor(tabId).locator(refSelector(ref)).first();
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
