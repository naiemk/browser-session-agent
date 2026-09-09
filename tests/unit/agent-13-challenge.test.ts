import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  challengeBehaviorEnabled,
  challengeTelemetry,
  detectChallenge,
} from "../../src/runtime/challenge-detector.ts";
import {
  applyChallengeOutcome,
  ResourceCoordinator,
} from "../../src/runtime/resource-coordinator.ts";

describe("AGENT-13 ChallengeDetector", () => {
  it("treats lone 403 as possible, not high confidence", () => {
    const d = detectChallenge({ url: "https://ex.test/x", status: 403, title: "Forbidden" });
    assert.equal(d.confidence, "possible");
    assert.deepEqual(d.signals, ["access_denied_status"]);
  });

  it("marks high confidence on challenge title + verification language", () => {
    const d = detectChallenge({
      url: "https://jobs.ex.test/apply",
      title: "Just a moment...",
      text: "Verify you are human before continuing",
      host: "jobs.ex.test",
    });
    assert.equal(d.confidence, "high_confidence");
    assert.ok(d.signals.includes("challenge_title_template"));
    assert.ok(d.signals.includes("verification_language"));
  });

  it("marks high confidence on challenge resource alone as strong signal", () => {
    const d = detectChallenge({
      url: "https://ex.test/",
      title: "Home",
      resourceUrls: ["https://ex.test/cdn-cgi/challenge-platform/h/b/"],
    });
    assert.equal(d.confidence, "high_confidence");
    assert.ok(d.signals.includes("challenge_resource"));
  });

  it("returns none for ordinary pages", () => {
    const d = detectChallenge({
      url: "https://ex.test/jobs",
      title: "Open roles",
      text: "Software engineer positions",
      controlNames: ["Search", "Filter"],
      status: 200,
    });
    assert.equal(d.confidence, "none");
  });

  it("emits telemetry for candidates without enabling behavior by default", () => {
    assert.equal(challengeBehaviorEnabled({}), false);
    const d = detectChallenge({
      title: "Attention Required",
      text: "Confirm you are not a robot",
      url: "https://ex.test/",
    });
    const event = challengeTelemetry(d, {
      sessionId: "s1",
      operationId: "op1",
      evidenceIds: ["ev1"],
      behaviorEnabled: false,
    });
    assert.ok(event);
    assert.equal(event!.type, "challenge_candidate");
    assert.equal(event!.behaviorEnabled, false);
    assert.equal(event!.detectorVersion, d.detectorVersion);
  });
});

describe("AGENT-13 blocked.challenge + breakers", () => {
  it("overrides completed navigation with blocked.challenge when behavior enabled", () => {
    const coordinator = new ResourceCoordinator();
    const detection = detectChallenge({
      url: "https://blocked.ex/apply",
      title: "Just a moment...",
      text: "Checking your browser before accessing",
      resourceUrls: ["https://blocked.ex/cdn-cgi/challenge-platform/x"],
    });
    assert.equal(detection.confidence, "high_confidence");
    const outcome = applyChallengeOutcome({
      detection,
      behaviorEnabled: true,
      coordinator,
      hostKey: "host:blocked.ex",
      sessionKey: "session:1",
      evidenceIds: ["ev-ch"],
      checkpoint: { intent: "navigate_apply", evidenceIds: ["ev-ch"] },
      completed: { status: "completed", value: { url: "https://blocked.ex/apply" }, evidenceIds: ["ev-ch"] },
    });
    assert.equal(outcome.status, "blocked");
    if (outcome.status === "blocked") {
      assert.equal(outcome.block.kind, "challenge");
      assert.ok(outcome.block.confidence >= 0.8);
    }
    assert.equal(coordinator.isBlocked("host:blocked.ex"), true);
  });

  it("blocks subsequent same-host calls while breaker is open", () => {
    const coordinator = new ResourceCoordinator();
    const detection = detectChallenge({
      title: "Just a moment...",
      text: "Verify you are human",
      url: "https://a.test/",
    });
    applyChallengeOutcome({
      detection,
      behaviorEnabled: true,
      coordinator,
      hostKey: "host:a.test",
      sessionKey: "session:x",
      evidenceIds: ["e1"],
      checkpoint: { intent: "open", evidenceIds: ["e1"] },
    });
    assert.equal(coordinator.isBlocked("host:a.test"), true);
    assert.equal(coordinator.tryResume("host:a.test", "e1").ok, false);
    assert.equal(coordinator.tryResume("host:a.test", "e2").ok, true);
  });

  it("trips session budget across distinct hosts", () => {
    const coordinator = new ResourceCoordinator(undefined, { sessionHostBudget: 2 });
    for (const host of ["h1.test", "h2.test"]) {
      applyChallengeOutcome({
        detection: detectChallenge({
          title: "Just a moment...",
          text: "Verify you are human",
          url: `https://${host}/`,
          host,
        }),
        behaviorEnabled: true,
        coordinator,
        hostKey: `host:${host}`,
        sessionKey: "session:budget",
        evidenceIds: [`e-${host}`],
        checkpoint: { intent: "open", evidenceIds: [] },
      });
    }
    assert.equal(coordinator.sessionExhausted("session:budget"), true);
  });

  it("does not change outcomes when behavior is disabled", () => {
    const coordinator = new ResourceCoordinator();
    const detection = detectChallenge({
      title: "Just a moment...",
      text: "Verify you are human",
      url: "https://quiet.test/",
    });
    const completed = {
      status: "completed" as const,
      value: { ok: true },
      evidenceIds: ["ev"],
    };
    const outcome = applyChallengeOutcome({
      detection,
      behaviorEnabled: false,
      coordinator,
      hostKey: "host:quiet.test",
      sessionKey: "session:quiet",
      evidenceIds: ["ev"],
      checkpoint: { intent: "nav", evidenceIds: ["ev"] },
      completed,
    });
    assert.equal(outcome.status, "completed");
    assert.equal(coordinator.isBlocked("host:quiet.test"), false);
  });
});
