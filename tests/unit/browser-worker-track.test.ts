import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateOnLivePage,
  isDestroyedExecutionContext,
  type EvaluablePage,
} from "../../src/worker/browser-worker.ts";

function fakePage(options: {
  evaluates: Array<unknown>;
  closedAfter?: number;
}): EvaluablePage {
  let calls = 0;
  let closed = false;
  return {
    isClosed: () => closed,
    waitForLoadState: async () => undefined,
    evaluate: async () => {
      if (options.closedAfter !== undefined && calls >= options.closedAfter) {
        closed = true;
      }
      const next = options.evaluates[calls++];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe("evaluateOnLivePage", () => {
  it("treats a navigation-destroyed context as retryable", () => {
    assert.equal(
      isDestroyedExecutionContext(new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation")),
      true,
    );
    assert.equal(isDestroyedExecutionContext(new Error("Target closed")), true);
    assert.equal(isDestroyedExecutionContext(new Error("selector not found")), false);
  });

  it("returns the first successful evaluate", async () => {
    const page = fakePage({ evaluates: ["tab_1"] });
    assert.equal(await evaluateOnLivePage(page, "window.name"), "tab_1");
  });

  it("retries after a destroyed execution context and then succeeds", async () => {
    const page = fakePage({
      evaluates: [
        new Error("Execution context was destroyed, most likely because of a navigation"),
        new Error("Execution context was destroyed"),
        "bsa:tab_ok",
      ],
    });
    assert.equal(await evaluateOnLivePage(page, "window.name"), "bsa:tab_ok");
  });

  it("raises a non-transient evaluate error immediately", async () => {
    const page = fakePage({ evaluates: [new Error("ReferenceError: window is not defined")] });
    await assert.rejects(() => evaluateOnLivePage(page, "window.name"), /ReferenceError/);
  });

  it("raises once the page has closed", async () => {
    const page = fakePage({
      evaluates: [new Error("Execution context was destroyed")],
      closedAfter: 0,
    });
    await assert.rejects(() => evaluateOnLivePage(page, "window.name"), /Page closed|Execution context was destroyed/);
  });

  it("gives up after the retry budget if the page never settles", async () => {
    const page = fakePage({
      evaluates: Array.from({ length: 8 }, () => new Error("Execution context was destroyed")),
    });
    await assert.rejects(() => evaluateOnLivePage(page, "window.name", 3), /Execution context was destroyed/);
  });
});
