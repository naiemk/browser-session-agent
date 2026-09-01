import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectCountryUnitedStates } from "../../src/plan/examples.ts";
import { interpretPagePlan } from "../../src/plan/interpret.ts";
import { validatePagePlan } from "../../src/plan/validate.ts";
import { PLAN_LIMITS, type PlanRuntime, type PlanWorld, type Step, type StepResult, type Target } from "../../src/plan/types.ts";

type Mode = "united-states-first" | "usa-only" | "scroll-only" | "none";

class CountryComboboxRuntime implements PlanRuntime {
  url = "https://jobs.example.test/combobox";
  title = "Apply";
  open = false;
  filter = "";
  value = "";
  scroll = 0;
  readonly list = [
    "Albania",
    "Belgium",
    "Canada",
    "Denmark",
    "Egypt",
    "France",
    "Germany",
    "United States of America",
    "United States",
    "USA",
  ];

  constructor(private readonly mode: Mode) {}

  world(): PlanWorld {
    return {
      url: this.url,
      title: this.title,
      pageText: [this.value, ...this.visible()].join("\n"),
    };
  }

  resolve(target: Target): string | null {
    if (target.by === "label" && /country/i.test(target.label)) return "country";
    if (target.by === "ref" && target.ref === "country") return "country";
    if (target.by === "text") {
      const hit = pickVisible(this.visible(), target.text, target.exact);
      if (hit) return `opt:${hit}`;
    }
    return null;
  }

  readValue(target: Target): string | undefined {
    if (this.resolve(target) === "country") return this.value;
    return undefined;
  }

  inspect(): void {}

  act(step: Exclude<Step, { op: "scroll_until" | "wait" }>): StepResult {
    if (step.op === "click") {
      const id = this.resolve(step.target);
      if (!id) return { ok: false, detail: `no target ${JSON.stringify(step.target)}` };
      if (id === "country") {
        this.open = true;
        return { ok: true, detail: "opened country" };
      }
      if (id.startsWith("opt:")) {
        const name = id.slice(4);
        if (!this.visible().includes(name)) return { ok: false, detail: "option gone" };
        this.value = name;
        this.open = false;
        this.filter = "";
        return { ok: true, detail: `selected ${name}` };
      }
    }
    if (step.op === "type") {
      if (this.resolve(step.target) !== "country") return { ok: false, detail: "not country" };
      this.open = true;
      this.filter = step.clear ? step.text : `${this.filter}${step.text}`;
      return { ok: true, detail: `typed ${step.text}` };
    }
    if (step.op === "clear") {
      if (this.resolve(step.target) !== "country") return { ok: false, detail: "not country" };
      this.filter = "";
      return { ok: true, detail: "cleared" };
    }
    if (step.op === "scroll") {
      this.open = true;
      this.scroll += 1;
      return { ok: true, detail: `scrolled ${this.scroll}` };
    }
    return { ok: false, detail: `unsupported ${step.op}` };
  }

  private visible(): string[] {
    if (!this.open || this.mode === "none") return [];
    if (this.filter) {
      if (this.mode === "scroll-only") return [];
      const hits = this.list.filter((o) => o.toLowerCase().includes(this.filter.toLowerCase()));
      if (this.mode === "usa-only") return hits.filter((o) => o === "USA");
      return hits;
    }
    const start = Math.min(this.scroll, this.list.length - 1);
    return this.list.slice(start, start + 2);
  }
}

function pickVisible(visible: string[], needle: string, exact?: boolean): string | undefined {
  if (exact) return visible.find((o) => o === needle);
  return visible.find((o) => o === needle) ?? visible.find((o) => o.toLowerCase().includes(needle.toLowerCase()));
}

describe("page plan validation", () => {
  it("accepts the country example", () => {
    const plan = validatePagePlan(selectCountryUnitedStates);
    assert.equal(plan.actions[0]?.try.length, 3);
  });

  it("rejects Playwright-shaped scripts", () => {
    assert.throws(
      () =>
        validatePagePlan({
          context: { understanding: "x" },
          goal: "x",
          actions: [
            {
              id: "a",
              intent: "x",
              try: [
                {
                  name: "js",
                  steps: [{ op: "evaluate", script: "page.click('div')" }],
                  successWhen: { kind: "text_visible", text: "ok" },
                },
              ],
            },
          ],
        }),
      /unknown op/,
    );
  });

  it("rejects oversized plans", () => {
    const actions = Array.from({ length: PLAN_LIMITS.maxActions + 1 }, (_, i) => ({
      id: `a${i}`,
      intent: "x",
      try: [{ name: "t", steps: [{ op: "click", target: { by: "ref", ref: "e1" } }], successWhen: { kind: "text_visible", text: "x" } }],
    }));
    assert.throws(
      () => validatePagePlan({ context: { understanding: "x" }, goal: "x", actions }),
      /at most/,
    );
  });
});

describe("country path program", () => {
  it("selects United States on the first attempt", async () => {
    const runtime = new CountryComboboxRuntime("united-states-first");
    const result = await interpretPagePlan(selectCountryUnitedStates, runtime);
    assert.equal(result.status, "completed");
    assert.equal(runtime.value, "United States");
    assert.match(result.actuals.join("\n"), /type_united_states: accepted/);
    assert.ok(!result.actuals.some((line) => line.includes("type_usa:")));
  });

  it("falls back to USA when the full name is missing", async () => {
    const runtime = new CountryComboboxRuntime("usa-only");
    const result = await interpretPagePlan(selectCountryUnitedStates, runtime);
    assert.equal(result.status, "completed");
    assert.equal(runtime.value, "USA");
    assert.match(result.actuals.join("\n"), /type_united_states: not yet/);
    assert.match(result.actuals.join("\n"), /type_usa: accepted/);
  });

  it("scrolls the open list when typing does not filter", async () => {
    const runtime = new CountryComboboxRuntime("scroll-only");
    const result = await interpretPagePlan(selectCountryUnitedStates, runtime);
    assert.equal(result.status, "completed");
    assert.equal(runtime.value, "United States of America");
    assert.match(result.actuals.join("\n"), /scroll_known_labels: accepted/);
    assert.ok(runtime.scroll >= 3);
  });

  it("escalates with actuals when every branch misses", async () => {
    const runtime = new CountryComboboxRuntime("none");
    const result = await interpretPagePlan(selectCountryUnitedStates, runtime);
    assert.equal(result.status, "escalated");
    assert.equal(result.failedActionId, "select_country");
    assert.match(result.escalateReason ?? "", /all attempts failed/);
    assert.match(result.actuals.join("\n"), /type_united_states/);
    assert.match(result.actuals.join("\n"), /scroll_until gave up/);
    assert.equal(runtime.value, "");
  });

  it("escalates if the page leaves the context hint", async () => {
    const runtime = new CountryComboboxRuntime("united-states-first");
    runtime.url = "https://jobs.example.test/login";
    const result = await interpretPagePlan(selectCountryUnitedStates, runtime);
    assert.equal(result.status, "escalated");
    assert.match(result.escalateReason ?? "", /no longer matches/);
  });

  it("streams progress for the chat surface", async () => {
    const runtime = new CountryComboboxRuntime("usa-only");
    const kinds: string[] = [];
    await interpretPagePlan(selectCountryUnitedStates, runtime, {
      onProgress: (event) => kinds.push(event.type),
    });
    for (const kind of ["action_start", "attempt_start", "step", "attempt_result", "action_done", "plan_done"]) {
      assert.ok(kinds.includes(kind), `missing ${kind}`);
    }
  });
});
