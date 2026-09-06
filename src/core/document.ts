/**
 * Whether the tab is showing a page the agent can work on, or a payload.
 *
 * A JSON search API is a successful HTTP response and a failed place to be: the
 * URL matches, the postcondition says ok, and then every probe dumps the body into
 * context. Classification is by content type and body shape, never by path — an
 * HTML document served under `/api/` is still a page.
 */

import type { Page } from "playwright";

export type DocumentKind = "html" | "data";

export interface DocumentInfo {
  kind: DocumentKind;
  contentType: string;
  bytes: number;
}

export function describeDataDocument(info: Pick<DocumentInfo, "contentType" | "bytes">): string {
  return `not a page (${info.contentType}, ${info.bytes} bytes)`;
}

const DATA_MIME = new Set([
  "application/json",
  "text/json",
  "application/xml",
  "text/xml",
  "application/octet-stream",
  "application/javascript",
  "text/javascript",
  "text/csv",
]);

function mimeOf(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  if (trimmed.length > 200_000) return true;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

export function classifyDocument(input: {
  contentType?: string;
  text?: string;
  hasHtmlRoot?: boolean;
}): DocumentInfo {
  const contentType = input.contentType ?? "";
  const mime = mimeOf(contentType);
  const text = input.text ?? "";
  const bytes = Buffer.byteLength(text, "utf8");
  const info = (kind: DocumentKind, type = mime || contentType): DocumentInfo => ({
    kind,
    contentType: type || (kind === "html" ? "text/html" : "application/octet-stream"),
    bytes,
  });

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    return info("html");
  }
  if (
    mime.includes("json") ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml") ||
    DATA_MIME.has(mime)
  ) {
    return info("data");
  }
  if (!input.hasHtmlRoot && looksLikeJson(text)) {
    return info("data", mime || "application/json");
  }
  if ((mime === "text/plain" || mime === "") && looksLikeJson(text)) {
    return info("data", mime || "application/json");
  }
  return info("html");
}

export async function inspectPageDocument(page: Page): Promise<DocumentInfo> {
  const raw = (await page.evaluate(`({
    contentType: document.contentType || "",
    text: document.body ? document.body.innerText : (document.documentElement ? document.documentElement.textContent : ""),
    hasHtmlRoot: Boolean(
      document.documentElement &&
        document.documentElement.tagName === "HTML" &&
        document.body &&
        document.body.children.length > 0
    ),
  })`)) as { contentType: string; text: string; hasHtmlRoot: boolean };
  return classifyDocument(raw);
}
