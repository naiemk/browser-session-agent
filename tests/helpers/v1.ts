import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { startOperatorApi, type OperatorApi } from "../../src/hosts/web/server.ts";
import { NodeAgent } from "../../src/hosts/node-agent/client.ts";
import type { ChatServerMessage } from "../../src/hosts/shared/protocol.ts";
import { FixtureServer } from "./fixture-server.ts";
import { tempHome } from "./temp-home.ts";

export interface V1World {
  api: OperatorApi;
  origin: string;
  fixture?: FixtureServer;
  fixtureOrigin?: string;
  home: string;
  cleanupHome: () => Promise<void>;
  node?: NodeAgent;
}

export function cookieFromResponse(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

export async function startV1Api(
  options: { token?: string; requirePaid?: boolean; fakePi?: boolean; failPi?: boolean } = {},
): Promise<V1World> {
  delete process.env.BSA_PI_FAIL;
  if (options.failPi) {
    delete process.env.BSA_NO_PI;
    delete process.env.BSA_FAKE_PI;
    process.env.BSA_PI_FAIL = "1";
  } else if (options.fakePi) {
    delete process.env.BSA_NO_PI;
    process.env.BSA_FAKE_PI = "1";
  } else {
    process.env.BSA_NO_PI = "1";
    delete process.env.BSA_FAKE_PI;
  }
  process.env.BSA_ALLOW_MARK_PAID = "1";
  const { home, cleanup } = await tempHome();
  const api = await startOperatorApi({
    host: "127.0.0.1",
    token: options.token,
    agentDir: home,
    requirePaid: options.requirePaid ?? true,
  });
  return {
    api,
    origin: `http://127.0.0.1:${api.port}`,
    home,
    cleanupHome: cleanup,
  };
}

export async function withFixture(world: V1World): Promise<V1World> {
  const fixture = new FixtureServer();
  const fixtureOrigin = await fixture.start();
  world.fixture = fixture;
  world.fixtureOrigin = fixtureOrigin;
  return world;
}

export async function closeV1(world: V1World): Promise<void> {
  await world.node?.session.worker.stop().catch(() => undefined);
  await world.node?.close().catch(() => undefined);
  await world.api.close().catch(() => undefined);
  await world.fixture?.stop().catch(() => undefined);
  await world.cleanupHome().catch(() => undefined);
  delete process.env.BSA_PI_FAIL;
}

export async function register(
  origin: string,
  email: string,
  password: string,
): Promise<{ cookie: string; account: { id: string; email: string; paid: boolean } }> {
  const res = await fetch(`${origin}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { account?: { id: string; email: string; paid: boolean }; error?: string };
  if (!res.ok) throw new Error(body.error ?? `register ${res.status}`);
  return { cookie: cookieFromResponse(res), account: body.account! };
}

export async function login(
  origin: string,
  email: string,
  password: string,
): Promise<{ cookie: string; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${origin}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { cookie: cookieFromResponse(res), status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export function authHeaders(cookie: string): Record<string, string> {
  return { cookie, "content-type": "application/json" };
}

export async function markPaid(origin: string, cookie: string): Promise<void> {
  const res = await fetch(`${origin}/billing/mark-paid`, { method: "POST", headers: authHeaders(cookie) });
  if (!res.ok) throw new Error(`mark-paid ${res.status} ${await res.text()}`);
}

export async function issuePairCode(origin: string, cookie: string, ttlMs?: number): Promise<string> {
  const res = await fetch(`${origin}/pair/issue`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify(ttlMs === undefined ? {} : { ttlMs }),
  });
  const body = (await res.json()) as { code?: string; error?: string };
  if (!res.ok || !body.code) throw new Error(body.error ?? `pair/issue ${res.status}`);
  return body.code;
}

export async function exchangePair(origin: string, code: string): Promise<{ deviceToken: string; deviceId: string }> {
  const res = await fetch(`${origin}/pair/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = (await res.json()) as { deviceToken?: string; deviceId?: string; error?: string };
  if (!res.ok || !body.deviceToken || !body.deviceId) {
    throw Object.assign(new Error(body.error ?? `pair/exchange ${res.status}`), { status: res.status, body });
  }
  return { deviceToken: body.deviceToken, deviceId: body.deviceId };
}

export function connectHelper(world: V1World, deviceToken: string): NodeAgent {
  const node = new NodeAgent({
    apiUrl: `ws://127.0.0.1:${world.api.port}/node`,
    deviceToken,
    home: world.home,
    headless: true,
    reconnectMs: 50,
  });
  node.start();
  world.node = node;
  return node;
}

export async function chatClient(port: number, cookie: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/chat`, { headers: { cookie } });
  const inbox: ChatServerMessage[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(String(raw)) as ChatServerMessage);
  });
  ws.send(JSON.stringify({ type: "hello" }));
  await waitFor(inbox, (m) => m.type === "hello_ok");
  return {
    ws,
    inbox,
    send(message: object) {
      ws.send(JSON.stringify(message));
    },
    close() {
      ws.close();
    },
  };
}

export async function waitFor(
  inbox: ChatServerMessage[],
  match: (message: ChatServerMessage) => boolean,
  timeoutMs = 12_000,
  fromIndex = 0,
): Promise<ChatServerMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = inbox.slice(fromIndex).find(match);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for chat message. Saw: ${inbox.map((m) => m.type).join(", ")}`);
}

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function spawnHelper(
  port: number,
  home: string,
  extraEnv: Record<string, string | undefined> = {},
): ChildProcess {
  const env = { ...process.env, ...extraEnv, BSA_HOME: home, BSA_HEADLESS: "1" };
  delete env.BSA_TOKEN;
  return spawn(
    process.execPath,
    ["--import", "tsx", path.join(REPO_ROOT, "src/hosts/node-agent/cli.ts"), "--api", `ws://127.0.0.1:${port}/node`, "--headless"],
    { env, cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
}

export function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
    setTimeout(() => resolve(), 2000);
  });
}

export async function uniqueUser(): Promise<{ email: string; password: string }> {
  return { email: `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`, password: "correct-horse" };
}

export async function connectPaidConsumer(world: V1World) {
  const user = await uniqueUser();
  const { cookie, account } = await register(world.origin, user.email, user.password);
  await markPaid(world.origin, cookie);
  const { deviceToken } = await exchangePair(world.origin, await issuePairCode(world.origin, cookie));
  connectHelper(world, deviceToken);
  const chat = await chatClient(world.api.port, cookie);
  await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
  return {
    cookie,
    account,
    chat,
    hub: world.api.registry.hubFor(account.id),
  };
}

export async function connectUnpaidConsumer(world: V1World) {
  const user = await uniqueUser();
  const { cookie, account } = await register(world.origin, user.email, user.password);
  const { deviceToken } = await exchangePair(world.origin, await issuePairCode(world.origin, cookie));
  connectHelper(world, deviceToken);
  const chat = await chatClient(world.api.port, cookie);
  await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
  return {
    cookie,
    account,
    chat,
    hub: world.api.registry.hubFor(account.id),
  };
}
