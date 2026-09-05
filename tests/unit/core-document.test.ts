import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDocument } from "../../src/core/document.ts";

describe("classifyDocument", () => {
  it("treats JSON content-type as data, even under an /api/ path", () => {
    const info = classifyDocument({
      contentType: "application/json; charset=utf-8",
      text: JSON.stringify({ users: [{ id: 1 }] }),
      hasHtmlRoot: false,
    });
    assert.equal(info.kind, "data");
    assert.match(info.contentType, /json/);
    assert.ok(info.bytes > 0);
  });

  it("treats HTML as a page even when the path looks like an API", () => {
    const info = classifyDocument({
      contentType: "text/html; charset=utf-8",
      text: "HTML under /api/",
      hasHtmlRoot: true,
    });
    assert.equal(info.kind, "html");
  });

  it("sniffs a JSON body with no HTML root", () => {
    const info = classifyDocument({
      contentType: "text/plain",
      text: '{"users":[]}',
      hasHtmlRoot: false,
    });
    assert.equal(info.kind, "data");
  });

  it("does not treat a page that mentions JSON as a payload", () => {
    const info = classifyDocument({
      contentType: "text/html",
      text: "This form posts JSON to /api/search",
      hasHtmlRoot: true,
    });
    assert.equal(info.kind, "html");
  });
});
