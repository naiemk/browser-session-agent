/**
 * AGENT-13-T02 — host-neutral challenge / no-progress breakers.
 * The model cannot reset these; durable jobs share state via a persistence port.
 */

import type { ChallengeDetection } from "./challenge-detector.ts";
import type { BlockReason, OperationCheckpoint, OperationOutcome } from "../durable/domain/types.ts";

export type BreakerScope = "work_item" | "host" | "profile" | "session";

export interface BreakerState {
  key: string;
  scope: BreakerScope;
  openUntil?: string;
  challengeCount: number;
  distinctHosts: Set<string>;
  lastEvidenceHash?: string;
  updatedAt: string;
}

export interface ResourceCoordinatorOptions {
  hostCooldownMs?: number;
  sessionHostBudget?: number;
  sessionChallengeBudget?: number;
  now?: () => string;
}

export interface ResourceCoordinatorPort {
  get(key: string): BreakerState | undefined;
  save(state: BreakerState): void;
}

export class InMemoryResourceCoordinatorPort implements ResourceCoordinatorPort {
  private readonly store = new Map<string, BreakerState>();
  get(key: string): BreakerState | undefined {
    return this.store.get(key);
  }
  save(state: BreakerState): void {
    this.store.set(state.key, state);
  }
}

export class ResourceCoordinator {
  private readonly hostCooldownMs: number;
  private readonly sessionHostBudget: number;
  private readonly sessionChallengeBudget: number;
  private readonly now: () => string;

  constructor(
    private readonly port: ResourceCoordinatorPort = new InMemoryResourceCoordinatorPort(),
    options: ResourceCoordinatorOptions = {},
  ) {
    this.hostCooldownMs = options.hostCooldownMs ?? 60 * 60_000;
    this.sessionHostBudget = options.sessionHostBudget ?? 3;
    this.sessionChallengeBudget = options.sessionChallengeBudget ?? 5;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  isBlocked(key: string, atIso = this.now()): boolean {
    const state = this.port.get(key);
    if (!state?.openUntil) return false;
    return state.openUntil > atIso;
  }

  /**
   * Record a high-confidence challenge. Opens host breaker and updates session budget.
   * Returns blocked outcome for the current operation.
   */
  recordChallenge(input: {
    hostKey: string;
    sessionKey: string;
    profileKey?: string;
    workItemKey?: string;
    detection: ChallengeDetection;
    evidenceIds: string[];
    checkpoint: OperationCheckpoint;
    evidenceHash?: string;
  }): OperationOutcome<never> {
    const now = this.now();
    const evidenceHash = input.evidenceHash ?? input.evidenceIds.join("|");
    this.openHost(input.hostKey, now, evidenceHash);
    if (input.profileKey) this.openHost(input.profileKey, now, evidenceHash);
    if (input.workItemKey) this.openHost(input.workItemKey, now, evidenceHash);
    this.bumpSession(input.sessionKey, input.detection.host, now);

    const block: BlockReason = {
      kind: "challenge",
      confidence: input.detection.score,
      signals: input.detection.signals,
      host: input.detection.host,
    };
    return {
      status: "blocked",
      block,
      checkpoint: input.checkpoint,
      evidenceIds: input.evidenceIds,
    };
  }

  /** One explicit resume may clear a host breaker only when evidence changed. */
  tryResume(key: string, evidenceHash: string): { ok: boolean; reason?: string } {
    const state = this.port.get(key);
    if (!state?.openUntil) return { ok: true };
    if (state.lastEvidenceHash && state.lastEvidenceHash === evidenceHash) {
      return { ok: false, reason: "no_new_evidence" };
    }
    this.port.save({
      ...state,
      openUntil: undefined,
      lastEvidenceHash: evidenceHash,
      updatedAt: this.now(),
    });
    return { ok: true };
  }

  sessionExhausted(sessionKey: string): boolean {
    const state = this.port.get(sessionKey);
    if (!state) return false;
    return (
      state.distinctHosts.size >= this.sessionHostBudget ||
      state.challengeCount >= this.sessionChallengeBudget
    );
  }

  private openHost(key: string, now: string, evidenceHash?: string): void {
    const prev = this.port.get(key);
    const openUntil = new Date(Date.parse(now) + this.hostCooldownMs).toISOString();
    this.port.save({
      key,
      scope: key.startsWith("session:") ? "session" : key.startsWith("profile:") ? "profile" : "host",
      openUntil,
      challengeCount: (prev?.challengeCount ?? 0) + 1,
      distinctHosts: prev?.distinctHosts ?? new Set(),
      lastEvidenceHash: evidenceHash ?? prev?.lastEvidenceHash,
      updatedAt: now,
    });
  }

  private bumpSession(sessionKey: string, host: string, now: string): void {
    const prev = this.port.get(sessionKey) ?? {
      key: sessionKey,
      scope: "session" as const,
      challengeCount: 0,
      distinctHosts: new Set<string>(),
      updatedAt: now,
    };
    const hosts = new Set(prev.distinctHosts);
    hosts.add(host);
    this.port.save({
      ...prev,
      challengeCount: prev.challengeCount + 1,
      distinctHosts: hosts,
      updatedAt: now,
    });
  }
}

/**
 * Apply detector to an observation-shaped payload. When behavior is enabled and
 * confidence is high, override a would-be success with blocked.challenge.
 */
export function applyChallengeOutcome<T>(input: {
  detection: ChallengeDetection;
  behaviorEnabled: boolean;
  coordinator: ResourceCoordinator;
  hostKey: string;
  sessionKey: string;
  profileKey?: string;
  workItemKey?: string;
  evidenceIds: string[];
  checkpoint: OperationCheckpoint;
  completed?: OperationOutcome<T>;
}): OperationOutcome<T> {
  if (!input.behaviorEnabled || input.detection.confidence !== "high_confidence") {
    return (
      input.completed ?? {
        status: "failed",
        stage: "challenge",
        code: "challenge_possible",
        retryable: true,
        evidenceIds: input.evidenceIds,
      }
    );
  }
  return input.coordinator.recordChallenge({
    hostKey: input.hostKey,
    sessionKey: input.sessionKey,
    profileKey: input.profileKey,
    workItemKey: input.workItemKey,
    detection: input.detection,
    evidenceIds: input.evidenceIds,
    checkpoint: input.checkpoint,
  });
}

/** Evidence fields a kernel may attach on completed/failed outcomes for post-hoc classification. */
export type ObservationLike = {
  url?: string;
  title?: string;
  text?: string;
  headings?: string[];
  controlNames?: string[];
  status?: number;
  failedRequests?: string[];
  resourceUrls?: string[];
  host?: string;
};

export function observationFromOutcomeValue(value: unknown): ObservationLike | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const obs = (v.observation ?? v.facts ?? v) as Record<string, unknown>;
  if (typeof obs.url !== "string" && typeof obs.title !== "string" && typeof obs.text !== "string") {
    return undefined;
  }
  return {
    url: typeof obs.url === "string" ? obs.url : undefined,
    title: typeof obs.title === "string" ? obs.title : undefined,
    text: typeof obs.text === "string" ? obs.text : undefined,
    headings: Array.isArray(obs.headings) ? (obs.headings as string[]) : undefined,
    controlNames: Array.isArray(obs.controlNames) ? (obs.controlNames as string[]) : undefined,
    status: typeof obs.status === "number" ? obs.status : undefined,
    failedRequests: Array.isArray(obs.failedRequests) ? (obs.failedRequests as string[]) : undefined,
    resourceUrls: Array.isArray(obs.resourceUrls) ? (obs.resourceUrls as string[]) : undefined,
    host: typeof obs.host === "string" ? obs.host : undefined,
  };
}
