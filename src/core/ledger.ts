/**
 * Append-only evidence ledger, one per goal.
 *
 * Every meaningful step records intent, before, action, after, and outcome, so a
 * trace is readable without the model transcript (D7). Payloads are capped and
 * redacted on write (D22); large artifacts are file references, never inline bytes.
 */

import { appendFile, readFile } from "node:fs/promises";
import { shortId } from "./ids.ts";
import { ensureGoalDirs, goalPaths, type GoalPaths } from "./paths.ts";
import { redactDeep } from "./redact.ts";

export const MAX_PAYLOAD_CHARS = 4000;

export type LedgerEventType =
  | "goal_started"
  | "task_started"
  | "task_finished"
  | "action"
  | "check"
  | "failure"
  | "parked"
  | "resumed"
  | "probe"
  | "approval"
  /**
   * A word in the goal matched more than one thing here, and this is what was done about
   * it. Its own type because silently picking one meaning is a distinct failure from
   * getting the work wrong, and it has to be findable to be measurable.
   */
  | "fork"
  | "note";

export interface LedgerEvent {
  id: string;
  goalId: string;
  entityId?: string;
  ts: string;
  type: LedgerEventType;
  intent?: string;
  before?: {
    url: string;
    title: string;
    controls: number;
    /**
     * Whether the snapshot was cut short.
     *
     * A third of the observations in a real failing run were truncated and the evidence
     * log could not show it, so the agent looked incompetent when it was reasoning from
     * a fragment. Cheap to record, and it changes the reading of everything around it.
     */
    truncated?: true;
  };
  action?: {
    kind: string;
    ref?: string;
    url?: string;
    reversibility?: string;
    reversibilityReason?: string;
  };
  after?: { url: string; title: string; changes: string[] };
  outcome?: { ok: boolean; detail?: string };
  payload?: Record<string, unknown>;
  /** Paths to screenshots and other files. Never inline content. */
  artifacts?: string[];
}

export type LedgerInput = Omit<LedgerEvent, "id" | "ts" | "goalId">;

/**
 * Somewhere to record evidence, as opposed to the file that holds it.
 *
 * The core takes this rather than the class because a host may not know which goal it is
 * writing to until later: a chat session opens before the operator says what they want.
 * An interface lets that host supply something that resolves the goal on first write,
 * without the core knowing or caring.
 */
export interface LedgerSink {
  readonly artifactsDir: string;
  append(input: LedgerInput): Promise<LedgerEvent>;
  /** Present when the sink can be read back, which is what makes an approval stick after resume. */
  read?(): Promise<LedgerEvent[]>;
}

function capPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const redacted = redactDeep(payload);
  const serialized = JSON.stringify(redacted);
  if (serialized.length <= MAX_PAYLOAD_CHARS) return redacted;
  return {
    truncated: true,
    note: `payload exceeded ${MAX_PAYLOAD_CHARS} chars and was trimmed`,
    head: serialized.slice(0, MAX_PAYLOAD_CHARS),
  };
}

export class Ledger implements LedgerSink {
  private constructor(
    readonly goalId: string,
    private readonly paths: GoalPaths,
  ) {}

  static async open(root: string, goalId: string): Promise<Ledger> {
    const paths = goalPaths(root, goalId);
    await ensureGoalDirs(paths);
    return new Ledger(goalId, paths);
  }

  get artifactsDir(): string {
    return this.paths.artifactsDir;
  }

  async append(input: LedgerInput): Promise<LedgerEvent> {
    const event: LedgerEvent = {
      id: shortId("ev"),
      goalId: this.goalId,
      ts: new Date().toISOString(),
      ...input,
      intent: input.intent ? redactDeep(input.intent) : undefined,
      after: input.after
        ? { ...input.after, changes: input.after.changes.slice(0, 12).map((c) => redactDeep(c)) }
        : undefined,
      outcome: input.outcome
        ? { ...input.outcome, detail: input.outcome.detail ? redactDeep(input.outcome.detail) : undefined }
        : undefined,
      payload: capPayload(input.payload),
    };
    await appendFile(this.paths.eventsFile, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  async read(): Promise<LedgerEvent[]> {
    return Ledger.readFrom(this.paths.root, this.goalId);
  }

  /** Cold read: no session, no in-memory state, just the file. */
  static async readFrom(root: string, goalId: string): Promise<LedgerEvent[]> {
    const paths = goalPaths(root, goalId);
    const raw = await readFile(paths.eventsFile, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LedgerEvent);
  }
}
