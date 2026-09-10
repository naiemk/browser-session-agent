import type { ExtensionAPI, ExtensionContext, RegisteredTool } from "./pi-api.ts";
import { bindBrowserCommands } from "./host/bind-extension.ts";
import { fileEvidence, goalDir } from "./host/evidence.ts";
import { compactPiContext } from "./host/pi-compaction.ts";
import { meterPiSession, turnClock } from "./host/pi-metering.ts";
import { shapePiToolResults } from "./host/pi-shape.ts";
import { withToolView } from "./host/pi-tool-view.ts";
import { WorkerBrowserPort } from "./host/worker-browser-port.ts";
import { bindPlanMode } from "./host/pi-plan-mode.ts";
import { bindCoach } from "./host/pi-coach.ts";
import { bindJobCommands } from "./host/pi-jobs.ts";
import { bindSessionGoal, isSubagentProcess } from "./host/pi-session-goal.ts";
import { bindSubagent, CHAT_WORKER_HINT, standingPlanPrompt, standingScratchPrompt } from "./host/pi-subagent/bind.ts";
import { standingLastCoderPrompt, reconstructProgress } from "./host/pi-subagent/progress.ts";
import { composeAgent, fixedOverhead } from "./runtime/agent.ts";
import { viewByName } from "./runtime/view/index.ts";
import { BrowserSession } from "./session.ts";

/**
 * The local Pi entry point: the operator's own machine, one process, one browser.
 *
 * Same agent as the hosted chat, the CLI and the suite, differing only in that the
 * browser is right here rather than across a websocket. The session stays for what is
 * genuinely the product's - run lifecycle, tab ownership, takeover - and no longer
 * supplies the agent's tools.
 */
export default function browserSessionAgent(pi: ExtensionAPI): void {
  if (isSubagentProcess()) return;

  /*
   * Bind the goal before any other session_start handler. Resume reads `magpie-goal`
   * off Pi's session entries; a fresh session mints once. Tools stay registered at load
   * (Pi's requirement); the directory is still created on first write.
   */
  const sessionGoal = bindSessionGoal(pi);

  const session = new BrowserSession({
    cwd: process.cwd(),
    headless: process.env.BSA_HEADLESS === "1",
  });

  bindBrowserCommands(pi, session);

  const evidence = fileEvidence({ goalId: () => sessionGoal.id(), goal: "browser chat session" });

  // Shared with the metering below, so a payload and the context that carried it agree on
  // which turn they belong to. Without it every tool result is stamped turn 0.
  const clock = turnClock();

  const sessionUi = {
    current: undefined as ExtensionContext["ui"] | undefined,
  };

  const composed = composeAgent({
    card: {
      objective:
        "Help the operator with what they ask, in their browser. They judge whether it " +
        "worked, so report truthfully and never claim more than you verified.",
      criteria: [],
      policy: "ask",
    },
    tools: {
      // Lazy: the browser starts when the agent first needs a page, rather than only as
      // a side effect of starting a run.
      browser: WorkerBrowserPort.lazy(session.worker),
      askUser: async (question) => {
        const typed = sessionUi.current
          ? await sessionUi.current.input(question, "Your answer")
          : undefined;
        try {
          await session.askUser(question, undefined, typed);
        } catch {
          // Chat may ask before /browser-start; the tool still records on the goal ledger.
        }
        return typed;
      },
      evidence,
      turn: () => clock.current(),
      // Named on the environment because a chat has no flags. The default is the format
      // being measured; this is how an operator puts the baseline back mid-investigation.
      view: viewByName(process.env.BSA_VIEW),
      onChallengeTakeover: async ({ tabId, host }) => {
        try {
          await session.takeover(undefined, tabId);
        } catch {
          const id = tabId ?? session.worker.firstTabId();
          if (id) await session.worker.bringToFront(id).catch(() => undefined);
        }
        sessionUi.current?.notify?.(`Challenge on ${host}. Tab is yours — solve or skip, then continue.`, "warning");
      },
      policy: "ask",
      approve: async (request) => {
        if (!sessionUi.current) return false;
        return sessionUi.current.confirm(
          "Approve irreversible action",
          `${request.request.kind} — ${request.reason}\n${request.url}`,
        );
      },
    },
  });

  const names: string[] = [];
  for (const tool of composed.tools) {
    // The view is added here, at the Pi boundary: the tools themselves do not know that
    // anything is drawing them.
    const viewed = withToolView(tool as unknown as RegisteredTool);
    const execute = viewed.execute;
    pi.registerTool({
      ...viewed,
      execute: async (id, params, signal, onUpdate, ctx) => {
        sessionUi.current = ctx.ui;
        return execute(id, params, signal, onUpdate, ctx);
      },
    });
    names.push((tool as unknown as { name: string }).name);
  }

    names.push(...bindSubagent(pi, {
      goalId: () => sessionGoal.id(),
      evidence: {
        metrics: evidence.metrics,
        payloads: evidence.payloads,
        turn: () => clock.current(),
      },
    }));

  /*
   * Compaction, then shape, then metering.
   *
   * Compaction is optional and about *what* text is in a result. Shape is mandatory and
   * about *the array Pi's adapters will call .filter on*. Mixing those jobs is how the
   * first GLM repair failed: wrapping lived inside the optimiser, so anything the
   * optimiser did not drop still reached the provider as a string.
   *
   * Metering last, so the recorded bytes are the bytes that were sent.
   */
  compactPiContext(pi);
  shapePiToolResults(pi);
  meterPiSession(pi, evidence, {
    ...fixedOverhead(composed),
    get goalId() {
      return sessionGoal.id();
    },
  }, clock);

  /*
   * Browser tools only, for the whole session.
   *
   * Pi brings read, bash, write and edit, and a run used to switch them out and back
   * again. That swap is what a coding agent needs in order to pretend to be a browser
   * agent; this one is a browser agent, so the coding tools are simply never active.
   *
   * On `session_start` rather than here: Pi rejects action methods while extensions are
   * loading, since the runtime that would carry them out does not exist yet.
   */
  pi.on("session_start", () => {
    pi.setActiveTools(names);
  });

  // Identity first so `before_agent_start` yields the browser system prompt as result[0].
  // Plan-mode and job session_start handlers follow, so they can filter the active set
  // after the browser tools are restored.
  let jobs: ReturnType<typeof bindJobCommands> | undefined;
  pi.on("before_agent_start", async (_event: unknown, ctxUnknown: unknown) => {
    const goalId = sessionGoal.id();
    const ctx = ctxUnknown as ExtensionContext | undefined;
    const lastCoder = standingLastCoderPrompt(
      reconstructProgress(ctx?.sessionManager?.getEntries?.() ?? []),
    );
    const plan = await standingPlanPrompt(goalId);
    const scratch = await standingScratchPrompt(goalId);
    const job = await jobs?.injection();
    return {
      systemPrompt: [composed.systemPrompt, CHAT_WORKER_HINT, plan, scratch, lastCoder, job]
        .filter(Boolean)
        .join("\n\n"),
    };
  });

  const coach = bindCoach(pi, {
    evidence,
    objective:
      "Help the operator with what they ask, in their browser. They judge whether it " +
      "worked, so report truthfully and never claim more than you verified.",
  });
  bindPlanMode(pi, { coach });
  jobs = bindJobCommands(pi, { headless: process.env.BSA_HEADLESS === "1" });

  pi.registerCommand("browser-evidence", {
    description: "Where this session's evidence, metrics and payloads are written",
    handler: (_args, ctx) => {
      ctx.ui.notify(`This session: ${goalDir(undefined, sessionGoal.id())}`);
    },
  });
}
