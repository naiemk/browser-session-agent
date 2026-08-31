import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { AgentError } from "../../domain/types.ts";
import type { RpcTransport } from "../../host/session-handle.ts";
import type { ApiToNode, ChatServerMessage, NodeToApi, TakeoverInput } from "../shared/protocol.ts";
import { parseJsonMessage } from "../shared/protocol.ts";

export type HubListener = (message: ChatServerMessage) => void;

export class NodeHub implements RpcTransport {
  private socket: WebSocket | null = null;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private listeners = new Set<HubListener>();
  takeover = false;
  hostname?: string;

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === this.socket.OPEN;
  }

  subscribe(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast(message: ChatServerMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  attach(ws: WebSocket, hostname?: string): void {
    if (this.socket && this.socket !== ws) {
      try {
        this.socket.close();
      } catch {
        // replace previous node
      }
    }
    this.socket = ws;
    this.hostname = hostname;
    this.rejectAll(new AgentError("node_disconnected", "Browser node replaced"));
    this.broadcast({ type: "nodeStatus", connected: true, takeover: this.takeover });

    ws.on("message", (raw) => {
      const text = typeof raw === "string" ? raw : raw.toString();
      const message = parseJsonMessage<NodeToApi>(text);
      if (!message) return;
      this.onNode(message);
    });

    ws.on("close", () => {
      if (this.socket === ws) {
        this.socket = null;
        this.takeover = false;
        this.rejectAll(
          new AgentError(
            "node_disconnected",
            "Browser node disconnected. Chat still works; browser tools fail until the desktop reconnects.",
          ),
        );
        this.broadcast({
          type: "nodeStatus",
          connected: false,
          takeover: false,
          reason: "browser node disconnected",
        });
      }
    });
  }

  detach(): void {
    this.socket?.close();
    this.socket = null;
  }

  send(message: ApiToNode): void {
    if (!this.connected || !this.socket) {
      throw new AgentError(
        "node_disconnected",
        "Browser node disconnected. Chat still works; browser tools fail until the desktop reconnects.",
      );
    }
    this.socket.send(JSON.stringify(message));
  }

  async call<T>(method: string, args: unknown[]): Promise<T> {
    if (!this.connected) {
      throw new AgentError(
        "node_disconnected",
        "Browser node disconnected. Chat still works; browser tools fail until the desktop reconnects.",
      );
    }
    const id = randomUUID();
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
    this.send({ type: "rpc", id, method, args });
    try {
      const value = await result;
      if (method === "takeover") this.takeover = true;
      if (method === "resume" || method === "stopRun" || method === "startRun") this.takeover = false;
      this.broadcast({ type: "nodeStatus", connected: true, takeover: this.takeover });
      return value;
    } catch (err) {
      throw err;
    }
  }

  startScreencast(): void {
    if (!this.connected) return;
    this.send({ type: "start_screencast" });
  }

  stopScreencast(): void {
    if (!this.connected) return;
    try {
      this.send({ type: "stop_screencast" });
    } catch {
      // node already gone
    }
  }

  forwardTakeoverInput(event: TakeoverInput): void {
    if (!this.takeover) {
      throw new AgentError(
        "ownership_error",
        "Remote input is only allowed while the run is awaiting_takeover",
      );
    }
    this.send({ type: "takeover_input", event });
  }

  private onNode(message: NodeToApi): void {
    if (message.type === "hello") return;
    if (message.type === "rpc_result") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error ?? "RPC failed"));
      return;
    }
    if (message.type === "frame") {
      this.broadcast({ type: "frame", jpeg: message.jpeg, tabId: message.tabId });
      return;
    }
    if (message.type === "node_event") {
      this.broadcast({ type: "agentEvent", event: { type: "node_event", ...message.event } });
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
