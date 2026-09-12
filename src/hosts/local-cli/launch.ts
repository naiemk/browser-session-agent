import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadsModelAuto,
  modelAutoExtensionPath,
  piCliPath,
  rewriteArgvModelFlag,
} from "../../host/pi-subagent/spawn.ts";
import {
  chromeExecutable,
  resolveBrowserChannel,
  type BrowserChannel,
} from "../../worker/browser-channel.ts";

const MIN_NODE_MAJOR = 22;

export const LOCAL_CLI_FLAGS = ["--no-builtin-tools", "--no-skills", "--no-context-files"] as const;

export function repoRootFrom(moduleUrl: string): string {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "..");
}

export function extensionPath(root: string): string {
  return path.join(root, "src", "extension.ts");
}

export function piEntryPath(root: string): string {
  return piCliPath(root);
}

export function hasFlag(args: string[], ...names: string[]): boolean {
  return names.some((name) => args.includes(name));
}

export function takeLaunchFlags(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): { args: string[]; headless: boolean; browser: BrowserChannel } {
  const headless = hasFlag(args, "--headless") || env.BSA_HEADLESS === "1";
  const explicit = hasFlag(args, "--chromium") ? "chromium" : undefined;
  return {
    args: args.filter((arg) => arg !== "--headless" && arg !== "--chromium"),
    headless,
    browser: resolveBrowserChannel({ explicit, env, fallback: "chrome" }),
  };
}

export function takeHeadless(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): { args: string[]; headless: boolean } {
  const taken = takeLaunchFlags(args, env);
  return { args: taken.args, headless: taken.headless };
}

function extraExtensionPaths(extra: string[]): string[] {
  const paths: string[] = [];
  for (let i = 0; i < extra.length; i++) {
    if ((extra[i] === "-e" || extra[i] === "--extension") && extra[i + 1]) {
      paths.push(extra[++i]!);
    }
  }
  return paths;
}

/**
 * Browser extension plus pi-model-auto. `@ultra` is a first-turn prefix, not a
 * `--model` id; without the router Pi prints "Model not found" at TUI start.
 */
export function buildPiArgs(extension: string, extra: string[] = []): string[] {
  const args: string[] = [];
  if (!hasFlag(extra, "-e", "--extension")) {
    args.push("-e", extension);
  }
  const extraExts = extraExtensionPaths(extra);
  const modelAuto = modelAutoExtensionPath();
  if (modelAuto && !loadsModelAuto(extraExts)) {
    args.push("-e", modelAuto);
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
  const routerExts = [...extraExts, ...(modelAuto ? [modelAuto] : [])];
  args.push(...rewriteArgvModelFlag(extra, routerExts));
  return args;
}

export function helpText(): string {
  return `magpie local CLI

Launch the Pi TUI on this machine with the browser operator extension.
Google Chrome runs here by default. Nothing talks to the VPS or hosted UI.

  npm install -g magpie
  magpie

In Pi:
  /login                 once (OpenRouter, Anthropic, OpenAI, or ChatGPT)
  /browser-start <goal>  open the persistent profile and start a run

Commands:
  magpie                      interactive TUI (installed Chrome)
  magpie --chromium           Playwright Chromium instead of Chrome
  magpie --check               verify Node, Pi, extension, and the selected browser
  magpie --headless            headed off (BSA_HEADLESS=1)
  magpie --json [--name …] [--plan-file plan.md | @plan.md] [objective]
                              parent start: print {session_id,goal_id,state} and exit
                              (no Chrome; session under ~/.browser-agent-core/pi-sessions)
                              Grok Bot override: --session-dir /workspace/magpie/sessions
  magpie --json --session <id>
                              parent status of an existing Magpie session
  magpie --session <id> -p …  resume the same Pi session (forwards to Pi)
  magpie [pi args]            forwarded to Pi (e.g. --print, --model)

From a git checkout, npm run cli is the same command.
Use npm run cli -- --chromium for Playwright Chromium.
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

export async function collectChecks(
  root: string,
  options: { browser?: BrowserChannel } = {},
): Promise<CheckItem[]> {
  const nodeOk = nodeMajor() >= MIN_NODE_MAJOR;
  const pi = piEntryPath(root);
  const extension = extensionPath(root);
  const browser = options.browser ?? "chromium";
  const browserItem = browser === "chrome" ? await chromeCheckItem() : await chromiumCheckItem();
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
    browserItem,
    {
      name: "model",
      ok: true,
      required: false,
      detail: providerHint(),
    },
  ];
}

async function chromeCheckItem(): Promise<CheckItem> {
  const chrome = await chromeExecutable();
  return {
    name: "chrome",
    ok: Boolean(chrome),
    required: true,
    detail: chrome ?? "missing — install Google Chrome, or use --chromium",
  };
}

async function chromiumCheckItem(): Promise<CheckItem> {
  const chrome = await chromiumExecutable();
  return {
    name: "chromium",
    ok: Boolean(chrome),
    required: true,
    detail: chrome ?? "missing — run: npx playwright install chromium",
  };
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
