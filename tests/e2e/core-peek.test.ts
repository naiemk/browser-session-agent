import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { peek } from "../../src/core/peek.ts";
import { describeCheck } from "../../src/core/predicates.ts";
import { CoreError } from "../../src/core/types.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * Reading something without going there.
 *
 * The property under test is the one the agent cannot currently get: after looking at
 * another page, it is still exactly where it was, with the list still on the page it had
 * paged to. The roster fixture builds its rows in script and only for the current page, so
 * losing your place really does cost you the clicks to get back.
 */

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "peek-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

/** Page forward to the roster's second page, which holds Dana. */
async function rosterOnPageTwo(): Promise<string> {
  const tab = await browser.openTab(`${origin}/roster`);
  const observation = await browser.observe(tab);
  const next = observation.controls.find((control) => control.name.includes("Next page"))!;
  await act(browser, {
    kind: "click",
    tabId: tab,
    ref: next.ref,
    expect: { kind: "text_visible", text: "Page 2 of 2" },
  });
  return tab;
}

describe("peeking a page", () => {
  it("leaves the list exactly where it was, page and all", async () => {
    const tab = await rosterOnPageTwo();

    const result = await peek(browser, { url: `${origin}/p/dana`, tabId: tab });

    assert.match(result.observation.title, /Dana/);
    assert.ok(
      result.observation.controls.some((control) => control.name.includes("Mark this one")),
      "the peeked page is fully readable",
    );
    assert.equal(result.origin.unchanged, true);

    // The expensive route would have cost two clicks to get back here.
    const back = await browser.facts(tab);
    assert.match(back.url, /\/roster$/);
    assert.match(back.text, /Page 2 of 2/, "still on page two");
    assert.match(back.text, /Dana Ivanova/, "and the rows it had loaded are still there");
  });

  it("reads what the list could not tell it", async () => {
    const tab = await rosterOnPageTwo();

    const dana = await peek(browser, { url: `${origin}/p/dana`, tabId: tab });
    const linus = await peek(browser, { url: `${origin}/p/linus`, tabId: tab });

    // City exists only on a person's own page, which is why the traversal is necessary.
    assert.match((await browser.facts(tab)).text, /Page 2 of 2/);
    assert.ok(dana.matched);
    assert.ok(linus.matched);
  });

  it("says so when a built URL resolves to the wrong thing", async () => {
    const tab = await browser.openTab(`${origin}/roster`);

    const wrong = await peek(browser, {
      url: `${origin}/p/grace`,
      tabId: tab,
      expect: { kind: "text_visible", text: "Dana Ivanova" },
    });

    assert.equal(wrong.matched, false, "a URL can resolve to a real page that is not the one meant");
    // What was wanted and what was seen, which is how the model is told about it too.
    assert.match(describeCheck(wrong.identity!), /Dana Ivanova/);
    assert.match(describeCheck(wrong.identity!), /no match/);

    const right = await peek(browser, {
      url: `${origin}/p/dana`,
      tabId: tab,
      expect: { kind: "text_visible", text: "Dana Ivanova" },
    });
    assert.equal(right.matched, true);
  });

  it("reports a URL that resolves to nothing, without moving us", async () => {
    const tab = await rosterOnPageTwo();

    const missing = await peek(browser, {
      url: `${origin}/p/nobody`,
      tabId: tab,
      expect: { kind: "text_visible", text: "Somebody" },
    });

    assert.equal(missing.matched, false);
    assert.match((await browser.facts(tab)).text, /Page 2 of 2/, "a 404 is cheap and costs no place");
  });

  it("carries our session, because a peek is us and not a stranger", async () => {
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

    const result = await peek(browser, { url: `${origin}/jobs`, tabId: tab });
    assert.match(
      result.observation.url,
      /\/jobs$/,
      "a signed-out peek would send us to /login and we would conclude the wrong thing",
    );
  });

  it("records the read, including that it carried our session", async () => {
    const ledger = await Ledger.open(root, "goal_peek");
    const tab = await browser.openTab(`${origin}/roster`);

    await peek(browser, { url: `${origin}/p/dana`, tabId: tab, ledger, intent: "which city" });

    const [event] = await ledger.read();
    assert.equal(event?.type, "probe");
    assert.equal(event?.intent, "which city");
    const payload = event?.payload as {
      peek: string;
      withSession: boolean;
      originUnchanged: boolean;
    };
    assert.match(payload.peek, /\/p\/dana$/);
    // The observability gate is not built yet; this is what it will read.
    assert.equal(payload.withSession, true);
    assert.equal(payload.originUnchanged, true);
  });

  it("refuses an empty url rather than opening a blank tab", async () => {
    const tab = await browser.openTab(`${origin}/roster`);
    await assert.rejects(() => peek(browser, { url: "   ", tabId: tab }), CoreError);
  });
});
