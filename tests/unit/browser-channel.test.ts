import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chromeExecutableCandidates,
  isMissingChromeError,
  playwrightChannelOption,
  resolveBrowserChannel,
} from "../../src/worker/browser-channel.ts";

describe("browser channel", () => {
  it("defaults to Chromium for tests and CI unless BSA_BROWSER or an explicit channel is set", () => {
    assert.equal(resolveBrowserChannel({ env: {}, fallback: "chromium" }), "chromium");
    assert.equal(
      resolveBrowserChannel({ env: { BSA_BROWSER: "chrome" }, fallback: "chromium" }),
      "chrome",
    );
    assert.equal(
      resolveBrowserChannel({ explicit: "chromium", env: { BSA_BROWSER: "chrome" }, fallback: "chrome" }),
      "chromium",
    );
  });

  it("only passes Playwright's chrome channel when launching installed Chrome", () => {
    assert.deepEqual(playwrightChannelOption("chrome"), { channel: "chrome" });
    assert.deepEqual(playwrightChannelOption("chromium"), {});
  });

  it("looks for Google Chrome, not Chromium, in the usual install locations", () => {
    const mac = chromeExecutableCandidates({}, "darwin", "/Users/me");
    assert.ok(mac.includes("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
    assert.equal(mac.some((item) => /Chromium/.test(item)), false);

    const linux = chromeExecutableCandidates({}, "linux");
    assert.ok(linux.includes("/usr/bin/google-chrome-stable"));
    assert.equal(linux.some((item) => /chromium/.test(item)), false);
  });

  it("recognizes Playwright's missing Chrome distribution error", () => {
    assert.equal(
      isMissingChromeError(new Error("Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome")),
      true,
    );
    assert.equal(isMissingChromeError(new Error("Target closed")), false);
  });
});
