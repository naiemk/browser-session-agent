import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardedAct } from "../../src/core/gate.ts";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";

function fakeBrowser(control: {
  ref: string;
  name: string;
  inputType?: string;
  role?: string;
  submits?: boolean;
}): BrowserPort {
  const observation: Observation = {
    id: "obs1",
    tabId: "t1",
    url: "https://login.ex/test",
    title: "Login",
    text: "Sign in",
    controls: [
      {
        ref: control.ref,
        role: control.role ?? "textbox",
        name: control.name,
        tag: "input",
        inputType: control.inputType,
        submits: control.submits,
      },
    ],
  };
  const facts: PageFacts = {
    url: observation.url,
    title: observation.title,
    text: observation.text,
    observation,
  };
  return {
    openTab: async () => "t1",
    openIsolatedTab: async () => "t1",
    closeTab: async () => undefined,
    observe: async () => observation,
    facts: async () => facts,
    lastObservation: () => observation,
    probe: async () => ({ ok: true, value: null }),
    survey: async () => ({ links: [], forms: [] }),
    navigate: async () => undefined,
    click: async () => undefined,
    fill: async () => undefined,
    selectOption: async () => undefined,
    scroll: async () => undefined,
    setInputFiles: async () => undefined,
    waitFor: async () => undefined,
    screenshot: async () => undefined,
    close: async () => undefined,
  };
}

describe("AGENT-14 gate neverPreapprove", () => {
  it("refuses password fill even when a matching grant exists", async () => {
    const browser = fakeBrowser({ ref: "pw", name: "Password", inputType: "password" });
    const result = await guardedAct(
      browser,
      { kind: "type", ref: "pw", text: "secret" },
      {
        policy: "auto",
        neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
        grants: [
          {
            id: "g1",
            specHash: "h",
            host: "login.ex",
            authorization: "outbound",
            remaining: 3,
          },
        ],
      },
    );
    assert.equal(result.status, "refused");
    if (result.status === "refused") {
      assert.equal(result.code, "nondelegable_credential");
    }
  });

  it("refuses captcha control interaction", async () => {
    const browser = fakeBrowser({ ref: "c1", name: "I'm not a robot", role: "checkbox" });
    const result = await guardedAct(
      browser,
      { kind: "click", ref: "c1" },
      {
        policy: "auto",
        neverPreapprove: ["captcha", "credential", "otp", "payment", "destructive"],
      },
    );
    assert.equal(result.status, "refused");
    if (result.status === "refused") assert.equal(result.code, "nondelegable_captcha");
  });
});
