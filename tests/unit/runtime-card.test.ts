import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaskCard } from "../../src/runtime/card.ts";

const CARD = {
  objective: "Apply for the Staff Engineer role as Ada Lovelace",
  criteria: [{ kind: "text_visible" as const, text: "Application submitted" }],
  startUrl: "http://fixture.test/apply",
};

describe("task card", () => {
  it("states the objective and the criteria that judge it", () => {
    const card = buildTaskCard(CARD);
    assert.match(card, /Apply for the Staff Engineer role/);
    assert.match(card, /text visible "Application submitted"/);
    assert.match(card, /http:\/\/fixture\.test\/apply/);
  });

  it("says plainly that a claim is not evidence", () => {
    assert.match(buildTaskCard(CARD), /claiming success does not make it so/i);
  });

  it("is not a coding agent", () => {
    const card = buildTaskCard(CARD);
    assert.match(card, /not a coding assistant/);
    assert.match(card, /no files, no shell, no repository/);
    assert.doesNotMatch(card, /working directory/i);
  });

  it("tells the agent what it may commit", () => {
    assert.match(buildTaskCard({ ...CARD, policy: "never" }), /forbidden here/);
    assert.match(buildTaskCard({ ...CARD, policy: "ask" }), /need approval/);
    assert.match(buildTaskCard({ ...CARD, policy: "auto" }), /once their precondition holds/);
  });

  it("passes on known facts so they are not asked for again", () => {
    const card = buildTaskCard({ ...CARD, knownFacts: { fullName: "Ada Lovelace" } });
    assert.match(card, /do not ask again/);
    assert.match(card, /Ada Lovelace/);
  });

  it("stays short, because the prompt is resent every turn", () => {
    const card = buildTaskCard({ ...CARD, maxTurns: 12 });
    assert.ok(card.length < 3400, `card is ${card.length} chars; trim it`);
    assert.match(card, /about 12 turns/);
  });

  it("separates what counts as the answer from how to go and get it", () => {
    const card = buildTaskCard(CARD);

    // A word that means two things changes the answer, so it is surfaced.
    assert.match(card, /matches more than one thing/);
    assert.match(card, /note_fork/);

    // The route only changes the cost, so it is chosen and not asked about.
    assert.match(card, /take the cheap one and do not ask about it/);
    assert.match(card, /navigating away loses your place/);
  });

  it("teaches a method for establishing standing, and asserts no situation", () => {
    const card = buildTaskCard(CARD);
    assert.match(card, /Who are you acting as/);
    assert.match(card, /What does your session grant/);
    assert.match(card, /evidence, not proof/);

    // The card must not tell the agent a story about whose data this is: that varies by
    // site, session, and task, and a fixed answer is wrong for the next case.
    assert.doesNotMatch(card, /your own account/i);
    assert.doesNotMatch(card, /you are the signed-in user/i);
    assert.doesNotMatch(card, /public data/i);
  });
});
