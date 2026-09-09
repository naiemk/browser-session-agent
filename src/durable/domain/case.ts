import { DomainError } from "./errors.ts";
import type { Case, CaseKey, JobId } from "./types.ts";

/** DOM-05 — case identity is (jobId, caseKey). */
export function caseIdentity(jobId: JobId, caseKey: CaseKey): string {
  return `${jobId}::${caseKey}`;
}

export function upsertCase(existing: readonly Case[], next: Case): Case[] {
  const key = caseIdentity(next.jobId, next.caseKey);
  const index = existing.findIndex((entry) => caseIdentity(entry.jobId, entry.caseKey) === key);
  if (index === -1) return [...existing, next];
  const prior = existing[index]!;
  if (prior.jobId !== next.jobId || prior.caseKey !== next.caseKey) {
    throw new DomainError("case_identity_corrupt", "case identity mismatch on upsert");
  }
  const merged: Case = {
    ...prior,
    label: next.label || prior.label,
    stage: next.stage || prior.stage,
    facts: { ...prior.facts, ...next.facts },
    outcome: next.outcome ?? prior.outcome,
    updatedAt: next.updatedAt,
  };
  const copy = [...existing];
  copy[index] = merged;
  return copy;
}

export function assertNoDuplicateCases(cases: readonly Case[]): void {
  const seen = new Set<string>();
  for (const entry of cases) {
    const key = caseIdentity(entry.jobId, entry.caseKey);
    if (seen.has(key)) {
      throw new DomainError("duplicate_case", `duplicate case identity ${key}`, { key });
    }
    seen.add(key);
  }
}
