export const PROTOCOL_VERSION = 1;

export type ChatClientMessage =
  | { type: "hello"; token?: string }
  | { type: "prompt"; text: string }
  | { type: "abort" }
  | { type: "setModel"; model: string }
  | { type: "setThinking"; level: string }
  | { type: "command"; name: string; args?: string }
  | { type: "ui_answer"; requestId: string; value: unknown }
  | { type: "takeover_input"; event: TakeoverInput }
  | { type: "newSession" }
  | { type: "loadSession"; id?: string };

export type ChatServerMessage =
  | { type: "hello_ok"; protocol: number }
  | { type: "agentEvent"; event: Record<string, unknown> }
  | { type: "stateSync"; state: OperatorState }
  | { type: "ui_request"; requestId: string; kind: "input" | "confirm" | "select"; title: string; message?: string; placeholder?: string; options?: string[] }
  | { type: "notify"; message: string; level: string }
  | { type: "frame"; jpeg: string; tabId?: string }
  | { type: "nodeStatus"; connected: boolean; takeover: boolean; reason?: string }
  | { type: "models"; models: Array<{ id: string; label: string }> }
  | { type: "error"; message: string; code?: string };

export interface OperatorState {
  sessionId: string;
  model: string;
  thinking: string;
  activeTools: string[];
  nodeConnected: boolean;
  takeover: boolean;
  currentRunId?: string | null;
  attention?: unknown[];
}

export type TakeoverInput =
  | { kind: "mouse"; action: "move" | "down" | "up" | "wheel"; x: number; y: number; button?: number; deltaY?: number }
  | { kind: "key"; action: "down" | "up"; key: string; text?: string; modifiers?: number };

export type NodeToApi =
  | { type: "hello"; token?: string; deviceToken?: string; hostname?: string }
  | { type: "rpc_result"; id: string; ok: boolean; result?: unknown; error?: string }
  | { type: "frame"; jpeg: string; tabId?: string }
  | { type: "node_event"; event: Record<string, unknown> };

export type ApiToNode =
  | { type: "hello_ok" }
  | { type: "rpc"; id: string; method: string; args: unknown[] }
  | { type: "start_screencast" }
  | { type: "stop_screencast" }
  | { type: "takeover_input"; event: TakeoverInput };

export function parseJsonMessage<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
