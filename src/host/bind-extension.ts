import type { ExtensionAPI } from "../pi-api.ts";
import type { SessionHandle } from "./session-handle.ts";
import { registerBrowserCommands } from "../tools/register.ts";

/**
 * Product commands, and nothing else.
 *
 * This used to register a parallel set of `browser_*` tools and append a paragraph to a
 * coding agent's system prompt. That is why the chat answered "what can you do?" like a
 * coding assistant: it was one, wearing a browser hat. The tools now come from
 * `composeAgent`, which is the same call the CLI and the suite make, and the system prompt
 * is replaced rather than extended.
 *
 * What stays here is genuinely the product's: starting and stopping a run, handing control
 * to the operator, approving knowledge. Those are lifecycle, not agent capability.
 */
export function bindBrowserCommands(pi: ExtensionAPI, session: SessionHandle): void {
  registerBrowserCommands(pi, session);

  pi.on("session_start", async () => {
    const runs = await session.store.listStates();
    const open = runs.find(
      (r) => r.status === "active" || r.status === "paused" || r.status === "awaiting_takeover",
    );
    if (open) {
      session.currentRunId = open.runId;
    }
  });
}
