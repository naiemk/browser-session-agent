import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { goalPaths } from "../../src/core/paths.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";
import { TOOL_ACT } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";
import { ledgerEvidence } from "../helpers/evidence.ts";

const dirs: string[] = [];
after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function uploadPort(): { port: BrowserPort; uploaded: string[][] } {
  const uploaded: string[][] = [];
  const observation = (): Observation => {
    const last = uploaded.at(-1)?.[0];
    const value = last ? path.basename(last) : "";
    return {
      id: "obs_1",
      tabId: "tab_1",
      url: "http://fixture.test/upload",
      title: "Upload",
      controls: [{ ref: "e1", role: "textbox", name: "Resume", tag: "input", inputType: "file", value }],
      dialogs: [],
      errors: [],
      consoleErrors: [],
      failedRequests: [],
      changes: [],
      capturedAt: new Date().toISOString(),
    };
  };
  const facts = (): PageFacts => {
    const obs = observation();
    return { url: obs.url, title: obs.title, text: valueText(obs), observation: obs };
  };
  const port = {
    async observe() {
      return observation();
    },
    async facts() {
      return facts();
    },
    async setInputFiles(_tab: string | undefined, _ref: string, files: string[]) {
      uploaded.push([...files]);
    },
  } as unknown as BrowserPort;
  return { port, uploaded };
}

function valueText(obs: Observation): string {
  return obs.controls[0]?.value ?? "";
}

describe("chat act upload paths", () => {
  it("resolves relative names under scratch when the session has a goal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "act-up-"));
    dirs.push(root);
    const ledger = await Ledger.open(root, "goal_up");
    const { port, uploaded } = uploadPort();
    const tools = buildTools({
      browser: port,
      evidence: ledgerEvidence(ledger, { goal: { root, goalId: "goal_up" } }),
      policy: "auto",
    });
    const act = tools.find((tool) => (tool as { name: string }).name === TOOL_ACT) as {
      execute: (id: string, params: unknown) => Promise<{ details: { error?: string } }>;
    };

    await act.execute("t1", { kind: "upload", ref: "e1", files: ["notes.md"] });
    assert.deepEqual(uploaded, [[path.join(goalPaths(root, "goal_up").scratchDir, "notes.md")]]);
  });

  it("leaves absolute paths alone and rejects escapes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "act-abs-"));
    dirs.push(root);
    const ledger = await Ledger.open(root, "goal_abs");
    const { port, uploaded } = uploadPort();
    const tools = buildTools({
      browser: port,
      evidence: ledgerEvidence(ledger, { goal: { root, goalId: "goal_abs" } }),
      policy: "auto",
    });
    const act = tools.find((tool) => (tool as { name: string }).name === TOOL_ACT) as {
      execute: (id: string, params: unknown) => Promise<{ details: { error?: string } }>;
    };

    const absolute = "/tmp/fixtures/cv.txt";
    await act.execute("t1", { kind: "upload", ref: "e1", files: [absolute] });
    assert.deepEqual(uploaded, [[absolute]]);

    const escaped = await act.execute("t2", { kind: "upload", ref: "e1", files: ["../secret.txt"] });
    assert.match(escaped.details.error ?? "", /scratch/);
    assert.equal(uploaded.length, 1);
  });

  it("does not rewrite relative names when there is no goal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "act-nogoal-"));
    dirs.push(root);
    const ledger = await Ledger.open(root, "goal_none");
    const { port, uploaded } = uploadPort();
    const tools = buildTools({
      browser: port,
      evidence: ledgerEvidence(ledger),
      policy: "auto",
    });
    const act = tools.find((tool) => (tool as { name: string }).name === TOOL_ACT) as {
      execute: (id: string, params: unknown) => Promise<unknown>;
    };

    await act.execute("t1", { kind: "upload", ref: "e1", files: ["notes.md"] });
    assert.deepEqual(uploaded, [["notes.md"]]);
  });
});
