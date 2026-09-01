import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("PRE-06-T01 vibed-infra host + no Chromium on API", () => {
  it("packs ui+api+gateway for agent.trustless-commerce.com without Playwright on the API", async () => {
    const vibed = await readFile(path.join(ROOT, "deploy/vibed/vibed-infra-config.yml"), "utf8");
    const dockerfile = await readFile(path.join(ROOT, "deploy/docker/Dockerfile.api"), "utf8");
    const compose = await readFile(path.join(ROOT, "deploy/docker/compose.vps.yml"), "utf8");
    const gateway = await readFile(path.join(ROOT, "deploy/vibed/gateway.conf"), "utf8");

    assert.match(vibed, /agent\.trustless-commerce\.com/);
    assert.match(vibed, /nodes: \[\]/);
    assert.match(vibed, /role: ui/);
    assert.match(vibed, /role: api/);
    assert.match(vibed, /role: gateway/);
    assert.doesNotMatch(vibed, /role: nodes/);
    assert.doesNotMatch(vibed, /BSA_NO_PI\s*[:=]/);
    assert.doesNotMatch(vibed, /npx playwright install|CHROME_PATH|PLAYWRIGHT_BROWSERS_PATH/);

    assert.match(dockerfile, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1/);
    assert.match(dockerfile, /npm uninstall playwright/);
    assert.match(dockerfile, /No Chromium/);
    assert.doesNotMatch(dockerfile, /npx playwright install/);
    assert.doesNotMatch(dockerfile, /BSA_NO_PI\s*=/);

    assert.match(compose, /^\s+api:/m);
    assert.match(compose, /^\s+ui:/m);
    assert.match(compose, /^\s+gateway:/m);
    assert.doesNotMatch(compose, /^\s+node:/m);
    assert.match(dockerfile, /\/healthz/);
    assert.match(gateway, /location \/healthz/);
  });
});
