import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { createProductExecutionHost } from "../../src/durable/infrastructure/product-host.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { createMockModel } from "../../src/runtime/mock-model.ts";
import { TOOL_DONE, TOOL_OBSERVE } from "../../src/runtime/names.ts";
import { RpcBrowserPort, dispatchPortRpc } from "../../src/hosts/shared/port-rpc.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

function draft(jobId: string, objective = "open apply page") {
  return {
    jobId,
    version: 1,
    objective,
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective,
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

describe("CAMPAIGN-R2-E2 hosted RPC ExecutionHost (L2)", () => {
  it("ticks a due attempt through JSON RpcBrowserPort + behavioral mock", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-r2e2-"));
    const server = new FixtureServer();
    const origin = await server.start();
    const real = await LocalBrowser.launch({ headless: true });
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    try {
      const remote = new RpcBrowserPort({
        async call(method, args) {
          const outcome = await dispatchPortRpc(real, method, JSON.parse(JSON.stringify(args)));
          if (!outcome.handled) throw new Error(`no dispatcher for ${method}`);
          return JSON.parse(JSON.stringify(outcome.result ?? null));
        },
      });
      const tab = await remote.openTab(`${origin}/apply`);
      const stream = createMockModel({
        plan: [
          { tool: TOOL_OBSERVE, args: { tabId: tab } },
          {
            tool: TOOL_DONE,
            args: { status: "success", summary: "Saw the apply form over RPC" },
          },
        ],
      });
      const host = createProductExecutionHost({
        browser: remote,
        stream,
        profileKey: "hosted-rpc",
        evidence: memoryEvidence(),
        policy: "auto",
        root: dir,
      });
      assert.ok(host);
      const service = new JobApplicationService(repo, () => host);
      const job = await service.create({ objective: "rpc twin" });
      const proposed = await service.propose(job.jobId, draft(job.jobId));
      await service.approve(job.jobId, proposed.hash!);
      const tick = await service.tick(job.jobId);
      assert.ok(tick.status === "worked" || tick.status === "complete", tick.status);
      assert.notEqual(tick.status, "runtime_unavailable");
    } finally {
      await real.close();
      await server.stop();
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
