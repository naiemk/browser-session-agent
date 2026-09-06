import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterIdentityStats } from "../../src/core/perceive.ts";

describe("identity stats", () => {
  it("keeps only N followers|following|posts, not a handle or a year", () => {
    assert.deepEqual(
      filterIdentityStats([
        { label: "Naiem", value: "6632" },
        { label: "posts", value: "49" },
        { label: "followers", value: "141" },
        { label: "following", value: "310" },
        { label: "Instagram from Meta Messa", value: "2026" },
      ]),
      [
        { label: "posts", value: "49" },
        { label: "followers", value: "141" },
        { label: "following", value: "310" },
      ],
    );
  });
});
