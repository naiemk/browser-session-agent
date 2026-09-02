/**
 * Goal state, entity-oriented from the outset (D31).
 *
 * A goal is not one run: it is many entities advancing independently, most of them
 * blocked on someone else at any moment. Every consequential action carries an
 * idempotency key so resuming tomorrow cannot repeat a contact or a submission, and
 * all state lives on disk so a fresh process can continue with no session context.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { shortId } from "./ids.ts";
import { ensureGoalDirs, goalPaths, type GoalPaths } from "./paths.ts";
import { redactDeep } from "./redact.ts";
import { CoreError, type ParkedOutcome, type TaskOutcome } from "./types.ts";

export interface EntityRecord {
  entityId: string;
  goalId: string;
  label?: string;
  stage: string;
  /** Distilled semantic facts, never DOM history. */
  facts: Record<string, unknown>;
  outcome?: TaskOutcome;
  parked?: ParkedOutcome;
  /** Idempotency keys already consumed by this entity. */
  consumed: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalRecord {
  goalId: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  facts: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function entityFile(paths: GoalPaths, entityId: string): string {
  return path.join(paths.entitiesDir, `${entityId}.json`);
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(redactDeep(value), null, 2)}\n`, "utf8");
}

async function readJson<T>(file: string): Promise<T | undefined> {
  const raw = await readFile(file, "utf8").catch(() => "");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as T;
}

export class GoalStore {
  private constructor(
    readonly goalId: string,
    private readonly paths: GoalPaths,
  ) {}

  /** Open or create a goal. Safe to call in a fresh process. */
  static async open(root: string, goalId: string, goal?: string): Promise<GoalStore> {
    const paths = goalPaths(root, goalId);
    await ensureGoalDirs(paths);
    const store = new GoalStore(goalId, paths);
    const existing = await readJson<GoalRecord>(paths.goalFile);
    if (!existing) {
      await writeJson(paths.goalFile, {
        goalId,
        goal: goal ?? "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        facts: {},
      } satisfies GoalRecord);
    }
    return store;
  }

  static newGoalId(): string {
    return shortId("goal");
  }

  async goal(): Promise<GoalRecord> {
    const record = await readJson<GoalRecord>(this.paths.goalFile);
    if (!record) throw new CoreError("missing_goal", `No goal record for ${this.goalId}`);
    return record;
  }

  async mergeGoalFacts(facts: Record<string, unknown>): Promise<GoalRecord> {
    const record = await this.goal();
    const next: GoalRecord = {
      ...record,
      facts: { ...record.facts, ...facts },
      updatedAt: nowIso(),
    };
    await writeJson(this.paths.goalFile, next);
    return next;
  }

  async addEntity(input: { entityId?: string; label?: string; stage?: string; facts?: Record<string, unknown> }): Promise<EntityRecord> {
    const entityId = input.entityId ?? shortId("ent");
    const record: EntityRecord = {
      entityId,
      goalId: this.goalId,
      label: input.label,
      stage: input.stage ?? "discovered",
      facts: input.facts ?? {},
      consumed: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await writeJson(entityFile(this.paths, entityId), record);
    return record;
  }

  async getEntity(entityId: string): Promise<EntityRecord | undefined> {
    return readJson<EntityRecord>(entityFile(this.paths, entityId));
  }

  async requireEntity(entityId: string): Promise<EntityRecord> {
    const record = await this.getEntity(entityId);
    if (!record) throw new CoreError("missing_entity", `No entity ${entityId}`);
    return record;
  }

  async listEntities(): Promise<EntityRecord[]> {
    const names = await readdir(this.paths.entitiesDir).catch(() => []);
    const records: EntityRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = await readJson<EntityRecord>(path.join(this.paths.entitiesDir, name));
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async update(
    entityId: string,
    change: (record: EntityRecord) => EntityRecord,
  ): Promise<EntityRecord> {
    const record = await this.requireEntity(entityId);
    const next = { ...change(record), updatedAt: nowIso() };
    await writeJson(entityFile(this.paths, entityId), next);
    return next;
  }

  async setStage(entityId: string, stage: string): Promise<EntityRecord> {
    return this.update(entityId, (record) => ({ ...record, stage }));
  }

  async mergeFacts(entityId: string, facts: Record<string, unknown>): Promise<EntityRecord> {
    return this.update(entityId, (record) => ({ ...record, facts: { ...record.facts, ...facts } }));
  }

  /**
   * Claim an idempotency key before a consequential action.
   * Returns false when the key was already consumed, which is how a resumed goal
   * avoids contacting or submitting twice.
   */
  async claim(entityId: string, idempotencyKey: string): Promise<boolean> {
    const record = await this.requireEntity(entityId);
    if (record.consumed.includes(idempotencyKey)) return false;
    await this.update(entityId, (current) => ({
      ...current,
      consumed: [...current.consumed, idempotencyKey],
    }));
    return true;
  }

  async isConsumed(entityId: string, idempotencyKey: string): Promise<boolean> {
    const record = await this.requireEntity(entityId);
    return record.consumed.includes(idempotencyKey);
  }

  /** Parking is per entity: unrelated entities keep working (D32). */
  async park(entityId: string, parked: Omit<ParkedOutcome, "status">): Promise<EntityRecord> {
    return this.update(entityId, (record) => ({
      ...record,
      stage: record.stage,
      parked: { status: "parked", ...parked },
      outcome: { status: "parked", ...parked },
    }));
  }

  async unpark(entityId: string): Promise<EntityRecord> {
    return this.update(entityId, (record) => ({
      ...record,
      parked: undefined,
      outcome: undefined,
    }));
  }

  async finish(entityId: string, outcome: TaskOutcome): Promise<EntityRecord> {
    return this.update(entityId, (record) => ({ ...record, outcome, parked: undefined }));
  }

  async parkedEntities(): Promise<EntityRecord[]> {
    return (await this.listEntities()).filter((record) => record.parked);
  }

  async activeEntities(): Promise<EntityRecord[]> {
    return (await this.listEntities()).filter((record) => !record.parked && !record.outcome);
  }
}
