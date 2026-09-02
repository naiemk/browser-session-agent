import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countTurn, createTurnCap, registerTurnCap } from "../../src/agent/turn-cap.ts";

type TurnHandler = (event: unknown, ctx: { abort?: () => unknown }) => unknown;

function fakePi() {
  const handlers: TurnHandler[] = [];
  return {
    handlers,
    pi: { on: (_event: "turn_end", handler: TurnHandler) => handlers.push(handler) },
  };
}

describe("AGENT-04-T02 turn cap", () => {
  it("counts turns and trips exactly once at the limit", () => {
    const state = createTurnCap(3);
    assert.equal(countTurn(state), false);
    assert.equal(countTurn(state), false);
    assert.equal(countTurn(state), true, "the third turn reaches the limit");
    assert.equal(countTurn(state), false, "it does not trip again");
    assert.equal(state.capped, true);
    assert.equal(state.turns, 4);
  });

  it("aborts the run and reports the cap", () => {
    const { pi, handlers } = fakePi();
    let aborted = 0;
    let capped: number | undefined;

    const state = registerTurnCap(pi, 2, { onCap: (s) => (capped = s.turns) });
    const ctx = { abort: () => (aborted += 1) };

    handlers[0]!({}, ctx);
    assert.equal(aborted, 0, "under the limit nothing happens");

    handlers[0]!({}, ctx);
    assert.equal(aborted, 1, "at the limit the run is aborted");
    assert.equal(capped, 2);
    assert.equal(state.capped, true);

    handlers[0]!({}, ctx);
    assert.equal(aborted, 1, "abort is not repeated");
  });

  it("survives a context with no abort", () => {
    const { pi, handlers } = fakePi();
    registerTurnCap(pi, 1);
    assert.doesNotThrow(() => handlers[0]!({}, {}));
  });

  it("registers nothing when switched off", () => {
    const { pi, handlers } = fakePi();
    const state = registerTurnCap(pi, 5, { enabled: false });
    assert.equal(handlers.length, 0);
    assert.equal(state.limit, 5);
    assert.equal(state.capped, false);
  });
});
