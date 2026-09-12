/**
 * Fake Magpie CLI for PARENT-01-T03 / R6.E2.
 * Records argv, mints a stable session handle, never launches Chrome or Pi.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface FakeMagpieHandle {
  session_id: string;
  goal_id: string;
  state: string;
  next_check_hint?: string;
}

export interface FakeMagpieRunResult {
  code: number;
  stdout: string;
  stderr: string;
  handle?: FakeMagpieHandle;
  argv: string[];
  started: boolean;
  resumed: boolean;
}

export interface FakeMagpieOptions {
  /** Directory where argv log + session state live. */
  stateDir: string;
  cwd?: string;
}

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function takeFlag(args: string[], name: string): { value?: string; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === name && args[i + 1]) {
      value = args[++i];
      continue;
    }
    if (arg.startsWith(`${name}=`)) {
      value = arg.slice(name.length + 1);
      continue;
    }
    rest.push(arg);
  }
  return { value, rest };
}

export function parseFakeMagpieArgs(argv: string[]): {
  json: boolean;
  session?: string;
  sessionDir?: string;
  planFile?: string;
  name?: string;
  printPrompt?: string;
  rest: string[];
} {
  let args = [...argv];
  let json = false;
  if (args.includes("--json")) {
    json = true;
    args = args.filter((a) => a !== "--json");
  }

  let sessionDir: string | undefined;
  ({ value: sessionDir, rest: args } = takeFlag(args, "--session-dir"));

  let session: string | undefined;
  ({ value: session, rest: args } = takeFlag(args, "--session"));
  if (!session) ({ value: session, rest: args } = takeFlag(args, "--session-id"));

  let planFile: string | undefined;
  ({ value: planFile, rest: args } = takeFlag(args, "--plan-file"));
  if (!planFile) ({ value: planFile, rest: args } = takeFlag(args, "--plan"));

  let name: string | undefined;
  ({ value: name, rest: args } = takeFlag(args, "--name"));

  const at = args.find((a) => a.startsWith("@") && a.toLowerCase().endsWith(".md"));
  if (at) {
    planFile = at.slice(1);
    args = args.filter((a) => a !== at);
  }

  let printPrompt: string | undefined;
  const printIdx = args.findIndex((a) => a === "-p" || a === "--print");
  if (printIdx >= 0 && args[printIdx + 1]) {
    printPrompt = args[printIdx + 1];
    args = args.filter((_, i) => i !== printIdx && i !== printIdx + 1);
  }

  return { json, session, sessionDir, planFile, name, printPrompt, rest: args };
}

async function statePaths(stateDir: string) {
  await mkdir(stateDir, { recursive: true });
  return {
    log: path.join(stateDir, "argv.jsonl"),
    store: path.join(stateDir, "sessions.json"),
  };
}

async function loadStore(storePath: string): Promise<Record<string, FakeMagpieHandle>> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as Record<string, FakeMagpieHandle>;
  } catch {
    return {};
  }
}

export async function runFakeMagpie(
  argv: string[],
  options: FakeMagpieOptions,
): Promise<FakeMagpieRunResult> {
  const paths = await statePaths(options.stateDir);
  await appendFile(paths.log, `${JSON.stringify({ argv, ts: Date.now() })}\n`, "utf8");

  const parsed = parseFakeMagpieArgs(argv);
  const store = await loadStore(paths.store);

  if (parsed.session) {
    const existing = store[parsed.session];
    if (!existing) {
      return {
        code: 1,
        stdout: "",
        stderr: `unknown session: ${parsed.session}\n`,
        argv,
        started: false,
        resumed: false,
      };
    }
    const out = JSON.stringify(existing);
    return {
      code: 0,
      stdout: `${out}\n`,
      stderr: "",
      handle: existing,
      argv,
      started: false,
      resumed: true,
    };
  }

  // Start path: --json or positional / -p objective.
  const wantsStart = parsed.json || Boolean(parsed.planFile) || parsed.rest.length > 0 || Boolean(parsed.printPrompt);
  if (!wantsStart) {
    return {
      code: 2,
      stdout: "",
      stderr: "fake-magpie: pass --json [objective] or --session <id>\n",
      argv,
      started: false,
      resumed: false,
    };
  }

  const handle: FakeMagpieHandle = {
    session_id: shortId("sess"),
    goal_id: shortId("goal"),
    state: parsed.planFile ? "admitted" : "ready",
    next_check_hint: 'magpie --session <id> -p "status"',
  };
  store[handle.session_id] = handle;
  await writeFile(paths.store, `${JSON.stringify(store, null, 2)}\n`, "utf8");

  // Optionally note plan file presence (no Chrome / no admission LLM).
  if (parsed.planFile) {
    const planPath = path.resolve(options.cwd ?? process.cwd(), parsed.planFile);
    try {
      await readFile(planPath, "utf8");
    } catch {
      return {
        code: 1,
        stdout: "",
        stderr: `plan file not found: ${parsed.planFile}\n`,
        argv,
        started: false,
        resumed: false,
      };
    }
  }

  const out = JSON.stringify({
    session_id: handle.session_id,
    goal_id: handle.goal_id,
    state: handle.state,
    next_check_hint: handle.next_check_hint,
  });
  return {
    code: 0,
    stdout: `${out}\n`,
    stderr: "",
    handle,
    argv,
    started: true,
    resumed: false,
  };
}

export async function readFakeMagpieArgvLog(stateDir: string): Promise<string[][]> {
  const logPath = path.join(stateDir, "argv.jsonl");
  try {
    const body = await readFile(logPath, "utf8");
    return body
      .split(/\n/)
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { argv: string[] }).argv);
  } catch {
    return [];
  }
}

export function countStarts(argvLog: string[][]): number {
  return argvLog.filter((argv) => {
    const p = parseFakeMagpieArgs(argv);
    return !p.session && (p.json || Boolean(p.planFile) || p.rest.length > 0 || Boolean(p.printPrompt));
  }).length;
}
