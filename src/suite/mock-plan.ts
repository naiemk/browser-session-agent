/**
 * Turn a task's reference solution into a mock model plan.
 *
 * The reference steps already describe how each task is solved, so the mock target
 * reuses them rather than duplicating that knowledge. The important difference from the
 * reference target: these become real tool calls through Pi's real loop, so the mock run
 * exercises the tools, the harness, the commit gate, and the criteria — everything except
 * the model's judgement.
 */

import type { Predicate } from "../core/types.ts";
import { TOOL_ACT, TOOL_FORK, TOOL_PEEK } from "../runtime/names.ts";
import type { PlanStep } from "../runtime/mock-model.ts";
import type { WireObservation } from "../runtime/wire.ts";
import type { ReferenceStep, SuiteTask } from "./types.ts";

/**
 * Evaluate a predicate against a snapshot alone.
 *
 * The mock sees what the model sees: an observation, not page text. Predicates that
 * need page text cannot be answered here, and throwing beats guessing — a silently
 * wrong loop condition would make the mock target useless as a regression signal.
 */
export function observationSatisfies(pred: Predicate, observation: WireObservation): boolean {
  const includes = (haystack: string, needle: string) =>
    haystack.toLowerCase().includes(needle.toLowerCase());

  switch (pred.kind) {
    case "url_includes":
      return observation.url.includes(pred.text);
    case "title_includes":
      return includes(observation.title, pred.text);
    case "ref_exists":
      return observation.controls.some((control) => control.ref === pred.ref);
    case "control_exists":
    case "control_absent": {
      const found = observation.controls.some((control) => {
        if (pred.role && control.role !== pred.role) return false;
        if (pred.name && !includes(control.name, pred.name)) return false;
        return true;
      });
      return pred.kind === "control_exists" ? found : !found;
    }
    case "value_equals":
    case "value_includes": {
      const control = observation.controls.find((entry) => includes(entry.name, pred.name));
      const actual = control?.value ?? "";
      return pred.kind === "value_equals" ? actual === pred.text : includes(actual, pred.text);
    }
    case "dialog_open":
      return (observation.dialogs?.length ?? 0) > 0 === pred.open;
    case "all":
      return pred.of.every((entry) => observationSatisfies(entry, observation));
    case "any":
      return pred.of.some((entry) => observationSatisfies(entry, observation));
    case "not":
      return !observationSatisfies(pred.of, observation);
    default:
      throw new Error(
        `mock plans cannot evaluate "${pred.kind}" from a snapshot alone; ` +
          "use a control- or url-based condition in the reference step",
      );
  }
}

function actArgs(step: ReferenceStep, origin: string): Record<string, unknown> {
  switch (step.do) {
    case "navigate":
      return {
        kind: "navigate",
        url: step.url?.startsWith("http") ? step.url : `${origin}${step.url ?? "/"}`,
      };
    case "click":
      return { kind: "click" };
    case "type":
      return { kind: "type", text: step.text ?? "" };
    case "select":
      return { kind: "select", value: step.value ?? "" };
    case "scroll":
      return { kind: "scroll", dy: step.dy };
    case "upload":
      return { kind: "upload", files: step.files ?? [] };
    case "wait":
      return { kind: "wait", wait: step.wait ?? { kind: "timeout", timeoutMs: 250 } };
    default:
      throw new Error(`${step.do} is not an action; it needs its own tool call`);
  }
}

/** Reference steps that are not actions map to their own tool rather than to `act`. */
function toPlanStep(step: ReferenceStep, origin: string): PlanStep {
  if (step.do === "peek") {
    const url = step.url?.startsWith("http") ? step.url : `${origin}${step.url ?? "/"}`;
    return {
      tool: TOOL_PEEK,
      args: { url, ...(step.expect ? { expect: step.expect } : {}) },
    };
  }
  if (step.do === "fork") {
    return {
      tool: TOOL_FORK,
      args: {
        term: step.term ?? "",
        candidates: step.candidates ?? [],
        resolution: step.resolution ?? "covered_all",
        why: "reference solution",
      },
    };
  }
  return { tool: TOOL_ACT, target: step.name, args: actArgs(step, origin) };
}

export function planForSteps(steps: ReferenceStep[], origin: string): PlanStep[] {
  return steps.map((step) => {
    const plan: PlanStep = toPlanStep(step, origin);

    if (step.until) {
      const until = step.until;
      // Repeat while the goal condition is not yet met.
      plan.repeatWhile = (observation) => !observationSatisfies(until, observation);
      plan.maxRepeat = step.maxRepeat ?? 10;
    }

    return plan;
  });
}

export function planForTask(task: SuiteTask, origin: string): PlanStep[] {
  return planForSteps(task.reference, origin);
}
