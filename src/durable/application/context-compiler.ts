import type { Case, WorkItem, OperationOutcome, OperationCheckpoint } from "../domain/types.ts";
import type { WorkflowSpecV2 } from "../domain/spec-types.ts";
import { evaluateAggregateOracle, validateOutputSchema, type ArtifactManifest } from "../domain/oracles.ts";

export interface CompiledAttempt {
  jobId: string;
  workItem: WorkItem;
  case?: Case;
  specSlice: {
    templateId: string;
    objective: string;
    oracle: WorkflowSpecV2["templates"][0]["oracle"];
    outputSchema?: WorkflowSpecV2["templates"][0]["outputSchema"];
    envelope: WorkflowSpecV2["effectEnvelope"];
  };
  priorFailures: Array<{ stage: string; code: string; at: string }>;
  evidenceRefs: string[];
  budgets: { maxTurns: number; maxSiteActions: number; maxElapsedMs: number };
}

/** EXEC-04 — fresh bounded context; no transcript/sprint authority. */
export function compileAttemptContext(input: {
  workItem: WorkItem;
  case?: Case;
  workflow: WorkflowSpecV2;
  priorFailures?: CompiledAttempt["priorFailures"];
  evidenceRefs?: string[];
}): CompiledAttempt {
  const template = input.workflow.templates.find((t) => t.id === input.workItem.templateId);
  if (!template) {
    throw new Error(`missing template ${input.workItem.templateId}`);
  }
  // Reject DOM-ref shaped checkpoints
  const checkpoint = input.workItem.checkpoint;
  if (checkpoint && "ref" in (checkpoint as object)) {
    throw new Error("checkpoint must not store DOM refs");
  }
  return {
    jobId: input.workItem.jobId,
    workItem: input.workItem,
    case: input.case,
    specSlice: {
      templateId: template.id,
      objective: template.objective,
      oracle: template.oracle,
      outputSchema: template.outputSchema,
      envelope: input.workflow.effectEnvelope,
    },
    priorFailures: input.priorFailures ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    budgets: {
      maxTurns: input.workflow.budgets.maxTurnsPerAttempt,
      maxSiteActions: input.workflow.budgets.maxSiteActionsPerAttempt,
      maxElapsedMs: input.workflow.budgets.maxElapsedMsPerAttempt,
    },
  };
}

export type RetryFamily = "executor" | "challenge" | "effect_uncertainty" | "operator_rejection";

export interface RetryLedger {
  counts: Record<RetryFamily, number>;
  lastEvidenceHash?: string;
}

export function allowRetry(
  ledger: RetryLedger,
  family: RetryFamily,
  max: number,
  newEvidenceHash?: string,
): { ok: boolean; next: RetryLedger; reason?: string } {
  if (ledger.counts[family] >= max) {
    return { ok: false, next: ledger, reason: "budget" };
  }
  if (newEvidenceHash && newEvidenceHash === ledger.lastEvidenceHash) {
    return { ok: false, next: ledger, reason: "no_new_evidence" };
  }
  return {
    ok: true,
    next: {
      counts: { ...ledger.counts, [family]: ledger.counts[family] + 1 },
      lastEvidenceHash: newEvidenceHash ?? ledger.lastEvidenceHash,
    },
  };
}

export function emptyRetryLedger(): RetryLedger {
  return { counts: { executor: 0, challenge: 0, effect_uncertainty: 0, operator_rejection: 0 } };
}

/** EXEC-09 — never trust model claim alone. */
export function evaluateAttemptOutcome(input: {
  claim?: { success?: boolean };
  workflow: WorkflowSpecV2;
  workItem: WorkItem;
  output?: unknown;
  cases: Case[];
  artifacts: ArtifactManifest[];
  acceptedOutputs: unknown[];
  nowIso: string;
  operatorStop?: boolean;
}): { workItemStatus: WorkItem["status"]; jobComplete: boolean; unmet: string[]; outcome: OperationOutcome<unknown> } {
  const template = input.workflow.templates.find((t) => t.id === input.workItem.templateId);
  const schemaCheck = validateOutputSchema(input.output, template?.outputSchema);
  if (input.claim?.success && !schemaCheck.passed) {
    return {
      workItemStatus: "failed",
      jobComplete: false,
      unmet: schemaCheck.unmet,
      outcome: {
        status: "failed",
        stage: "postcondition",
        code: "claim_without_schema",
        retryable: true,
        evidenceIds: [],
      },
    };
  }
  if (!schemaCheck.passed) {
    return {
      workItemStatus: "failed",
      jobComplete: false,
      unmet: schemaCheck.unmet,
      outcome: {
        status: "failed",
        stage: "postcondition",
        code: "output_schema",
        retryable: true,
        evidenceIds: [],
      },
    };
  }

  const aggregate = evaluateAggregateOracle(input.workflow.completionOracle, {
    cases: input.cases,
    acceptedOutputs: input.acceptedOutputs,
    artifacts: input.artifacts,
    operatorStop: input.operatorStop,
    nowIso: input.nowIso,
  });

  return {
    workItemStatus: "done",
    jobComplete: aggregate.passed,
    unmet: aggregate.unmet,
    outcome: { status: "completed", value: input.output ?? null, evidenceIds: [] },
  };
}

export function checkpointWithoutDomRefs(checkpoint: OperationCheckpoint): OperationCheckpoint {
  const { intent, pageIdentity, effectId, nextIndex, evidenceIds } = checkpoint;
  return { intent, pageIdentity, effectId, nextIndex, evidenceIds };
}
