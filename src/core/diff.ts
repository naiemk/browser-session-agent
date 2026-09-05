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

/**
 * Reconciliation keys for the page delta.
 *
 * Keying on `role:name` alone looks right and is not: a table of fifty identical `Select`
 * checkboxes produces fifty controls with one key, a `Map` keeps the last, and checking
 * any other row compares that survivor against itself and reports nothing. Because a
 * click's default postcondition is "did the delta change", the harness then called a
 * working click a noop failure and the agent abandoned a route that had worked.
 *
 * `href` discriminates links cheaply. Beyond that, controls that are genuinely
 * indistinguishable are separated by their position within the duplicate group, which
 * makes row three comparable with row three. Insertions mid-list shift those positions
 * and report more change than happened — the tradeoff React makes with index keys — but
 * over-reporting a change is recoverable and silently reporting none is not.
 */
export function controlKey(control: Control, occurrence: number): string {
  const base = `${control.role}:${control.name}${control.href ? `:${control.href}` : ""}`;
  return occurrence === 0 ? base : `${base}#${occurrence}`;
}

function keyed(controls: Control[]): Map<string, Control> {
  const counts = new Map<string, number>();
  const out = new Map<string, Control>();
  for (const control of controls) {
    const base = `${control.role}:${control.name}${control.href ? `:${control.href}` : ""}`;
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    out.set(controlKey(control, occurrence), control);
  }
  return out;
}

/** How many controls share a key basis with a sibling, which is what used to be lost. */
export function duplicateKeyCount(controls: Control[]): number {
  const counts = new Map<string, number>();
  for (const control of controls) {
    const base = `${control.role}:${control.name}${control.href ? `:${control.href}` : ""}`;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let duplicates = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicates += count;
  }
  return duplicates;
}

/** Where a control sits among its identically-named siblings, for readable messages. */
function position(key: string): string {
  const marker = key.lastIndexOf("#");
  if (marker < 0) return "";
  return ` (#${Number(key.slice(marker + 1)) + 1})`;
}

/** Human-readable differences between two control sets, capped. */
export function diffControls(
  previous: Control[] | undefined,
  next: Control[],
): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  const beforeByName = keyed(previous);
  const afterByName = keyed(next);

  for (const [key, control] of afterByName) {
    if (!beforeByName.has(key)) {
      changes.push(`added ${control.role} "${control.name}"${position(key)}`);
    }
  }
  for (const [key, control] of beforeByName) {
    if (!afterByName.has(key)) {
      changes.push(`removed ${control.role} "${control.name}"${position(key)}`);
    }
  }
  for (const [key, after] of afterByName) {
    const before = beforeByName.get(key);
    if (!before) continue;
    if ((before.value ?? "") !== (after.value ?? "")) {
      changes.push(`value changed on "${after.name}"${position(key)}`);
    }
    if (Boolean(before.checked) !== Boolean(after.checked)) {
      changes.push(`checked changed on "${after.name}"${position(key)}`);
    }
    if (Boolean(before.disabled) !== Boolean(after.disabled)) {
      changes.push(`disabled changed on "${after.name}"${position(key)}`);
    }
  }
  return changes.slice(0, MAX_CHANGES);
}

/**
 * Which controls get the slots, when there are not enough to go round.
 *
 * Taking the first N in document order is what put eleven navigation links and fifteen
 * footer links in front of the model and left fourteen slots for the list it had opened.
 * The budget goes to what the page is about: editors and required fields first, because
 * losing one silently is what makes a form unfillable, then page content, then the site
 * furniture that is identical on every page of the site.
 *
 * Selection only. Document order survives, because a list read out of order is a list
 * read wrong, and refs stay exactly where the page put them.
 */
export function chooseControls(controls: readonly Control[], limit: number): Control[] {
  if (controls.length <= limit) return [...controls];

  const rank = (control: Control): number => {
    if (isEditorLike(control) || control.required) return 0;
    return control.chrome ? 2 : 1;
  };

  const kept = new Set(
    controls
      // Stable within a band, so a nav link keeps its place among other nav links.
      .map((control, index) => ({ control, index }))
      .sort((a, b) => rank(a.control) - rank(b.control) || a.index - b.index)
      .slice(0, limit)
      .map((entry) => entry.control),
  );

  return controls.filter((control) => kept.has(control));
}

/** Keep a crowded page inside a usable budget, giving up the furniture first. */
export function compactControls(controls: Control[]): { controls: Control[]; truncated: boolean } {
  if (controls.length <= MAX_CONTROLS) return { controls, truncated: false };
  return { controls: chooseControls(controls, MAX_CONTROLS), truncated: true };
}
