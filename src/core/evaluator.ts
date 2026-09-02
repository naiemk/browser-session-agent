/**
 * The independent evaluator.
 *
 * `resolveTaskOutcome` answers "did the criteria pass". This answers the harder
 * question the outer loop actually needs: what should happen next. It reads the
 * evidence ledger rather than the executor's report, because the difference between
 * "retry", "ask the user", and "the plan is wrong" is visible in the trace and not in
 * a summary sentence.
 *
 * Deterministic first, on purpose. Every status below is derived from recorded facts;
 * a model call is reserved for genuinely semantic criteria and is not needed here.
 */

import type { BrowserPort } from "./browser.ts";
import type { Ledger, LedgerEvent } from "./ledger.ts";
import { resolveTaskOutcome, type TaskStore } from "./task.ts";
import type { Verification } from "./types.ts";

export interface Fact {
  key: string;
  value: unknown;
  source: string;
}

export type Evaluation =
  | { status: "success"; newKnowledge: Fact[]; verification: Verification }
  | { status: "retry"; reason: string; verification: Verification }
  | { status: "needs_more_context"; missingContext: string[]; verification: Verification }
  | { status: "needs_user_input"; missingInputs: string[]; verification: Verification }
  | { status: "replan"; reason: string; verification: Verification }
  | { status: "fatal"; reason: string; verification: Verification };

export interface EvaluateInput {
  store: TaskStore;
  taskId: string;
  browser: BrowserPort;
  ledger: Ledger;
  tabId?: string;
  /** What the executor said. Recorded for comparison, never used to decide. */
  claim?: string;
  capped?: boolean;
  /** A session or provider failure, which is nobody's fault but ours. */
  sessionError?: string;
  /** How many identical failures count as a strategy problem rather than bad luck. */
  repeatThreshold?: number;
}

const PROVIDER_FAILURE = /\b(402|429|5\d\d)\b|credit|rate limit|quota|overloaded/i;

export async function evaluateTask(input: EvaluateInput): Promise<Evaluation> {
  const { verification } = await resolveTaskOutcome(input.store, input.taskId, input.browser, {
    tabId: input.tabId,
    claim: input.claim,
    ledger: input.ledger,
    capped: input.capped,
  });

  const events = await input.ledger.read();
  const record = await input.store.require(input.taskId);
  const forTask = events.filter(
    (event) => !record.entityId || !event.entityId || event.entityId === record.entityId,
  );

  if (verification.status === "passed") {
    return { status: "success", newKnowledge: distil(forTask), verification };
  }

  // A run that never happened is not a task to retry differently.
  if (input.sessionError) {
    return {
      status: PROVIDER_FAILURE.test(input.sessionError) ? "fatal" : "retry",
      reason: input.sessionError,
      verification,
    } as Evaluation;
  }

  // Somebody has to answer something before this can move.
  const unanswered = forTask.filter(
    (event) => event.type === "note" && /^asked: /.test(event.intent ?? "") && event.outcome?.ok === false,
  );
  const parkedForHuman = forTask.filter((event) => event.type === "parked");
  if (unanswered.length > 0 || parkedForHuman.length > 0) {
    const missingInputs = [
      ...unanswered.map((event) => (event.intent ?? "").replace(/^asked: /, "")),
      ...parkedForHuman.map((event) => event.outcome?.detail ?? "approval required"),
    ];
    return { status: "needs_user_input", missingInputs, verification };
  }

  const actions = forTask.filter((event) => event.type === "action" || event.type === "failure");
  const failures = forTask.filter((event) => event.type === "failure");

  // Nothing was attempted: the agent did not know enough to start.
  if (actions.length === 0) {
    return {
      status: "needs_more_context",
      missingContext: ["the agent took no action; it could not tell what to do on this page"],
      verification,
    };
  }

  // The same thing failed over and over: the approach is wrong, not the luck.
  const repeats = repeatedFailure(failures, input.repeatThreshold ?? 3);
  if (repeats) {
    return {
      status: "replan",
      reason: `${repeats.count} attempts at the same action kept failing: ${repeats.detail}`,
      verification,
    };
  }

  // It could not find what it needed to address.
  const lookups = failures.filter((event) =>
    /missing_ref|missing_control|could not be described/i.test(event.outcome?.detail ?? ""),
  );
  if (lookups.length > 0) {
    return {
      status: "needs_more_context",
      missingContext: lookups
        .map((event) => event.outcome?.detail ?? "a control could not be located")
        .slice(0, 5),
      verification,
    };
  }

  if (input.capped) {
    return {
      status: "retry",
      reason: "ran out of turns before meeting the criteria",
      verification,
    };
  }

  return {
    status: "retry",
    reason: failures.at(-1)?.outcome?.detail ?? "criteria not met",
    verification,
  };
}

function repeatedFailure(
  failures: LedgerEvent[],
  threshold: number,
): { count: number; detail: string } | undefined {
  const counts = new Map<string, { count: number; detail: string }>();
  for (const event of failures) {
    const key = `${event.action?.kind ?? "?"}:${event.action?.ref ?? event.action?.url ?? "?"}`;
    const entry = counts.get(key) ?? { count: 0, detail: event.outcome?.detail ?? "" };
    entry.count += 1;
    entry.detail = event.outcome?.detail ?? entry.detail;
    counts.set(key, entry);
  }
  for (const entry of counts.values()) {
    if (entry.count >= threshold) return entry;
  }
  return undefined;
}

/**
 * Distil what was learned into semantic facts. Deliberately small: values entered and
 * where they were accepted, not a replay of the DOM.
 */
function distil(events: LedgerEvent[]): Fact[] {
  const facts: Fact[] = [];
  const final = events.filter((event) => event.type === "action").at(-1);
  if (final?.after?.url) {
    facts.push({ key: "finalUrl", value: final.after.url, source: final.id });
  }
  const commits = events.filter((event) => event.type === "approval" && event.outcome?.ok);
  if (commits.length > 0) {
    facts.push({
      key: "committedActions",
      value: commits.map((event) => event.action?.kind ?? "commit"),
      source: commits.at(-1)!.id,
    });
  }
  const probes = events.filter((event) => event.type === "probe").length;
  if (probes > 0) {
    facts.push({ key: "probesUsed", value: probes, source: "ledger" });
  }
  return facts;
}
