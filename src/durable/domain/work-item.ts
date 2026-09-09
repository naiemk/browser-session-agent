import { DomainError } from "./errors.ts";
import type { OperationCheckpoint, WorkItem, WorkItemStatus } from "./types.ts";

/**
 * DOM-04 — work-item status changes only through named commands.
 * The model never sets durable status directly.
 */
export type WorkItemCommand =
  | { type: "materialize" }
  | { type: "mark_ready" }
  | { type: "claim" }
  | { type: "complete"; checkpoint?: OperationCheckpoint }
  | { type: "fail"; checkpoint?: OperationCheckpoint }
  | { type: "block"; checkpoint: OperationCheckpoint }
  | { type: "unblock" }
  | { type: "cancel" }
  | { type: "abandon" }
  | { type: "retry" };

export const WORK_ITEM_COMMAND_TYPES = [
  "mark_ready",
  "claim",
  "complete",
  "fail",
  "block",
  "unblock",
  "cancel",
  "abandon",
  "retry",
] as const satisfies ReadonlyArray<Exclude<WorkItemCommand["type"], "materialize">>;

const FROM: Record<WorkItemCommand["type"], readonly WorkItemStatus[]> = {
  materialize: [], // only for brand-new records via createWorkItem
  mark_ready: ["pending"],
  claim: ["ready"],
  complete: ["leased"],
  fail: ["leased"],
  block: ["ready", "leased"],
  unblock: ["blocked"],
  cancel: ["pending", "ready", "leased", "blocked", "failed"],
  abandon: ["blocked", "failed"],
  retry: ["failed", "blocked"],
};

const TO: Record<WorkItemCommand["type"], WorkItemStatus | null> = {
  materialize: "pending",
  mark_ready: "ready",
  claim: "leased",
  complete: "done",
  fail: "failed",
  block: "blocked",
  unblock: "ready",
  cancel: "cancelled",
  abandon: "abandoned",
  retry: "ready",
};

export function reduceWorkItem(item: WorkItem, command: WorkItemCommand, now: string): WorkItem {
  if (command.type === "materialize") {
    throw new DomainError("illegal_work_command", "materialize creates a new work item; use createWorkItem");
  }
  const allowed = FROM[command.type];
  if (!allowed.includes(item.status)) {
    throw new DomainError(
      "illegal_work_transition",
      `cannot apply ${command.type} to work item in status ${item.status}`,
      { status: item.status, command: command.type, allowed: [...allowed] },
    );
  }
  const status = TO[command.type];
  if (!status) throw new DomainError("illegal_work_command", `unknown command ${command.type}`);

  const next: WorkItem = {
    ...item,
    status,
    updatedAt: now,
  };
  if (command.type === "claim") {
    next.attempts = item.attempts + 1;
  }
  if ("checkpoint" in command && command.checkpoint) {
    next.checkpoint = command.checkpoint;
  }
  if (command.type === "complete" || command.type === "cancel" || command.type === "abandon") {
    // terminal — leave checkpoint as last known
  }
  return next;
}

export function createWorkItem(
  fields: Omit<WorkItem, "status" | "attempts" | "createdAt" | "updatedAt"> & {
    createdAt?: string;
  },
  now: string,
): WorkItem {
  return {
    ...fields,
    status: "pending",
    attempts: 0,
    createdAt: fields.createdAt ?? now,
    updatedAt: now,
  };
}

export function cancelWorkItem(item: WorkItem, now: string): WorkItem {
  return reduceWorkItem(item, { type: "cancel" }, now);
}
