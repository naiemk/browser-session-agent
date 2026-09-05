import type { ExtensionAPI, RegisteredTool } from "./pi-api.ts";
import { bindBrowserCommands } from "./host/bind-extension.ts";
import { fileEvidence, goalDir } from "./host/evidence.ts";
import { meterPiSession, turnClock } from "./host/pi-metering.ts";
import { withToolView } from "./host/pi-tool-view.ts";
import { WorkerBrowserPort } from "./host/worker-browser-port.ts";
import { shortId } from "./core/ids.ts";
import { composeAgent, fixedOverhead } from "./runtime/agent.ts";
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
  const session = new BrowserSession({
    cwd: process.cwd(),
    headless: process.env.BSA_HEADLESS === "1",
  });

  bindBrowserCommands(pi, session);

  /*
   * One goal per session, named now and written to on first use.
   *
   * A conversation is the unit of work here: the operator's objective spans whatever
   * runs they start inside it. Naming it at load rather than when a run starts is what
   * lets the tools be registered once, which is Pi's requirement, without the evidence
   * being optional - and it is the reason nothing was recorded before.
   */
  const goalId = shortId("goal");
  const evidence = fileEvidence({ goalId, goal: "browser chat session" });

  // Shared with the metering below, so a payload and the context that carried it agree on
  // which turn they belong to. Without it every tool result is stamped turn 0.
  const clock = turnClock();

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
      askUser: (question) => session.askUser(question),
      evidence,
      turn: () => clock.current(),
    },
  });

  const names: string[] = [];
  for (const tool of composed.tools) {
    // The view is added here, at the Pi boundary: the tools themselves do not know that
    // anything is drawing them.
    pi.registerTool(withToolView(tool as unknown as RegisteredTool));
    names.push((tool as unknown as { name: string }).name);
  }

  meterPiSession(pi, evidence, { ...fixedOverhead(composed), goalId }, clock);

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

  // Replace the coding identity rather than appending to it. Appending is why the chat
  // used to answer "what can you do?" like a coding assistant.
  pi.on("before_agent_start", () => ({ systemPrompt: composed.systemPrompt }));

  pi.registerCommand("browser-evidence", {
    description: "Where this session's evidence, metrics and payloads are written",
    handler: (_args, ctx) => {
      ctx.ui.notify(`This session: ${goalDir(undefined, goalId)}`);
    },
  });
}
