/**
 * AGENT-15 — typed failure stages and host-enforced no-progress budgets.
 */

import type { FailureStage, OperationCheckpoint, OperationOutcome } from "../durable/domain/types.ts";

export type AttemptStrategy = "same" | "retarget" | "reobserve" | "alternate_control" | "restore";

export interface AttemptKey {
  goalId: string;
  pageIdentity: string;
  intent: string;
  target?: string;
  stage?: FailureStage;
}

export function attemptChainId(key: AttemptKey): string {
  return [key.goalId, key.pageIdentity, key.intent, key.target ?? "*", key.stage ?? "*"].join("::");
}

export interface AttemptRecord {
  chainId: string;
  attempts: number;
  startedAtMs: number;
  lastEvidenceHash?: string;
  lastStrategy?: AttemptStrategy;
  stages: Partial<Record<FailureStage, number>>;
}

export interface AttemptBudgetConfig {
  maxAttempts: number;
  maxElapsedMs: number;
  /** Identical evidence + same strategy counts as no progress. */
  requireEvidenceOrStrategyChange: boolean;
}

export const DEFAULT_ATTEMPT_BUDGET: AttemptBudgetConfig = {
  maxAttempts: 3,
  maxElapsedMs: 120_000,
  requireEvidenceOrStrategyChange: true,
};

export class AttemptBudgetTracker {
  private readonly chains = new Map<string, AttemptRecord>();

  constructor(
    private readonly config: AttemptBudgetConfig = DEFAULT_ATTEMPT_BUDGET,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  decide(input: {
    key: AttemptKey;
    evidenceHash: string;
    strategy: AttemptStrategy;
  }): { allow: boolean; reason?: string; record: AttemptRecord } {
    const chainId = attemptChainId(input.key);
    const now = this.nowMs();
    let record = this.chains.get(chainId);
    if (!record) {
      record = {
        chainId,
        attempts: 0,
        startedAtMs: now,
        stages: {},
      };
      this.chains.set(chainId, record);
    }

    if (record.attempts >= this.config.maxAttempts) {
      return { allow: false, reason: "max_attempts", record };
    }
    if (now - record.startedAtMs > this.config.maxElapsedMs) {
      return { allow: false, reason: "max_elapsed", record };
    }
    if (
      this.config.requireEvidenceOrStrategyChange &&
      record.attempts > 0 &&
      record.lastEvidenceHash === input.evidenceHash &&
      record.lastStrategy === input.strategy
    ) {
      return { allow: false, reason: "no_progress", record };
    }

    record.attempts += 1;
    if (input.key.stage) {
      record.stages[input.key.stage] = (record.stages[input.key.stage] ?? 0) + 1;
    }
    record.lastEvidenceHash = input.evidenceHash;
    record.lastStrategy = input.strategy;
    return { allow: true, record };
  }

  exhaustedOutcome(input: {
    key: AttemptKey;
    evidenceIds: string[];
    code: string;
    checkpoint: OperationCheckpoint;
    hint?: string;
  }): OperationOutcome<never> {
    return {
      status: "blocked",
      block: {
        kind: "takeover",
        detail: `${input.code}: ${input.hint ?? "no-progress budget exhausted; resume with new evidence or strategy"}`,
      },
      checkpoint: input.checkpoint,
      evidenceIds: input.evidenceIds,
    };
  }

  snapshot(chainId: string): AttemptRecord | undefined {
    return this.chains.get(chainId);
  }
}

export function classifyFailureStage(input: {
  code?: string;
  challenge?: boolean;
  targetMissing?: boolean;
  preconditionFailed?: boolean;
  postconditionFailed?: boolean;
  cancelled?: boolean;
}): FailureStage {
  if (input.cancelled) return "cancelled";
  if (input.challenge) return "challenge";
  if (input.targetMissing) return "target";
  if (input.preconditionFailed) return "precondition";
  if (input.postconditionFailed) return "postcondition";
  if (input.code?.includes("timeout") || input.code?.includes("execution")) return "execution";
  return "recovery";
}
