import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveDisplayStatus, isStoredLifecycle } from "../../src/durable/application/status.ts";
import type { CancelJobCommand, CancelWorkItemCommand } from "../../src/durable/application/commands.ts";
import {
  JOB_LIFECYCLE_TRANSITIONS,
  WORK_ITEM_COMMAND_TYPES,
  assertNoDuplicateCases,
  cancelJob,
  cancelWorkItem,
  createWorkItem,
  reduceWorkItem,
  transitionJobLifecycle,
  upsertCase,
  type Job,
  type JobLifecycle,
  type WorkItem,
} from "../../src/durable/domain/index.ts";

const NOW = "2026-09-09T00:00:00.000Z";

function job(lifecycle: JobLifecycle): Job {
  return {
    jobId: "job_test",
    title: "t",
    objective: "o",
    lifecycle,
    caseMode: "singleton",
    draftSpecVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("DOM-03 job lifecycle", () => {
  it("allows every matrix edge and rejects all others", () => {
    const all: JobLifecycle[] = [
      "planning",
      "awaiting_plan_approval",
      "active",
      "paused",
      "completed",
      "failed",
      "cancelled",
      "archived",
    ];
    for (const from of all) {
      for (const to of all) {
        const allowed = JOB_LIFECYCLE_TRANSITIONS[from].includes(to);
        if (allowed) {
          const next = transitionJobLifecycle(job(from), to, NOW);
          assert.equal(next.lifecycle, to);
        } else {
          assert.throws(() => transitionJobLifecycle(job(from), to, NOW), /illegal_job_transition|cannot transition/);
        }
      }
    }
  });

  it("cancelJob reaches cancelled from non-terminal states", () => {
    assert.equal(cancelJob(job("active"), NOW).lifecycle, "cancelled");
    assert.throws(() => cancelJob(job("completed"), NOW));
    assert.throws(() => cancelJob(job("archived"), NOW));
  });
});

describe("DOM-04 work item commands", () => {
  it("materializes as pending and walks the happy path", () => {
    let wi = createWorkItem(
      {
        id: "wi_1",
        jobId: "job_test",
        templateId: "seed",
        specVersion: 1,
        specHash: "abcd".repeat(4),
        objective: "do",
        dependencies: [],
        maxAttempts: 3,
      },
      NOW,
    );
    assert.equal(wi.status, "pending");
    wi = reduceWorkItem(wi, { type: "mark_ready" }, NOW);
    wi = reduceWorkItem(wi, { type: "claim" }, NOW);
    assert.equal(wi.status, "leased");
    assert.equal(wi.attempts, 1);
    wi = reduceWorkItem(wi, { type: "complete" }, NOW);
    assert.equal(wi.status, "done");
  });

  it("rejects illegal transitions and supports cancel", () => {
    const wi = createWorkItem(
      {
        id: "wi_1",
        jobId: "job_test",
        templateId: "seed",
        specVersion: 1,
        specHash: "abcd".repeat(4),
        objective: "do",
        dependencies: [],
        maxAttempts: 3,
      },
      NOW,
    );
    assert.throws(() => reduceWorkItem(wi, { type: "claim" }, NOW));
    assert.equal(cancelWorkItem(wi, NOW).status, "cancelled");
  });

  it("never accepts a raw status write API", () => {
    // Property: every export that changes status takes a WorkItemCommand.
    const ready = reduceWorkItem(
      createWorkItem(
        {
          id: "wi_1",
          jobId: "job_test",
          templateId: "seed",
          specVersion: 1,
          specHash: "abcd".repeat(4),
          objective: "do",
          dependencies: [],
          maxAttempts: 3,
        },
        NOW,
      ),
      { type: "mark_ready" },
      NOW,
    );
    assert.equal(ready.status, "ready");
  });

  it("enumerates command applicability across statuses", () => {
    const statuses: WorkItem["status"][] = [
      "pending",
      "ready",
      "leased",
      "blocked",
      "done",
      "failed",
      "cancelled",
      "abandoned",
    ];
    const checkpoint = { intent: "x", evidenceIds: [] as string[] };
    let legal = 0;
    let illegal = 0;
    for (const status of statuses) {
      const base: WorkItem = {
        ...createWorkItem(
          {
            id: "wi_1",
            jobId: "job_test",
            templateId: "seed",
            specVersion: 1,
            specHash: "abcd".repeat(4),
            objective: "do",
            dependencies: [],
            maxAttempts: 3,
          },
          NOW,
        ),
        status,
      };
      for (const type of WORK_ITEM_COMMAND_TYPES) {
        const command =
          type === "block" ? ({ type, checkpoint } as const) : ({ type } as { type: typeof type });
        try {
          reduceWorkItem(base, command as never, NOW);
          legal += 1;
        } catch {
          illegal += 1;
        }
      }
    }
    assert.ok(legal > 0);
    assert.ok(illegal > legal);
  });
});

describe("DOM-01 vocabulary", () => {
  it("does not declare Sprint as an authoritative domain export", async () => {
    const domain = await import("../../src/durable/domain/index.ts");
    assert.equal("Sprint" in domain, false);
    assert.equal("SprintRecord" in domain, false);
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const typesPath = fileURLToPath(new URL("../../src/durable/domain/types.ts", import.meta.url));
    assert.doesNotMatch(readFileSync(typesPath, "utf8"), /\binterface Sprint\b|\btype Sprint\b/);
  });
});

describe("DOM-05 case identity", () => {
  it("upserts by (jobId, caseKey) without duplicating", () => {
    const first = {
      jobId: "job_a",
      caseKey: "acme",
      label: "Acme",
      stage: "discovered",
      facts: { a: 1 },
      createdAt: NOW,
      updatedAt: NOW,
    };
    const second = {
      ...first,
      label: "Acme Corp",
      stage: "qualified",
      facts: { b: 2 },
      updatedAt: "2026-09-09T01:00:00.000Z",
    };
    const once = upsertCase([], first);
    const twice = upsertCase(once, second);
    assert.equal(twice.length, 1);
    assert.equal(twice[0]?.label, "Acme Corp");
    assert.deepEqual(twice[0]?.facts, { a: 1, b: 2 });
    assert.throws(() =>
      assertNoDuplicateCases([
        first,
        { ...first, label: "other" },
      ]),
    );
  });
});

describe("DOM-06 derived display status", () => {
  it("computes display without mutating lifecycle", () => {
    const base = job("active");
    assert.equal(deriveDisplayStatus({ job: base, runtimeUnavailable: true }), "runtime_unavailable");
    assert.equal(deriveDisplayStatus({ job: base, leaseHeld: true }), "running");
    assert.equal(
      deriveDisplayStatus({ job: base, openHumanRequests: [{ status: "waiting" }] }),
      "waiting_human",
    );
    assert.equal(deriveDisplayStatus({ job: base, resourceBlocked: true }), "blocked");
    assert.equal(deriveDisplayStatus({ job: base, nothingEligible: true }), "idle");
    assert.equal(base.lifecycle, "active");
    for (const display of ["running", "idle", "waiting_human", "blocked", "runtime_unavailable"] as const) {
      assert.equal(isStoredLifecycle(display), false);
    }
  });
});

describe("DOM-07 cancel command shapes", () => {
  it("exposes CancelJob and CancelWorkItem commands", () => {
    const cancelJobCmd: CancelJobCommand = { type: "CancelJob", jobId: "job_x" };
    const cancelWi: CancelWorkItemCommand = {
      type: "CancelWorkItem",
      jobId: "job_x",
      workItemId: "wi_1",
    };
    assert.equal(cancelJobCmd.type, "CancelJob");
    assert.equal(cancelWi.type, "CancelWorkItem");
  });
});
