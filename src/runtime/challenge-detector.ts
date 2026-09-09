/**
 * AGENT-13 — pure challenge classifier over redacted observation evidence.
 * Vendor names may appear in fixtures only; branching uses generic signal codes.
 */

export type ChallengeConfidence = "none" | "possible" | "high_confidence";

export type ChallengeSignalCode =
  | "challenge_title_template"
  | "verification_language"
  | "challenge_resource"
  | "access_denied_status"
  | "human_verification_control"
  | "interstitial_no_progress";

export interface ChallengeEvidence {
  url?: string;
  title?: string;
  text?: string;
  headings?: string[];
  controlNames?: string[];
  status?: number;
  failedRequests?: string[];
  resourceUrls?: string[];
  host?: string;
}

export interface ChallengeDetection {
  confidence: ChallengeConfidence;
  score: number;
  signals: ChallengeSignalCode[];
  host: string;
  detectorVersion: typeof CHALLENGE_DETECTOR_VERSION;
  summary: string;
}

export const CHALLENGE_DETECTOR_VERSION = "challenge-detector/1";

const TITLE_TEMPLATES =
  /\b(just a moment|attention required|access denied|verify you are human|checking your browser|security check|are you a robot)\b/i;

const VERIFICATION_LANGUAGE =
  /\b(verify you are (a )?human|complete the (security|captcha) check|confirm you are not a robot|unusual traffic|automated queries)\b/i;

const CHALLENGE_RESOURCE =
  /\/cdn-cgi\/challenge|\/challenge-platform\/|hcaptcha\.com|recaptcha|turnstile|challenge\.js/i;

const HUMAN_CONTROL =
  /\b(i'?m not a robot|verify|human check|security check|complete challenge)\b/i;

function hostOf(url: string | undefined, fallback?: string): string {
  if (fallback) return fallback;
  if (!url) return "unknown";
  try {
    return new URL(url).host || "unknown";
  } catch {
    return "unknown";
  }
}

function pushSignal(signals: ChallengeSignalCode[], code: ChallengeSignalCode): void {
  if (!signals.includes(code)) signals.push(code);
}

/**
 * Classify challenge likelihood. High confidence needs one strong template signal
 * or at least two independent weak signals. A lone HTTP 403 is never enough.
 */
export function detectChallenge(evidence: ChallengeEvidence): ChallengeDetection {
  const signals: ChallengeSignalCode[] = [];
  const title = evidence.title ?? "";
  const text = `${evidence.text ?? ""} ${(evidence.headings ?? []).join(" ")}`;
  const controls = (evidence.controlNames ?? []).join(" ");
  const resources = [...(evidence.resourceUrls ?? []), ...(evidence.failedRequests ?? [])].join("\n");

  const strongTitle = TITLE_TEMPLATES.test(title) || TITLE_TEMPLATES.test(text.slice(0, 400));
  if (strongTitle) pushSignal(signals, "challenge_title_template");

  if (VERIFICATION_LANGUAGE.test(text)) pushSignal(signals, "verification_language");
  if (CHALLENGE_RESOURCE.test(resources) || CHALLENGE_RESOURCE.test(evidence.url ?? "")) {
    pushSignal(signals, "challenge_resource");
  }
  if (HUMAN_CONTROL.test(controls) || HUMAN_CONTROL.test(text.slice(0, 800))) {
    pushSignal(signals, "human_verification_control");
  }
  if (evidence.status === 403 || evidence.status === 429 || evidence.status === 503) {
    pushSignal(signals, "access_denied_status");
  }
  if (
    /\b(enable javascript|checking your browser before accessing)\b/i.test(text) &&
    signals.length > 0
  ) {
    pushSignal(signals, "interstitial_no_progress");
  }

  const strong =
    signals.includes("challenge_title_template") || signals.includes("challenge_resource");
  const weakCount = signals.filter((s) => s !== "challenge_title_template" && s !== "challenge_resource")
    .length;

  let confidence: ChallengeConfidence = "none";
  let score = 0;
  if (strong && (signals.length >= 1 || weakCount >= 1)) {
    confidence = "high_confidence";
    score = strong && weakCount >= 1 ? 0.95 : 0.85;
  } else if (signals.length >= 2) {
    confidence = "high_confidence";
    score = 0.82;
  } else if (signals.length === 1) {
    confidence = "possible";
    score = 0.45;
  }

  // Lone access_denied_status stays possible at best.
  if (signals.length === 1 && signals[0] === "access_denied_status") {
    confidence = "possible";
    score = 0.35;
  }

  const host = hostOf(evidence.url, evidence.host);
  const summary =
    confidence === "none"
      ? "no challenge signals"
      : `challenge ${confidence}: ${signals.join(",")}`;

  return {
    confidence,
    score,
    signals,
    host,
    detectorVersion: CHALLENGE_DETECTOR_VERSION,
    summary,
  };
}

/** Stable hash for resume: same page + signals must not count as new evidence. */
export function evidenceHashOf(detection: ChallengeDetection, url?: string): string {
  return `${detection.host}|${url ?? ""}|${detection.signals.join(",")}|${detection.confidence}`;
}

export interface ChallengeTelemetryEvent {
  type: "challenge_candidate";
  detectorVersion: string;
  confidence: ChallengeConfidence;
  score: number;
  signals: ChallengeSignalCode[];
  host: string;
  sessionId?: string;
  operationId?: string;
  evidenceIds: string[];
  behaviorEnabled: boolean;
}

export function challengeTelemetry(
  detection: ChallengeDetection,
  meta: {
    sessionId?: string;
    operationId?: string;
    evidenceIds?: string[];
    behaviorEnabled: boolean;
  },
): ChallengeTelemetryEvent | undefined {
  if (detection.confidence === "none") return undefined;
  return {
    type: "challenge_candidate",
    detectorVersion: detection.detectorVersion,
    confidence: detection.confidence,
    score: detection.score,
    signals: detection.signals,
    host: detection.host,
    sessionId: meta.sessionId,
    operationId: meta.operationId,
    evidenceIds: meta.evidenceIds ?? [],
    behaviorEnabled: meta.behaviorEnabled,
  };
}

/** When false (default for T01), detection emits telemetry only. */
export function challengeBehaviorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BSA_CHALLENGE_BEHAVIOR === "1" || env.BSA_CHALLENGE_BEHAVIOR === "true";
}
