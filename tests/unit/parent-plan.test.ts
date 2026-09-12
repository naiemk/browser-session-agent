import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "os";
import path from "path";
import {
  admitParentPlan,
  classifyObjective,
  writeAdmittedPlan,
} from "../../src/host/parent-plan.ts";

const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true });
  }
});

describe("PARENT-01-T02 parent plan admission", () => {
  it("inserts scout → coach → harvest for harvest-shaped plans that omit them", () => {
    const admitted = admitParentPlan({
      objective: "Qualify ~50 nightlife party-goers across venues",
      planText: ["## Goal", "Qualify founders", "", "## Plan", "1. open venue pages", "2. scrape 200 profiles"].join(
        "\n",
      ),
    });
    assert.equal(admitted.class, "calibration_required");
    assert.equal(admitted.state, "admitted");
    const planBlock = admitted.admittedMarkdown.split("## Plan")[1]?.split("## Stop")[0] ?? "";
    const numbered = planBlock
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line));
    assert.match(numbered[0] ?? "", /\bscout\b/i);
    assert.match(numbered[1] ?? "", /\bcoach\b/i);
    assert.match(numbered[2] ?? "", /\bharvest\b/i);
    assert.doesNotMatch(planBlock, /^\d+\.\s+.*scrape 200/im);
    assert.match(admitted.admittedMarkdown, /deferred parent note.*scrape 200/i);
  });

  it("does not cargo-cult a coach step for known_flow (jsonlint-class)", () => {
    const admitted = admitParentPlan({
      objective: "What is the title of https://example.com/jsonlint",
      planText: "1. open the url\n2. read the title",
    });
    assert.equal(admitted.class, "known_flow");
    assert.doesNotMatch(admitted.admittedMarkdown, /\bcoach\b/i);
  });

  it("strips click/type/CSS procedure steps from the admitted operate list", () => {
    const admitted = admitParentPlan({
      objective: "Collect conference CFPs",
      planText: [
        "1. scout the listing page",
        "2. click(.submit-btn)",
        "3. type into #email",
        "4. harvest matching rows",
      ].join("\n"),
    });
    assert.ok(admitted.stripped.some((line) => /click\(/i.test(line)));
    assert.ok(admitted.stripped.some((line) => /type into/i.test(line)));
    assert.doesNotMatch(admitted.admittedMarkdown, /click\(/i);
    assert.doesNotMatch(admitted.admittedMarkdown, /type into/i);
  });

  it("blocks harvest when criteria are unsettled", () => {
    const admitted = admitParentPlan({
      objective: "figure out what we want from the site",
      planText: "1. look around",
      criteria: [],
    });
    assert.equal(admitted.class, "criteria_unsettled");
    assert.equal(admitted.state, "blocked");
    assert.equal(admitted.admittedMarkdown, "");
  });

  it("writes admitted plan.md under the goal scratch", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "bsa-parent-plan-"));
    homes.push(home);
    process.env.BSA_CORE_HOME = home;
    try {
      const admitted = admitParentPlan({
        objective: "Harvest 40 SaaS pricing pages",
        planText: "1. list vendors",
      });
      const file = await writeAdmittedPlan("goal_admit1", admitted, home);
      assert.ok(file);
      const body = await readFile(file!, "utf8");
      assert.match(body, /scout/i);
      assert.match(body, /coach/i);
      assert.match(body, /harvest/i);
    } finally {
      delete process.env.BSA_CORE_HOME;
    }
  });

  it("classifyObjective keeps known_flow away from harvest language", () => {
    assert.equal(
      classifyObjective({ objective: "single page form: check the status of my application" }),
      "known_flow",
    );
    assert.equal(
      classifyObjective({ objective: "scrape dozens of profiles and qualify them" }),
      "calibration_required",
    );
  });
});
