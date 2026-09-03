import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProbeQuery, parseProbeQuery } from "../../src/core/probe.ts";
import { CoreError } from "../../src/core/types.ts";

/** Anything that would act rather than read, or read a credential, must be refused. */
const REJECTED: Array<[string, unknown]> = [
  ["click", { kind: "click", select: "button" }],
  ["navigate", { kind: "navigate", url: "https://example.test" }],
  ["fill", { kind: "fill", select: "input", text: "x" }],
  ["type", { kind: "type", select: "input", text: "x" }],
  ["submit", { kind: "submit", select: "form" }],
  ["evaluate", { kind: "evaluate", code: "document.cookie" }],
  ["storage", { kind: "storage" }],
  ["cookies", { kind: "cookies" }],
  ["headers", { kind: "headers" }],
  ["script smuggled into a valid kind", { kind: "text", script: "document.cookie" }],
  ["code smuggled into a valid kind", { kind: "elements", select: "input", code: "fetch('/x')" }],
  ["js smuggled into a valid kind", { kind: "count", select: "input", js: "1" }],
  ["unknown field", { kind: "elements", select: "input", fields: ["cookie"] }],
  ["token attribute", { kind: "elements", select: "input", attributes: ["data-session-token"] }],
  ["auth attribute", { kind: "elements", select: "input", attributes: ["authorization"] }],
  ["apiKey attribute", { kind: "elements", select: "input", attributes: ["data-api-key"] }],
  ["password attribute", { kind: "elements", select: "input", attributes: ["data-password"] }],
  ["missing select", { kind: "elements" }],
  ["empty select", { kind: "count", select: "  " }],
  ["not an object", "text"],
  ["array", [{ kind: "text" }]],
  ["missing kind", { select: "input" }],
];

const ACCEPTED: Array<[string, unknown]> = [
  ["page meta", { kind: "page_meta" }],
  ["body text", { kind: "text" }],
  ["scoped text", { kind: "text", within: "main" }],
  ["count", { kind: "count", select: "input" }],
  ["elements with fields", { kind: "elements", select: "input", fields: ["name", "required", "value"] }],
  ["elements with benign attributes", { kind: "elements", select: "input", attributes: ["data-testid"] }],
  ["form inventory", { kind: "form_inventory" }],
  ["links", { kind: "links", limit: 20 }],
  ["table", { kind: "table", select: "table" }],
];

describe("AGENT-02-T02 probe policy", () => {
  for (const [label, query] of REJECTED) {
    it(`rejects ${label}`, () => {
      const errors = validateProbeQuery(query);
      assert.ok(errors.length > 0, `expected rejection for ${JSON.stringify(query)}`);
      assert.throws(() => parseProbeQuery(query), (err: unknown) => err instanceof CoreError && err.code === "probe_rejected");
    });
  }

  for (const [label, query] of ACCEPTED) {
    it(`accepts ${label}`, () => {
      assert.deepEqual(validateProbeQuery(query), [], JSON.stringify(query));
    });
  }

  it("explains why an acting query is refused", () => {
    const [message] = validateProbeQuery({ kind: "click", select: "button" });
    assert.match(message ?? "", /probes read, they never act/);
  });
});
