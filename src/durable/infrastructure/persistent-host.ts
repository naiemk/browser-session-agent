import type { BrowserPort } from "../../core/browser.ts";
import type { CompiledAttempt } from "../application/context-compiler.ts";
import type { OperationOutcome } from "../domain/types.ts";
import { DirectKernel, type ExecutionHost } from "../ports/execution-kernel.ts";
import { WorkerBrowserPort } from "../../host/worker-browser-port.ts";
import type { BrowserWorker } from "../../worker/browser-worker.ts";
import { challengeEvidenceFromObservation } from "../../runtime/challenge-handoff.ts";

/**
 * CAMPAIGN-02-T04 — persistent Magpie browser as the durable ExecutionHost browser.
 * Ephemeral Playwright is not used for durable work here.
 */
export function createPersistentBrowserPort(worker: BrowserWorker): WorkerBrowserPort {
  return WorkerBrowserPort.lazy(worker);
}

export function reattachPersistentBrowserPort(worker: BrowserWorker): WorkerBrowserPort {
  return WorkerBrowserPort.adopt(worker);
}

export interface PersistentHostOptions {
  /** Magpie in-process worker. Required unless `browser` is supplied (RPC twin). */
  worker?: BrowserWorker;
  /** Already-wired port (RpcBrowserPort). Takes precedence over worker. */
  browser?: BrowserPort;
  profileKey: string;
  runAttempt: (input: {
    compiled: CompiledAttempt;
    browser: BrowserPort;
    signal?: AbortSignal;
  }) => Promise<OperationOutcome<unknown>>;
  available?: boolean;
  cancel?: AbortSignal;
  headedTakeover?: boolean;
  /** Hosted: RpcSessionHandle.takeover. Magpie defaults to worker.bringToFront. */
  takeover?: (info: { host: string }) => Promise<void>;
}

export function createPersistentExecutionHost(options: PersistentHostOptions): ExecutionHost {
  if (!options.browser && !options.worker) {
    throw new Error("createPersistentExecutionHost requires browser or worker");
  }
  let port: BrowserPort = options.browser ?? createPersistentBrowserPort(options.worker!);
  const kernel = new DirectKernel(async (compiled, signal) => {
    return options.runAttempt({ compiled, browser: port, signal });
  }, options.cancel);

  return {
    available: options.available !== false,
    profileKey: options.profileKey,
    cancel: options.cancel,
    headedTakeover: options.headedTakeover,
    nowIso: () => new Date().toISOString(),
    kernel,
    challenge: {
      async observe(pageIdentity?: string) {
        if (pageIdentity && /^https?:\/\//i.test(pageIdentity)) {
          const current = await port.observe();
          if (current.url !== pageIdentity) {
            await port.navigate(undefined, pageIdentity, 30_000);
          }
        }
        return challengeEvidenceFromObservation(await port.observe());
      },
      async takeover(info) {
        if (options.takeover) {
          await options.takeover(info);
          return;
        }
        const tabId = options.worker?.firstTabId();
        if (tabId) await options.worker!.bringToFront(tabId);
      },
    },
    /** Test/ops helper: refresh port after control-process style reconnect. */
    reattach() {
      if (options.worker) port = reattachPersistentBrowserPort(options.worker);
    },
  } as ExecutionHost & { reattach(): void };
}

/**
 * Profile-generation fence for stale tab/refs after reconnect.
 * Production WorkerBrowserPort adopts live pages; this helper models the contract
 * tests must enforce before acting on a pre-reconnect tab id.
 */
export class ProfileEpochGuard {
  private epoch = 0;
  private readonly tabs = new Map<string, number>();

  bump(): number {
    this.epoch += 1;
    return this.epoch;
  }

  registerTab(tabId: string): void {
    this.tabs.set(tabId, this.epoch);
  }

  assertFresh(tabId: string): void {
    const born = this.tabs.get(tabId);
    if (born === undefined || born !== this.epoch) {
      throw new Error(`stale_tab_ref:${tabId}`);
    }
  }

  currentEpoch(): number {
    return this.epoch;
  }
}
