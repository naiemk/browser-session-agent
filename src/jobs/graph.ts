import { PlanStore, type AddTaskInput, type PlanTask } from "../core/plan.ts";
import { TaskStore } from "../core/task.ts";
import { CoreError, type Predicate } from "../core/types.ts";
import { GoalStore } from "../core/state.ts";
import type { SpecRecord, TaskTemplate } from "./types.ts";

function sameCriteria(left: Predicate[], right: Predicate[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function materializePlan(
  plan: PlanStore,
  tasks: TaskStore,
  spec: SpecRecord,
  goals?: GoalStore,
): Promise<PlanTask[]> {
  const created: PlanTask[] = [];
  const idByTemplate = new Map<string, string>();
  for (const template of spec.templates) {
    if (template.discoverable) continue;
    const entity = goals
      ? await goals.addEntity({ label: template.objective })
      : undefined;
    const input = templateToInput(template, spec, entity ? { entityId: entity.entityId } : {});
    const task = await plan.addTask(input);
    idByTemplate.set(template.id, task.id);
    await tasks.create({
      taskId: task.id,
      objective: task.objective,
      criteria: task.criteria,
      entityId: entity?.entityId,
      maxTurns: spec.budgets.maxTurnsPerTask,
    });
    created.push(task);
  }
  for (const template of spec.templates) {
    if (template.discoverable || !template.dependencies?.length) continue;
    const taskId = idByTemplate.get(template.id);
    if (!taskId) continue;
    const deps = template.dependencies
      .map((dep) => idByTemplate.get(dep))
      .filter((id): id is string => Boolean(id));
    if (deps.length > 0) await plan.updateTask(taskId, { dependencies: deps });
  }
  return created;
}

export function templateToInput(template: TaskTemplate, spec: SpecRecord, extra: Partial<AddTaskInput> = {}): AddTaskInput {
  return {
    objective: template.objective,
    criteria: template.criteria,
    templateId: template.id,
    skills: template.skills,
    resource: template.resource,
    specVersion: spec.version,
    maxAttempts: template.maxAttempts,
    approach: template.id,
    ...extra,
  };
}

export async function discoverFromTemplate(
  plan: PlanStore,
  tasks: TaskStore,
  goals: GoalStore,
  spec: SpecRecord,
  parentId: string,
  templateId: string,
  entities: Array<{ label: string; facts?: Record<string, unknown> }>,
): Promise<PlanTask[]> {
  const template = spec.templates.find((entry) => entry.id === templateId);
  if (!template) throw new CoreError("unknown_template", `No approved template ${templateId}`);
  if (!template.discoverable) {
    throw new CoreError("template_not_discoverable", `Template ${templateId} cannot be instantiated at runtime`);
  }
  const created: PlanTask[] = [];
  for (const entity of entities) {
    if (!entity.label.trim()) continue;
    const record = await goals.addEntity({ label: entity.label, facts: entity.facts });
    const task = (
      await plan.discover(parentId, [
        templateToInput(template, spec, {
          objective: `${template.objective}: ${entity.label}`,
          entityId: record.entityId,
          parentId,
        }),
      ])
    )[0]!;
    const oracle = await tasks.get(task.id);
    if (oracle && !sameCriteria(oracle.criteria, template.criteria)) {
      throw new CoreError("criteria_mismatch", "discovered task criteria drifted from the template");
    }
    if (!oracle) {
      await tasks.create({
        taskId: task.id,
        objective: task.objective,
        criteria: template.criteria,
        entityId: record.entityId,
        maxTurns: spec.budgets.maxTurnsPerTask,
      });
    }
    created.push(task);
  }
  return created;
}

export async function ensureOracle(plan: PlanStore, tasks: TaskStore, taskId: string): Promise<void> {
  const graph = await plan.requireTask(taskId);
  const oracle = await tasks.get(taskId);
  if (!oracle) {
    await tasks.create({
      taskId: graph.id,
      objective: graph.objective,
      criteria: graph.criteria,
      entityId: graph.entityId,
    });
    return;
  }
  if (!sameCriteria(oracle.criteria, graph.criteria)) {
    throw new CoreError("criteria_mismatch", `plan and oracle criteria differ for ${taskId}`);
  }
}
