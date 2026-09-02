/**
 * Core capabilities exposed to Pi as tools.
 *
 * The agent layer owns this translation so the core stays free of Pi (D34). Each tool
 * is thin: it validates, delegates to the core, and returns JSON. Verification,
 * classification, gating, and evidence all happen inside the core, so a tool cannot
 * skip them by accident.
 */

import { Type } from "typebox";
import { act } from "../core/act.ts";
import type { BrowserPort } from "../core/browser.ts";
import { guardedAct, type ApprovalMode, type ApprovalRequest } from "../core/gate.ts";
import type { Ledger } from "../core/ledger.ts";
import { probe } from "../core/probe.ts";
import { stepCheck } from "../core/task.ts";
import { CoreError, type ActionRequest, type ParkedOutcome, type Predicate } from "../core/types.ts";
import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_TASK_RESULT,
} from "./tool-names.ts";

export interface ToolDeps {
  browser: BrowserPort;
  tabId?: string;
  ledger?: Ledger;
  entityId?: string;
  goalRoot?: string;
  goalId?: string;
  policy?: ApprovalMode;
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  askUser?: (question: string) => Promise<string | undefined>;
  screenshotDir?: string;
  /** Called when the agent reports an outcome. */
  onResult?: (result: TaskResultReport) => void;
  /** Called when the gate parks an action. */
  onParked?: (parked: ParkedOutcome) => void;
  /** Counts a browser step against the task's budget. */
  step?: () => void;
}

export interface TaskResultReport {
  status: "success" | "blocked" | "failed";
  summary: string;
  evidence?: string;
}

/** A tool definition shaped for Pi's `defineTool`, without importing Pi here. */
export interface AgentToolDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown; terminate?: boolean }>;
}

function ok(value: unknown, details: unknown = value) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details };
}

function fail(message: string, details: unknown = {}) {
  return { content: [{ type: "text" as const, text: message }], details };
}

export function buildTools(deps: ToolDeps): AgentToolDefinition[] {
  const tabId = () => deps.tabId;

  const observe: AgentToolDefinition = {
    name: TOOL_OBSERVE,
    label: "Observe page",
    description:
      "Compact snapshot of the current page: url, title, ref-tagged controls with values, dialogs, in-page errors, console errors, failed requests, and what changed since the last look.",
    promptSnippet: "Look at the page before acting; refs come from here.",
    parameters: Type.Object({}),
    execute: async () => ok(await deps.browser.observe(tabId())),
  };

  const probeTool: AgentToolDefinition = {
    name: TOOL_PROBE,
    label: "Probe page",
    description:
      'Ask the page a read-only question. Kinds: page_meta, text, count, elements, form_inventory, table, links. Example: {"kind":"form_inventory"} or {"kind":"elements","select":"select","fields":["name","options"]}. Probing cannot change the page and cannot read cookies, storage, or credentials.',
    promptSnippet: "Read anything about the page without touching it.",
    parameters: Type.Object(
      { query: Type.Object({}, { additionalProperties: true }) },
      { additionalProperties: false },
    ),
    execute: async (_id, params) => {
      try {
        const result = await probe(deps.browser.pageFor(tabId()), params.query, {
          ledger: deps.ledger,
          entityId: deps.entityId,
        });
        return ok(result);
      } catch (err) {
        return fail(describeError(err), { error: describeError(err) });
      }
    },
  };

  const check: AgentToolDefinition = {
    name: TOOL_CHECK,
    label: "Check page",
    description:
      'Assert something about the page right now, evaluated in code. Example: {"predicate":{"kind":"text_visible","text":"Application submitted"}}. Use before claiming a task is done. Your own checks are evidence; they do not decide the task.',
    promptSnippet: "Verify a claim about the page instead of assuming it.",
    parameters: Type.Object(
      { predicate: Type.Object({}, { additionalProperties: true }) },
      { additionalProperties: false },
    ),
    execute: async (_id, params) => {
      try {
        const verification = await stepCheck(deps.browser, params.predicate, {
          ledger: deps.ledger,
          entityId: deps.entityId,
          tabId: tabId(),
        });
        return ok(verification);
      } catch (err) {
        return fail(describeError(err), { error: describeError(err) });
      }
    },
  };

  const actTool: AgentToolDefinition = {
    name: TOOL_ACT,
    label: "Act on page",
    description:
      "Do one thing to the page: navigate, click, type, select, upload, scroll, or wait. Address controls by the ref from the latest observation. Every action is verified; the result tells you whether it actually worked and why not.",
    promptSnippet: "One verified browser action.",
    parameters: Type.Object({
      kind: Type.String({
        description: "navigate | click | type | select | scroll | wait | upload",
      }),
      ref: Type.Optional(Type.String({ description: "Control ref from the latest observation" })),
      url: Type.Optional(Type.String()),
      text: Type.Optional(Type.String()),
      value: Type.Optional(Type.String()),
      dy: Type.Optional(Type.Number()),
      files: Type.Optional(Type.Array(Type.String())),
      wait: Type.Optional(Type.Object({}, { additionalProperties: true })),
      expect: Type.Optional(Type.Object({}, { additionalProperties: true })),
      intent: Type.Optional(Type.String({ description: "Why you are doing this" })),
    }),
    execute: async (_id, params) => {
      const request = params as unknown as ActionRequest;
      try {
        deps.step?.();
        const outcome = await guardedAct(deps.browser, { ...request, tabId: tabId() }, {
          policy: deps.policy,
          approve: deps.approve,
          ledger: deps.ledger,
          entityId: deps.entityId,
          screenshotDir: deps.screenshotDir,
          precondition: request.expect as Predicate | undefined,
          checkpoint:
            deps.goalRoot && deps.goalId
              ? { root: deps.goalRoot, goalId: deps.goalId }
              : undefined,
        });

        if (outcome.status === "parked") {
          deps.onParked?.(outcome.parked);
          return ok({
            parked: true,
            reason: outcome.parked.reason,
            note: "This action needs operator approval and has not happened.",
          });
        }
        if (outcome.status === "refused") {
          return ok({
            refused: true,
            code: outcome.code,
            reason: outcome.reason,
            note: "The action did not happen. Satisfy the precondition or choose another route.",
          });
        }
        const result = outcome.result;
        return ok({
          ok: result.ok,
          reversibility: result.reversibility,
          verification: result.verification,
          failure: result.failure,
          url: result.observation.url,
          changes: result.observation.changes,
        });
      } catch (err) {
        return fail(describeError(err), { error: describeError(err) });
      }
    },
  };

  const ask: AgentToolDefinition = {
    name: TOOL_ASK,
    label: "Ask the operator",
    description:
      "Ask the operator for information only they can supply, such as a personal detail or a decision. Never invent personal data.",
    promptSnippet: "Ask rather than guess personal facts.",
    parameters: Type.Object({ question: Type.String() }),
    execute: async (_id, params) => {
      const question = String(params.question);
      const answer = await deps.askUser?.(question);
      await deps.ledger?.append({
        type: "note",
        entityId: deps.entityId,
        intent: `asked: ${question}`,
        outcome: { ok: answer !== undefined, detail: answer === undefined ? "unanswered" : "answered" },
      });
      if (answer === undefined) {
        return ok({
          answered: false,
          note: "Nobody is available to answer. Report what you are missing with task_result.",
        });
      }
      return ok({ answered: true, answer });
    },
  };

  const taskResult: AgentToolDefinition = {
    name: TOOL_TASK_RESULT,
    label: "Report outcome",
    description:
      "Report the outcome and stop. status is success, blocked (something outside your control stopped you), or failed. Be truthful: the criteria are evaluated independently.",
    promptSnippet: "Finish the task with a truthful report.",
    parameters: Type.Object({
      status: Type.String({ description: "success | blocked | failed" }),
      summary: Type.String(),
      evidence: Type.Optional(Type.String({ description: "What on the page shows this" })),
    }),
    execute: async (_id, params) => {
      const report: TaskResultReport = {
        status: (["success", "blocked", "failed"].includes(String(params.status))
          ? String(params.status)
          : "failed") as TaskResultReport["status"],
        summary: String(params.summary ?? ""),
        evidence: params.evidence === undefined ? undefined : String(params.evidence),
      };
      deps.onResult?.(report);
      // Terminate: the report is the end of the task, so no follow-up model turn is needed.
      return { ...ok(report, report), terminate: true };
    },
  };

  return [observe, probeTool, check, actTool, ask, taskResult];
}

export { act };

function describeError(err: unknown): string {
  if (err instanceof CoreError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
