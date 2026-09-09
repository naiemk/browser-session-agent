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
  for (const step of doneSteps) {
    const item = items.find((todo) => todo.step === step);
    if (item) item.completed = true;
  }
  return doneSteps.length;
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
