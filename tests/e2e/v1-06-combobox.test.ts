import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { selectCountryUnitedStates } from "../../src/plan/examples.ts";
import {
  closeV1,
  connectPaidConsumer,
  startV1Api,
  waitFor,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

async function runCountryPlan(mode: string) {
  const world = await withFixture(await startV1Api());
  worlds.push(world);
  const { chat, hub } = await connectPaidConsumer(world);
  chat.send({
    type: "command",
    name: "browser-start",
    args: `--url ${world.fixtureOrigin}/combobox?mode=${mode} select country`,
  });
  await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
  const result = await hub.call<{
    status: string;
    actuals: string[];
    escalateReason?: string;
  }>("runPlan", [selectCountryUnitedStates]);
  const observation = await hub.call<{
    controls: Array<{ name: string; value?: string }>;
  }>("inspect", []);
  const country = observation.controls.find((c) => /^country$/i.test(c.name) || c.name.startsWith("Country"));
  return { chat, result, value: country?.value ?? "", actuals: result.actuals.join("\n") };
}

describe("V1-06-T02 country combobox fixture", () => {
  it("selects exact United States when it is first", async () => {
    const { chat, result, value, actuals } = await runCountryPlan("united-states-first");
    try {
      assert.equal(result.status, "completed");
      assert.equal(value, "United States");
      assert.notEqual(value, "United States of America");
      assert.match(actuals, /type_united_states: accepted/);
    } finally {
      chat.close();
    }
  });

  it("falls back to USA and records the miss", async () => {
    const { chat, result, value, actuals } = await runCountryPlan("usa-only");
    try {
      assert.equal(result.status, "completed");
      assert.equal(value, "USA");
      assert.match(actuals, /type_united_states: not yet/);
      assert.match(actuals, /type_usa: accepted/);
    } finally {
      chat.close();
    }
  });

  it("scrolls the open list when typing does not filter", async () => {
    const { chat, result, value, actuals } = await runCountryPlan("scroll-only");
    try {
      assert.equal(result.status, "completed", actuals);
      assert.ok(
        value === "United States of America" || value === "United States",
        `expected a known scrolled label, got ${value}`,
      );
      assert.match(actuals, /scroll_known_labels: accepted/);
    } finally {
      chat.close();
    }
  });

  it("escalates with actuals when every branch misses", async () => {
    const { chat, result, value, actuals } = await runCountryPlan("none");
    try {
      assert.equal(result.status, "escalated");
      assert.equal(value, "");
      assert.match(actuals, /type_united_states/);
      assert.match(actuals, /scroll_until gave up/);
    } finally {
      chat.close();
    }
  });
});
