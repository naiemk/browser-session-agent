import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeClock } from "../../src/core/clock.ts";
import {
  clampRetryMs,
  recordFailure,
  resourceBlocked,
  withJitter,
} from "../../src/jobs/scheduler.ts";
import { emptySpec } from "../../src/jobs/spec.ts";

describe("job pacing", () => {
  it("clamps agent retries, jitters, and opens a circuit breaker", () => {
    const clock = new FakeClock();
    const spec = emptySpec("job_1", "pace", clock);
    spec.pacing = { minCooldownMs: 1000, maxCooldownMs: 10_000, circuitBreakerAfter: 2 };
    assert.equal(clampRetryMs(50, spec), 1000);
    assert.equal(clampRetryMs(50_000, spec), 10_000);
    const jittered = withJitter(1000, () => 0);
    assert.equal(jittered, 850);

    let scheduler = {
      schemaVersion: 1 as const,
      resources: {},
      grantUsage: {},
      spend: { costUsd: 0, attempts: 0, siteActions: 0 },
      updatedAt: clock.now().toISOString(),
    };
    scheduler = recordFailure(scheduler, "example.test::default", spec, clock, 1000);
    scheduler = recordFailure(scheduler, "example.test::default", spec, clock, 1000);
    assert.equal(resourceBlocked(scheduler, "example.test::default", clock.now().toISOString()), true);
    clock.advance(20_000);
    assert.equal(
      resourceBlocked(scheduler, "example.test::default", clock.now().toISOString()),
      false,
    );
  });
});
