export type RunStatus =
  | "active"
  | "paused"
  | "awaiting_takeover"
  | "completed"
  | "failed";

export type AttentionKind =
  | "needs_clarification"
  | "awaiting_takeover"
  | "action_failed"
  | "run_paused";

export interface AttentionItem {
  kind: AttentionKind;
  message: string;
  tabId?: string;
  createdAt: string;
}

export interface TabRecord {
  tabId: string;
  ownerRunId: string | null;
  locked: boolean;
  url: string;
  title: string;
}

export interface Control {
  ref: string;
  role: string;
  name: string;
  tag: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  inputType?: string;
}

export interface Observation {
  id: string;
  tabId: string;
  url: string;
  title: string;
  controls: Control[];
  dialogs: string[];
  errors: string[];
  consoleErrors: string[];
  recentChanges: string[];
  truncated?: boolean;
}

export interface Expectation {
  urlIncludes?: string;
  titleIncludes?: string;
  textVisible?: string;
  refExists?: string;
  dialogOpen?: boolean;
  noConsoleError?: boolean;
}

export type VerificationStatus = "passed" | "failed" | "inconclusive";

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Verification {
  status: VerificationStatus;
  checks: VerificationCheck[];
}

export type ActionName =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "scroll"
  | "wait";

export interface WaitSpec {
  kind: "load" | "url" | "text" | "ref" | "timeout";
  value?: string;
  timeoutMs?: number;
}

export type EventType =
  | "run_started"
  | "run_stopped"
  | "observation"
  | "action"
  | "tool"
  | "error"
  | "recovery"
  | "handoff"
  | "ask"
  | "resume";

export interface RunEvent {
  id: string;
  ts: string;
  type: EventType;
  runId: string;
  tabId?: string;
  data: Record<string, unknown>;
}

export interface RunState {
  runId: string;
  goal: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  ownedTabIds: string[];
  currentTabId: string | null;
  lastObservationId: string | null;
  attention: AttentionItem[];
  previousActiveTools?: string[];
}

export interface WorkerInfo {
  pid: number;
  cdpUrl: string;
  port: number;
  profileDir: string;
  startedAt: string;
}

export interface KnowledgeRecord {
  id: string;
  kind: "user_fact" | "strategy";
  text: string;
  tags: string[];
  status: "candidate" | "approved" | "rejected";
  sourceRunId: string;
  evidenceEventIds: string[];
  outcome?: RunStatus;
  createdAt: string;
  approvedAt?: string;
}

export class AgentError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
  }
}

export const BROWSER_TOOL_NAMES = [
  "browser_inspect",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_select",
  "browser_scroll",
  "browser_wait",
  "browser_ask_user",
  "browser_takeover",
  "browser_resume",
  "browser_knowledge_search",
  "browser_knowledge_propose",
] as const;

export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];
