/**
 * Control delta and snapshot compaction. Written fresh for the new core (D34).
 *
 * The delta is what makes "did anything actually happen" answerable in code, so a
 * click that changes nothing is a failure rather than a hopeful success.
 */

import type { Control } from "./types.ts";

export const MAX_CONTROLS = 80;
export const MAX_CHANGES = 12;

export function isEditorLike(control: Control): boolean {
  return (
    control.inputType === "textarea" ||
    control.inputType === "contenteditable" ||
    control.role === "textbox"
  );
}

/** Human-readable differences between two control sets, capped. */
export function diffControls(
  previous: Control[] | undefined,
  next: Control[],
): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  const beforeByName = new Map(previous.map((c) => [`${c.role}:${c.name}`, c]));
  const afterByName = new Map(next.map((c) => [`${c.role}:${c.name}`, c]));

  for (const [key, control] of afterByName) {
    if (!beforeByName.has(key)) {
      changes.push(`added ${control.role} "${control.name}"`);
    }
  }
  for (const [key, control] of beforeByName) {
    if (!afterByName.has(key)) {
      changes.push(`removed ${control.role} "${control.name}"`);
    }
  }
  for (const [key, after] of afterByName) {
    const before = beforeByName.get(key);
    if (!before) continue;
    if ((before.value ?? "") !== (after.value ?? "")) {
      changes.push(`value changed on "${after.name}"`);
    }
    if (Boolean(before.checked) !== Boolean(after.checked)) {
      changes.push(`checked changed on "${after.name}"`);
    }
    if (Boolean(before.disabled) !== Boolean(after.disabled)) {
      changes.push(`disabled changed on "${after.name}"`);
    }
  }
  return changes.slice(0, MAX_CHANGES);
}

/**
 * Keep a crowded page inside a usable budget. Editors and required fields survive
 * truncation first, because losing them silently is what makes a form unfillable.
 */
export function compactControls(controls: Control[]): { controls: Control[]; truncated: boolean } {
  if (controls.length <= MAX_CONTROLS) return { controls, truncated: false };
  const priority = controls.filter((c) => isEditorLike(c) || c.required);
  const rest = controls.filter((c) => !priority.includes(c));
  const kept = [...priority, ...rest].slice(0, MAX_CONTROLS);
  // Preserve original document order so refs read predictably.
  const keptRefs = new Set(kept.map((c) => c.ref));
  return { controls: controls.filter((c) => keptRefs.has(c.ref)), truncated: true };
}
