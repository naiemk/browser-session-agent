import { AgentError } from "../domain/types.ts";
import type { Observation } from "../domain/types.ts";
import type { BrowserSession } from "../session.ts";
import type { PlanRuntime, PlanWorld, Step, StepResult, Target } from "./types.ts";

export class PlaywrightPlanRuntime implements PlanRuntime {
  private observation: Observation | null = null;
  private pageText = "";

  constructor(private readonly session: BrowserSession) {}

  world(): PlanWorld {
    return {
      url: this.observation?.url ?? "",
      title: this.observation?.title ?? "",
      pageText: this.pageText,
    };
  }

  resolve(target: Target): string | null {
    const controls = this.observation?.controls ?? [];
    const hits = controls.filter((c) => matchTarget(c, target));
    if (hits.length === 1) return hits[0]?.ref ?? null;
    if (hits.length === 0) return null;
    const exact = hits.filter((c) => exactName(c.name, target));
    if (exact.length === 1) return exact[0]?.ref ?? null;
    return null;
  }

  readValue(target: Target): string | undefined {
    const ref = this.resolve(target);
    return this.observation?.controls.find((c) => c.ref === ref)?.value;
  }

  async inspect(): Promise<void> {
    this.observation = await this.session.inspect();
    const tabId = this.observation.tabId;
    this.pageText = await this.session.worker.pageText(tabId);
  }

  async act(step: Exclude<Step, { op: "scroll_until" | "wait" }>): Promise<StepResult> {
    try {
      if (step.op === "click") {
        const ref = this.requireRef(step.target);
        const result = await this.session.act({ action: "click", ref });
        return fromAct(result.verification.status, result.recovery ?? `clicked ${ref}`);
      }
      if (step.op === "type") {
        const ref = this.requireRef(step.target);
        if (step.clear) {
          await this.session.act({ action: "type", ref, text: "" });
        }
        const result = await this.session.act({ action: "type", ref, text: step.text });
        return fromAct(result.verification.status, result.recovery ?? `typed ${step.text}`);
      }
      if (step.op === "clear") {
        const ref = this.requireRef(step.target);
        const result = await this.session.act({ action: "type", ref, text: "" });
        return fromAct(result.verification.status, result.recovery ?? `cleared ${ref}`);
      }
      if (step.op === "select") {
        const ref = this.requireRef(step.target);
        const value = step.value ?? step.label ?? "";
        const result = await this.session.act({ action: "select", ref, value });
        return fromAct(result.verification.status, result.recovery ?? `selected ${value}`);
      }
      if (step.op === "scroll") {
        const ref = step.target ? this.resolve(step.target) : this.listboxRef();
        await this.session.act({
          action: "scroll",
          ref: ref ?? undefined,
          dy: step.direction === "up" ? -(step.dy ?? 400) : (step.dy ?? 400),
        });
        return { ok: true, detail: "scrolled" };
      }
      if (step.op === "click_first") {
        return { ok: false, detail: "click_first is handled by the interpreter" };
      }
      // Every op above is handled, so this is unreachable by the types. Kept as a real
      // branch anyway: a step arriving from a stored plan is data, not a compile-time fact.
      return { ok: false, detail: `unsupported ${(step as { op: string }).op}` };
    } catch (err) {
      const message = err instanceof AgentError ? err.message : String(err);
      return { ok: false, detail: message };
    }
  }

  private requireRef(target: Target): string {
    const ref = this.resolve(target);
    if (!ref) {
      throw new AgentError("missing_ref", `No unique control for ${JSON.stringify(target)}`);
    }
    return ref;
  }

  private listboxRef(): string | undefined {
    return this.observation?.controls.find((c) => c.role === "listbox")?.ref;
  }
}

function fromAct(status: string, detail: string): StepResult {
  return { ok: status !== "failed", detail };
}

function matchTarget(
  control: { ref: string; role: string; name: string; tag: string },
  target: Target,
): boolean {
  if (target.by === "ref") return control.ref === target.ref;
  if (target.by === "role") {
    return control.role === target.role && namesMatch(control.name, target.name, true);
  }
  if (target.by === "label") return namesMatch(control.name, target.label, false);
  if (target.by === "placeholder") return namesMatch(control.name, target.text, false);
  return namesMatch(control.name, target.text, target.exact === true);
}

function namesMatch(name: string, needle: string, exact: boolean): boolean {
  const a = name.trim();
  const b = needle.trim();
  if (exact) return a === b;
  return a.toLowerCase().includes(b.toLowerCase());
}

function exactName(name: string, target: Target): boolean {
  const needle =
    target.by === "label"
      ? target.label
      : target.by === "placeholder" || target.by === "text"
        ? target.text
        : target.by === "role"
          ? target.name
          : "";
  return needle !== "" && name.trim().toLowerCase() === needle.trim().toLowerCase();
}
