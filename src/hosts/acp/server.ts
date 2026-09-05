/**
 * A thin ACP surface over the browser runtime (D55).
 *
 * Hosts that speak Agent Client Protocol spawn coding harnesses this way. We are that
 * kind of thing for a browser: the host sends a goal and gets a verdict, not click /
 * type / observe. Internal tools stay inside runTask. A committing action under "ask"
 * becomes session/request_permission, which is the gate's approve callback.
 */

import { LocalBrowser } from "../../core/browser.ts";
import { parsePredicate } from "../../core/predicates.ts";
import type { Predicate } from "../../core/types.ts";
import { Ledger } from "../../core/ledger.ts";
import { coreRoot, goalPaths } from "../../core/paths.ts";
import { GoalStore } from "../../core/state.ts";
import { evidenceForGoal } from "../../host/evidence.ts";
import { FilePayloadLog, FileRecorder } from "../../optimize/recorder.ts";
import type { ApprovalMode, ApprovalRequest } from "../../core/gate.ts";
import { shortId } from "../../core/ids.ts";
import { createLiveModel } from "../../runtime/model.ts";
import { runTask } from "../../runtime/runtime.ts";
import { perceiverByName } from "../../core/perception/index.ts";

export const ACP_PROTOCOL_VERSION = "0.1.0";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface AcpVerdict {
  status: "success" | "blocked" | "failed" | "parked";
  summary: string;
  goalId: string;
  evidence: string;
  parked?: string;
}

export interface AcpSessionConfig {
  cwd?: string;
  url?: string;
  policy?: ApprovalMode;
  criteria?: unknown[];
}

export interface AcpSession {
  id: string;
  cwd: string;
  url?: string;
  policy: ApprovalMode;
  criteria: Predicate[];
  cancelled: boolean;
}

export interface PermissionHandler {
  (request: ApprovalRequest): Promise<boolean>;
}

/** Outbound JSON-RPC to the host, used for session/request_permission. */
export type HostRpc = (method: string, params: unknown) => Promise<unknown>;

export interface PromptRunner {
  (input: {
    session: AcpSession;
    prompt: string;
    approve: PermissionHandler;
  }): Promise<AcpVerdict>;
}

export interface AcpServerOptions {
  runPrompt?: PromptRunner;
  requestPermission?: PermissionHandler;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function promptText(params: unknown): string {
  const prompt = asRecord(params).prompt;
  if (typeof prompt === "string") return prompt;
  if (!Array.isArray(prompt)) return "";
  return prompt
    .map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      return typeof record.text === "string" ? record.text : "";
    })
    .join("");
}

function parseCriteria(raw: unknown): Predicate[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((entry) =>
    typeof entry === "string" ? parsePredicate({ kind: "text_visible", text: entry }) : parsePredicate(entry),
  );
}

/** Default production runner: one goal, one browser, a verdict. */
export function livePromptRunner(): PromptRunner {
  return async ({ session, prompt, approve }) => {
    const url = session.url;
    if (!url) {
      return {
        status: "failed",
        summary: "session/new needs a start url",
        goalId: "",
        evidence: "",
      };
    }
    const root = coreRoot(session.cwd);
    const goalId = shortId("goal");
    const live = await createLiveModel({});
    const browser = await LocalBrowser.launch({
      headless: process.env.BSA_HEADLESS !== "0",
      perceiver: perceiverByName(process.env.BSA_PERCEIVER),
    });
    const ledger = await Ledger.open(root, goalId);
    const metrics = await FileRecorder.open(goalPaths(root, goalId).metricsFile);
    const payloads = await FilePayloadLog.open(goalPaths(root, goalId).payloadsFile);
    const store = await GoalStore.open(root, goalId, prompt);
    const criteria =
      session.criteria.length > 0 ? session.criteria : [{ kind: "url_includes" as const, text: "" }];
    try {
      const tab = await browser.openTab(url);
      const outcome = await runTask({
        card: {
          objective: prompt,
          criteria,
          startUrl: url,
          policy: session.policy,
        },
        stream: live.stream,
        model: live.model,
        tools: {
          browser,
          tabId: tab,
          evidence: evidenceForGoal({ root, goalId, ledger, store, metrics, payloads }),
          policy: session.policy,
          approve,
        },
      });
      const evidence = goalPaths(root, goalId).dir;
      if (outcome.parked) {
        return {
          status: "parked",
          summary: outcome.parked.reason,
          goalId,
          evidence,
          parked: outcome.parked.reason,
        };
      }
      return {
        status: outcome.report?.status ?? (outcome.error ? "failed" : "failed"),
        summary: outcome.report?.summary ?? outcome.error ?? outcome.declined ?? "no report",
        goalId,
        evidence,
      };
    } finally {
      await browser.close();
    }
  };
}

export class AcpServer {
  private readonly sessions = new Map<string, AcpSession>();
  private readonly runPrompt: PromptRunner;
  private readonly requestPermission?: PermissionHandler;
  private sendRequest?: HostRpc;

  constructor(options: AcpServerOptions = {}) {
    this.runPrompt = options.runPrompt ?? livePromptRunner();
    this.requestPermission = options.requestPermission;
  }

  /**
   * The stdio host can answer requests we send. Without this, ask-policy commits park.
   * Tests inject `requestPermission` instead and never need it.
   */
  attachHost(send: HostRpc): void {
    this.sendRequest = send;
  }

  private async approve(session: AcpSession, request: ApprovalRequest): Promise<boolean> {
    if (this.requestPermission) return this.requestPermission(request);
    if (!this.sendRequest) return false;
    const result = asRecord(
      await this.sendRequest("session/request_permission", {
        sessionId: session.id,
        toolCall: {
          toolCallId: `act-${Date.now()}`,
          title: request.reason,
          kind: "other",
          rawInput: {
            kind: request.request.kind,
            url: request.url,
            reason: request.reason,
          },
        },
        options: [
          { optionId: "allow", name: "Allow this action", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      }),
    );
    const outcome = asRecord(result.outcome);
    return outcome.outcome === "selected" && outcome.optionId === "allow";
  }

  async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
    if (message.id === undefined || message.id === null) return undefined;
    try {
      const result = await this.dispatch(message.method, message.params);
      return { jsonrpc: "2.0", id: message.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: ACP_PROTOCOL_VERSION,
          agentCapabilities: {
            loadSession: false,
            promptCapabilities: { image: false, audio: false, embeddedContext: false },
          },
          agentInfo: { name: "browser-agent", version: "0.1.0" },
        };
      case "session/new": {
        const raw = asRecord(params);
        const id = shortId("acp");
        const session: AcpSession = {
          id,
          cwd: typeof raw.cwd === "string" ? raw.cwd : process.cwd(),
          url: typeof raw.url === "string" ? raw.url : undefined,
          policy: raw.policy === "auto" || raw.policy === "never" ? raw.policy : "ask",
          criteria: parseCriteria(raw.criteria),
          cancelled: false,
        };
        this.sessions.set(id, session);
        return { sessionId: id };
      }
      case "session/prompt": {
        const raw = asRecord(params);
        const sessionId = String(raw.sessionId ?? "");
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`unknown session ${sessionId}`);
        if (session.cancelled) {
          return { stopReason: "cancelled" };
        }
        const verdict = await this.runPrompt({
          session,
          prompt: promptText(params),
          approve: (request) => this.approve(session, request),
        });
        return {
          stopReason: "end_turn",
          outcome: verdict,
        };
      }
      case "session/cancel": {
        const sessionId = String(asRecord(params).sessionId ?? "");
        const session = this.sessions.get(sessionId);
        if (session) session.cancelled = true;
        return {};
      }
      default:
        throw new Error(`method not found: ${method}`);
    }
  }
}

function contentLengthFrame(body: string): string {
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

/**
 * JSON-RPC over stdio with LSP-style Content-Length framing, which is what ACP uses.
 *
 * Host requests are handled without blocking the reader. A committing act under "ask"
 * sends `session/request_permission` back to the host and waits for the matching
 * response; awaiting `handle` inside the read loop would deadlock on that round-trip.
 */
export async function serveAcpStdio(
  server: AcpServer,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const pending = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  server.attachHost((method, params) => {
    const id = nextId++;
    output.write(contentLengthFrame(JSON.stringify({ jsonrpc: "2.0", id, method, params })));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  });

  const writeResponse = (response: JsonRpcResponse) => {
    output.write(contentLengthFrame(JSON.stringify(response)));
  };

  let buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) break;
      const body = buffer.slice(start, start + length).toString("utf8");
      buffer = buffer.slice(start + length);
      let parsed: {
        jsonrpc?: string;
        id?: number | string | null;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { code: number; message: string };
      };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        continue;
      }
      if (typeof parsed.method === "string") {
        void server.handle(parsed as JsonRpcRequest).then((response) => {
          if (response) writeResponse(response);
        });
        continue;
      }
      if (parsed.id === undefined || parsed.id === null) continue;
      const waiter = pending.get(parsed.id);
      if (!waiter) continue;
      pending.delete(parsed.id);
      if (parsed.error) waiter.reject(new Error(parsed.error.message));
      else waiter.resolve(parsed.result);
    }
  }
}
