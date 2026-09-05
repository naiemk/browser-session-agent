import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { settleVerification, describeVerification } from "../../src/core/settle.ts";
import type { Control, Observation, PageFacts, Verification } from "../../src/core/types.ts";

function control(name: string, value?: string): Control {
  return { ref: `e${name.length}`, role: "button", name, tag: "button", value };
}

function factsWith(controls: Control[], text = ""): PageFacts {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://example.test/",
    title: "Example",
    controls,
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: ["stale delta from the port"],
    capturedAt: new Date().toISOString(),
  };
  return { url: observation.url, title: observation.title, text, observation };
}

/**
 * A port that serves a scripted sequence of reads. Anything that is an Error is thrown,
 * which is how a read during navigation behaves.
 */
function portServing(reads: Array<PageFacts | Error>): { port: BrowserPort; calls: () => number } {
  let index = 0;
  const port = {
    async facts(): Promise<PageFacts> {
      const next = reads[Math.min(index, reads.length - 1)];
      index += 1;
      if (next instanceof Error) throw next;
      return next!;
    },
  } as unknown as BrowserPort;
  return { port, calls: () => index };
}

const passes = (): Verification => ({ status: "passed", checks: [] });
const fails = (): Verification => ({ status: "failed", checks: [] });

describe("settling a verdict", () => {
  it("trusts a pass on the first look and waits for nothing", async () => {
    const { port, calls } = portServing([factsWith([])]);
    const started = Date.now();

    const { verification } = await settleVerification(port, passes);

    assert.equal(verification.status, "passed");
    assert.equal(verification.waitedMs, 0, "a pass must not pay for the settle window");
    assert.equal(verification.samples, 1);
    assert.equal(calls(), 1, "the happy path stays at one read");
    assert.ok(Date.now() - started < 100);
  });

  it("keeps looking while the answer is no, and says how long it took", async () => {
    const { port, calls } = portServing([factsWith([]), factsWith([]), factsWith([])]);
    let attempt = 0;

    // Third look is the one that succeeds, which lands after 100ms + 200ms of waiting.
    const { verification } = await settleVerification(port, () =>
      ++attempt >= 3 ? passes() : fails(),
    );

    assert.equal(verification.status, "passed");
    assert.equal(verification.waitedMs, 300);
    assert.equal(verification.samples, 3);
    assert.equal(calls(), 3);
  });

  it("gives up at the budget and reports the failure as one that survived the wait", async () => {
    const { port, calls } = portServing([factsWith([])]);

    const { verification } = await settleVerification(port, fails, { budgetMs: 300 });

    assert.equal(verification.status, "failed");
    assert.equal(verification.waitedMs, 300, "waits 100 then 200, then 400 does not fit");
    assert.equal(calls(), 3);
  });

  it("looks exactly once when the budget is zero, which is the old behaviour", async () => {
    const { port, calls } = portServing([factsWith([])]);

    const { verification } = await settleVerification(port, fails, { budgetMs: 0 });

    assert.equal(verification.status, "failed");
    assert.equal(verification.waitedMs, 0);
    assert.equal(calls(), 1);
  });

  it("spends the whole budget and no more", async () => {
    const { port } = portServing([factsWith([])]);

    const { verification } = await settleVerification(port, fails);

    assert.equal(verification.waitedMs, 1_500, "the default backoff sums to the default budget");
    assert.equal(verification.samples, 5);
  });

  it("treats a read that throws as not yet, not as a failure", async () => {
    // What a read during navigation does: the execution context is gone, briefly.
    const { port } = portServing([
      new Error("Execution context was destroyed"),
      new Error("Execution context was destroyed"),
      factsWith([control("Continue")]),
    ]);

    const { verification, facts } = await settleVerification(port, passes);

    assert.equal(verification.status, "passed");
    assert.equal(verification.samples, 1, "only the read that succeeded counted");
    assert.equal(verification.waitedMs, 300);
    assert.equal(facts.observation.controls[0]?.name, "Continue");
  });

  it("raises the read error when the page never becomes readable", async () => {
    const { port } = portServing([new Error("Execution context was destroyed")]);

    await assert.rejects(
      () => settleVerification(port, passes, { budgetMs: 100 }),
      /Execution context was destroyed/,
    );
  });

  it("measures the delta from the given observation, not from whatever the port last saw", async () => {
    const before = factsWith([control("Open")]).observation;
    const after = factsWith([control("Open"), control("Continue")]);
    const { port } = portServing([after]);

    const { facts } = await settleVerification(port, passes, { since: before });

    assert.deepEqual(facts.observation.changes, ['added button "Continue"']);
  });

  it("leaves the port's own delta alone when no baseline is given", async () => {
    const { port } = portServing([factsWith([control("Open")])]);

    const { facts } = await settleVerification(port, passes);

    assert.deepEqual(facts.observation.changes, ["stale delta from the port"]);
  });
});

describe("describing a verdict", () => {
  it("says nothing about waiting when there was none", () => {
    const line = describeVerification({
      status: "passed",
      checks: [{ passed: true, predicate: "pageDelta", detail: "added button" }],
      waitedMs: 0,
    });
    assert.equal(line, "pageDelta: added button");
  });

  it("distinguishes a slow yes from a stable no", () => {
    const checks = [{ passed: false, predicate: "dialog_open", detail: "none open" }];
    assert.match(
      describeVerification({ status: "passed", checks, waitedMs: 300 }),
      /settled after 300ms/,
    );
    assert.match(
      describeVerification({ status: "failed", checks, waitedMs: 1500 }),
      /still failing after 1500ms/,
    );
  });
});
