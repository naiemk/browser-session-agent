/**
 * PARENT-01-T02 — Admit a parent plan.md without Magpie `/plan` TUI.
 *
 * Heuristic classifier only (no provider). Writes the admitted plan to the goal
 * scratch so `standingPlanPrompt` can surface it. Does not reimplement `/coach`.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { coreRoot, goalPaths } from "../core/paths.ts";
import { ensureScratch } from "./pi-subagent/bind.ts";

export type PlanAdmissionClass = "calibration_required" | "known_flow" | "criteria_unsettled";

export interface AdmitParentPlanInput {
  objective: string;
  planText?: string;
  criteria?: string[];
}

export interface AdmitParentPlanResult {
  class: PlanAdmissionClass;
  /** Markdown written to scratch/plan.md (empty when blocked). */
  admittedMarkdown: string;
  /** Steps stripped because they looked like click/type/CSS procedures. */
  stripped: string[];
  /** Parent-facing session state after admission. */
  state: "admitted" | "blocked" | "ready";
  reason?: string;
}

const PLAN_FILE = "plan.md";

const HARVEST_HINT =
  /\b(harvest|scrape|collect|qualify|prospect|entities|profiles|campaign|many|dozens|hundred|50\+|~?\d{2,}\s+(people|profiles|entities|candidates|leads))\b/i;
const UNSETTLED_HINT =
  /\b(figure out what we want|what should we (collect|want)|success criteria (tbd|unknown)|criteria unsettled|decide later)\b/i;
const KNOWN_FLOW_HINT =
  /\b(jsonlint|single (page|url|form)|what is the title|one (fact|url)|read the title|check (the )?status)\b/i;
const CLICK_TYPE_CSS =
  /\b(click\s*\(|type\s+into|typeInto|css\s*selector|querySelector|getElementById|xpath\s*:|selector\s*[:=])/i;

export function classifyObjective(input: AdmitParentPlanInput): PlanAdmissionClass {
  const text = [input.objective, input.planText ?? "", ...(input.criteria ?? [])].join("\n");
  const criteria = (input.criteria ?? []).map((c) => c.trim()).filter(Boolean);
  if (
    UNSETTLED_HINT.test(text) ||
    (!input.objective.trim() && !input.planText?.trim()) ||
    (criteria.length === 0 && /\b(figure out|unknown success|tbd)\b/i.test(text))
  ) {
    if (!HARVEST_HINT.test(text) && (UNSETTLED_HINT.test(text) || !input.objective.trim())) {
      return "criteria_unsettled";
    }
  }
  if (UNSETTLED_HINT.test(text) && !HARVEST_HINT.test(text)) return "criteria_unsettled";
  if (KNOWN_FLOW_HINT.test(text) && !HARVEST_HINT.test(text)) return "known_flow";
  if (HARVEST_HINT.test(text)) return "calibration_required";
  // Short single-step plans without harvest language stay known_flow.
  const steps = numberedSteps(input.planText ?? "");
  if (steps.length > 0 && steps.length <= 2 && !HARVEST_HINT.test(text)) return "known_flow";
  if (steps.length === 0 && input.objective.trim().split(/\s+/).length <= 12 && !HARVEST_HINT.test(text)) {
    return "known_flow";
  }
  return "calibration_required";
}

function numberedSteps(planText: string): string[] {
  return planText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+[\).\]]\s+/.test(line) || /^[-*]\s+/.test(line));
}

function stripProceduralSteps(planText: string): { kept: string[]; stripped: string[] } {
  const kept: string[] = [];
  const stripped: string[] = [];
  for (const line of planText.split(/\r?\n/)) {
    if (CLICK_TYPE_CSS.test(line)) {
      stripped.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  return { kept, stripped };
}

function cleanStep(step: string): string {
  return step.replace(/^\d+[\).\]]\s+/, "").replace(/^[-*]\s+/, "").trim();
}

/**
 * Ensure scout → coach → harvest are explicit. Parent tactic lines (e.g. "scrape
 * 200 profiles") are deferred notes — they must not become operate steps that
 * skip calibration.
 */
function ensureCalibrationSteps(steps: string[]): { planSteps: string[]; deferred: string[] } {
  const body = steps.length ? steps : [];
  const findPhase = (phase: RegExp): string | undefined =>
    body.map(cleanStep).find((step) => phase.test(step));

  const planSteps = [
    findPhase(/\bscout\b/i) ??
      "scout — operate: tight-budget explore of the acquisition surface; no bulk collection yet.",
    findPhase(/\bcoach\b/i) ??
      "coach — review: run Magpie /coach; bulk collection stays blocked until a valid strategy artifact exists.",
    findPhase(/\bharvest\b/i) ??
      "harvest — operate: follow the strategy artifact only; do not invent a tactic list.",
  ].map((step, index) => `${index + 1}. ${cleanStep(step)}`);

  const deferred = body
    .map(cleanStep)
    .filter((step) => step && !/\b(scout|coach|harvest)\b/i.test(step));

  return { planSteps, deferred };
}

export function admitParentPlan(input: AdmitParentPlanInput): AdmitParentPlanResult {
  const classification = classifyObjective(input);
  const { kept, stripped } = stripProceduralSteps(input.planText ?? "");
  const keptText = kept.join("\n").trim();
  const steps = numberedSteps(keptText);

  if (classification === "criteria_unsettled") {
    return {
      class: classification,
      admittedMarkdown: "",
      stripped,
      state: "blocked",
      reason: "criteria_unsettled: ask the operator for success criteria before harvest",
    };
  }

  let planSteps: string[];
  let deferred: string[] = [];
  if (classification === "calibration_required") {
    ({ planSteps, deferred } = ensureCalibrationSteps(steps));
  } else {
    // known_flow: do not cargo-cult a coach step.
    planSteps = steps.length
      ? steps.map((step, index) => `${index + 1}. ${cleanStep(step)}`)
      : [`1. operate — ${input.objective.trim() || "complete the short reversible flow"}`];
    planSteps = planSteps.filter((step) => !/\bcoach\b/i.test(step));
    planSteps = planSteps.map((step, index) => `${index + 1}. ${cleanStep(step)}`);
  }

  const admittedMarkdown = [
    "## Goal",
    input.objective.trim() || "(parent objective)",
    "",
    "## Missing inputs",
    deferred.length
      ? deferred.map((line) => `- deferred parent note (not operate): ${line}`).join("\n")
      : "(none recorded by admission)",
    "",
    "## Plan",
    ...planSteps,
    "",
    "## Stop",
    classification === "calibration_required"
      ? "Stop before bulk collection if /coach has not produced a valid artifact. Ask the human on park / waiting_human."
      : "Ask the human rather than invent missing inputs.",
    "",
    "## Digest",
    classification === "calibration_required"
      ? "Phases: scout, then coach, then harvest. Parent click/type steps were not executed."
      : "Known short flow; calibration gate skipped.",
    "",
    `<!-- magpie-admission: ${classification} -->`,
  ].join("\n");

  return {
    class: classification,
    admittedMarkdown,
    stripped,
    state: "admitted",
  };
}

export async function writeAdmittedPlan(
  goalId: string,
  admitted: AdmitParentPlanResult,
  root?: string,
): Promise<string | null> {
  if (!admitted.admittedMarkdown.trim()) return null;
  const scratchDir = await ensureScratch(goalId, root);
  const file = path.join(scratchDir, PLAN_FILE);
  await writeFile(file, admitted.admittedMarkdown, "utf8");
  return file;
}

export function planPathForGoal(goalId: string, root?: string): string {
  return path.join(goalPaths(coreRoot(root), goalId).scratchDir, PLAN_FILE);
}
