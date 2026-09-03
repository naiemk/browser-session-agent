import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_NODE_MAJOR = 22;
const PI_PACKAGE = path.join("@earendil-works", "pi-coding-agent", "dist", "cli.js");

export const LOCAL_CLI_FLAGS = ["--no-builtin-tools", "--no-skills", "--no-context-files"] as const;

export function repoRootFrom(moduleUrl: string): string {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "..");
}

export function extensionPath(root: string): string {
  return path.join(root, "src", "extension.ts");
}

export function piEntryPath(root: string): string {
  return path.join(root, "node_modules", ...PI_PACKAGE.split(path.sep));
}

export function hasFlag(args: string[], ...names: string[]): boolean {
  return names.some((name) => args.includes(name));
}

export function takeHeadless(args: string[]): { args: string[]; headless: boolean } {
  const headless = hasFlag(args, "--headless") || process.env.BSA_HEADLESS === "1";
  return { args: args.filter((arg) => arg !== "--headless"), headless };
}

export function buildPiArgs(extension: string, extra: string[] = []): string[] {
  const args: string[] = [];
  if (!hasFlag(extra, "-e", "--extension")) {
    args.push("-e", extension);
  }
  if (!hasFlag(extra, "--no-builtin-tools", "-nbt")) {
    args.push("--no-builtin-tools");
  }
  if (!hasFlag(extra, "--no-skills", "-ns")) {
    args.push("--no-skills");
  }
  if (!hasFlag(extra, "--no-context-files", "-nc")) {
    args.push("--no-context-files");
  }
  args.push(...extra);
  return args;
}

export function helpText(): string {
  return `browser-session-agent local CLI

Launch the Pi TUI on this machine with the browser operator extension.
Chromium runs here. Nothing talks to the VPS or hosted UI.

  npm install
  npx playwright install chromium
  npm run cli

In Pi:
  /login                 once (OpenRouter, Anthropic, OpenAI, or ChatGPT)
  /browser-start <goal>  open the persistent profile and start a run

Commands:
  npm run cli                 interactive TUI
  npm run cli -- --check      verify Node, Pi, extension, and Chromium
  npm run cli -- --headless   headed off (BSA_HEADLESS=1)
  npm run cli -- [pi args]    forwarded to Pi (e.g. --print, --model)

For the chat UI on this machine instead of the TUI, use npm run web.
The hosted VPS path stays UI-only for production.
Do not run npm run web against the same profile while the CLI is open.
`;
}

export type CheckItem = {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
};

export async function chromiumExecutable(): Promise<string | null> {
  try {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    await access(exe);
    return exe;
  } catch {
    return null;
  }
}

export function nodeMajor(version = process.versions.node): number {
  return Number(version.split(".")[0]);
}

function providerHint(): string {
  const keys = [
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "AI_GATEWAY_API_KEY",
  ];
  const found = keys.filter((key) => Boolean(process.env[key]));
  if (found.length > 0) return `env ${found.join(", ")}`;
  return "none in env — use /login in the TUI";
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function collectChecks(root: string): Promise<CheckItem[]> {
  const nodeOk = nodeMajor() >= MIN_NODE_MAJOR;
  const pi = piEntryPath(root);
  const extension = extensionPath(root);
  const chrome = await chromiumExecutable();
  return [
    {
      name: "node",
      ok: nodeOk,
      required: true,
      detail: nodeOk ? process.versions.node : `${process.versions.node} (need >=${MIN_NODE_MAJOR})`,
    },
    {
      name: "pi",
      ok: await exists(pi),
      required: true,
      detail: (await exists(pi)) ? pi : "missing — run npm install",
    },
    {
      name: "extension",
      ok: await exists(extension),
      required: true,
      detail: extension,
    },
    {
      name: "chromium",
      ok: Boolean(chrome),
      required: true,
      detail: chrome ?? "missing — run: npx playwright install chromium",
    },
    {
      name: "model",
      ok: true,
      required: false,
      detail: providerHint(),
    },
  ];
}

export function formatChecks(items: CheckItem[]): string {
  return items
    .map((item) => {
      const mark = item.ok ? "ok  " : "FAIL";
      return `${mark}  ${item.name.padEnd(10)} ${item.detail}`;
    })
    .join("\n");
}

export function checksFailed(items: CheckItem[]): boolean {
  return items.some((item) => item.required && !item.ok);
}
