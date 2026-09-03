/** Tool names the runtime exposes. One place so tools, prompt, and hooks agree. */
export const TOOL_OBSERVE = "observe";
export const TOOL_PROBE = "probe";
export const TOOL_CHECK = "check";
export const TOOL_ACT = "act";
export const TOOL_ASK = "ask_user";
export const TOOL_DONE = "report";

export const ALL_TOOLS = [
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_CHECK,
  TOOL_ACT,
  TOOL_ASK,
  TOOL_DONE,
] as const;

/**
 * Results that go stale the moment the page moves on. Superseded ones have their content
 * replaced; the message stays, because providers require every tool call to keep a
 * matching result.
 */
export const PERISHABLE_TOOLS: readonly string[] = [TOOL_OBSERVE, TOOL_PROBE];
