import type { Control, Observation } from "./types.ts";

const MAX_CONTROLS = 80;

export function truncateControls(controls: Control[]): {
  controls: Control[];
  truncated: boolean;
} {
  if (controls.length <= MAX_CONTROLS) {
    return { controls, truncated: false };
  }
  return { controls: controls.slice(0, MAX_CONTROLS), truncated: true };
}

export function diffControls(previous: Control[] | undefined, next: Control[]): string[] {
  if (!previous) return [];
  const prev = new Map(previous.map((c) => [c.ref, c]));
  const changes: string[] = [];
  for (const control of next) {
    const before = prev.get(control.ref);
    if (!before) {
      changes.push(`added ${control.ref} ${control.role} "${control.name}"`);
      continue;
    }
    if (before.name !== control.name) {
      changes.push(`renamed ${control.ref} "${before.name}" -> "${control.name}"`);
    }
    if (before.value !== control.value) {
      changes.push(`value ${control.ref} changed`);
    }
  }
  const nextRefs = new Set(next.map((c) => c.ref));
  for (const control of previous) {
    if (!nextRefs.has(control.ref)) {
      changes.push(`removed ${control.ref} ${control.role} "${control.name}"`);
    }
  }
  return changes.slice(0, 12);
}

export function compactObservation(observation: Observation): Observation {
  const { controls, truncated } = truncateControls(observation.controls);
  return { ...observation, controls, truncated: truncated || observation.truncated };
}
