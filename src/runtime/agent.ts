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

/**
 * What the model is charged for before it reads a single page.
 *
 * The card and the tool schemas are resent on every turn, so their size is multiplied by
 * the length of the task. Returned here rather than measured by each caller so that the
 * number in a report is the number the provider actually saw.
 */
export function fixedOverhead(composition: AgentComposition): {
  cardBytes: number;
  toolSchemaBytes: number;
  toolCount: number;
} {
  const schemas = composition.tools.map((tool) => {
    const described = tool as unknown as { name: string; description: string; parameters: unknown };
    return JSON.stringify({
      name: described.name,
      description: described.description,
      parameters: described.parameters,
    });
  });
  return {
    cardBytes: composition.systemPrompt.length,
    toolSchemaBytes: schemas.join("").length,
    toolCount: schemas.length,
  };
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
