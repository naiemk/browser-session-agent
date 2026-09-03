import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { compareObservations, viewWithoutSession } from "../../src/core/perspective.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * The one primitive: what does this page look like without my session? Everything the agent
 * knows about its standing is meant to come from comparisons like these, so the mechanism
 * has to be trustworthy — above all, the isolated tab must really carry no session.
 */

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "perspective-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

/** Sign in on the shared context, the way a real session is established. */
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

describe("viewing a page without a session", () => {
  it("carries no session, so a walled page shows the wall", async () => {
    const tab = await signIn();

    // As us: the session gets us in.
    const mine = await browser.observe(tab);
    assert.match(mine.url, /\/jobs$/);

    const { signedOut, delta } = await viewWithoutSession(browser, {
      url: `${origin}/jobs`,
      tabId: tab,
    });

    assert.match(signedOut.url, /\/login$/, "without the session the site redirects to login");
    assert.equal(delta.urlChanged, true);
    assert.equal(delta.signedInUrl, `${origin}/jobs`);
  });

  it("shows an identical page as identical, drawing no conclusion either way", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const { delta } = await viewWithoutSession(browser, { tabId: tab });

    assert.equal(delta.urlChanged, false, "a public page needs no session");
    assert.equal(delta.signedInTitle, delta.signedOutTitle);
    assert.deepEqual(delta.onlyWithSession, [], "the session grants nothing extra here");
    assert.deepEqual(delta.onlyWithoutSession, []);

    // Deliberately absent: any verdict. "Public" is a conclusion for the caller to draw.
    assert.equal("isPublic" in delta, false);
    assert.equal("dataScope" in delta, false);
  });

  it("names what the session grants, on a page that renders differently", async () => {
    const tab = await signIn();
    await act(browser, { kind: "navigate", tabId: tab, url: `${origin}/account` });

    const { delta } = await viewWithoutSession(browser, { tabId: tab });

    assert.equal(delta.urlChanged, false, "same URL, different content");
    assert.ok(
      delta.onlyWithSession.some((name) => name.includes("Account menu: ada")),
      `expected the account menu only with a session, got ${JSON.stringify(delta.onlyWithSession)}`,
    );
    assert.ok(
      delta.onlyWithoutSession.some((name) => name.includes("Log in")),
      `expected a login affordance only without a session, got ${JSON.stringify(delta.onlyWithoutSession)}`,
    );
  });

  it("records the comparison so the reasoning can be audited", async () => {
    const ledger = await Ledger.open(root, "goal_audit");
    const tab = await browser.openTab(`${origin}/apply`);

    await viewWithoutSession(browser, { tabId: tab, ledger, intent: "is this reachable by anyone" });

    const [event] = await ledger.read();
    assert.equal(event?.type, "probe");
    assert.equal(event?.intent, "is this reachable by anyone");
    const payload = event?.payload as { requested: string; delta: { urlChanged: boolean } };
    assert.equal(payload.requested, `${origin}/apply`);
    assert.equal(payload.delta.urlChanged, false);
  });

  it("closes the isolated tab, so a comparison cannot become a second session", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await viewWithoutSession(browser, { tabId: tab });

    // The original tab still works; the temporary one is gone.
    assert.match((await browser.observe(tab)).url, /\/apply$/);
    assert.throws(() => browser.pageFor("tab_999"), /No such tab/);
  });

  it("leaves the signed-in session untouched", async () => {
    const tab = await signIn();
    await viewWithoutSession(browser, { url: `${origin}/jobs`, tabId: tab });

    await act(browser, { kind: "navigate", tabId: tab, url: `${origin}/jobs` });
    assert.match(
      (await browser.observe(tab)).url,
      /\/jobs$/,
      "an anonymous look must not log us out",
    );
  });
});

describe("comparing two observations", () => {
  const base = {
    id: "obs",
    tabId: "tab",
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };

  it("reports differences as facts, without interpreting them", () => {
    const delta = compareObservations(
      {
        ...base,
        url: "https://x.test/feed",
        title: "Feed",
        controls: [
          { ref: "e1", role: "button", name: "Log out", tag: "button" },
          { ref: "e2", role: "link", name: "Shared", tag: "a" },
        ],
      },
      {
        ...base,
        url: "https://x.test/login",
        title: "Log in",
        controls: [{ ref: "e1", role: "link", name: "Shared", tag: "a" }],
      },
    );

    assert.equal(delta.urlChanged, true);
    assert.deepEqual(delta.onlyWithSession, ["button:Log out"]);
    assert.deepEqual(delta.onlyWithoutSession, []);
    assert.equal(delta.signedInControlCount, 2);
    assert.equal(delta.signedOutControlCount, 1);
  });
});
