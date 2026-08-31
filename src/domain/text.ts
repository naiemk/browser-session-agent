export function redactParams(
  toolName: string,
  params: Record<string, unknown>,
  inputType?: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...params };
  const looksSecret =
    toolName === "browser_type" &&
    (inputType === "password" ||
      copy.secret === true ||
      String(copy.ref ?? "").toLowerCase().includes("password"));
  if (looksSecret && typeof copy.text === "string") {
    copy.text = "***";
  }
  return copy;
}

export function knowledgeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2);
}

export function lexicalScore(query: string, document: string): number {
  const q = new Set(knowledgeTokens(query));
  if (q.size === 0) return 0;
  const d = new Set(knowledgeTokens(document));
  let hit = 0;
  for (const token of q) {
    if (d.has(token)) hit += 1;
  }
  return hit / q.size;
}
