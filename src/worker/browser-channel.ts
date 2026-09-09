import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type BrowserChannel = "chrome" | "chromium";

export function parseBrowserChannel(value: string | undefined): BrowserChannel | undefined {
  const raw = value?.trim().toLowerCase();
  if (raw === "chrome" || raw === "chromium") return raw;
  return undefined;
}

export function resolveBrowserChannel(options: {
  explicit?: string;
  env?: NodeJS.ProcessEnv;
  fallback: BrowserChannel;
}): BrowserChannel {
  return (
    parseBrowserChannel(options.explicit) ??
    parseBrowserChannel((options.env ?? process.env).BSA_BROWSER) ??
    options.fallback
  );
}

export function playwrightChannelOption(channel: BrowserChannel): { channel: "chrome" } | Record<string, never> {
  return channel === "chrome" ? { channel: "chrome" } : {};
}

export function chromeExecutableCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string[] {
  const fromEnv = [env.BSA_CHROME_PATH, env.CHROME_PATH].filter((value): value is string => Boolean(value));
  const fromPath = chromeNamesOnPath(env, platform);
  if (platform === "darwin") {
    return [
      ...fromEnv,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      ...fromPath,
    ];
  }
  if (platform === "win32") {
    return [
      ...fromEnv,
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
      env["PROGRAMFILES(X86)"] && path.join(env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
      ...fromPath,
    ].filter((value): value is string => Boolean(value));
  }
  return [
    ...fromEnv,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    ...fromPath,
  ];
}

export async function chromeExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): Promise<string | null> {
  for (const candidate of chromeExecutableCandidates(env, platform, home)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next known location
    }
  }
  return null;
}

export function isMissingChromeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /distribution ['"]chrome['"] is not found|chrome.*is not found/i.test(message);
}

function chromeNamesOnPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const pathEnv = env.PATH ?? env.Path ?? "";
  const names =
    platform === "win32" ? ["chrome.exe", "google-chrome.exe"] : ["google-chrome-stable", "google-chrome"];
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const out: string[] = [];
  for (const dir of dirs) {
    for (const name of names) {
      out.push(path.join(dir, name));
    }
  }
  return out;
}
