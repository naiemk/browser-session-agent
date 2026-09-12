import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { DirectKernel } from "../../src/durable/ports/execution-kernel.ts";
import {
  createProductExecutionHost,
  outcomeFromRun,
  runDurableAttempt,
} from "../../src/durable/infrastructure/product-host.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { createMockModel } from "../../src/runtime/mock-model.ts";
import { TOOL_DONE, TOOL_OBSERVE } from "../../src/runtime/names.ts";
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

describe("CAMPAIGN-R2-1 product ExecutionHost", () => {
  it("createProductExecutionHost returns null without worker or stream", () => {
    assert.equal(
      createProductExecutionHost({ profileKey: "x", stream: createMockModel({ script: [] }) }),
      null,
    );
    assert.equal(
      createProductExecutionHost({
        profileKey: "x",
        worker: {} as never,
      }),
      null,
    );
    const stub = {} as never;
    assert.ok(
      createProductExecutionHost({
        profileKey: "hosted-rpc",
        browser: stub,
        stream: createMockModel({ script: [] }),
      }),
    );
  });

  it("maps parked challenge and model errors onto OperationOutcome", () => {
    const challenge = outcomeFromRun(
      {
        parked: {
          status: "parked",
          reason: "challenge captcha",
          wake: "human",
          perishable: true,
          payload: { host: "example.com", url: "https://example.com/c" },
        },
        turns: 1,
        capped: false,
        tokens: 0,
        costUsd: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
          totalTokens: 0,
        },
        modelErrors: [],
        toolCalls: 0,
      },
      "try page",
    );
    assert.equal(challenge.status, "blocked");
    if (challenge.status === "blocked") {
      assert.equal(challenge.block.kind, "challenge");
    }

    const failed = outcomeFromRun(
      {
        turns: 1,
        capped: false,
        tokens: 0,
        costUsd: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
          totalTokens: 0,
        },
        modelErrors: ["provider 429"],
        toolCalls: 0,
        error: "boom",
      },
      "try page",
    );
    assert.equal(failed.status, "failed");
  });

  it("runs a due attempt through DirectKernel + runDurableAttempt with a behavioral mock", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-r21-"));
    const server = new FixtureServer();
    const origin = await server.start();
    const browser = await LocalBrowser.launch({ headless: true });
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    try {
      const tab = await browser.openTab(`${origin}/apply`);
      const stream = createMockModel({
        plan: [
          { tool: TOOL_OBSERVE },
          {
            tool: TOOL_DONE,
            args: { status: "success", summary: "Saw the apply form" },
          },
        ],
      });
      const host = {
        available: true,
        profileKey: "fixture-profile",
        nowIso: () => new Date().toISOString(),
        kernel: new DirectKernel(async (compiled) =>
          runDurableAttempt({
            compiled,
            browser,
            stream,
            tabId: tab,
            evidence: memoryEvidence(),
            policy: "auto",
            root: dir,
          }),
        ),
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
});
