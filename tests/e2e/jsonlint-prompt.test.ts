import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { runBrowserPrompt } from "../../src/operator/run-prompt.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

const MESSY_JSON = '{"name":"Ada Lovelace","skills":["math","programming"],"active":true,"years":36}';

describe("e2e: prompt-driven JSONLint", () => {
  let origin = "";
  let server: FixtureServer;
  let home = "";
  let cleanup: () => Promise<void>;

  before(async () => {
    server = new FixtureServer();
    origin = await server.start();
    const tmp = await tempHome();
    home = tmp.home;
    cleanup = tmp.cleanup;
  });

  after(async () => {
    await server.stop().catch(() => undefined);
    await cleanup?.().catch(() => undefined);
  });

  it("creates unformatted JSON, opens JSONLint, validates, prettifies, and copies back", async () => {
    const prompt = `
Create an unformatted JSON document, open JSONLint, validate it, prettify it, and copy the formatted JSON back.

JSON:
${MESSY_JSON}

Open: ${origin}/jsonlint
`.trim();

    const result = await runBrowserPrompt(prompt, { home, headless: true });
    assert.equal(result.ok, true, result.error);
    assert.match(result.url ?? "", /jsonlint/);
    assert.ok(result.copiedText.includes("\n"), "copied JSON should be pretty-printed");
    assert.deepEqual(result.prettyJson, JSON.parse(MESSY_JSON));
    assert.ok(result.steps.some((s) => s.tool === "browser_type"));
    assert.ok(result.steps.some((s) => s.tool === "browser_click"));
    assert.ok(result.steps.some((s) => s.tool === "copy_back"));
    assert.equal(result.copiedText.includes(MESSY_JSON), false);
    assert.ok(result.screenshotPath && existsSync(result.screenshotPath), "operator should capture the prettified editor");
  });
});
