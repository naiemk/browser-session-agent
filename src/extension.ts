import type { ExtensionAPI, RegisteredTool } from "./pi-api.ts";
import { bindBrowserCommands } from "./host/bind-extension.ts";
import { WorkerBrowserPort } from "./host/worker-browser-port.ts";
import { composeAgent } from "./runtime/agent.ts";
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
    },
  });

  for (const tool of composed.tools) {
    pi.registerTool(tool as unknown as RegisteredTool);
  }

  // Replace the coding identity rather than appending to it. Appending is why the chat
  // used to answer "what can you do?" like a coding assistant.
  pi.on("before_agent_start", () => ({ systemPrompt: composed.systemPrompt }));
}
