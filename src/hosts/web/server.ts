import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { bearerFromHeader, checkBasicAuth, tokensEqual } from "../shared/auth.ts";
import type { ChatClientMessage, NodeToApi } from "../shared/protocol.ts";
import { parseJsonMessage, PROTOCOL_VERSION } from "../shared/protocol.ts";
import { NodeHub } from "./hub.ts";
import { OperatorRuntime, type OperatorRuntimeOptions } from "./runtime.ts";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

export interface OperatorApiOptions extends OperatorRuntimeOptions {
  host?: string;
  port?: number;
  token?: string;
}

export interface OperatorApi {
  port: number;
  hub: NodeHub;
  runtime: OperatorRuntime;
  close: () => Promise<void>;
}

export async function startOperatorApi(options: OperatorApiOptions = {}): Promise<OperatorApi> {
  const token = options.token ?? process.env.BSA_TOKEN;
  const hub = new NodeHub();
  const runtimes = new Set<OperatorRuntime>();

  const broadcast = (message: Parameters<NodeHub["broadcast"]>[0]) => hub.broadcast(message);
  const primary = new OperatorRuntime(hub, broadcast, options);
  runtimes.add(primary);
  await primary.start();
  hub.subscribe((message) => {
    /* runtime already sends through hub.broadcast via constructor send */
    void message;
  });

  const http = createServer((req, res) => {
    void handleHttp(req, res, hub);
  });
  const wss = new WebSocketServer({ noServer: true });

  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/chat" && url.pathname !== "/node") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (url.pathname === "/node") {
        void acceptNode(ws, req, hub, token);
      } else {
        void acceptChat(ws, req, hub, primary, token);
      }
    });
  });

  const port = await listen(http, options.host ?? "0.0.0.0", options.port ?? 0);
  return {
    port,
    hub,
    runtime: primary,
    close: async () => {
      for (const runtime of runtimes) await runtime.dispose();
      hub.detach();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

async function acceptNode(ws: WebSocket, req: IncomingMessage, hub: NodeHub, token?: string): Promise<void> {
  const headerToken = bearerFromHeader(req.headers.authorization);
  ws.once("message", (raw) => {
    const message = parseJsonMessage<NodeToApi>(typeof raw === "string" ? raw : raw.toString());
    if (!message || message.type !== "hello" || !tokensEqual(token, message.token ?? headerToken)) {
      ws.close(4401, "unauthorized");
      return;
    }
    ws.send(JSON.stringify({ type: "hello_ok" }));
    hub.attach(ws, message.hostname);
    hub.startScreencast();
  });
}

async function acceptChat(
  ws: WebSocket,
  req: IncomingMessage,
  hub: NodeHub,
  runtime: OperatorRuntime,
  token?: string,
): Promise<void> {
  const headerToken = bearerFromHeader(req.headers.authorization);
  const send = (message: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const unsub = hub.subscribe((message) => send(message));
  let authed = !token;

  ws.on("message", (raw) => {
    const message = parseJsonMessage<ChatClientMessage>(typeof raw === "string" ? raw : raw.toString());
    if (!message) return;
    if (message.type === "hello") {
      if (!tokensEqual(token, message.token ?? headerToken)) {
        send({ type: "error", message: "unauthorized" });
        ws.close(4401, "unauthorized");
        return;
      }
      authed = true;
    }
    if (!authed) {
      send({ type: "error", message: "unauthorized" });
      return;
    }
    void runtime.handleClient(message);
  });

  ws.on("close", () => unsub());
  if (!token) {
    void runtime.handleClient({ type: "hello" });
  }
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  hub: NodeHub,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/healthz") {
    json(res, 200, { ok: true, nodeConnected: hub.connected, protocol: PROTOCOL_VERSION });
    return;
  }
  if (!checkBasicAuth(req.headers.authorization)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="bsa", charset="UTF-8"' });
    res.end("unauthorized");
    return;
  }
  const file = staticFile(url.pathname);
  if (!file) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { "content-type": contentType(file) });
  res.end(body);
}

function staticFile(pathname: string): string | undefined {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return undefined;
  return existsSync(file) ? file : undefined;
}

function contentType(file: string): string {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/html; charset=utf-8";
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address();
      if (typeof address === "object" && address) resolve(address.port);
      else reject(new Error("listen failed"));
    });
    server.on("error", reject);
  });
}
