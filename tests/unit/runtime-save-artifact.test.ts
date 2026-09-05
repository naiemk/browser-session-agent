import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Ledger } from "../../src/core/ledger.ts";
import { GoalStore } from "../../src/core/state.ts";
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

  it("strips path components from the name", () => {
    assert.equal(safeArtifactName("../../x.md"), "x.md");
    assert.equal(safeArtifactName(""), "");
  });
});
