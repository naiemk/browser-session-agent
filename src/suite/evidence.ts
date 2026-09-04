/**
 * Checking how a run went, not just where it ended up.
 *
 * The suite could only ever ask "is the page in the right state", which cannot see
 * procedure. An agent that silently reads "my contacts" as one of two lists lands on a
 * perfectly good page; nothing in the DOM separates it from an agent that noticed the
 * ambiguity and said so. That was the failure we could not measure, so we could not tell
 * whether anything we built about it helped.
 *
 * Evaluated from the ledger by the runner, never by the driver.
 */

import type { LedgerEvent } from "../core/ledger.ts";
import type { CheckResult } from "../core/types.ts";
import type { EvidenceCheck } from "./types.ts";

export function describeEvidence(check: EvidenceCheck): string {
  switch (check.kind) {
    case "fork_recorded":
      return `recorded a fork${check.term ? ` for "${check.term}"` : ""}${
        check.minCandidates ? ` with at least ${check.minCandidates} candidates` : ""
      }`;
    case "peeked":
      return `peeked at least ${check.minCount} time(s)`;
  }
}

export function evaluateEvidence(check: EvidenceCheck, events: LedgerEvent[]): CheckResult {
  const predicate = describeEvidence(check);
  const result = (passed: boolean, detail: string): CheckResult => ({ passed, detail, predicate });

  switch (check.kind) {
    case "fork_recorded": {
      const forks = events.filter((event) => event.type === "fork");
      if (forks.length === 0) {
        return result(false, "no fork was recorded; an ambiguous term was resolved silently");
      }
      const matching = forks.filter((event) => {
        const payload = (event.payload ?? {}) as { term?: string; candidates?: unknown };
        if (check.term && !String(payload.term ?? "").toLowerCase().includes(check.term.toLowerCase())) {
          return false;
        }
        const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
        return candidates.length >= (check.minCandidates ?? 2);
      });
      return matching.length > 0
        ? result(true, `${matching.length} matching fork(s) recorded`)
        : result(
            false,
            `${forks.length} fork(s) recorded but none matched: ${forks
              .map((event) => event.intent ?? "")
              .join(" | ")}`,
          );
    }
    case "peeked": {
      const peeks = events.filter(
        (event) => event.type === "probe" && (event.payload as { peek?: unknown })?.peek,
      );
      return peeks.length >= check.minCount
        ? result(true, `${peeks.length} peek(s)`)
        : result(false, `${peeks.length} peek(s), wanted ${check.minCount}`);
    }
  }
}

export function evaluateAllEvidence(
  checks: readonly EvidenceCheck[],
  events: LedgerEvent[],
): CheckResult[] {
  return checks.map((check) => evaluateEvidence(check, events));
}
