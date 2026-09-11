/**
 * CAMPAIGN-R2-2 — Magpie / hosted bind of Jobs V2 durable Pi commands.
 *
 * Magpie: ticks use the live chat BrowserWorker + a cached createLiveModel (env keys).
 * Hosted: hostFactory always null (no in-process BrowserWorker / RPC twin).
 * Never starts Chrome from status or a missing worker. Never FakeKernel.
 */

import type { ExtensionAPI } from "../pi-api.ts";
import type { BrowserWorker } from "../worker/browser-worker.ts";
import type { LiveModel } from "../runtime/model.ts";
import { createLiveModel, KEY_ENV_NAMES, resolveKey } from "../runtime/model.ts";
import { coreRoot } from "../core/paths.ts";
import {
  registerDurablePiCommands,
  type DurablePiOptions,
} from "../durable/adapters/pi.ts";
import {
  createProductExecutionHost,
  REMEDIATION_NO_MODEL,
  type ProductHostOptions,
} from "../durable/infrastructure/product-host.ts";
import type { ExecutionHost } from "../durable/ports/execution-kernel.ts";

export type DurableSurface = "magpie" | "hosted";

export const REMEDIATION_MAGPIE_NO_WORKER =
  "no Magpie worker: start the browser in this chat first (/browser-start). " +
  "durable-tick does not launch Chrome.";

export const REMEDIATION_HOSTED_NO_HOST =
  "no in-process Magpie worker on hosted chat: tick from Magpie TUI or " +
  "`browser-agent durable tick <jobId> --host`.";

export interface MagpieDurableHostOptions {
  worker: BrowserWorker;
  /** Cached live model from warmCreateLiveModel / tests. */
  live: () => LiveModel | null;
  root?: string;
  profileKey?: string;
  /** Test override — inject stream/runAttempt without createLiveModel. */
  hostOverrides?: Partial<Pick<ProductHostOptions, "stream" | "model" | "runAttempt">>;
}

/** Sync hostFactory for Magpie: null unless worker is started and a live model is ready. */
export function magpieDurableHostFactory(options: MagpieDurableHostOptions): () => ExecutionHost | null {
  return () => {
    if (!options.worker.workerInfo) return null;
    const live = options.live();
    const overrides = options.hostOverrides;
    if (!live && !overrides?.stream && !overrides?.runAttempt) return null;
    return createProductExecutionHost({
      worker: options.worker,
      stream: overrides?.stream ?? live?.stream ?? null,
      model: overrides?.model ?? live?.model,
      runAttempt: overrides?.runAttempt,
      profileKey: options.profileKey ?? "magpie-chat",
      root: options.root ?? coreRoot(),
    });
  };
}

export function magpieDurableRemediation(options: {
  worker: BrowserWorker;
  live: () => LiveModel | null;
}): () => string {
  return () => {
    if (!options.worker.workerInfo) return REMEDIATION_MAGPIE_NO_WORKER;
    if (!options.live() && !anyProviderKey()) return REMEDIATION_NO_MODEL;
    if (!options.live()) return REMEDIATION_NO_MODEL;
    return REMEDIATION_MAGPIE_NO_WORKER;
  };
}

function anyProviderKey(): boolean {
  return Object.keys(KEY_ENV_NAMES).some((provider) => Boolean(resolveKey(provider)));
}

/**
 * Warm createLiveModel once. Skipped under NODE_TEST_CONTEXT so unit tests never
 * reach a provider. Failures leave the cache null (tick → runtime_unavailable).
 */
export function warmCreateLiveModel(cache: { current: LiveModel | null }): void {
  if (process.env.NODE_TEST_CONTEXT) return;
  if (!anyProviderKey()) return;
  void createLiveModel({ model: process.env.BSA_DURABLE_MODEL })
    .then((live) => {
      cache.current = live;
    })
    .catch(() => {
      cache.current = null;
    });
}

export interface BindDurableOptions {
  surface: DurableSurface;
  root?: string;
  /** Magpie only — live chat worker. */
  worker?: BrowserWorker;
  /** Magpie test override for host construction without createLiveModel. */
  hostOverrides?: MagpieDurableHostOptions["hostOverrides"];
  /** Injected for tests; Magpie defaults to a warmed createLiveModel cache. */
  liveCache?: { current: LiveModel | null };
  hostFactory?: DurablePiOptions["hostFactory"];
  remediation?: DurablePiOptions["remediation"];
}

export interface DurableBindHandle {
  surface: DurableSurface;
  liveCache: { current: LiveModel | null };
}

export function bindDurableCommands(pi: ExtensionAPI, options: BindDurableOptions): DurableBindHandle {
  const liveCache = options.liveCache ?? { current: null };

  if (options.surface === "hosted") {
    registerDurablePiCommands(pi, {
      root: options.root,
      hostFactory: options.hostFactory ?? (() => null),
      remediation: options.remediation ?? REMEDIATION_HOSTED_NO_HOST,
    });
    return { surface: "hosted", liveCache };
  }

  const worker = options.worker;
  if (!worker) {
    throw new Error("bindDurableCommands(magpie) requires options.worker");
  }

  const hostFactory =
    options.hostFactory ??
    magpieDurableHostFactory({
      worker,
      live: () => liveCache.current,
      root: options.root,
      hostOverrides: options.hostOverrides,
    });

  registerDurablePiCommands(pi, {
    root: options.root,
    hostFactory,
    remediation:
      options.remediation ??
      magpieDurableRemediation({
        worker,
        live: () => liveCache.current,
      }),
  });

  pi.on("session_start", () => {
    warmCreateLiveModel(liveCache);
  });

  return { surface: "magpie", liveCache };
}
