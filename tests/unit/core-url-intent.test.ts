import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathSegmentMatches, urlMatchesIntent } from "../../src/core/url-intent.ts";

const CASES: Array<{ actual: string; target: string; match: boolean; why: string }> = [
  {
    actual: "https://example.test/jobs",
    target: "https://example.test/jobs",
    match: true,
    why: "exact",
  },
  {
    actual: "https://example.test/jobs/",
    target: "https://example.test/jobs",
    match: true,
    why: "trailing slash on actual",
  },
  {
    actual: "https://example.test/jobs",
    target: "https://example.test/jobs/",
    match: true,
    why: "trailing slash on target",
  },
  {
    actual: "https://example.test/p/ada%20lovelace",
    target: "https://example.test/p/ada lovelace",
    match: true,
    why: "percent-encoding",
  },
  {
    actual: "https://example.test/reel/abc",
    target: "https://example.test/reels/abc",
    match: true,
    why: "last-segment plural",
  },
  {
    actual: "https://example.test/reels/abc",
    target: "https://example.test/reel/abc",
    match: true,
    why: "last-segment singular",
  },
  {
    actual: "https://example.test/p/abc",
    target: "https://example.test/reels/abc",
    match: false,
    why: "different stems",
  },
  {
    actual: "https://other.test/jobs",
    target: "https://example.test/jobs",
    match: false,
    why: "host mismatch",
  },
  {
    actual: "https://example.test/jobs/42",
    target: "https://example.test/jobs",
    match: true,
    why: "nested path still matches a prefix",
  },
  {
    actual: "https://example.test/login",
    target: "https://example.test/go-jobs",
    match: false,
    why: "redirect to a different path",
  },
];

describe("urlMatchesIntent", () => {
  for (const row of CASES) {
    it(`${row.why}: ${row.target} vs ${row.actual}`, () => {
      assert.equal(urlMatchesIntent(row.actual, row.target), row.match);
    });
  }

  it("treats reel/reels as the same segment, not p/reels", () => {
    assert.equal(pathSegmentMatches("reel", "reels"), true);
    assert.equal(pathSegmentMatches("reels", "reel"), true);
    assert.equal(pathSegmentMatches("p", "reels"), false);
  });
});
