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
import { peek } from "../core/peek.ts";
import { viewWithoutSession } from "../core/perspective.ts";
import { surveyCounts } from "../core/survey.ts";
import { stepCheck } from "../core/task.ts";
import { CoreError, type ActionRequest, type ParkedOutcome, type Predicate } from "../core/types.ts";
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
import { hashOf, observationStats } from "./metrics.ts";
import type { Evidence } from "./evidence.ts";
import { findWireObservation, wireText } from "./wire.ts";
import { flatView, type ViewStrategy } from "./view/index.ts";

export interface ReportPayload {
  status: "success" | "blocked" | "failed";
  summary: string;
}

export interface ToolContext {
  browser: BrowserPort;
  tabId?: string;
  /**
   * Required, and one thing rather than six optional ones.
   *
   * Every recording dependency used to be individually optional, so forgetting them all
   * looked exactly like choosing to record nothing. Recording nothing is still possible
   * via `nullEvidence()`; it just has to be said out loud.
   */
  evidence: Evidence;
  policy?: ApprovalMode;
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  askUser?: (question: string) => Promise<string | undefined>;
  onReport?: (report: ReportPayload) => void;
  onParked?: (parked: ParkedOutcome) => void;
  /** Counts one browser action against the task budget. */
  onStep?: () => void;
  /**
   * The action budget, so results can say how much is left.
   *
   * The system prompt is set once and resent verbatim, so a live counter cannot live in
   * the task card. Riding on action results instead costs nothing: the model already
   * reads them, and it currently cannot tell it is losing until it is cut off.
   */
  stepLimit?: number;
  /**
   * Cap on session-free views. Each one is a real anonymous request to the site, so it is
   * budgeted like any other read-only exploration rather than being free.
   */
  strangerViewBudget?: number;
  /** The current turn, so a result can be joined to the turn that paid for it. */
  turn?: () => number;
  /** How the page is described to the model. Defaults to the flat control list. */
  view?: ViewStrategy;
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

/**
 * Measure and keep every tool result, at the one place they all pass through.
 *
 * Wrapping `execute` rather than `reply` keeps the tool name available and means a tool
 * added later is measured without touching it. The text measured here is exactly the
 * string the model receives, so the bytes are the real bytes rather than an estimate -
 * and it is the same string written to the payload log, which is what makes it safe for
 * a host to show one line instead.
 */
function measured(tool: RuntimeTool, context: ToolContext): RuntimeTool {
  const { metrics, payloads } = context.evidence;

  return {
    ...tool,
    execute: async (toolCallId: string, params: unknown) => {
      const result = await tool.execute(toolCallId, params);
      const turn = context.turn?.() ?? 0;
      const text = result.content.map((part) => part.text).join("");
      const hash = hashOf(text);

      payloads.write({ at: new Date().toISOString(), turn, tool: tool.name, bytes: text.length, hash, text });

      metrics.record({
        kind: "tool_result",
        turn,
        tool: tool.name,
        bytes: text.length,
        hash,
      });

      // Snapshots dominate the bill, so they are counted in their own right wherever
      // they turn up rather than only when `observe` produced them.
      const observation = findWireObservation(result.details);
      if (observation) {
        const stats = observationStats(observation);
        metrics.record({
          kind: "observation",
          turn,
          tool: tool.name,
          bytes: wireText(observation).length,
          hash: hashOf(wireText(observation)),
          ...stats,
        });
      }

      return result;
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof CoreError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function buildTools(context: ToolContext): AgentTool[] {
  const view = context.view ?? flatView;
  let strangerViews = 0;
  let steps = 0;

  // The primary tab is the one the task is anchored to. A side tab makes the *active* tab
  // something else for a while, and every tool follows it, so `act` works in the side tab
  // with no special casing. The primary is never navigated by side work, which is the
  // whole point: there is no position to restore because nothing moved.
  let sideTab: string | undefined;
  const tab = () => sideTab ?? context.tabId;

  const countStep = () => {
    steps += 1;
    context.onStep?.();
  };

  /**
   * How much of the budget is gone.
   *
   * The nudge past halfway exists because a bad route is only worth knowing about while
   * there is still budget to change it. It suggests rather than instructs: we do not know
   * how many items are left, so we cannot say whether the pace is actually wrong.
   */
  const budget = (): Record<string, unknown> | undefined => {
    if (!context.stepLimit) return undefined;
    const spent = { spent: steps, limit: context.stepLimit };
    if (steps * 2 < context.stepLimit) return spent;
    return {
      ...spent,
      note:
        "Over half the action budget is gone. If you are working through a list, check you " +
        `are on the cheap route: ${TOOL_PEEK} reads an item without leaving the list.`,
    };
  };

  const tools: RuntimeTool[] = [
    {
      name: TOOL_OBSERVE,
      label: "Observe",
      description:
        "Snapshot the page: url, title, controls with refs and values, dialogs, page errors, and what changed since the last look.",
      promptSnippet: "Look at the page. Refs come from here.",
      parameters: Type.Object({}),
      execute: async () => reply(view.observation(await context.browser.observe(tab()))),
    },
    {
      name: TOOL_PROBE,
      label: "Probe",
      description:
        'Read-only question about the page. {"kind":"form_inventory"} lists fields with required flags and wire names. {"kind":"elements","select":"select","fields":["name","options"]} lists option values. Other kinds: page_meta, text, count, table, links. Cannot change the page or read credentials.',
      promptSnippet: "Read anything about the page without touching it.",
      parameters: Type.Object({ query: Type.Object({}, { additionalProperties: true })}),
      execute: async (_id: string, params: unknown) => {
        const query = (params as { query: unknown }).query;
        try {
          const result = await context.browser.probe(query, tab());
          // The probe answers; recording is ours, so evidence has one owner.
          await context.evidence.ledger.append({
            type: "probe",
            entityId: context.evidence.entityId,
            intent: `probe ${(query as { kind?: string })?.kind ?? "?"}`,
            payload: { query, truncated: result.truncated },
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
            { ledger: context.evidence.ledger, entityId: context.evidence.entityId, tabId: tab() },
          );
          return reply(view.verification(verification));
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
          countStep();
          const outcome = await guardedAct(
            context.browser,
            { ...request, tabId: tab() },
            {
              policy: context.policy,
              approve: context.approve,
              ledger: context.evidence.ledger,
              entityId: context.evidence.entityId,
              screenshotDir: context.evidence.screenshotDir,
              precondition: request.expect as Predicate | undefined,
              checkpoint: context.evidence.goal,
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
          const spent = budget();
          return reply({
            ...view.actionResult(outcome.result),
            ...(spent ? { budget: spent } : {}),
          });
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
        await context.evidence.ledger.append({
          type: "note",
          entityId: context.evidence.entityId,
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
            ledger: context.evidence.ledger,
            entityId: context.evidence.entityId,
          });
          return reply({
            asStranger: view.observation(result.signedOut),
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
        const event = await context.evidence.ledger.append({
          type: "note",
          entityId: context.evidence.entityId,
          intent: `established: ${key}`,
          outcome: { ok: true, detail: value },
        });
        await context.evidence.facts.mergeGoalFacts({
          [key]: { value, evidence: event?.id, at: new Date().toISOString() },
        });
        return reply({ remembered: key, evidence: event?.id ?? null });
      },
    },
    {
      name: TOOL_SURVEY,
      label: "Survey",
      description:
        "List what this page offers — navigation, tabs, search boxes, content links, buttons — grouped and deduped, following none of them. Use it before choosing a route, so you weigh the options against each other instead of taking the first that could work. It changes nothing.",
      promptSnippet: "See the routes on offer before picking one.",
      parameters: Type.Object({}),
      execute: async () => {
        try {
          const survey = await context.browser.survey(tab());
          await context.evidence.ledger.append({
            type: "probe",
            entityId: context.evidence.entityId,
            intent: `survey what ${survey.url} offers`,
            payload: { counts: surveyCounts(survey) },
          });
          return reply(survey);
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_PEEK,
      label: "Peek",
      description:
        `Read a URL in a side tab and come straight back, without leaving the page you are on. Use it to inspect items in a list: navigating away loses your place in the list, and peeking does not. Give expect (a predicate) when you built the URL from a name or id, so a URL that resolves to the wrong thing is caught instead of believed. The page is closed again, so refs from it cannot be acted on — use ${TOOL_SIDE_OPEN} when you need to do something there. Costs one action.`,
      promptSnippet: "Read something elsewhere without losing your place.",
      parameters: Type.Object({
        url: Type.String(),
        expect: Type.Optional(
          Type.Object({}, { additionalProperties: true, description: "Predicate proving identity" }),
        ),
      }),
      execute: async (_id: string, params: unknown) => {
        const raw = params as { url?: unknown; expect?: unknown };
        try {
          countStep();
          const result = await peek(context.browser, {
            url: String(raw.url ?? ""),
            tabId: tab(),
            ...(raw.expect ? { expect: raw.expect as Predicate } : {}),
            ledger: context.evidence.ledger,
            entityId: context.evidence.entityId,
          });
          const spent = budget();
          return reply({
            page: view.observation(result.observation),
            matched: result.matched,
            ...(result.identity ? { identity: result.identity.detail } : {}),
            ...(result.matched
              ? {}
              : { note: "This is not what you asked for. Do not read anything into it." }),
            stillOn: result.origin.url,
            ...(spent ? { budget: spent } : {}),
          });
        } catch (err) {
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_SIDE_OPEN,
      label: "Open side tab",
      description:
        `Open a side tab and work in it. Use it when reading is not enough — searching for something, filling a form — and you must not lose the page you are on. Every tool then targets the side tab until ${TOOL_SIDE_CLOSE}. One at a time.`,
      promptSnippet: "Work somewhere else without losing your place.",
      parameters: Type.Object({ url: Type.String() }),
      execute: async (_id: string, params: unknown) => {
        if (sideTab) {
          return reply({
            error: "a side tab is already open",
            note: `Close it with ${TOOL_SIDE_CLOSE} first. Only one at a time.`,
          });
        }
        try {
          countStep();
          const primary = await context.browser.observe(context.tabId);
          sideTab = await context.browser.openTab(String((params as { url?: unknown }).url ?? ""));
          const observation = await context.browser.observe(sideTab);
          await context.evidence.ledger.append({
            type: "note",
            entityId: context.evidence.entityId,
            intent: `open side tab at ${observation.url}`,
            outcome: { ok: true, detail: `still on ${primary.url}` },
          });
          return reply({
            page: view.observation(observation),
            stillOn: primary.url,
            note: `You are now working in the side tab. ${TOOL_SIDE_CLOSE} returns you.`,
          });
        } catch (err) {
          // A failed open must not leave the active tab pointing at nothing.
          sideTab = undefined;
          return reply({ error: describeError(err) });
        }
      },
    },
    {
      name: TOOL_SIDE_CLOSE,
      label: "Close side tab",
      description: "Close the side tab and go back to working on the page you left.",
      promptSnippet: "Return to the page you left.",
      parameters: Type.Object({}),
      execute: async () => {
        if (!sideTab) return reply({ error: "no side tab is open" });
        const closing = sideTab;
        sideTab = undefined;
        try {
          await context.browser.closeTab(closing);
        } catch (err) {
          return reply({ error: describeError(err) });
        }
        return reply({ page: view.observation(await context.browser.observe(context.tabId)) });
      },
    },
    {
      name: TOOL_FORK,
      label: "Note fork",
      description:
        "Record that a word in the task matched more than one thing on this site, and what you did about it. Cover every branch and label results by source when that is cheap and bounded; ask the operator when it is not. Either way record it, because choosing one meaning silently gives a confident answer to a question nobody asked.",
      promptSnippet: "Record an ambiguity instead of silently resolving it.",
      parameters: Type.Object({
        term: Type.String({ description: 'The word from the task, e.g. "friend list"' }),
        candidates: Type.Array(Type.String(), { description: "What it could mean here" }),
        resolution: Type.String({ description: "covered_all | asked | chose" }),
        why: Type.String(),
      }),
      execute: async (_id: string, params: unknown) => {
        const raw = params as {
          term?: unknown;
          candidates?: unknown;
          resolution?: unknown;
          why?: unknown;
        };
        const term = String(raw.term ?? "").trim();
        const candidates = Array.isArray(raw.candidates)
          ? raw.candidates.map((entry) => String(entry).trim()).filter(Boolean)
          : [];
        if (!term || candidates.length < 2) {
          return reply({
            error: "a fork needs a term and at least two candidates",
            note: "If only one thing matched, there is no fork to record.",
          });
        }
        const resolution = ["covered_all", "asked", "chose"].includes(String(raw.resolution))
          ? String(raw.resolution)
          : "chose";
        const why = String(raw.why ?? "").trim();

        const event = await context.evidence.ledger.append({
          type: "fork",
          entityId: context.evidence.entityId,
          intent: `"${term}" could mean ${candidates.join(" or ")}`,
          outcome: { ok: true, detail: `${resolution}: ${why}` },
          payload: { term, candidates, resolution, why },
        });
        await context.evidence.facts.mergeGoalFacts({
          [`fork:${term}`]: { candidates, resolution, why, evidence: event?.id },
        });
        return reply({ recorded: term, candidates: candidates.length, resolution });
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
  return tools.map((tool) => measured(tool, context)) as unknown as AgentTool[];
}
