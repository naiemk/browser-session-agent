/**
 * The task card: the whole system prompt for one task.
 *
 * Deliberately short. The prompt is resent on every turn, so prose here is billed
 * repeatedly; guidance that the tool descriptions already carry does not belong.
 */

import { describePredicate } from "../core/predicates.ts";
import type { Predicate } from "../core/types.ts";
import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_DONE,
  TOOL_FORK,
  TOOL_OBSERVE,
  TOOL_PEEK,
  TOOL_PROBE,
  TOOL_REMEMBER,
  TOOL_STRANGER,
  TOOL_SURVEY,
} from "./names.ts";

export interface TaskCardInput {
  objective: string;
  criteria: readonly Predicate[];
  startUrl?: string;
  knownFacts?: Record<string, unknown>;
  maxTurns?: number;
  policy?: "auto" | "ask" | "never";
  /**
   * How to read the page description, when it needs reading instructions.
   *
   * Explained here rather than on every snapshot: the card is resent once per turn either
   * way, and once per turn is cheaper than once per observation.
   */
  format?: string;
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
${input.format ? `- ${input.format}\n` : ""}- ${TOOL_OBSERVE} before acting: refs come from the latest snapshot and go stale.
- ${TOOL_PROBE} when you do not understand a form or widget. It cannot change anything, so prefer it over a hopeful click.
- ${TOOL_ACT} verifies every action. A click that changes nothing is a failure; typing is read back.
- ${TOOL_CHECK} before you claim to be done.
- ${TOOL_ASK} for personal facts. Never invent them.
- ${TOOL_DONE} to finish. A truthful failure beats a false success.
- On failure, read the recovery note and errors, then change approach. Do not repeat the same click.
- ${commit}

WORKING OUT WHERE YOU STAND
You are given a browser, not a description of the situation. Establish it rather than assume it.
- Who are you acting as? Usually discoverable from an account menu, a profile link, or a settings page. It decides what "my", "mine", and "our" refer to in the task, and where those things live.
- What does your session grant? ${TOOL_STRANGER} loads a URL with no session. Comparing that with what you see tells you whether content is reachable by anyone or only through this session.
- ${TOOL_REMEMBER} what you work out, in your own words, so a later task does not redo it.
Reason from what you observed. A difference between the two views is evidence, not proof: A/B tests, geography, and consent walls change an anonymous page too. If the task turns out to be something you should not do, say so with ${TOOL_DONE} and explain what you observed that led there.

CHOOSING WHAT TO DO, AND HOW
Two different questions. What counts as the answer is the operator's to settle; how you go and get it is yours.
- ${TOOL_SURVEY} before committing to a route, so you weigh what this page offers instead of taking the first thing that could work.
- Check each word of the task against what you can see. If one of them matches more than one thing here, that changes the answer and is not yours to decide: ${TOOL_FORK}. Cover every branch and label results by source when that is cheap and bounded, otherwise ${TOOL_ASK}.
- The route is yours, so take the cheap one and do not ask about it. To inspect items in a list, ${TOOL_PEEK}: navigating away loses your place and you may not get it back, and peeking does not. If a name or id is all you have, build the URL or search for it, and pass expect so landing on the wrong thing is caught rather than believed.
${input.maxTurns ? `\nBudget: about ${input.maxTurns} turns. Spend them understanding the page, not retrying.` : ""}`;
}
