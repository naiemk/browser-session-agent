import { evaluatePredicate, describePredicate, describeTarget, contextStillMatches } from "./evaluate.ts";
import { PLAN_LIMITS, type PagePlan, type PlanAction, type PlanResult, type PlanRuntime, type ProgressEvent, type Step } from "./types.ts";

export interface InterpretOptions {
  onProgress?: (event: ProgressEvent) => void;
}

export async function interpretPagePlan(plan: PagePlan, runtime: PlanRuntime, options: InterpretOptions = {}): Promise<PlanResult> {
  const progress: ProgressEvent[] = [];
  const actuals: string[] = [];
  const completedActionIds: string[] = [];
  const emit = (event: ProgressEvent) => {
    progress.push(event);
    options.onProgress?.(event);
  };

  await runtime.inspect();
  if (!contextStillMatches(plan.context.hint, runtime)) {
    const reason = `page no longer matches context hint (url=${runtime.world().url}, title=${runtime.world().title})`;
    emit({ type: "escalate", reason });
    return { status: "escalated", completedActionIds, actuals, progress, escalateReason: reason };
  }

  for (const action of plan.actions) {
    emit({ type: "action_start", actionId: action.id, intent: action.intent });
    const result = await runAction(action, runtime, emit);
    actuals.push(...result.actuals);

    if (!contextStillMatches(plan.context.hint, runtime)) {
      const reason = `left the page during "${action.intent}" (url=${runtime.world().url})`;
      emit({ type: "escalate", reason });
      return {
        status: "escalated",
        completedActionIds,
        failedActionId: action.id,
        actuals,
        progress,
        escalateReason: reason,
      };
    }

    if (result.ok) {
      completedActionIds.push(action.id);
      emit({ type: "action_done", actionId: action.id, via: result.via ?? "unknown" });
      continue;
    }

    emit({ type: "action_failed", actionId: action.id, actuals: result.actuals });
    const reason = `all attempts failed for "${action.intent}"`;
    emit({ type: "escalate", reason });
    return {
      status: "escalated",
      completedActionIds,
      failedActionId: action.id,
      actuals,
      progress,
      escalateReason: reason,
    };
  }

  emit({ type: "plan_done", completedActionIds });
  return { status: "completed", completedActionIds, actuals, progress };
}

async function runAction(
  action: PlanAction,
  runtime: PlanRuntime,
  emit: (event: ProgressEvent) => void,
): Promise<{ ok: boolean; via?: string; actuals: string[] }> {
  const actuals: string[] = [];
  let ranSetup = false;

  for (const attempt of action.try) {
    emit({ type: "attempt_start", actionId: action.id, attempt: attempt.name });
    if (action.setup && (!ranSetup || action.setupEveryAttempt)) {
      const setup = await runSteps(action.setup, action.id, `${attempt.name}/setup`, runtime, emit);
      actuals.push(...setup.actuals);
      if (!setup.ok) {
        emit({
          type: "attempt_result",
          actionId: action.id,
          attempt: attempt.name,
          ok: false,
          reason: setup.failed ?? "setup failed",
        });
        continue;
      }
      ranSetup = true;
    }

    const body = await runSteps(attempt.steps, action.id, attempt.name, runtime, emit);
    actuals.push(...body.actuals);
    if (!body.ok) {
      emit({
        type: "attempt_result",
        actionId: action.id,
        attempt: attempt.name,
        ok: false,
        reason: body.failed ?? "step failed",
      });
      continue;
    }

    if (!evaluatePredicate(attempt.successWhen, runtime)) {
      const reason = `not yet: ${describePredicate(attempt.successWhen)}`;
      actuals.push(`${attempt.name}: ${reason}`);
      emit({ type: "attempt_result", actionId: action.id, attempt: attempt.name, ok: false, reason });
      continue;
    }

    if (attempt.then && attempt.then.length > 0) {
      const then = await runSteps(attempt.then, action.id, `${attempt.name}/then`, runtime, emit);
      actuals.push(...then.actuals);
      if (!then.ok) {
        emit({
          type: "attempt_result",
          actionId: action.id,
          attempt: attempt.name,
          ok: false,
          reason: then.failed ?? "then failed",
        });
        continue;
      }
      if (attempt.doneWhen && !evaluatePredicate(attempt.doneWhen, runtime)) {
        const reason = `selected but ${describePredicate(attempt.doneWhen)} still false`;
        actuals.push(`${attempt.name}: ${reason}`);
        emit({ type: "attempt_result", actionId: action.id, attempt: attempt.name, ok: false, reason });
        continue;
      }
    }

    const accepted = attempt.doneWhen ? describePredicate(attempt.doneWhen) : describePredicate(attempt.successWhen);
    actuals.push(`${attempt.name}: accepted (${accepted})`);
    emit({ type: "attempt_result", actionId: action.id, attempt: attempt.name, ok: true, reason: "accepted" });
    return { ok: true, via: attempt.name, actuals };
  }

  return { ok: false, actuals };
}

async function runSteps(
  steps: Step[],
  actionId: string,
  attempt: string,
  runtime: PlanRuntime,
  emit: (event: ProgressEvent) => void,
): Promise<{ ok: boolean; failed?: string; actuals: string[] }> {
  const actuals: string[] = [];
  for (const step of steps) {
    const result = await runStep(step, runtime);
    emit({ type: "step", actionId, attempt, op: step.op, ok: result.ok, detail: result.detail });
    actuals.push(`${step.op}: ${result.detail}`);
    if (!result.ok) return { ok: false, failed: result.detail, actuals };
    await runtime.inspect();
  }
  return { ok: true, actuals };
}

async function runStep(step: Step, runtime: PlanRuntime): Promise<{ ok: boolean; detail: string }> {
  if (step.op === "scroll_until") {
    const max = Math.min(step.maxScrolls ?? 6, PLAN_LIMITS.maxScrolls);
    for (let i = 0; i < max; i += 1) {
      await runtime.inspect();
      if (evaluatePredicate(step.until, runtime)) {
        return { ok: true, detail: `found after ${i} scroll(s): ${describePredicate(step.until)}` };
      }
      const scrolled = await runtime.act({
        op: "scroll",
        target: step.target,
        direction: "down",
        dy: step.dy ?? 400,
      });
      if (!scrolled.ok) return { ok: false, detail: scrolled.detail };
    }
    await runtime.inspect();
    if (evaluatePredicate(step.until, runtime)) {
      return { ok: true, detail: `found after ${max} scroll(s)` };
    }
    return { ok: false, detail: `scroll_until gave up after ${max}: ${describePredicate(step.until)}` };
  }

  if (step.op === "wait") {
    if (step.until) {
      const deadline = Date.now() + (step.timeoutMs ?? 3000);
      while (Date.now() < deadline) {
        await runtime.inspect();
        if (evaluatePredicate(step.until, runtime)) {
          return { ok: true, detail: `waited until ${describePredicate(step.until)}` };
        }
        await sleep(Math.min(step.ms ?? 50, 200));
      }
      return { ok: false, detail: `wait timed out: ${describePredicate(step.until)}` };
    }
    await sleep(step.ms ?? 0);
    return { ok: true, detail: `waited ${step.ms ?? 0}ms` };
  }

  if (step.op === "click_first") {
    for (const target of step.targets) {
      if (runtime.resolve(target)) {
        const clicked = await runtime.act({ op: "click", target });
        return {
          ok: clicked.ok,
          detail: clicked.ok ? `clicked first match ${describeTarget(target)}` : clicked.detail,
        };
      }
    }
    return { ok: false, detail: `none of ${step.targets.length} targets were visible` };
  }

  return runtime.act(step);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
