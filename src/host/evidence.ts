/**
 * File-backed evidence for a goal, assembled in one place.
 *
 * Lives here rather than in the runtime because it reaches in both directions: the
 * ledger and the goal store are core, while the metrics and payload writers are in
 * `src/optimize`, which is allowed to depend on the runtime and never the reverse. A
 * host is the layer that gets to know about all of them.
 *
 * Opening is deferred on purpose. A chat session registers its tools before the operator
 * has said what they want, so the directory is created on the first write rather than at
 * startup - which also means a session that never does anything leaves nothing behind.
 */

import path from "node:path";
import { Ledger, type LedgerEvent, type LedgerInput, type LedgerSink } from "../core/ledger.ts";
import { coreRoot, goalPaths } from "../core/paths.ts";
import { GoalStore } from "../core/state.ts";
import { factsFrom, type Evidence, type FactStore } from "../runtime/evidence.ts";
import type { MetricRecord, MetricsSink, PayloadRecord, PayloadSink } from "../runtime/metrics.ts";
import { FilePayloadLog, FileRecorder } from "../optimize/recorder.ts";

export interface FileEvidenceOptions {
  /** Defaults to the core data root, which is what the product uses. */
  root?: string;
  goalId: string;
  /** Recorded on the goal the first time it is opened, for a human reading the file. */
  goal?: string;
  entityId?: string;
}

/** Opens once, on first use, and shares that one open across everything after it. */
function once<T>(open: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= open());
}

export function fileEvidence(options: FileEvidenceOptions): Evidence {
  const root = coreRoot(options.root);
  const paths = goalPaths(root, options.goalId);

  const ledgerOnce = once(() => Ledger.open(root, options.goalId));
  const ledger: LedgerSink = {
    artifactsDir: paths.artifactsDir,
    async append(input: LedgerInput): Promise<LedgerEvent> {
      return (await ledgerOnce()).append(input);
    },
    async read() {
      return (await ledgerOnce()).read();
    },
  };

  const storeOnce = once(() => GoalStore.open(root, options.goalId, options.goal));
  const facts: FactStore = {
    async mergeGoalFacts(next: Record<string, unknown>) {
      return (await storeOnce()).mergeGoalFacts(next);
    },
  };

  const recorderOnce = once(() => FileRecorder.open(paths.metricsFile));
  const metrics: MetricsSink = {
    record(record: MetricRecord) {
      // Fire and forget: metering must never be in the way of the work it measures, and
      // a lost metric is a worse outcome than a stalled action only on paper.
      void recorderOnce().then((recorder) => recorder.record(record));
    },
    async flush() {
      await (await recorderOnce()).flush();
    },
  };

  const payloadsOnce = once(() => FilePayloadLog.open(paths.payloadsFile));
  const payloads: PayloadSink = {
    write(record: PayloadRecord) {
      void payloadsOnce().then((log) => log.write(record));
    },
    async flush() {
      await (await payloadsOnce()).flush();
    },
  };

  return {
    ledger,
    facts,
    metrics,
    payloads,
    goal: { root, goalId: options.goalId },
    screenshotDir: paths.artifactsDir,
    ...(options.entityId ? { entityId: options.entityId } : {}),
  };
}

/** Evidence for an already-open goal store, which the CLI and the suite have. */
export function evidenceForGoal(options: {
  root: string;
  goalId: string;
  ledger: Ledger;
  store: GoalStore;
  metrics: MetricsSink;
  payloads: PayloadSink;
  entityId?: string;
}): Evidence {
  return {
    ledger: options.ledger,
    facts: factsFrom(options.store),
    metrics: options.metrics,
    payloads: options.payloads,
    goal: { root: options.root, goalId: options.goalId },
    screenshotDir: options.ledger.artifactsDir,
    ...(options.entityId ? { entityId: options.entityId } : {}),
  };
}

/** Where a goal's files are, for a message telling the operator where to look. */
export function goalDir(root: string | undefined, goalId: string): string {
  return path.dirname(goalPaths(coreRoot(root), goalId).eventsFile);
}
