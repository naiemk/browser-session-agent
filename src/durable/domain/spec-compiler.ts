import { DomainError } from "./errors.ts";
import type { AggregateOracle, SpecCompileResult, SpecDiagnostic, WorkflowSpecV2 } from "./spec-types.ts";
import { REQUIRED_NEVER_PREAPPROVE, type NondelegableCategory } from "./spec-types.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Deterministic JSON for hashing (SPEC-01). */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeys(value[key]);
  }
  return out;
}

function diag(code: string, message: string, path?: string): SpecDiagnostic {
  return { code, message, path };
}

/**
 * SPEC-01/02/04/05/06/07 — strict SpecCompiler.
 * Does not coerce strings to predicates or synthesize host:"*" grants.
 */
export function compileWorkflowSpec(draft: unknown, mode: "lenient" | "strict"): SpecCompileResult {
  const diagnostics: SpecDiagnostic[] = [];
  if (!isObject(draft)) {
    return { ok: false, diagnostics: [diag("not_object", "draft must be an object")] };
  }

  const jobId = typeof draft.jobId === "string" ? draft.jobId : "";
  if (!jobId) diagnostics.push(diag("missing_jobId", "jobId is required", "jobId"));

  const version = typeof draft.version === "number" ? draft.version : 1;
  const objective = typeof draft.objective === "string" ? draft.objective.trim() : "";
  if (!objective) diagnostics.push(diag("missing_objective", "objective is required", "objective"));

  const caseMode = draft.caseMode;
  if (caseMode !== "singleton" && caseMode !== "discovered" && caseMode !== "recurring") {
    diagnostics.push(diag("bad_caseMode", "caseMode must be singleton|discovered|recurring", "caseMode"));
  }

  const templatesRaw = Array.isArray(draft.templates) ? draft.templates : [];
  if (templatesRaw.length === 0) diagnostics.push(diag("no_templates", "at least one template is required", "templates"));

  const templates = [];
  const templateIds = new Set<string>();
  for (let i = 0; i < templatesRaw.length; i++) {
    const t = templatesRaw[i];
    const path = `templates[${i}]`;
    if (!isObject(t)) {
      diagnostics.push(diag("bad_template", "template must be object", path));
      continue;
    }
    if (typeof t.id !== "string" || !t.id) {
      diagnostics.push(diag("missing_template_id", "template.id required", `${path}.id`));
      continue;
    }
    if (templateIds.has(t.id)) diagnostics.push(diag("duplicate_template_id", `duplicate id ${t.id}`, `${path}.id`));
    templateIds.add(t.id);
    if (t.scope !== "job" && t.scope !== "case") {
      diagnostics.push(diag("bad_scope", "scope must be job|case", `${path}.scope`));
    }
    if (typeof t.objective !== "string" || !t.objective) {
      diagnostics.push(diag("missing_template_objective", "objective required", `${path}.objective`));
    }
    if (!isObject(t.oracle) || t.oracle.kind !== "operation") {
      diagnostics.push(diag("bad_oracle", "oracle.kind must be operation", `${path}.oracle`));
    }
    // SPEC-02: reject string predicates / invented grants
    if (typeof t.oracle === "string") {
      diagnostics.push(diag("coerced_predicate_forbidden", "oracle must not be a string", `${path}.oracle`));
    }
    templates.push({
      id: String(t.id),
      scope: t.scope === "case" ? ("case" as const) : ("job" as const),
      objective: String(t.objective ?? ""),
      oracle: isObject(t.oracle) && t.oracle.kind === "operation"
        ? {
            kind: "operation" as const,
            predicates: Array.isArray(t.oracle.predicates)
              ? (t.oracle.predicates as Array<Record<string, unknown>>)
              : undefined,
            schema: isObject(t.oracle.schema) ? t.oracle.schema : undefined,
          }
        : { kind: "operation" as const },
      outputSchema: isObject(t.outputSchema) ? t.outputSchema : undefined,
      dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : undefined,
      resource: typeof t.resource === "string" ? t.resource : undefined,
      maxAttempts: typeof t.maxAttempts === "number" ? t.maxAttempts : undefined,
      discoverable: Boolean(t.discoverable),
      skills: Array.isArray(t.skills) ? t.skills.map(String) : undefined,
    });
  }

  // SPEC-04 seed
  if (caseMode === "discovered" || caseMode === "recurring") {
    const seed = templates.find((t) => t.scope === "job" && !t.discoverable);
    if (!seed) {
      diagnostics.push(
        diag("missing_seed", "discovered/recurring jobs need a non-discoverable job-scoped seed", "templates"),
      );
    }
  }

  // SPEC-05 deps
  for (const t of templates) {
    for (const dep of t.dependencies ?? []) {
      const target = templates.find((x) => x.id === dep);
      if (!target) {
        diagnostics.push(diag("unknown_dependency", `unknown dependency ${dep}`, `templates.${t.id}`));
        continue;
      }
      if (target.scope !== t.scope) {
        diagnostics.push(
          diag("cross_scope_dependency", `dependency ${dep} crosses scope`, `templates.${t.id}`),
        );
      }
    }
  }

  const envelopeRaw = isObject(draft.effectEnvelope) ? draft.effectEnvelope : {};
  const grants = Array.isArray(envelopeRaw.grants) ? envelopeRaw.grants : [];
  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (!isObject(g)) continue;
    if (g.host === "*") {
      diagnostics.push(diag("wildcard_grant_forbidden", 'host:"*" grants are not allowed at approve', `effectEnvelope.grants[${i}]`));
    }
    if (typeof g.effect !== "string" || !g.effect) {
      diagnostics.push(diag("grant_missing_effect", "grant.effect required", `effectEnvelope.grants[${i}]`));
    }
  }

  const never = Array.isArray(envelopeRaw.neverPreapprove)
    ? (envelopeRaw.neverPreapprove as string[])
    : [];
  for (const required of REQUIRED_NEVER_PREAPPROVE) {
    if (!never.includes(required)) {
      diagnostics.push(
        diag("missing_neverPreapprove", `neverPreapprove must include ${required}`, "effectEnvelope.neverPreapprove"),
      );
    }
  }

  const completion = draft.completionOracle;
  if (!isObject(completion) || completion.kind !== "aggregate" || !Array.isArray(completion.rules)) {
    diagnostics.push(diag("missing_aggregate_oracle", "completionOracle.kind must be aggregate with rules", "completionOracle"));
  }

  if (mode === "strict" && diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  if (mode === "lenient" && (!jobId || !objective || templates.length === 0)) {
    return { ok: false, diagnostics };
  }

  const denied = Array.isArray(envelopeRaw.denied)
    ? envelopeRaw.denied.map(String)
    : ["payment", "credential", "otp", "captcha", "destructive"];

  const spec: WorkflowSpecV2 = {
    schemaVersion: 2,
    jobId,
    version,
    objective,
    caseMode: (caseMode as WorkflowSpecV2["caseMode"]) || "singleton",
    inScope: Array.isArray(draft.inScope) ? draft.inScope.map(String) : [],
    outOfScope: Array.isArray(draft.outOfScope) ? draft.outOfScope.map(String) : [],
    inputs: Array.isArray(draft.inputs)
      ? draft.inputs.filter(isObject).map((input) => ({
          id: String(input.id ?? ""),
          schema: isObject(input.schema) ? input.schema : {},
          required: Boolean(input.required),
        }))
      : [],
    templates,
    completionOracle: (isObject(completion) && completion.kind === "aggregate"
      ? (completion as unknown as AggregateOracle)
      : { kind: "aggregate", rules: [{ type: "operator_stop" }] }),
    stopPolicies: Array.isArray(draft.stopPolicies)
      ? (draft.stopPolicies as WorkflowSpecV2["stopPolicies"])
      : [{ type: "aggregate_complete" }, { type: "operator_stop" }],
    budgets: isObject(draft.budgets)
      ? {
          maxTurnsPerAttempt: Number(draft.budgets.maxTurnsPerAttempt ?? 16),
          maxSiteActionsPerAttempt: Number(draft.budgets.maxSiteActionsPerAttempt ?? 40),
          maxElapsedMsPerAttempt: Number(draft.budgets.maxElapsedMsPerAttempt ?? 600_000),
          maxCostUsd: draft.budgets.maxCostUsd !== undefined ? Number(draft.budgets.maxCostUsd) : undefined,
          maxSiteActionsPerHour:
            draft.budgets.maxSiteActionsPerHour !== undefined
              ? Number(draft.budgets.maxSiteActionsPerHour)
              : undefined,
        }
      : {
          maxTurnsPerAttempt: 16,
          maxSiteActionsPerAttempt: 40,
          maxElapsedMsPerAttempt: 600_000,
        },
    pacing: isObject(draft.pacing)
      ? {
          minCooldownMs: Number(draft.pacing.minCooldownMs ?? 1000),
          maxCooldownMs: Number(draft.pacing.maxCooldownMs ?? 60_000),
          circuitBreakerAfter: Number(draft.pacing.circuitBreakerAfter ?? 3),
        }
      : { minCooldownMs: 1000, maxCooldownMs: 60_000, circuitBreakerAfter: 3 },
    challengePolicy: isObject(draft.challengePolicy)
      ? {
          highConfidenceThreshold: Number(draft.challengePolicy.highConfidenceThreshold ?? 0.8),
          openBreakerOnChallenge: draft.challengePolicy.openBreakerOnChallenge !== false,
        }
      : { highConfidenceThreshold: 0.8, openBreakerOnChallenge: true },
    effectEnvelope: {
      allowed: Array.isArray(envelopeRaw.allowed)
        ? envelopeRaw.allowed.filter(isObject).map((row) => ({
            effect: String(row.effect ?? ""),
            hosts: Array.isArray(row.hosts) ? row.hosts.map(String) : undefined,
            limits: isObject(row.limits) ? (row.limits as Record<string, number>) : undefined,
          }))
        : [],
      denied,
      grants: grants.filter(isObject).map((g) => ({
        id: String(g.id ?? ""),
        host: String(g.host ?? ""),
        effect: String(g.effect ?? ""),
        maxCount: Number(g.maxCount ?? 1),
        controlName: typeof g.controlName === "string" ? g.controlName : undefined,
        expiresAt: typeof g.expiresAt === "string" ? g.expiresAt : undefined,
      })),
      neverPreapprove: REQUIRED_NEVER_PREAPPROVE.slice() as NondelegableCategory[],
    },
    revisionPolicy: isObject(draft.revisionPolicy)
      ? { requireMigrationPlan: draft.revisionPolicy.requireMigrationPlan !== false }
      : { requireMigrationPlan: true },
  };

  if (mode === "strict") {
    const again: SpecDiagnostic[] = [];
    // re-validate built spec quickly
    if (spec.effectEnvelope.grants.some((g) => g.host === "*")) {
      again.push(diag("wildcard_grant_forbidden", 'host:"*" not allowed'));
    }
    if (again.length) return { ok: false, diagnostics: again };
  }

  const canonicalBytes = canonicalize(spec);
  return { ok: true, spec, canonicalBytes };
}

export function assertCompile(draft: unknown): { spec: WorkflowSpecV2; canonicalBytes: string } {
  const result = compileWorkflowSpec(draft, "strict");
  if (!result.ok) {
    throw new DomainError("spec_not_ready", result.diagnostics.map((d) => d.message).join("; "), {
      diagnostics: result.diagnostics,
    });
  }
  return { spec: result.spec, canonicalBytes: result.canonicalBytes };
}
