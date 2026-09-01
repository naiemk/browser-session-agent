import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { closeV1, startV1Api, type V1World } from "../helpers/v1.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-04 wget desktop install", () => {
  it("serves install.sh / install.ps1 as plain text with setup + pair, no baked secret", async () => {
    const sh = await readFile(path.join(ROOT, "src/hosts/web/public/install.sh"), "utf8");
    const ps1 = await readFile(path.join(ROOT, "src/hosts/web/public/install.ps1"), "utf8");
    const ui = await readFile(path.join(ROOT, "src/hosts/web/public/app.js"), "utf8");
    const nginx = await readFile(path.join(ROOT, "deploy/vibed/nginx-ui.conf"), "utf8");

    assert.match(sh, /^#!/);
    assert.match(sh, /wget -qO-/);
    assert.match(sh, /BSA_PAIR_CODE/);
    assert.match(sh, /nodejs\.org\/dist/);
    assert.match(sh, /playwright install chromium/);
    assert.match(sh, /docker pull|docker run/);
    assert.match(sh, /ghcr\.io\/naiemk\/browser-session-node/);
    assert.doesNotMatch(sh, /BSA_TOKEN=/);
    assert.doesNotMatch(sh, /device_token\s*=/i);
    assert.doesNotMatch(sh, /BEGIN (RSA |OPENSSH )?PRIVATE KEY/);

    assert.match(ps1, /BSA_PAIR_CODE/);
    assert.match(ps1, /nodejs\.org\/dist/);
    assert.match(ps1, /playwright install chromium/);
    assert.match(ps1, /Invoke-WebRequest/);
    assert.doesNotMatch(ps1, /BSA_TOKEN\s*=/);

    assert.match(ui, /wget -qO-/);
    assert.match(ui, /install\.sh/);
    assert.match(ui, /install\.ps1/);
    assert.doesNotMatch(ui, /scripts\/run-desktop-node\.sh/);

    assert.match(nginx, /location = \/install\.sh/);
    assert.match(nginx, /location = \/install\.ps1/);

    const syntax = spawnSync("bash", ["-n", path.join(ROOT, "src/hosts/web/public/install.sh")], {
      encoding: "utf8",
    });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

    const world = await startV1Api({ requirePaid: false });
    worlds.push(world);
    const res = await fetch(`${world.origin}/install.sh`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    const body = await res.text();
    assert.match(body, /BSA_PAIR_CODE/);
    assert.match(body, /playwright install chromium/);

    const win = await fetch(`${world.origin}/install.ps1`);
    assert.equal(win.status, 200);
    assert.match(await win.text(), /playwright install chromium/);
  });
});
