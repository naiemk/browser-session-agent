import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalize,
  compileWorkflowSpec,
  assertCompile,
  REQUIRED_NEVER_PREAPPROVE,
  evaluateAggregateOracle,
} from "../../src/durable/domain/index.ts";
import { hashCanonicalBytes, proposeStrict, draftFeedback } from "../../src/durable/application/planning.ts";

function baseDraft(over: Record<string, unknown> = {}) {
  return {
    jobId: "job_x",
    version: 1,
    objective: "demo",
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective: "start",
        oracle: { kind: "operation", predicates: [{ kind: "text_visible", text: "ok" }] },
      },
    ],
    completionOracle: { kind: "aggregate", rules: [{ type: "operator_stop" }] },
    effectEnvelope: {
      allowed: [],
      denied: ["payment", "credential", "otp", "captcha", "destructive"],
      grants: [],
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
    },
    ...over,
  };
}

describe("CAMPAIGN-01-T02 spec compiler", () => {
  it("round-trips hash on canonical bytes", () => {
    const a = assertCompile(baseDraft());
    const b = assertCompile(JSON.parse(a.canonicalBytes));
    assert.equal(hashCanonicalBytes(a.canonicalBytes), hashCanonicalBytes(b.canonicalBytes));
    assert.equal(canonicalize(a.spec), a.canonicalBytes);
  });

  it("rejects wildcard grants and missing neverPreapprove in strict mode", () => {
    const bad = compileWorkflowSpec(
      baseDraft({
        effectEnvelope: {
          allowed: [],
          denied: [],
          grants: [{ id: "g", host: "*", effect: "outbound", maxCount: 1 }],
          neverPreapprove: ["destructive"],
        },
      }),
      "strict",
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.ok(bad.diagnostics.some((d) => d.code === "wildcard_grant_forbidden"));
      assert.ok(bad.diagnostics.some((d) => d.code === "missing_neverPreapprove"));
    }
  });

  it("requires seed for discovered mode and same-scope deps", () => {
    const missingSeed = compileWorkflowSpec(
      baseDraft({
        caseMode: "discovered",
        templates: [
          {
            id: "discover",
            scope: "job",
            discoverable: true,
            objective: "find",
            oracle: { kind: "operation" },
          },
        ],
      }),
      "strict",
    );
    assert.equal(missingSeed.ok, false);

    const cross = compileWorkflowSpec(
      baseDraft({
        templates: [
          { id: "jobA", scope: "job", objective: "a", oracle: { kind: "operation" } },
          {
            id: "caseB",
            scope: "case",
            objective: "b",
            oracle: { kind: "operation" },
            dependencies: ["jobA"],
          },
        ],
      }),
      "strict",
    );
    assert.equal(cross.ok, false);
  });

  it("keeps draft feedback lenient while propose is strict", () => {
    const incomplete = {
      ...baseDraft(),
      effectEnvelope: { allowed: [], denied: [], grants: [], neverPreapprove: [] as string[] },
    };
    const draft = draftFeedback(incomplete);
    assert.equal(draft.ok, true); // SPEC-07: lenient may still produce a draft view
    assert.throws(() => proposeStrict(incomplete));
  });

  it("aggregate oracle does not use browser facts", () => {
    const result = evaluateAggregateOracle(
      { kind: "aggregate", rules: [{ type: "accepted_outputs", min: 2, schema: { type: "object" } }] },
      {
        cases: [],
        acceptedOutputs: [{ a: 1 }],
        artifacts: [],
        nowIso: "2026-01-01T00:00:00.000Z",
      },
    );
    assert.equal(result.passed, false);
  });
});
