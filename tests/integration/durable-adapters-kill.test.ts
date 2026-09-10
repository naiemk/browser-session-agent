import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFakePi, runCommand } from "../helpers/fake-pi.ts";
import { registerDurablePiCommands, durableChatBinding } from "../../src/durable/adapters/pi.ts";
import { commandDurable } from "../../src/durable/adapters/cli.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHILD = path.join(ROOT, "tests/helpers/durable-kill-child.ts");

function draft(jobId: string) {
  return {
    jobId,
    version: 1,
    objective: "adapter",
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective: "x",
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

describe("CAMPAIGN-04-T01 FakePi + CLI adapters", () => {
  it("does not bind a durable job to a fresh chat", () => {
    assert.equal(durableChatBinding().boundJobId, undefined);
  });

  it("registers durable Pi commands that require explicit job ids", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-fakepi-"));
    await mkdir(path.join(dir, "durable"), { recursive: true });
    const pi = createFakePi();
    await pi.startSession();
    registerDurablePiCommands(pi, { root: dir });
    assert.ok(pi.commands.has("durable-status"));
    assert.ok(pi.commands.has("durable-tick"));
    assert.ok(pi.commands.has("durable-cancel"));
    await runCommand(pi, "durable-status", "");
    assert.ok(pi.notifications.some((n) => /needs <jobId>/.test(n)));
    await rm(dir, { recursive: true, force: true });
  });

  it("CLI tick without host returns runtime_unavailable exit 4 (not idle 0)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-cli-due-"));
    await mkdir(path.join(dir, "durable"), { recursive: true });
    const prevHost = process.env.BSA_DURABLE_HOST;
    delete process.env.BSA_DURABLE_HOST;
    try {
      const repo = SqliteJobRepository.open(path.join(dir, "durable", "control.sqlite"));
      const service = new JobApplicationService(repo, () => null);
      const job = await service.create({ objective: "due" });
      const proposed = await service.propose(job.jobId, draft(job.jobId));
      await service.approve(job.jobId, proposed.hash!);
      repo.close();

      const code = await commandDurable({
        positional: ["tick", job.jobId],
        flags: { root: dir, json: true },
      });
      assert.equal(code, 4);
    } finally {
      if (prevHost === undefined) delete process.env.BSA_DURABLE_HOST;
      else process.env.BSA_DURABLE_HOST = prevHost;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("BSA_DURABLE_HOST=1 without a model still exits 4 (never FakeKernel success)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-cli-fakehost-"));
    await mkdir(path.join(dir, "durable"), { recursive: true });
    const prevHost = process.env.BSA_DURABLE_HOST;
    const keys = [
      "OPENROUTER_API_KEY",
      "open_router_api_key",
      "ANTHROPIC_API_KEY",
      "anthropic_api_key",
      "OPENAI_API_KEY",
      "openai_api_key",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "google_api_key",
      "gemini_api_key",
      "AI_GATEWAY_API_KEY",
      "ai_gateway_api_key",
    ] as const;
    const prevKeys = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.BSA_DURABLE_HOST = "1";
    for (const k of keys) delete process.env[k];
    try {
      const repo = SqliteJobRepository.open(path.join(dir, "durable", "control.sqlite"));
      const service = new JobApplicationService(repo, () => null);
      const job = await service.create({ objective: "due" });
      const proposed = await service.propose(job.jobId, draft(job.jobId));
      await service.approve(job.jobId, proposed.hash!);
      repo.close();

      const code = await commandDurable({
        positional: ["tick", job.jobId],
        flags: { root: dir, json: true },
      });
      assert.equal(code, 4);
    } finally {
      if (prevHost === undefined) delete process.env.BSA_DURABLE_HOST;
      else process.env.BSA_DURABLE_HOST = prevHost;
      for (const k of keys) {
        if (prevKeys[k] === undefined) delete process.env[k];
        else process.env[k] = prevKeys[k];
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("FakePi durable-tick without host reports runtime_unavailable; with host works", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-fakepi-tick-"));
    await mkdir(path.join(dir, "durable"), { recursive: true });
    const repo = SqliteJobRepository.open(path.join(dir, "durable", "control.sqlite"));
    const job = await new JobApplicationService(repo, () => null).create({ objective: "pi" });
    const proposed = await new JobApplicationService(repo, () => null).propose(job.jobId, draft(job.jobId));
    await new JobApplicationService(repo, () => null).approve(job.jobId, proposed.hash!);
    repo.close();

    const piNull = createFakePi();
    await piNull.startSession();
    registerDurablePiCommands(piNull, { root: dir });
    await runCommand(piNull, "durable-tick", job.jobId);
    assert.ok(piNull.notifications.some((n) => /runtime_unavailable/.test(n)));

    const piHost = createFakePi();
    await piHost.startSession();
    const { DirectKernel } = await import("../../src/durable/ports/execution-kernel.ts");
    registerDurablePiCommands(piHost, {
      root: dir,
      hostFactory: () => ({
        available: true,
        profileKey: "test",
        nowIso: () => new Date().toISOString(),
        kernel: new DirectKernel(async () => ({
          status: "completed",
          value: { ok: true },
          evidenceIds: ["ev"],
        })),
      }),
    });
    await runCommand(piHost, "durable-tick", job.jobId);
    assert.ok(piHost.notifications.some((n) => /"worked"|"complete"/.test(n)));
    await rm(dir, { recursive: true, force: true });
  });
});

async function waitForMarker(marker: string, timeoutMs = 15_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const text = await readFile(marker, "utf8");
      if (text.trim()) return text;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`marker not written: ${marker}`);
}

describe("CAMPAIGN-04-T03 process kill matrix", () => {
  for (const stage of ["before_model", "between_acts", "after_effect", "before_commit"] as const) {
    it(`survives SIGKILL at ${stage} with safe attempt/work-item state`, async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), `bsa-kill-${stage}-`));
      const marker = path.join(dir, "marker.txt");
      await mkdir(path.join(dir, "durable"), { recursive: true });
      await writeFile(marker, "");

      const child = spawn(process.execPath, ["--import", "tsx", CHILD], {
        cwd: ROOT,
        env: {
          ...process.env,
          BSA_KILL_ROOT: dir,
          BSA_KILL_STAGE: stage,
          BSA_KILL_MARKER: marker,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      try {
        const text = await waitForMarker(marker);
        assert.match(text, new RegExp(stage === "between_acts" ? /between_acts/ : stage));
        const pid = Number(text.trim().split("\n").pop());
        assert.ok(Number.isFinite(pid) && pid > 0);
        process.kill(pid, "SIGKILL");
        await new Promise<void>((resolve) => child.on("exit", () => resolve()));

        const repo = SqliteJobRepository.open(path.join(dir, "durable", "control.sqlite"));
        try {
          const jobs = await repo.listJobs();
          assert.equal(jobs.length, 1);
          const job = jobs[0]!;
          assert.notEqual(job.lifecycle, "completed");
          const items = await repo.listWorkItems(job.jobId);
          assert.ok(items.length >= 1);
          // Mid-flight kill must not forge a completed work item without a commit.
          for (const item of items) {
            assert.notEqual(item.status, "done");
          }
          const effects = await repo.listEffects(job.jobId);
          for (const effect of effects) {
            assert.ok(effect.status === "uncertain" || effect.status === "prepared" || effect.status === "dispatched");
          }
        } finally {
          repo.close();
        }
      } catch (err) {
        child.kill("SIGKILL");
        throw new Error(`${String(err)}\nstderr=${stderr}`);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
});
