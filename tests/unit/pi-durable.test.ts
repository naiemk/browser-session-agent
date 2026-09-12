import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import browserSessionAgent from "../../src/extension.ts";
import {
  bindDurableCommands,
  hostedDurableHostFactory,
  magpieDurableHostFactory,
  REMEDIATION_HOSTED_NO_HOST,
  REMEDIATION_HOSTED_NO_NODE,
  REMEDIATION_MAGPIE_NO_WORKER,
} from "../../src/host/pi-durable.ts";
import { durableChatBinding } from "../../src/durable/adapters/pi.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import type { BrowserWorker } from "../../src/worker/browser-worker.ts";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { ModelPort } from "../../src/runtime/model.ts";
import { createFakePi, runCommand } from "../helpers/fake-pi.ts";
import { OperatorRuntime } from "../../src/hosts/web/runtime.ts";
import { NodeHub } from "../../src/hosts/web/hub.ts";
import { extensionContext } from "../../src/host/memory-host.ts";
import { AgentError } from "../../src/domain/types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const homes: string[] = [];
let previousCore: string | undefined;

beforeEach(() => {
  previousCore = process.env.BSA_CORE_HOME;
});

afterEach(async () => {
  if (previousCore === undefined) delete process.env.BSA_CORE_HOME;
  else process.env.BSA_CORE_HOME = previousCore;
  previousCore = undefined;
  while (homes.length) {
    await new Promise((resolve) => setImmediate(resolve));
    await rm(homes.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function tempCore(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-durable-pi-"));
  homes.push(home);
  process.env.BSA_CORE_HOME = home;
  await mkdir(path.join(home, "durable"), { recursive: true });
  return home;
}

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

async function approveJob(root: string, objective = "tick"): Promise<string> {
  const repo = SqliteJobRepository.open(path.join(root, "durable", "control.sqlite"));
  const service = new JobApplicationService(repo, () => null);
  const job = await service.create({ objective });
  const proposed = await service.propose(job.jobId, draft(job.jobId));
  await service.approve(job.jobId, proposed.hash!);
  repo.close();
  return job.jobId;
}

describe("CAMPAIGN-R2-2 Magpie / hosted durable bind", () => {
  it("browserSessionAgent registers durable commands and keeps prototype job-new", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.ok(pi.commands.has("durable-status"));
    assert.ok(pi.commands.has("durable-tick"));
    assert.ok(pi.commands.has("durable-cancel"));
    assert.ok(pi.commands.has("job-new"), "prototype /job-* must stay");
    assert.equal(durableChatBinding().boundJobId, undefined);
    await runCommand(pi, "durable-status", "");
    assert.ok(pi.notifications.some((n) => /needs <jobId>/.test(n)));
  });

  it("magpieDurableHostFactory is null without workerInfo; non-null with worker+stream", () => {
    const idle = {
      workerInfo: null,
    } as unknown as BrowserWorker;
    const started = {
      workerInfo: { pid: 1, cdpUrl: "http://127.0.0.1:9" },
    } as unknown as BrowserWorker;
    const stream = (async function* () {
      /* unused */
    }) as unknown as ModelPort;

    assert.equal(
      magpieDurableHostFactory({
        worker: idle,
        live: () => ({ stream, model: {} as never, name: "test" }),
      })(),
      null,
    );

    const host = magpieDurableHostFactory({
      worker: started,
      live: () => ({ stream, model: {} as never, name: "test" }),
      profileKey: "magpie-chat",
    })();
    assert.ok(host);
    assert.equal(host.profileKey, "magpie-chat");
    assert.equal(host.available, true);
  });

  it("FakePi durable-tick with null Magpie host notifies runtime_unavailable + Magpie remediation", async () => {
    const root = await tempCore();
    const jobId = await approveJob(root);
    const pi = createFakePi();
    await pi.startSession();
    const worker = { workerInfo: null } as unknown as BrowserWorker;
    bindDurableCommands(pi, {
      surface: "magpie",
      worker,
      root,
      liveCache: { current: null },
    });
    await runCommand(pi, "durable-tick", jobId);
    const note = pi.notifications.join("\n");
    assert.match(note, /runtime_unavailable/);
    assert.match(note, new RegExp(REMEDIATION_MAGPIE_NO_WORKER.slice(0, 40)));
    assert.doesNotMatch(note, /BSA_DURABLE_HOST/);
  });

  it("hosted bind registers commands; tick overlays hosted remediation", async () => {
    const root = await tempCore();
    const jobId = await approveJob(root, "hosted");
    const pi = createFakePi();
    await pi.startSession();
    bindDurableCommands(pi, { surface: "hosted", root });
    assert.ok(pi.commands.has("durable-status"));
    assert.ok(pi.commands.has("durable-tick"));
    assert.ok(pi.commands.has("durable-cancel"));
    await runCommand(pi, "durable-tick", jobId);
    const note = pi.notifications.join("\n");
    assert.match(note, /runtime_unavailable/);
    assert.match(note, new RegExp(REMEDIATION_HOSTED_NO_HOST.slice(0, 40)));
  });

  it("hosted app.js lists the three durable commands", async () => {
    const source = await readFile(path.join(ROOT, "src/hosts/web/public/app.js"), "utf8");
    assert.match(source, /\["durable-status"/);
    assert.match(source, /\["durable-tick"/);
    assert.match(source, /\["durable-cancel"/);
  });
});

describe("CAMPAIGN-R2-E2 hosted/RPC ExecutionHost twin", () => {
  const stubPort = {} as BrowserPort;
  const stream = (async function* () {
    /* unused */
  }) as unknown as ModelPort;

  it("hostedDurableHostFactory is null when disconnected or without model", () => {
    assert.equal(
      hostedDurableHostFactory({
        connected: () => false,
        browser: stubPort,
        live: () => ({ stream, model: {} as never, name: "test" }),
      })(),
      null,
    );
    assert.equal(
      hostedDurableHostFactory({
        connected: () => true,
        browser: stubPort,
        live: () => null,
      })(),
      null,
    );
  });

  it("hostedDurableHostFactory returns hosted-rpc host when connected + stream", () => {
    const host = hostedDurableHostFactory({
      connected: () => true,
      browser: stubPort,
      live: () => ({ stream, model: {} as never, name: "test" }),
      profileKey: "hosted-rpc",
    })();
    assert.ok(host);
    assert.equal(host.profileKey, "hosted-rpc");
    assert.equal(host.available, true);
    assert.equal(host.headedTakeover, true);
  });

  it("hosted kernel maps a mid-tick node drop to a retryable failed outcome", async () => {
    const host = hostedDurableHostFactory({
      connected: () => true,
      browser: stubPort,
      live: () => null,
      hostOverrides: {
        runAttempt: async () => {
          throw new AgentError("node_disconnected", "Browser node disconnected");
        },
      },
    })();
    assert.ok(host);
    const outcome = await host.kernel.execute({} as never);
    assert.equal(outcome.status, "failed");
    if (outcome.status === "failed") {
      assert.equal(outcome.code, "node_disconnected");
      assert.equal(outcome.retryable, true);
    }
  });

  it("FakePi hosted tick with disconnected node notifies runtime_unavailable + node remediation", async () => {
    const root = await tempCore();
    const jobId = await approveJob(root, "hosted-node");
    const pi = createFakePi();
    await pi.startSession();
    bindDurableCommands(pi, {
      surface: "hosted",
      root,
      browser: stubPort,
      nodeConnected: () => false,
      liveCache: { current: null },
    });
    await runCommand(pi, "durable-tick", jobId);
    const note = pi.notifications.join("\n");
    assert.match(note, /runtime_unavailable/);
    assert.match(note, new RegExp(REMEDIATION_HOSTED_NO_NODE.slice(0, 40)));
    assert.doesNotMatch(note, /BSA_DURABLE_HOST/);
  });

  it("FakePi hosted tick with connected node + mock runAttempt is not runtime_unavailable", async () => {
    const root = await tempCore();
    const jobId = await approveJob(root, "hosted-tick");
    const pi = createFakePi();
    await pi.startSession();
    bindDurableCommands(pi, {
      surface: "hosted",
      root,
      browser: stubPort,
      nodeConnected: () => true,
      liveCache: { current: null },
      hostOverrides: {
        runAttempt: async () => ({
          status: "completed",
          value: { ok: true },
          evidenceIds: ["ev:rpc-twin"],
        }),
      },
    });
    await runCommand(pi, "durable-tick", jobId);
    const note = pi.notifications.join("\n");
    assert.doesNotMatch(note, /runtime_unavailable/);
  });

  it("OperatorRuntime production bind fails closed while NodeHub is disconnected", async () => {
    const root = await tempCore();
    const jobId = await approveJob(root, "hosted-runtime");
    const notes: string[] = [];
    const runtime = new OperatorRuntime(new NodeHub(), (message) => {
      if (message.type === "notify") notes.push(message.message);
    });
    await runtime.api.commands.get("durable-tick")?.handler(jobId, extensionContext(runtime.host));
    const note = notes.join("\n");
    assert.match(note, /runtime_unavailable/);
    assert.match(note, new RegExp(REMEDIATION_HOSTED_NO_NODE.slice(0, 40)));
  });
});

describe("CAMPAIGN-R2-2 FakeKernel ban (bind surfaces)", () => {
  it("extension, web runtime, and pi-durable do not import FakeKernel", () => {
    for (const rel of [
      "src/extension.ts",
      "src/hosts/web/runtime.ts",
      "src/host/pi-durable.ts",
    ]) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(
        source,
        /import\s+[^;]*\bFakeKernel\b/,
        `${rel} must not import FakeKernel`,
      );
    }
  });

  it("hosted runtime does not wrap RpcSessionHandle.worker as the durable host", () => {
    const runtime = readFileSync(path.join(ROOT, "src/hosts/web/runtime.ts"), "utf8");
    const durable = readFileSync(path.join(ROOT, "src/host/pi-durable.ts"), "utf8");
    assert.match(runtime, /browser:\s*this\.rpcBrowser/);
    assert.doesNotMatch(runtime, /handle\.worker/);
    assert.doesNotMatch(durable, /handle\.worker/);
    assert.doesNotMatch(durable, /new RpcSessionHandle/);
  });
});
