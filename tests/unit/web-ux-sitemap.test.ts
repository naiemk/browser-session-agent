import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SITEMAP = path.join(ROOT, "docs/web-ux-sitemap.yaml");

describe("web UX sitemap guideline", () => {
  const yaml = readFileSync(SITEMAP, "utf8");

  it("names the canvas regions that replace chat-first chrome", () => {
    for (const id of ["session-rail", "canvas", "human-slider", "transcript-dock", "scratch"]) {
      assert.match(yaml, new RegExp(`id: ${id}`));
    }
    assert.match(yaml, /route: \/signin/);
    assert.match(yaml, /path: \/g\/\{goalId\}/);
  });

  it("treats AG-UI as protocol and keeps Pi goal ids as threadId", () => {
    assert.match(yaml, /name: AG-UI/);
    assert.match(yaml, /@ag-ui\/encoder/);
    assert.match(yaml, /goal_\*/);
    assert.match(yaml, /not_the_app:/);
    assert.match(yaml, /CopilotKit as the hosted app/);
  });

  it("closes the generative catalog against raw HTML and scratch npm install", () => {
    assert.match(yaml, /raw HTML/);
    assert.match(yaml, /npm install in scratch/);
    assert.match(yaml, /skills\/ag-ui-surfaces/);
    assert.match(yaml, /human-slider/);
  });
});
