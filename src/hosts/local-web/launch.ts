import { chromiumExecutable, collectChecks, formatChecks, hasFlag, type CheckItem } from "../local-cli/launch.ts";
import { NodeAgent } from "../node-agent/client.ts";
import { startOperatorApi, type OperatorApi } from "../web/server.ts";

export const LOCAL_WEB_DEFAULT_TOKEN = "dev";
export const LOCAL_WEB_DEFAULT_PORT = 8787;
export const LOCAL_WEB_DEFAULT_HOST = "127.0.0.1";

export function helpText(): string {
  return `browser-session-agent local web

Control the operator from the chat UI on this machine.
Chromium runs here. Nothing talks to the VPS.

  npm install
  npx playwright install chromium
  npm run web

Then open the printed URL (includes ?token=dev). Chat and the live view
talk to the local API. The desktop node is already connected.

Commands:
  npm run web                 UI + API + headed Chromium
  npm run web -- --check      verify Node, Chromium, and entries
  npm run web -- --headless   hide the Chromium window
  npm run web -- --port 8787  listen on another port

Need a model key in the environment (OPENROUTER_API_KEY, ANTHROPIC_API_KEY,
or OPENAI_API_KEY). Do not run npm run cli against the same profile at the
same time. The hosted VPS path stays UI-only for production.
`;
}

export function takeLocalWebArgs(args: string[]): {
  args: string[];
  headless: boolean;
  port: number;
  host: string;
  token: string;
} {
  const rest = args.filter((arg) => arg !== "--headless" && arg !== "--check" && arg !== "--help" && arg !== "-h");
  const portFlag = rest.indexOf("--port");
  const hostFlag = rest.indexOf("--host");
  const tokenFlag = rest.indexOf("--token");
  const port =
    portFlag >= 0 && rest[portFlag + 1]
      ? Number(rest[portFlag + 1])
      : Number(process.env.PORT ?? process.env.BSA_HTTP_PORT ?? LOCAL_WEB_DEFAULT_PORT);
  const host =
    hostFlag >= 0 && rest[hostFlag + 1]
      ? rest[hostFlag + 1]
      : (process.env.BSA_BIND_HOST ?? LOCAL_WEB_DEFAULT_HOST);
  const token =
    tokenFlag >= 0 && rest[tokenFlag + 1]
      ? rest[tokenFlag + 1]
      : (process.env.BSA_TOKEN ?? LOCAL_WEB_DEFAULT_TOKEN);
  return {
    args: rest,
    headless: hasFlag(args, "--headless") || process.env.BSA_HEADLESS === "1",
    port,
    host,
    token,
  };
}

export function chatUrl(host: string, port: number, token: string): string {
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = new URL(`http://${shown}:${port}/`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function nodeUrl(host: string, port: number): string {
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `ws://${shown}:${port}/node`;
}

export function formatReady(options: { host: string; port: number; token: string; headless: boolean }): string {
  const shown = options.host === "0.0.0.0" ? "127.0.0.1" : options.host;
  const ui =
    options.token === LOCAL_WEB_DEFAULT_TOKEN
      ? chatUrl(options.host, options.port, options.token)
      : `http://${shown}:${options.port}/  (open with ?token= from BSA_TOKEN)`;
  return [
    "browser-session-agent local web — Chromium on this machine, no VPS.",
    `  UI    ${ui}`,
    `  API   http://${shown}:${options.port}/healthz`,
    `  Node  ${options.headless ? "headless" : "headed"} Chromium (already connected)`,
    "In the chat: /browser-start <goal>",
    "",
  ].join("\n");
}

export async function collectWebChecks(root: string): Promise<CheckItem[]> {
  const items = await collectChecks(root);
  return items.map((item) => {
    if (item.name === "model" && item.detail.includes("/login")) {
      return { ...item, detail: "none in env — export OPENROUTER_API_KEY or ANTHROPIC_API_KEY" };
    }
    return item;
  });
}

export { formatChecks, chromiumExecutable };

export interface LocalWebHandle {
  origin: string;
  token: string;
  api: OperatorApi;
  node: NodeAgent;
  close: () => Promise<void>;
}

export async function startLocalWeb(options: {
  host?: string;
  port?: number;
  token?: string;
  home?: string;
  cwd?: string;
  headless?: boolean;
}): Promise<LocalWebHandle> {
  const host = options.host ?? LOCAL_WEB_DEFAULT_HOST;
  const token = options.token ?? process.env.BSA_TOKEN ?? LOCAL_WEB_DEFAULT_TOKEN;
  const headless = options.headless ?? process.env.BSA_HEADLESS === "1";
  const api = await startOperatorApi({
    host,
    port: options.port ?? LOCAL_WEB_DEFAULT_PORT,
    token,
    cwd: options.cwd ?? process.cwd(),
    agentDir: options.home,
  });
  const node = new NodeAgent({
    apiUrl: nodeUrl(host, api.port),
    token,
    home: options.home,
    cwd: options.cwd ?? process.cwd(),
    headless,
  });
  node.start();
  const origin = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${api.port}`;
  await waitForNode(origin);
  return {
    origin,
    token,
    api,
    node,
    close: async () => {
      await withTimeout(node.session.worker.stop(), 3_000).catch(() => undefined);
      await withTimeout(node.close(), 2_000).catch(() => undefined);
      await withTimeout(api.close(), 3_000).catch(() => undefined);
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function waitForNode(origin: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  let last = "not checked";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${origin}/healthz`);
      const body = (await res.json()) as { nodeConnected?: boolean };
      if (body.nodeConnected) return;
      last = `nodeConnected=${String(body.nodeConnected)}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`desktop node did not connect: ${last}`);
}
