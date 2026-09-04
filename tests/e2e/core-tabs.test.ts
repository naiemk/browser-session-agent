import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * What a tab shares, and what it must not.
 *
 * These two facts are the foundation of every side-tab read. An ordinary second tab has to
 * be a second window onto the same session, or peeking a page would show us a signed-out
 * view of our own account and we would draw confident wrong conclusions from it. An
 * isolated tab has to be the opposite, or the stranger view proves nothing.
 *
 * Neither property was tested before, and the first one did not hold: `browser.newPage()`
 * creates a page in a *new* context, so every tab had its own cookie jar.
 */

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

async function signIn(): Promise<string> {
  const tab = await browser.openTab(`${origin}/login`);
  const observation = await browser.observe(tab);
  const ref = (name: string) =>
    observation.controls.find((control) => control.name.includes(name))!.ref;

  await act(browser, { kind: "type", tabId: tab, ref: ref("Email"), text: "ada@example.com" });
  await act(browser, { kind: "type", tabId: tab, ref: ref("Password"), text: "hunter2" });
  await act(browser, {
    kind: "click",
    tabId: tab,
    ref: ref("Sign in"),
    expect: { kind: "url_includes", text: "/jobs" },
  });
  return tab;
}

describe("what a second tab inherits", () => {
  it("shares the session, so a side tab is us and not a stranger", async () => {
    await signIn();

    const second = await browser.openTab(`${origin}/jobs`);
    assert.match(
      (await browser.observe(second)).url,
      /\/jobs$/,
      "an ordinary second tab must carry the login; if it lands on /login it has its own cookie jar",
    );

    await browser.closeTab(second);
  });

  it("still isolates a tab that asked to be isolated", async () => {
    await signIn();

    const stranger = await browser.openIsolatedTab(`${origin}/jobs`);
    assert.match(
      (await browser.observe(stranger)).url,
      /\/login$/,
      "an isolated tab must not carry the login, or the stranger view proves nothing",
    );

    await browser.closeTab(stranger);
  });

  it("keeps the two kinds apart at the same time", async () => {
    const primary = await signIn();
    const sameSession = await browser.openTab(`${origin}/jobs`);
    const stranger = await browser.openIsolatedTab(`${origin}/jobs`);

    assert.match((await browser.observe(sameSession)).url, /\/jobs$/);
    assert.match((await browser.observe(stranger)).url, /\/login$/);
    assert.match((await browser.observe(primary)).url, /\/jobs$/, "and the original is untouched");

    await browser.closeTab(sameSession);
    await browser.closeTab(stranger);
  });

  it("does not lose the session when a side tab closes", async () => {
    const primary = await signIn();

    const side = await browser.openTab(`${origin}/jobs`);
    await browser.closeTab(side);

    // Closing a page created by `browser.newPage()` closes its context too. Sharing one
    // context means a side tab cannot take the session down with it.
    await act(browser, { kind: "navigate", tabId: primary, url: `${origin}/jobs` });
    assert.match((await browser.observe(primary)).url, /\/jobs$/);
  });
});
