/**
 * One line per tool result, for a human.
 *
 * The model needs the whole snapshot; a person watching needs to know what just
 * happened. Those were the same string, so a forty-control page went to the terminal
 * verbatim and the operator could not follow their own run.
 *
 * Kept here, as data, rather than in whichever host is drawing: the CLI and the chat
 * should describe a step identically, and a summary that lives in a renderer cannot be
 * tested or reused.
 */

import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_DONE,
  TOOL_FORK,
  TOOL_OBSERVE,
  TOOL_PEEK,
  TOOL_PROBE,
  TOOL_REMEMBER,
  TOOL_SIDE_CLOSE,
  TOOL_SIDE_OPEN,
  TOOL_STRANGER,
  TOOL_SURVEY,
} from "./names.ts";
import { findWireObservation, type WireObservation } from "./wire.ts";

/** Long enough to be useful on one terminal line, short enough to stay on one. */
const MAX_SUMMARY = 110;

function short(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    // "www." is four characters that never once distinguished two pages.
    return `${parsed.host.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

function clip(text: string, max = MAX_SUMMARY): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** What a page snapshot amounts to: where it is, and how much is on it. */
function describePage(observation: WireObservation): string {
  const parts = [`${observation.controls.length} controls`];
  if (observation.dialogs?.length) parts.push(`${observation.dialogs.length} dialogs`);
  if (observation.changes?.length) parts.push(`+${observation.changes.length} changes`);
  if (observation.errors?.length) parts.push(`${observation.errors.length} page errors`);
  if (observation.note) parts.push("truncated");
  return `${short(observation.url)} - ${parts.join(", ")}`;
}

function get(details: unknown, key: string): unknown {
  return details && typeof details === "object"
    ? (details as Record<string, unknown>)[key]
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * A failure is the one thing that must always be legible, whichever tool produced it,
 * so it is checked before anything tool-specific.
 */
function describeFailure(details: unknown): string | undefined {
  const error = str(get(details, "error"));
  if (error) return `error: ${error}`;

  const refused = str(get(details, "refused"));
  if (refused) return `refused (${refused}): ${str(get(details, "why")) ?? "no reason given"}`;

  const parked = str(get(details, "parked"));
  if (parked) return `parked for approval: ${parked}`;

  if (get(details, "ok") === false) {
    const why = get(details, "why");
    const reasons = Array.isArray(why) ? why.map((entry) => String(entry)).join("; ") : undefined;
    const recovery = str(get(details, "recovery"));
    return `FAILED: ${reasons ?? recovery ?? "no detail"}`;
  }
  return undefined;
}

function describeTool(tool: string, details: unknown): string {
  switch (tool) {
    case TOOL_OBSERVE:
    case TOOL_SIDE_CLOSE: {
      const page = findWireObservation(details);
      return page ? describePage(page) : "no page";
    }
    case TOOL_ACT: {
      const page = findWireObservation(details);
      const changes = page?.changes?.length ?? 0;
      return `ok${changes > 0 ? `, ${changes} changes` : ", nothing changed"}${
        page ? ` on ${short(page.url)}` : ""
      }`;
    }
    case TOOL_PEEK: {
      // Deliberately terser than a page description: a peek is judged on whether it
      // found the right thing and left you where you were, and both must fit the line.
      const page = findWireObservation(details);
      const identity = get(details, "matched") === false ? "wrong thing" : "as expected";
      const where = page ? `${short(page.url)}, ${page.controls.length} controls` : "no page";
      return `${where} (${identity}), still on ${short(str(get(details, "stillOn")))}`;
    }
    case TOOL_SIDE_OPEN: {
      const page = findWireObservation(details);
      return `${page ? describePage(page) : "no page"}, holding ${short(str(get(details, "stillOn")))}`;
    }
    case TOOL_STRANGER: {
      const differences = get(details, "differences");
      const count = Array.isArray(differences) ? differences.length : 0;
      return count > 0 ? `${count} differences from your view` : "identical to your view";
    }
    case TOOL_CHECK: {
      const passed = get(details, "passed");
      const checks = get(details, "checks");
      const first = Array.isArray(checks) && checks.length > 0 ? String(checks[0]) : "";
      return `${passed === true ? "pass" : "FAIL"}${first ? ` ${first}` : ""}`;
    }
    case TOOL_PROBE: {
      const note = str(get(details, "note"));
      return note ? `answered (${note})` : "answered";
    }
    case TOOL_SURVEY: {
      const described = ["navigation", "tabs", "search", "content", "actions"]
        .map((group) => ({ group, entries: get(details, group) }))
        .filter(({ entries }) => Array.isArray(entries) && entries.length > 0)
        .map(({ group, entries }) => `${(entries as unknown[]).length} ${group}`)
        .join(", ");
      return `${short(str(get(details, "url")))} offers ${described || "nothing"}`;
    }
    case TOOL_ASK: {
      return get(details, "answered") === true
        ? `answered: ${str(get(details, "answer")) ?? ""}`
        : "nobody answered";
    }
    case TOOL_REMEMBER: {
      return `noted ${str(get(details, "remembered")) ?? "nothing"}`;
    }
    case TOOL_FORK: {
      return `"${str(get(details, "recorded")) ?? "?"}" had ${get(details, "candidates")} meanings, ${str(
        get(details, "resolution"),
      )}`;
    }
    case TOOL_DONE: {
      return `${str(get(details, "status")) ?? "?"}: ${str(get(details, "summary")) ?? ""}`;
    }
    default:
      return "";
  }
}

/**
 * One line describing a tool result, without the tool's own name: hosts already show
 * that, and repeating it wastes the width that the interesting part needs.
 */
export function summarizeToolResult(tool: string, details: unknown): string {
  const failure = describeFailure(details);
  if (failure) return clip(failure);

  const described = describeTool(tool, details);
  // Better a blunt fallback than a confident lie about a tool nobody taught us.
  return clip(described || "done");
}
