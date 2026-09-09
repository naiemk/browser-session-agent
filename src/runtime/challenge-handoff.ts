/**
 * AGENT-13-T03 — interactive challenge halt.
 *
 * Telemetry still fires with the flag off. Takeover, halt, and blocked.challenge
 * replies require BSA_CHALLENGE_BEHAVIOR.
 */

import type { Observation } from "../core/types.ts";
import type { LedgerSink } from "../core/ledger.ts";
import type { OperationCheckpoint } from "../durable/domain/types.ts";
import type { MetricsSink } from "./metrics.ts";
import type { WireObservation } from "./wire.ts";
import {
  challengeBehaviorEnabled,
  challengeTelemetry,
  detectChallenge,
  evidenceHashOf,
  type ChallengeDetection,
  type ChallengeEvidence,
} from "./challenge-detector.ts";
import {
  applyChallengeOutcome,
  sharedChallengeCoordinator,
  type ResourceCoordinator,
} from "./resource-coordinator.ts";

export { evidenceHashOf };

export function challengeEvidenceFromWire(observation: WireObservation): ChallengeEvidence {
  return {
    url: observation.url,
    title: observation.title,
    text: [
      observation.identity?.heading,
      ...(observation.errors ?? []),
      ...(observation.dialogs ?? []),
      ...(observation.changes ?? []),
    ]
      .filter(Boolean)
      .join(" "),
    headings: observation.identity?.heading ? [observation.identity.heading] : undefined,
    controlNames: observation.controls.map((control) => control.name),
    failedRequests: observation.failedRequests,
    host: hostOf(observation.url),
  };
}

export function challengeEvidenceFromObservation(observation: Observation): ChallengeEvidence {
  return {
    url: observation.url,
    title: observation.title,
    text: [observation.identity?.heading, ...observation.errors, ...observation.dialogs].join(" "),
    headings: observation.identity?.heading ? [observation.identity.heading] : undefined,
    controlNames: observation.controls.map((control) => control.name),
    failedRequests: observation.failedRequests,
    host: hostOf(observation.url),
  };
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export interface ParkedChallenge {
  host: string;
  checkpoint: OperationCheckpoint;
  evidenceHash: string;
  detection: ChallengeDetection;
}

export interface ChallengeTakeoverInfo {
  host: string;
  tabId?: string;
  detection: ChallengeDetection;
  checkpoint: OperationCheckpoint;
}

export class InteractiveChallengeGuard {
  halted = false;
  parked?: ParkedChallenge;
  parkedAt?: string;
  /** After a successful unhalt, the parked intent may be retried once. */
  intentRetriesLeft = 0;

  constructor(
    private readonly sessionKeyRef: string | (() => string),
    private readonly coordinator: ResourceCoordinator = sharedChallengeCoordinator(),
    private readonly onTakeover?: (info: ChallengeTakeoverInfo) => Promise<void>,
  ) {}

  private sessionKey(): string {
    return typeof this.sessionKeyRef === "string" ? this.sessionKeyRef : this.sessionKeyRef();
  }

  blockedReply(): {
    ok: false;
    blocked: {
      kind: "challenge";
      host: string;
      confidence: number;
      signals: string[];
      awaiting_takeover: true;
    };
    note: string;
  } {
    const parked = this.parked;
    return {
      ok: false,
      blocked: {
        kind: "challenge",
        host: parked?.host ?? "unknown",
        confidence: parked?.detection.score ?? 0,
        signals: parked?.detection.signals ?? [],
        awaiting_takeover: true,
      },
      note: "Challenge page. Stop. Operator takeover required. Do not retry this host until after a fresh observation.",
    };
  }

  /**
   * Classify every observation. Returns a tool reply to substitute when behavior is on
   * and the page is a high-confidence challenge (or the session is already halted).
   */
  async afterObservation(input: {
    observation: WireObservation;
    intent: string;
    evidenceIds: string[];
    tabId?: string;
    ledger?: LedgerSink;
    metrics?: MetricsSink;
    entityId?: string;
  }): Promise<ReturnType<InteractiveChallengeGuard["blockedReply"]> | undefined> {
    const evidence = challengeEvidenceFromWire(input.observation);
    const detection = detectChallenge(evidence);
    const telemetry = challengeTelemetry(detection, {
      sessionId: this.sessionKey(),
      evidenceIds: input.evidenceIds,
      behaviorEnabled: challengeBehaviorEnabled(),
    });
    if (telemetry) {
      console.info(JSON.stringify({ channel: "challenge_candidate", ...telemetry }));
    }

    if (!challengeBehaviorEnabled()) return undefined;

    if (this.halted) {
      if (detection.confidence === "high_confidence") return this.blockedReply();
      const hash = evidenceHashOf(detection, input.observation.url);
      const resume = this.coordinator.tryResume(`host:${this.parked?.host ?? detection.host}`, hash);
      if (!resume.ok) return this.blockedReply();
      const at = new Date().toISOString();
      const blockedMs =
        this.parkedAt && Number.isFinite(Date.parse(this.parkedAt))
          ? Date.parse(at) - Date.parse(this.parkedAt)
          : undefined;
      input.metrics?.record({
        kind: "challenge_handoff",
        at,
        phase: "resume",
        host: this.parked?.host ?? detection.host,
        ...(blockedMs !== undefined ? { blockedMs } : {}),
      });
      await input.ledger?.append({
        type: "resumed",
        entityId: input.entityId,
        intent: `challenge ${this.parked?.host ?? detection.host}`,
        after: { url: input.observation.url, title: input.observation.title, changes: [] },
        outcome: { ok: true, detail: "challenge cleared" },
        payload: {
          kind: "challenge",
          host: this.parked?.host ?? detection.host,
          ...(blockedMs !== undefined ? { blockedMs } : {}),
        },
      });
      this.halted = false;
      this.intentRetriesLeft = 1;
      return undefined;
    }

    if (detection.confidence !== "high_confidence") return undefined;

    const checkpoint: OperationCheckpoint = {
      intent: input.intent,
      pageIdentity: input.observation.url,
      evidenceIds: input.evidenceIds,
    };
    applyChallengeOutcome({
      detection,
      behaviorEnabled: true,
      coordinator: this.coordinator,
      hostKey: `host:${detection.host}`,
      sessionKey: this.sessionKey(),
      evidenceIds: input.evidenceIds,
      evidenceHash: evidenceHashOf(detection, input.observation.url),
      checkpoint,
    });
    this.halted = true;
    this.parkedAt = new Date().toISOString();
    this.parked = {
      host: detection.host,
      checkpoint,
      evidenceHash: evidenceHashOf(detection, input.observation.url),
      detection,
    };
    this.intentRetriesLeft = 0;
    input.metrics?.record({
      kind: "challenge_handoff",
      at: this.parkedAt,
      phase: "park",
      host: detection.host,
    });
    await this.onTakeover?.({
      host: detection.host,
      tabId: input.tabId,
      detection,
      checkpoint,
    }).catch(() => undefined);
    if (this.onTakeover) {
      input.metrics?.record({
        kind: "challenge_handoff",
        at: this.parkedAt,
        phase: "takeover",
        host: detection.host,
      });
    }
    await input.ledger?.append({
      type: "parked",
      entityId: input.entityId,
      intent: `challenge ${detection.host}`,
      after: { url: input.observation.url, title: input.observation.title, changes: [] },
      outcome: { ok: false, detail: detection.summary },
      payload: {
        kind: "challenge",
        host: detection.host,
        signals: detection.signals,
        confidence: detection.score,
        awaiting_takeover: true,
      },
    });
    return this.blockedReply();
  }
}
