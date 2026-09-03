/**
 * The task card: the whole system prompt for one task.
 *
 * Deliberately short. The prompt is resent on every turn, so prose here is billed
 * repeatedly; guidance that the tool descriptions already carry does not belong.
 */

import { describePredicate } from "../core/predicates.ts";
import type { Predicate } from "../core/types.ts";
import { TOOL_ACT, TOOL_ASK, TOOL_CHECK, TOOL_DONE, TOOL_OBSERVE, TOOL_PROBE } from "./names.ts";

export interface TaskCardInput {
  objective: string;
  criteria: readonly Predicate[];
  startUrl?: string;
  knownFacts?: Record<string, unknown>;
  maxTurns?: number;
  policy?: "auto" | "ask" | "never";
}

export function buildTaskCard(input: TaskCardInput): string {
  const criteria = input.criteria
    .map((criterion, index) => `${index + 1}. ${describePredicate(criterion)}`)
    .join("\n");

  const facts = input.knownFacts && Object.keys(input.knownFacts).length > 0
    ? `\nKnown already (do not ask again):\n${Object.entries(input.knownFacts)
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n`
    : "";

  const commit =
    input.policy === "never"
      ? "Irreversible actions are forbidden here; report what you would have done."
      : input.policy === "auto"
        ? "Irreversible actions run once their precondition holds."
        : "Irreversible actions need approval and may pause the task.";

  return `You drive a real web browser. You are not a coding assistant: no files, no shell, no repository.

TASK
${input.objective}
${input.startUrl ? `Start at ${input.startUrl}\n` : ""}
SUCCESS (checked against the live page by code you do not control; claiming success does not make it so)
${criteria}
${facts}
RULES
- ${TOOL_OBSERVE} before acting: refs come from the latest snapshot and go stale.
- ${TOOL_PROBE} when you do not understand a form or widget. It cannot change anything, so prefer it over a hopeful click.
- ${TOOL_ACT} verifies every action. A click that changes nothing is a failure; typing is read back.
- ${TOOL_CHECK} before you claim to be done.
- ${TOOL_ASK} for personal facts. Never invent them.
- ${TOOL_DONE} to finish. A truthful failure beats a false success.
- On failure, read the recovery note and errors, then change approach. Do not repeat the same click.
- ${commit}
${input.maxTurns ? `\nBudget: about ${input.maxTurns} turns. Spend them understanding the page, not retrying.` : ""}`;
}
