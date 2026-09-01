import type { IncomingMessage, ServerResponse } from "node:http";

export const SESSION_COOKIE = "bsa_session";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const sep = part.indexOf("=");
    if (sep < 0) continue;
    const key = part.slice(0, sep).trim();
    const value = part.slice(sep + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionIdFromRequest(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

export function requestIsHttps(req: IncomingMessage | undefined): boolean {
  if (process.env.BSA_COOKIE_SECURE === "1") return true;
  if (!req) return false;
  const forwarded = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwarded === "https") return true;
  return Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted);
}

function cookieHeader(value: string, req: IncomingMessage | undefined, maxAgeSec: number): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (requestIsHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(
  res: ServerResponse,
  sessionId: string,
  req?: IncomingMessage,
  maxAgeSec = 60 * 60 * 24 * 30,
): void {
  res.setHeader("set-cookie", cookieHeader(encodeURIComponent(sessionId), req, maxAgeSec));
}

export function clearSessionCookie(res: ServerResponse, req?: IncomingMessage): void {
  res.setHeader("set-cookie", cookieHeader("", req, 0));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    throw Object.assign(new Error("invalid json"), { status: 400 });
  }
}

export function json(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}
