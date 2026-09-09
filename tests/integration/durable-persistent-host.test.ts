import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { DirectKernel } from "../../src/durable/ports/execution-kernel.ts";
import { ProfileEpochGuard } from "../../src/durable/infrastructure/persistent-host.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

function draft(jobId: string) {
  return {
    jobId,
    version: 1,
    objective: "persistent",
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective: "open page",
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

describe("CAMPAIGN-02-T04 persistent execution host", () => {
  it("runs a due attempt through a real local BrowserPort (persistent-profile contract stand-in)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-l5-"));
    const server = new FixtureServer();
    const origin = await server.start();
    const browser = await LocalBrowser.launch({ headless: true });
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    try {
      const host = {
        available: true,
        profileKey: "fixture-profile",
        nowIso: () => new Date().toISOString(),
        kernel: new DirectKernel(async () => {
          const tab = await browser.openTab(`${origin}/apply`);
          const facts = await browser.facts(tab);
          assert.match(facts.text ?? "", /Ada|application|Thanks|name/i);
          return { status: "completed", value: { ok: true, tab }, evidenceIds: ["ev1"] };
        }),
      };
      const service = new JobApplicationService(repo, () => host);
      const job = await service.create({ objective: "persistent" });
      const proposed = await service.propose(job.jobId, draft(job.jobId));
      await service.approve(job.jobId, proposed.hash!);
      const tick = await service.tick(job.jobId);
      assert.ok(tick.status === "worked" || tick.status === "complete", tick.status);
    } finally {
      await browser.close();
      await server.stop();
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects stale tab refs after a profile reconnect epoch bump", () => {
    const guard = new ProfileEpochGuard();
    guard.registerTab("tab_a");
    guard.assertFresh("tab_a");
    guard.bump(); // control process restart / CDP reattach
    assert.throws(() => guard.assertFresh("tab_a"), /stale_tab_ref/);
    guard.registerTab("tab_b");
    guard.assertFresh("tab_b");
  });
});
