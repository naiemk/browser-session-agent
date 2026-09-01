import type { PlanRuntime, Predicate, Target } from "./types.ts";

export function evaluatePredicate(pred: Predicate, runtime: PlanRuntime): boolean {
  switch (pred.kind) {
    case "text_visible":
      return includesInsensitive(runtime.world().pageText, pred.text);
    case "option_visible":
      return includesInsensitive(runtime.world().pageText, pred.text) || runtime.resolve({ by: "text", text: pred.text }) !== null;
    case "target_exists":
      return runtime.resolve(pred.target) !== null;
    case "ref_exists":
      return runtime.resolve({ by: "ref", ref: pred.ref }) !== null;
    case "url_includes":
      return runtime.world().url.includes(pred.text);
    case "title_includes":
      return includesInsensitive(runtime.world().title, pred.text);
    case "value_includes": {
      const value = runtime.readValue(pred.target) ?? "";
      return includesInsensitive(value, pred.text);
    }
    case "value_equals":
      return (runtime.readValue(pred.target) ?? "") === pred.text;
    case "any":
      return pred.of.some((p) => evaluatePredicate(p, runtime));
    case "all":
      return pred.of.every((p) => evaluatePredicate(p, runtime));
    case "not":
      return !evaluatePredicate(pred.pred, runtime);
  }
}

export function describePredicate(pred: Predicate): string {
  switch (pred.kind) {
    case "text_visible":
      return `text visible "${pred.text}"`;
    case "option_visible":
      return `option visible "${pred.text}"`;
    case "target_exists":
      return `target exists ${describeTarget(pred.target)}`;
    case "ref_exists":
      return `ref ${pred.ref} exists`;
    case "url_includes":
      return `url includes "${pred.text}"`;
    case "title_includes":
      return `title includes "${pred.text}"`;
    case "value_includes":
      return `${describeTarget(pred.target)} includes "${pred.text}"`;
    case "value_equals":
      return `${describeTarget(pred.target)} equals "${pred.text}"`;
    case "any":
      return pred.of.map(describePredicate).join(" or ");
    case "all":
      return pred.of.map(describePredicate).join(" and ");
    case "not":
      return `not (${describePredicate(pred.pred)})`;
  }
}

export function describeTarget(target: Target): string {
  switch (target.by) {
    case "ref":
      return target.ref;
    case "role":
      return `${target.role} "${target.name}"`;
    case "label":
      return `label "${target.label}"`;
    case "placeholder":
      return `placeholder "${target.text}"`;
    case "text":
      return `text "${target.text}"`;
  }
}

export function contextStillMatches(
  hint: { urlIncludes?: string; titleIncludes?: string } | undefined,
  runtime: PlanRuntime,
): boolean {
  if (!hint) return true;
  const world = runtime.world();
  if (hint.urlIncludes && !world.url.includes(hint.urlIncludes)) return false;
  if (hint.titleIncludes && !includesInsensitive(world.title, hint.titleIncludes)) return false;
  return true;
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
