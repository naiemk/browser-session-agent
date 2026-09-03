/**
 * Core capabilities as agent tools.
 *
 * Thin on purpose: validate, delegate to the core, return a compact result. Everything
 * that matters — verification, reversibility, the commit gate, evidence — happens inside
 * the core, so a tool cannot skip it by accident.
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { BrowserPort } from "../core/browser.ts";
import { guardedAct, type ApprovalMode, type ApprovalRequest } from "../core/gate.ts";
import type { Ledger } from "../core/ledger.ts";
import { viewWithoutSession } from "../core/perspective.ts";
import { probe } from "../core/probe.ts";
import type { GoalStore } from "../core/state.ts";
import { stepCheck } from "../core/task.ts";
import { CoreError, type ActionRequest, type ParkedOutcome, type Predicate } from "../core/types.ts";
import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_DONE,
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_REMEMBER,
  TOOL_STRANGER,
} from "./names.ts";
import {
  toWireActionResult,
  toWireObservation,
  toWireVerification,
  wireText,
} from "./wire.ts";

export interface ReportPayload {
  status: "success" | "blocked" | "failed";
  summary: string;
}

export interface ToolContext {
  browser: BrowserPort;
  tabId?: string;
  ledger?: Ledger;
  entityId?: string;
  goalRoot?: string;
  goalId?: string;
  policy?: ApprovalMode;
  screenshotDir?: string;
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  askUser?: (question: string) => Promise<string | undefined>;
  onReport?: (report: ReportPayload) => void;
  onParked?: (parked: ParkedOutcome) => void;
  /** Counts one browser action against the task budget. */
  onStep?: () => void;
  /** Where established facts are kept, so they survive the task that found them. */
  goalStore?: GoalStore;
  /**
   * Cap on session-free views. Each one is a real anonymous request to the site, so it is
   * budgeted like any other read-only exploration rather than being free.
   */
  strangerViewBudget?: number;
}

export const DEFAULT_STRANGER_VIEW_BUDGET = 3;

type Result = { content: Array<{ type: "text"; text: string }>; details: unknown; terminate?: boolean };

/**
 * Our tool shape. Params are `unknown` on purpose: the schema is enforced by the engine,
 * and narrowing here rather than trusting a generic keeps the cast at one boundary.
 */
interface RuntimeTool {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: unknown;
  execute: (toolCallId: string, params: unknown) => Promise<Result>;
}

function reply(value: unknown, details: unknown = value): Result {
  return { content: [{ type: "text", text: wireText(value) }], details };
}

function describeError(err: unknown): string {
  if (err instanceof CoreError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function buildTools(context: ToolContext): AgentTool[] {
  const tab = () => context.tabId;
  let strangerViews = 0;

  const tools: RuntimeTool[] = [
    {
      name: TOOL_OBSERVE,
      label: "Observe",
      description:
        "Snapshot the page: url, title, controls with refs and values, dialogs, page errors, and what changed since the last look.",
      promptSnippet: "Look at the page. Refs come from here.",
      parameters: Type.Object({}),
      execute: async () => reply(toWireObservation(await context.browser.observe(tab()))),
    },
    {
      name: TOOL_PROBE,
      label: "Probe",
      description:
        'Read-only question about the page. {"kind":"form_inventory"} lists fields with required flags and wire names. {"kind":"elements","select":"select","fields":["name","options"]} lists option values. Other kinds: page_meta, text, count, table, links. Cannot change the page or read credentials.',
      promptSnippet: "Read anything about the page without touching it.",
      parameters: Type.Object({ query: Type.Object({}, { additionalProperties: true })}),
      execute: async (_id: string, params: unknown) => {
        try {
          const result = await probe(context.browser.pageFor(tab()), (params as { query: unknown }).query, {
            ledger: context.ledger,
            entityId: context.entityId,
          });
          return reply(result.truncated ? { data: result.data, note: result.note } : result.data);
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_CHECK,
      label: "Check",
      description:
        'Assert something about the page now, evaluated in code. {"predicate":{"kind":"text_visible","text":"Submitted"}}. Kinds: text_visible, text_absent, url_includes, title_includes, ref_exists, control_exists, control_absent, value_equals, value_includes, no_console_error, dialog_open, all, any, not.',
      promptSnippet: "Verify a claim instead of assuming it.",
      parameters: Type.Object({ predicate: Type.Object({}, { additionalProperties: true })}),
      execute: async (_id: string, params: unknown) => {
        try {
          const verification = await stepCheck(
            context.browser,
            (params as { predicate: unknown }).predicate,
            { ledger: context.ledger, entityId: context.entityId, tabId: tab() },
          );
          return reply(toWireVerification(verification));
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_ACT,
      label: "Act",
      description:
        "One verified browser action. kind is navigate, click, type, select, scroll, wait, or upload. Address controls with ref from the latest observation. The result says whether it actually worked, and why not.",
      promptSnippet: "One verified browser action.",
      parameters: Type.Object({
        kind: Type.String({ description: "navigate | click | type | select | scroll | wait | upload" }),
        ref: Type.Optional(Type.String()),
        url: Type.Optional(Type.String()),
        text: Type.Optional(Type.String()),
        value: Type.Optional(Type.String()),
        dy: Type.Optional(Type.Number()),
        files: Type.Optional(Type.Array(Type.String())),
        wait: Type.Optional(Type.Object({}, { additionalProperties: true })),
        expect: Type.Optional(Type.Object({}, { additionalProperties: true })),
        intent: Type.Optional(Type.String({ description: "Why, in a few words" })),
      }),
      execute: async (_id: string, params: unknown) => {
        const request = params as unknown as ActionRequest;
        try {
          context.onStep?.();
          const outcome = await guardedAct(
            context.browser,
            { ...request, tabId: tab() },
            {
              policy: context.policy,
              approve: context.approve,
              ledger: context.ledger,
              entityId: context.entityId,
              screenshotDir: context.screenshotDir,
              precondition: request.expect as Predicate | undefined,
              checkpoint:
                context.goalRoot && context.goalId
                  ? { root: context.goalRoot, goalId: context.goalId }
                  : undefined,
            },
          );

          if (outcome.status === "parked") {
            context.onParked?.(outcome.parked);
            return reply({
              done: false,
              parked: outcome.parked.reason,
              note: "Needs operator approval. It has not happened.",
            });
          }
          if (outcome.status === "refused") {
            return reply({
              done: false,
              refused: outcome.code,
              why: outcome.reason,
              note: "The action did not happen. Fix the precondition or take another route.",
            });
          }
          return reply(toWireActionResult(outcome.result));
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_ASK,
      label: "Ask operator",
      description: "Ask the operator for something only they know. Never invent personal data.",
      promptSnippet: "Ask rather than guess personal facts.",
      parameters: Type.Object({ question: Type.String() }),
      execute: async (_id: string, params: unknown) => {
        const question = String((params as { question: unknown }).question);
        const answer = await context.askUser?.(question);
        await context.ledger?.append({
          type: "note",
          entityId: context.entityId,
          intent: `asked: ${question}`,
          outcome: { ok: answer !== undefined, detail: answer ?? "unanswered" },
        });
        return answer === undefined
          ? reply({ answered: false, note: "Nobody available. Report what you are missing." })
          : reply({ answered: true, answer });
      },
    },
    {
      name: TOOL_STRANGER,
      label: "View without session",
      description:
        "Load a URL with no cookies and no session, and compare it with the same URL as you. Use it when it matters who can see something, or to find out what your session grants. Returns what a stranger sees plus the differences; it draws no conclusion, and a difference can also come from A/B tests or geography. Each call is a real anonymous request, so it is budgeted.",
      promptSnippet: "See a page as an anonymous visitor, and how that differs.",
      parameters: Type.Object({
        url: Type.Optional(Type.String({ description: "Defaults to the current page" })),
      }),
      execute: async (_id: string, params: unknown) => {
        const budget = context.strangerViewBudget ?? DEFAULT_STRANGER_VIEW_BUDGET;
        if (strangerViews >= budget) {
          return reply({
            error: `session-free view budget of ${budget} is spent`,
            note: "Reason from what you already observed, or ask the operator.",
          });
        }
        strangerViews += 1;
        try {
          const result = await viewWithoutSession(context.browser, {
            url: (params as { url?: string }).url,
            tabId: tab(),
            ledger: context.ledger,
            entityId: context.entityId,
          });
          return reply({
            asStranger: toWireObservation(result.signedOut),
            differences: result.delta,
          });
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_REMEMBER,
      label: "Remember",
      description:
        "Record something you established, in your own words, so it outlives this task. Use it for what you worked out about the situation: who you are acting as, what your session grants, what you confirmed about a page. Free-form: pick your own keys.",
      promptSnippet: "Record what you established, with the evidence for it.",
      parameters: Type.Object({
        key: Type.String({ description: "Short name, e.g. operating-identity" }),
        value: Type.String({ description: "What you established, and what you saw" }),
      }),
      execute: async (_id: string, params: unknown) => {
        const raw = params as { key?: unknown; value?: unknown };
        const key = String(raw.key ?? "").trim();
        const value = String(raw.value ?? "").trim();
        if (!key || !value) return reply({ error: "remember needs a key and a value" });

        // The ledger event is the provenance: the fact points at what established it.
        const event = await context.ledger?.append({
          type: "note",
          entityId: context.entityId,
          intent: `established: ${key}`,
          outcome: { ok: true, detail: value },
        });
        await context.goalStore?.mergeGoalFacts({
          [key]: { value, evidence: event?.id, at: new Date().toISOString() },
        });
        return reply({ remembered: key, evidence: event?.id ?? null });
      },
    },
    {
      name: TOOL_DONE,
      label: "Report",
      description:
        "Report the outcome and stop. status is success, blocked, or failed. The criteria are checked independently, so be truthful.",
      promptSnippet: "Finish with a truthful report.",
      parameters: Type.Object({
        status: Type.String({ description: "success | blocked | failed" }),
        summary: Type.String(),
      }),
      execute: async (_id: string, params: unknown) => {
        const raw = params as { status?: unknown; summary?: unknown };
        const status = ["success", "blocked", "failed"].includes(String(raw.status))
          ? (String(raw.status) as ReportPayload["status"])
          : "failed";
        const report: ReportPayload = { status, summary: String(raw.summary ?? "") };
        context.onReport?.(report);
        // Terminate: the report ends the task, so no follow-up model turn is needed.
        return { ...reply(report, report), terminate: true };
      },
    },
  ];

  // One cast, at the boundary where the engine takes over.
  return tools as unknown as AgentTool[];
}
