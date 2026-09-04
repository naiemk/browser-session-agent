import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { MAX_RESULT_CHARS, probe } from "../../src/core/probe.ts";
import { REDACTION_MASK } from "../../src/core/redact.ts";
import { CoreError } from "../../src/core/types.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "probe-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

describe("AGENT-02-T01 read-only probe", () => {
  it("answers a form inventory question the snapshot does not cover", async () => {
    const tab = await browser.openTab(`${origin}/once`);
    const result = await probe(browser.pageFor(tab), { kind: "form_inventory" });

    const forms = (
      result.data as {
        forms: Array<{
          fields: Array<{ name?: string; field?: string; required?: boolean }>;
          submits: string[];
        }>;
      }
    ).forms;
    assert.equal(forms.length, 1);
    const required = forms[0]!.fields.filter((field) => field.required);

    // Both the human label and the wire name matter: one to find it, one to fill it.
    assert.deepEqual(required.map((field) => field.name).sort(), ["Message", "Recipient"]);
    assert.deepEqual(required.map((field) => field.field).sort(), ["message", "recipient"]);
    assert.ok(forms[0]!.submits.some((label) => label.includes("Send invitation")));
  });

  it("reads select options, which the snapshot summarises away", async () => {
    const tab = await browser.openTab(`${origin}/tmpl-a`);
    const result = await probe(browser.pageFor(tab), {
      kind: "elements",
      select: "select",
      fields: ["name", "options"],
    });
    const elements = (result.data as { elements: Array<{ name?: string; options?: Array<{ value: string; label: string }> }> }).elements;
    const values = elements[0]?.options?.map((option) => option.value);
    assert.deepEqual(values, ["", "yes", "no"]);
  });

  it("counts and lists without touching the page", async () => {
    const tab = await browser.openTab(`${origin}/list`);
    const before = await browser.observe(tab);
    const beforeValues = before.controls.map((control) => `${control.ref}:${control.value ?? ""}`);

    const count = await probe(browser.pageFor(tab), { kind: "count", select: "li button" });
    assert.equal((count.data as { count: number }).count, 10);

    const meta = await probe(browser.pageFor(tab), { kind: "page_meta" });
    assert.equal((meta.data as { url: string }).url, `${origin}/list`);

    const after = await browser.observe(tab);
    assert.equal(after.url, before.url, "a probe must not navigate");
    assert.deepEqual(
      after.controls.map((control) => `${control.ref}:${control.value ?? ""}`),
      beforeValues,
      "a probe must not change any control",
    );
    assert.deepEqual(after.changes, [], "a probe must produce no observable delta");
  });

  it("cannot reach cookies, storage, or headers by any query", async () => {
    const tab = await browser.openTab(`${origin}/secrets`);
    const page = browser.pageFor(tab);

    // The page really does hold these, so the guarantee is about the probe surface.
    const cookieLength = await page.evaluate("document.cookie.length");
    assert.ok((cookieLength as number) > 0, "fixture must actually set a cookie");

    for (const query of [{ kind: "cookies" }, { kind: "storage" }, { kind: "headers" }]) {
      await assert.rejects(
        () => probe(page, query),
        (err: unknown) => err instanceof CoreError && err.code === "probe_rejected",
      );
    }

    // Even the broadest allowed reads must not surface the secrets.
    const text = await probe(page, { kind: "text" });
    const elements = await probe(page, {
      kind: "elements",
      select: "input",
      fields: ["name", "value", "type"],
    });
    const blob = JSON.stringify([text.data, elements.data]);
    assert.equal(blob.includes("deadbeefdeadbeefdeadbeefdeadbeef"), false, "cookie value leaked");
    assert.equal(blob.includes("sk-storedkeyabcdefghijklmnopqrst"), false, "localStorage value leaked");
    assert.equal(blob.includes("hunter2"), false, "password value leaked");
  });

  it("redacts credential-shaped text that the page shows in the open", async () => {
    const tab = await browser.openTab(`${origin}/secrets`);
    const result = await probe(browser.pageFor(tab), { kind: "text" });
    const text = JSON.stringify(result.data);
    assert.equal(text.includes("sk-livekeyabcdefghijklmnopqrstuvwx"), false);
    assert.ok(text.includes(REDACTION_MASK));
    assert.ok(text.includes("Signed in as"), "benign page text must survive");
  });

  it("truncates an oversized result and says so", async () => {
    const tab = await browser.openTab(`${origin}/list`);
    const page = browser.pageFor(tab);
    const query = { kind: "elements", select: "*", fields: ["tag", "text", "name", "role"] };

    // Budget-driven rather than fixture-size-driven, so the guarantee is deterministic.
    const tight = await probe(page, query, { maxResultChars: 200 });
    assert.equal(tight.truncated, true);
    assert.match(tight.note ?? "", /narrow the query/);
    assert.ok((tight.data as { head: string }).head.length <= 200);

    // A broad query exceeds even the default budget, which is the point of having one.
    const broad = await probe(page, query);
    assert.equal(broad.truncated, true);
    assert.ok((broad.data as { head: string }).head.length <= MAX_RESULT_CHARS);

    // A narrow query comes back whole.
    const narrow = await probe(page, { kind: "count", select: "li button" });
    assert.equal(narrow.truncated, false);
    assert.equal((narrow.data as { count: number }).count, 10);
  });

  it("records nothing itself, because evidence has one owner", async () => {
    // A probe used to append to the ledger, which put an evidence concern inside the
    // substrate and meant every new primitive had to remember to log. The primitive now
    // answers the question and the tool layer decides what is worth recording; that the
    // recording still happens is asserted in tests/e2e/runtime-situation.test.ts.
    const ledger = await Ledger.open(root, "goal_probe");
    const tab = await browser.openTab(`${origin}/apply`);

    await probe(browser.pageFor(tab), { kind: "page_meta" });
    await probe(browser.pageFor(tab), { kind: "count", select: "input" });

    assert.deepEqual(await ledger.read(), []);
  });

  it("is reachable through the port without handing out a live page", async () => {
    // The port is the seam a remote browser has to fit through, so the probe has to be
    // callable with data alone.
    const tab = await browser.openTab(`${origin}/apply`);
    const result = await browser.probe({ kind: "count", select: "input" }, tab);
    assert.ok((result.data as { count: number }).count > 0);
  });

  it("reports an invalid selector instead of silently returning nothing", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await assert.rejects(
      () => probe(browser.pageFor(tab), { kind: "count", select: "input[[[" }),
      (err: unknown) => err instanceof CoreError && err.code === "probe_failed",
    );
  });
});
