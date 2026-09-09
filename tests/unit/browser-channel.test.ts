import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROWSER_LAUNCH_ID,
  chromeExecutableCandidates,
  isMissingChromeError,
  needsNoSandbox,
  persistentContextArgs,
  playwrightLaunchOverrides,
  resolveBrowserChannel,
  shouldReuseAttachedBrowser,
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
    const chrome = playwrightLaunchOverrides("chrome");
    assert.equal(chrome.channel, "chrome");
    assert.ok(chrome.ignoreDefaultArgs?.includes("--enable-automation"));
    assert.ok(chrome.ignoreDefaultArgs?.includes("--disable-sync"));
    assert.ok(chrome.extraArgs?.includes("--disable-blink-features=AutomationControlled"));
    assert.deepEqual(playwrightLaunchOverrides("chromium"), {});
  });

  it("does not reconnect to a previous session launched as a different browser", () => {
    const wanted = { browser: "chrome" as const, launch: BROWSER_LAUNCH_ID };
    assert.equal(shouldReuseAttachedBrowser({ browser: "chrome", launch: BROWSER_LAUNCH_ID }, wanted), true);
    assert.equal(shouldReuseAttachedBrowser({ browser: "chromium", launch: BROWSER_LAUNCH_ID }, wanted), false);
    assert.equal(shouldReuseAttachedBrowser({ browser: "chrome" }, wanted), false);
    assert.equal(shouldReuseAttachedBrowser({}, wanted), false);
    assert.equal(shouldReuseAttachedBrowser(null, { browser: "chromium", launch: BROWSER_LAUNCH_ID }), false);
  });

  it("passes --no-sandbox only on Linux or when BSA_NO_SANDBOX is set", () => {
    assert.equal(needsNoSandbox({}, "darwin"), false);
    assert.equal(needsNoSandbox({}, "win32"), false);
    assert.equal(needsNoSandbox({}, "linux"), true);
    assert.equal(needsNoSandbox({ BSA_NO_SANDBOX: "1" }, "darwin"), true);
    assert.equal(
      persistentContextArgs({ port: 9, noSandbox: false }).includes("--no-sandbox"),
      false,
    );
    assert.equal(persistentContextArgs({ port: 9, noSandbox: true }).includes("--no-sandbox"), true);
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
