/**
 * WorkflowSpecV2 and related compiler types (SPEC-*).
 * Pure data — no I/O.
 */

export type JsonSchema = Record<string, unknown>;

export type NondelegableCategory = "destructive" | "payment" | "credential" | "otp" | "captcha";

export const REQUIRED_NEVER_PREAPPROVE: readonly NondelegableCategory[] = [
  "destructive",
  "payment",
  "credential",
  "otp",
  "captcha",
] as const;

export interface OperationOracle {
  kind: "operation";
  predicates?: Array<Record<string, unknown>>;
  schema?: JsonSchema;
}

export interface AggregateOracle {
  kind: "aggregate";
  rules: Array<
    | { type: "case_count"; min?: number; max?: number; stage?: string }
    | { type: "artifact_schema"; artifactId: string; schema: JsonSchema }
    | { type: "accepted_outputs"; min: number; schema: JsonSchema }
    | { type: "deadline"; iso: string }
    | { type: "operator_stop" }
  >;
}

export interface OperationTemplate {
  id: string;
  scope: "job" | "case";
  objective: string;
  oracle: OperationOracle;
  outputSchema?: JsonSchema;
  dependencies?: string[];
  resource?: string;
  maxAttempts?: number;
  discoverable?: boolean;
  skills?: string[];
}

export interface EffectEnvelope {
  allowed: Array<{ effect: string; hosts?: string[]; limits?: Record<string, number> }>;
  denied: string[];
  grants: Array<{
    id: string;
    host: string;
    effect: string;
    maxCount: number;
    controlName?: string;
    expiresAt?: string;
  }>;
  neverPreapprove: NondelegableCategory[];
}

export interface BudgetPolicy {
  maxTurnsPerAttempt: number;
  maxSiteActionsPerAttempt: number;
  maxElapsedMsPerAttempt: number;
  maxCostUsd?: number;
  maxSiteActionsPerHour?: number;
}

export interface PacingPolicy {
  minCooldownMs: number;
  maxCooldownMs: number;
  circuitBreakerAfter: number;
}

export interface ChallengePolicy {
  highConfidenceThreshold: number;
  openBreakerOnChallenge: boolean;
}

export interface RevisionPolicyDefaults {
  requireMigrationPlan: boolean;
}

export type StopPolicy =
  | { type: "operator_stop" }
  | { type: "budget_exhausted" }
  | { type: "deadline"; iso: string }
  | { type: "aggregate_complete" };

export interface WorkflowSpecV2 {
  schemaVersion: 2;
  jobId: string;
  version: number;
  objective: string;
  caseMode: "singleton" | "discovered" | "recurring";
  inScope: string[];
  outOfScope: string[];
  inputs: Array<{ id: string; schema: JsonSchema; required: boolean }>;
  templates: OperationTemplate[];
  completionOracle: AggregateOracle;
  stopPolicies: StopPolicy[];
  budgets: BudgetPolicy;
  pacing: PacingPolicy;
  challengePolicy: ChallengePolicy;
  effectEnvelope: EffectEnvelope;
  revisionPolicy: RevisionPolicyDefaults;
}

export interface SpecDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export type SpecCompileResult =
  | { ok: true; spec: WorkflowSpecV2; canonicalBytes: string }
  | { ok: false; diagnostics: SpecDiagnostic[] };
