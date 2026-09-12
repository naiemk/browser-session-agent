import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PARENT = path.join(ROOT, "skills", "magpie-parent", "SKILL.md");
const HARNESS = path.join(ROOT, "skills", "browser-harness", "SKILL.md");
const GROK = path.join(ROOT, "skills", "magpie-parent", "GROK_BOT.md");
const HERMES = path.join(ROOT, "skills", "magpie-parent", "HERMES_OPENCLAW.md");

describe("PARENT-01-T04 host skills", () => {
  it("canonical skill teaches session revive, forbids click/type and parallel harvest", async () => {
    const body = await readFile(PARENT, "utf8");
    assert.match(body, /session_id|--session/);
    assert.match(body, /do not.*click|Do not.*click/i);
    assert.match(body, /type into|CSS selectors/i);
    assert.match(body, /second Magpie session|second session/i);
    assert.match(body, /not.*browse.*harvest|not.*scrape the harvest|not.*in parallel/i);
    assert.match(body, /profiles recommend/);
  });

  it("Grok / Hermes packages carry the same CLI contract", async () => {
    const grok = await readFile(GROK, "utf8");
    const hermes = await readFile(HERMES, "utf8");
    assert.match(grok, /magpie --json/);
    assert.match(hermes, /magpie --json/);
    assert.match(grok, /paste/i);
    assert.doesNotMatch(grok, /paste this GitHub URL/i);
    assert.match(hermes, /ACP/i);
  });

  it("browser-harness names ACP vs long Pi-session modes", async () => {
    const body = await readFile(HARNESS, "utf8");
    assert.match(body, /Mode A|one-shot ACP/i);
    assert.match(body, /Mode B|Pi-session|magpie --json/i);
    assert.match(body, /Do not send|not.*ACP path by default/i);
  });
});
