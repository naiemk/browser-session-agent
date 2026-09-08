/**
 * Jobs V2 domain vocabulary and record shapes (DOM-01).
 * Sprint is never authoritative.
 */

export type JobId = string;
export type SpecHash = string;
export type CaseKey = string;
export type WorkItemId = string;
export type AttemptId = string;
export type EffectId = string;
export type HumanRequestId = string;
export type FenceToken = string;
export type EvidenceId = string;

export type JobLifecycle =
  | "planning"
  | "awaiting_plan_approval"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

export type WorkItemStatus =
  | "pending"
  | "ready"
  | "leased"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled"
  | "abandoned";

export type EffectStatus =
  | "prepared"
  | "dispatched"
  | "observed"
  | "uncertain"
  | "reconciled"
  | "abandoned";

export type HumanKind = "decision" | "approval" | "challenge" | "identity";
export type HumanStatus =
  | "waiting"
  | "ready"
  | "rehydrating"
  | "resolved"
  | "expired"
  | "skipped";

export type FailureStage =
  | "target"
  | "precondition"
  | "execution"
  | "postcondition"
  | "challenge"
  | "recovery"
  | "model"
  | "cancelled";

export type BlockReason =
  | { kind: "challenge"; confidence: number; signals: string[]; host: string }
  | { kind: "approval"; effectId: string; detail: string }
  | { kind: "authentication" | "permission" | "rate_limit" | "takeover"; detail: string };

export interface OperationCheckpoint {
  intent: string;
  pageIdentity?: string;
  effectId?: string;
  nextIndex?: number;
  evidenceIds: EvidenceId[];
}

export type OperationOutcome<T> =
  | { status: "completed"; value: T; evidenceIds: EvidenceId[] }
  | { status: "failed"; stage: FailureStage; code: string; retryable: boolean; evidenceIds: EvidenceId[] }
  | { status: "blocked"; block: BlockReason; checkpoint: OperationCheckpoint; evidenceIds: EvidenceId[] }
  | { status: "cancelled"; checkpoint: OperationCheckpoint; evidenceIds: EvidenceId[] };

export interface Job {
  jobId: JobId;
  title: string;
  objective: string;
  lifecycle: JobLifecycle;
  caseMode: "singleton" | "discovered" | "recurring";
  activeSpecVersion?: number;
  activeSpecHash?: SpecHash;
  draftSpecVersion: number;
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  completedAt?: string;
  nextWakeAt?: string;
}

export interface SpecVersion {
  jobId: JobId;
  version: number;
  status: "draft" | "proposed" | "approved" | "superseded";
  hash?: SpecHash;
  canonicalBytes: string;
  createdAt: string;
  approvedAt?: string;
}

export interface Case {
  jobId: JobId;
  caseKey: CaseKey;
  label: string;
  stage: string;
  facts: Record<string, unknown>;
  outcome?: { status: "success" | "failed" | "dropped"; detail: string };
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: WorkItemId;
  jobId: JobId;
  caseKey?: CaseKey;
  templateId: string;
  specVersion: number;
  specHash: SpecHash;
  objective: string;
  status: WorkItemStatus;
  dependencies: WorkItemId[];
  resourceKey?: string;
  attempts: number;
  maxAttempts: number;
  deferredUntil?: string;
  checkpoint?: OperationCheckpoint;
  createdAt: string;
  updatedAt: string;
}

export interface Attempt {
  id: AttemptId;
  jobId: JobId;
  workItemId: WorkItemId;
  fenceToken: FenceToken;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  leaseExpiresAt: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: OperationOutcome<unknown>;
  costUsd: number;
  turns: number;
  siteActions: number;
}

export interface Effect {
  id: EffectId;
  jobId: JobId;
  workItemId: WorkItemId;
  attemptId?: AttemptId;
  kind: string;
  status: EffectStatus;
  identityKey: string;
  destination?: string;
  evidenceIds: EvidenceId[];
  preparedAt: string;
  dispatchedAt?: string;
  observedAt?: string;
  reconciledAt?: string;
}

export interface HumanRequest {
  id: HumanRequestId;
  jobId: JobId;
  kind: HumanKind;
  status: HumanStatus;
  perishable: boolean;
  workItemId?: WorkItemId;
  caseKey?: CaseKey;
  resourceKey: string;
  reason: string;
  handoff: string;
  checkpoint?: OperationCheckpoint;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  resolvedAt?: string;
}

export interface ResourceState {
  key: string;
  scope: "work_item" | "host" | "account" | "profile" | "session";
  failures: number;
  notBefore?: string;
  circuitOpenUntil?: string;
  windowActions: number;
  windowCostUsd: number;
  updatedAt: string;
}

/** Display-only; never stored on Job.lifecycle (DOM-06). */
export type DerivedDisplayStatus =
  | "running"
  | "idle"
  | "waiting_human"
  | "blocked"
  | "runtime_unavailable"
  | JobLifecycle;
