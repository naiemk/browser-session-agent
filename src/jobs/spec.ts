import { createHash } from "node:crypto";
import path from "node:path";
import { assertSchemaVersion, writeJsonAtomic } from "../core/atomic.ts";
import { iso, type Clock } from "../core/clock.ts";
import type { NondelegableAction } from "../core/gate.ts";
import { PREDICATE_KINDS, parsePredicate } from "../core/predicates.ts";
import { redactDeep } from "../core/redact.ts";
import { CoreError, type Authorization, type Predicate } from "../core/types.ts";
import {
  JOB_SCHEMA,
  type ApprovalGrantSpec,
  type HumanKind,
  type SpecQuestion,
  type SpecRecord,
  type TaskTemplate,
} from "./types.ts";

const HASH_SKIP = new Set(["hash", "status", "approvedAt", "updatedAt", "createdAt"]);

export const REQUIRED_NEVER_PREAPPROVE: NondelegableAction[] = [
  "destructive",
  "payment",
  "credential",
  "otp",
  "captcha",
];

/** Shown to the planner when a draft is incomplete or a propose call fails. */
export const SPEC_DRAFT_HINT = [
  "Field names: templates[].criteria (not successCriteria); completionCriteria is Predicate[].",
  'Predicate: {"kind":"text_visible","text":"..."}. Strings become text_visible.',
  'Template: {id, objective, criteria, discoverable?, dependencies?}.',
  'Grant: {id, host, gateClass, maxCount, controlName?} — gateClass is outbound|destructive|none, never "authorization".',
  "neverPreapprove must include destructive, payment, credential, otp, captcha.",
  "Close required questions with answer, assumption, or runtimePolicy.",
  "Materials: paste text, or ask the operator to drop a file into scratchDir (/job-scratch). No upload UI, no coder/subagent in planning.",
].join(" ");

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
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
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

function asList(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function asStringList(value: unknown): string[] {
  return asList(value).flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text = asString(record.text ?? record.label ?? record.value).trim();
      return text ? [text] : [];
    }
    return [];
  });
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function coercePredicate(raw: unknown): Predicate | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("{")) {
      try {
        return parsePredicate(JSON.parse(trimmed));
      } catch {
        return { kind: "text_visible", text: trimmed };
      }
    }
    const separator = trimmed.indexOf(":");
    if (separator > 0) {
      const kind = trimmed.slice(0, separator).trim();
      const rest = trimmed.slice(separator + 1).trim();
      if (PREDICATE_KINDS.has(kind) && rest) {
        try {
          return parsePredicate({ kind, text: rest });
        } catch {
          return { kind: "text_visible", text: trimmed };
        }
      }
    }
    return { kind: "text_visible", text: trimmed };
  }
  try {
    return parsePredicate(raw);
  } catch {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      const text = asString(record.text ?? record.value).trim();
      if (text) return { kind: "text_visible", text };
    }
    return undefined;
  }
}

export function coercePredicates(raw: unknown): Predicate[] {
  return asList(raw)
    .map(coercePredicate)
    .filter((entry): entry is Predicate => Boolean(entry));
}

function pickCriteria(record: Record<string, unknown>): unknown {
  return (
    record.criteria ??
    record.successCriteria ??
    record.success_criteria ??
    record.immutableSuccessCriteria ??
    record.completionCriteria
  );
}

function coerceTemplate(raw: unknown, index: number, used: Set<string>): TaskTemplate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const objective = asString(record.objective ?? record.description ?? record.name).trim();
  const requested = asString(record.id).trim() || slug(objective) || `task-${index + 1}`;
  let id = requested;
  let n = 2;
  while (used.has(id)) {
    id = `${requested}-${n}`;
    n += 1;
  }
  used.add(id);
  if (!objective) return undefined;
  const skills = asStringList(record.skills);
  const dependencies = asStringList(record.dependencies);
  const resource = asString(record.resource).trim();
  const maxAttempts = typeof record.maxAttempts === "number" ? record.maxAttempts : undefined;
  return {
    id,
    objective,
    criteria: coercePredicates(pickCriteria(record)),
    ...(skills.length > 0 ? { skills } : {}),
    ...(resource ? { resource } : {}),
    ...(typeof maxAttempts === "number" ? { maxAttempts } : {}),
    ...(record.discoverable === true ? { discoverable: true } : {}),
    ...(dependencies.length > 0 ? { dependencies } : {}),
  };
}

function coerceGrant(raw: unknown, index: number): ApprovalGrantSpec | undefined {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return undefined;
    return {
      id: slug(text) || `grant-${index + 1}`,
      host: "*",
      gateClass: "outbound",
      maxCount: 1,
      controlName: text,
    };
  }
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const gateRaw = record.gateClass ?? record.authorization ?? record.class ?? record.gate;
  const gateClass: Authorization =
    gateRaw === "destructive" || gateRaw === "none" || gateRaw === "outbound" ? gateRaw : "outbound";
  const id = asString(record.id).trim() || `grant-${index + 1}`;
  const host = asString(record.host).trim() || "*";
  const maxCount =
    typeof record.maxCount === "number" && record.maxCount > 0
      ? record.maxCount
      : typeof record.max === "number" && record.max > 0
        ? record.max
        : 1;
  const controlName = asString(record.controlName ?? record.control ?? record.action).trim();
  const controlKind = asString(record.controlKind).trim();
  const expiresAt = asString(record.expiresAt).trim();
  return {
    id,
    host,
    gateClass,
    maxCount,
    ...(controlName ? { controlName } : {}),
    ...(controlKind ? { controlKind } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function coerceQuestion(raw: unknown, index: number): SpecQuestion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const text = asString(record.text ?? record.prompt ?? record.question).trim();
  if (!text) return undefined;
  const id = asString(record.id).trim() || `q${index + 1}`;
  return {
    id,
    text,
    required: record.required === true,
    ...(asString(record.answer).trim() ? { answer: asString(record.answer).trim() } : {}),
    ...(asString(record.assumption).trim() ? { assumption: asString(record.assumption).trim() } : {}),
    ...(asString(record.runtimePolicy).trim()
      ? { runtimePolicy: asString(record.runtimePolicy).trim() }
      : {}),
  };
}

function coerceAssumption(raw: unknown, index: number): { id: string; text: string } | undefined {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { id: `a${index + 1}`, text } : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const text = asString(record.text ?? record.assumption).trim();
  if (!text) return undefined;
  return { id: asString(record.id).trim() || `a${index + 1}`, text };
}

function guessHumanKind(notes: string): HumanKind {
  const lower = notes.toLowerCase();
  if (/(captcha|otp|2fa|login|password|credential)/.test(lower)) return "challenge";
  if (/(cv|resume|identity|passport|ssn)/.test(lower)) return "identity";
  if (/(approv|submit|send|pay)/.test(lower)) return "approval";
  return "decision";
}

function coerceIntervention(raw: unknown): { kind: HumanKind; notes: string } | undefined {
  if (typeof raw === "string") {
    const notes = raw.trim();
    return notes ? { kind: guessHumanKind(notes), notes } : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const notes = asString(record.notes ?? record.text ?? record.reason).trim();
  if (!notes) return undefined;
  const kindRaw = asString(record.kind);
  const kind: HumanKind =
    kindRaw === "decision" || kindRaw === "approval" || kindRaw === "challenge" || kindRaw === "identity"
      ? kindRaw
      : guessHumanKind(notes);
  return { kind, notes };
}

function coerceNever(raw: unknown): NondelegableAction[] {
  const allowed = new Set<string>(REQUIRED_NEVER_PREAPPROVE);
  const listed = asStringList(raw).filter((item): item is NondelegableAction => allowed.has(item));
  return [...new Set([...REQUIRED_NEVER_PREAPPROVE, ...listed])];
}

function knownFacts(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Canonicalize a planner-shaped draft so missing arrays and aliases cannot crash
 * readiness, and so `authorization` on a grant is remapped before redaction.
 */
export function normalizeSpec(spec: SpecRecord): SpecRecord {
  const raw = spec as SpecRecord & Record<string, unknown>;
  const used = new Set<string>();
  const templates = asList(raw.templates)
    .map((entry, index) => coerceTemplate(entry, index, used))
    .filter((entry): entry is TaskTemplate => Boolean(entry));
  const envelope = (raw.approvalEnvelope ?? {}) as Record<string, unknown>;
  const budgets = (raw.budgets ?? {}) as Record<string, unknown>;
  const pacing = (raw.pacing ?? {}) as Record<string, unknown>;
  const startUrl = asString(raw.startUrl).trim();
  return {
    schemaVersion: JOB_SCHEMA,
    jobId: asString(raw.jobId),
    version: numberOr(raw.version, 1),
    status: raw.status === "proposed" || raw.status === "approved" || raw.status === "superseded" ? raw.status : "draft",
    hash: typeof raw.hash === "string" ? raw.hash : undefined,
    objective: asString(raw.objective),
    inScope: asStringList(raw.inScope),
    outOfScope: asStringList(raw.outOfScope),
    completionCriteria: coercePredicates(raw.completionCriteria),
    knownFacts: knownFacts(raw.knownFacts),
    assumptions: asList(raw.assumptions)
      .map(coerceAssumption)
      .filter((entry): entry is { id: string; text: string } => Boolean(entry)),
    questions: asList(raw.questions)
      .map(coerceQuestion)
      .filter((entry): entry is SpecQuestion => Boolean(entry)),
    templates,
    budgets: {
      maxTurnsPerTask: numberOr(budgets.maxTurnsPerTask, 16) || 16,
      sprintTaskLimit: Math.max(1, numberOr(budgets.sprintTaskLimit, 5)),
      ...(typeof budgets.maxCostUsd === "number" ? { maxCostUsd: budgets.maxCostUsd } : {}),
      ...(typeof budgets.maxSiteActionsPerHour === "number"
        ? { maxSiteActionsPerHour: budgets.maxSiteActionsPerHour }
        : {}),
    },
    pacing: {
      minCooldownMs: Math.max(0, numberOr(pacing.minCooldownMs, 15 * 60_000)),
      maxCooldownMs: Math.max(
        numberOr(pacing.minCooldownMs, 15 * 60_000),
        numberOr(pacing.maxCooldownMs, 24 * 60 * 60_000),
      ),
      circuitBreakerAfter: Math.max(1, numberOr(pacing.circuitBreakerAfter, 3)),
    },
    stopConditions: asStringList(raw.stopConditions),
    anticipatedInterventions: asList(raw.anticipatedInterventions)
      .map(coerceIntervention)
      .filter((entry): entry is { kind: HumanKind; notes: string } => Boolean(entry)),
    approvalEnvelope: {
      grants: asList(envelope.grants)
        .map(coerceGrant)
        .filter((entry): entry is ApprovalGrantSpec => Boolean(entry)),
      neverPreapprove: coerceNever(envelope.neverPreapprove),
    },
    ...(startUrl ? { startUrl } : {}),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
    ...(typeof raw.approvedAt === "string" ? { approvedAt: raw.approvedAt } : {}),
  };
}

function collectReadinessIssues(spec: SpecRecord): ReadinessIssue[] {
  const canonical = normalizeSpec(spec);
  const issues: ReadinessIssue[] = [];
  if (!canonical.objective.trim()) issues.push({ code: "objective", message: "objective is required" });
  if (canonical.inScope.length === 0) issues.push({ code: "in_scope", message: "in-scope must be stated" });
  if (canonical.completionCriteria.length === 0) {
    issues.push({ code: "verifier", message: "job completion criteria are required" });
  }
  if (canonical.templates.length === 0) {
    issues.push({ code: "templates", message: "at least one task template is required" });
  }
  for (const template of canonical.templates) {
    if (!template.criteria.length) {
      issues.push({
        code: "template_criteria",
        message: `template ${template.id} needs criteria (field name is criteria, not successCriteria)`,
      });
    }
  }
  if (!canonical.budgets.maxTurnsPerTask || canonical.budgets.sprintTaskLimit < 1) {
    issues.push({ code: "budget", message: "turn and sprint budgets are required" });
  }
  if (canonical.pacing.minCooldownMs < 0 || canonical.pacing.maxCooldownMs < canonical.pacing.minCooldownMs) {
    issues.push({ code: "pacing", message: "pacing bounds are invalid" });
  }
  if (canonical.stopConditions.length === 0) {
    issues.push({ code: "stop", message: "at least one stop condition is required" });
  }
  for (const question of canonical.questions) {
    if (question.required && !questionClosed(question)) {
      issues.push({ code: "question", message: `unresolved required question: ${question.id}` });
    }
  }
  const never = new Set(canonical.approvalEnvelope.neverPreapprove);
  for (const required of REQUIRED_NEVER_PREAPPROVE) {
    if (!never.has(required)) {
      issues.push({ code: "envelope", message: `${required} must be listed as never-preapproved` });
    }
  }
  return issues;
}

export function readinessIssues(spec: SpecRecord): ReadinessIssue[] {
  try {
    return collectReadinessIssues(spec);
  } catch (err) {
    return [
      {
        code: "invalid_spec",
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

export function parseCriteria(raw: unknown[]): Predicate[] {
  return coercePredicates(raw);
}

export function renderSpecMarkdown(spec: SpecRecord): string {
  const canonical = normalizeSpec(spec);
  const questions = canonical.questions
    .map((question) => {
      const close = question.answer ?? question.assumption ?? question.runtimePolicy ?? "(open)";
      return `- ${question.id}: ${question.text} → ${close}`;
    })
    .join("\n");
  return `# ${canonical.objective}

Version ${canonical.version}${canonical.hash ? ` · \`${canonical.hash}\`` : ""} · ${canonical.status}

## Scope
In: ${canonical.inScope.join("; ") || "(none)"}
Out: ${canonical.outOfScope.join("; ") || "(none)"}

## Completion
${canonical.completionCriteria.map((criterion) => `- ${JSON.stringify(criterion)}`).join("\n") || "- (none)"}

## Templates
${canonical.templates.map((template) => `- ${template.id}: ${template.objective}`).join("\n") || "- (none)"}

## Questions
${questions || "- (none)"}

## Budgets
Turns/task ${canonical.budgets.maxTurnsPerTask}; sprint size ${canonical.budgets.sprintTaskLimit}; cost cap ${canonical.budgets.maxCostUsd ?? "none"}

## Envelope
Never: ${canonical.approvalEnvelope.neverPreapprove.join(", ")}
Grants: ${canonical.approvalEnvelope.grants.map((grant) => grant.id).join(", ") || "(none)"}
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

export function mergeSpec(base: SpecRecord, patch: object, clock: Clock): SpecRecord {
  if (base.status === "approved") {
    throw new CoreError("spec_immutable", "approved specs cannot be edited; revise instead");
  }
  const incoming = patch as Partial<SpecRecord> & Record<string, unknown>;
  const next: SpecRecord = {
    ...base,
    ...incoming,
    schemaVersion: JOB_SCHEMA,
    jobId: base.jobId,
    version: base.version,
    status: "draft",
    hash: undefined,
    approvedAt: undefined,
    budgets: { ...base.budgets, ...(incoming.budgets ?? {}) },
    pacing: { ...base.pacing, ...(incoming.pacing ?? {}) },
    approvalEnvelope: {
      grants: incoming.approvalEnvelope?.grants ?? base.approvalEnvelope.grants,
      neverPreapprove: incoming.approvalEnvelope?.neverPreapprove ?? base.approvalEnvelope.neverPreapprove,
    },
    updatedAt: iso(clock),
  };
  return normalizeSpec(next);
}

export function assertReady(spec: SpecRecord): void {
  const issues = readinessIssues(spec);
  if (issues.length > 0) {
    throw new CoreError("spec_not_ready", issues.map((issue) => issue.message).join("; "), {
      issues,
    });
  }
}

export function draftFeedback(spec: SpecRecord): {
  version: number;
  status: SpecRecord["status"];
  ready: boolean;
  issues: ReadinessIssue[];
  templateSummary: Array<{ id: string; criteria: number; discoverable: boolean }>;
  hint?: string;
} {
  const issues = readinessIssues(spec);
  return {
    version: spec.version,
    status: spec.status,
    ready: issues.length === 0,
    issues,
    templateSummary: spec.templates.map((template) => ({
      id: template.id,
      criteria: template.criteria.length,
      discoverable: Boolean(template.discoverable),
    })),
    ...(issues.length > 0 ? { hint: SPEC_DRAFT_HINT } : {}),
  };
}
