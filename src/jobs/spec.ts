import { createHash } from "node:crypto";
import path from "node:path";
import { assertSchemaVersion, writeJsonAtomic } from "../core/atomic.ts";
import { iso, type Clock } from "../core/clock.ts";
import { parsePredicate } from "../core/predicates.ts";
import { redactDeep } from "../core/redact.ts";
import { CoreError, type Predicate } from "../core/types.ts";
import { JOB_SCHEMA, type SpecQuestion, type SpecRecord } from "./types.ts";

const HASH_SKIP = new Set(["hash", "status", "approvedAt", "updatedAt", "createdAt"]);

export function emptySpec(jobId: string, objective: string, clock: Clock): SpecRecord {
  const now = iso(clock);
  return {
    schemaVersion: JOB_SCHEMA,
    jobId,
    version: 1,
    status: "draft",
    objective,
    inScope: [],
    outOfScope: [],
    completionCriteria: [],
    knownFacts: {},
    assumptions: [],
    questions: [],
    templates: [],
    budgets: { maxTurnsPerTask: 16, sprintTaskLimit: 5 },
    pacing: { minCooldownMs: 15 * 60_000, maxCooldownMs: 24 * 60 * 60_000, circuitBreakerAfter: 3 },
    stopConditions: [],
    anticipatedInterventions: [],
    approvalEnvelope: {
      grants: [],
      neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (HASH_SKIP.has(key)) continue;
      out[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function specHash(spec: SpecRecord): string {
  const body = JSON.stringify(stableValue(spec));
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

export function questionClosed(question: SpecQuestion): boolean {
  return Boolean(question.answer || question.assumption || question.runtimePolicy);
}

export interface ReadinessIssue {
  code: string;
  message: string;
}

export function readinessIssues(spec: SpecRecord): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (!spec.objective.trim()) issues.push({ code: "objective", message: "objective is required" });
  if (spec.inScope.length === 0) issues.push({ code: "in_scope", message: "in-scope must be stated" });
  if (spec.completionCriteria.length === 0) {
    issues.push({ code: "verifier", message: "job completion criteria are required" });
  }
  if (spec.templates.length === 0) issues.push({ code: "templates", message: "at least one task template is required" });
  for (const template of spec.templates) {
    if (!template.criteria.length) {
      issues.push({ code: "template_criteria", message: `template ${template.id} needs criteria` });
    }
  }
  if (!spec.budgets.maxTurnsPerTask || spec.budgets.sprintTaskLimit < 1) {
    issues.push({ code: "budget", message: "turn and sprint budgets are required" });
  }
  if (spec.pacing.minCooldownMs < 0 || spec.pacing.maxCooldownMs < spec.pacing.minCooldownMs) {
    issues.push({ code: "pacing", message: "pacing bounds are invalid" });
  }
  if (spec.stopConditions.length === 0) {
    issues.push({ code: "stop", message: "at least one stop condition is required" });
  }
  for (const question of spec.questions) {
    if (question.required && !questionClosed(question)) {
      issues.push({ code: "question", message: `unresolved required question: ${question.id}` });
    }
  }
  const never = new Set(spec.approvalEnvelope.neverPreapprove);
  for (const required of ["destructive", "payment", "credential", "otp", "captcha"] as const) {
    if (!never.has(required)) {
      issues.push({ code: "envelope", message: `${required} must be listed as never-preapproved` });
    }
  }
  return issues;
}

export function parseCriteria(raw: unknown[]): Predicate[] {
  return raw.map((entry) => parsePredicate(entry));
}

export function renderSpecMarkdown(spec: SpecRecord): string {
  const questions = spec.questions
    .map((question) => {
      const close = question.answer ?? question.assumption ?? question.runtimePolicy ?? "(open)";
      return `- ${question.id}: ${question.text} → ${close}`;
    })
    .join("\n");
  return `# ${spec.objective}

Version ${spec.version}${spec.hash ? ` · \`${spec.hash}\`` : ""} · ${spec.status}

## Scope
In: ${spec.inScope.join("; ") || "(none)"}
Out: ${spec.outOfScope.join("; ") || "(none)"}

## Completion
${spec.completionCriteria.map((criterion) => `- ${JSON.stringify(criterion)}`).join("\n") || "- (none)"}

## Templates
${spec.templates.map((template) => `- ${template.id}: ${template.objective}`).join("\n") || "- (none)"}

## Questions
${questions || "- (none)"}

## Budgets
Turns/task ${spec.budgets.maxTurnsPerTask}; sprint size ${spec.budgets.sprintTaskLimit}; cost cap ${spec.budgets.maxCostUsd ?? "none"}

## Envelope
Never: ${spec.approvalEnvelope.neverPreapprove.join(", ")}
Grants: ${spec.approvalEnvelope.grants.map((grant) => grant.id).join(", ") || "(none)"}
`;
}

export async function writeSpecFiles(dir: string, spec: SpecRecord): Promise<void> {
  assertSchemaVersion(spec.schemaVersion, JOB_SCHEMA, "spec");
  const jsonPath = path.join(dir, `${spec.version}.json`);
  const mdPath = path.join(dir, `${spec.version}.md`);
  const safe = redactDeep(spec);
  await writeJsonAtomic(jsonPath, safe);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(mdPath, renderSpecMarkdown(safe), "utf8");
}

export function mergeSpec(base: SpecRecord, patch: Partial<SpecRecord>, clock: Clock): SpecRecord {
  if (base.status === "approved") {
    throw new CoreError("spec_immutable", "approved specs cannot be edited; revise instead");
  }
  const next: SpecRecord = {
    ...base,
    ...patch,
    schemaVersion: JOB_SCHEMA,
    jobId: base.jobId,
    version: base.version,
    status: "draft",
    hash: undefined,
    approvedAt: undefined,
    budgets: { ...base.budgets, ...patch.budgets },
    pacing: { ...base.pacing, ...patch.pacing },
    approvalEnvelope: {
      grants: patch.approvalEnvelope?.grants ?? base.approvalEnvelope.grants,
      neverPreapprove: patch.approvalEnvelope?.neverPreapprove ?? base.approvalEnvelope.neverPreapprove,
    },
    updatedAt: iso(clock),
  };
  return next;
}

export function assertReady(spec: SpecRecord): void {
  const issues = readinessIssues(spec);
  if (issues.length > 0) {
    throw new CoreError("spec_not_ready", issues.map((issue) => issue.message).join("; "), {
      issues,
    });
  }
}
