import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import browserSessionAgent from "../../src/extension.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { coreRoot, goalPaths } from "../../src/core/paths.ts";
import { readPayloads } from "../../src/optimize/recorder.ts";
import { TOOL_OBSERVE, TOOL_REMEMBER } from "../../src/runtime/names.ts";
import { renderToolResult } from "../../src/host/pi-tool-view.ts";
import { readWorkerInfo } from "../../src/store/worker-info.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

async function tempHome(): Promise<{ home: string; core: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-evidence-"));
  return {
    home,
    core: path.join(home, "core"),
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

/** The goal the extension filed its evidence under, from the directory it created. */
async function soleGoal(core: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const goals = await readdir(path.join(core, "goals"));
  assert.equal(goals.length, 1, `expected one goal, saw ${goals.join(",")}`);
  return goals[0]!;
}

describe("the agent the operator runs records what it did", () => {
  it("writes the trace, the cost and the payload of a real look at a page", async () => {
    const { home, core, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const pi = createFakePi();
    try {
      process.env.BSA_HOME = home;
      process.env.BSA_CORE_HOME = core;
      process.env.BSA_HEADLESS = "1";

      browserSessionAgent(pi);
      await pi.startSession();

      /*
       * This is the test whose absence cost an unreadable run.
       *
       * The tools were composed with a browser and nothing to write to, so thirteen
       * minutes of work produced three lines of log, none of them from the agent. Every
       * recording call was `?.`, so there was nothing to fail.
       */
      const observed = await runTool(pi, TOOL_OBSERVE, {});
      assert.equal(Boolean(observed.isError), false, JSON.stringify(observed));
      await runTool(pi, TOOL_REMEMBER, {
        key: "operating-identity",
        value: `the fixture server at ${origin}`,
      });

      const goalId = await soleGoal(core);
      const events = await Ledger.readFrom(core, goalId);
      assert.ok(events.length > 0, "the ledger must not be empty");
      assert.ok(
        events.some((event) => event.intent?.includes("established: operating-identity")),
        `remember must leave provenance, saw ${events.map((e) => e.type).join(",")}`,
      );

      // And the fact itself, which used to be reported as stored and was not.
      const { GoalStore } = await import("../../src/core/state.ts");
      const store = await GoalStore.open(core, goalId);
      const facts = (await store.goal()).facts as Record<string, { value?: string }>;
      assert.match(facts["operating-identity"]?.value ?? "", /fixture server/);

      const payloads = await readPayloads(goalPaths(core, goalId).payloadsFile);
      const look = payloads.find((record) => record.tool === TOOL_OBSERVE);
      assert.ok(look, "the model-facing payload must be on disk");
      assert.ok(look.bytes > 0 && look.text.length === look.bytes, "bytes must match the text");
    } finally {
      // The look started a real browser, so it has to be stopped or the process never
      // exits and the whole file times out.
      await runCommand(pi, "browser-stop", "--browser").catch(() => undefined);
      const info = await readWorkerInfo(home).catch(() => null);
      if (info?.pid) {
        try {
          process.kill(info.pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
      delete process.env.BSA_HOME;
      delete process.env.BSA_CORE_HOME;
      delete process.env.BSA_HEADLESS;
      await server.stop();
      await cleanup();
    }
  });

  it("shows one line on screen and keeps the payload for expanding", async () => {
    const details = { url: "https://example.com/list", controls: [], changes: ["a", "b"] };
    const text = JSON.stringify(details);
    const result = { content: [{ type: "text", text }], details };

    const collapsed = renderToolResult(result, { expanded: false, isPartial: false }, TOOL_OBSERVE);
    assert.equal(collapsed.render(80).length, 1, "collapsed is exactly one line");
    assert.match(collapsed.render(80)[0]!, /example\.com\/list/);

    // Expanding answers the only question worth asking then: what did the model see?
    const expanded = renderToolResult(result, { expanded: true, isPartial: false }, TOOL_OBSERVE);
    assert.equal(expanded.render(200).join(""), text);
  });

  it("defaults evidence to the core root, not the working directory", () => {
    assert.equal(coreRoot("/tmp/explicit"), "/tmp/explicit");
    assert.match(coreRoot(), /browser-agent-core|core$/);
  });
});
