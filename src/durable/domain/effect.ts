import { DomainError } from "./errors.ts";
import type { Effect, EffectStatus } from "./types.ts";

export type EffectCommand =
  | { type: "prepare" }
  | { type: "dispatch"; at: string }
  | { type: "observe"; at: string }
  | { type: "mark_uncertain" }
  | { type: "reconcile"; at: string }
  | { type: "abandon" };

const ALLOWED: Record<EffectCommand["type"], readonly EffectStatus[]> = {
  prepare: [], // createEffect only
  dispatch: ["prepared"],
  observe: ["dispatched", "uncertain"],
  mark_uncertain: ["dispatched"],
  reconcile: ["uncertain", "observed"],
  abandon: ["prepared", "dispatched", "uncertain", "observed"],
};

const NEXT: Record<EffectCommand["type"], EffectStatus | null> = {
  prepare: "prepared",
  dispatch: "dispatched",
  observe: "observed",
  mark_uncertain: "uncertain",
  reconcile: "reconciled",
  abandon: "abandoned",
};

export function createEffect(
  fields: Omit<Effect, "status" | "preparedAt" | "evidenceIds"> & { evidenceIds?: string[] },
  now: string,
): Effect {
  return {
    ...fields,
    status: "prepared",
    evidenceIds: fields.evidenceIds ?? [],
    preparedAt: now,
  };
}

export function reduceEffect(effect: Effect, command: EffectCommand): Effect {
  if (command.type === "prepare") {
    throw new DomainError("illegal_effect_command", "use createEffect");
  }
  if (!ALLOWED[command.type].includes(effect.status)) {
    throw new DomainError(
      "illegal_effect_transition",
      `cannot ${command.type} from ${effect.status}`,
      { status: effect.status, command: command.type },
    );
  }
  const status = NEXT[command.type]!;
  const next: Effect = { ...effect, status };
  if (command.type === "dispatch") next.dispatchedAt = command.at;
  if (command.type === "observe") next.observedAt = command.at;
  if (command.type === "reconcile") next.reconciledAt = command.at;
  return next;
}

/** A local claim is never proof a remote effect happened. */
export function claimIsNotProof(effect: Effect): boolean {
  return effect.status === "prepared" || effect.status === "dispatched" || effect.status === "uncertain";
}
