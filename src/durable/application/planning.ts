import { createHash, randomUUID } from "node:crypto";
import { compileWorkflowSpec, assertCompile } from "../domain/spec-compiler.ts";
import type { SpecCompileResult, WorkflowSpecV2 } from "../domain/spec-types.ts";

export function hashCanonicalBytes(canonicalBytes: string): string {
  return createHash("sha256").update(canonicalBytes, "utf8").digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** SPEC-07 — lenient draft diagnostics for planner feedback. */
export function draftFeedback(draft: unknown): SpecCompileResult {
  return compileWorkflowSpec(draft, "lenient");
}

/** SPEC-07 — strict propose/approve. */
export function proposeStrict(draft: unknown): { spec: WorkflowSpecV2; canonicalBytes: string; hash: string } {
  const { spec, canonicalBytes } = assertCompile(draft);
  return { spec, canonicalBytes, hash: hashCanonicalBytes(canonicalBytes) };
}
