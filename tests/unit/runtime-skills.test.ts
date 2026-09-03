import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  formatCatalogue,
  loadSkillCatalogue,
  promotableCandidates,
  readSkillBody,
  retrieveSkills,
  type SkillMeta,
} from "../../src/runtime/skills.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS_DIR = path.join(ROOT, "browser-skills");

describe("lazy skills", () => {
  it("loads the catalogue from disk with descriptions and keywords", async () => {
    const catalogue = await loadSkillCatalogue(SKILLS_DIR);
    const names = catalogue.map((skill) => skill.name);
    assert.ok(names.includes("forms"), names.join(","));
    assert.ok(names.includes("widgets"));
    for (const skill of catalogue) {
      assert.ok(skill.description.length > 20, `${skill.name} needs a real description`);
      assert.ok(skill.match.length > 0, `${skill.name} needs match keywords`);
    }
  });

  it("ships no site-specific packs, which have to be earned", async () => {
    const catalogue = await loadSkillCatalogue(SKILLS_DIR);
    assert.deepEqual(
      catalogue.filter((skill) => skill.host),
      [],
      "host-scoped skills come from repeated traces, not from authoring",
    );
  });

  it("retrieves by keyword overlap with the objective", async () => {
    const catalogue = await loadSkillCatalogue(SKILLS_DIR);
    const hits = retrieveSkills(catalogue, {
      objective: "Set the country using the combobox on this page",
    });
    assert.equal(hits[0]?.name, "widgets", JSON.stringify(hits));
    assert.ok(hits[0]!.why.some((reason) => reason.includes("combobox")));
  });

  it("prefers a host-scoped skill when the host matches", () => {
    const catalogue: SkillMeta[] = [
      { name: "forms", description: "general forms", match: ["form"], file: "/generic/forms.md" },
      {
        name: "acme-apply",
        description: "how Acme applications behave",
        match: ["form"],
        file: "/acme.test/apply.md",
        host: "acme.test",
      },
    ];

    const onHost = retrieveSkills(catalogue, {
      objective: "fill in the form",
      url: "https://careers.acme.test/apply",
    });
    assert.equal(onHost[0]?.name, "acme-apply");

    const elsewhere = retrieveSkills(catalogue, {
      objective: "fill in the form",
      url: "https://other.test/apply",
    });
    assert.deepEqual(elsewhere.map((hit) => hit.name), ["forms"], "host skills stay on their host");
  });

  it("returns a catalogue, not the bodies", async () => {
    const catalogue = await loadSkillCatalogue(SKILLS_DIR);
    const hits = retrieveSkills(catalogue, { objective: "submit the application form" });
    const text = formatCatalogue(hits);

    assert.match(text, /forms:/);
    assert.match(text, /skill_read\("forms"\)/);
    assert.ok(text.length < 900, "the catalogue must stay small; bodies are read on demand");
    assert.equal(text.includes("Typing is not the same as the value sticking"), false);
  });

  it("reads a body only when asked", async () => {
    const catalogue = await loadSkillCatalogue(SKILLS_DIR);
    const body = await readSkillBody(catalogue, "forms");
    assert.match(body ?? "", /Native browser validation/);
    assert.equal(await readSkillBody(catalogue, "nope"), undefined);
  });

  it("says nothing when nothing applies", () => {
    assert.equal(formatCatalogue([]), "");
  });
});

describe("skill promotion", () => {
  it("needs repeated success, not one lucky run", () => {
    const promotable = promotableCandidates([
      { signature: "greenhouse-style form", successes: 1, failures: 0 },
      { signature: "virtualized country list", successes: 4, failures: 0 },
    ]);
    assert.deepEqual(promotable.map((entry) => entry.signature), ["virtualized country list"]);
  });

  it("rejects a pattern that also fails often", () => {
    const promotable = promotableCandidates([
      { signature: "flaky modal", successes: 4, failures: 4 },
      { signature: "steady form", successes: 4, failures: 1 },
    ]);
    assert.deepEqual(promotable.map((entry) => entry.signature), ["steady form"]);
  });

  it("honours a stricter threshold", () => {
    const patterns = [{ signature: "form", successes: 3, failures: 0 }];
    assert.equal(promotableCandidates(patterns).length, 1);
    assert.equal(promotableCandidates(patterns, { minSuccesses: 5 }).length, 0);
  });
});
