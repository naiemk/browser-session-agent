/**
 * Task selection for live runs.
 *
 * A live run costs money per task, so the default set is a small subset chosen to cover
 * distinct failure modes rather than to be thorough: one plain form, one multi-step
 * flow, one widget, one irreversible commit, one abandon, one page that fails validation,
 * one noisy page, one template. The full set is still there behind `--all`.
 */

import type { SuiteTask } from "./types.ts";

export const SMOKE_TASK_IDS = [
  "apply-submit",
  "login-then-apply",
  "combobox-united-states",
  "once-send-invitation",
  "draft-cancel-leaves-trace",
  "template-validation",
  "noisy-page-save",
  "pagination-find-item",
] as const;

export interface SelectOptions {
  only?: string[];
  tags?: string[];
  smoke?: boolean;
}

export function selectTasks(tasks: SuiteTask[], options: SelectOptions = {}): SuiteTask[] {
  let selected = tasks;
  if (options.smoke) {
    const ids = new Set<string>(SMOKE_TASK_IDS);
    selected = selected.filter((task) => ids.has(task.id));
  }
  if (options.tags?.length) {
    const wanted = new Set(options.tags);
    selected = selected.filter((task) => task.tags.some((tag) => wanted.has(tag)));
  }
  if (options.only?.length) {
    const ids = new Set(options.only);
    selected = selected.filter((task) => ids.has(task.id));
  }
  return selected;
}
