import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Ledger } from "../../src/core/ledger.ts";
import { GoalStore } from "../../src/core/state.ts";
import { inferTextFileName } from "../../src/core/scratch.ts";
import { TOOL_SAVE } from "../../src/runtime/names.ts";
import { buildTools, safeArtifactName } from "../../src/runtime/tools.ts";
import { ledgerEvidence } from "../helpers/evidence.ts";
import type { BrowserPort } from "../../src/core/browser.ts";

describe("save_artifact", () => {
  const dirs: string[] = [];
  after(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes a document under the goal artifacts dir", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "save-"));
    dirs.push(root);
    const ledger = await Ledger.open(root, "goal_save");
    const store = await GoalStore.open(root, "goal_save", "keep this");
    const tools = buildTools({
      browser: {} as BrowserPort,
      evidence: ledgerEvidence(ledger, { store }),
    });
    const save = tools.find((tool) => (tool as { name: string }).name === TOOL_SAVE) as {
      execute: (id: string, params: unknown) => Promise<{ details: { path?: string; saved?: string } }>;
    };
    const result = await save.execute("t1", {
      name: "../../tracker.md",
      content: "# Outreach\n\n- Ada\n",
    });
    assert.equal(result.details.saved, "tracker.md");
    const written = await readFile(result.details.path!, "utf8");
    assert.match(written, /Ada/);
    assert.equal(path.dirname(result.details.path!), ledger.artifactsDir);
  });

  it("infers a csv name when the model omits name", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "save-"));
    dirs.push(root);
    const ledger = await Ledger.open(root, "goal_save_csv");
    const store = await GoalStore.open(root, "goal_save_csv", "keep this");
    const tools = buildTools({
      browser: {} as BrowserPort,
      evidence: ledgerEvidence(ledger, { store }),
    });
    const save = tools.find((tool) => (tool as { name: string }).name === TOOL_SAVE) as {
      execute: (
        id: string,
        params: unknown,
      ) => Promise<{ details: { path?: string; saved?: string; inferredName?: boolean } }>;
    };
    const result = await save.execute("t1", {
      content: "group,address,value_usd\nOldie,0xabc,12.5\n",
    });
    assert.equal(result.details.saved, "artifact.csv");
    assert.equal(result.details.inferredName, true);
    const written = await readFile(result.details.path!, "utf8");
    assert.match(written, /0xabc/);
  });

  it("strips path components from the name", () => {
    assert.equal(safeArtifactName("../../x.md"), "x.md");
    assert.equal(safeArtifactName(""), "");
  });

  it("infers an extension from content when the name is missing", () => {
    assert.equal(inferTextFileName("notes.md", "ignored"), "notes.md");
    assert.equal(inferTextFileName(undefined, "group,address\nOldie,0x1"), "artifact.csv");
    assert.equal(inferTextFileName("", "# Title\n"), "artifact.md");
    assert.equal(inferTextFileName(undefined, "{\"a\":1}"), "artifact.json");
    assert.equal(inferTextFileName(undefined, "just words"), "artifact.txt");
    assert.equal(inferTextFileName(undefined, "   "), "");
  });
});
