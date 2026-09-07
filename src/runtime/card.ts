/**
 * The task card: the whole system prompt for one task.
 *
 * Deliberately short. The prompt is resent on every turn, so prose here is billed
 * repeatedly; guidance that the tool descriptions already carry does not belong.
 */

import { describePredicate } from "../core/predicates.ts";
import type { Predicate } from "../core/types.ts";
import { renderSiteSkill, siteSkillFromFacts } from "./site-skill.ts";
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
  TOOL_SAVE,
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

  const skill = siteSkillFromFacts(input.knownFacts);
  const factEntries = input.knownFacts
    ? Object.entries(input.knownFacts).filter(([key]) => key !== "siteSkill" && key !== "site_skill")
    : [];
  const facts = factEntries.length > 0
    ? `\nKnown already (do not ask again):\n${factEntries
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n`
    : "";
  const skillBlock = skill ? `\n${renderSiteSkill(skill)}\n` : "";

  const commit =
    input.policy === "never"
      ? "Actions that leave this session (send, pay, delete) are forbidden here; report what you would have done."
      : input.policy === "auto"
        ? "Actions that leave this session (send, pay, delete) run once their precondition holds."
        : "Explore and restore freely. Ask only when something leaves this session (send, pay, delete).";

  /*
   * What it can do, said once and said accurately.
   *
   * "No files" was both wrong and expensive: uploading is an action it has, and getting a
   * job done routinely means attaching a document. A capability the model does not know
   * it has is a capability it argues itself out of using - the run where it was asked to
   * open a site and replied that it could not open a browser window started here.
   */
  return `You drive a real web browser: pages, forms, dialogs, tabs, file uploads. This agent has no shell here and no repository. For files, unzip, public curl, or extracting downloads, call the subagent tool with agent=coder — a real Pi coding agent whose cwd is this goal's scratch directory.

TASK
${input.objective}
${input.startUrl ? `Start at ${input.startUrl}\n` : ""}
SUCCESS (checked against the live page by code you do not control; claiming success does not make it so)
${criteria}
${facts}${skillBlock}
RULES
${input.format ? `- ${input.format}\n` : ""}- Refs stay valid while the element is on the page, so ${TOOL_OBSERVE} when you arrive somewhere new or a ref is reported gone, not between every action.
- ${TOOL_PROBE} when you do not understand a form or widget. It cannot change anything, so prefer it over a hopeful click.
- ${TOOL_ACT} verifies every action and waits for the page to settle, so never follow one with a wait.
- ${TOOL_CHECK} before you claim to be done, asking everything at once with all: one call beats five.
- ${TOOL_ASK} for personal facts. Never invent them.
- ${TOOL_DONE} to finish. A truthful failure beats a false success.
- On failure, read the recovery note and errors, then change approach. Do not repeat the same click.
- ${commit}

WORKING OUT WHERE YOU STAND
You are given a browser, not a description of the situation. Establish it rather than assume it.
- Who are you acting as? Usually discoverable from an account menu, a profile link, or a settings page. It decides what "my", "mine", and "our" refer to in the task, and where those things live.
- What does your session grant? ${TOOL_STRANGER} loads a URL with no session. Comparing that with what you see tells you whether content is reachable by anyone or only through this session.
- ${TOOL_REMEMBER} what you work out, in your own words, so a later task does not redo it.
- ${TOOL_SAVE} a document you must keep. Do not hunt paste sites, pads, or spreadsheets to persist work.
Reason from what you observed. A difference between the two views is evidence, not proof: A/B tests, geography, and consent walls change an anonymous page too. If the task turns out to be something you should not do, say so with ${TOOL_DONE} and explain what you observed that led there.

CHOOSING WHAT TO DO, AND HOW
Two different questions. What counts as the answer is the operator's to settle; how you go and get it is yours.
- ${TOOL_SURVEY} before committing to a route, so you weigh what this page offers instead of taking the first thing that could work.
- Check each word of the task against what you can see. If one of them matches more than one thing here, that changes the answer and is not yours to decide: ${TOOL_FORK}. Cover every branch and label results by source when that is cheap and bounded, otherwise ${TOOL_ASK}.
- The route is yours, so take the cheap one and do not ask about it. To inspect items in a list, ${TOOL_PEEK}: navigating away loses your place and you may not get it back, and peeking does not. If a name or id is all you have, build the URL or search for it, and pass expect so landing on the wrong thing is caught rather than believed. Do not peek file://; use scratch_ls / scratch_read for this goal's scratch. scratch_read is capped; pass offset to continue a truncated read.
${input.maxTurns ? `\nBudget: about ${input.maxTurns} turns. Spend them understanding the page, not retrying.` : ""}`;
}
