/**
 * Packaged worker definitions. Not ~/.pi/agent/agents and not the user's repo.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  thinking?: string;
  systemPrompt: string;
  filePath: string;
}

type AgentFrontmatter = {
  name?: unknown;
  description?: unknown;
  tools?: unknown;
  model?: unknown;
  thinking?: unknown;
};

export function packagedAgentsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "agents");
}

function parseToolList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export function loadAgentFile(filePath: string): AgentConfig | undefined {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
  const name = asString(frontmatter.name);
  const description = asString(frontmatter.description);
  if (!name || !description) return undefined;
  return {
    name,
    description,
    tools: parseToolList(frontmatter.tools),
    model: asString(frontmatter.model),
    thinking: asString(frontmatter.thinking),
    systemPrompt: body.trim(),
    filePath,
  };
}

export function discoverPackagedAgents(dir = packagedAgentsDir()): AgentConfig[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const agents: AgentConfig[] = [];
  for (const name of entries) {
    const loaded = loadAgentFile(path.join(dir, name));
    if (loaded) agents.push(loaded);
  }
  return agents;
}

export function findAgent(name: string, agents = discoverPackagedAgents()): AgentConfig | undefined {
  return agents.find((agent) => agent.name === name);
}
