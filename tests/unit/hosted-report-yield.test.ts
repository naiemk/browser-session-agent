import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abortCurrentPrompt } from "../../src/hosts/web/runtime.ts";

describe("hosted report yield", () => {
  it("aborts the current prompt and does not dispose the session", () => {
    let aborted = 0;
    let disposed = 0;
    const pi = {
      abort: () => {
        aborted += 1;
      },
      dispose: () => {
        disposed += 1;
      },
    };
    abortCurrentPrompt(pi);
    assert.equal(aborted, 1);
    assert.equal(disposed, 0);
    abortCurrentPrompt(null);
    assert.equal(aborted, 1);
  });
});
