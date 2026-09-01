import { NodeHub } from "./hub.ts";
import { OPERATOR_ACCOUNT_ID } from "./accounts.ts";

export class HubRegistry {
  private readonly hubs = new Map<string, NodeHub>();

  constructor() {
    this.hubs.set(OPERATOR_ACCOUNT_ID, new NodeHub({ failCode: "node_disconnected" }));
  }

  get operator(): NodeHub {
    return this.hubs.get(OPERATOR_ACCOUNT_ID)!;
  }

  hubFor(accountId: string): NodeHub {
    let hub = this.hubs.get(accountId);
    if (!hub) {
      hub = new NodeHub({
        failCode: accountId === OPERATOR_ACCOUNT_ID ? "node_disconnected" : "helper_disconnected",
      });
      this.hubs.set(accountId, hub);
    }
    return hub;
  }

  get connected(): boolean {
    return [...this.hubs.values()].some((hub) => hub.connected);
  }

  closeAll(): void {
    for (const hub of this.hubs.values()) hub.detach();
  }
}
