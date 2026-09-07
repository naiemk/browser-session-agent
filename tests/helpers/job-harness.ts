import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FakeClock } from "../../src/core/clock.ts";
import { JobService } from "../../src/jobs/service.ts";
import type { SpecRecord, TaskTemplate, ApprovalGrantSpec } from "../../src/jobs/types.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { TOOL_ACT } from "../../src/runtime/names.ts";
import { actStep, createMockModel, type PlanStep } from "../../src/runtime/mock-model.ts";
import { FixtureServer } from "./fixture-server.ts";

export const APPLY_CRITERIA = [{ kind: "text_visible" as const, text: "Thanks Ada Lovelace" }];

export function applyTemplate(id = "apply", extra: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id,
    objective: extra.objective ?? "Apply as Ada Lovelace",
    criteria: extra.criteria ?? APPLY_CRITERIA,
    resource: extra.resource,
    maxAttempts: extra.maxAttempts,
    discoverable: extra.discoverable,
    dependencies: extra.dependencies,
    skills: extra.skills,
  };
}

export function applyPlan(origin: string): PlanStep[] {
  return [
    { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/apply` } },
    actStep("type", "Full name", { text: "Ada Lovelace" }),
    actStep("type", "Email", { text: "ada@example.com" }),
    actStep("click", "Submit application"),
  ];
}

export function invitePlan(origin: string): PlanStep[] {
  return [
    { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/once` } },
    actStep("type", "Recipient", { text: "ada" }),
    actStep("type", "Message", { text: "Hello there" }),
    actStep("click", "Send invitation"),
  ];
}

export const ZERO_JITTER = () => 0;

export function outboundGrant(controlName: string, id = "outbound", maxCount = 20): ApprovalGrantSpec {
  return {
    id,
    host: "*",
    gateClass: "outbound",
    controlName,
    maxCount,
  };
}

export async function tempRoot(prefix = "bsa-job-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export function readyPatch(input: {
  objective: string;
  completionText: string;
  templates: SpecRecord["templates"];
  startUrl?: string;
  grants?: SpecRecord["approvalEnvelope"]["grants"];
  sprintTaskLimit?: number;
  maxCostUsd?: number;
  pacing?: Partial<SpecRecord["pacing"]>;
  maxTurnsPerTask?: number;
}): Partial<SpecRecord> {
  return {
    objective: input.objective,
    inScope: ["fixture site"],
    outOfScope: ["production"],
    completionCriteria: [{ kind: "text_visible", text: input.completionText }],
    templates: input.templates,
    stopConditions: ["criteria met", "operator cancel"],
    startUrl: input.startUrl,
    budgets: {
      maxTurnsPerTask: input.maxTurnsPerTask ?? 12,
      sprintTaskLimit: input.sprintTaskLimit ?? 2,
      maxCostUsd: input.maxCostUsd,
    },
    ...(input.pacing ? { pacing: { minCooldownMs: 1000, maxCooldownMs: 10_000, circuitBreakerAfter: 2, ...input.pacing } } : {}),
    approvalEnvelope: {
      neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
      grants: input.grants ?? [],
    },
  };
}

export async function seedApproved(
  service: JobService,
  objective: string,
  patch: Partial<SpecRecord>,
  title?: string,
) {
  const store = await service.create(objective, title);
  await service.updateDraft(store.jobId, patch);
  const proposed = await service.proposePlan(store.jobId);
  await service.approvePlan(store.jobId, proposed.hash!);
  return store;
}

export async function withFixtureBrowser<T>(
  fn: (origin: string, browser: LocalBrowser) => Promise<T>,
): Promise<T> {
  const server = new FixtureServer();
  const origin = await server.start();
  const browser = await LocalBrowser.launch({ headless: true });
  try {
    return await fn(origin, browser);
  } finally {
    await browser.close();
    await server.stop();
  }
}

export function mockPlan(plan: PlanStep[]) {
  return createMockModel({ plan });
}

export { FakeClock, createMockModel };
