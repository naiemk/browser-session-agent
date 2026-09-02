import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBrowserSystemPrompt,
  browserOperatorPrompt,
  isBrowserOperatorPrompt,
  isCodingAssistantPrompt,
} from "../../src/host/browser-agent-prompt.ts";
import { hostedResourceLoaderOptions } from "../../src/hosts/web/hosted-pi.ts";

const CODING = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.`;

describe("browser operator prompt", () => {
  it("replaces the Pi coding identity and does not offer files or shell", () => {
    const prompt = browserOperatorPrompt();
    assert.equal(isCodingAssistantPrompt(prompt), false);
    assert.equal(isBrowserOperatorPrompt(prompt), true);
    assert.match(prompt, /browser operator/i);
    assert.match(prompt, /browser_inspect/);
    assert.match(prompt, /browser_takeover/);
    assert.match(prompt, /multi-tab|multiple tabs/i);
    assert.doesNotMatch(prompt, /expert coding assistant/i);
    assert.doesNotMatch(prompt, /File & Code Operations/);
    assert.match(prompt, /not a coding assistant/i);
    assert.match(prompt, /Do not offer to read, write, or edit files/);
    assert.match(prompt, /Do not offer shell/);
  });

  it("replaces a coding system prompt on every turn", () => {
    const replaced = applyBrowserSystemPrompt({ systemPrompt: CODING });
    assert.equal(isCodingAssistantPrompt(replaced.systemPrompt), false);
    assert.match(replaced.systemPrompt, /browser_inspect/);
    assert.match(replaced.systemPrompt, /headed Chromium/);
  });

  it("replaces an empty prompt and leaves an already-browser prompt", () => {
    const empty = applyBrowserSystemPrompt({});
    assert.match(empty.systemPrompt, /browser operator/i);
    const again = applyBrowserSystemPrompt({ systemPrompt: empty.systemPrompt });
    assert.equal(again.systemPrompt, empty.systemPrompt);
  });

  it("appends browser rules onto a custom non-coding prompt", () => {
    const next = applyBrowserSystemPrompt({ systemPrompt: "You help a store manager." });
    assert.match(next.systemPrompt, /You help a store manager/);
    assert.match(next.systemPrompt, /browser_inspect|headed Chromium/);
  });

  it("configures the hosted loader to drop coding skills and context files", () => {
    const options = hostedResourceLoaderOptions({ cwd: "/app", agentDir: "/data/pi-agent" });
    assert.equal(options.noSkills, true);
    assert.equal(options.noContextFiles, true);
    assert.equal(options.appendSystemPromptOverride().length, 0);
    assert.deepEqual(options.agentsFilesOverride(), { agentsFiles: [] });
    assert.equal(isCodingAssistantPrompt(options.systemPrompt), false);
    assert.match(options.systemPrompt, /browser_inspect/);
  });
});
