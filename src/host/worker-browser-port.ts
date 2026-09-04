/**
 * The product's browser, behind the agent's port.
 *
 * This is the adapter the cutover always needed. The desktop worker owns everything that
 * makes the product's browser different from a test one - a persistent profile so logins
 * survive, CDP reconnect so a dropped connection does not lose the session, a screencast
 * so the operator can watch, and the tab identity the run state is written against. None
 * of that is agent logic, and none of it gets rewritten here.
 *
 * What this does not do is reimplement clicking. `PlaywrightBrowserPort` already knows
 * how to drive a page, so this supplies the context and the tab identity and inherits the
 * rest. The worker's own `click`, `type` and `wait` remain for the legacy callers until
 * they go, but the agent no longer reaches them: two implementations of one idea is how a
 * fix in one place stops reaching the other.
 */

import type { Page } from "playwright";
import { PlaywrightBrowserPort, type AcquiredTab } from "../core/browser.ts";
import type { BrowserWorker } from "../worker/browser-worker.ts";

export class WorkerBrowserPort extends PlaywrightBrowserPort {
  private adopted = false;

  private constructor(private readonly worker: BrowserWorker) {
    super();
  }

  /**
   * Adopt a started worker, including tabs it is already tracking.
   *
   * Adopting rather than reopening matters: after a CDP reconnect the worker still holds
   * the operator's tabs, and the run state refers to them by the worker's ids.
   */
  static adopt(worker: BrowserWorker): WorkerBrowserPort {
    const port = new WorkerBrowserPort(worker);
    port.absorbTrackedTabs();
    return port;
  }

  /**
   * Build a port for a worker that may not be running.
   *
   * The legacy path only started a browser as a side effect of starting a *run*. The
   * agent asking for a page is reason enough, so the worker is started on first use.
   */
  static lazy(worker: BrowserWorker): WorkerBrowserPort {
    return new WorkerBrowserPort(worker);
  }

  protected async ensureReady(): Promise<void> {
    if (this.adopted) return;
    // Returns immediately when a context already exists, so this is cheap to repeat.
    await this.worker.start();
    this.absorbTrackedTabs();
  }

  private absorbTrackedTabs(): void {
    for (const [tabId, page] of this.worker.trackedPages()) this.register(tabId, page);
    this.adopted = true;
  }

  protected async acquireTab(): Promise<AcquiredTab> {
    // The worker mints the id, because the product's run and tab state is written against
    // its scheme and the operator's screencast targets it. No URL: the base navigates
    // once its listeners are attached.
    const tabId = await this.worker.openTab();
    return { tabId, page: this.pageOf(tabId) };
  }

  protected async acquireIsolatedTab(): Promise<AcquiredTab> {
    // A session-free view needs a context with no cookies, which a persistent profile
    // cannot give us - so borrow the browser behind it and make a throwaway one.
    const browser = this.worker.sharedContext().browser();
    if (!browser) {
      throw new Error("this browser cannot open an isolated context");
    }
    const context = await browser.newContext();
    return {
      tabId: `anon_${Date.now().toString(36)}`,
      page: await context.newPage(),
      dispose: () => context.close(),
    };
  }

  /** The worker keeps the browser: the agent finishing a task must not close it. */
  async close(): Promise<void> {
    this.pages.clear();
  }

  private pageOf(tabId: string): Page {
    const found = this.worker.trackedPages().find(([id]) => id === tabId);
    if (!found) throw new Error(`worker opened ${tabId} but is not tracking it`);
    return found[1];
  }
}
