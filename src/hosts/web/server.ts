import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { bearerFromHeader, checkBasicAuth, tokensEqual } from "../shared/auth.ts";
import type { ChatClientMessage, NodeToApi } from "../shared/protocol.ts";
import { parseJsonMessage, PROTOCOL_VERSION } from "../shared/protocol.ts";
import { resolveHome } from "../../store/paths.ts";
import { AccountStore } from "./accounts.ts";
import { HubRegistry } from "./hub-registry.ts";
import {
  clearSessionCookie,
  json,
  readJson,
  sessionIdFromRequest,
  setSessionCookie,
} from "./http.ts";
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
  registry: HubRegistry;
  accounts: AccountStore;
  runtime: OperatorRuntime;
  close: () => Promise<void>;
}

export async function startOperatorApi(options: OperatorApiOptions = {}): Promise<OperatorApi> {
  const token = options.token ?? process.env.BSA_TOKEN;
  const dataRoot = options.agentDir ?? resolveHome(options.cwd);
  const accounts = await AccountStore.open(dataRoot);
  const registry = new HubRegistry();
  const runtimes = new Set<OperatorRuntime>();

  const broadcast = (message: Parameters<NodeHub["broadcast"]>[0]) => registry.operator.broadcast(message);
  const primary = new OperatorRuntime(registry.operator, broadcast, { ...options, requirePaid: false, paid: true });
  runtimes.add(primary);
  await primary.start();

  const http = createServer((req, res) => {
    void handleHttp(req, res, registry, accounts, token);
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
        void acceptNode(ws, req, registry, accounts, token);
      } else {
        void acceptChat(ws, req, registry, accounts, primary, runtimes, token, options);
      }
    });
  });

  const port = await listen(http, options.host ?? "0.0.0.0", options.port ?? 0);
  return {
    port,
    hub: registry.operator,
    registry,
    accounts,
    runtime: primary,
    close: async () => {
      for (const runtime of runtimes) await runtime.dispose();
      registry.closeAll();
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        http.close(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

async function acceptNode(
  ws: WebSocket,
  req: IncomingMessage,
  registry: HubRegistry,
  accounts: AccountStore,
  token?: string,
): Promise<void> {
  const headerToken = bearerFromHeader(req.headers.authorization);
  ws.once("message", (raw) => {
    const message = parseJsonMessage<NodeToApi>(typeof raw === "string" ? raw : raw.toString());
    if (!message || message.type !== "hello") {
      ws.close(4401, "unauthorized");
      return;
    }
    const provided = message.token ?? headerToken;
    if (token && tokensEqual(token, provided)) {
      ws.send(JSON.stringify({ type: "hello_ok" }));
      registry.operator.attach(ws, message.hostname);
      registry.operator.startScreencast();
      return;
    }
    const device = accounts.deviceForToken(message.deviceToken ?? provided);
    if (!device) {
      ws.close(4401, "unauthorized");
      return;
    }
    const hub = registry.hubFor(device.accountId);
    ws.send(JSON.stringify({ type: "hello_ok" }));
    hub.attach(ws, message.hostname ?? device.hostname);
    hub.startScreencast();
  });
}

async function acceptChat(
  ws: WebSocket,
  req: IncomingMessage,
  registry: HubRegistry,
  accounts: AccountStore,
  primary: OperatorRuntime,
  runtimes: Set<OperatorRuntime>,
  token?: string,
  options: OperatorRuntimeOptions = {},
): Promise<void> {
  const headerToken = bearerFromHeader(req.headers.authorization);
  const cookieSession = sessionIdFromRequest(req);
  const send = (message: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  let runtime: OperatorRuntime | null = null;
  let unsub: (() => void) | undefined;
  let authed = false;

  const bind = async (hub: NodeHub, next: OperatorRuntime) => {
    runtime = next;
    unsub?.();
    unsub = hub.subscribe((message) => send(message));
  };

  ws.on("message", (raw) => {
    const message = parseJsonMessage<ChatClientMessage>(typeof raw === "string" ? raw : raw.toString());
    if (!message) return;
    if (message.type === "hello") {
      const provided = message.token ?? headerToken;
      if (token && tokensEqual(token, provided)) {
        authed = true;
        void bind(registry.operator, primary);
        void primary.handleClient(message);
        return;
      }
      const account = accounts.accountForSession(cookieSession);
      if (account) {
        authed = true;
        const hub = registry.hubFor(account.id);
        const consumer = new OperatorRuntime(hub, (m) => send(m), {
          ...options,
          requirePaid: true,
          paid: () => Boolean(accounts.getAccount(account.id)?.paidAt),
        });
        runtimes.add(consumer);
        void (async () => {
          await consumer.start();
          await bind(hub, consumer);
          await consumer.handleClient(message);
        })();
        return;
      }
      send({ type: "error", message: "unauthorized", code: "unauthorized" });
      ws.close(4401, "unauthorized");
      return;
    }
    if (!authed || !runtime) {
      send({ type: "error", message: "unauthorized", code: "unauthorized" });
      return;
    }
    void runtime.handleClient(message);
  });

  ws.on("close", () => {
    unsub?.();
    if (runtime && runtime !== primary) {
      runtimes.delete(runtime);
      void runtime.dispose();
    }
  });
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  registry: HubRegistry,
  accounts: AccountStore,
  token?: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  try {
    if (url.pathname === "/healthz") {
      json(res, 200, { ok: true, nodeConnected: registry.connected, protocol: PROTOCOL_VERSION });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/register") {
      const body = await readJson(req);
      const account = await accounts.register(String(body.email ?? ""), String(body.password ?? ""));
      const { session } = await accounts.login(account.email, String(body.password ?? ""));
      setSessionCookie(res, session.id);
      json(res, 201, { account: accounts.publicView(account) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/auth/login") {
      const body = await readJson(req);
      const { account, session } = await accounts.login(String(body.email ?? ""), String(body.password ?? ""));
      setSessionCookie(res, session.id);
      json(res, 200, { account: accounts.publicView(account) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/auth/logout") {
      await accounts.logout(sessionIdFromRequest(req));
      clearSessionCookie(res);
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/me") {
      const account = requireAccount(accounts, req);
      json(res, 200, { account: accounts.publicView(account) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/pair/issue") {
      const account = requireAccount(accounts, req);
      const body = await readJson(req).catch(() => ({} as Record<string, unknown>));
      const ttlMs = typeof body.ttlMs === "number" ? body.ttlMs : undefined;
      const issued = await accounts.issuePairCode(account.id, ttlMs);
      json(res, 200, { code: issued.code, expiresAtMs: issued.expiresAtMs });
      return;
    }
    if (req.method === "POST" && url.pathname === "/pair/exchange") {
      const body = await readJson(req);
      const { device, token: deviceToken } = await accounts.exchangePairCode(
        String(body.code ?? ""),
        typeof body.hostname === "string" ? body.hostname : undefined,
      );
      json(res, 200, { deviceToken, deviceId: device.id, accountId: device.accountId });
      return;
    }
    if (req.method === "POST" && url.pathname === "/pair/prepare") {
      const body = await readJson(req);
      await accounts.prepareChallenge(String(body.challenge ?? ""));
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/pair/claim") {
      const account = requireAccount(accounts, req);
      const body = await readJson(req);
      const device = await accounts.claimChallenge(
        account.id,
        String(body.challenge ?? ""),
        typeof body.hostname === "string" ? body.hostname : undefined,
      );
      json(res, 200, { deviceId: device.id, accountId: device.accountId });
      return;
    }
    if (req.method === "GET" && url.pathname === "/pair/redeem") {
      const challenge = url.searchParams.get("challenge") ?? "";
      const redeemed = await accounts.redeemChallenge(challenge);
      if (!redeemed) {
        json(res, 404, { error: "not ready" });
        return;
      }
      json(res, 200, redeemed);
      return;
    }
    if (req.method === "GET" && url.pathname === "/devices") {
      const account = requireAccount(accounts, req);
      json(
        res,
        200,
        {
          devices: accounts.listDevices(account.id).map((d) => ({
            id: d.id,
            hostname: d.hostname,
            createdAt: d.createdAt,
            revoked: Boolean(d.revokedAt),
          })),
        },
      );
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/devices/") && url.pathname.endsWith("/revoke")) {
      const account = requireAccount(accounts, req);
      const deviceId = url.pathname.split("/")[2] ?? "";
      const device = await accounts.revokeDevice(account.id, deviceId);
      json(res, 200, { id: device.id, revoked: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/billing/mark-paid") {
      const account = requireAccount(accounts, req);
      if (!allowMarkPaid(req, token)) {
        json(res, 403, { error: "forbidden", code: "forbidden" });
        return;
      }
      const paid = await accounts.markPaid(account.id);
      json(res, 200, { account: accounts.publicView(paid) });
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
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code;
    json(res, status, { error: err instanceof Error ? err.message : String(err), code });
  }
}

function requireAccount(accounts: AccountStore, req: IncomingMessage) {
  const account = accounts.accountForSession(sessionIdFromRequest(req));
  if (!account) {
    throw Object.assign(new Error("unauthorized"), { status: 401, code: "unauthorized" });
  }
  return account;
}

function allowMarkPaid(req: IncomingMessage, token?: string): boolean {
  if (process.env.BSA_ALLOW_MARK_PAID === "1") return true;
  const header = bearerFromHeader(req.headers.authorization);
  return Boolean(token && tokensEqual(token, header));
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
