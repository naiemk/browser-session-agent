/**
 * The operator's harvest spec, as opposed to Execute / /coach follow-ups (COACH-02).
 */

import { assistantText } from "./pi-plan-todos.ts";

export const MAGPIE_CHAT_OBJECTIVE =
  "Help the operator with what they ask, in their browser. They judge whether it " +
  "worked, so report truthfully and never claim more than you verified.";

export function isOperatorGoalText(text: string): boolean {
  if (!text) return false;
  if (text.startsWith("/")) return false;
  if (text.includes("[COACH REVIEW]")) return false;
  if (text.includes("[PLAN MODE ACTIVE]")) return false;
  if (text.startsWith("Execute the plan")) return false;
  if (text.startsWith(MAGPIE_CHAT_OBJECTIVE.slice(0, 40))) return false;
  return true;
}

export function firstOperatorGoal(
  entries: ReadonlyArray<{ type?: string; message?: unknown }>,
): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (!message || typeof message !== "object") continue;
    if ((message as { role?: unknown }).role !== "user") continue;
    const text = assistantText(message).trim();
    if (!isOperatorGoalText(text)) continue;
    return text.length > 800 ? `${text.slice(0, 797)}...` : text;
  }
  return undefined;
}
