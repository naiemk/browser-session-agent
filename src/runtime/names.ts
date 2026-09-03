/** Tool names the runtime exposes. One place so tools, prompt, and hooks agree. */
export const TOOL_OBSERVE = "observe";
export const TOOL_PROBE = "probe";
export const TOOL_CHECK = "check";
export const TOOL_ACT = "act";
export const TOOL_ASK = "ask_user";
export const TOOL_DONE = "report";
/** Load a URL with no session, to find out what a stranger sees. */
export const TOOL_STRANGER = "view_without_session";
/** Record something established, with the evidence that established it. */
export const TOOL_REMEMBER = "remember";

export const ALL_TOOLS = [
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_CHECK,
  TOOL_ACT,
  TOOL_ASK,
  TOOL_STRANGER,
  TOOL_REMEMBER,
  TOOL_DONE,
] as const;

/**
 * Results that go stale the moment the page moves on. Superseded ones have their content
 * replaced; the message stays, because providers require every tool call to keep a
 * matching result.
 */
export const PERISHABLE_TOOLS: readonly string[] = [TOOL_OBSERVE, TOOL_PROBE];
