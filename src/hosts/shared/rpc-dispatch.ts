import { AgentError } from "../../domain/types.ts";
import type { BrowserSession } from "../../session.ts";
import type { WorkerInputEvent } from "../../worker/browser-worker.ts";

export async function dispatchSessionRpc(
  session: BrowserSession,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case "inspect":
      return session.inspect(args[0] as string | undefined, args[1] as string | undefined);
    case "act":
      return session.act(args[0] as Parameters<BrowserSession["act"]>[0]);
    case "askUser":
      return session.askUser(
        String(args[0] ?? ""),
        args[1] as string | undefined,
        args[2] as string | undefined,
      );
    case "takeover":
      return session.takeover(args[0] as string | undefined, args[1] as string | undefined);
    case "resume":
      return session.resume(args[0] as string | undefined);
    case "recordTool":
      return session.recordTool(
        String(args[0] ?? ""),
        (args[1] as Record<string, unknown>) ?? {},
        (args[2] as Record<string, unknown>) ?? {},
        Boolean(args[3]),
      );
    case "proposeKnowledge":
      return session.proposeKnowledge(args[0] as Parameters<BrowserSession["proposeKnowledge"]>[0]);
    case "startRun":
      return session.startRun(String(args[0] ?? ""), args[1] as string | undefined);
    case "pauseRun":
      return session.pauseRun(args[0] as string | undefined);
    case "stopRun":
      return session.stopRun(
        args[0] as string | undefined,
        args[1] as Parameters<BrowserSession["stopRun"]>[1],
      );
    case "status":
      return session.status();
    case "store.listStates":
      return session.store.listStates();
    case "knowledge.search":
      return session.knowledge.search(String(args[0] ?? ""));
    case "knowledge.list":
      return session.knowledge.list();
    case "knowledge.setStatus":
      return session.knowledge.setStatus(String(args[0] ?? ""), args[1] as "approved" | "rejected");
    case "worker.stop":
      return session.worker.stop();
    default:
      throw new AgentError("invalid_action", `Unknown RPC method ${method}`, { method });
  }
}

export async function applyTakeoverInput(session: BrowserSession, event: WorkerInputEvent): Promise<void> {
  const status = await session.status();
  if (status.currentRun?.status !== "awaiting_takeover") {
    throw new AgentError(
      "ownership_error",
      "Remote input is only allowed while the run is awaiting_takeover",
    );
  }
  await session.worker.applyInput(event, status.currentRun.currentTabId ?? undefined);
}
