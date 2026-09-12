/**
 * PARENT-01-T01 — Magpie parent-agent session packaging.
 *
 * Creates / resumes Pi session files under Magpie home (`coreRoot()/pi-sessions`),
 * binds a Magpie `goal_*` via the same `magpie-goal` custom entry the extension restores,
 * and prints a compact JSON handle. Does not launch Chrome or a provider.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { coreRoot } from "../core/paths.ts";
import { shortId } from "../core/ids.ts";
import { MAGPIE_GOAL_ENTRY, restoreGoalId } from "./pi-session-goal.ts";

export const DEFAULT_SESSION_DIR_NAME = "pi-sessions";

export type ParentSessionState = "ready" | "admitted" | "blocked" | "running";

export interface ParentSessionHandle {
  session_id: string;
  goal_id: string;
  state: ParentSessionState;
  next_check_hint?: string;
  session_dir: string;
  session_file: string;
}

export function defaultParentSessionDir(root?: string): string {
  return path.join(coreRoot(root), DEFAULT_SESSION_DIR_NAME);
}

export interface ParentCliFlags {
  /** Magpie parent compact-yield path (`--json`). */
  json: boolean;
  sessionDir?: string;
  session?: string;
  planFile?: string;
  name?: string;
  /** Remaining argv for Pi (may include `-p`, `--print`, prompts). */
  rest: string[];
  /** True when argv asked for a parent session surface. */
  wantsParentSession: boolean;
}

/**
 * Pull Magpie parent flags out of argv. Does not consume `-p` / `--print` /
 * `--headless` / `--chromium` (those stay for the launch layer).
 */
export function takeParentFlags(args: string[]): ParentCliFlags {
  const rest: string[] = [];
  let json = false;
  let sessionDir: string | undefined;
  let session: string | undefined;
  let planFile: string | undefined;
  let name: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--session-dir" && args[i + 1]) {
      sessionDir = args[++i];
      continue;
    }
    if (arg.startsWith("--session-dir=")) {
      sessionDir = arg.slice("--session-dir=".length);
      continue;
    }
    if ((arg === "--session" || arg === "--session-id") && args[i + 1]) {
      session = args[++i];
      continue;
    }
    if (arg.startsWith("--session=") || arg.startsWith("--session-id=")) {
      session = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if ((arg === "--plan-file" || arg === "--plan") && args[i + 1]) {
      planFile = args[++i];
      continue;
    }
    if (arg.startsWith("--plan-file=") || arg.startsWith("--plan=")) {
      planFile = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--name" && args[i + 1]) {
      name = args[++i];
      continue;
    }
    if (arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
      continue;
    }
    if (arg.startsWith("@") && arg.toLowerCase().endsWith(".md")) {
      planFile = arg.slice(1);
      continue;
    }
    rest.push(arg);
  }

  const wantsParentSession = json || Boolean(session) || Boolean(sessionDir) || Boolean(planFile);
  return { json, sessionDir, session, planFile, name, rest, wantsParentSession };
}

export async function persistSessionFile(manager: SessionManager): Promise<string> {
  const file = manager.getSessionFile();
  if (!file) throw new Error("SessionManager did not allocate a session file");
  const header = manager.getHeader();
  if (!header) throw new Error("SessionManager missing session header");
  const lines = [header, ...manager.getEntries()].map((entry) => JSON.stringify(entry));
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

export async function startParentSession(options: {
  root?: string;
  cwd?: string;
  sessionDir?: string;
  name?: string;
  goalId?: string;
  state?: ParentSessionState;
  nextCheckHint?: string;
}): Promise<ParentSessionHandle> {
  const sessionDir = options.sessionDir ?? defaultParentSessionDir(options.root);
  await mkdir(sessionDir, { recursive: true });
  const cwd = options.cwd ?? process.cwd();
  const manager = SessionManager.create(cwd, sessionDir);
  const goalId = options.goalId ?? shortId("goal");
  manager.appendCustomEntry(MAGPIE_GOAL_ENTRY, { goalId });
  if (options.name?.trim()) manager.appendSessionInfo(options.name.trim());
  const sessionFile = await persistSessionFile(manager);
  return {
    session_id: manager.getSessionId(),
    goal_id: goalId,
    state: options.state ?? "ready",
    next_check_hint: options.nextCheckHint ?? "magpie --session <id> -p \"status\"",
    session_dir: sessionDir,
    session_file: sessionFile,
  };
}

export async function resolveSessionPath(
  sessionDir: string,
  sessionArg: string,
  cwd = process.cwd(),
): Promise<{ path: string; id: string }> {
  if (sessionArg.includes("/") || sessionArg.includes("\\") || sessionArg.endsWith(".jsonl")) {
    const resolved = path.resolve(cwd, sessionArg);
    try {
      await access(resolved);
    } catch {
      throw new ParentSessionError(`unknown session: ${sessionArg}`);
    }
    const manager = SessionManager.open(resolved, sessionDir, cwd);
    return { path: resolved, id: manager.getSessionId() };
  }

  const listed = await SessionManager.list(cwd, sessionDir);
  const match =
    listed.find((row) => row.id === sessionArg) ??
    listed.find((row) => row.id.startsWith(sessionArg));
  if (!match) {
    throw new ParentSessionError(`unknown session: ${sessionArg}`);
  }
  return { path: match.path, id: match.id };
}

export async function resumeParentSession(options: {
  session: string;
  root?: string;
  cwd?: string;
  sessionDir?: string;
  state?: ParentSessionState;
  nextCheckHint?: string;
}): Promise<ParentSessionHandle> {
  const sessionDir = options.sessionDir ?? defaultParentSessionDir(options.root);
  const cwd = options.cwd ?? process.cwd();
  const resolved = await resolveSessionPath(sessionDir, options.session, cwd);
  const manager = SessionManager.open(resolved.path, sessionDir, cwd);
  const goalId = restoreGoalId(manager.getEntries());
  if (!goalId) {
    throw new ParentSessionError(`session ${resolved.id} has no magpie-goal entry`);
  }
  return {
    session_id: manager.getSessionId(),
    goal_id: goalId,
    state: options.state ?? "ready",
    next_check_hint: options.nextCheckHint ?? "magpie --session <id> -p \"status\"",
    session_dir: sessionDir,
    session_file: resolved.path,
  };
}

export function printParentHandle(handle: ParentSessionHandle): string {
  const payload: Record<string, unknown> = {
    session_id: handle.session_id,
    goal_id: handle.goal_id,
    state: handle.state,
  };
  if (handle.next_check_hint) payload.next_check_hint = handle.next_check_hint;
  return JSON.stringify(payload);
}

/** Inject `--session-dir` when forwarding a parent resume to Pi. */
export function withSessionDirArgs(args: string[], sessionDir: string): string[] {
  if (args.includes("--session-dir") || args.some((a) => a.startsWith("--session-dir="))) {
    return args;
  }
  return ["--session-dir", sessionDir, ...args];
}

export class ParentSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParentSessionError";
  }
}
