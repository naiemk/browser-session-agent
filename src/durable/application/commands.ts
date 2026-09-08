import type { JobId, WorkItemId } from "../domain/types.ts";

/**
 * DOM-07 — cancel command shapes (application API).
 * Service / CLI / Pi adapters bind these in CAMPAIGN-04-T01.
 */
export type CancelJobCommand = {
  type: "CancelJob";
  jobId: JobId;
  reason?: string;
};

export type CancelWorkItemCommand = {
  type: "CancelWorkItem";
  jobId: JobId;
  workItemId: WorkItemId;
  reason?: string;
};

export type DurableCommand = CancelJobCommand | CancelWorkItemCommand;
