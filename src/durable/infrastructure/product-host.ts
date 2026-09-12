/**
 * R2.1 / CAMPAIGN-R2-1 — product ExecutionHost factory.
 *
 * Magpie WorkerBrowserPort or hosted RpcBrowserPort + runTask behind DirectKernel.
 * Missing worker/port or model returns null so adapters report runtime_unavailable
 * (never FakeKernel success).
 */

import type { Model } from "@earendil-works/pi-ai";
import type { BrowserPort } from "../../core/browser.ts";
import { coreRoot, goalPaths } from "../../core/paths.ts";
import { evidenceForGoal } from "../../host/evidence.ts";
import { Ledger } from "../../core/ledger.ts";
import { GoalStore } from "../../core/state.ts";
import { FilePayloadLog, FileRecorder } from "../../optimize/recorder.ts";
import type { ModelPort } from "../../runtime/model.ts";
import { runTask, type RunOutcome } from "../../runtime/runtime.ts";
import type { Evidence } from "../../runtime/evidence.ts";
import type { BrowserWorker } from "../../worker/browser-worker.ts";
import type { CompiledAttempt } from "../application/context-compiler.ts";
import type { OperationOutcome } from "../domain/types.ts";
import { createPersistentExecutionHost, type PersistentHostOptions } from "./persistent-host.ts";
import type { ExecutionHost } from "../ports/execution-kernel.ts";

export const REMEDIATION_NO_HOST =
  "no execution host: set BSA_DURABLE_HOST=1 or pass --host to attach Magpie profile + model";
export const REMEDIATION_NO_MODEL =
  "no model: set OPENROUTER_API_KEY (or another provider key) before attaching the durable host";
export const REMEDIATION_NO_WORKER =
  "no Magpie worker: durable host needs a started BrowserWorker on the persistent profile";

export interface RunDurableAttemptOptions {
  compiled: CompiledAttempt;
  browser: BrowserPort;
  stream: ModelPort;
  model?: Model<never>;
  signal?: AbortSignal;
  /** Evidence sink; defaults to file-backed goal under root/durable/<jobId>. */
  evidence?: Evidence;
  root?: string;
  tabId?: string;
  policy?: "auto" | "ask" | "never";
}

/** Map a bounded runTask outcome onto the durable OperationOutcome contract. */
export function outcomeFromRun(outcome: RunOutcome, intent: string): OperationOutcome<unknown> {
  const evidenceIds = outcome.report?.summary ? [`report:${outcome.report.summary.slice(0, 80)}`] : [];

  if (outcome.parked) {
    const parked = outcome.parked;
    const host =
      typeof parked.payload?.host === "string"
        ? parked.payload.host
        : "unknown";
    if (parked.wake === "human" && /challenge|captcha|verify/i.test(parked.reason)) {
      return {
        status: "blocked",
        block: {
          kind: "challenge",
          confidence: 0.9,
          signals: [parked.reason],
          host,
        },
        checkpoint: {
          intent,
          pageIdentity: typeof parked.payload?.url === "string" ? parked.payload.url : undefined,
          evidenceIds,
        },
        evidenceIds,
      };
    }
    if (parked.wake === "human" && /approv/i.test(parked.reason)) {
      return {
        status: "blocked",
        block: {
          kind: "approval",
          effectId: typeof parked.payload?.effectId === "string" ? parked.payload.effectId : "effect",
          detail: parked.reason,
        },
        checkpoint: { intent, evidenceIds },
        evidenceIds,
      };
    }
    return {
      status: "blocked",
      block: { kind: "takeover", detail: parked.reason },
      checkpoint: {
        intent,
        pageIdentity: typeof parked.payload?.url === "string" ? parked.payload.url : undefined,
        evidenceIds,
      },
      evidenceIds,
    };
  }

  if (outcome.error || outcome.modelErrors.length > 0) {
    return {
      status: "failed",
      stage: "model",
      code: "model_error",
      retryable: true,
      evidenceIds,
    };
  }

  if (outcome.capped && !outcome.report) {
    return {
      status: "failed",
      stage: "execution",
      code: "turn_cap",
      retryable: true,
      evidenceIds,
    };
  }

  if (outcome.declined) {
    return {
      status: "failed",
      stage: "execution",
      code: "declined",
      retryable: false,
      evidenceIds,
    };
  }

  return {
    status: "completed",
    value: {
      summary: outcome.report?.summary ?? null,
      turns: outcome.turns,
      toolCalls: outcome.toolCalls,
      capped: outcome.capped,
    },
    evidenceIds: evidenceIds.length ? evidenceIds : ["ev:completed"],
  };
}

async function evidenceForAttempt(compiled: CompiledAttempt, root: string): Promise<Evidence> {
  const goalId = `durable-${compiled.jobId}-${compiled.workItem.id}`;
  const ledger = await Ledger.open(root, goalId);
  const store = await GoalStore.open(root, goalId, compiled.specSlice.objective);
  const metrics = await FileRecorder.open(goalPaths(root, goalId).metricsFile);
  const payloads = await FilePayloadLog.open(goalPaths(root, goalId).payloadsFile);
  return evidenceForGoal({
    root,
    goalId,
    ledger,
    store,
    metrics,
    payloads,
  });
}

/**
 * One durable attempt: CompiledAttempt → runTask on the given BrowserPort.
 * Does not construct FakeKernel. Callers supply the model port.
 */
export async function runDurableAttempt(options: RunDurableAttemptOptions): Promise<OperationOutcome<unknown>> {
  const { compiled, browser, stream, signal } = options;
  const intent = compiled.specSlice.objective || compiled.workItem.objective || "attempt";
  const root = coreRoot(options.root);
  const evidence = options.evidence ?? (await evidenceForAttempt(compiled, root));
  const neverPreapprove = compiled.specSlice.envelope.neverPreapprove;

  if (signal?.aborted) {
    return {
      status: "cancelled",
      checkpoint: { intent, evidenceIds: [] },
      evidenceIds: [],
    };
  }

  const outcome = await runTask({
    card: {
      objective: intent,
      criteria: [],
      policy: options.policy ?? "ask",
      knownFacts: {
        jobId: compiled.jobId,
        workItemId: compiled.workItem.id,
        templateId: compiled.specSlice.templateId,
        caseKey: compiled.case?.caseKey,
        priorFailures: compiled.priorFailures,
      },
      maxTurns: compiled.budgets.maxTurns,
    },
    maxTurns: compiled.budgets.maxTurns,
    stream,
    model: options.model,
    tools: {
      browser,
      tabId: options.tabId,
      evidence,
      policy: options.policy ?? "ask",
      neverPreapprove: [...neverPreapprove],
      askUser: async () => undefined,
      approve: async () => false,
    },
  });

  return outcomeFromRun(outcome, intent);
}

export interface ProductHostOptions {
  worker?: BrowserWorker | null;
  /** Hosted/RPC twin — RpcBrowserPort. Magpie still passes `worker`. */
  browser?: BrowserPort | null;
  stream?: ModelPort | null;
  model?: Model<never>;
  profileKey: string;
  root?: string;
  cancel?: AbortSignal;
  headedTakeover?: boolean;
  evidence?: Evidence;
  policy?: "auto" | "ask" | "never";
  /** Override runAttempt (tests). Default is runDurableAttempt with stream. */
  runAttempt?: PersistentHostOptions["runAttempt"];
  takeover?: PersistentHostOptions["takeover"];
}

/**
 * Product path: Magpie worker or RPC BrowserPort + model → DirectKernel ExecutionHost.
 * Returns null when browser/worker or model is missing (ADAPTER-04 / SCHED-02).
 */
export function createProductExecutionHost(options: ProductHostOptions): ExecutionHost | null {
  const worker = options.worker ?? null;
  const browser = options.browser ?? null;
  if (!worker && !browser) return null;
  if (!options.stream && !options.runAttempt) return null;

  const stream = options.stream;
  const runAttempt =
    options.runAttempt ??
    (async (input) => {
      if (!stream) {
        return {
          status: "failed" as const,
          stage: "model" as const,
          code: "no_model",
          retryable: false,
          evidenceIds: [],
        };
      }
      return runDurableAttempt({
        compiled: input.compiled,
        browser: input.browser,
        stream,
        model: options.model,
        signal: input.signal,
        evidence: options.evidence,
        root: options.root,
        policy: options.policy,
      });
    });

  return createPersistentExecutionHost({
    worker: worker ?? undefined,
    browser: browser ?? undefined,
    profileKey: options.profileKey,
    runAttempt,
    cancel: options.cancel,
    headedTakeover: options.headedTakeover,
    available: true,
    takeover: options.takeover,
  });
}
