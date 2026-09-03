/**
 * Lazy skill retrieval.
 *
 * Pi's own pattern: inject a catalogue of names and descriptions, and let the model
 * read a body only when it decides the skill applies. Inlining every skill would
 * spend the context we just went to trouble to protect.
 *
 * Skills here are host-independent technique. Site-specific packs are deliberately
 * absent: they have to be earned from repeated traces (D26, D28), and a candidate is
 * not knowledge until it has worked more than once.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface SkillMeta {
  name: string;
  description: string;
  /** Comma-separated keywords from frontmatter, used for retrieval. */
  match: string[];
  file: string;
  /** Absent for hand-written skills; set for host-scoped ones. */
  host?: string;
}

export interface SkillHit extends SkillMeta {
  score: number;
  why: string[];
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: raw };
  const head = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    data[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return { data, body };
}

async function readSkillFile(file: string, host?: string): Promise<SkillMeta | undefined> {
  const raw = await readFile(file, "utf8").catch(() => "");
  if (!raw.trim()) return undefined;
  const { data } = parseFrontmatter(raw);
  const name = data.name ?? path.basename(file, ".md");
  if (!data.description) return undefined;
  return {
    name,
    description: data.description,
    match: (data.match ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
    file,
    host,
  };
}

/** Load the catalogue. Bodies stay on disk until something asks for one. */
export async function loadSkillCatalogue(rootDir: string): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];
  const groups = await readdir(rootDir).catch(() => []);
  for (const group of groups) {
    const groupDir = path.join(rootDir, group);
    const info = await stat(groupDir).catch(() => undefined);
    if (!info?.isDirectory()) continue;
    const host = group === "generic" ? undefined : group;
    for (const entry of await readdir(groupDir).catch(() => [])) {
      if (!entry.endsWith(".md")) continue;
      const skill = await readSkillFile(path.join(groupDir, entry), host);
      if (skill) skills.push(skill);
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Rank skills for the task at hand. Host-scoped entries win when the host matches,
 * because specific knowledge beats general technique; otherwise keyword overlap with
 * the objective decides.
 */
export function retrieveSkills(
  catalogue: SkillMeta[],
  input: { objective: string; url?: string; limit?: number },
): SkillHit[] {
  const host = hostOf(input.url);
  const text = input.objective.toLowerCase();
  const hits: SkillHit[] = [];

  for (const skill of catalogue) {
    const why: string[] = [];
    let score = 0;

    if (skill.host) {
      if (!host || !host.includes(skill.host)) continue;
      score += 10;
      why.push(`host ${skill.host}`);
    }
    for (const keyword of skill.match) {
      if (text.includes(keyword)) {
        score += 2;
        why.push(`"${keyword}"`);
      }
    }
    if (skill.match.length === 0) score += 1;
    if (score > 0) hits.push({ ...skill, score, why });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, input.limit ?? 3);
}

/** The catalogue as prompt text: names and descriptions only. */
export function formatCatalogue(hits: SkillHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map(
    (hit) => `- ${hit.name}: ${hit.description}\n  read with skill_read("${hit.name}")`,
  );
  return `These notes may apply. Read one only if it matches what you are facing.\n${lines.join("\n")}`;
}

/** Read a body on demand. */
export async function readSkillBody(
  catalogue: SkillMeta[],
  name: string,
): Promise<string | undefined> {
  const skill = catalogue.find((entry) => entry.name === name);
  if (!skill) return undefined;
  const raw = await readFile(skill.file, "utf8").catch(() => "");
  return parseFrontmatter(raw).body || undefined;
}

export interface TracePattern {
  /** Archetype-ish key: the shape of the situation, not the URL. */
  signature: string;
  successes: number;
  failures: number;
}

/**
 * Which recurring patterns are worth writing down.
 *
 * Promotion is deliberately conservative: a technique that worked once is an anecdote,
 * and turning anecdotes into durable knowledge is how a memory fills with brittle
 * selectors. A candidate needs repeated success and no recent contradiction.
 */
export function promotableCandidates(
  patterns: TracePattern[],
  options: { minSuccesses?: number; maxFailureRatio?: number } = {},
): TracePattern[] {
  const minSuccesses = options.minSuccesses ?? 3;
  const maxFailureRatio = options.maxFailureRatio ?? 0.25;
  return patterns.filter((pattern) => {
    if (pattern.successes < minSuccesses) return false;
    const total = pattern.successes + pattern.failures;
    return total > 0 && pattern.failures / total <= maxFailureRatio;
  });
}
