/** Tool names the agent layer exposes to Pi. Kept in one place so hooks and tools agree. */
export const TOOL_OBSERVE = "browser_observe";
export const TOOL_PROBE = "browser_probe";
export const TOOL_CHECK = "browser_check";
export const TOOL_ACT = "browser_act";
export const TOOL_ASK = "browser_ask_user";
export const TOOL_TASK_RESULT = "task_result";

/**
 * Tool results that go stale the moment the page moves on. Their content is replaced
 * once superseded; the message itself is kept because providers require every tool
 * call to keep a matching result.
 */
export const PERISHABLE_TOOLS: readonly string[] = [TOOL_OBSERVE, TOOL_PROBE];

/** Results that must survive pruning: they are the record of what was verified. */
export const DURABLE_TOOLS: readonly string[] = [TOOL_CHECK, TOOL_ASK, TOOL_TASK_RESULT];
