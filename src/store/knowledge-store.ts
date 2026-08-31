import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeRecord, RunStatus } from "../domain/types.ts";
import { nowIso, shortId } from "../domain/ids.ts";
import { lexicalScore } from "../domain/text.ts";
import { dataPaths, ensureDir, type DataPaths } from "./paths.ts";

export class KnowledgeStore {
  readonly paths: DataPaths;

  constructor(root: string) {
    this.paths = dataPaths(root);
  }

  async propose(input: {
    kind: KnowledgeRecord["kind"];
    text: string;
    tags?: string[];
    sourceRunId: string;
    evidenceEventIds: string[];
    outcome?: RunStatus;
    status?: KnowledgeRecord["status"];
  }): Promise<KnowledgeRecord> {
    const record: KnowledgeRecord = {
      id: shortId("kn"),
      kind: input.kind,
      text: input.text,
      tags: input.tags ?? [],
      status: input.status ?? "candidate",
      sourceRunId: input.sourceRunId,
      evidenceEventIds: input.evidenceEventIds,
      outcome: input.outcome,
      createdAt: nowIso(),
    };
    await ensureDir(path.dirname(this.paths.knowledgeFile));
    await writeFile(this.paths.knowledgeFile, `${JSON.stringify(record)}\n`, { flag: "a" });
    return record;
  }

  async list(): Promise<KnowledgeRecord[]> {
    if (!existsSync(this.paths.knowledgeFile)) return [];
    const text = await readFile(this.paths.knowledgeFile, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KnowledgeRecord);
  }

  async setStatus(
    id: string,
    status: "approved" | "rejected",
  ): Promise<KnowledgeRecord> {
    const records = await this.list();
    const index = records.findIndex((r) => r.id === id);
    if (index < 0) {
      throw new Error(`Unknown knowledge record ${id}`);
    }
    records[index] = {
      ...records[index],
      status,
      approvedAt: status === "approved" ? nowIso() : records[index].approvedAt,
    };
    await ensureDir(path.dirname(this.paths.knowledgeFile));
    const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await writeFile(this.paths.knowledgeFile, body);
    return records[index];
  }

  async search(
    query: string,
    options: { includeCandidates?: boolean } = {},
  ): Promise<Array<KnowledgeRecord & { score: number }>> {
    const records = await this.list();
    const scored = records
      .filter((record) => {
        if (record.status === "rejected") return false;
        if (record.kind === "user_fact") {
          return record.status === "approved" || options.includeCandidates;
        }
        if (record.kind === "strategy") {
          if (record.outcome && record.outcome !== "completed") return false;
          return record.status === "approved" || record.status === "candidate";
        }
        return false;
      })
      .map((record) => ({
        ...record,
        score: lexicalScore(query, `${record.text} ${record.tags.join(" ")}`),
      }))
      .filter((record) => record.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 8);
  }
}
