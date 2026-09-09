/**
 * Host-side progress for the interactive coder tool.
 *
 * Attempt success (exit 0, a file appeared) is not the same as the work stream
 * moving. The Magpie launch run spent an hour on differently worded harvest
 * prompts and never reached pitches; that is the case this module exists to stop.
 *
 * Status values match the core evaluator (`replan` / `retry` / `success`) so
 * the interactive path does not grow a second planning state machine. Strategy
 * changes are recorded as plan revisions when a plan.json exists, and always
 * on the session entry either way.
 */

import { hashOf } from "../../runtime/metrics.ts";
import type { ScratchListing } from "../../core/scratch.ts";

export const SUBAGENT_PROGRESS_ENTRY = "subagent-progress";

export const MAX_CONSECUTIVE_FAILURES = 2;
export const MAX_STAGNANT_ATTEMPTS = 3;
export const MAX_STAGNANT_MS = 10 * 60_000;

export const STAGNATION_CHOICES = [
  "Narrow scope",
  "Change strategy or tool",
  "Accept partial evidence",
  "Ask for missing operator input",
  "Abandon this branch",
  "Continue once (I'll give a reason)",
] as const;

export type StagnationChoice = (typeof STAGNATION_CHOICES)[number];
export type StrategyFamily = "harvest" | "extract" | "compose" | "verify" | "other";
export type ProgressEvaluation = "success" | "retry" | "replan";

export interface SemanticFingerprint {
  workStream: string;
  planStep?: number;
  deliverable: string;
  blockers: string[];
  acceptedHashes: string[];
  completion: "none" | "partial" | "complete";
  strategyFamily: StrategyFamily;
}

export interface PlanRevision {
  at: string;
  reason: string;
  from?: string;
  to?: string;
}

export interface SubagentProgressState {
  consecutiveFailures: number;
  stagnantAttempts: number;
  stagnantStartedAt?: string;
  fingerprint?: SemanticFingerprint;
  blocked?: boolean;
  blockReason?: string;
  evaluation?: ProgressEvaluation;
  continueOnce?: boolean;
  continueReason?: string;
  requiredFamily?: StrategyFamily;
  lastTask?: string;
  lastAgent?: string;
  lastElapsedMs?: number;
  lastArtifact?: string;
  lastOutcome?: "ok" | "error";
  revisions: PlanRevision[];
  lastCheckpointHashes: string[];
  lastWorking?: string;
  lastUsage?: string;
  lastModel?: string;
}

export interface FingerprintInput {
  task: string;
  planStep?: number;
  listings?: ScratchListing[];
  declaredDeliverable?: string;
}

export function emptyProgressState(): SubagentProgressState {
  return {
    consecutiveFailures: 0,
    stagnantAttempts: 0,
    revisions: [],
    lastCheckpointHashes: [],
  };
}

export function reconstructProgress(
  entries: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>,
): SubagentProgressState {
  const found = [...entries]
    .reverse()
    .find((entry) => entry.type === "custom" && entry.customType === SUBAGENT_PROGRESS_ENTRY);
  const data = found?.data;
  if (!data || typeof data !== "object") return emptyProgressState();
  const raw = data as Partial<SubagentProgressState>;
  return {
    consecutiveFailures: Number(raw.consecutiveFailures) || 0,
    stagnantAttempts: Number(raw.stagnantAttempts) || 0,
    stagnantStartedAt: typeof raw.stagnantStartedAt === "string" ? raw.stagnantStartedAt : undefined,
    fingerprint: isFingerprint(raw.fingerprint) ? raw.fingerprint : undefined,
    blocked: raw.blocked === true,
    blockReason: typeof raw.blockReason === "string" ? raw.blockReason : undefined,
    evaluation: raw.evaluation,
    continueOnce: raw.continueOnce === true,
    continueReason: typeof raw.continueReason === "string" ? raw.continueReason : undefined,
    requiredFamily: isFamily(raw.requiredFamily) ? raw.requiredFamily : undefined,
    lastTask: typeof raw.lastTask === "string" ? raw.lastTask : undefined,
    lastAgent: typeof raw.lastAgent === "string" ? raw.lastAgent : undefined,
    lastElapsedMs: typeof raw.lastElapsedMs === "number" ? raw.lastElapsedMs : undefined,
    lastArtifact: typeof raw.lastArtifact === "string" ? raw.lastArtifact : undefined,
    lastOutcome: raw.lastOutcome === "error" || raw.lastOutcome === "ok" ? raw.lastOutcome : undefined,
    revisions: Array.isArray(raw.revisions) ? raw.revisions.filter(isRevision) : [],
    lastCheckpointHashes: Array.isArray(raw.lastCheckpointHashes)
      ? raw.lastCheckpointHashes.filter((item): item is string => typeof item === "string")
      : [],
    lastWorking: typeof raw.lastWorking === "string" ? raw.lastWorking : undefined,
    lastUsage: typeof raw.lastUsage === "string" ? raw.lastUsage : undefined,
    lastModel: typeof raw.lastModel === "string" ? raw.lastModel : undefined,
  };
}

export function classifyStrategy(task: string): StrategyFamily {
  const text = task.toLowerCase();
  if (
    /\b(pitch(?:es)?|submission(?:s)?|invite(?:s)?|write-?up)\b/.test(text) &&
    /\b(write|draft|prepare|compose|edit)\b/.test(text)
  ) {
    return "compose";
  }
  if (/\b(write|draft|prepare|compose)\b/.test(text) && /\b[\w./-]+\.(md|json|txt|csv)\b/.test(text)) {
    return "compose";
  }
  if (/\b(unzip|extract|convert|parse)\b/.test(text)) return "extract";
  if (/\b(review|verify|qa)\b/.test(text) && !/\b(research|harvest|curl)\b/.test(text)) return "verify";
  if (
    /\b(research|harvest|curl|fetch|scrape|director(?:y|ies)|newsletters?|communit(?:y|ies)|product hunt|alternativeto)/i.test(
      text,
    )
  ) {
    return "harvest";
  }
  return "other";
}

export function inferDeliverable(task: string, family = classifyStrategy(task)): string {
  const named = task.match(/\b([\w./-]+\.(md|json|txt|csv))\b/i);
  if (named?.[1]) return named[1].toLowerCase();
  if (family === "compose") {
    if (/pitch/i.test(task)) return "pitches";
    if (/submission/i.test(task)) return "submissions";
    if (/invite/i.test(task)) return "invites";
    return "draft";
  }
  if (family === "harvest") return "launch-research";
  if (family === "extract") return "extracted";
  if (family === "verify") return "review";
  return "task";
}

export function inferPlanStep(task: string): number | undefined {
  const match = task.match(/\bstep\s*(\d+)\b/i) ?? task.match(/\b(?:plan\s*)?#(\d+)\b/i);
  if (!match) return undefined;
  const step = Number(match[1]);
  return Number.isFinite(step) && step > 0 ? step : undefined;
}

export function inferBlockers(task: string): string[] {
  const blockers: string[] = [];
  if (/\b(login|sign[- ]?in|auth)\b/i.test(task)) blockers.push("login");
  if (/\b(ask(?:_user)?|operator|missing input)\b/i.test(task)) blockers.push("operator-input");
  if (/\b(captcha|challenge|blocked)\b/i.test(task)) blockers.push("challenge");
  return [...new Set(blockers)].sort();
}

export function fingerprintTask(input: FingerprintInput): SemanticFingerprint {
  const family = classifyStrategy(input.task);
  const deliverable = (input.declaredDeliverable ?? inferDeliverable(input.task, family)).toLowerCase();
  const planStep = input.planStep ?? inferPlanStep(input.task);
  const acceptedHashes = checkpointHashes(deliverable, family, input.listings ?? []);
  return {
    workStream: workStreamId(family, deliverable, planStep),
    planStep,
    deliverable,
    blockers: inferBlockers(input.task),
    acceptedHashes,
    completion: completionOf(acceptedHashes),
    strategyFamily: family,
  };
}

export function workStreamId(family: StrategyFamily, deliverable: string, planStep?: number): string {
  return `${family}:${deliverable}:${planStep ?? "*"}`;
}

export function isRawHarvestFile(name: string): boolean {
  const base = name.toLowerCase();
  if (/\.(html?|log)$/.test(base)) return true;
  return /(^|\/)(raw|fetch|curl|dump|listing|harvest)[-_/]/.test(base);
}

export function isCheckpointFile(name: string, deliverable: string, family: StrategyFamily): boolean {
  const base = name.toLowerCase();
  if (isRawHarvestFile(base)) return false;
  if (deliverable.includes(".")) {
    return base === deliverable || base.endsWith(`/${deliverable}`);
  }
  if (family === "harvest") {
    return /(pitch|submission|draft|invite|tracker\.md$|plan\.md$)/.test(base);
  }
  const needle = deliverable.replace(/s$/, "");
  return needle.length > 2 && base.includes(needle);
}

export function checkpointHashes(
  deliverable: string,
  family: StrategyFamily,
  listings: ScratchListing[],
): string[] {
  return listings
    .filter((item) => isCheckpointFile(item.name, deliverable, family))
    .map((item) => hashOf(`${item.name}:${item.bytes}:${item.mtime}`))
    .sort();
}

export function latestArtifact(listings: ScratchListing[]): string | undefined {
  if (listings.length === 0) return undefined;
  const ordered = [...listings].sort((a, b) => b.mtime.localeCompare(a.mtime) || a.name.localeCompare(b.name));
  return ordered[0]?.name;
}

export interface AttemptObservation {
  fingerprint: SemanticFingerprint;
  attemptOk: boolean;
  checkpoint: boolean;
  elapsedMs: number;
  agent: string;
  task: string;
  artifact?: string;
  now?: string;
}

export interface AttemptDecision {
  evaluation: ProgressEvaluation;
  halt?: { level: "attempt" | "work-stream" | "goal"; reason: string };
  next: SubagentProgressState;
  semanticProgress: boolean;
}

/**
 * Three levels, independently: this worker, this work stream, the goal's accepted
 * deliverables. File count, tokens, and prompt rewording are not evidence.
 */
export function evaluateAttempt(
  previous: SubagentProgressState,
  observation: AttemptObservation,
): AttemptDecision {
  const sameStream =
    !previous.fingerprint || previous.fingerprint.workStream === observation.fingerprint.workStream;
  const semanticProgress = hasSemanticProgress(previous, observation);
  const next: SubagentProgressState = {
    ...previous,
    fingerprint: observation.fingerprint,
    lastTask: observation.task,
    lastAgent: observation.agent,
    lastElapsedMs: observation.elapsedMs,
    lastArtifact: observation.artifact,
    lastOutcome: observation.attemptOk ? "ok" : "error",
    lastCheckpointHashes: observation.fingerprint.acceptedHashes,
    continueOnce: false,
    continueReason: undefined,
    requiredFamily: previous.requiredFamily,
  };

  if (observation.attemptOk) {
    next.consecutiveFailures = 0;
  } else {
    next.consecutiveFailures = previous.consecutiveFailures + 1;
  }

  if (sameStream && !semanticProgress) {
    next.stagnantAttempts = previous.stagnantAttempts + 1;
    next.stagnantStartedAt = previous.stagnantStartedAt ?? observation.now ?? new Date().toISOString();
  } else {
    next.stagnantAttempts = 0;
    next.stagnantStartedAt = undefined;
  }

  if (semanticProgress && observation.fingerprint.acceptedHashes.length > 0) {
    next.evaluation = "success";
    next.blocked = false;
    next.blockReason = undefined;
    next.requiredFamily = undefined;
    return { evaluation: "success", next, semanticProgress: true };
  }

  if (!observation.attemptOk && next.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !observation.checkpoint) {
    const reason =
      `${next.consecutiveFailures} consecutive ${observation.agent} failures without a checkpoint ` +
      `(last: ${previewTask(observation.task)}).`;
    next.blocked = true;
    next.blockReason = reason;
    next.evaluation = "replan";
    return {
      evaluation: "replan",
      halt: { level: "attempt", reason },
      next,
      semanticProgress: false,
    };
  }

  const elapsedMs = stagnantElapsedMs(next, observation.now);
  if (sameStream && !semanticProgress && stagnantWindowExceeded(next, elapsedMs)) {
    const reason =
      `Work stream "${observation.fingerprint.workStream}" consumed ${next.stagnantAttempts} ` +
      `attempts with no advance of the declared deliverable (${observation.fingerprint.deliverable}).`;
    next.blocked = true;
    next.blockReason = reason;
    next.evaluation = "replan";
    return {
      evaluation: "replan",
      halt: { level: "work-stream", reason },
      next,
      semanticProgress: false,
    };
  }

  next.evaluation = "retry";
  next.blocked = false;
  next.blockReason = undefined;
  return { evaluation: "retry", next, semanticProgress };
}

export function dispatchAllowed(
  state: SubagentProgressState,
  incoming: SemanticFingerprint,
): { allow: boolean; reason?: string } {
  if (state.requiredFamily && incoming.strategyFamily !== state.requiredFamily) {
    return {
      allow: false,
      reason: `Need a ${state.requiredFamily} task; "${incoming.strategyFamily}" is the same approach in different words.`,
    };
  }
  if (state.continueOnce) return { allow: true };
  if (!state.blocked) return { allow: true };
  if (state.requiredFamily && incoming.strategyFamily === state.requiredFamily) {
    return { allow: true };
  }
  return {
    allow: false,
    reason: state.blockReason ?? "Work stream is blocked pending an operator strategy change.",
  };
}

export function applyOperatorChoice(
  state: SubagentProgressState,
  choice: string,
  reason?: string,
  now = new Date().toISOString(),
): SubagentProgressState {
  const from = state.fingerprint?.strategyFamily;
  const next: SubagentProgressState = { ...state, continueOnce: false, continueReason: undefined };
  const note = reason?.trim();

  if (choice.startsWith("Continue once")) {
    return {
      ...next,
      blocked: false,
      continueOnce: true,
      continueReason: note || "operator asked to continue once",
      consecutiveFailures: 0,
      requiredFamily: undefined,
      revisions: [...state.revisions, { at: now, reason: note || "continue once", from, to: from }],
    };
  }
  if (choice.startsWith("Change strategy")) {
    const to = note ? classifyStrategy(note) : undefined;
    return {
      ...next,
      blocked: to == null,
      stagnantAttempts: 0,
      stagnantStartedAt: undefined,
      consecutiveFailures: 0,
      requiredFamily: to,
      revisions: [...state.revisions, { at: now, reason: note || "change strategy", from, to }],
    };
  }
  if (choice.startsWith("Narrow scope")) {
    return {
      ...next,
      blocked: false,
      stagnantAttempts: 0,
      stagnantStartedAt: undefined,
      consecutiveFailures: 0,
      revisions: [...state.revisions, { at: now, reason: note || "narrow scope", from, to: from }],
    };
  }
  if (choice.startsWith("Accept partial")) {
    return {
      ...next,
      blocked: true,
      blockReason: "Operator accepted partial evidence; do not continue this stream.",
      evaluation: "success",
      revisions: [...state.revisions, { at: now, reason: note || "accept partial", from }],
    };
  }
  if (choice.startsWith("Ask for missing")) {
    return {
      ...next,
      blocked: true,
      blockReason: "Waiting for operator input before another worker.",
      evaluation: "retry",
      revisions: [...state.revisions, { at: now, reason: note || "ask operator", from }],
    };
  }
  if (choice.startsWith("Abandon")) {
    return {
      ...next,
      blocked: true,
      blockReason: "Operator abandoned this branch.",
      evaluation: "replan",
      revisions: [...state.revisions, { at: now, reason: note || "abandon branch", from }],
    };
  }
  return next;
}

export function formatHaltMessage(state: SubagentProgressState, recovery: readonly string[]): string {
  const lines = [
    "Stopped automatic coder dispatch.",
    state.blockReason ?? "No semantic progress on this work stream.",
    state.lastTask ? `Last task: ${previewTask(state.lastTask, 240)}` : undefined,
    state.lastAgent ? `Agent: ${state.lastAgent}` : undefined,
    typeof state.lastElapsedMs === "number" ? `Last elapsed: ${Math.round(state.lastElapsedMs / 1000)}s` : undefined,
    `Attempts without progress: ${state.stagnantAttempts}`,
    `Consecutive failures: ${state.consecutiveFailures}`,
    state.lastArtifact ? `Latest scratch file: ${state.lastArtifact}` : "Latest scratch file: (none)",
    `Evaluation: ${state.evaluation ?? "replan"}`,
    "",
    "Do not call subagent again for the same work stream unless the operator chose a new strategy.",
    "Recovery options:",
    ...recovery.map((item) => `- ${item}`),
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}

export function previewTask(task: string, max = 80): string {
  const flat = task.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function liveStatusLine(input: {
  agent: string;
  elapsedMs: number;
  timeoutMs?: number;
  latestTool?: string;
  turns?: number;
  running?: boolean;
  workStream?: string;
  usage?: string;
}): string {
  const parts = [input.running === false ? input.agent : `${input.agent} running`];
  parts.push(formatElapsed(input.elapsedMs));
  if (input.latestTool) parts.push(input.latestTool);
  if (input.usage) parts.push(input.usage);
  else if (input.turns) parts.push(`${input.turns} turn${input.turns === 1 ? "" : "s"}`);
  if (input.timeoutMs) parts.push(`cap ${formatElapsed(input.timeoutMs)}`);
  if (input.workStream) parts.push(input.workStream);
  return parts.join(" · ");
}

/** One line for before_agent_start so the parent can cost-plan the next slice. */
export function standingLastCoderPrompt(state: SubagentProgressState): string {
  if (!state.lastAgent && !state.lastUsage) return "";
  return [
    `Last ${state.lastAgent ?? "coder"}`,
    state.lastUsage,
    state.fingerprint?.workStream,
    state.lastArtifact,
  ].filter((item): item is string => Boolean(item)).join(" · ");
}

export function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  const minutes = ms / 60_000;
  return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`;
}

function hasSemanticProgress(previous: SubagentProgressState, observation: AttemptObservation): boolean {
  const prev = previous.fingerprint;
  if (!prev) {
    return observation.fingerprint.acceptedHashes.length > 0;
  }
  if (observation.fingerprint.planStep != null && prev.planStep != null && observation.fingerprint.planStep > prev.planStep) {
    return true;
  }
  if (rankCompletion(observation.fingerprint.completion) > rankCompletion(prev.completion)) {
    return true;
  }
  if (observation.fingerprint.blockers.length < prev.blockers.length) {
    return true;
  }
  if (hashesGrew(previous.lastCheckpointHashes, observation.fingerprint.acceptedHashes)) {
    return true;
  }
  if (
    observation.fingerprint.strategyFamily !== prev.strategyFamily &&
    previous.revisions.some((revision) => revision.to === observation.fingerprint.strategyFamily)
  ) {
    return true;
  }
  return false;
}

function stagnantWindowExceeded(state: SubagentProgressState, elapsedMs: number): boolean {
  return state.stagnantAttempts >= MAX_STAGNANT_ATTEMPTS || elapsedMs >= MAX_STAGNANT_MS;
}

function stagnantElapsedMs(state: SubagentProgressState, nowIso?: string): number {
  if (!state.stagnantStartedAt) return 0;
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  const start = Date.parse(state.stagnantStartedAt);
  if (!Number.isFinite(now) || !Number.isFinite(start)) return 0;
  return Math.max(0, now - start);
}

function hashesGrew(previous: string[], next: string[]): boolean {
  if (next.length === 0) return false;
  if (next.length > previous.length) return true;
  return next.some((hash) => !previous.includes(hash));
}

function completionOf(hashes: string[]): SemanticFingerprint["completion"] {
  if (hashes.length === 0) return "none";
  return "partial";
}

function rankCompletion(value: SemanticFingerprint["completion"]): number {
  if (value === "complete") return 2;
  if (value === "partial") return 1;
  return 0;
}

function isFamily(value: unknown): value is StrategyFamily {
  return value === "harvest" || value === "extract" || value === "compose" || value === "verify" || value === "other";
}

function isFingerprint(value: unknown): value is SemanticFingerprint {
  if (!value || typeof value !== "object") return false;
  const item = value as SemanticFingerprint;
  return typeof item.workStream === "string" && typeof item.strategyFamily === "string";
}

function isRevision(value: unknown): value is PlanRevision {
  return Boolean(value && typeof value === "object" && typeof (value as PlanRevision).reason === "string");
}
