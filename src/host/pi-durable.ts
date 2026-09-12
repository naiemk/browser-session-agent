/**
 * CAMPAIGN-R2-2 / R2-E2 — Magpie / hosted bind of Jobs V2 durable Pi commands.
 *
 * Magpie: ticks use the live chat BrowserWorker + a cached createLiveModel (env keys).
 * Hosted: ticks use RpcBrowserPort over the node-agent wire when the desktop node is
 * connected; never wraps RpcSessionHandle as BrowserWorker. Never FakeKernel.
 * Never starts Chrome from status or a missing Magpie worker.
 */

import type { ExtensionAPI } from "../pi-api.ts";
import type { BrowserPort } from "../core/browser.ts";
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
import { AgentError } from "../domain/types.ts";

export type DurableSurface = "magpie" | "hosted";

export const REMEDIATION_MAGPIE_NO_WORKER =
  "no Magpie worker: start the browser in this chat first (/browser-start). " +
  "durable-tick does not launch Chrome.";

export const REMEDIATION_HOSTED_NO_HOST =
  "no in-process Magpie worker on hosted chat: tick from Magpie TUI or " +
  "`browser-agent durable tick <jobId> --host`.";

export const REMEDIATION_HOSTED_NO_NODE =
  "no desktop node: reconnect the paired node-agent. " +
  "hosted durable-tick does not launch Chrome on the API.";

export type DurableHostOverrides = Partial<Pick<ProductHostOptions, "stream" | "model" | "runAttempt">>;

export interface MagpieDurableHostOptions {
  worker: BrowserWorker;
  /** Cached live model from warmCreateLiveModel / tests. */
  live: () => LiveModel | null;
  root?: string;
  profileKey?: string;
  /** Test override — inject stream/runAttempt without createLiveModel. */
  hostOverrides?: DurableHostOverrides;
}

export interface HostedDurableHostOptions {
  connected: () => boolean;
  browser: BrowserPort;
  live: () => LiveModel | null;
  root?: string;
  profileKey?: string;
  hostOverrides?: DurableHostOverrides;
  takeover?: ProductHostOptions["takeover"];
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

/**
 * Hosted twin: RpcBrowserPort + env-key model. Null when the desktop node is down
 * or no model/stream is attached. Does not wrap RpcSessionHandle as BrowserWorker.
 */
export function hostedDurableHostFactory(options: HostedDurableHostOptions): () => ExecutionHost | null {
  return () => {
    if (!options.connected()) return null;
    const live = options.live();
    const overrides = options.hostOverrides;
    if (!live && !overrides?.stream && !overrides?.runAttempt) return null;
    const host = createProductExecutionHost({
      browser: options.browser,
      stream: overrides?.stream ?? live?.stream ?? null,
      model: overrides?.model ?? live?.model,
      runAttempt: overrides?.runAttempt,
      profileKey: options.profileKey ?? "hosted-rpc",
      root: options.root ?? coreRoot(),
      takeover: options.takeover,
      headedTakeover: true,
    });
    return host ? wrapHostedKernel(host) : null;
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

export function hostedDurableRemediation(options: {
  connected: () => boolean;
  live: () => LiveModel | null;
}): () => string {
  return () => {
    if (!options.connected()) return REMEDIATION_HOSTED_NO_NODE;
    if (!options.live() && !anyProviderKey()) return REMEDIATION_NO_MODEL;
    if (!options.live()) return REMEDIATION_NO_MODEL;
    return REMEDIATION_HOSTED_NO_NODE;
  };
}

function isNodeDisconnected(err: unknown): boolean {
  return err instanceof AgentError && (err.code === "node_disconnected" || err.code === "disconnected");
}

/** Map a mid-tick node drop to a typed failed outcome instead of throwing out of the dispatcher. */
function wrapHostedKernel(host: ExecutionHost): ExecutionHost {
  const execute = host.kernel.execute.bind(host.kernel);
  host.kernel = {
    execute: async (compiled) => {
      try {
        return await execute(compiled);
      } catch (err) {
        if (!isNodeDisconnected(err)) throw err;
        return {
          status: "failed",
          stage: "execution",
          code: "node_disconnected",
          retryable: true,
          evidenceIds: [],
        };
      }
    },
  };
  return host;
}

function anyProviderKey(): boolean {
  return Object.keys(KEY_ENV_NAMES).some((provider) => Boolean(resolveKey(provider)));
}

/**
 * Warm createLiveModel once. Skipped under NODE_TEST_CONTEXT so unit tests never
 * reach a provider. Failures leave the cache null (tick → runtime_unavailable).
 */
export function warmCreateLiveModel(cache: { current: LiveModel | null; warming?: boolean }): void {
  if (process.env.NODE_TEST_CONTEXT) return;
  if (!anyProviderKey()) return;
  if (cache.current || cache.warming) return;
  cache.warming = true;
  void createLiveModel({ model: process.env.BSA_DURABLE_MODEL })
    .then((live) => {
      cache.current = live;
    })
    .catch(() => {
      cache.current = null;
    })
    .finally(() => {
      cache.warming = false;
    });
}

export interface BindDurableOptions {
  surface: DurableSurface;
  root?: string;
  /** Magpie only — live chat worker. */
  worker?: BrowserWorker;
  /** Hosted — RpcBrowserPort (or any BrowserPort). */
  browser?: BrowserPort;
  /** Hosted — NodeHub.connected. Default false when omitted. */
  nodeConnected?: () => boolean;
  takeover?: ProductHostOptions["takeover"];
  /** Test override for host construction without createLiveModel. */
  hostOverrides?: DurableHostOverrides;
  /** Injected for tests; Magpie/hosted default to a warmed createLiveModel cache. */
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
    const hostedFactory =
      options.hostFactory ??
      (options.browser
        ? hostedDurableHostFactory({
            connected: options.nodeConnected ?? (() => false),
            browser: options.browser,
            live: () => liveCache.current,
            root: options.root,
            hostOverrides: options.hostOverrides,
            takeover: options.takeover,
          })
        : () => null);
    registerDurablePiCommands(pi, {
      root: options.root,
      hostFactory: hostedFactory,
      remediation:
        options.remediation ??
        (options.browser
          ? hostedDurableRemediation({
              connected: options.nodeConnected ?? (() => false),
              live: () => liveCache.current,
            })
          : REMEDIATION_HOSTED_NO_HOST),
    });
    // MemoryOperatorHost may never emit session_start; warm at bind too.
    warmCreateLiveModel(liveCache);
    pi.on("session_start", () => {
      warmCreateLiveModel(liveCache);
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
