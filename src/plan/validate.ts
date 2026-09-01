import { AgentError } from "../domain/types.ts";
import { PLAN_LIMITS, type Attempt, type PagePlan, type Predicate, type Step, type Target } from "./types.ts";

const TARGET_BY = new Set(["ref", "role", "label", "placeholder", "text"]);
const STEP_OPS = new Set([
  "click",
  "click_first",
  "type",
  "clear",
  "select",
  "scroll",
  "scroll_until",
  "wait",
]);
const PRED_KINDS = new Set([
  "text_visible",
  "option_visible",
  "target_exists",
  "ref_exists",
  "url_includes",
  "title_includes",
  "value_includes",
  "value_equals",
  "any",
  "all",
  "not",
]);

export function validatePagePlan(plan: unknown): PagePlan {
  if (!isRecord(plan)) throw invalid("plan must be an object");
  if (typeof plan.goal !== "string" || !plan.goal.trim()) throw invalid("goal is required");
  if (!isRecord(plan.context) || typeof plan.context.understanding !== "string") {
    throw invalid("context.understanding is required");
  }
  if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
    throw invalid("actions must be a non-empty array");
  }
  if (plan.actions.length > PLAN_LIMITS.maxActions) {
    throw invalid(`at most ${PLAN_LIMITS.maxActions} actions`);
  }

  const ids = new Set<string>();
  const actions = plan.actions.map((raw, i) => {
    if (!isRecord(raw)) throw invalid(`actions[${i}] must be an object`);
    if (typeof raw.id !== "string" || !raw.id.trim()) throw invalid(`actions[${i}].id is required`);
    if (ids.has(raw.id)) throw invalid(`duplicate action id ${raw.id}`);
    ids.add(raw.id);
    if (typeof raw.intent !== "string" || !raw.intent.trim()) {
      throw invalid(`actions[${i}].intent is required`);
    }
    const setup = raw.setup === undefined ? undefined : requireSteps(raw.setup, `actions[${i}].setup`, PLAN_LIMITS.maxSetupSteps);
    if (raw.setupEveryAttempt !== undefined && typeof raw.setupEveryAttempt !== "boolean") {
      throw invalid(`actions[${i}].setupEveryAttempt must be a boolean`);
    }
    if (!Array.isArray(raw.try) || raw.try.length === 0) {
      throw invalid(`actions[${i}].try must be a non-empty array`);
    }
    if (raw.try.length > PLAN_LIMITS.maxAttempts) {
      throw invalid(`actions[${i}] has more than ${PLAN_LIMITS.maxAttempts} attempts`);
    }
    return {
      id: raw.id,
      intent: raw.intent,
      setup,
      setupEveryAttempt: raw.setupEveryAttempt === true,
      try: raw.try.map((attempt, j) => requireAttempt(attempt, `actions[${i}].try[${j}]`)),
    };
  });

  return {
    context: {
      understanding: plan.context.understanding,
      hint: hintOf(plan.context.hint),
    },
    goal: plan.goal,
    actions,
  };
}

function requireAttempt(raw: unknown, path: string): Attempt {
  if (!isRecord(raw)) throw invalid(`${path} must be an object`);
  if (typeof raw.name !== "string" || !raw.name.trim()) throw invalid(`${path}.name is required`);
  return {
    name: raw.name,
    steps: requireSteps(raw.steps, `${path}.steps`, PLAN_LIMITS.maxStepsPerAttempt),
    successWhen: requirePredicate(raw.successWhen, `${path}.successWhen`, 0),
    then: raw.then === undefined ? undefined : requireSteps(raw.then, `${path}.then`, PLAN_LIMITS.maxStepsPerAttempt),
    doneWhen: raw.doneWhen === undefined ? undefined : requirePredicate(raw.doneWhen, `${path}.doneWhen`, 0),
  };
}

function requireSteps(raw: unknown, path: string, max: number): Step[] {
  if (!Array.isArray(raw) || raw.length === 0) throw invalid(`${path} must be a non-empty array`);
  if (raw.length > max) throw invalid(`${path} has more than ${max} steps`);
  return raw.map((step, i) => requireStep(step, `${path}[${i}]`));
}

function requireStep(raw: unknown, path: string): Step {
  if (!isRecord(raw) || typeof raw.op !== "string" || !STEP_OPS.has(raw.op)) {
    throw invalid(`${path} has unknown op (closed verb set only; no Playwright JS)`);
  }
  switch (raw.op) {
    case "click":
      return { op: "click", target: requireTarget(raw.target, `${path}.target`) };
    case "click_first": {
      if (!Array.isArray(raw.targets) || raw.targets.length === 0) {
        throw invalid(`${path}.targets is required`);
      }
      return { op: "click_first", targets: raw.targets.map((t, i) => requireTarget(t, `${path}.targets[${i}]`)) };
    }
    case "type":
      if (typeof raw.text !== "string") throw invalid(`${path}.text is required`);
      return {
        op: "type",
        target: requireTarget(raw.target, `${path}.target`),
        text: raw.text,
        clear: raw.clear === true,
      };
    case "clear":
      return { op: "clear", target: requireTarget(raw.target, `${path}.target`) };
    case "select":
      if (raw.label === undefined && raw.value === undefined) {
        throw invalid(`${path} needs label or value`);
      }
      return {
        op: "select",
        target: requireTarget(raw.target, `${path}.target`),
        label: typeof raw.label === "string" ? raw.label : undefined,
        value: typeof raw.value === "string" ? raw.value : undefined,
      };
    case "scroll":
      return {
        op: "scroll",
        target: raw.target === undefined ? undefined : requireTarget(raw.target, `${path}.target`),
        direction: raw.direction === "up" ? "up" : "down",
        dy: intIn(raw.dy, `${path}.dy`, 1, 2000, 400),
      };
    case "scroll_until": {
      const maxScrolls = intIn(raw.maxScrolls, `${path}.maxScrolls`, 1, PLAN_LIMITS.maxScrolls, 6);
      return {
        op: "scroll_until",
        target: raw.target === undefined ? undefined : requireTarget(raw.target, `${path}.target`),
        until: requirePredicate(raw.until, `${path}.until`, 0),
        maxScrolls,
        dy: intIn(raw.dy, `${path}.dy`, 1, 2000, 400),
      };
    }
    case "wait": {
      const ms = raw.ms === undefined ? undefined : intIn(raw.ms, `${path}.ms`, 0, PLAN_LIMITS.maxWaitMs, 0);
      const timeoutMs =
        raw.timeoutMs === undefined ? undefined : intIn(raw.timeoutMs, `${path}.timeoutMs`, 1, PLAN_LIMITS.maxWaitMs, 3000);
      if (ms === undefined && raw.until === undefined) throw invalid(`${path} needs ms or until`);
      return {
        op: "wait",
        ms,
        until: raw.until === undefined ? undefined : requirePredicate(raw.until, `${path}.until`, 0),
        timeoutMs,
      };
    }
    default:
      throw invalid(`${path} has unknown op`);
  }
}

function requirePredicate(raw: unknown, path: string, depth: number): Predicate {
  if (depth > PLAN_LIMITS.maxPredicateDepth) throw invalid(`${path} exceeds predicate depth`);
  if (!isRecord(raw) || typeof raw.kind !== "string" || !PRED_KINDS.has(raw.kind)) {
    throw invalid(`${path} has unknown predicate kind`);
  }
  switch (raw.kind) {
    case "text_visible":
    case "option_visible":
    case "url_includes":
    case "title_includes":
      if (typeof raw.text !== "string" || !raw.text) throw invalid(`${path}.text is required`);
      return { kind: raw.kind, text: raw.text };
    case "ref_exists":
      if (typeof raw.ref !== "string" || !raw.ref) throw invalid(`${path}.ref is required`);
      return { kind: "ref_exists", ref: raw.ref };
    case "target_exists":
      return { kind: "target_exists", target: requireTarget(raw.target, `${path}.target`) };
    case "value_includes":
    case "value_equals":
      if (typeof raw.text !== "string") throw invalid(`${path}.text is required`);
      return { kind: raw.kind, target: requireTarget(raw.target, `${path}.target`), text: raw.text };
    case "any":
    case "all": {
      if (!Array.isArray(raw.of) || raw.of.length === 0) throw invalid(`${path}.of is required`);
      return { kind: raw.kind, of: raw.of.map((p, i) => requirePredicate(p, `${path}.of[${i}]`, depth + 1)) };
    }
    case "not":
      return { kind: "not", pred: requirePredicate(raw.pred, `${path}.pred`, depth + 1) };
    default:
      throw invalid(`${path} has unknown predicate kind`);
  }
}

function requireTarget(raw: unknown, path: string): Target {
  if (!isRecord(raw) || typeof raw.by !== "string" || !TARGET_BY.has(raw.by)) {
    throw invalid(`${path} must use by: ref | role | label | placeholder | text`);
  }
  if (raw.by === "ref") {
    if (typeof raw.ref !== "string") throw invalid(`${path}.ref is required`);
    return { by: "ref", ref: raw.ref };
  }
  if (raw.by === "role") {
    if (typeof raw.role !== "string" || typeof raw.name !== "string") {
      throw invalid(`${path} needs role and name`);
    }
    return { by: "role", role: raw.role, name: raw.name };
  }
  if (raw.by === "label") {
    if (typeof raw.label !== "string") throw invalid(`${path}.label is required`);
    return { by: "label", label: raw.label };
  }
  if (raw.by === "placeholder") {
    if (typeof raw.text !== "string") throw invalid(`${path}.text is required`);
    return { by: "placeholder", text: raw.text };
  }
  if (typeof raw.text !== "string") throw invalid(`${path}.text is required`);
  return { by: "text", text: raw.text, exact: raw.exact === true };
}

function hintOf(raw: unknown): PagePlan["context"]["hint"] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw invalid("context.hint must be an object");
  return {
    urlIncludes: typeof raw.urlIncludes === "string" ? raw.urlIncludes : undefined,
    titleIncludes: typeof raw.titleIncludes === "string" ? raw.titleIncludes : undefined,
  };
}

function intIn(value: unknown, path: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw invalid(`${path} must be an integer ${min}–${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): AgentError {
  return new AgentError("invalid_plan", message);
}
