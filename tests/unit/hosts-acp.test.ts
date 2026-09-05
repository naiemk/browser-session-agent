import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AcpServer } from "../../src/hosts/acp/server.ts";

describe("ACP harness", () => {
  it("handshakes and returns a verdict, not a click toolbox", async () => {
    const server = new AcpServer({
      runPrompt: async ({ session, prompt }) => ({
        status: "success",
        summary: `did ${prompt} at ${session.url}`,
        goalId: "goal_test",
        evidence: "/tmp/goal_test",
      }),
    });

    const init = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal((init?.result as { protocolVersion: string }).protocolVersion, "0.1.0");
    assert.equal((init?.result as { agentInfo: { name: string } }).agentInfo.name, "browser-agent");

    const created = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "session/new",
      params: { url: "https://example.test/apply", policy: "ask" },
    });
    const sessionId = (created?.result as { sessionId: string }).sessionId;
    assert.ok(sessionId);

    const prompted = await server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "Apply as Ada" }] },
    });
    const result = prompted?.result as {
      stopReason: string;
      outcome: { status: string; summary: string; goalId: string };
    };
    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.outcome.status, "success");
    assert.match(result.outcome.summary, /Apply as Ada/);
    assert.equal(result.outcome.goalId, "goal_test");
  });

  it("routes a committing ask through request_permission", async () => {
    let asked = 0;
    const server = new AcpServer({
      requestPermission: async (request) => {
        asked += 1;
        assert.match(request.reason, /unmatched|sending/);
        return true;
      },
      runPrompt: async ({ approve }) => {
        const ok = await approve({
          request: { kind: "click", ref: "e1" },
          reversibility: "committing",
          reason: "no rule matched \"Import\", so its effect is unknown (unmatched)",
          url: "https://example.test/",
        });
        return {
          status: ok ? "success" : "parked",
          summary: ok ? "sent" : "waiting",
          goalId: "g",
          evidence: "",
        };
      },
    });

    const created = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { url: "https://example.test/" },
    });
    const sessionId = (created?.result as { sessionId: string }).sessionId;
    const prompted = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: "Import the photo" },
    });
    assert.equal(asked, 1);
    assert.equal((prompted?.result as { outcome: { status: string } }).outcome.status, "success");
  });

  it("asks the host via session/request_permission when no handler is injected", async () => {
    const server = new AcpServer({
      runPrompt: async ({ approve }) => {
        const ok = await approve({
          request: { kind: "click", ref: "e1" },
          reversibility: "committing",
          reason: "no rule matched \"Import\", so its effect is unknown (unmatched)",
          url: "https://example.test/",
        });
        return {
          status: ok ? "success" : "parked",
          summary: ok ? "sent" : "waiting",
          goalId: "g",
          evidence: "",
        };
      },
    });
    let method = "";
    server.attachHost(async (name, params) => {
      method = name;
      assert.equal((params as { sessionId: string }).sessionId.length > 0, true);
      return { outcome: { outcome: "selected", optionId: "allow" } };
    });

    const created = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { url: "https://example.test/" },
    });
    const sessionId = (created?.result as { sessionId: string }).sessionId;
    const prompted = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: "Import the photo" },
    });
    assert.equal(method, "session/request_permission");
    assert.equal((prompted?.result as { outcome: { status: string } }).outcome.status, "success");
  });

  it("does not advertise act or observe as host tools", async () => {
    const server = new AcpServer({
      runPrompt: async () => ({ status: "failed", summary: "unused", goalId: "", evidence: "" }),
    });
    const init = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const listed = JSON.stringify(init?.result);
    assert.doesNotMatch(listed, /"act"|"observe"|"peek"/);
  });
});
