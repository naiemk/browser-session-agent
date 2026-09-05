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
/** Write a document to this goal's artifacts, instead of hunting for a paste site. */
export const TOOL_SAVE = "save_artifact";
/** Read a URL in a side tab without leaving the page you are on. */
export const TOOL_PEEK = "peek";
/** List the routes this page offers, following none of them. */
export const TOOL_SURVEY = "survey";
/** Work somewhere else for a while without losing your place. */
export const TOOL_SIDE_OPEN = "side_tab_open";
export const TOOL_SIDE_CLOSE = "side_tab_close";
/** Record that a word in the goal matched more than one thing, and what was done. */
export const TOOL_FORK = "note_fork";

export const ALL_TOOLS = [
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_CHECK,
  TOOL_ACT,
  TOOL_ASK,
  TOOL_STRANGER,
  TOOL_REMEMBER,
  TOOL_SAVE,
  TOOL_PEEK,
  TOOL_SURVEY,
  TOOL_SIDE_OPEN,
  TOOL_SIDE_CLOSE,
  TOOL_FORK,
  TOOL_DONE,
] as const;

/**
 * Results that go stale the moment the page moves on. Superseded ones have their content
 * replaced; the message stays, because providers require every tool call to keep a
 * matching result.
 */
export const PERISHABLE_TOOLS: readonly string[] = [TOOL_OBSERVE, TOOL_PROBE];
