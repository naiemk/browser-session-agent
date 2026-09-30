/**
 * A chooser that opened because of a type, committed in-process.
 *
 * The list is often gone before the next model turn. When the type produced exactly
 * one new control whose name is that text, the harness clicks it (D17). Two matches
 * stay refs: guessing the first one is a wrong commit. Not a menu detector.
 */

import type { Control } from "./types.ts";

const MIN_QUERY = 2;
const MAX_QUERY = 80;

export function uniqueChooserHit(
  typed: string,
  before: readonly Control[],
  after: readonly Control[],
): Control | undefined {
  const query = typed.trim();
  if (query.length < MIN_QUERY || query.length > MAX_QUERY) return undefined;
  if (query.includes("{") || query.includes("\n") || query.includes("\r")) return undefined;

  const seen = new Set(before.map((control) => control.ref));
  const needle = query.toLowerCase();
  const hits = after.filter((control) => {
    if (seen.has(control.ref)) return false;
    const blob = `${control.name} ${control.row ?? ""}`.toLowerCase();
    return blob.includes(needle);
  });
  return hits.length === 1 ? hits[0] : undefined;
}
