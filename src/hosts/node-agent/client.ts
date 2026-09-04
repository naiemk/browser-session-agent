import { hostname as osHostname } from "node:os";
import WebSocket from "ws";
import { AgentError } from "../../domain/types.ts";
import { BrowserSession } from "../../session.ts";
import type { ApiToNode, NodeToApi } from "../shared/protocol.ts";
import { parseJsonMessage } from "../shared/protocol.ts";
import { dispatchPortRpc } from "../shared/port-rpc.ts";
import { applyTakeoverInput, dispatchSessionRpc } from "../shared/rpc-dispatch.ts";
import { WorkerBrowserPort } from "../../host/worker-browser-port.ts";

export interface NodeAgentOptions {
  apiUrl: string;
  token?: string;
  deviceToken?: string;
  home?: string;
  cwd?: string;
  headless?: boolean;
  hostname?: string;
  reconnectMs?: number;
}

export class NodeAgent {
  readonly session: BrowserSession;
  private readonly apiUrl: string;
  private readonly token?: string;
  private readonly deviceToken?: string;
  private readonly hostname: string;
  private readonly reconnectMs: number;
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private screencastOn = false;
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * The operator's browser behind the agent's port.
   *
   * Built on first use rather than at construction, because it adopts the tabs the worker
   * is tracking and the worker has not started yet when this object is made.
   */
  private browserPort: WorkerBrowserPort | null = null;

  constructor(options: NodeAgentOptions) {
    this.apiUrl = options.apiUrl;
    this.token = options.token;
    this.deviceToken = options.deviceToken;
    this.hostname = options.hostname ?? osHostname();
    this.reconnectMs = options.reconnectMs ?? 1000;
    this.session = new BrowserSession({
      home: options.home,
      cwd: options.cwd,
      headless: options.headless,
    });
    this.session.onPlanProgress = (event) => {
      this.send({ type: "node_event", event: { ...event } });
    };
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopScreenshotLoop();
    await Promise.race([
      this.session.worker.stopScreencast(),
      new Promise((resolve) => setTimeout(resolve, 300)),
    ]).catch(() => undefined);
    this.screencastOn = false;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.apiUrl);
    this.socket = ws;

    ws.on("open", () => {
      this.attempt = 0;
      this.send({
        type: "hello",
        token: this.token,
        deviceToken: this.deviceToken,
        hostname: this.hostname,
      });
    });

    ws.on("message", (raw) => {
      const text = typeof raw === "string" ? raw : raw.toString();
      const message = parseJsonMessage<ApiToNode>(text);
      if (!message) return;
      void this.onMessage(message);
    });

    ws.on("close", () => {
      this.socket = null;
      this.stopScreenshotLoop();
      void this.session.worker.stopScreencast().catch(() => undefined);
      this.screencastOn = false;
      this.scheduleReconnect();
    });

    ws.on("error", () => {
      // close handler reconnects
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(30_000, this.reconnectMs * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(message: NodeToApi): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private async onMessage(message: ApiToNode): Promise<void> {
    if (message.type === "hello_ok") {
      this.send({ type: "node_event", event: { kind: "ready", hostname: this.hostname } });
      return;
    }
    if (message.type === "start_screencast") {
      await this.beginScreencast();
      return;
    }
    if (message.type === "stop_screencast") {
      this.stopScreenshotLoop();
      await this.session.worker.stopScreencast().catch(() => undefined);
      this.screencastOn = false;
      return;
    }
    if (message.type === "takeover_input") {
      try {
        await applyTakeoverInput(this.session, message.event);
      } catch (err) {
        this.send({
          type: "node_event",
          event: { kind: "input_rejected", message: err instanceof Error ? err.message : String(err) },
        });
      }
      return;
    }
    if (message.type === "rpc") {
      try {
        // Port calls first: this is how the new agent reaches the operator's browser.
        // Anything else falls through to the session dispatcher, so both work during the
        // cutover rather than the flip being all-or-nothing.
        const asPort = message.method.startsWith("port.")
          ? await dispatchPortRpc(this.port(), message.method, message.args)
          : ({ handled: false } as const);
        const result = asPort.handled
          ? asPort.result
          : await dispatchSessionRpc(this.session, message.method, message.args);
        this.send({ type: "rpc_result", id: message.id, ok: true, result });
        if (
          message.method === "startRun" ||
          message.method === "takeover" ||
          message.method === "resume" ||
          message.method === "inspect" ||
          message.method === "port.openTab"
        ) {
          await this.beginScreencast();
        }
      } catch (err) {
        this.send({
          type: "rpc_result",
          id: message.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: err instanceof AgentError ? err.code : undefined,
        });
      }
    }
  }

  /**
   * The operator's browser as a port, adopting whatever tabs the worker already tracks.
   *
   * Built once and kept, so tab identity stays stable across calls; the worker remains
   * the owner of the browser process, the profile, and the screencast.
   */
  private port(): WorkerBrowserPort {
    // Lazy: the port starts the worker itself the first time the agent wants a page.
    this.browserPort ??= WorkerBrowserPort.lazy(this.session.worker);
    return this.browserPort;
  }

  private async beginScreencast(): Promise<void> {
    if (!this.session.worker.workerInfo) return;
    try {
      const snap = await this.session.worker.screenshotJpeg();
      this.send({ type: "frame", jpeg: snap.jpeg, tabId: snap.tabId });
    } catch {
      // tab not ready yet
    }
    if (this.screencastOn) return;
    try {
      await this.session.worker.startScreencast((jpeg, tabId) => {
        this.stopScreenshotLoop();
        this.send({ type: "frame", jpeg, tabId });
      });
      this.screencastOn = true;
    } catch {
      this.screencastOn = false;
      this.startScreenshotLoop();
    }
  }

  private startScreenshotLoop(): void {
    if (this.screenshotTimer) return;
    this.screenshotTimer = setInterval(() => {
      void this.session.worker
        .screenshotJpeg()
        .then((snap) => this.send({ type: "frame", jpeg: snap.jpeg, tabId: snap.tabId }))
        .catch(() => undefined);
    }, 750);
  }

  private stopScreenshotLoop(): void {
    if (!this.screenshotTimer) return;
    clearInterval(this.screenshotTimer);
    this.screenshotTimer = null;
  }
}
