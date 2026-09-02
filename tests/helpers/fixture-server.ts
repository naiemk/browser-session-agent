import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/site");

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function hasSession(req: IncomingMessage): boolean {
  return (req.headers.cookie ?? "").includes("bsa_session=1");
}

const ROUTES: Record<string, string> = {
  "/": "login.html",
  "/login": "login.html",
  "/jobs": "jobs.html",
  "/apply": "apply.html",
  "/dialog": "dialog.html",
  "/error": "error.html",
  "/dynamic": "dynamic.html",
  "/jsonlint": "jsonlint.html",
  "/dead-click": "dead-click.html",
  "/combobox": "combobox.html",
  "/plan-labeled": "plan-labeled.html",
  "/fill": "fill.html",
  "/upload": "upload.html",
  "/list": "list.html",
  "/ambiguous": "ambiguous.html",
  "/noisy": "noisy.html",
  "/once": "once.html",
  "/draft": "draft.html",
  "/tmpl-a": "tmpl-a.html",
  "/tmpl-b": "tmpl-b.html",
};

/** Shared handler for the two hosts that render the same application template. */
async function templatePost(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
): Promise<void> {
  const body = await readBody(req);
  const missing = ["firstName", "lastName", "email", "auth"].filter((field) => !body.get(field));
  if (missing.length > 0) {
    send(res, 200, await page(file, { error: "All fields are required" }));
    return;
  }
  send(res, 200, await page("success.html", { name: `${body.get("firstName")} ${body.get("lastName")}` }));
}

export class FixtureServer {
  private server: Server | null = null;
  port = 0;

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<string> {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", this.origin);
      try {
        if (req.method === "POST" && url.pathname === "/login") {
          const body = await readBody(req);
          if (body.get("email") && body.get("password")) {
            send(res, 302, "", {
              location: "/jobs",
              "set-cookie": "bsa_session=1; Path=/; Max-Age=86400",
            });
            return;
          }
          send(res, 200, await page("login.html", { error: "Email and password required" }));
          return;
        }
        if (req.method === "POST" && url.pathname === "/fill") {
          const body = await readBody(req);
          if (!body.get("fullName") || !body.get("email")) {
            send(res, 200, await page("fill.html", { error: "Name and email are required" }));
            return;
          }
          send(res, 200, await page("success.html", { name: body.get("fullName") ?? "" }));
          return;
        }
        if (req.method === "POST" && url.pathname === "/apply") {
          const body = await readBody(req);
          if (!body.get("fullName") || !body.get("email")) {
            send(res, 200, await page("apply.html", { error: "Name and email are required" }));
            return;
          }
          send(res, 200, await page("success.html", { name: body.get("fullName") ?? "" }));
          return;
        }
        if (req.method === "POST" && url.pathname === "/tmpl-a") {
          await templatePost(req, res, "tmpl-a.html");
          return;
        }
        if (req.method === "POST" && url.pathname === "/tmpl-b") {
          await templatePost(req, res, "tmpl-b.html");
          return;
        }
        if (url.pathname === "/jobs" && !hasSession(req)) {
          send(res, 302, "", { location: "/login" });
          return;
        }
        const file = ROUTES[url.pathname] ?? "";
        if (!file) {
          send(res, 404, "<h1>Not found</h1>");
          return;
        }
        send(res, 200, await page(file));
      } catch (err) {
        send(res, 500, `<pre>${String(err)}</pre>`);
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    return this.origin;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function page(file: string, vars: Record<string, string> = {}): Promise<string> {
  let html = await readFile(path.join(SITE_DIR, file), "utf8");
  html = html.replace("{{error}}", vars.error ?? "");
  html = html.replace("{{name}}", vars.name ?? "");
  return html;
}
