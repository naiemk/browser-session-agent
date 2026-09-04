import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * The port has to be crossable by a wire.
 *
 * In the product the browser runs on the user's desktop and the agent runs on a server,
 * talking over RPC. `BrowserPort` used to hand out a live Playwright `Page`, and `act`,
 * `probe` and `survey` all took one — so the port was only implementable in-process, and
 * the new runtime could not drive the product's browser at all. Every suite target passed
 * anyway, because they all run locally.
 *
 * That is the kind of defect a test has to hold shut, because nothing about writing
 * `pageFor()` feels wrong at the time.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

/** The interface body only, so the file's own imports and classes do not count. */
export function portInterfaceBody(source: string): string {
  const start = source.indexOf("export interface BrowserPort {");
  assert.notEqual(start, -1, "BrowserPort interface not found");
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, "BrowserPort interface is not closed");
  return source.slice(start, end);
}

describe("the browser port stays serializable", () => {
  const body = portInterfaceBody(read("src/core/browser.ts"));

  it("never mentions a live Playwright object", () => {
    for (const banned of ["Page", "Locator", "Frame", "BrowserContext", "CDPSession"]) {
      assert.ok(
        !new RegExp(`\\b${banned}\\b`).test(body),
        `BrowserPort mentions ${banned}; a live object cannot cross RPC to the desktop node, ` +
          "so the port would only be implementable in-process again",
      );
    }
  });

  it("covers the primitives act needs, so act never reaches past it", () => {
    // If act needs something the port lacks, the pressure is to expose a page again.
    for (const method of [
      "navigate",
      "click",
      "fill",
      "selectOption",
      "scroll",
      "setInputFiles",
      "waitFor",
      "probe",
      "survey",
    ]) {
      assert.ok(new RegExp(`\\b${method}\\(`).test(body), `BrowserPort is missing ${method}`);
    }
  });

  it("keeps act off Playwright entirely", () => {
    const act = read("src/core/act.ts");
    assert.ok(
      !/from "playwright"/.test(act) && !/import\("playwright"\)/.test(act),
      "act must reach the browser only through the port, or a remote browser cannot be driven",
    );
  });

  it("fails on a reintroduced page accessor", () => {
    const bad = `export interface BrowserPort {\n  pageFor(tabId?: string): Page;\n}`;
    assert.throws(() => {
      const body = portInterfaceBody(bad);
      if (/\bPage\b/.test(body)) throw new Error("Page leaked");
    }, /Page leaked/);
  });
});
