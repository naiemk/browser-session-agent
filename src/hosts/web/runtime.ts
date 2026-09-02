import { AuthStorage, createAgentSession, defineTool, getAgentDir, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";
import { bindBrowserExtension } from "../../host/bind-extension.ts";
import { createExtensionApi, extensionContext, MemoryOperatorHost } from "../../host/memory-host.ts";
import { RpcSessionHandle } from "../../host/session-handle.ts";
import type { ExtensionAPI, RegisteredTool } from "../../pi-api.ts";
import type { ChatClientMessage, ChatServerMessage, OperatorState } from "../shared/protocol.ts";
import { resolveCostExtensions } from "./pi-packages.ts";
import { applyHostedApiKeys, assistantErrorFromEvent, capHostedModelOutput } from "./hosted-pi.ts";
import type { NodeHub } from "./hub.ts";
import { AgentError } from "../../domain/types.ts";

export interface OperatorRuntimeOptions {
  cwd?: string;
  agentDir?: string;
  sessionDir?: string;
  requirePaid?: boolean;
  paid?: boolean | (() => boolean);
  /** Test-only: delay before Pi boot. Does not block chat hello. */
  startDelayMs?: number;
  /** Fail the wait for start() after this many ms. Boot may still finish later. */
  startTimeoutMs?: number;
}

let piStartLock: Promise<void> = Promise.resolve();

function withPiStartLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = piStartLock.then(fn, fn);
  piStartLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OperatorRuntime {
  readonly host = new MemoryOperatorHost();
  readonly api: ExtensionAPI & {
    tools: Map<string, import("../../pi-api.ts").RegisteredTool>;
    commands: Map<string, import("../../pi-api.ts").RegisteredCommand>;
  };
  readonly handle: RpcSessionHandle;
  private pi: PiLike | null = null;
  private modelRegistry: ModelRegistry | null = null;
  private unsubscribePi: (() => void) | null = null;
  private send: (message: ChatServerMessage) => void;
  private readonly hub: NodeHub;
  private readonly options: OperatorRuntimeOptions;
  private startPromise: Promise<void> | null = null;
  piReady = false;
  piReason: string | null = null;

  get starting(): boolean {
    return this.startPromise !== null && !this.piReady && this.piReason === null;
  }
  sessionId = `sess_${Date.now().toString(36)}`;
  model = "auto";
  thinking = "medium";
  private models: Array<{ id: string; label: string }> = [
    { id: "auto", label: "Pi Router (Auto)" },
    { id: "low", label: "@low" },
    { id: "medium", label: "@medium" },
    { id: "high", label: "@high" },
    { id: "ultra", label: "@ultra" },
  ];

  constructor(hub: NodeHub, send: (message: ChatServerMessage) => void, options: OperatorRuntimeOptions = {}) {
    this.hub = hub;
    this.send = send;
    this.options = options;
    this.handle = new RpcSessionHandle(hub);
    const startRun = this.handle.startRun.bind(this.handle);
    this.handle.startRun = async (goal: string, startUrl?: string) => {
      if (this.options.requirePaid && !this.isPaid()) {
        throw new AgentError("payment_required", "Pay to start a browser run.");
      }
      return startRun(goal, startUrl);
    };
    this.api = createExtensionApi(this.host);
    bindBrowserExtension(this.api, this.handle);
    this.host.listeners = {
      onNotify: (message, level) => this.send({ type: "notify", message, level }),
      onUiRequest: (request) => this.send({ type: "ui_request", ...request }),
      onToolsChanged: () => this.send({ type: "stateSync", state: this.state() }),
    };
  }

  setSend(send: (message: ChatServerMessage) => void): void {
    this.send = send;
  }

  state(): OperatorState {
    return {
      sessionId: this.sessionId,
      model: this.model,
      thinking: this.thinking,
      activeTools: this.host.getActiveTools(),
      nodeConnected: this.hub.connected,
      takeover: this.hub.takeover,
      currentRunId: this.handle.currentRunId,
    };
  }

  private isPaid(): boolean {
    const paid = this.options.paid;
    return typeof paid === "function" ? paid() : Boolean(paid);
  }

  async start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.startOnce();
    return this.startPromise;
  }

  private async startOnce(): Promise<void> {
    if (this.options.startDelayMs && this.options.startDelayMs > 0) {
      await sleep(this.options.startDelayMs);
    }
    if (process.env.BSA_NO_PI === "1") {
      this.piReady = false;
      this.piReason = "BSA_NO_PI";
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      return;
    }
    if (process.env.BSA_FAKE_PI === "1") {
      this.pi = this.createFakePi();
      this.piReady = true;
      this.piReason = null;
      this.model = "fake/scripted";
      this.models = [
        ...this.models,
        { id: "fake/scripted", label: "fake/scripted (CI double)" },
      ];
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      return;
    }
    const timeoutMs = this.options.startTimeoutMs
      ?? Number(process.env.BSA_PI_START_TIMEOUT_MS ?? 20_000);
    const boot = this.bootPi();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const winner = await Promise.race([boot.then(() => "ok" as const), timeout]);
    if (timer) clearTimeout(timer);
    if (winner === "timeout" && !this.piReady && this.piReason === null) {
      this.piReason = `Pi start timed out after ${timeoutMs}ms`;
      this.sendPiUnavailable();
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      void boot.then(() => {
        if (!this.piReady) return;
        this.send({ type: "notify", message: "Agent is ready.", level: "info" });
        this.send({ type: "models", models: this.models });
        this.send({ type: "stateSync", state: this.state() });
      });
    }
  }

  private async bootPi(): Promise<void> {
    try {
      if (process.env.BSA_PI_FAIL === "1") {
        throw new Error("BSA_PI_FAIL");
      }
      await withPiStartLock(async () => {
        const { DefaultResourceLoader } = await import("@earendil-works/pi-coding-agent");
        const authStorage = AuthStorage.create();
        applyHostedApiKeys(authStorage);
        this.modelRegistry = ModelRegistry.create(authStorage);
        const extras = await resolveCostExtensions();
        const cwd = this.options.cwd ?? process.cwd();
        const agentDir = this.options.agentDir ?? getAgentDir();
        const loader = new DefaultResourceLoader({
          cwd,
          agentDir,
          additionalExtensionPaths: extras,
          appendSystemPrompt: [
            "You operate a remote headed Chromium on the operator's desktop through browser_* tools. If the browser node is disconnected, say so and do not invent page state.",
          ],
        });
        await loader.reload();
        const customTools = [...this.api.tools.values()].map((tool) => this.toPiTool(tool));
        const result = await createAgentSession({
          cwd,
          agentDir,
          authStorage,
          modelRegistry: this.modelRegistry,
          resourceLoader: loader,
          sessionManager: this.options.sessionDir
            ? SessionManager.create(cwd, this.options.sessionDir)
            : SessionManager.inMemory(cwd),
          customTools,
          noTools: "builtin",
          thinkingLevel: "medium",
        });
        this.pi = result.session as PiLike;
        this.piReady = true;
        this.piReason = null;
        this.capPiModel();
        this.model = describeModel(result.session.model) ?? this.model;
        this.thinking = String(result.session.thinkingLevel ?? this.thinking);
        this.unsubscribePi = result.session.subscribe((event) => {
          this.send({ type: "agentEvent", event: normalizeAgentEvent(event) });
          const err = assistantErrorFromEvent(event);
          if (err) this.send({ type: "error", message: err, code: "pi_turn_error" });
        });
        const available = this.modelRegistry.getAvailable();
        this.models = [
          { id: "auto", label: "Pi Router (Auto)" },
          { id: "low", label: "@low" },
          { id: "medium", label: "@medium" },
          { id: "high", label: "@high" },
          { id: "ultra", label: "@ultra" },
          ...available.map((model) => ({
            id: `${model.provider}/${model.id}`,
            label: `${model.provider}/${model.id}`,
          })),
        ];
      });
    } catch (err) {
      this.pi = null;
      this.piReady = false;
      this.piReason = err instanceof Error ? err.message : String(err);
      this.sendPiUnavailable();
    }
    this.send({ type: "models", models: this.models });
    this.send({ type: "stateSync", state: this.state() });
  }

  private sendPiUnavailable(): void {
    this.send({
      type: "notify",
      message: `Pi agent is not running (${this.piReason ?? "unavailable"}). Chat cannot answer until LLM keys are configured on the API. Slash commands and pairing still work.`,
      level: "warning",
    });
  }

  async handleClient(message: ChatClientMessage): Promise<void> {
    switch (message.type) {
      case "hello":
        this.send({ type: "hello_ok", protocol: 1 });
        this.send({ type: "models", models: this.models });
        this.send({ type: "stateSync", state: this.state() });
        this.send({
          type: "nodeStatus",
          connected: this.hub.connected,
          takeover: this.hub.takeover,
          reason: this.hub.connected ? undefined : "browser node disconnected",
        });
        if (this.hub.connected) this.hub.startScreencast();
        if (!this.piReady && process.env.BSA_NO_PI !== "1") {
          if (this.starting) {
            this.send({ type: "notify", message: "Starting the agent…", level: "info" });
          } else {
            this.sendPiUnavailable();
          }
        }
        return;
      case "prompt":
        await this.prompt(message.text);
        return;
      case "abort":
        await this.pi?.abort();
        return;
      case "setModel":
        await this.setModel(message.model);
        return;
      case "setThinking":
        this.thinking = message.level;
        this.pi?.setThinkingLevel(message.level as "off" | "minimal" | "low" | "medium" | "high" | "xhigh");
        this.send({ type: "stateSync", state: this.state() });
        return;
      case "command":
        await this.runCommand(message.name, message.args ?? "");
        return;
      case "ui_answer":
        this.host.answer(message.requestId, message.value);
        return;
      case "takeover_input":
        try {
          this.hub.forwardTakeoverInput(message.event);
        } catch (err) {
          const error = err instanceof AgentError ? err : undefined;
          this.send({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
            code: error?.code,
          });
        }
        return;
      case "newSession":
        this.sessionId = `sess_${Date.now().toString(36)}`;
        this.send({ type: "stateSync", state: this.state() });
        return;
      case "loadSession":
        this.send({ type: "notify", message: "Session resume uses the same ~/.pi/agent/sessions as the TUI when configured.", level: "info" });
        return;
    }
  }

  async dispose(): Promise<void> {
    this.unsubscribePi?.();
    this.pi?.dispose();
    this.pi = null;
  }

  private async prompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      const [name, ...rest] = trimmed.slice(1).split(/\s+/);
      await this.runCommand(name ?? "", rest.join(" "));
      return;
    }
    if (!this.hub.connected && looksLikeBrowserWork(trimmed)) {
      this.send({
        type: "notify",
        message: "Browser node disconnected. Chat can continue, but browser tools will fail until the desktop node reconnects.",
        level: "warning",
      });
    }
    if (!this.pi) {
      if (process.env.BSA_NO_PI === "1") {
        this.send({
          type: "agentEvent",
          event: { type: "text_delta", text: stubReply(trimmed) },
        });
        this.send({ type: "agentEvent", event: { type: "turn_end" } });
        return;
      }
      this.sendPiUnavailable();
      this.send({
        type: "error",
        message: `Pi agent is not running (${this.piReason ?? "unavailable"}). Configure LLM keys on the API.`,
        code: "pi_unavailable",
      });
      return;
    }
    try {
      this.capPiModel();
      await this.pi.prompt(trimmed);
    } catch (err) {
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        code: "pi_prompt_failed",
      });
    }
  }

  private capPiModel(): void {
    capHostedModelOutput(this.pi?.model);
    capHostedModelOutput(this.pi?.agent?.state?.model);
  }

  private async runCommand(name: string, args: string): Promise<void> {
    const key = name.replace(/^\//, "");
    if (key === "browser-status" && !this.hub.connected) {
      this.send({
        type: "notify",
        message: JSON.stringify(
          {
            nodeConnected: false,
            hint: "Pair this computer, then run the curl installer on that machine. Chat still works without the desktop node.",
            currentRun: null,
            runs: [],
          },
          null,
          2,
        ),
      });
      return;
    }
    const command = this.api.commands.get(key);
    if (!command) {
      this.send({ type: "error", message: `Unknown command /${key}` });
      return;
    }
    try {
      await command.handler(args, extensionContext(this.host));
      this.send({ type: "stateSync", state: this.state() });
    } catch (err) {
      const error = err instanceof AgentError ? err : undefined;
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        code: error?.code,
      });
    }
  }

  private createFakePi(): PiLike {
    return {
      model: { provider: "fake", id: "scripted" },
      thinkingLevel: "medium",
      subscribe: () => () => undefined,
      abort: () => undefined,
      dispose: () => undefined,
      setThinkingLevel: () => undefined,
      setModel: async () => undefined,
      prompt: async (text: string) => {
        const tools = [...this.api.tools.keys()];
        this.send({
          type: "agentEvent",
          event: { type: "text_delta", text: `Pi: ${text}` },
        });
        if (looksLikeBrowserWork(text)) {
          const inspect = this.api.tools.get("browser_inspect");
          this.send({
            type: "agentEvent",
            event: { type: "tool_call", toolName: "browser_inspect", tools },
          });
          if (inspect) {
            try {
              const result = await inspect.execute(
                "fake-pi",
                { runId: this.handle.currentRunId ?? undefined },
                undefined,
                undefined,
                extensionContext(this.host),
              );
              this.send({
                type: "agentEvent",
                event: {
                  type: "tool_result",
                  toolName: "browser_inspect",
                  isError: Boolean(result.isError),
                  text: result.content.map((part) => ("text" in part ? part.text : "")).join(""),
                },
              });
            } catch (err) {
              this.send({
                type: "agentEvent",
                event: {
                  type: "tool_result",
                  toolName: "browser_inspect",
                  isError: true,
                  text: err instanceof Error ? err.message : String(err),
                },
              });
            }
          }
        }
        this.send({ type: "agentEvent", event: { type: "turn_end" } });
      },
    };
  }

  private async setModel(id: string): Promise<void> {
    this.model = id;
    if (this.pi && this.modelRegistry && id !== "auto" && !["low", "medium", "high", "ultra"].includes(id)) {
      const [provider, ...rest] = id.split("/");
      const found = this.modelRegistry.find(provider ?? "", rest.join("/"));
      if (found) {
        capHostedModelOutput(found as { maxTokens?: number });
        await this.pi.setModel?.(found);
        this.capPiModel();
      }
    }
    this.send({ type: "stateSync", state: this.state() });
    this.send({
      type: "notify",
      message: id === "auto" || ["low", "medium", "high", "ultra"].includes(id)
        ? `Routing hint ${id}. pi-model-auto picks the cheapest authenticated model that meets that floor.`
        : `Model set to ${id}`,
      level: "info",
    });
  }

  private toPiTool(tool: RegisteredTool) {
    return defineTool({
      name: tool.name,
      label: tool.label ?? tool.name,
      description: tool.description,
      parameters: tool.parameters as never,
      execute: async (id, params, signal, onUpdate) => {
        const result = await tool.execute(
          id,
          params as Record<string, unknown>,
          signal,
          onUpdate,
          extensionContext(this.host),
        );
        return { ...result, details: result.details ?? {} };
      },
    });
  }
}

interface PiLike {
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void> | void;
  dispose: () => void;
  setThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  setModel?: (model: unknown) => Promise<void> | void;
  subscribe?: (listener: (event: unknown) => void) => () => void;
  model?: { provider?: string; id?: string; maxTokens?: number };
  thinkingLevel?: string;
  agent?: { state?: { model?: { maxTokens?: number }; errorMessage?: string } };
}

function describeModel(model: { provider?: string; id?: string } | undefined): string | undefined {
  if (!model?.id) return undefined;
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function stubReply(text: string): string {
  return `I heard you: ${text}`;
}

function looksLikeBrowserWork(text: string): boolean {
  return /browser|click|inspect|login|tab|page|navigate|takeover/i.test(text);
}

function normalizeAgentEvent(event: unknown): Record<string, unknown> {
  const value = event as {
    type?: string;
    assistantMessageEvent?: { type?: string; delta?: string };
    message?: unknown;
    toolName?: string;
  };
  if (value.type === "message_update" && value.assistantMessageEvent?.type === "text_delta") {
    return { type: "text_delta", text: value.assistantMessageEvent.delta ?? "" };
  }
  if (value.type) return { ...value };
  return { type: "agentEvent", event };
}
