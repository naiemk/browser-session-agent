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
    const vibedDockerfile = await readFile(path.join(ROOT, "deploy/vibed/Dockerfile.api"), "utf8");
    const apiConfig = await readFile(path.join(ROOT, "deploy/vibed/api-config.yaml"), "utf8");
    const compose = await readFile(path.join(ROOT, "deploy/docker/compose.vps.yml"), "utf8");
    const gateway = await readFile(path.join(ROOT, "deploy/vibed/gateway.conf"), "utf8");

    assert.match(vibed, /agent\.trustless-commerce\.com/);
    assert.match(vibed, /nodes: \[\]/);
    assert.match(vibed, /role: ui/);
    assert.match(vibed, /role: api/);
    assert.match(vibed, /role: gateway/);
    assert.match(vibed, /ghcr\.io\/naiemk\/browser-session-api:latest/);
    assert.match(vibed, /\/var\/lib\/browser-session:\/data/);
    assert.match(vibed, /BSA_COOKIE_SECURE:\s*"1"/);
    assert.match(vibed, /BSA_REGISTER_OPEN:/);
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY"]) {
      assert.match(vibed, new RegExp(key));
      assert.match(compose, new RegExp(key));
    }
    assert.doesNotMatch(vibed, /role: nodes/);
    assert.doesNotMatch(vibed, /BSA_NO_PI\s*[:=]/);
    assert.doesNotMatch(vibed, /BSA_PI_FAIL/);
    assert.doesNotMatch(vibed, /npx playwright install|CHROME_PATH|PLAYWRIGHT_BROWSERS_PATH/);
    assert.doesNotMatch(apiConfig, /~\/\.pi\/agent/);
    assert.match(apiConfig, /\/var\/lib\/browser-session:\/data/);
    assert.match(apiConfig, /ghcr\.io\/naiemk\/browser-session-api:latest/);

    for (const file of [dockerfile, vibedDockerfile]) {
      assert.match(file, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1/);
      assert.match(file, /No Chromium/);
      assert.match(file, /BSA_HOME=\/data/);
      assert.match(file, /VOLUME \["\/data"\]/);
      assert.match(file, /\/healthz/);
      assert.doesNotMatch(file, /npx playwright install/);
      assert.doesNotMatch(file, /BSA_NO_PI\s*=/);
    }

    assert.match(compose, /^\s+api:/m);
    assert.match(compose, /^\s+ui:/m);
    assert.match(compose, /^\s+gateway:/m);
    assert.match(compose, /\/data/);
    assert.doesNotMatch(compose, /^\s+node:/m);
    assert.doesNotMatch(compose, /BSA_NO_PI\s*[:=]/);
    assert.match(gateway, /location \/healthz/);
    assert.match(gateway, /\$http_x_forwarded_proto/);
    assert.match(gateway, /BSA_COOKIE_SECURE|X-Forwarded-Proto \$forwarded_proto/);
  });
});
