/**
 * Checkpoints before navigation.
 *
 * Navigating away throws out everything typed into the page. Without a checkpoint a
 * retry restarts from an empty form, which on a long application is the difference
 * between a recoverable hiccup and losing the work.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { act } from "./act.ts";
import type { BrowserPort } from "./browser.ts";
import { ensureGoalDirs, goalPaths } from "./paths.ts";
import { redactDeep } from "./redact.ts";

export interface Checkpoint {
  url: string;
  title: string;
  /** Control name to value. Passwords are already redacted upstream. */
  values: Record<string, string>;
  createdAt: string;
}

function checkpointFile(root: string, goalId: string, tag: string): string {
  return path.join(goalPaths(root, goalId).dir, `checkpoint-${tag}.json`);
}

export async function saveCheckpoint(
  browser: BrowserPort,
  options: { root: string; goalId: string; tag: string; tabId?: string },
): Promise<Checkpoint> {
  const observation = await browser.observe(options.tabId);
  const values: Record<string, string> = {};
  for (const control of observation.controls) {
    // Only fields worth restoring: something was entered, and it is not a redacted secret.
    if (!control.value || control.value === "***") continue;
    if (control.role === "submit" || control.tag === "button" || control.tag === "a") continue;
    values[control.name] = control.value;
  }

  const checkpoint: Checkpoint = {
    url: observation.url,
    title: observation.title,
    values,
    createdAt: new Date().toISOString(),
  };

  await ensureGoalDirs(goalPaths(options.root, options.goalId));
  await writeFile(
    checkpointFile(options.root, options.goalId, options.tag),
    `${JSON.stringify(redactDeep(checkpoint), null, 2)}\n`,
    "utf8",
  );
  return checkpoint;
}

export async function loadCheckpoint(
  root: string,
  goalId: string,
  tag: string,
): Promise<Checkpoint | undefined> {
  const raw = await readFile(checkpointFile(root, goalId, tag), "utf8").catch(() => "");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as Checkpoint;
}

/**
 * Return to a checkpoint: reopen the page and re-enter what was there. Fields that no
 * longer exist are reported rather than silently skipped, because a form that changed
 * shape is information the agent needs.
 */
export async function restoreCheckpoint(
  browser: BrowserPort,
  checkpoint: Checkpoint,
  options: { tabId?: string } = {},
): Promise<{ restored: string[]; missing: string[] }> {
  await act(browser, { kind: "navigate", tabId: options.tabId, url: checkpoint.url });

  const restored: string[] = [];
  const missing: string[] = [];
  for (const [name, value] of Object.entries(checkpoint.values)) {
    const observation = await browser.observe(options.tabId);
    const control = observation.controls.find((candidate) => candidate.name === name);
    if (!control) {
      missing.push(name);
      continue;
    }
    const kind = control.tag === "select" ? "select" : "type";
    const result = await act(browser, {
      kind,
      tabId: options.tabId,
      ref: control.ref,
      text: value,
      value,
      intent: `restore "${name}" from checkpoint`,
    });
    if (result.ok) restored.push(name);
    else missing.push(name);
  }
  return { restored, missing };
}
