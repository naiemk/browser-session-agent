import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseControls,
  controlKey,
  diffControls,
  duplicateKeyCount,
} from "../../src/core/diff.ts";
import type { Control } from "../../src/core/types.ts";

/**
 * The page delta decides whether an action did anything, so a delta that cannot tell two
 * controls apart does not merely lose detail: it reports a working click as a noop and
 * sends the agent off to find another route.
 */

function control(partial: Partial<Control> & { name: string; role: string }): Control {
  return { ref: "e0", tag: "input", ...partial };
}

function checkboxes(count: number, checkedIndex?: number): Control[] {
  return Array.from({ length: count }, (_, index) =>
    control({
      ref: `e${index + 1}`,
      role: "checkbox",
      name: "Select",
      checked: index === checkedIndex,
    }),
  );
}

describe("control keys", () => {
  it("separates controls that share a role and name", () => {
    const rows = checkboxes(3);
    const keys = new Set(rows.map((row, index) => controlKey(row, index)));
    assert.equal(keys.size, 3);
  });

  it("leaves the first occurrence unsuffixed, so ordinary keys stay readable", () => {
    assert.equal(controlKey(control({ role: "button", name: "Save" }), 0), "button:Save");
  });

  it("discriminates links by destination before falling back to position", () => {
    const ada = control({ role: "link", name: "Profile", href: "https://x.test/p/ada" });
    const bob = control({ role: "link", name: "Profile", href: "https://x.test/p/bob" });
    assert.notEqual(controlKey(ada, 0), controlKey(bob, 0));
    assert.equal(duplicateKeyCount([ada, bob]), 0);
  });

  it("counts controls a name-only key would have collapsed", () => {
    assert.equal(duplicateKeyCount(checkboxes(50)), 50);
    assert.equal(duplicateKeyCount([control({ role: "button", name: "Save" })]), 0);
  });
});

describe("the page delta on repeated controls", () => {
  it("sees one checkbox change among fifty identical ones", () => {
    // This is the regression. Keyed on role:name alone, the Map kept the last checkbox,
    // the comparison was that survivor against itself, and the change vanished.
    const changes = diffControls(checkboxes(50), checkboxes(50, 2));
    assert.equal(changes.length, 1, JSON.stringify(changes));
    assert.match(changes[0]!, /checked changed on "Select"/);
    assert.match(changes[0]!, /#3/, "and says which row, since they are otherwise alike");
  });

  it("sees rows appended to a list of identically labelled controls", () => {
    const changes = diffControls(checkboxes(3), checkboxes(6));
    assert.equal(changes.length, 3, JSON.stringify(changes));
    assert.ok(changes.every((change) => change.startsWith("added")));
  });

  it("sees rows removed", () => {
    const changes = diffControls(checkboxes(6), checkboxes(3));
    assert.equal(changes.length, 3, JSON.stringify(changes));
    assert.ok(changes.every((change) => change.startsWith("removed")));
  });

  it("still reports nothing when nothing changed", () => {
    assert.deepEqual(diffControls(checkboxes(50), checkboxes(50)), []);
  });

  it("keeps behaving on distinctly named controls", () => {
    const before = [
      control({ ref: "e1", role: "textbox", name: "Email", value: "" }),
      control({ ref: "e2", role: "button", name: "Submit" }),
    ];
    const after = [
      control({ ref: "e1", role: "textbox", name: "Email", value: "ada@example.com" }),
      control({ ref: "e2", role: "button", name: "Submit" }),
    ];
    assert.deepEqual(diffControls(before, after), ['value changed on "Email"']);
  });
});

describe("choosing which controls get the slots", () => {
  const nav = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      control({ ref: `n${index}`, role: "link", name: `Nav ${index}`, chrome: true }),
    );
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      control({ ref: `r${index}`, role: "link", name: `Row ${index}` }),
    );

  it("gives up the furniture before the content", () => {
    const kept = chooseControls([...nav(20), ...rows(20)], 20);
    assert.equal(kept.filter((c) => !c.chrome).length, 20, "every row survives");
    assert.equal(kept.filter((c) => c.chrome).length, 0);
  });

  it("never drops an editor or a required field, however crowded the page", () => {
    const email = control({ ref: "e1", role: "textbox", name: "Email" });
    const consent = control({ ref: "e2", role: "checkbox", name: "Consent", required: true });
    const kept = chooseControls([...nav(30), email, consent, ...rows(30)], 10);

    assert.ok(kept.includes(email), "losing an editor silently makes a form unfillable");
    assert.ok(kept.includes(consent));
  });

  it("leaves document order alone, so a list still reads as a list", () => {
    const all = [...nav(5), ...rows(5), ...nav(5)];
    const kept = chooseControls(all, 8);
    const order = kept.map((c) => all.indexOf(c));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it("changes nothing when everything fits", () => {
    const all = [...nav(3), ...rows(3)];
    assert.deepEqual(chooseControls(all, 40), all);
  });
});
