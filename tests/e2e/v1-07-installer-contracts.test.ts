import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HELPER = path.join(ROOT, "deploy", "helper");

async function read(rel: string): Promise<string> {
  return readFile(path.join(HELPER, rel), "utf8");
}

describe("V1-07-T02 installer contracts", () => {
  it("declares bsa://, login items, profile paths, and no baked secret", async () => {
    const windowsProtocol = await read("windows/bsa-protocol.reg");
    const windowsLogin = await read("windows/run-at-login.ps1");
    const macInfo = await read("macos/Info.plist");
    const macAgent = await read("macos/com.browser-session-agent.helper.plist");
    const readme = await read("README.md");

    assert.match(windowsProtocol, /\[HKEY_CURRENT_USER\\Software\\Classes\\bsa\]/);
    assert.match(windowsProtocol, /URL Protocol/);
    assert.match(windowsLogin, /CurrentVersion\\Run/);
    assert.match(windowsLogin, /APPDATA.*browser-session-agent/);

    assert.match(macInfo, /CFBundleURLSchemes/);
    assert.match(macInfo, /<string>bsa<\/string>/);
    assert.match(macAgent, /RunAtLoad/);
    assert.match(macAgent, /Library\/Application Support\/browser-session-agent/);

    assert.match(readme, /%APPDATA%\\browser-session-agent/);
    assert.match(readme, /Library\/Application Support\/browser-session-agent/);
    assert.match(readme, /bsa:\/\//);

    for (const text of [windowsProtocol, windowsLogin, macInfo, macAgent, readme]) {
      assert.doesNotMatch(text, /BSA_TOKEN\s*=/);
      assert.doesNotMatch(text, /device_token\s*=/i);
      assert.doesNotMatch(text, /BEGIN (RSA |OPENSSH )?PRIVATE KEY/);
    }
  });
});
