import type { BrowserContext, Page } from "playwright";

/**
 * Open a tab without raising the Chrome window.
 *
 * context.newPage() uses Target.createTarget in the foreground, which on macOS/Windows
 * activates the browser and steals OS focus. background: true keeps the existing
 * frontmost app.
 */
export async function openBackgroundPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages()[0];
  if (!existing) return context.newPage();
  try {
    const created = context.waitForEvent("page", { timeout: 5_000 });
    const session = await existing.context().newCDPSession(existing);
    try {
      await session.send("Target.createTarget", { url: "about:blank", background: true });
    } finally {
      await session.detach().catch(() => undefined);
    }
    return await created;
  } catch {
    return context.newPage();
  }
}
