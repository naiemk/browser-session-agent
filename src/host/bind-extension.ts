import type { ExtensionAPI } from "../pi-api.ts";
import type { SessionHandle } from "./session-handle.ts";
import { registerBrowserCommands, registerBrowserTools } from "../tools/register.ts";
import { applyBrowserSystemPrompt } from "./browser-agent-prompt.ts";

export { OPERATOR_PROMPT, BROWSER_OPERATOR_PROMPT, browserOperatorPrompt } from "./browser-agent-prompt.ts";

export function bindBrowserExtension(pi: ExtensionAPI, session: SessionHandle): void {
  registerBrowserTools(pi, session);
  registerBrowserCommands(pi, session);

  pi.on("before_agent_start", (event: unknown) => {
    const current = event as { systemPrompt?: string };
    return applyBrowserSystemPrompt(current);
  });

  pi.on("session_start", async () => {
    const runs = await session.store.listStates();
    const open = runs.find(
      (r) => r.status === "active" || r.status === "paused" || r.status === "awaiting_takeover",
    );
    if (open) {
      session.currentRunId = open.runId;
      session.previousActiveTools = open.previousActiveTools ?? pi.getActiveTools();
      pi.setActiveTools(session.browserToolNames());
    }
  });
}
