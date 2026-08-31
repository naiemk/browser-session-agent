import type { ExtensionAPI } from "./pi-api.ts";
import { bindBrowserExtension } from "./host/bind-extension.ts";
import { BrowserSession } from "./session.ts";

export default function browserSessionAgent(pi: ExtensionAPI): void {
  const session = new BrowserSession({
    cwd: process.cwd(),
    headless: process.env.BSA_HEADLESS === "1",
  });
  bindBrowserExtension(pi, session);
}
