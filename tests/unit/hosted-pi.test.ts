import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOSTED_MAX_OUTPUT_TOKENS,
  applyHostedApiKeys,
  assistantErrorFromEvent,
  capHostedModelOutput,
} from "../../src/hosts/web/hosted-pi.ts";

describe("hosted Pi helpers", () => {
  it("caps huge OpenRouter maxTokens so input+output fit the context window", () => {
    const model = { maxTokens: 262144 };
    capHostedModelOutput(model);
    assert.equal(model.maxTokens, HOSTED_MAX_OUTPUT_TOKENS);
    const small = { maxTokens: 4096 };
    capHostedModelOutput(small);
    assert.equal(small.maxTokens, 4096);
  });

  it("surfaces empty Kimi/OpenRouter turn errors", () => {
    const err = assistantErrorFromEvent({
      type: "message_end",
      message: {
        stopReason: "error",
        errorMessage: "400 This endpoint's maximum context length is 262144 tokens.",
      },
    });
    assert.match(err ?? "", /maximum context length/);
  });

  it("applies OPENROUTER_API_KEY as a runtime override", async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const seen: Array<[string, string]> = [];
    try {
      await applyHostedApiKeys({
        setRuntimeApiKey: (provider, key) => {
          seen.push([provider, key]);
        },
      });
      assert.deepEqual(seen.find((row) => row[0] === "openrouter"), ["openrouter", "sk-or-test"]);
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});
