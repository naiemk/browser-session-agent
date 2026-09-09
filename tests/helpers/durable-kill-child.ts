/**
 * Child process for CAMPAIGN-04-T03 kill matrix.
 *
 * Env:
 *   BSA_KILL_ROOT — workspace root with durable/control.sqlite
 *   BSA_KILL_STAGE — before_model | between_acts | after_effect | before_commit
 *   BSA_KILL_MARKER — file written when the stage is reached (parent kills after)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { FakeKernel } from "../../src/durable/ports/execution-kernel.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { newId } from "../../src/durable/application/planning.ts";

const root = process.env.BSA_KILL_ROOT;
const stage = process.env.BSA_KILL_STAGE ?? "before_model";
const marker = process.env.BSA_KILL_MARKER;
if (!root || !marker) {
  process.stderr.write("BSA_KILL_ROOT and BSA_KILL_MARKER required\n");
  process.exit(2);
}

mkdirSync(path.join(root, "durable"), { recursive: true });
const repo = SqliteJobRepository.open(path.join(root, "durable", "control.sqlite"));

function draft(jobId: string) {
  return {
    jobId,
    version: 1,
    objective: "kill-matrix",
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective: "run",
        oracle: { kind: "operation" },
        outputSchema: { type: "object" },
      },
    ],
    completionOracle: { kind: "aggregate", rules: [{ type: "operator_stop" }] },
    effectEnvelope: {
      allowed: [],
      denied: ["payment", "credential", "otp", "captcha", "destructive"],
      grants: [],
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
    },
  };
}

function reach(label: string): void {
  writeFileSync(marker, `${label}\n${process.pid}\n`);
  // Park until killed or parent advances (long sleep).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120_000);
}

const hangKernel = new FakeKernel(async () => {
  if (stage === "before_model") reach("before_model");
  if (stage === "between_acts") {
    writeFileSync(marker, `between_acts_start\n${process.pid}\n`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    reach("between_acts");
  }
  if (stage === "after_effect") {
    // Simulate effect dispatch then hang before returning completed.
    reach("after_effect");
  }
  if (stage === "before_commit") {
    reach("before_commit");
  }
  return { status: "completed", value: { ok: true }, evidenceIds: ["ev"] };
});

const host = {
  available: true,
  profileKey: "kill-profile",
  nowIso: () => new Date().toISOString(),
  kernel: hangKernel,
};

const service = new JobApplicationService(repo, () => host);

const job = await service.create({ objective: "kill-matrix", title: "Kill" });
const proposed = await service.propose(job.jobId, draft(job.jobId));
await service.approve(job.jobId, proposed.hash!);

if (stage === "before_model") {
  // Claim path is inside tick; hang in kernel before "model" work.
  await service.tick(job.jobId);
} else if (stage === "between_acts" || stage === "after_effect" || stage === "before_commit") {
  await service.tick(job.jobId);
} else {
  // Unknown stage: still claim once for inspection.
  const items = await repo.listWorkItems(job.jobId);
  const item = items[0]!;
  await repo.claimWork({
    workItemId: item.id,
    attemptId: newId("att"),
    fenceToken: newId("fence"),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    nowIso: new Date().toISOString(),
  });
  reach(stage);
}

repo.close();
process.exit(0);
