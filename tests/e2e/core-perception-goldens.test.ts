import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { LocalBrowser } from "../../src/core/browser.ts";
import { leanPerceiver } from "../../src/core/perception/index.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/perception");

const PAGES = ["modal-list", "nav-shell", "nested-cards", "crowded"] as const;

describe("lean perception goldens", () => {
  const server = new FixtureServer();
  let origin = "";
  let browser: LocalBrowser;

  before(async () => {
    origin = await server.start();
    browser = await LocalBrowser.launch({ headless: true, perceiver: leanPerceiver });
  });

  after(async () => {
    await browser.close();
    await server.stop();
  });

  for (const name of PAGES) {
    it(`still offers what ${name}.json recorded`, async () => {
      const golden = JSON.parse(await readFile(path.join(GOLDEN_DIR, `${name}.json`), "utf8")) as {
        totalControls: number;
        offered: number;
        dropped: { occlusion?: number; containment?: number };
        controls: Array<{ name: string; role: string }>;
      };
      const tab = await browser.openTab(`${origin}/${name}`);
      const observation = await browser.observe(tab);
      await browser.closeTab(tab);

      assert.equal(observation.totalControls, golden.totalControls);
      assert.equal(observation.controls.length, golden.offered);
      assert.equal(observation.perception?.dropped.occlusion ?? 0, golden.dropped.occlusion ?? 0);
      assert.equal(observation.perception?.dropped.containment ?? 0, golden.dropped.containment ?? 0);
      assert.deepEqual(
        observation.controls.map((control) => `${control.role}:${control.name}`),
        golden.controls.map((control) => `${control.role}:${control.name}`),
      );
    });
  }
});
