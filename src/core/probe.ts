/**
 * Read-only probe: the browser's `grep` (D21).
 *
 * Why a closed query language instead of sandboxed JavaScript: arbitrary JS cannot
 * be made safe against exfiltration by deny-list, because `document.cookie` and
 * friends can be reached a hundred indirect ways. Here the page script is ours and
 * fixed, parameterized only by a validated query, so "no credentials, no storage,
 * no headers" holds by construction rather than by pattern matching (D22).
 *
 * Reads are open in the sense that any CSS selector may be *read*. Actions still
 * address controls only by ref (D5), and nothing returned here can be used as an
 * action target.
 */

import type { Page } from "playwright";
import { redactDeep } from "./redact.ts";
import { CoreError } from "./types.ts";

export const MAX_NODES = 200;
export const MAX_STRING = 400;
export const MAX_RESULT_CHARS = 4000;
export const PROBE_TIMEOUT_MS = 5_000;

export type ProbeField =
  | "tag"
  | "role"
  | "name"
  /** The HTML `name` attribute: what the server actually receives. */
  | "field"
  | "text"
  | "value"
  | "type"
  | "required"
  | "disabled"
  | "checked"
  | "placeholder"
  | "visible"
  | "href"
  | "options";

const FIELDS = new Set<string>([
  "tag",
  "role",
  "name",
  "field",
  "text",
  "value",
  "type",
  "required",
  "disabled",
  "checked",
  "placeholder",
  "visible",
  "href",
  "options",
]);

export type ProbeQuery =
  | { kind: "page_meta" }
  | { kind: "text"; within?: string; limit?: number }
  | { kind: "count"; select: string }
  | { kind: "elements"; select: string; fields?: ProbeField[]; attributes?: string[]; limit?: number }
  | { kind: "form_inventory"; within?: string }
  | { kind: "table"; select: string; limit?: number }
  | { kind: "links"; within?: string; limit?: number };

const KINDS = new Set([
  "page_meta",
  "text",
  "count",
  "elements",
  "form_inventory",
  "table",
  "links",
]);

/** Attribute names a probe may never read, whatever the page calls them. */
const FORBIDDEN_ATTR = /(token|secret|password|passwd|api[-_]?key|auth|session|credential|cookie|nonce|signature)/i;

/** Keys that would smuggle code into a data query. */
const CODE_KEYS = ["script", "code", "expression", "fn", "evaluate", "js", "eval"];

export interface ProbeResult {
  query: ProbeQuery;
  data: unknown;
  truncated: boolean;
  note?: string;
}

export function validateProbeQuery(value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return ["probe: expected an object"];
  }
  const query = value as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof query.kind !== "string") return ["probe: missing \"kind\""];
  if (!KINDS.has(query.kind)) {
    return [`probe: unknown query kind "${query.kind}"; probes read, they never act`];
  }
  for (const key of CODE_KEYS) {
    if (key in query) errors.push(`probe: "${key}" is not allowed; a probe is data, not code`);
  }
  if ((query.kind === "count" || query.kind === "elements" || query.kind === "table") &&
      typeof query.select !== "string") {
    errors.push(`probe: "${query.kind}" needs a string "select"`);
  }
  if (typeof query.select === "string" && query.select.trim().length === 0) {
    errors.push("probe: \"select\" must not be empty");
  }
  if (query.fields !== undefined) {
    if (!Array.isArray(query.fields)) {
      errors.push("probe: \"fields\" must be an array");
    } else {
      for (const field of query.fields) {
        if (typeof field !== "string" || !FIELDS.has(field)) {
          errors.push(`probe: unknown field "${String(field)}"`);
        }
      }
    }
  }
  if (query.attributes !== undefined) {
    if (!Array.isArray(query.attributes)) {
      errors.push("probe: \"attributes\" must be an array");
    } else {
      for (const attr of query.attributes) {
        if (typeof attr !== "string") {
          errors.push("probe: attribute names must be strings");
          continue;
        }
        if (FORBIDDEN_ATTR.test(attr)) {
          errors.push(`probe: attribute "${attr}" may hold a credential and cannot be read`);
        }
      }
    }
  }
  if (query.limit !== undefined && typeof query.limit !== "number") {
    errors.push("probe: \"limit\" must be a number");
  }
  return errors;
}

export function parseProbeQuery(value: unknown): ProbeQuery {
  const errors = validateProbeQuery(value);
  if (errors.length > 0) {
    throw new CoreError("probe_rejected", errors.join("; "), { errors });
  }
  return value as ProbeQuery;
}

/**
 * The in-page reader. It is deliberately the only script a probe can run, and it
 * never references cookies, storage, or headers.
 */
const READER = `({ query, limits }) => {
  const clean = (s) => (s || "").trim().replace(/\\s+/g, " ").slice(0, limits.maxString);
  const visible = (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const nodes = (selector) => {
    let list;
    try {
      list = [...document.querySelectorAll(selector)];
    } catch (err) {
      return { error: "invalid selector: " + String(err && err.message ? err.message : err) };
    }
    return { list: list.slice(0, Math.min(query.limit || limits.maxNodes, limits.maxNodes)) };
  };

  const describe = (el, fields, attributes) => {
    const tag = el.tagName.toLowerCase();
    const out = {};
    const wanted = fields && fields.length ? fields : ["tag", "role", "name", "text"];
    for (const field of wanted) {
      if (field === "tag") out.tag = tag;
      else if (field === "role") out.role = el.getAttribute("role") || el.type || tag;
      else if (field === "name") {
        const label = el.closest && el.closest("label");
        out.name =
          el.getAttribute("aria-label") ||
          clean(label && label.textContent) ||
          el.getAttribute("name") ||
          el.getAttribute("placeholder") ||
          clean(el.textContent);
      } else if (field === "field") out.field = el.getAttribute("name");
      else if (field === "text") out.text = clean(el.innerText || el.textContent);
      else if (field === "value") out.value = el.type === "password" ? (el.value ? "***" : "") : clean(el.value);
      else if (field === "type") out.type = el.type || null;
      else if (field === "required") out.required = Boolean(el.required) || el.getAttribute("aria-required") === "true";
      else if (field === "disabled") out.disabled = Boolean(el.disabled);
      else if (field === "checked") out.checked = Boolean(el.checked);
      else if (field === "placeholder") out.placeholder = el.getAttribute("placeholder");
      else if (field === "visible") out.visible = visible(el);
      else if (field === "href") out.href = tag === "a" ? el.href : null;
      else if (field === "options") {
        out.options = tag === "select"
          ? [...el.options].slice(0, 50).map((o) => ({ value: o.value, label: clean(o.textContent) }))
          : null;
      }
    }
    if (attributes && attributes.length) {
      out.attributes = {};
      for (const attr of attributes) out.attributes[attr] = el.getAttribute(attr);
    }
    return out;
  };

  if (query.kind === "page_meta") {
    return { url: location.href, title: document.title, readyState: document.readyState };
  }
  if (query.kind === "text") {
    const host = query.within ? document.querySelector(query.within) : document.body;
    if (!host) return { error: "no element matched " + query.within };
    const text = (host.innerText || "").slice(0, Math.min(query.limit || limits.maxResult, limits.maxResult));
    return { text };
  }
  if (query.kind === "count") {
    const found = nodes(query.select);
    if (found.error) return found;
    let total = 0;
    try {
      total = document.querySelectorAll(query.select).length;
    } catch (err) {
      return { error: "invalid selector" };
    }
    return { count: total };
  }
  if (query.kind === "elements") {
    const found = nodes(query.select);
    if (found.error) return found;
    return { elements: found.list.map((el) => describe(el, query.fields, query.attributes)) };
  }
  if (query.kind === "links") {
    const host = query.within ? document.querySelector(query.within) : document.body;
    if (!host) return { error: "no element matched " + query.within };
    const links = [...host.querySelectorAll("a[href]")]
      .slice(0, Math.min(query.limit || limits.maxNodes, limits.maxNodes))
      .map((el) => ({ text: clean(el.textContent), href: el.href }));
    return { links };
  }
  if (query.kind === "form_inventory") {
    const host = query.within ? document.querySelector(query.within) : document;
    if (!host) return { error: "no element matched " + query.within };
    const forms = [...host.querySelectorAll("form")].slice(0, 10).map((form) => ({
      action: form.getAttribute("action"),
      method: (form.getAttribute("method") || "get").toLowerCase(),
      fields: [...form.querySelectorAll("input, select, textarea")]
        .slice(0, limits.maxNodes)
        .map((el) => describe(el, ["tag", "name", "field", "type", "required", "value", "options"])),
      submits: [...form.querySelectorAll('button, input[type="submit"]')]
        .slice(0, 10)
        .map((el) => clean(el.textContent) || el.value || el.type),
    }));
    return { forms };
  }
  if (query.kind === "table") {
    const found = nodes(query.select);
    if (found.error) return found;
    const tables = found.list.slice(0, 3).map((table) => ({
      headers: [...table.querySelectorAll("th")].slice(0, 20).map((el) => clean(el.textContent)),
      rows: [...table.querySelectorAll("tbody tr, tr")]
        .slice(0, Math.min(query.limit || 50, 50))
        .map((tr) => [...tr.querySelectorAll("td")].slice(0, 20).map((td) => clean(td.textContent)))
        .filter((row) => row.length > 0),
    }));
    return { tables };
  }
  return { error: "unsupported query" };
}`;

/**
 * No ledger here on purpose.
 *
 * A probe used to record its own evidence, which put an evidence concern inside the
 * substrate. Now the substrate answers questions and the caller decides what is worth
 * remembering, so there is one place that writes evidence rather than one per primitive.
 */
export interface ProbeOptions {
  timeoutMs?: number;
  /** Tighter result budget than the default. Callers with small context windows want this. */
  maxResultChars?: number;
}

/** Run one read-only query. Never mutates the page. */
export async function probe(
  page: Page,
  rawQuery: unknown,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const query = parseProbeQuery(rawQuery);

  const budget = Math.min(options.maxResultChars ?? MAX_RESULT_CHARS, MAX_RESULT_CHARS);

  // Playwright evaluates a string as an expression and ignores extra arguments, so the
  // payload is inlined. It is JSON of an already-validated query, never page input.
  const payload = JSON.stringify({
    query,
    limits: { maxNodes: MAX_NODES, maxString: MAX_STRING, maxResult: budget },
  });

  const raw = (await Promise.race([
    page.evaluate(`(${READER})(${payload})`),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new CoreError("probe_timeout", "probe exceeded its time budget")),
        options.timeoutMs ?? PROBE_TIMEOUT_MS,
      ),
    ),
  ])) as { error?: string } & Record<string, unknown>;

  if (raw?.error) {
    throw new CoreError("probe_failed", String(raw.error), { query });
  }

  // Redact first, then cap: a secret must not survive by being inside the kept slice.
  const redacted = redactDeep(raw);
  const serialized = JSON.stringify(redacted);
  const truncated = serialized.length > budget;
  const result: ProbeResult = { query, data: redacted, truncated };
  if (truncated) {
    result.data = { head: serialized.slice(0, budget) };
    result.note = `probe result exceeded ${budget} chars and was trimmed; narrow the query`;
  }

  return result;
}
