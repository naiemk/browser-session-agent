export interface TurnAttribution {
  attemptId: string;
  provider: string;
  model: string;
  phase: "planning" | "execution" | "exception" | "review";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: string;
  endedAt: string;
}

export interface WallTimeBuckets {
  queueMs: number;
  pacingMs: number;
  unavailableMs: number;
  humanMs: number;
  challengeMs: number;
  browserMs: number;
  modelMs: number;
  evaluationMs: number;
  reviewMs: number;
}

export interface CostRollup {
  attemptedCases: number;
  completedCases: number;
  verifiedCases: number;
  acceptedCases: number;
  costUsd: number;
}

export function costPerAccepted(rollup: CostRollup): number | null {
  if (rollup.acceptedCases <= 0) return null;
  return rollup.costUsd / rollup.acceptedCases;
}

export function sumWallBuckets(b: WallTimeBuckets): number {
  return (
    b.queueMs +
    b.pacingMs +
    b.unavailableMs +
    b.humanMs +
    b.challengeMs +
    b.browserMs +
    b.modelMs +
    b.evaluationMs +
    b.reviewMs
  );
}

export function attributeTurns(turns: TurnAttribution[]): Record<string, { turns: number; costUsd: number }> {
  const out: Record<string, { turns: number; costUsd: number }> = {};
  for (const turn of turns) {
    const key = `${turn.provider}/${turn.model}@${turn.phase}`;
    const cur = out[key] ?? { turns: 0, costUsd: 0 };
    cur.turns += 1;
    cur.costUsd += turn.costUsd;
    out[key] = cur;
  }
  return out;
}

/** OBS-04 — phase-scoped tool capability sets (no last-writer-wins merge). */
export function capabilitiesForPhase(phase: TurnAttribution["phase"]): string[] {
  switch (phase) {
    case "planning":
      return ["job_read", "job_update_draft", "job_propose_plan"];
    case "execution":
      return ["act", "observe", "probe"];
    case "exception":
      return ["act", "observe", "ask_human"];
    case "review":
      return ["job_read", "review_sample"];
  }
}
