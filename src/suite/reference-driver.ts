/**
 * Reference driver: executes each task's documented solution.
 *
 * It exists to validate the suite itself. If a reference run cannot pass a task,
 * the task or its criteria are wrong, and measuring an agent against it would be
 * measuring noise. It is not a stand-in for an agent and reports no model cost.
 */

import { act } from "../core/act.ts";
import { evaluatePredicate } from "../core/predicates.ts";
import { CoreError, type ActionRequest } from "../core/types.ts";
import type { AgentDriver, DriverContext, DriverOutcome, ReferenceStep } from "./types.ts";

async function resolveRef(context: DriverContext, name: string): Promise<string> {
  const observation = await context.browser.observe(context.tabId);
  const exact = observation.controls.find((control) => control.name === name);
  const partial = observation.controls.find((control) => control.name.includes(name));
  const control = exact ?? partial;
  if (!control) {
    throw new CoreError("missing_control", `Reference step needs a control named "${name}"`, {
      available: observation.controls.map((candidate) => candidate.name),
    });
  }
  return control.ref;
}

function toRequest(step: ReferenceStep, ref: string | undefined, origin: string): ActionRequest {
  switch (step.do) {
    case "navigate":
      return { kind: "navigate", url: step.url?.startsWith("http") ? step.url : `${origin}${step.url ?? "/"}` };
    case "click":
      return { kind: "click", ref };
    case "type":
      return { kind: "type", ref, text: step.text ?? "" };
    case "select":
      return { kind: "select", ref, value: step.value ?? "" };
    case "scroll":
      return { kind: "scroll", ref, dy: step.dy };
    case "upload":
      return { kind: "upload", ref, files: step.files ?? [] };
    case "wait":
      return { kind: "wait", wait: step.wait ?? { kind: "timeout", timeoutMs: 250 } };
  }
}

export class ReferenceDriver implements AgentDriver {
  readonly name = "reference";

  async runTask(context: DriverContext): Promise<DriverOutcome> {
    for (const step of context.task.reference) {
      const limit = step.until ? (step.maxRepeat ?? 10) : 1;
      for (let attempt = 0; attempt < limit; attempt++) {
        if (step.until) {
          const facts = await context.browser.facts(context.tabId);
          if (evaluatePredicate(step.until, facts).passed) break;
        }
        const ref = step.name ? await resolveRef(context, step.name) : undefined;
        context.step();
        const result = await act(context.browser, {
          ...toRequest(step, ref, context.origin),
          tabId: context.tabId,
          intent: `reference: ${step.do} ${step.name ?? step.url ?? ""}`.trim(),
        });
        if (!result.ok && !step.allowFailure) {
          throw new CoreError(
            "reference_step_failed",
            `reference step ${step.do} ${step.name ?? ""} failed: ${result.failure?.recovery ?? "unknown"}`,
          );
        }
      }
    }
    return { claimed: "reference solution executed" };
  }
}
