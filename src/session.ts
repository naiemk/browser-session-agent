import {
  AgentError,
  BROWSER_TOOL_NAMES,
  type ActionName,
  type Expectation,
  type KnowledgeRecord,
  type Observation,
  type RunState,
  type TabRecord,
  type Verification,
  type WaitSpec,
} from "./domain/types.ts";
import { nowIso, shortId } from "./domain/ids.ts";
import { assertCanAct } from "./domain/ownership.ts";
import { evaluateActVerification, recoveryNote } from "./domain/verification.ts";
import { redactParams } from "./domain/text.ts";
import { RunStore } from "./store/run-store.ts";
import { KnowledgeStore } from "./store/knowledge-store.ts";
import { resolveHome } from "./store/paths.ts";
import { BrowserWorker } from "./worker/browser-worker.ts";

export interface SessionOptions {
  home?: string;
  cwd?: string;
  headless?: boolean;
  askUser?: (question: string) => Promise<string | undefined>;
}

export interface ActionInput {
  runId?: string;
  tabId?: string;
  action: ActionName;
  url?: string;
  ref?: string;
  text?: string;
  value?: string;
  dy?: number;
  wait?: WaitSpec;
  expect?: Expectation;
  screenshot?: "always" | "on_fail" | "never";
}

export interface ActionResult {
  observation: Observation;
  verification: Verification;
  recovery?: string;
  screenshotPath?: string;
}

export class BrowserSession {
  readonly home: string;
  readonly store: RunStore;
  readonly knowledge: KnowledgeStore;
  readonly worker: BrowserWorker;
  readonly askUserFn: SessionOptions["askUser"];
  currentRunId: string | null = null;
  previousActiveTools: string[] | null = null;
  private readonly tabs = new Map<string, TabRecord>();

  constructor(options: SessionOptions = {}) {
    this.home = options.home ?? resolveHome(options.cwd);
    this.store = new RunStore(this.home);
    this.knowledge = new KnowledgeStore(this.home);
    this.worker = new BrowserWorker({
      home: this.home,
      headless: options.headless ?? process.env.BSA_HEADLESS === "1",
    });
    this.askUserFn = options.askUser;
  }

  async startRun(goal: string, startUrl?: string): Promise<RunState> {
    await this.store.init();
    await this.worker.start();
    const runId = shortId("run");
    const tabId = this.worker.firstTabId() ?? (await this.worker.openTab());
    this.claim(tabId, runId, true);
    if (startUrl) {
      await this.worker.navigate(tabId, startUrl);
    }
    const state: RunState = {
      runId,
      goal,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ownedTabIds: [tabId],
      currentTabId: tabId,
      lastObservationId: null,
      attention: [],
      previousActiveTools: this.previousActiveTools ?? undefined,
    };
    await this.store.create(state);
    await this.store.append(runId, "run_started", { goal, startUrl, tabId }, tabId);
    this.currentRunId = runId;
    return state;
  }

  async pauseRun(runId = this.requireRunId()): Promise<RunState> {
    const state = await this.requireState(runId);
    state.status = "paused";
    state.attention = [
      {
        kind: "run_paused",
        message: "Run paused",
        createdAt: nowIso(),
      },
    ];
    await this.store.saveState(state);
    await this.store.append(runId, "run_stopped", { status: "paused" });
    return state;
  }

  async stopRun(runId = this.requireRunId(), status: RunState["status"] = "completed"): Promise<RunState> {
    const state = await this.requireState(runId);
    state.status = status;
    if (status === "completed" || status === "failed") {
      state.attention = [];
      if (this.currentRunId === runId) this.currentRunId = null;
    }
    await this.store.saveState(state);
    await this.store.append(runId, "run_stopped", { status });
    return state;
  }

  async status(): Promise<{
    worker: { pid?: number; cdpUrl?: string; alive: boolean };
    currentRun: RunState | null;
    runs: RunState[];
    tabs: TabRecord[];
    attention: RunState["attention"];
  }> {
    const runs = await this.store.listStates();
    const current = this.currentRunId ? await this.store.loadState(this.currentRunId) : runs.find((r) => r.status === "active" || r.status === "awaiting_takeover" || r.status === "paused") ?? null;
    await this.refreshTabMeta();
    return {
      worker: {
        pid: this.worker.workerInfo?.pid,
        cdpUrl: this.worker.workerInfo?.cdpUrl,
        alive: Boolean(this.worker.workerInfo),
      },
      currentRun: current,
      runs,
      tabs: [...this.tabs.values()],
      attention: current?.attention ?? [],
    };
  }

  async inspect(runId?: string, tabId?: string): Promise<Observation> {
    const state = await this.requireState(runId ?? this.requireRunId());
    const id = tabId ?? state.currentTabId ?? this.worker.firstTabId();
    if (!id) throw new AgentError("unknown_tab", "No tab to inspect");
    this.assertOwned(state, id, { allowTakeover: true });
    const observation = await this.worker.inspect(id);
    const event = await this.store.append(state.runId, "observation", { observation }, id);
    state.lastObservationId = event.id;
    state.currentTabId = id;
    await this.store.saveState(state);
    return observation;
  }

  async act(input: ActionInput): Promise<ActionResult> {
    const state = await this.requireState(input.runId ?? this.requireRunId());
    const tabId = input.tabId ?? state.currentTabId ?? this.worker.firstTabId();
    if (!tabId) throw new AgentError("unknown_tab", "No tab for action");
    const records = await this.tabRecords();
    assertCanAct(state, records, tabId);

    try {
      const before =
        input.action === "click" || input.action === "type" || input.action === "select"
          ? await this.worker.inspect(tabId)
          : undefined;
      let inputType: string | undefined;
      switch (input.action) {
        case "navigate":
          if (!input.url) throw new AgentError("invalid_action", "navigate requires url");
          await this.worker.navigate(tabId, input.url);
          break;
        case "click":
          if (!input.ref) throw new AgentError("invalid_action", "click requires ref");
          await this.worker.click(tabId, input.ref);
          break;
        case "type":
          if (!input.ref || input.text === undefined) {
            throw new AgentError("invalid_action", "type requires ref and text");
          }
          inputType = await this.worker.type(tabId, input.ref, input.text);
          break;
        case "select":
          if (!input.ref || input.value === undefined) {
            throw new AgentError("invalid_action", "select requires ref and value");
          }
          await this.worker.select(tabId, input.ref, input.value);
          break;
        case "scroll":
          await this.worker.scroll(tabId, input.ref, input.dy);
          break;
        case "wait":
          await this.worker.wait(tabId, input.wait ?? { kind: "load" });
          break;
      }

      const observation = await this.worker.inspect(tabId);
      const pageText = await this.worker.pageText(tabId);
      const verification = evaluateActVerification(input, before, observation, pageText);
      const actionEvent = await this.store.append(
        state.runId,
        "action",
        {
          action: input.action,
          params: redactParams(`browser_${input.action}`, { ...input }, inputType),
          verification,
        },
        tabId,
      );
      await this.store.append(state.runId, "observation", { observation }, tabId);
      state.lastObservationId = actionEvent.id;
      state.currentTabId = tabId;

      let note: string | undefined;
      if (verification.status === "failed") {
        note = recoveryNote(verification, observation);
        await this.store.append(
          state.runId,
          "recovery",
          { note, verification, url: observation.url },
          tabId,
        );
        state.attention = [
          {
            kind: "action_failed",
            message: note,
            tabId,
            createdAt: nowIso(),
          },
        ];
      }

      const screenshotMode = input.screenshot ?? "on_fail";
      let screenshotPath: string | undefined;
      if (screenshotMode === "always" || (screenshotMode === "on_fail" && verification.status === "failed")) {
        screenshotPath = this.store.screenshotPath(state.runId, `${actionEvent.id}.png`);
        await this.worker.screenshot(tabId, screenshotPath);
      }

      await this.store.saveState(state);
      return { observation, verification, recovery: note, screenshotPath };
    } catch (err) {
      const error = err instanceof AgentError ? err : new AgentError("action_error", String(err));
      await this.store.append(
        state.runId,
        "error",
        { code: error.code, message: error.message, details: error.details, action: input.action },
        tabId,
      );
      throw error;
    }
  }

  async askUser(
    question: string,
    runId?: string,
    providedAnswer?: string,
  ): Promise<string | undefined> {
    const state = await this.requireState(runId ?? this.requireRunId());
    state.attention = [
      {
        kind: "needs_clarification",
        message: question,
        createdAt: nowIso(),
      },
    ];
    await this.store.saveState(state);
    const answer =
      providedAnswer ?? (this.askUserFn ? await this.askUserFn(question) : undefined);
    await this.store.append(state.runId, "ask", { question, answer });
    if (answer !== undefined) {
      state.attention = [];
      await this.store.saveState(state);
    }
    return answer;
  }

  async takeover(runId?: string, tabId?: string): Promise<RunState> {
    const state = await this.requireState(runId ?? this.requireRunId());
    const id = tabId ?? state.currentTabId ?? this.worker.firstTabId();
    if (!id) throw new AgentError("unknown_tab", "No tab to take over");
    this.assertOwned(state, id, { allowTakeover: true });
    await this.worker.bringToFront(id);
    const tab = this.tabs.get(id);
    if (tab) tab.locked = false;
    state.status = "awaiting_takeover";
    state.attention = [
      {
        kind: "awaiting_takeover",
        message: "Complete the step in the focused tab, then /browser-resume",
        tabId: id,
        createdAt: nowIso(),
      },
    ];
    await this.store.saveState(state);
    await this.store.append(state.runId, "handoff", { tabId: id }, id);
    return state;
  }

  async resume(runId?: string): Promise<{ state: RunState; observation: Observation }> {
    const state = await this.requireState(runId ?? this.requireRunId());
    const tabId = state.currentTabId ?? this.worker.firstTabId();
    if (!tabId) throw new AgentError("unknown_tab", "No tab to resume");
    const tab = this.tabs.get(tabId);
    if (tab) tab.locked = true;
    state.status = "active";
    state.attention = [];
    await this.store.saveState(state);
    await this.store.append(state.runId, "resume", { tabId }, tabId);
    const observation = await this.inspect(state.runId, tabId);
    return { state, observation };
  }

  async recordTool(
    toolName: string,
    params: Record<string, unknown>,
    result: Record<string, unknown>,
    isError = false,
  ): Promise<void> {
    const runId = (typeof params.runId === "string" && params.runId) || this.currentRunId;
    if (!runId) return;
    await this.store.append(runId, isError ? "error" : "tool", {
      toolName,
      params: redactParams(toolName, params, this.worker.controlInputType(
        String(params.tabId ?? ""),
        String(params.ref ?? ""),
      )),
      result,
    });
  }

  async proposeKnowledge(input: {
    kind: KnowledgeRecord["kind"];
    text: string;
    tags?: string[];
    runId?: string;
  }): Promise<KnowledgeRecord> {
    const state = await this.requireState(input.runId ?? this.requireRunId());
    const events = await this.store.events(state.runId);
    return this.knowledge.propose({
      kind: input.kind,
      text: input.text,
      tags: input.tags,
      sourceRunId: state.runId,
      evidenceEventIds: events.slice(-5).map((e) => e.id),
      outcome: state.status,
    });
  }

  browserToolNames(): string[] {
    return [...BROWSER_TOOL_NAMES];
  }

  private claim(tabId: string, runId: string, locked: boolean): void {
    this.tabs.set(tabId, {
      tabId,
      ownerRunId: runId,
      locked,
      url: "",
      title: "",
    });
  }

  private async tabRecords(): Promise<TabRecord[]> {
    await this.refreshTabMeta();
    return [...this.tabs.values()];
  }

  private async refreshTabMeta(): Promise<void> {
    try {
      const described = await this.worker.describeTabs();
      for (const tab of described) {
        const existing = this.tabs.get(tab.tabId) ?? {
          tabId: tab.tabId,
          ownerRunId: null,
          locked: false,
          url: tab.url,
          title: tab.title,
        };
        existing.url = tab.url;
        existing.title = tab.title;
        this.tabs.set(tab.tabId, existing);
      }
    } catch {
      // worker not started
    }
  }

  private assertOwned(state: RunState, tabId: string, opts: { allowTakeover?: boolean } = {}): void {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.ownerRunId !== state.runId) {
      throw new AgentError("ownership_error", `Tab ${tabId} is not owned by run ${state.runId}`, {
        tabId,
        runId: state.runId,
        ownerRunId: tab?.ownerRunId ?? null,
      });
    }
    if (!opts.allowTakeover && !tab.locked) {
      throw new AgentError("ownership_error", `Tab ${tabId} exclusive lock is released`, { tabId });
    }
  }

  private requireRunId(): string {
    if (!this.currentRunId) {
      throw new AgentError("run_inactive", "No active browser run. Use /browser-start.");
    }
    return this.currentRunId;
  }

  private async requireState(runId: string): Promise<RunState> {
    const state = await this.store.loadState(runId);
    if (!state) {
      throw new AgentError("run_inactive", `Unknown run ${runId}`, { runId });
    }
    this.currentRunId = runId;
    if (state.currentTabId && !this.tabs.has(state.currentTabId)) {
      this.claim(state.currentTabId, state.runId, state.status === "active");
    }
    for (const tabId of state.ownedTabIds) {
      if (!this.tabs.has(tabId)) {
        this.claim(tabId, state.runId, state.status === "active");
      }
    }
    return state;
  }
}

export function parseStartArgs(args: string): { goal: string; url?: string } {
  const trimmed = args.trim();
  const urlFlag = trimmed.match(/^--url\s+(\S+)\s*(.*)$/);
  if (urlFlag) {
    return { url: urlFlag[1], goal: urlFlag[2] || `Navigate to ${urlFlag[1]}` };
  }
  const embedded = trimmed.match(/https?:\/\/\S+/);
  return { goal: trimmed, url: embedded?.[0] };
}
