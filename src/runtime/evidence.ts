/**
 * Where a run's memory goes, as one thing you cannot forget half of.
 *
 * This used to be six optional fields on the tool context, each reached with `?.`. The
 * suite passed all of them and the product passed none, so the agent the operator
 * actually ran recorded nothing: no observations, no actions, no forks, and a `remember`
 * that reported success while storing the fact nowhere. Nothing failed, because every
 * write was optional.
 *
 * Now it is one required bundle. Recording nothing is still allowed - tests need it -
 * but it has to be asked for by name, which is the difference between a decision and an
 * oversight.
 */

import type { LedgerEvent, LedgerInput, LedgerSink } from "../core/ledger.ts";
import type { GoalStore } from "../core/state.ts";
import { shortId } from "../core/ids.ts";
import {
  NO_METRICS,
  NO_PAYLOADS,
  type MetricRecord,
  type MetricsSink,
  type PayloadRecord,
  type PayloadSink,
} from "./metrics.ts";

/** The subset of the goal store the tools use, so a stub does not need a filesystem. */
export interface FactStore {
  mergeGoalFacts(facts: Record<string, unknown>): Promise<unknown>;
}

export interface Evidence {
  /** What happened, in a form meant to outlive the process. */
  ledger: LedgerSink;
  /** What was established, so the next task does not work it out again. */
  facts: FactStore;
  /** What it cost. */
  metrics: MetricsSink;
  /** What the model was sent, verbatim. */
  payloads: PayloadSink;
  /**
   * Where checkpoints and screenshots go. Absent means an action that would need one
   * runs without it rather than failing, which is the right trade for a chat.
   */
  goal?: { root: string; goalId: string };
  screenshotDir?: string;
  /** The entity this work is about, when there is one. Suite tasks have one; chats do not. */
  entityId?: string;
}

export interface MemoryEvidence extends Evidence {
  events: LedgerEvent[];
  written: Record<string, unknown>;
  metrics: MetricsSink & { records: MetricRecord[] };
  payloads: PayloadSink & { records: PayloadRecord[] };
}

/**
 * Evidence in memory, for tests that want to assert on it without a temp directory.
 * The ledger is real enough to be read back, which is all a test needs.
 *
 * Metrics and payloads are kept rather than dropped: a sink that silently discards is how
 * "we are measuring" and "we are not measuring" came to look the same from a test.
 */
export function memoryEvidence(overrides: Partial<Evidence> = {}): MemoryEvidence {
  const events: LedgerEvent[] = [];
  const written: Record<string, unknown> = {};
  const metrics: MetricRecord[] = [];
  const payloads: PayloadRecord[] = [];
  return {
    events,
    written,
    ledger: {
      artifactsDir: "",
      async append(input: LedgerInput): Promise<LedgerEvent> {
        const event: LedgerEvent = {
          id: shortId("ev"),
          goalId: "g_memory",
          ts: new Date().toISOString(),
          ...input,
        };
        events.push(event);
        return event;
      },
    },
    facts: {
      async mergeGoalFacts(facts: Record<string, unknown>) {
        Object.assign(written, facts);
        return written;
      },
    },
    metrics: {
      records: metrics,
      record: (record) => void metrics.push(record),
      async flush() {},
    },
    payloads: {
      records: payloads,
      write: (record) => void payloads.push(record),
      async flush() {},
    },
    ...overrides,
  } as MemoryEvidence;
}

/**
 * Record nothing, on purpose.
 *
 * Named so that choosing it shows up in a diff. The product choosing this by accident is
 * the bug this whole module exists to make impossible.
 */
export function nullEvidence(): Evidence {
  return {
    ledger: {
      artifactsDir: "",
      async append(input: LedgerInput): Promise<LedgerEvent> {
        return {
          id: shortId("ev"),
          goalId: "g_none",
          ts: new Date().toISOString(),
          ...input,
        };
      },
    },
    facts: { async mergeGoalFacts() {} },
    metrics: NO_METRICS,
    payloads: NO_PAYLOADS,
  };
}

/** Adapt a real goal store, which does more than the tools need. */
export function factsFrom(store: GoalStore): FactStore {
  return { mergeGoalFacts: (facts) => store.mergeGoalFacts(facts) };
}
