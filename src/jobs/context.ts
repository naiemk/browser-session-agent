import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CoreError } from "../core/types.ts";
import type { JobDurableStatus, SprintRecord } from "./types.ts";
import type { SpecRecord } from "./types.ts";

export const PLANNER_SKILL = "job-planner";
export const SPRINT_SKILL = "job-sprint";
export const HUMAN_SKILL = "job-human";

export function phaseSkill(status: JobDurableStatus): string {
  if (status === "planning" || status === "awaiting_plan_approval") return PLANNER_SKILL;
  if (status === "paused") return HUMAN_SKILL;
  return SPRINT_SKILL;
}

export function skillsDir(from = import.meta.url): string {
  return path.join(path.dirname(fileURLToPath(from)), "..", "..", "skills");
}

export async function readSkillBody(name: string, root = skillsDir()): Promise<string> {
  const file = path.join(root, name, "SKILL.md");
  const raw = await readFile(file, "utf8").catch(() => "");
  if (!raw.trim()) {
    throw new CoreError("missing_skill", `Required skill ${name} is not installed`, { name, file });
  }
  return raw;
}

export async function standingJobPrompt(input: {
  status: JobDurableStatus;
  spec?: SpecRecord;
  sprint?: SprintRecord;
  title: string;
  jobId: string;
  humanCount: number;
  skillsRoot?: string;
}): Promise<string> {
  let skill = "";
  const name = phaseSkill(input.status);
  try {
    skill = await readSkillBody(name, input.skillsRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    skill = `REQUIRED SKILL MISSING: ${name}. ${message}. Do not improvise a replacement protocol.`;
  }
  const specLines = input.spec
    ? [
        `Approved spec v${input.spec.version} \`${input.spec.hash ?? ""}\``,
        `Objective: ${input.spec.objective}`,
        `In scope: ${input.spec.inScope.join("; ")}`,
        `Out of scope: ${input.spec.outOfScope.join("; ")}`,
      ]
    : ["No approved spec yet."];
  const sprintLines = input.sprint
    ? [
        `Current sprint ${input.sprint.id} (${input.sprint.status})`,
        input.sprint.summary,
        `Remaining: ${input.sprint.remaining.join("; ") || "(none)"}`,
        `Failed approaches: ${input.sprint.failedApproaches.map((item) => item.approach).join(", ") || "(none)"}`,
      ]
    : ["No current sprint."];
  return `[JOB ${input.jobId} — ${input.title} — ${input.status}]
Human inbox: ${input.humanCount}

${specLines.join("\n")}

${sprintLines.join("\n")}

${skill}`;
}
