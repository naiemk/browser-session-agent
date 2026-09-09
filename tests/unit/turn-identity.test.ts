import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { turnIdentityFields, turnIdentityKey } from "../../src/runtime/turn-identity.ts";

describe("PERF-01 turn identity", () => {
  it("reads provider and model from a flat assistant message", () => {
    assert.deepEqual(turnIdentityFields({ provider: "openai", model: "gpt-4.1" }), {
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  it("reads nested model objects without inventing a label", () => {
    assert.deepEqual(
      turnIdentityFields({ model: { id: "claude-sonnet", provider: "anthropic" } }),
      { provider: "anthropic", model: "claude-sonnet" },
    );
    assert.deepEqual(turnIdentityFields({ usage: { input: 1 } }), {});
    assert.equal(turnIdentityKey({}), "/");
  });
});
