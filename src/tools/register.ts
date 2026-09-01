import { Type } from "typebox";
import type { ActionName, Expectation, WaitSpec } from "../domain/types.ts";
import { AgentError } from "../domain/types.ts";
import type { ExtensionAPI, ExtensionContext } from "../pi-api.ts";
import { textResult } from "../pi-api.ts";
import { parseStartArgs, type ActionInput } from "../session.ts";
import type { SessionHandle } from "../host/session-handle.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function runParam() {
  return Type.Optional(Type.String({ description: "Run id; defaults to the current run" }));
}

function tabParam() {
  return Type.Optional(Type.String({ description: "Tab id; defaults to the run's current tab" }));
}

function expectParam() {
  return Type.Optional(
    Type.Object({
      urlIncludes: Type.Optional(Type.String()),
      titleIncludes: Type.Optional(Type.String()),
      textVisible: Type.Optional(Type.String()),
      refExists: Type.Optional(Type.String()),
      dialogOpen: Type.Optional(Type.Boolean()),
      noConsoleError: Type.Optional(Type.Boolean()),
    }),
  );
}

export function registerBrowserTools(pi: ExtensionAPI, session: SessionHandle): void {
  const wrap = (
    name: string,
    execute: (params: Record<string, unknown>, ctx: ExtensionContext) => Promise<unknown>,
  ) => {
    return async (
      _id: string,
      params: Record<string, unknown>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) => {
      try {
        const result = await execute(params, ctx);
        const verification = (result as { verification?: { status?: string } } | undefined)?.verification;
        const failed =
          verification?.status === "failed" || (result as { ok?: boolean } | undefined)?.ok === false;
        await session.recordTool(name, params, { ok: !failed, verification }, failed);
        return textResult(stringify(result), { result }, failed);
      } catch (err) {
        const error =
          err instanceof AgentError ? err : new AgentError("tool_error", String(err));
        await session.recordTool(
          name,
          params,
          { ok: false, code: error.code, message: error.message },
          true,
        );
        return textResult(`${error.code}: ${error.message}`, { error }, true);
      }
    };
  };

  const act = async (params: Record<string, unknown>, action: ActionName) => {
    const input: ActionInput = {
      runId: params.runId as string | undefined,
      tabId: params.tabId as string | undefined,
      action,
      url: params.url as string | undefined,
      ref: params.ref as string | undefined,
      text: params.text as string | undefined,
      value: params.value as string | undefined,
      dy: params.dy as number | undefined,
      wait: params.wait as WaitSpec | undefined,
      expect: params.expect as Expectation | undefined,
    };
    return session.act(input);
  };

  pi.registerTool({
    name: "browser_inspect",
    label: "Inspect page",
    description: "Observe the current page: URL, title, ref-tagged controls, dialogs, errors, recent changes.",
    parameters: Type.Object({ runId: runParam(), tabId: tabParam() }),
    promptSnippet: "Inspect the focused browser tab as a compact semantic snapshot.",
    promptGuidelines: [
      "Use browser_inspect before acting so refs match the current DOM.",
      "Never invent CSS selectors; only use refs from the latest inspect.",
    ],
    execute: wrap("browser_inspect", async (params) =>
      session.inspect(params.runId as string | undefined, params.tabId as string | undefined),
    ),
  });

  pi.registerTool({
    name: "browser_navigate",
    label: "Navigate",
    description: "Navigate the owned tab to a URL and verify the result.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute URL" }),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Navigate the owned browser tab.",
    promptGuidelines: ["Use browser_navigate for full URL changes, not in-page clicks."],
    execute: wrap("browser_navigate", (params) => act(params, "navigate")),
  });

  pi.registerTool({
    name: "browser_click",
    label: "Click",
    description: "Click a control by snapshot ref.",
    parameters: Type.Object({
      ref: Type.String({ description: "Control ref from the latest inspect, e.g. e3" }),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Click a ref from the latest browser_inspect.",
    promptGuidelines: ["Use browser_click with a ref from the latest inspect of that tab."],
    execute: wrap("browser_click", (params) => act(params, "click")),
  });

  pi.registerTool({
    name: "browser_type",
    label: "Type",
    description: "Fill a text or password control by snapshot ref.",
    parameters: Type.Object({
      ref: Type.String(),
      text: Type.String(),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Type into a ref from the latest browser_inspect.",
    promptGuidelines: ["Use browser_type for inputs. Password values are redacted in the evidence log."],
    execute: wrap("browser_type", (params) => act(params, "type")),
  });

  pi.registerTool({
    name: "browser_select",
    label: "Select",
    description: "Choose an option on a select control by snapshot ref.",
    parameters: Type.Object({
      ref: Type.String(),
      value: Type.String(),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Select an option by ref.",
    promptGuidelines: ["Use browser_select for native <select> controls."],
    execute: wrap("browser_select", (params) => act(params, "select")),
  });

  pi.registerTool({
    name: "browser_scroll",
    label: "Scroll",
    description: "Scroll the page or a control into view.",
    parameters: Type.Object({
      ref: Type.Optional(Type.String()),
      dy: Type.Optional(Type.Number()),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Scroll the owned tab.",
    promptGuidelines: ["Use browser_scroll to reveal off-screen controls, then inspect again."],
    execute: wrap("browser_scroll", (params) => act(params, "scroll")),
  });

  pi.registerTool({
    name: "browser_wait",
    label: "Wait",
    description: "Wait for load, URL, text, ref, or a short timeout (max 15s).",
    parameters: Type.Object({
      wait: Type.Object({
        kind: Type.String({ description: "load | url | text | ref | timeout" }),
        value: Type.Optional(Type.String()),
        timeoutMs: Type.Optional(Type.Number()),
      }),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Wait for a named browser condition.",
    promptGuidelines: ["Use browser_wait instead of looping inspect calls."],
    execute: wrap("browser_wait", (params) => act(params, "wait")),
  });

  pi.registerTool({
    name: "browser_run_plan",
    label: "Run page plan",
    description: "Run a closed page-plan DSL against the current page. Not Playwright JavaScript.",
    parameters: Type.Object({
      plan: Type.Object({}, { additionalProperties: true }),
      runId: runParam(),
    }),
    promptSnippet: "Submit one page plan (context + ordered attempts) instead of one gesture per tool call.",
    promptGuidelines: [
      "Use browser_run_plan for comboboxes, branching label tries, and multi-step forms.",
      "Never send Playwright JavaScript or evaluate/script ops.",
    ],
    execute: wrap("browser_run_plan", async (params) =>
      session.runPlan(params.plan, params.runId as string | undefined),
    ),
  });

  pi.registerTool({
    name: "browser_fill",
    label: "Fill fields",
    description: "Type multiple labeled fields in one call with harness read-back. Stops on the first rejected field.",
    parameters: Type.Object({
      fields: Type.Array(
        Type.Object({
          ref: Type.Optional(Type.String()),
          label: Type.Optional(Type.String()),
          placeholder: Type.Optional(Type.String()),
          text: Type.String(),
        }),
      ),
      submit: Type.Optional(
        Type.Object({
          ref: Type.Optional(Type.String()),
          label: Type.Optional(Type.String()),
        }),
      ),
      runId: runParam(),
      tabId: tabParam(),
      expect: expectParam(),
    }),
    promptSnippet: "Fill a form in one call; each field is harness-checked.",
    promptGuidelines: [
      "Use browser_fill for mechanical multi-field forms. Prefer labels over stale refs.",
    ],
    execute: wrap("browser_fill", async (params) =>
      session.fill({
        fields: params.fields as Array<{ ref?: string; label?: string; placeholder?: string; text: string }>,
        submit: params.submit as { ref?: string; label?: string } | undefined,
        runId: params.runId as string | undefined,
        tabId: params.tabId as string | undefined,
        expect: params.expect as Expectation | undefined,
      }),
    ),
  });

  pi.registerTool({
    name: "browser_ask_user",
    label: "Ask user",
    description: "Ask a concise CLI question when required information is missing.",
    parameters: Type.Object({
      question: Type.String(),
      runId: runParam(),
    }),
    promptSnippet: "Ask the operator a focused question in the CLI.",
    promptGuidelines: [
      "Use browser_ask_user for missing facts (name, email, which job). Do not guess user-specific data.",
    ],
    execute: wrap("browser_ask_user", async (params, ctx) => {
      const question = String(params.question);
      const typed = await ctx.ui.input("Browser agent", question);
      const answer = await session.askUser(question, params.runId as string | undefined, typed);
      return { question, answer };
    }),
  });

  pi.registerTool({
    name: "browser_takeover",
    label: "Human takeover",
    description: "Focus the owned tab and pause agent actions so the user can interact.",
    parameters: Type.Object({ runId: runParam(), tabId: tabParam() }),
    promptSnippet: "Hand the visible tab to the user (login, CAPTCHA, 2FA).",
    promptGuidelines: [
      "Use browser_takeover for login, CAPTCHA, or any step the user must perform in the visible browser.",
    ],
    execute: wrap("browser_takeover", async (params) =>
      session.takeover(params.runId as string | undefined, params.tabId as string | undefined),
    ),
  });

  pi.registerTool({
    name: "browser_resume",
    label: "Resume",
    description: "Resume a paused or takeover run from a fresh page observation.",
    parameters: Type.Object({ runId: runParam() }),
    promptSnippet: "Resume after the user finished in the browser.",
    promptGuidelines: ["After browser_resume, read the fresh observation before the next action."],
    execute: wrap("browser_resume", async (params) =>
      session.resume(params.runId as string | undefined),
    ),
  });

  pi.registerTool({
    name: "browser_knowledge_search",
    label: "Search knowledge",
    description: "Retrieve approved user facts and successful strategies relevant to a query.",
    parameters: Type.Object({
      query: Type.String(),
    }),
    promptSnippet: "Search approved candidate knowledge.",
    promptGuidelines: [
      "Use browser_knowledge_search at the start of a run. Do not reuse unapproved user facts.",
    ],
    execute: wrap("browser_knowledge_search", async (params) =>
      session.knowledge.search(String(params.query)),
    ),
  });

  pi.registerTool({
    name: "browser_knowledge_propose",
    label: "Propose knowledge",
    description: "Store a candidate user fact or strategy linked to this run's evidence.",
    parameters: Type.Object({
      kind: Type.String({ description: "user_fact or strategy" }),
      text: Type.String(),
      tags: Type.Optional(Type.Array(Type.String())),
      runId: runParam(),
    }),
    promptSnippet: "Propose knowledge for later reuse.",
    promptGuidelines: [
      "Use browser_knowledge_propose for answers the user gave or strategies that completed a run. User facts stay unused until /browser-approve.",
    ],
    execute: wrap("browser_knowledge_propose", async (params) =>
      session.proposeKnowledge({
        kind: params.kind === "strategy" ? "strategy" : "user_fact",
        text: String(params.text),
        tags: params.tags as string[] | undefined,
        runId: params.runId as string | undefined,
      }),
    ),
  });
}

export function registerBrowserCommands(pi: ExtensionAPI, session: SessionHandle): void {
  const notify = (ctx: ExtensionContext, message: string) => {
    ctx.ui.notify(message, "info");
  };

  const enterBrowserTools = () => {
    if (!session.previousActiveTools) {
      session.previousActiveTools = pi.getActiveTools();
    }
    pi.setActiveTools(session.browserToolNames());
  };

  const restoreTools = () => {
    if (session.previousActiveTools) {
      pi.setActiveTools(session.previousActiveTools);
      session.previousActiveTools = null;
    }
  };

  pi.registerCommand("browser-start", {
    description: "Start a browser run. Usage: /browser-start [--url URL] <goal>",
    handler: async (args, ctx) => {
      const { goal, url } = parseStartArgs(args);
      if (!goal) {
        notify(ctx, "Usage: /browser-start [--url URL] <goal>");
        return;
      }
      enterBrowserTools();
      const state = await session.startRun(goal, url);
      notify(ctx, `Started ${state.runId} on ${state.currentTabId}`);
    },
  });

  pi.registerCommand("browser-status", {
    description: "Show worker, current run, tabs, and attention items",
    handler: async (_args, ctx) => {
      const status = await session.status();
      notify(ctx, stringify(status));
    },
  });

  pi.registerCommand("browser-runs", {
    description: "List persisted browser runs",
    handler: async (_args, ctx) => {
      const runs = await session.store.listStates();
      notify(ctx, runs.length ? stringify(runs) : "No browser runs");
    },
  });

  pi.registerCommand("browser-pause", {
    description: "Pause agent actions on the current run",
    handler: async (_args, ctx) => {
      const state = await session.pauseRun();
      notify(ctx, `Paused ${state.runId}`);
    },
  });

  pi.registerCommand("browser-resume", {
    description: "Resume after pause or takeover",
    handler: async (_args, ctx) => {
      enterBrowserTools();
      const { observation } = await session.resume();
      notify(ctx, `Resumed at ${observation.url}`);
    },
  });

  pi.registerCommand("browser-takeover", {
    description: "Focus the owned tab and wait for the user",
    handler: async (_args, ctx) => {
      const state = await session.takeover();
      notify(ctx, `Takeover on ${state.currentTabId}. Use /browser-resume when done.`);
    },
  });

  pi.registerCommand("browser-stop", {
    description: "Complete the current run and restore coding tools. Add --browser to close Chromium.",
    handler: async (args, ctx) => {
      if (session.currentRunId) {
        await session.stopRun(session.currentRunId, "completed");
      }
      restoreTools();
      if (args.includes("--browser")) {
        await session.worker.stop();
      }
      notify(ctx, "Browser run stopped");
    },
  });

  pi.registerCommand("browser-approve", {
    description: "Approve a candidate knowledge record: /browser-approve <id>",
    handler: async (args, ctx) => {
      const id = args.trim();
      if (!id) {
        notify(ctx, "Usage: /browser-approve <id>");
        return;
      }
      const record = await session.knowledge.setStatus(id, "approved");
      notify(ctx, `Approved ${record.id}`);
    },
  });

  pi.registerCommand("browser-knowledge", {
    description: "List knowledge records",
    handler: async (_args, ctx) => {
      const records = await session.knowledge.list();
      notify(ctx, records.length ? stringify(records) : "No knowledge records");
    },
  });
}

export { parseStartArgs };
