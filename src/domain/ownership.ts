import { AgentError, type RunState, type TabRecord } from "./types.ts";

export function assertCanAct(
  run: RunState,
  tabs: TabRecord[],
  tabId: string,
): TabRecord {
  if (run.status === "awaiting_takeover") {
    throw new AgentError(
      "ownership_error",
      "Run is awaiting human takeover; agent actions are locked",
      { runId: run.runId, tabId, status: run.status },
    );
  }
  if (run.status === "paused") {
    throw new AgentError("ownership_error", "Run is paused", {
      runId: run.runId,
      tabId,
      status: run.status,
    });
  }
  if (run.status !== "active") {
    throw new AgentError("run_inactive", `Run is ${run.status}`, {
      runId: run.runId,
      status: run.status,
    });
  }

  const tab = tabs.find((t) => t.tabId === tabId);
  if (!tab) {
    throw new AgentError("unknown_tab", `Unknown tab ${tabId}`, { tabId });
  }
  if (tab.ownerRunId !== run.runId) {
    throw new AgentError(
      "ownership_error",
      `Tab ${tabId} is not owned by run ${run.runId}`,
      { tabId, ownerRunId: tab.ownerRunId, runId: run.runId },
    );
  }
  if (!tab.locked) {
    throw new AgentError(
      "ownership_error",
      `Tab ${tabId} exclusive lock is released`,
      { tabId },
    );
  }
  return tab;
}
