import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapseAccessibleName, displayControlName, nameFromHref } from "../../src/core/accessible-name.ts";

describe("collapseAccessibleName", () => {
  const cases: Array<[string, string]> = [
    ["SearchSearch", "Search"],
    ["HomeHome", "Home"],
    ["Messages1Messages", "Messages 1"],
    ["Search", "Search"],
    ["Submit application", "Submit application"],
    ["  SearchSearch  ", "Search"],
    ["NavNavItem", "Nav Item"],
    ["follower37", "follower37"],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(collapseAccessibleName(input), expected);
    });
  }
});

describe("nameFromHref", () => {
  it("takes the last path segment and strips an extension", () => {
    assert.equal(nameFromHref("https://example.test/p/abc"), "abc");
    assert.equal(nameFromHref("/p/abc.jpg"), "abc");
    assert.equal(nameFromHref("/p/ada%20lovelace"), "ada lovelace");
  });
});

describe("displayControlName", () => {
  it("replaces a generic name with the href tail", () => {
    assert.equal(displayControlName("a", "https://example.test/p/abc"), "abc");
    assert.equal(displayControlName(" ", "/p/xyz"), "xyz");
    assert.equal(displayControlName("SearchSearch"), "Search");
  });
});
