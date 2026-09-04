/**
 * The one place that decides what the agent is.
 *
 * There used to be two answers. The CLI and the suite assembled the new runtime's tools
 * and task card; the product assembled a different set of `browser_*` tools and appended a
 * paragraph to a coding agent's system prompt. Nothing in the code preferred one over the
 * other, so which agent existed depended on which binary you started - and every
 * improvement went to whichever one you were not running.
 *
 * So the tools and the prompt are composed here, once, and callers differ only in which
 * loop drives them. That difference is real: a suite task is bounded and judged by
 * criteria it cannot see, while a chat is a conversation the operator judges as it goes.
 * What the agent *can do* and *how it is told to behave* is not allowed to differ.
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildTaskCard, type TaskCardInput } from "./card.ts";
import { buildTools, type ToolContext } from "./tools.ts";

export interface AgentComposition {
  tools: AgentTool[];
  systemPrompt: string;
}

export interface ComposeAgentOptions {
  card: TaskCardInput;
  tools: ToolContext;
  /** Shown in the card as a budget. Enforcement belongs to whichever loop is driving. */
  maxTurns?: number;
}

export function composeAgent(options: ComposeAgentOptions): AgentComposition {
  const card: TaskCardInput = {
    ...options.card,
    ...(options.maxTurns === undefined ? {} : { maxTurns: options.maxTurns }),
  };
  return {
    tools: buildTools(options.tools),
    systemPrompt: buildTaskCard(card),
  };
}
