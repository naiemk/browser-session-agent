import type { AggregateOracle, JsonSchema } from "./spec-types.ts";
import type { Case } from "./types.ts";

export interface ArtifactManifest {
  artifactId: string;
  contentHash: string;
  schema?: JsonSchema;
  count?: number;
}

export interface DurableSnapshot {
  cases: readonly Case[];
  acceptedOutputs: readonly unknown[];
  artifacts: readonly ArtifactManifest[];
  operatorStop?: boolean;
  nowIso: string;
}

export interface OracleResult {
  passed: boolean;
  unmet: string[];
}

function schemaLooksSatisfied(value: unknown, schema: JsonSchema | undefined): boolean {
  if (!schema) return true;
  if (schema.type === "object") return Boolean(value) && typeof value === "object";
  if (schema.type === "array") return Array.isArray(value);
  return value !== undefined && value !== null;
}

/** SPEC-03 / QUALITY-03 — aggregate completion over durable evidence only. */
export function evaluateAggregateOracle(oracle: AggregateOracle, snap: DurableSnapshot): OracleResult {
  const unmet: string[] = [];
  for (const rule of oracle.rules) {
    if (rule.type === "operator_stop") {
      if (!snap.operatorStop) unmet.push("operator_stop");
      continue;
    }
    if (rule.type === "deadline") {
      if (snap.nowIso > rule.iso) unmet.push(`deadline:${rule.iso}`);
      continue;
    }
    if (rule.type === "case_count") {
      const cases = rule.stage
        ? snap.cases.filter((c) => c.stage === rule.stage)
        : snap.cases;
      if (rule.min !== undefined && cases.length < rule.min) unmet.push(`case_count.min:${rule.min}`);
      if (rule.max !== undefined && cases.length > rule.max) unmet.push(`case_count.max:${rule.max}`);
      continue;
    }
    if (rule.type === "accepted_outputs") {
      const ok = snap.acceptedOutputs.filter((row) => schemaLooksSatisfied(row, rule.schema));
      if (ok.length < rule.min) unmet.push(`accepted_outputs.min:${rule.min}`);
      continue;
    }
    if (rule.type === "artifact_schema") {
      const art = snap.artifacts.find((a) => a.artifactId === rule.artifactId);
      if (!art) unmet.push(`artifact_missing:${rule.artifactId}`);
      else if (art.schema && JSON.stringify(art.schema) !== JSON.stringify(rule.schema)) {
        unmet.push(`artifact_schema_drift:${rule.artifactId}`);
      } else if (!schemaLooksSatisfied({ hash: art.contentHash }, rule.schema)) {
        unmet.push(`artifact_schema:${rule.artifactId}`);
      }
    }
  }
  return { passed: unmet.length === 0, unmet };
}

/** QUALITY-01 — validate output against template schema before case advance. */
export function validateOutputSchema(value: unknown, schema: JsonSchema | undefined): OracleResult {
  if (!schema) return { passed: true, unmet: [] };
  if (!schemaLooksSatisfied(value, schema)) {
    return { passed: false, unmet: ["output_schema"] };
  }
  return { passed: true, unmet: [] };
}

/** QUALITY-02 — detect artifact manifest drift. */
export function detectArtifactDrift(
  expected: readonly ArtifactManifest[],
  actual: readonly ArtifactManifest[],
): string[] {
  const unmet: string[] = [];
  for (const exp of expected) {
    const found = actual.find((a) => a.artifactId === exp.artifactId);
    if (!found) unmet.push(`missing:${exp.artifactId}`);
    else if (found.contentHash !== exp.contentHash) unmet.push(`hash_drift:${exp.artifactId}`);
    else if (exp.count !== undefined && found.count !== exp.count) unmet.push(`count_drift:${exp.artifactId}`);
  }
  return unmet;
}
