/**
 * Where metering lands.
 *
 * Two sinks: a buffer for tests and in-process rollups, and an append-only JSONL file
 * beside the goal's ledger. Records are buffered and flushed at turn boundaries rather
 * than written per call, because `record` is called from the hot path of every tool
 * result and a syscall there would show up in the numbers it is trying to measure.
 *
 * Losing the tail of a metrics file on a crash is acceptable. Losing evidence is not,
 * which is the other reason this is not the ledger.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { MetricRecord, MetricsSink } from "../runtime/metrics.ts";

export class MemoryRecorder implements MetricsSink {
  readonly records: MetricRecord[] = [];

  record(record: MetricRecord): void {
    this.records.push(record);
  }

  async flush(): Promise<void> {}
}

export class FileRecorder implements MetricsSink {
  private buffer: MetricRecord[] = [];
  private writing: Promise<void> = Promise.resolve();
  private readonly all: MetricRecord[] = [];

  private constructor(private readonly file: string) {}

  static async open(file: string): Promise<FileRecorder> {
    await mkdir(path.dirname(file), { recursive: true });
    return new FileRecorder(file);
  }

  /**
   * Everything this recorder was given, so a caller can roll up its own run without
   * re-reading the file and without depending on when the flush happened.
   */
  get written(): readonly MetricRecord[] {
    return this.all;
  }

  record(record: MetricRecord): void {
    this.all.push(record);
    this.buffer.push(record);
    // A turn boundary is a natural flush point: it bounds how much a crash loses
    // without putting a write in the path of every tool call.
    if (record.kind === "turn") void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      await this.writing;
      return;
    }
    const pending = this.buffer;
    this.buffer = [];
    const lines = `${pending.map((record) => JSON.stringify(record)).join("\n")}\n`;
    // Serialized, so concurrent flushes cannot interleave half-written lines.
    this.writing = this.writing.then(() => appendFile(this.file, lines, "utf8"));
    await this.writing;
  }
}

export async function readMetrics(file: string): Promise<MetricRecord[]> {
  const raw = await readFile(file, "utf8").catch(() => "");
  const records: MetricRecord[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as MetricRecord);
    } catch {
      // A truncated tail is expected when a run was killed; earlier records still count.
    }
  }
  return records;
}
