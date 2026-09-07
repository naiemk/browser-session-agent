import type { NondelegableAction } from "../core/gate.ts";
import type { Authorization, Predicate } from "../core/types.ts";

export const JOB_SCHEMA = 1 as const;

export type JobDurableStatus =
  | "planning"
  | "awaiting_plan_approval"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type JobDisplayStatus = JobDurableStatus | "running" | "idle" | "waiting_human";

export interface JobRecord {
  schemaVersion: typeof JOB_SCHEMA;
  jobId: string;
  title: string;
  objective: string;
  status: JobDurableStatus;
  approvedSpecVersion?: number;
  approvedSpecHash?: string;
  draftSpecVersion: number;
  currentSprintId?: string;
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  completedAt?: string;
  nextWakeAt?: string;
}

export interface SpecQuestion {
  id: string;
  text: string;
  required: boolean;
  answer?: string;
  assumption?: string;
  runtimePolicy?: string;
}

export interface TaskTemplate {
  id: string;
  objective: string;
  criteria: Predicate[];
  skills?: string[];
  resource?: string;
  maxAttempts?: number;
  discoverable?: boolean;
  dependencies?: string[];
}

export interface ApprovalGrantSpec {
  id: string;
  host: string;
  /**
   * Authorization class this grant covers.
   *
   * Named `gateClass` rather than `authorization` because `redactDeep` treats that key
   * as a credential header and would persist `[redacted]` into the approved spec.
   */
  gateClass: Authorization;
  controlKind?: string;
  controlName?: string;
  maxCount: number;
  expiresAt?: string;
}

export interface SpecRecord {
  schemaVersion: typeof JOB_SCHEMA;
  jobId: string;
  version: number;
  status: "draft" | "proposed" | "approved" | "superseded";
  hash?: string;
  objective: string;
  inScope: string[];
  outOfScope: string[];
  completionCriteria: Predicate[];
  knownFacts: Record<string, unknown>;
  assumptions: Array<{ id: string; text: string }>;
  questions: SpecQuestion[];
  templates: TaskTemplate[];
  budgets: {
    maxTurnsPerTask: number;
    maxCostUsd?: number;
    maxSiteActionsPerHour?: number;
    sprintTaskLimit: number;
  };
  pacing: {
    minCooldownMs: number;
    maxCooldownMs: number;
    circuitBreakerAfter: number;
  };
  stopConditions: string[];
  anticipatedInterventions: Array<{ kind: HumanKind; notes: string }>;
  approvalEnvelope: {
    grants: ApprovalGrantSpec[];
    neverPreapprove: NondelegableAction[];
  };
  startUrl?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export type HumanKind = "decision" | "approval" | "challenge" | "identity";

export type HumanStatus =
  | "waiting"
  | "rehydrating"
  | "human_ready"
  | "cooldown"
  | "resolved"
  | "expired"
  | "escalated";

export interface HumanItem {
  id: string;
  jobId: string;
  kind: HumanKind;
  status: HumanStatus;
  entityId?: string;
  taskId?: string;
  perishable: boolean;
  resource: string;
  reason: string;
  handoff: string;
  reentry?: string;
  verification?: Predicate[];
  recommendedRetryMs?: number;
  notBefore?: string;
  expiresAt?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface ResourcePace {
  notBefore?: string;
  failures: number;
  circuitOpenUntil?: string;
}

export interface SchedulerRecord {
  schemaVersion: typeof JOB_SCHEMA;
  resources: Record<string, ResourcePace>;
  grantUsage: Record<string, { usedCount: number }>;
  spend: { costUsd: number; attempts: number; siteActions: number };
  nextWakeAt?: string;
  updatedAt: string;
}

export interface SprintRecord {
  schemaVersion: typeof JOB_SCHEMA;
  id: string;
  jobId: string;
  specVersion: number;
  specHash: string;
  taskIds: string[];
  status: "open" | "closed" | "holding";
  summary: string;
  progress: { done: number; total: number; parked: number };
  decisions: string[];
  facts: Record<string, unknown>;
  failedApproaches: Array<{ approach: string; reason: string }>;
  blockers: string[];
  remaining: string[];
  createdAt: string;
  closedAt?: string;
}

export const LEGAL_TRANSITIONS: Record<JobDurableStatus, JobDurableStatus[]> = {
  planning: ["awaiting_plan_approval", "cancelled"],
  awaiting_plan_approval: ["planning", "active", "cancelled"],
  active: ["paused", "completed", "failed", "cancelled", "planning"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: [],
  failed: ["planning", "cancelled"],
};
