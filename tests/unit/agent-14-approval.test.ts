import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAction } from "../../src/core/reversibility.ts";
import { decideEffectAuthorization } from "../../src/durable/domain/effect-envelope.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { effectIdentityKey, identitiesCompatible } from "../../src/runtime/effect-identity.ts";
import type { ActionRequest, Control } from "../../src/core/types.ts";

function control(overrides: Partial<Control> = {}): Control {
  return { ref: "e1", role: "button", name: "Do it", tag: "button", ...overrides };
}

describe("AGENT-14 approval precision", () => {
  it("does not treat submits-form alone as outbound when BSA_GATE_EFFECT_AWARE=1", () => {
    const prev = process.env.BSA_GATE_EFFECT_AWARE;
    process.env.BSA_GATE_EFFECT_AWARE = "1";
    try {
      const click: ActionRequest = { kind: "click", ref: "e1" };
      const onlySubmit = classifyAction(click, control({ name: "Continue", submits: true }));
      assert.equal(onlySubmit.authorization, "none", onlySubmit.authorizationReason);
      assert.equal(onlySubmit.reversibility, "unknown");
      // Effect-specific positive rules still authorize.
      const send = classifyAction(click, control({ name: "Send message" }));
      assert.equal(send.authorization, "outbound");
      assert.equal(send.authorizationRuleId, "outbound-name");
    } finally {
      if (prev === undefined) delete process.env.BSA_GATE_EFFECT_AWARE;
      else process.env.BSA_GATE_EFFECT_AWARE = prev;
    }
  });

  it("keeps legacy submits-form outbound when effect-aware flag is off", () => {
    const prev = process.env.BSA_GATE_EFFECT_AWARE;
    delete process.env.BSA_GATE_EFFECT_AWARE;
    try {
      const click: ActionRequest = { kind: "click", ref: "e1" };
      const onlySubmit = classifyAction(click, control({ name: "Continue", submits: true }));
      assert.equal(onlySubmit.authorization, "outbound");
      assert.equal(onlySubmit.authorizationRuleId, "submits-form");
    } finally {
      if (prev === undefined) delete process.env.BSA_GATE_EFFECT_AWARE;
      else process.env.BSA_GATE_EFFECT_AWARE = prev;
    }
  });

  it("neverPreapprove denies credential/otp/captcha/payment/destructive at durable gate", () => {
    const envelope = {
      allowed: [{ effect: "outbound" }],
      denied: [],
      grants: [
        { id: "g1", effect: "outbound", maxCount: 5 },
        { id: "g-pay", effect: "payment", maxCount: 5 },
      ],
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
    };
    for (const category of REQUIRED_NEVER_PREAPPROVE) {
      const decision = decideEffectAuthorization(
        envelope,
        { effect: category === "destructive" ? "delete" : category, category },
        { g1: 5, "g-pay": 5 },
        new Date().toISOString(),
      );
      assert.equal(decision.decision, "deny", category);
      if (decision.decision === "deny") {
        assert.equal(decision.category, category);
        assert.match(decision.reason, /nondelegable/);
      }
    }
  });

  it("weak apply/submit control names cannot sticky-authorize outbound", () => {
    const envelope = {
      allowed: [{ effect: "outbound" }],
      denied: [],
      grants: [{ id: "g1", effect: "outbound", controlName: "Apply", maxCount: 5 }],
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
    };
    const decision = decideEffectAuthorization(
      envelope,
      { effect: "outbound", category: "outbound", controlName: "Apply", host: "ex.test" },
      { g1: 5 },
      new Date().toISOString(),
    );
    assert.equal(decision.decision, "ask");
    if (decision.decision === "ask") assert.match(decision.reason, /weak_control/);
  });

  it("binds grants to effect identity fields so stage/destination drift fail closed", () => {
    const granted = {
      effect: "outbound",
      host: "shop.test",
      stage: "cart",
      destination: "https://shop.test/cart",
      controlName: "Checkout",
    };
    assert.equal(
      identitiesCompatible(granted, { ...granted, stage: "place_order" }),
      false,
    );
    assert.equal(
      identitiesCompatible(granted, { ...granted, destination: "https://shop.test/pay" }),
      false,
    );
    assert.equal(identitiesCompatible(granted, { ...granted }), true);
    assert.ok(effectIdentityKey(granted).includes("cart"));
  });
});
