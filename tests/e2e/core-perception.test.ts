import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { act } from "../../src/core/act.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await server.stop();
});

describe("AGENT-00-T01 perception", () => {
  it("describes the apply form as roles, names, and refs", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const observation = await browser.observe(tab);

    assert.equal(observation.url, `${origin}/apply`);
    assert.equal(observation.title, "Apply");

    const byName = (name: string) =>
      observation.controls.find((control) => control.name.includes(name));

    const fullName = byName("Full name");
    assert.ok(fullName, JSON.stringify(observation.controls, null, 2));
    assert.equal(fullName.tag, "input");

    const email = byName("Email");
    assert.ok(email);
    assert.equal(email.role, "email");

    const location = byName("Location");
    assert.ok(location);
    assert.equal(location.tag, "select");

    const submit = byName("Submit application");
    assert.ok(submit);
    assert.equal(submit.submits, true, "a form submit button must be marked as submitting");

    assert.deepEqual(observation.failedRequests, []);
    assert.deepEqual(observation.consoleErrors, []);
    assert.ok(observation.capturedAt);
  });

  it("keeps refs stable when the page does not change", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const first = await browser.observe(tab);
    const second = await browser.observe(tab);
    assert.deepEqual(
      second.controls.map((control) => `${control.ref}:${control.name}`),
      first.controls.map((control) => `${control.ref}:${control.name}`),
    );
    assert.deepEqual(second.changes, [], "an unchanged page has no delta");
  });

  it("redacts password values at the source", async () => {
    const tab = await browser.openTab(`${origin}/login`);
    const observation = await browser.observe(tab);
    const password = observation.controls.find((control) => control.inputType === "password");
    assert.ok(password);

    const result = await act(browser, { kind: "type", tabId: tab, ref: password.ref, text: "hunter2" });
    assert.equal(result.ok, true);

    const after = await browser.observe(tab);
    const field = after.controls.find((control) => control.inputType === "password");
    assert.equal(field?.value, "***", "password must never be observed in plaintext");

    const serialized = JSON.stringify(after);
    assert.equal(serialized.includes("hunter2"), false);
  });

  it("collects editor-like controls and reports a delta after a change", async () => {
    const tab = await browser.openTab(`${origin}/jsonlint`);
    const observation = await browser.observe(tab);
    const editor = observation.controls.find(
      (control) => control.role === "textbox" || control.inputType === "textarea",
    );
    assert.ok(editor, "an editor surface must be collected even when it is not a plain input");

    // act observes before and after, so the delta appears on its own result.
    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref: editor.ref,
      text: '{"a":1}',
    });
    assert.equal(result.ok, true, JSON.stringify(result.verification));
    assert.ok(
      result.observation.changes.some((change) => change.includes("value changed")),
      JSON.stringify(result.observation.changes),
    );

    const after = await browser.observe(tab);
    const reread = after.controls.find((control) => control.ref === editor.ref);
    assert.match(reread?.value ?? "", /"a"/);
    assert.deepEqual(after.changes, [], "a second look at an unchanged page has no delta");
  });
});
