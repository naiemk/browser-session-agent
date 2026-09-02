import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindBrowserExtension } from "../../src/host/bind-extension.ts";
import { BROWSER_TOOL_NAMES } from "../../src/domain/types.ts";
import { createExtensionApi, extensionContext, MemoryOperatorHost } from "../../src/host/memory-host.ts";
import { RpcSessionHandle } from "../../src/host/session-handle.ts";
import { parseJsonMessage } from "../../src/hosts/shared/protocol.ts";

describe("OperatorHost", () => {
  it("defaults the hosted host to browser tools, not coding tools", () => {
    const host = new MemoryOperatorHost();
    assert.deepEqual(host.getActiveTools(), [...BROWSER_TOOL_NAMES]);
    assert.equal(host.getActiveTools().includes("bash"), false);
  });

  it("parks input/confirm/select until answer()", async () => {
    const host = new MemoryOperatorHost();
    const seen: string[] = [];
    host.listeners.onUiRequest = (request) => seen.push(request.kind);

    const input = host.input("Name", "Ada");
    const confirm = host.confirm("Sure?", "Continue");
    const select = host.select("Pick", ["a", "b"]);
    assert.deepEqual(seen, ["input", "confirm", "select"]);

    host.answer("ui_1", "Ada Lovelace");
    host.answer("ui_2", true);
    host.answer("ui_3", "b");
    assert.equal(await input, "Ada Lovelace");
    assert.equal(await confirm, true);
    assert.equal(await select, "b");
  });

  it("binds slash commands to an RPC session handle", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const handle = new RpcSessionHandle({
      async call<T>(method: string, args: unknown[]) {
        calls.push({ method, args });
        if (method === "startRun") {
          return { runId: "run_1", currentTabId: "tab_1", status: "active" } as T;
        }
        return undefined as T;
      },
    });
    const host = new MemoryOperatorHost();
    const api = createExtensionApi(host);
    bindBrowserExtension(api, handle);
    await api.commands.get("browser-start")?.handler("Apply to the role", extensionContext(host));
    assert.equal(calls[0]?.method, "startRun");
    assert.deepEqual(calls[0]?.args, ["Apply to the role", undefined]);
    assert.equal(handle.currentRunId, "run_1");
    assert.ok(host.getActiveTools().includes("browser_inspect"));
  });

  it("parses protocol messages", () => {
    assert.equal(parseJsonMessage("not-json"), null);
    assert.deepEqual(parseJsonMessage<{ type: string }>('{"type":"hello"}'), { type: "hello" });
  });
});
