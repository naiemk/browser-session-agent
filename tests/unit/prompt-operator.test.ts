import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractJson,
  findButton,
  findEditor,
  interpretPrompt,
  isPrettyJson,
} from "../../src/operator/prompt.ts";
import type { Observation } from "../../src/domain/types.ts";

describe("prompt interpretation", () => {
  it("extracts JSON, URL, and jsonlint intents", () => {
    const intent = interpretPrompt(
      `Create unformatted JSON, open JSONLint, validate and prettify and copy back.\n{"a":1}\nOpen: http://127.0.0.1:9/jsonlint`,
    );
    assert.equal(intent.url, "http://127.0.0.1:9/jsonlint");
    assert.equal(intent.unformattedJson, '{"a":1}');
    assert.equal(intent.wantValidate, true);
    assert.equal(intent.wantPrettify, true);
    assert.equal(intent.wantCopy, true);
  });

  it("creates default unformatted JSON when asked to create one", () => {
    const intent = interpretPrompt("Create unformatted json and open jsonlint to validate");
    assert.equal(intent.url, "https://jsonlint.com/");
    assert.ok(intent.unformattedJson);
    assert.equal(intent.unformattedJson?.includes("\n"), false);
    JSON.parse(intent.unformattedJson!);
  });

  it("minifies pretty JSON from a fenced block", () => {
    const json = extractJson("```json\n{\n  \"ok\": true\n}\n```");
    assert.equal(json?.includes("ok"), true);
    const intent = interpretPrompt(`prettify this unformatted json\n${json}`);
    assert.equal(intent.unformattedJson, '{"ok":true}');
  });

  it("finds the JSON editor and validate button from an observation", () => {
    const observation: Observation = {
      id: "obs",
      tabId: "tab",
      url: "http://x/jsonlint",
      title: "JSONLint",
      controls: [
        { ref: "e1", role: "link", name: "JSONLint", tag: "a" },
        { ref: "e2", role: "textbox", name: "JSON editor", tag: "textarea", inputType: "textarea" },
        { ref: "e3", role: "button", name: "Validate JSON", tag: "button" },
        { ref: "e4", role: "button", name: "Prettify", tag: "button" },
      ],
      dialogs: [],
      errors: [],
      consoleErrors: [],
      recentChanges: [],
    };
    assert.equal(findEditor(observation)?.ref, "e2");
    assert.equal(findButton(observation, /validate/i)?.ref, "e3");
    assert.equal(isPrettyJson('{\n  "ok": true\n}'), true);
    assert.equal(isPrettyJson('{"ok":true}'), false);
  });
});
