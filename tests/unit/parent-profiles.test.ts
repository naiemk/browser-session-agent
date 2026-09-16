import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadShippedModelPins, pinError } from "../../src/host/pi-models.ts";
import {
  applyProfile,
  detectAuthProviders,
  formatRecommend,
  profilePins,
  recommendProfile,
  runProfilesCommand,
} from "../../src/host/parent-profiles.ts";

const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true });
  }
});

describe("PARENT-01-T05 cost profiles", () => {
  it("applying budget writes the packaged models.json, including coder", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "bsa-profiles-"));
    homes.push(home);
    const result = await applyProfile("budget", { root: home });
    assert.equal(result.ok, true, result.message);
    const shipped = loadShippedModelPins();
    const pins = JSON.parse(await readFile(path.join(home, "models.json"), "utf8")) as {
      default: string;
      plan: string;
      coach: string;
      coder: string;
    };
    assert.deepEqual(pins, shipped);
    assert.deepEqual(profilePins("budget"), shipped);
    assert.equal(pinError(pins.coder), undefined);
  });

  it("recommend with only OpenRouter env mocked suggests budget", async () => {
    const auth = await detectAuthProviders({
      OPENROUTER_API_KEY: "sk-or-test-not-real",
      PATH: "/usr/bin",
    });
    assert.deepEqual(auth.providers, ["openrouter"]);
    const rec = recommendProfile(auth);
    assert.equal(rec.name, "budget");
    const text = formatRecommend(auth, rec);
    assert.doesNotMatch(text, /sk-/);
    assert.doesNotMatch(text, /or-v1-/);
    assert.match(text, /recommend: budget/);
    assert.doesNotMatch(text, /anthropic/);
  });

  it("rejects @ultra as a pin via existing pinError", () => {
    assert.match(pinError("@ultra") ?? "", /floor/i);
  });

  it("does not apply grok without xAI auth", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "bsa-profiles-"));
    homes.push(home);
    const result = await applyProfile("grok", {
      root: home,
      auth: { providers: ["openrouter"], sources: ["env:openrouter"] },
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /xAI/i);
  });

  it("runProfilesCommand list / apply --force grok", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "bsa-profiles-"));
    homes.push(home);
    const listed = await runProfilesCommand(["list"], { root: home });
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /budget:/);
    assert.match(listed.stdout, /coder=/);
    const applied = await runProfilesCommand(["apply", "budget"], {
      root: home,
      env: { OPENROUTER_API_KEY: "sk-or-test" },
    });
    assert.equal(applied.code, 0, applied.stderr);
    assert.match(applied.stdout, /applied profile budget/);
  });
});
