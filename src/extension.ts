import type { ExtensionAPI } from "./pi-api.ts";
import { BrowserSession } from "./session.ts";
import { registerBrowserCommands, registerBrowserTools } from "./tools/register.ts";

const OPERATOR_PROMPT = `You are operating a persistent headed Chromium profile through bounded browser tools.
Inspect before you act. Use snapshot refs, never CSS or arbitrary JavaScript.
If a login, CAPTCHA, 2FA, or other human-only step appears, call browser_takeover.
If a required fact is missing, call browser_ask_user.
After failures, read the recovery note and current observation instead of blindly retrying.
Search approved knowledge at the start of a run. Never modify product code or broaden your tools.`;

export default function browserSessionAgent(pi: ExtensionAPI): void {
  const session = new BrowserSession({
    cwd: process.cwd(),
    headless: process.env.BSA_HEADLESS === "1",
  });

  registerBrowserTools(pi, session);
  registerBrowserCommands(pi, session);

  pi.on("before_agent_start", (event: unknown) => {
    if (!session.currentRunId) return;
    const current = event as { systemPrompt?: string };
    if (typeof current.systemPrompt === "string") {
      return { systemPrompt: `${current.systemPrompt}\n\n${OPERATOR_PROMPT}` };
    }
    return undefined;
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
