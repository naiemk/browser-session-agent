/**
 * Browser-flavored port of Pi's in-session plan-mode.
 *
 * Same state machine as examples/extensions/plan-mode: /plan toggles, Execute/Stay/Refine
 * after a numbered Plan:, [DONE:n] while executing. The parent stays a browser agent —
 * this never enables bash/read/write.
 */

import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_DONE,
  TOOL_OBSERVE,
  TOOL_PEEK,
  TOOL_PROBE,
  TOOL_REMEMBER,
  TOOL_SAVE,
  TOOL_SIDE_CLOSE,
  TOOL_SIDE_OPEN,
  TOOL_STRANGER,
  TOOL_SURVEY,
  TOOL_PARK,
  TOOL_DISCOVER,
} from "../runtime/names.ts";
import type { CustomSessionMessage, ExtensionAPI, ExtensionContext } from "../pi-api.ts";
import {
  assistantText,
  coachStepNumber,
  executorRemaining,
  extractTodoItems,
  isAssistantMessage,
  markCoachRoleComplete,
  markCompletedSteps,
  preCoachComplete,
  type TodoItem,
} from "./pi-plan-todos.ts";
import { capabilityCoordinator } from "./pi-capabilities.ts";
import { clipWidgetLines } from "./pi-tool-view.ts";
import { reconstructProgress } from "./pi-subagent/progress.ts";

export const PLAN_COMMAND = "plan";

/** Coding builtins the parent must never gain, even if they were somehow active. */
export const PARENT_NEVER_TOOLS = new Set<string>([
  "bash",
  "read",
  "write",
  "edit",
  "grep",
  "find",
  "ls",
]);

/** Mutations the operate agent must not perform while planning. */
export const PLAN_MODE_DISABLED_TOOLS = new Set<string>([
  TOOL_ACT,
  TOOL_SAVE,
  TOOL_SIDE_OPEN,
  TOOL_SIDE_CLOSE,
  TOOL_DONE,
  "subagent",
  "scratch_write",
  TOOL_PARK,
  TOOL_DISCOVER,
]);

export const PLAN_MODE_CAPABILITY_DISABLED = new Set<string>([
  ...PARENT_NEVER_TOOLS,
  ...PLAN_MODE_DISABLED_TOOLS,
]);

export const PLAN_MODE_CONTEXT = `[PLAN MODE ACTIVE]
You are in plan mode: look at the page, do not change it.

Restrictions:
- act, downloads-to-scratch, side tabs, report, and subagent/coder are disabled
- observe, probe, survey, peek, check, ask_user, remember, scratch_ls, and scratch_read stay available
- This session's model is unchanged. The operator can Ctrl+P to pick a stronger class for these turns.

Ask with ask_user when a personal fact is missing. Do not invent defaults.

Classify the objective before you write the plan:
- calibration_required: many similar entities, fuzzy qualification, unknown acquisition loop. You MUST NOT author a long harvest. You MUST author scout (tight budget) → coach → harvest blocked on the coach artifact. You MUST NOT invent a list of site tactics to exhaust before coaching. Coach is a guideline generator, not a second planner. Numbered steps MUST be recognizable as scout, then coach, then harvest.
- known_flow: a short reversible flow you can already script. No coach step.
- criteria_unsettled: success, sources, or outreach still undefined. Ask the operator. Do not plan a harvest.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes — just describe what you would do.`;

/** Magpie Execute hook: same `/coach` handler, not a harvest tool (COACH-15). */
export interface PlanExecuteCoach {
  enabled(): boolean;
  hasArtifact(): boolean;
  startReview(ctx: ExtensionContext): Promise<boolean>;
  onArtifact(handler: (ctx: ExtensionContext) => void): void;
}

export interface PlanModeBindOptions {
  coach?: PlanExecuteCoach;
}

export interface PlanModeHandle {
  enabled(): boolean;
  executing(): boolean;
  /** Text to inject when the host cannot use before_agent_start (hosted chat). */
  injection(): string | undefined;
  /** After the parent tool list is known (hosted compose / resume). */
  adoptParentTools(names: string[]): void;
}

export const SCOUT_EXECUTE_HINT =
  "After the last of these steps, stop. Do not harvest. Do not call subagent for coaching.";

export function formatExecuteMessage(
  remaining: readonly TodoItem[],
  phase: "scout" | "harvest" | "all",
): string {
  const list = remaining.map((todo) => `${todo.step}. ${todo.text}`).join("\n");
  const first = remaining[0]?.text ?? "";
  if (phase === "scout") {
    return `Execute the plan.

Remaining steps (scout only — the host will run /coach after these; do not harvest and do not spawn planner, reviewer, or coder as a coach):
${list}

Start with: ${first}
After completing a step, include a [DONE:n] tag in your response.
${SCOUT_EXECUTE_HINT}`;
  }
  return `Execute the plan.

Remaining steps:
${list}

Start with: ${first}
After completing a step, include a [DONE:n] tag in your response.`;
}

export function parentSafeTools(names: readonly string[]): string[] {
  return [...new Set(names.filter((name) => !PARENT_NEVER_TOOLS.has(name)))];
}

export function planModeTools(activeToolNames: string[]): string[] {
  return parentSafeTools(activeToolNames).filter((name) => !PLAN_MODE_DISABLED_TOOLS.has(name));
}

/** User/assistant messages only — custom UI entries do not count as the session moving. */
export function sessionTurnCount(
  entries: ReadonlyArray<{ type?: string; message?: unknown }>,
): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const role = (entry.message as { role?: string } | undefined)?.role;
    if (role === "user" || role === "assistant") count += 1;
  }
  return count;
}

export function bindPlanMode(pi: ExtensionAPI, options: PlanModeBindOptions = {}): PlanModeHandle {
  const capabilities = capabilityCoordinator(pi);
  let planModeEnabled = false;
  let executionMode = false;
  let todoItems: TodoItem[] = [];
  let autoCoachStarted = false;

  function hasArtifact(): boolean {
    return Boolean(options.coach?.hasArtifact());
  }

  function remainingForExecutor(): TodoItem[] {
    return executorRemaining(todoItems, hasArtifact());
  }

  function awaitingHostCoach(): boolean {
    return Boolean(options.coach) && coachStepNumber(todoItems) !== undefined && !hasArtifact();
  }

  function injection(): string | undefined {
    if (planModeEnabled) return PLAN_MODE_CONTEXT;
    if (executionMode && todoItems.length > 0) {
      const remaining = remainingForExecutor();
      if (remaining.length === 0) return undefined;
      const todoList = remaining.map((todo) => `${todo.step}. ${todo.text}`).join("\n");
      if (awaitingHostCoach()) {
        return `[EXECUTING PLAN - Full tool access enabled]

Remaining steps (scout only — the host will run /coach after these):
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.
${SCOUT_EXECUTE_HINT}`;
      }
      return `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`;
    }
    return undefined;
  }

  async function maybeStartCoach(ctx: ExtensionContext): Promise<void> {
    const coach = options.coach;
    if (!executionMode || !coach) return;
    if (autoCoachStarted || coach.enabled() || coach.hasArtifact()) return;
    if (!preCoachComplete(todoItems)) return;
    autoCoachStarted = true;
    const started = await coach.startReview(ctx);
    if (!started) autoCoachStarted = false;
  }

  function updateStatus(ctx: ExtensionContext): void {
    const working = reconstructProgress(ctx.sessionManager?.getEntries?.() ?? []).lastWorking;
    if (executionMode && todoItems.length > 0) {
      const completed = todoItems.filter((todo) => todo.completed).length;
      const active = todoItems.find((todo) => !todo.completed);
      ctx.ui.setStatus?.(
        "plan-mode",
        `plan ${completed}/${todoItems.length}${active ? ` · ${active.text}` : ""}`,
      );
      const lines = todoItems.map((item) => {
        if (item.completed) return `☑ ${item.text}`;
        if (item.step === active?.step) return `→ ${item.text}`;
        return `☐ ${item.text}`;
      });
      if (working) lines.push(working);
      ctx.ui.setWidget?.("plan-todos", clipWidgetLines(lines));
    } else if (planModeEnabled) {
      ctx.ui.setStatus?.("plan-mode", "⏸ plan");
      ctx.ui.setWidget?.("plan-todos", undefined);
    } else {
      ctx.ui.setStatus?.("plan-mode", undefined);
      ctx.ui.setWidget?.("plan-todos", undefined);
    }
  }

  function enablePlanModeTools(): void {
    capabilities.constrain("plan-mode", { disable: PLAN_MODE_CAPABILITY_DISABLED });
  }

  function restoreNormalModeTools(): void {
    capabilities.release("plan-mode");
  }

  function adoptParentTools(names: string[]): void {
    capabilities.adoptBaseTools(parentSafeTools(names));
  }

  function persistState(): void {
    pi.appendEntry?.("plan-mode", {
      enabled: planModeEnabled,
      todos: todoItems,
      executing: executionMode,
    });
  }

  function enablePlanMode(ctx: ExtensionContext): void {
    if (planModeEnabled) return;
    planModeEnabled = true;
    executionMode = false;
    todoItems = [];
    autoCoachStarted = false;
    enablePlanModeTools();
    ctx.ui.notify(
      "Plan mode on. Act, coder, and other mutations are off. Same model as this session — Ctrl+P to change.",
    );
    updateStatus(ctx);
    persistState();
  }

  function disablePlanMode(ctx: ExtensionContext, notify: boolean): void {
    if (!planModeEnabled && !executionMode) {
      if (notify) ctx.ui.notify("Plan mode is already off.");
      return;
    }
    planModeEnabled = false;
    executionMode = false;
    todoItems = [];
    autoCoachStarted = false;
    restoreNormalModeTools();
    if (notify) ctx.ui.notify("Plan mode off. Browser tools restored.");
    updateStatus(ctx);
    persistState();
  }

  function togglePlanMode(ctx: ExtensionContext): void {
    if (planModeEnabled) disablePlanMode(ctx, true);
    else enablePlanMode(ctx);
  }

  async function handlePlanCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const task = args.trim();
    if (!task) {
      togglePlanMode(ctx);
      return;
    }
    enablePlanMode(ctx);
    if (pi.sendUserMessage) {
      pi.sendUserMessage(task, { deliverAs: "followUp" });
    } else {
      ctx.ui.notify(`Plan mode on. Send: ${task}`);
    }
  }

  pi.registerCommand(PLAN_COMMAND, {
    description: "Toggle plan mode (read-only exploration in this session)",
    handler: handlePlanCommand,
  });

  pi.on("context", (event: unknown) => {
    if (planModeEnabled) return undefined;
    const messages = (event as { messages?: unknown[] })?.messages;
    if (!Array.isArray(messages)) return undefined;
    return {
      messages: messages.filter((item) => {
        const msg = item as { customType?: string; role?: string; content?: unknown };
        if (msg.customType === "plan-mode-context") return false;
        if (msg.role !== "user") return true;
        const content = msg.content;
        if (typeof content === "string") return !content.includes("[PLAN MODE ACTIVE]");
        if (Array.isArray(content)) {
          return !content.some(
            (part) =>
              part &&
              typeof part === "object" &&
              (part as { type?: string }).type === "text" &&
              String((part as { text?: string }).text ?? "").includes("[PLAN MODE ACTIVE]"),
          );
        }
        return true;
      }),
    };
  });

  pi.on("before_agent_start", () => {
    const content = injection();
    if (!content) return undefined;
    return {
      message: {
        customType: planModeEnabled ? "plan-mode-context" : "plan-execution-context",
        content,
        display: false,
      },
    };
  });

  pi.on("turn_end", (event: unknown, ctx: unknown) => {
    if (!executionMode || todoItems.length === 0) return;
    const message = (event as { message?: unknown })?.message;
    if (!isAssistantMessage(message)) return;
    if (markCompletedSteps(assistantText(message), todoItems) > 0) {
      updateStatus(ctx as ExtensionContext);
    }
    persistState();
  });

  pi.on("agent_end", async (event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    if (executionMode && todoItems.length > 0) {
      await maybeStartCoach(ctx);
      if (todoItems.every((todo) => todo.completed)) {
        const completedList = todoItems.map((todo) => `~~${todo.text}~~`).join("\n");
        pi.sendMessage?.(
          {
            customType: "plan-complete",
            content: `Plan complete.\n\n${completedList}`,
            display: true,
          },
          { triggerTurn: false },
        );
        executionMode = false;
        todoItems = [];
        autoCoachStarted = false;
        updateStatus(ctx);
        persistState();
      }
      return;
    }

    if (!planModeEnabled || ctx?.hasUI === false) return;

    const messages = Array.isArray((event as { messages?: unknown[] })?.messages)
      ? ((event as { messages: unknown[] }).messages)
      : [];
    const lastAssistant = [...messages].reverse().find(isAssistantMessage);
    if (lastAssistant) {
      const extracted = extractTodoItems(assistantText(lastAssistant));
      if (extracted.length > 0) todoItems = extracted;
    }
    if (todoItems.length === 0) return;
    persistState();

    const todoListText = todoItems.map((todo, index) => `${index + 1}. ☐ ${todo.text}`).join("\n");
    const planTodoListMessage: CustomSessionMessage = {
      customType: "plan-todo-list",
      content: `Plan steps (${todoItems.length}):\n\n${todoListText}`,
      display: true,
    };

    if (!ctx?.ui?.select) return;
    const turnsBefore = sessionTurnCount(ctx.sessionManager?.getEntries?.() ?? []);
    const choice = await ctx.ui.select("Plan mode - what next?", [
      "Execute the plan (track progress)",
      "Stay in plan mode",
      "Refine the plan",
    ]);
    const sessionMoved = sessionTurnCount(ctx.sessionManager?.getEntries?.() ?? []) > turnsBefore;

    if (choice?.startsWith("Execute")) {
      const remaining = remainingForExecutor();
      const first = remaining[0] ?? todoItems[0];
      if (!first) return;
      planModeEnabled = false;
      executionMode = true;
      autoCoachStarted = false;
      restoreNormalModeTools();
      updateStatus(ctx);
      persistState();
      const phase = awaitingHostCoach() ? "scout" : hasArtifact() ? "harvest" : "all";
      const execMessage = formatExecuteMessage(remaining.length > 0 ? remaining : [first], phase);
      pi.sendMessage?.(planTodoListMessage, { deliverAs: "followUp" });
      pi.sendMessage?.(
        { customType: "plan-mode-execute", content: execMessage, display: true },
        { triggerTurn: !sessionMoved, deliverAs: "followUp" },
      );
      void maybeStartCoach(ctx);
    } else if (choice === "Refine the plan") {
      const refinement = ctx.ui.editor
        ? await ctx.ui.editor("Refine the plan:", "")
        : await ctx.ui.input("Refine the plan:", "What should change?");
      if (refinement?.trim()) {
        pi.sendMessage?.(planTodoListMessage, { deliverAs: "followUp" });
        if (!sessionMoved) {
          pi.sendUserMessage?.(refinement.trim(), { deliverAs: "followUp" });
        }
      }
    }
  });

  pi.on("session_start", (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    const entries = ctx?.sessionManager?.getEntries?.() ?? [];
    const planModeEntry = [...entries]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === "plan-mode") as
      | {
          data?: {
            enabled?: boolean;
            todos?: TodoItem[];
            executing?: boolean;
          };
        }
      | undefined;

    if (planModeEntry?.data) {
      planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
      todoItems = planModeEntry.data.todos ?? todoItems;
      executionMode = planModeEntry.data.executing ?? executionMode;
    }

    if (planModeEntry && executionMode && todoItems.length > 0) {
      let executeIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i]?.customType === "plan-mode-execute") {
          executeIndex = i;
          break;
        }
      }
      const texts: string[] = [];
      for (let i = executeIndex + 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry?.type === "message" && isAssistantMessage(entry.message)) {
          texts.push(assistantText(entry.message));
        }
      }
      markCompletedSteps(texts.join("\n"), todoItems);
    }
    if (hasArtifact()) markCoachRoleComplete(todoItems);

    if (planModeEnabled) enablePlanModeTools();
    updateStatus(ctx);
    if (executionMode) void maybeStartCoach(ctx);
  });

  options.coach?.onArtifact((ctx) => {
    if (!executionMode) return;
    markCoachRoleComplete(todoItems);
    updateStatus(ctx);
    persistState();
    const remaining = remainingForExecutor();
    if (remaining.length === 0) return;
    pi.sendMessage?.(
      {
        customType: "plan-mode-execute",
        content: formatExecuteMessage(remaining, "harvest"),
        display: true,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  });

  return {
    enabled: () => planModeEnabled,
    executing: () => executionMode,
    injection,
    adoptParentTools,
  };
}

export const PLAN_READ_TOOLS = [
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_SURVEY,
  TOOL_PEEK,
  TOOL_STRANGER,
  TOOL_CHECK,
  TOOL_ASK,
  TOOL_REMEMBER,
] as const;
