/**
 * Trajectory digest for the strategy coach (COACH-01 … COACH-04, COACH-18 size).
 *
 * Pure: ledger + metrics + yield in, bounded JSON out. No Pi, Playwright, or files.
 * Production callers must not import `src/optimize`.
 */

import type { LedgerEvent } from "../../core/ledger.ts";
import type { MetricRecord, ObservationRecord, TurnRecord } from "../metrics.ts";
import { yieldKindOf } from "./yield.ts";

export const COACH_DIGEST_MAX_BYTES = 32_768;
export const COACH_SNAPSHOT_QUOTE_MAX = 500;
const ACTION_SUMMARY_MAX = 160;
const REJECTION_REASONS_MAX = 12;

export interface CoachCheckpoint {
  at?: string;
  eventId?: string;
}

export interface CoachDigestInput {
  events: readonly LedgerEvent[];
  metrics?: readonly MetricRecord[];
  goalText: string;
  criteria: readonly string[];
  declaredStrategy?: string;
  currentPage?: { url: string; title: string; controlCount: number };
  previousArtifact?: { summary?: string; followed?: boolean };
  remainingBudgets?: { scoutSiteActions?: number; harvestSiteActions?: number };
  checkpoint?: CoachCheckpoint;
}

export interface DigestAction {
  turn?: number;
  tool: string;
  intent?: string;
  pageIdentity?: string;
  summary: string;
  ok: boolean;
  elapsedMs?: number;
  costUsd?: number;
}

export interface NavigationCycle {
  pages: string[];
  lostPlace: boolean;
}

export interface CoachDigest {
  goal: string;
  criteria: string[];
  declaredStrategy?: string;
  counts: {
    accepted: number;
    rejected: number;
    duplicate: number;
    visitedUrls: number;
  };
  rejectionReasons: Array<{ reason: string; count: number }>;
  actions: DigestAction[];
  repeatedObservationHashes: number;
  zeroChangeReads: number;
  navigationCycles: NavigationCycle[];
  failedActions: number;
  turns: number;
  siteActions: number;
  wallMs?: number;
  costUsd?: number;
  currentPage?: { url: string; title: string; controlCount: number };
  previousStrategy?: { summary?: string; followed?: boolean };
  remainingBudgets?: CoachDigestInput["remainingBudgets"];
  snapshotQuotes: Array<{ failure: string; quote: string }>;
  lostPlace: boolean;
  truncated?: true;
}

export interface CompiledDigest {
  digest: CoachDigest;
  json: string;
  bytes: number;
  truncated: boolean;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function pageIdentity(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function eventsSince(events: readonly LedgerEvent[], checkpoint?: CoachCheckpoint): LedgerEvent[] {
  if (checkpoint?.eventId) {
    const index = events.findIndex((event) => event.id === checkpoint.eventId);
    if (index >= 0) return events.slice(index + 1);
  }
  if (checkpoint?.at) {
    const at = Date.parse(checkpoint.at);
    if (Number.isFinite(at)) {
      return events.filter((event) => {
        const ts = Date.parse(event.ts);
        return !Number.isFinite(ts) || ts >= at;
      });
    }
  }
  return [...events];
}

function yieldCounts(events: readonly LedgerEvent[]): {
  accepted: number;
  rejected: number;
  duplicate: number;
  lostPlace: boolean;
  rejectionReasons: Array<{ reason: string; count: number }>;
} {
  const histogram = new Map<string, number>();
  let accepted = 0;
  let rejected = 0;
  let duplicate = 0;
  let lostPlace = false;
  for (const event of events) {
    const kind = yieldKindOf(event);
    if (!kind) continue;
    if (kind === "candidate_accepted") accepted += 1;
    if (kind === "candidate_rejected") {
      rejected += 1;
      const reason = typeof event.payload?.reason === "string" && event.payload.reason.trim()
        ? event.payload.reason.trim()
        : (event.outcome?.detail ?? "unspecified").slice(0, 80);
      histogram.set(reason, (histogram.get(reason) ?? 0) + 1);
    }
    if (kind === "candidate_duplicate") duplicate += 1;
    if (kind === "lost_place") lostPlace = true;
  }
  const rejectionReasons = [...histogram.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, REJECTION_REASONS_MAX)
    .map(([reason, count]) => ({ reason, count }));
  return { accepted, rejected, duplicate, lostPlace, rejectionReasons };
}

function toolOf(event: LedgerEvent): string {
  if (event.type === "yield") return "yield";
  if (event.type === "probe") {
    return typeof event.payload?.peek === "string" ? "peek" : "probe";
  }
  if (event.type === "action") return event.action?.kind || "act";
  return event.type;
}

function isSiteAction(event: LedgerEvent): boolean {
  return event.type === "action";
}

function actionLine(event: LedgerEvent, index: number, previousTs?: string): DigestAction {
  const url = event.after?.url ?? event.before?.url;
  const ok = event.outcome?.ok !== false;
  const intent = event.intent ? clip(event.intent, ACTION_SUMMARY_MAX) : undefined;
  const summary = clip(event.outcome?.detail ?? event.intent ?? toolOf(event), ACTION_SUMMARY_MAX);
  let elapsedMs: number | undefined;
  if (previousTs) {
    const delta = Date.parse(event.ts) - Date.parse(previousTs);
    if (Number.isFinite(delta) && delta >= 0) elapsedMs = delta;
  }
  const turn = typeof event.payload?.turn === "number" ? event.payload.turn : index + 1;
  const costUsd = typeof event.payload?.costUsd === "number" ? event.payload.costUsd : undefined;
  return {
    turn,
    tool: toolOf(event),
    ...(intent ? { intent } : {}),
    ...(pageIdentity(url) ? { pageIdentity: pageIdentity(url) } : {}),
    summary,
    ok,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

function navigationCycles(events: readonly LedgerEvent[], lostPlace: boolean): NavigationCycle[] {
  const trail: string[] = [];
  for (const event of events) {
    if (event.type !== "action") continue;
    const url = event.after?.url ?? event.before?.url;
    const identity = pageIdentity(url);
    if (!identity) continue;
    if (trail.at(-1) !== identity) trail.push(identity);
  }
  const cycles: NavigationCycle[] = [];
  for (let i = 0; i + 2 < trail.length; i++) {
    const a = trail[i]!;
    const b = trail[i + 1]!;
    const c = trail[i + 2]!;
    if (a === c && a !== b) {
      cycles.push({ pages: [a, b, a], lostPlace });
    }
  }
  return cycles;
}

function observationStats(metrics: readonly MetricRecord[]): {
  repeatedObservationHashes: number;
  zeroChangeReads: number;
} {
  const observations = metrics.filter((record): record is ObservationRecord => record.kind === "observation");
  const counts = new Map<string, number>();
  let zeroChangeReads = 0;
  let previous: ObservationRecord | undefined;
  for (const record of observations) {
    counts.set(record.hash, (counts.get(record.hash) ?? 0) + 1);
    if (previous && previous.hash === record.hash) zeroChangeReads += 1;
    previous = record;
  }
  let repeatedObservationHashes = 0;
  for (const count of counts.values()) {
    if (count > 1) repeatedObservationHashes += 1;
  }
  return { repeatedObservationHashes, zeroChangeReads };
}

function snapshotQuotes(events: readonly LedgerEvent[]): Array<{ failure: string; quote: string }> {
  const quotes: Array<{ failure: string; quote: string }> = [];
  for (const event of events) {
    if (event.outcome?.ok !== false && event.type !== "failure") continue;
    const raw = event.payload?.quote ?? event.payload?.excerpt;
    if (typeof raw !== "string" || !raw.trim()) continue;
    quotes.push({
      failure: clip(event.intent ?? event.outcome?.detail ?? "failure", 120),
      quote: clip(raw, COACH_SNAPSHOT_QUOTE_MAX),
    });
  }
  return quotes;
}

function visitedUrls(events: readonly LedgerEvent[]): number {
  const urls = new Set<string>();
  for (const event of events) {
    const identity = pageIdentity(event.after?.url ?? event.before?.url);
    if (identity) urls.add(identity);
  }
  return urls.size;
}

function lastPage(
  events: readonly LedgerEvent[],
  fallback?: CoachDigestInput["currentPage"],
): CoachDigestInput["currentPage"] | undefined {
  if (fallback) return fallback;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    const url = event.after?.url ?? event.before?.url;
    if (!url) continue;
    return {
      url,
      title: event.after?.title ?? event.before?.title ?? "",
      controlCount: event.before?.controls ?? 0,
    };
  }
  return undefined;
}

function capDigest(digest: CoachDigest): CompiledDigest {
  let truncated = false;
  const jsonOf = (value: CoachDigest) => JSON.stringify(value);

  while (jsonOf(digest).length > COACH_DIGEST_MAX_BYTES && digest.actions.length > 0) {
    digest.actions.shift();
    digest.truncated = true;
    truncated = true;
  }
  while (jsonOf(digest).length > COACH_DIGEST_MAX_BYTES && digest.snapshotQuotes.length > 0) {
    digest.snapshotQuotes.shift();
    digest.truncated = true;
    truncated = true;
  }
  while (jsonOf(digest).length > COACH_DIGEST_MAX_BYTES && digest.rejectionReasons.length > 1) {
    digest.rejectionReasons.pop();
    digest.truncated = true;
    truncated = true;
  }

  const json = jsonOf(digest);
  return { digest, json, bytes: json.length, truncated };
}

export function compileDigest(input: CoachDigestInput): CompiledDigest {
  const events = eventsSince(input.events, input.checkpoint);
  const metrics = input.metrics ?? [];
  const yields = yieldCounts(events);
  const actionEvents = events.filter(
    (event) => event.type === "action" || event.type === "probe" || event.type === "yield" || event.type === "failure",
  );
  const actions: DigestAction[] = [];
  for (let i = 0; i < actionEvents.length; i++) {
    const event = actionEvents[i]!;
    actions.push(actionLine(event, i, i > 0 ? actionEvents[i - 1]?.ts : undefined));
  }

  const turns = metrics.filter((record): record is TurnRecord => record.kind === "turn");
  const costUsd = turns.reduce((sum, record) => sum + record.costUsd, 0);
  const firstTs = events[0] ? Date.parse(events[0].ts) : Number.NaN;
  const lastTs = events.at(-1) ? Date.parse(events.at(-1)!.ts) : Number.NaN;
  const wallMs =
    Number.isFinite(firstTs) && Number.isFinite(lastTs) && lastTs >= firstTs ? lastTs - firstTs : undefined;
  const obs = observationStats(metrics);
  const currentPage = lastPage(events, input.currentPage);

  const digest: CoachDigest = {
    goal: clip(input.goalText, 1500),
    criteria: input.criteria.map((item) => clip(item, 400)),
    counts: {
      accepted: yields.accepted,
      rejected: yields.rejected,
      duplicate: yields.duplicate,
      visitedUrls: visitedUrls(events),
    },
    rejectionReasons: yields.rejectionReasons,
    actions,
    repeatedObservationHashes: obs.repeatedObservationHashes,
    zeroChangeReads: obs.zeroChangeReads,
    navigationCycles: navigationCycles(events, yields.lostPlace),
    failedActions: events.filter((event) => event.type === "failure" || event.outcome?.ok === false).length,
    turns: turns.length || events.length,
    siteActions: events.filter(isSiteAction).length,
    snapshotQuotes: snapshotQuotes(events),
    lostPlace: yields.lostPlace,
    ...(input.declaredStrategy ? { declaredStrategy: clip(input.declaredStrategy, 400) } : {}),
    ...(wallMs !== undefined ? { wallMs } : {}),
    ...(turns.length > 0 ? { costUsd } : {}),
    ...(currentPage ? { currentPage } : {}),
    ...(input.previousArtifact ? { previousStrategy: input.previousArtifact } : {}),
    ...(input.remainingBudgets ? { remainingBudgets: input.remainingBudgets } : {}),
  };

  return capDigest(digest);
}
