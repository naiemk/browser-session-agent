/**
 * One Magpie goal per Pi conversation.
 *
 * The goal id used to be minted at extension load, so every process — and any child
 * that loaded Magpie — got a new `goal_*` directory. Pi already keeps custom entries on
 * the session; restore from those on `session_start` the same way plan-mode and coder
 * progress do. A new Pi session still mints. `--continue` of the same jsonl does not.
 */

import { shortId } from "../core/ids.ts";
import type { ExtensionAPI, ExtensionContext } from "../pi-api.ts";

export const MAGPIE_GOAL_ENTRY = "magpie-goal";
export const BSA_SUBAGENT_ENV = "BSA_SUBAGENT";
export const BSA_GOAL_ID_ENV = "BSA_GOAL_ID";

export type GoalIdRef = string | (() => string);

export function resolveGoalId(goalId: GoalIdRef): string {
  return typeof goalId === "function" ? goalId() : goalId;
}

export function isSubagentProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BSA_SUBAGENT_ENV] === "1";
}

export function restoreGoalId(
  entries: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>,
): string | undefined {
  const found = [...entries]
    .reverse()
    .find((entry) => entry.customType === MAGPIE_GOAL_ENTRY);
  const data = found?.data;
  if (!data || typeof data !== "object") return undefined;
  const goalId = (data as { goalId?: unknown }).goalId;
  return typeof goalId === "string" && goalId.trim() ? goalId : undefined;
}

export interface SessionGoal {
  id: () => string;
}

/** Registers a `session_start` handler. Call this before other session_start hooks. */
export function bindSessionGoal(
  pi: ExtensionAPI,
  env: NodeJS.ProcessEnv = process.env,
): SessionGoal {
  let goalId = env[BSA_GOAL_ID_ENV]?.trim() ?? "";
  let written = false;

  const persist = () => {
    if (written || !goalId || isSubagentProcess(env)) return;
    written = true;
    pi.appendEntry?.(MAGPIE_GOAL_ENTRY, { goalId });
  };

  const resolve = (ctx?: ExtensionContext) => {
    if (!goalId) {
      const restored = restoreGoalId(ctx?.sessionManager?.getEntries?.() ?? []);
      goalId = restored ?? shortId("goal");
      if (restored) written = true;
    }
    persist();
    return goalId;
  };

  pi.on("session_start", (_event: unknown, ctxUnknown: unknown) => {
    resolve(ctxUnknown as ExtensionContext);
  });

  return {
    id: () => resolve(),
  };
}
