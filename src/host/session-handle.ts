import { BROWSER_TOOL_NAMES, type KnowledgeRecord, type Observation, type RunState } from "../domain/types.ts";
import type { ActionInput, ActionResult } from "../session.ts";
import type { BrowserSession } from "../session.ts";

/** Methods the tool/command adapters need. Local BrowserSession and the desktop RPC proxy both satisfy this. */
export type SessionHandle = Pick<
  BrowserSession,
  | "inspect"
  | "act"
  | "askUser"
  | "takeover"
  | "resume"
  | "recordTool"
  | "proposeKnowledge"
  | "startRun"
  | "pauseRun"
  | "stopRun"
  | "status"
  | "browserToolNames"
  | "currentRunId"
  | "previousActiveTools"
  | "store"
  | "knowledge"
  | "worker"
>;

export interface RpcTransport {
  call<T>(method: string, args: unknown[]): Promise<T>;
}

export class RpcSessionHandle implements SessionHandle {
  currentRunId: string | null = null;
  previousActiveTools: string[] | null = null;

  constructor(private readonly rpc: RpcTransport) {}

  get store() {
    return {
      listStates: () => this.rpc.call<RunState[]>("store.listStates", []),
    } as SessionHandle["store"];
  }

  get knowledge() {
    return {
      search: (query: string) => this.rpc.call("knowledge.search", [query]),
      list: () => this.rpc.call("knowledge.list", []),
      setStatus: (id: string, status: "approved" | "rejected") =>
        this.rpc.call("knowledge.setStatus", [id, status]),
    } as SessionHandle["knowledge"];
  }

  get worker() {
    return {
      stop: () => this.rpc.call("worker.stop", []),
    } as SessionHandle["worker"];
  }

  inspect(runId?: string, tabId?: string): Promise<Observation> {
    return this.rpc.call("inspect", [runId, tabId]);
  }

  act(input: ActionInput): Promise<ActionResult> {
    return this.rpc.call("act", [input]);
  }

  askUser(question: string, runId?: string, providedAnswer?: string): Promise<string | undefined> {
    return this.rpc.call("askUser", [question, runId, providedAnswer]);
  }

  takeover(runId?: string, tabId?: string): Promise<RunState> {
    return this.rpc.call("takeover", [runId, tabId]);
  }

  resume(runId?: string): Promise<{ state: RunState; observation: Observation }> {
    return this.rpc.call("resume", [runId]);
  }

  recordTool(
    toolName: string,
    params: Record<string, unknown>,
    result: Record<string, unknown>,
    isError = false,
  ): Promise<void> {
    return this.rpc.call("recordTool", [toolName, params, result, isError]);
  }

  proposeKnowledge(input: {
    kind: KnowledgeRecord["kind"];
    text: string;
    tags?: string[];
    runId?: string;
  }): Promise<KnowledgeRecord> {
    return this.rpc.call("proposeKnowledge", [input]);
  }

  async startRun(goal: string, startUrl?: string): Promise<RunState> {
    const state = await this.rpc.call<RunState>("startRun", [goal, startUrl]);
    this.currentRunId = state.runId;
    return state;
  }

  async pauseRun(runId?: string): Promise<RunState> {
    return this.rpc.call("pauseRun", [runId]);
  }

  async stopRun(runId?: string, status?: RunState["status"]): Promise<RunState> {
    const state = await this.rpc.call<RunState>("stopRun", [runId, status]);
    if (this.currentRunId === state.runId) this.currentRunId = null;
    return state;
  }

  status(): Promise<Awaited<ReturnType<BrowserSession["status"]>>> {
    return this.rpc.call("status", []);
  }

  browserToolNames(): string[] {
    return [...BROWSER_TOOL_NAMES];
  }
}
