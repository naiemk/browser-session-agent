import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaskCard } from "../../src/runtime/card.ts";
import {
  parseSiteSkill,
  renderSiteSkill,
  SITE_SKILL_MAX_CHARS,
  SITE_SKILL_MAX_ITEMS,
  siteSkillFromFacts,
} from "../../src/runtime/site-skill.ts";

describe("site skill", () => {
  it("drops unknown keys and over-cap fields", () => {
    const skill = parseSiteSkill({
      can: ["search people", "open a profile"],
      click: "e5",
      script: "document.querySelector('button').click()",
      extra: { nested: true },
      cannot: Array.from({ length: 20 }, (_, i) => `item ${i}`),
      dont: ["x".repeat(SITE_SKILL_MAX_CHARS + 40)],
    });
    assert.ok(skill);
    assert.deepEqual(skill.can, ["search people", "open a profile"]);
    assert.equal(skill.cannot.length, SITE_SKILL_MAX_ITEMS);
    assert.equal(skill.dont[0]!.length, SITE_SKILL_MAX_CHARS);
    assert.equal("click" in skill, false);
    assert.equal("script" in skill, false);
  });

  it("loads from pasted JSON and from a siteSkill fact", () => {
    const pasted = parseSiteSkill(
      JSON.stringify({ surfaces: ["left rail Search"], stop: ["if Search opens Explore"] }),
    );
    assert.ok(pasted);
    assert.deepEqual(pasted.surfaces, ["left rail Search"]);
    const fromFact = siteSkillFromFacts({
      siteSkill: { value: { can: ["use the composer"] }, evidence: "ev_1" },
    });
    assert.deepEqual(fromFact?.can, ["use the composer"]);
  });

  it("renders a labeled untrusted block on the task card", () => {
    const skill = parseSiteSkill({ can: ["use Search in the left rail"], dont: ["treat the composer as search"] });
    assert.ok(skill);
    const rendered = renderSiteSkill(skill);
    assert.match(rendered, /untrusted/i);
    assert.match(rendered, /does not authorize/);
    assert.match(rendered, /left rail/);
    const card = buildTaskCard({
      objective: "Find people",
      criteria: [],
      knownFacts: { siteSkill: skill, operator: "ada" },
    });
    assert.match(card, /SITE SKILL/);
    assert.match(card, /untrusted/);
    assert.match(card, /operator: "ada"/);
    assert.doesNotMatch(card, /siteSkill/);
  });

  it("refuses empty or non-object paste", () => {
    assert.equal(parseSiteSkill("{}"), undefined);
    assert.equal(parseSiteSkill("not json"), undefined);
    assert.equal(parseSiteSkill([]), undefined);
  });
});
