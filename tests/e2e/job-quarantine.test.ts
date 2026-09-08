import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { main } from "../../src/cli/main.ts";
import { CoreError } from "../../src/core/types.ts";
import { userFacingJobResume } from "../../src/host/pi-jobs.ts";
import { JobService } from "../../src/jobs/service.ts";
import {
  applyTemplate,
  outboundGrant,
  readyPatch,
  removeRoot,
  seedApproved,
  tempRoot,
} from "../helpers/job-harness.ts";

async function captureMain(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const writeOut = process.stdout.write.bind(process.stdout);
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await main(argv);
    return { code, out: out.join(""), err: err.join("") };
  } finally {
    process.stdout.write = writeOut;
    process.stderr.write = writeErr;
  }
}

describe("CAMPAIGN-00-T01 prototype quarantine", () => {
  let root = "";

  afterEach(async () => {
    if (root) await removeRoot(root);
    root = "";
  });

  it("returns runtime_unavailable (not idle) when eligible work has no host", async () => {
    root = await tempRoot("bsa-quarantine-");
    const service = new JobService({ root });
    const store = await seedApproved(
      service,
      "needs host",
      readyPatch({
        objective: "needs host",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
    );
    const result = await service.tick({ jobId: store.jobId });
    assert.equal(result.status, "runtime_unavailable");
    assert.match(result.detail ?? "", /no model\/browser host/i);
    assert.notEqual(result.status, "idle");
  });

  it("CLI tick exits 4 for runtime_unavailable", async () => {
    root = await tempRoot("bsa-quarantine-cli-");
    const service = new JobService({ root });
    const store = await seedApproved(
      service,
      "cli host",
      readyPatch({
        objective: "cli host",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
    );
    const ticked = await captureMain(["job", "tick", store.jobId, "--root", root, "--json"]);
    assert.equal(ticked.code, 4);
    assert.match(ticked.out, /runtime_unavailable/);
    assert.match(ticked.err, /not idle/i);
  });

  it("strips prototype grants unless BSA_JOB_PROTOTYPE_DEV=1", async () => {
    root = await tempRoot("bsa-quarantine-grants-");
    const service = new JobService({ root });
    const store = await seedApproved(
      service,
      "grants",
      readyPatch({
        objective: "grants",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
        grants: [outboundGrant("Submit")],
      }),
    );
    const { buildPrototypeGateGrants } = await import("../../src/jobs/runner.ts");
    const spec = (await store.approvedSpec())!;
    const scheduler = await store.readScheduler();
    const prev = process.env.BSA_JOB_PROTOTYPE_DEV;
    delete process.env.BSA_JOB_PROTOTYPE_DEV;
    try {
      assert.deepEqual(buildPrototypeGateGrants(spec, scheduler), []);
      process.env.BSA_JOB_PROTOTYPE_DEV = "1";
      const enabled = buildPrototypeGateGrants(spec, scheduler);
      assert.equal(enabled.length, 1);
      assert.equal(enabled[0]?.id, "outbound");
    } finally {
      if (prev === undefined) delete process.env.BSA_JOB_PROTOTYPE_DEV;
      else process.env.BSA_JOB_PROTOTYPE_DEV = prev;
    }
  });

  it("rejects revision after work materialization", async () => {
    root = await tempRoot("bsa-quarantine-rev-");
    const service = new JobService({ root });
    const store = await seedApproved(
      service,
      "revise blocked",
      readyPatch({
        objective: "revise blocked",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
    );
    await assert.rejects(() => service.revise(store.jobId), (err: unknown) => {
      assert.ok(err instanceof CoreError);
      assert.equal(err.code, "revision_blocked");
      assert.match(err.message, /create a new job/i);
      return true;
    });
  });

  it("requires --allow-ephemeral for job run", async () => {
    root = await tempRoot("bsa-quarantine-run-");
    const denied = await captureMain(["job", "run", "job_x", "--root", root]);
    assert.equal(denied.code, 2);
    assert.match(denied.err, /allow-ephemeral/);
    assert.match(denied.err, /ephemeral/i);
  });

  it("HELP labels jobs experimental and does not claim cron safety", async () => {
    const help = await captureMain([]);
    assert.match(help.out + help.err, /EXPERIMENTAL/i);
    assert.doesNotMatch(help.out + help.err, /safe for cron/i);
  });

  it("Pi-facing copy does not claim scheduled execution without a host", () => {
    const active = userFacingJobResume("Demo", "active");
    assert.match(active, /no attached execution host|experimental/i);
    assert.doesNotMatch(active, /scheduled step|scheduler tick/i);
  });
});
