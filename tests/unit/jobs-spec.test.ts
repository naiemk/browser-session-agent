import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { emptySpec, mergeSpec, readinessIssues, specHash } from "../../src/jobs/spec.ts";
import { FakeClock } from "../../src/core/clock.ts";

describe("job spec readiness", () => {
  it("rejects incomplete drafts and hashes only content", async () => {
    const clock = new FakeClock();
    const draft = emptySpec("job_1", "Apply to roles", clock);
    assert.ok(readinessIssues(draft).length > 0);
    const ready = mergeSpec(
      draft,
      {
        inScope: ["fixture"],
        outOfScope: ["prod"],
        completionCriteria: [{ kind: "text_visible", text: "Thanks" }],
        templates: [
          {
            id: "apply",
            objective: "Apply",
            criteria: [{ kind: "text_visible", text: "Thanks" }],
          },
        ],
        stopConditions: ["done"],
        questions: [{ id: "q1", text: "CV path?", required: true, answer: "/tmp/cv.pdf" }],
      },
      clock,
    );
    assert.deepEqual(readinessIssues(ready), []);
    const left = specHash(ready);
    const right = specHash({ ...ready, status: "proposed", updatedAt: "later" });
    assert.equal(left, right);
  });

  it("keeps grant classes through redacted spec writes", async () => {
    const clock = new FakeClock();
    const draft = emptySpec("job_2", "Send", clock);
    const ready = mergeSpec(
      draft,
      {
        inScope: ["fixture"],
        outOfScope: ["prod"],
        completionCriteria: [{ kind: "text_visible", text: "Thanks" }],
        templates: [
          {
            id: "send",
            objective: "Send",
            criteria: [{ kind: "text_visible", text: "Thanks" }],
          },
        ],
        stopConditions: ["done"],
        approvalEnvelope: {
          neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
          grants: [{ id: "send-once", host: "*", gateClass: "outbound", controlName: "Send invitation", maxCount: 1 }],
        },
      },
      clock,
    );
    const dir = await mkdtemp(path.join(os.tmpdir(), "job-spec-"));
    try {
      const { writeSpecFiles } = await import("../../src/jobs/spec.ts");
      const { readJsonFile } = await import("../../src/core/atomic.ts");
      await writeSpecFiles(dir, ready);
      const stored = await readJsonFile<typeof ready>(path.join(dir, "1.json"));
      assert.equal(stored?.approvalEnvelope.grants[0]?.gateClass, "outbound");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
