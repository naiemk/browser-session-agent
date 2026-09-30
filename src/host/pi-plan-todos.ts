/**
 * Numbered Plan: steps and [DONE:n] markers, same extraction Pi's plan-mode example uses.
 *
 * Capture the rest of the line. Stopping at the first asterisk turns
 * `1. **Research** directories` and `2. **Research** newsletters` into the same
 * widget label, which is how a six-step launch plan collapsed to "Research".
 */

export interface TodoItem {
  step: number;
  text: string;
  completed: boolean;
}

export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*{1,2}/g, "")
    .trim();
}

export function cleanStepText(text: string): string {
  let cleaned = stripMarkdownInline(text)
    .replace(
      /^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (cleaned.length > 72) {
    cleaned = `${cleaned.slice(0, 69)}...`;
  }
  return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
  const items: TodoItem[] = [];
  const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
  if (!headerMatch) return items;

  const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
  const numberedPattern = /^\s*(\d+)[.)]\s+(.+)$/gm;

  for (const match of planSection.matchAll(numberedPattern)) {
    const text = stripMarkdownInline(match[2] ?? "");
    if (!text) continue;
    if (text.startsWith("`") || text.startsWith("/") || text.startsWith("-")) continue;
    const cleaned = cleanStepText(text);
    if (cleaned.length > 1) {
      items.push({ step: items.length + 1, text: cleaned, completed: false });
    }
  }
  return items;
}

export function extractDoneSteps(message: string): number[] {
  const steps: number[] = [];
  for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isFinite(step)) steps.push(step);
  }
  return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
  const doneSteps = extractDoneSteps(text);
  let marked = 0;
  for (const step of doneSteps) {
    const item = items.find((todo) => todo.step === step);
    if (!item || item.completed) continue;
    // Host owns coach review and file assembly. A [DONE:n] in the same
    // puff as a failed save used to skip Magpie's coder write.
    if (isCoachRoleText(item.text) || isAssembleRoleText(item.text)) continue;
    item.completed = true;
    marked += 1;
  }
  return marked;
}

/** COACH-09: first numbered step whose wording is the coach role. */
export const COACH_ROLE_PATTERN = /\bcoach(?:ing)?\b/i;

export function isCoachRoleText(text: string): boolean {
  return COACH_ROLE_PATTERN.test(text);
}

export function coachStepNumber(items: readonly TodoItem[]): number | undefined {
  return items.find((item) => isCoachRoleText(item.text))?.step;
}

/** First numbered step whose wording is assembling a harvest file, not browsing. */
export function isAssembleRoleText(text: string): boolean {
  if (/\b(scout|harvest|coach|setup|manifest)\b/i.test(text)) return false;
  if (/^\s*(and\s+)?report\b/i.test(text)) return false;
  if (/\bscratch_read\b/i.test(text) && !/\b(output|assemble|write|build)\b/i.test(text)) {
    return false;
  }
  if (/\b[\w./-]+\.(csv|tsv)\b/i.test(text)) return true;
  if (/\boutput\s+csv\b/i.test(text)) return true;
  if (/\bdeliver\b/i.test(text) && /\b(file|csv|scratch|artifact|list)\b/i.test(text)) return true;
  if (/\b(assemble|build)\b/i.test(text) && /\b(csv|spreadsheet|portfolio|file)\b/i.test(text)) {
    return true;
  }
  if (/\bsave\b/i.test(text) && /\bfinal\b/i.test(text) && /\b(file|list|csv|scratch)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function assembleStepNumber(items: readonly TodoItem[]): number | undefined {
  return items.find((item) => isAssembleRoleText(item.text))?.step;
}

export function deliverableNameFromStep(text: string): string {
  const named = text.match(/\b([\w./-]+\.(csv|tsv|json|md))\b/i);
  if (named?.[1] && !/^addresses\.csv$/i.test(named[1])) return named[1];
  if (/\bcsv\b/i.test(text) || /\bspreadsheet\b/i.test(text)) return "portfolio.csv";
  return "candidates.csv";
}

/**
 * Work the executor is allowed to see (COACH-15).
 *
 * Before an artifact: only steps before the coach-role todo.
 * After: only steps after it. No coach-role todo means known_flow — all remaining.
 * Assemble-role steps (Output CSV / Deliver) stay host-owned until the file exists.
 */
export function executorRemaining(
  items: readonly TodoItem[],
  hasArtifact: boolean,
  hasDeliverable = false,
): TodoItem[] {
  const coachStep = coachStepNumber(items);
  const assembleStep = assembleStepNumber(items);
  return items.filter((todo) => {
    if (todo.completed) return false;
    if (coachStep !== undefined) {
      if (!hasArtifact && todo.step >= coachStep) return false;
      if (hasArtifact && todo.step <= coachStep) return false;
    }
    if (assembleStep !== undefined) {
      if (!hasDeliverable && todo.step >= assembleStep) return false;
      if (hasDeliverable && todo.step <= assembleStep) return false;
    }
    return true;
  });
}

export function preCoachComplete(items: readonly TodoItem[]): boolean {
  const coachStep = coachStepNumber(items);
  if (coachStep === undefined) return false;
  const pre = items.filter((item) => item.step < coachStep);
  return pre.length > 0 && pre.every((todo) => todo.completed);
}

export function markCoachRoleComplete(items: TodoItem[]): boolean {
  const coachStep = coachStepNumber(items);
  if (coachStep === undefined) return false;
  const item = items.find((todo) => todo.step === coachStep);
  if (!item || item.completed) return false;
  item.completed = true;
  return true;
}

export function preAssembleComplete(items: readonly TodoItem[]): boolean {
  const assembleStep = assembleStepNumber(items);
  if (assembleStep === undefined) return false;
  const pre = items.filter((item) => item.step < assembleStep);
  return pre.length > 0 && pre.every((todo) => todo.completed);
}

export function markAssembleComplete(items: TodoItem[]): boolean {
  const assembleStep = assembleStepNumber(items);
  if (assembleStep === undefined) return false;
  const item = items.find((todo) => todo.step === assembleStep);
  if (!item || item.completed) return false;
  item.completed = true;
  return true;
}

/** Host advanced past scout (DONE or coach started/finished) — clear the Scout → freeze. */
export function markPreCoachComplete(items: TodoItem[]): number {
  const coachStep = coachStepNumber(items);
  if (coachStep === undefined) return 0;
  let marked = 0;
  for (const item of items) {
    if (item.step < coachStep && !item.completed) {
      item.completed = true;
      marked += 1;
    }
  }
  return marked;
}

export function assistantHasToolCalls(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const type = (block as { type?: string }).type;
    return type === "toolCall" || type === "toolUse" || type === "functionCall";
  });
}

export function assistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: string; text: string } =>
      Boolean(block && typeof block === "object" && (block as { type?: string }).type === "text"),
    )
    .map((block) => block.text)
    .join("\n");
}

export function isAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const role = (message as { role?: unknown }).role;
  if (role !== "assistant") return false;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" || Array.isArray(content);
}
