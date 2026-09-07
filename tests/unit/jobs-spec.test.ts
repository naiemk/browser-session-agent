import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { emptySpec, mergeSpec, normalizeSpec, planConfirmMessage, readinessIssues, specHash } from "../../src/jobs/spec.ts";
import { FakeClock } from "../../src/core/clock.ts";
import type { SpecRecord } from "../../src/jobs/types.ts";

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

  it("does not throw when arrays or template.criteria are missing", () => {
    const wrecked = { jobId: "job_x", objective: "Apply" } as SpecRecord;
    const issues = readinessIssues(wrecked);
    assert.ok(issues.some((issue) => issue.code === "in_scope"));
    assert.ok(issues.some((issue) => issue.code === "templates"));
    const missingCriteria = {
      ...emptySpec("job_x", "Apply", new FakeClock()),
      inScope: ["x"],
      templates: [{ id: "apply", objective: "Apply" }],
    } as SpecRecord;
    const templateIssues = readinessIssues(missingCriteria);
    assert.ok(templateIssues.some((issue) => issue.code === "template_criteria"));
    assert.ok(templateIssues.every((issue) => typeof issue.message === "string"));
  });

  it("aliases successCriteria and string grants so a messy planner draft can propose", () => {
    const clock = new FakeClock();
    const ready = mergeSpec(
      emptySpec("job_3", "Apply for YC jobs", clock),
      {
        inScope: "YC Work at a Startup",
        outOfScope: ["non-YC"],
        completionCriteria: "operator said stop",
        stopConditions: ["stop"],
        templates: [
          {
            id: "apply-to-role",
            objective: "Apply to one role",
            successCriteria: [{ kind: "text_visible", text: "Application submitted" }],
            discoverable: true,
          },
        ],
        approvalEnvelope: {
          neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
          grants: ["submit-job-application"],
        },
      },
      clock,
    );
    assert.deepEqual(readinessIssues(ready), []);
    assert.equal(ready.templates[0]?.criteria[0]?.kind, "text_visible");
    assert.equal(ready.approvalEnvelope.grants[0]?.gateClass, "outbound");
    assert.equal(ready.approvalEnvelope.grants[0]?.id, "submit-job-application");
    assert.deepEqual(ready.inScope, ["YC Work at a Startup"]);
  });

  it("remaps grant authorization to gateClass before redaction can eat it", async () => {
    const clock = new FakeClock();
    const ready = mergeSpec(
      emptySpec("job_4", "Send", clock),
      {
        inScope: ["fixture"],
        outOfScope: ["prod"],
        completionCriteria: [{ kind: "text_visible", text: "Thanks" }],
        templates: [{ id: "send", objective: "Send", criteria: [{ kind: "text_visible", text: "Thanks" }] }],
        stopConditions: ["done"],
        approvalEnvelope: {
          neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
          grants: [{ id: "send-once", host: "*", authorization: "outbound", maxCount: 1 }],
        },
      },
      clock,
    );
    assert.equal(ready.approvalEnvelope.grants[0]?.gateClass, "outbound");
    assert.equal("authorization" in (ready.approvalEnvelope.grants[0] ?? {}), false);
    const dir = await mkdtemp(path.join(os.tmpdir(), "job-spec-auth-"));
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

  it("normalizeSpec is idempotent on a canonical draft", () => {
    const clock = new FakeClock();
    const ready = mergeSpec(
      emptySpec("job_5", "Apply", clock),
      {
        inScope: ["fixture"],
        outOfScope: ["prod"],
        completionCriteria: [{ kind: "text_visible", text: "Thanks" }],
        templates: [{ id: "apply", objective: "Apply", criteria: [{ kind: "text_visible", text: "Thanks" }] }],
        stopConditions: ["done"],
      },
      clock,
    );
    assert.deepEqual(normalizeSpec(ready), ready);
  });

  it("summarizes a plan for a yes/no confirm without hashes or commands", () => {
    const clock = new FakeClock();
    const ready = mergeSpec(
      emptySpec("job_6", "Apply for YC jobs", clock),
      {
        inScope: ["YC listings"],
        outOfScope: ["non-YC"],
        completionCriteria: [{ kind: "text_visible", text: "stop" }],
        templates: [{ id: "apply", objective: "Apply", criteria: [{ kind: "text_visible", text: "Thanks" }] }],
        stopConditions: ["you say stop"],
        approvalEnvelope: {
          neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
          grants: [{ id: "submit-once", host: "*", gateClass: "outbound", maxCount: 1, controlName: "Submit" }],
        },
      },
      clock,
    );
    const summary = planConfirmMessage(ready);
    assert.match(summary, /Apply for YC jobs/);
    assert.match(summary, /Submit/);
    assert.doesNotMatch(summary, /hash|job_|\/job-/i);
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

  it("proposePlan recovers a disk draft that used successCriteria", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "job-propose-"));
    try {
      const { JobService } = await import("../../src/jobs/service.ts");
      const service = new JobService({ root });
      const store = await service.create("Apply for YC jobs");
      const draft = await store.draftSpec();
      await store.writeSpec({
        ...draft,
        inScope: ["YC listings"],
        outOfScope: ["non-YC"],
        completionCriteria: [{ kind: "text_visible", text: "operator said stop" }],
        stopConditions: ["stop"],
        templates: [
          {
            id: "apply-to-role",
            objective: "Apply to one role",
            successCriteria: [{ kind: "text_visible", text: "Application submitted" }],
          },
        ],
      } as SpecRecord);
      const proposed = await service.proposePlan(store.jobId);
      assert.ok(proposed.hash);
      assert.equal(proposed.status, "proposed");
      assert.equal(proposed.templates[0]?.criteria[0]?.kind, "text_visible");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
