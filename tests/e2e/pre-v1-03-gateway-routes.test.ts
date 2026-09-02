import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const API_PREFIXES = ["/auth", "/me", "/pair", "/devices", "/chat", "/node", "/healthz"];

describe("PRE-03-T01 gateway API prefixes", () => {
  it("sends account and pairing HTTP to the API, not the static UI", async () => {
    const gateway = await readFile(path.join(ROOT, "deploy/vibed/gateway.conf"), "utf8");
    const vibed = await readFile(path.join(ROOT, "deploy/vibed/vibed-infra-config.yml"), "utf8");
    const compose = await readFile(path.join(ROOT, "deploy/docker/compose.vps.yml"), "utf8");

    for (const prefix of API_PREFIXES) {
      assert.match(gateway, new RegExp(`location ${prefix.replace("/", "\\/")}\\b`));
      assert.match(vibed, new RegExp(`prefix: ${prefix.replace("/", "\\/")}\\b`));
    }
    assert.match(gateway, /proxy_pass http:\/\/api:8787/);
    assert.match(gateway, /location \/ \{\s*proxy_pass http:\/\/ui:80;/s);
    assert.match(gateway, /Upgrade \$http_upgrade/);
    assert.match(gateway, /proxy_send_timeout 3600s/);
    assert.match(gateway, /proxy_buffering off/);
    assert.match(gateway, /\$http_x_forwarded_proto/);
    assert.match(gateway, /X-Forwarded-Proto \$forwarded_proto/);
    assert.doesNotMatch(gateway, /proxy_set_header X-Forwarded-Proto \$scheme;/);
    assert.match(compose, /ui:/);
    assert.match(compose, /api:/);
    assert.match(compose, /gateway:/);
    assert.match(compose, /gateway\.conf/);
  });
});
