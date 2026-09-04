import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { surveyAffordances } from "../../src/core/survey.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * Reading what a page says you can do here.
 *
 * The point is that this needs no knowledge of any site. It leans on the one thing the
 * browser gives us for free that a repository does not: interfaces advertise their own
 * capabilities, because a human has to be able to find them.
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

const named = (items: Array<{ name: string }>) => items.map((item) => item.name);

describe("surveying what a page offers", () => {
  it("lists the routes on offer, grouped by what they are", async () => {
    const tab = await browser.openTab(`${origin}/roster`);
    const survey = await surveyAffordances(browser.pageFor(tab));

    assert.deepEqual(named(survey.navigation), ["Roster", "Guests"]);
    assert.ok(
      survey.search.length > 0,
      "asking the app a question is a route too, and it is not a link",
    );
    assert.ok(
      named(survey.actions).some((name) => name.includes("Next page")),
      `expected the pager among actions, got ${JSON.stringify(named(survey.actions))}`,
    );
  });

  it("follows nothing, because a survey exists to postpone committing", async () => {
    const tab = await browser.openTab(`${origin}/roster`);
    const before = await browser.observe(tab);

    await surveyAffordances(browser.pageFor(tab));

    const after = await browser.observe(tab);
    assert.equal(after.url, before.url);
    assert.match((await browser.facts(tab)).text, /Page 1 of 2/, "not even the pager moved");
  });

  it("separates navigation from content, so the main areas stand out", async () => {
    const tab = await browser.openTab(`${origin}/p/dana`);
    const survey = await surveyAffordances(browser.pageFor(tab));

    assert.deepEqual(named(survey.navigation), ["Roster", "Guests"]);
    assert.deepEqual(
      named(survey.content),
      [],
      "the same anchors must not be counted twice under content",
    );
    assert.ok(named(survey.actions).some((name) => name.includes("Mark this one")));
  });

  it("names each destination once however many times it appears", async () => {
    const tab = await browser.openTab(`${origin}/guests`);
    const survey = await surveyAffordances(browser.pageFor(tab));

    const hrefs = survey.navigation.map((item) => item.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  it("works on a page it was never told about", async () => {
    // No fixture-specific knowledge anywhere in the survey: it reads landmarks and roles.
    const tab = await browser.openTab(`${origin}/apply`);
    const survey = await surveyAffordances(browser.pageFor(tab));

    assert.match(survey.url, /\/apply$/);
    assert.ok(
      survey.actions.length > 0,
      "a page with a form still advertises something to do",
    );
  });
});
