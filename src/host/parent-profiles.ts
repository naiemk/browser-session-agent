/**
 * PARENT-01-T05 — Named Magpie cost profiles (operator policy, not a router).
 *
 * Writes `models.json` default/plan/coach pins as provider/id. Recommend prints;
 * apply is explicit. Keys never appear in output.
 */

import { homedir } from "node:os";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { coreRoot } from "../core/paths.ts";
import { KEY_ENV_NAMES, resolveKey } from "../runtime/model.ts";
import {
  EMPTY_MODEL_PINS,
  MAGPIE_MODELS_FILE,
  type MagpieModelPins,
  modelsPath,
  parseMagpieModelPins,
  pinError,
} from "./pi-models.ts";

export type ProfileName = "budget" | "balanced" | "grok";

export interface ProfileDefinition {
  name: ProfileName;
  summary: string;
  pins: MagpieModelPins;
  /** When true, apply only if xAI appears authenticated. */
  requiresXai?: boolean;
}

/**
 * Concrete OpenRouter ids from Magpie's cheap preference list (LIVE_MODEL_PREFERENCE).
 * Not Pi Router floors. Update when the registry preference list changes.
 */
export const PROFILE_DEFINITIONS: Record<ProfileName, ProfileDefinition> = {
  budget: {
    name: "budget",
    summary: "Cheap OpenRouter flash/haiku class for operate + plan; stronger coach pin.",
    pins: {
      default: "openrouter/google/gemini-2.5-flash",
      plan: "openrouter/google/gemini-2.5-flash",
      coach: "openrouter/anthropic/claude-haiku-4.5",
    },
  },
  balanced: {
    name: "balanced",
    summary: "Flash operate, haiku plan, slightly stronger coach (still OpenRouter).",
    pins: {
      default: "openrouter/google/gemini-2.5-flash",
      plan: "openrouter/anthropic/claude-haiku-4.5",
      coach: "openrouter/openai/gpt-4o-mini",
    },
  },
  grok: {
    name: "grok",
    summary: "Only if Pi reports xAI authenticated (RESEARCH-04 still unverified).",
    requiresXai: true,
    pins: {
      default: "xai/grok-4",
      plan: "xai/grok-4",
      coach: "xai/grok-4",
    },
  },
};

export function listProfiles(): ProfileDefinition[] {
  return Object.values(PROFILE_DEFINITIONS);
}

export interface AuthProviders {
  /** Provider names only — never key material. */
  providers: string[];
  sources: string[];
}

function looksLikeSecret(value: string): boolean {
  return /sk-|or-v1-|api[_-]?key|bearer\s+[a-z0-9]/i.test(value);
}

/** Scan env + optional Pi auth.json for provider *names* only. */
export async function detectAuthProviders(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<AuthProviders> {
  const providers = new Set<string>();
  const sources: string[] = [];

  for (const provider of Object.keys(KEY_ENV_NAMES)) {
    if (resolveKey(provider, env)) {
      providers.add(provider);
      sources.push(`env:${provider}`);
    }
  }

  const candidates = [
    path.join(home, ".pi", "agent", "auth.json"),
    path.join(home, ".pi", "auth.json"),
    path.join(home, ".browser-agent-core", "auth.json"),
  ];
  for (const file of candidates) {
    try {
      await access(file);
      const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
      const names = extractProviderNames(raw);
      for (const name of names) providers.add(name);
      if (names.length) sources.push(`file:${path.basename(path.dirname(file))}/auth.json`);
    } catch {
      // optional
    }
  }

  return { providers: [...providers].sort(), sources };
}

function extractProviderNames(raw: unknown): string[] {
  const out = new Set<string>();
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const lower = key.toLowerCase();
    if (["openrouter", "anthropic", "openai", "google", "xai", "ai-gateway"].includes(lower)) {
      out.add(lower);
    }
  }
  if (Array.isArray(record.providers)) {
    for (const item of record.providers) {
      if (typeof item === "string") out.add(item.toLowerCase());
      else if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string") {
        out.add(String((item as { name: string }).name).toLowerCase());
      }
    }
  }
  return [...out];
}

export function recommendProfile(auth: AuthProviders): {
  name: ProfileName;
  reason: string;
} {
  const has = (p: string) => auth.providers.includes(p);
  if (has("xai") && !has("openrouter") && !has("anthropic") && !has("openai")) {
    return { name: "grok", reason: "xAI authenticated; no OpenRouter/Anthropic/OpenAI env seen" };
  }
  if (has("openrouter")) {
    return { name: "budget", reason: "OpenRouter authenticated — prefer budget flash/haiku pins" };
  }
  if (has("anthropic") || has("openai") || has("google")) {
    return {
      name: "budget",
      reason: "API-key provider present; recommend budget OpenRouter pins (apply only on confirm)",
    };
  }
  return {
    name: "budget",
    reason: "no authenticated provider detected — print budget; do not auto-apply",
  };
}

export async function readCurrentPins(root?: string): Promise<MagpieModelPins> {
  try {
    const text = await readFile(modelsPath(coreRoot(root)), "utf8");
    return parseMagpieModelPins(JSON.parse(text) as unknown);
  } catch {
    return { ...EMPTY_MODEL_PINS };
  }
}

export async function applyProfile(
  name: string,
  options: { root?: string; auth?: AuthProviders; force?: boolean } = {},
): Promise<{ ok: boolean; message: string; pins?: MagpieModelPins }> {
  const profile = PROFILE_DEFINITIONS[name as ProfileName];
  if (!profile) {
    return { ok: false, message: `unknown profile ${name}. Use budget, balanced, or grok.` };
  }
  for (const id of Object.values(profile.pins)) {
    const bad = pinError(id);
    if (bad) return { ok: false, message: bad };
  }
  if (profile.requiresXai) {
    const auth = options.auth ?? (await detectAuthProviders());
    if (!auth.providers.includes("xai") && !options.force) {
      return {
        ok: false,
        message:
          "grok profile requires xAI authenticated in Pi (RESEARCH-04). Re-run after /login xai, or pass --force.",
      };
    }
  }

  const root = coreRoot(options.root);
  await mkdir(root, { recursive: true });
  const pins = { ...profile.pins };
  await writeFile(modelsPath(root), `${JSON.stringify(pins, null, 2)}\n`, "utf8");
  return {
    ok: true,
    message: `applied profile ${profile.name} → ${MAGPIE_MODELS_FILE}`,
    pins,
  };
}

export function formatProfileList(): string {
  return listProfiles()
    .map(
      (p) =>
        `${p.name}: ${p.summary}\n  default=${p.pins.default}\n  plan=${p.pins.plan}\n  coach=${p.pins.coach}`,
    )
    .join("\n\n");
}

export function formatRecommend(
  auth: AuthProviders,
  rec: { name: ProfileName; reason: string },
): string {
  const providers = auth.providers.length ? auth.providers.join(", ") : "(none)";
  const text = [
    `authenticated providers: ${providers}`,
    `sources: ${auth.sources.length ? auth.sources.join(", ") : "(none)"}`,
    `recommend: ${rec.name}`,
    `reason: ${rec.reason}`,
    `apply with: magpie profiles apply ${rec.name}`,
    "(does not auto-apply)",
  ].join("\n");
  if (looksLikeSecret(text)) {
    throw new Error("recommend output must not contain secret material");
  }
  return text;
}

/**
 * Parse `magpie profiles …` argv (without the leading `profiles` token).
 * Also accepts `magpie --apply budget` as apply shorthand.
 */
export async function runProfilesCommand(
  argv: string[],
  options: { root?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = options.env ?? process.env;
  let args = [...argv];

  // Support `magpie --apply budget` by rewriting.
  if (args[0] === "--apply" && args[1]) {
    args = ["apply", args[1], ...args.slice(2)];
  }

  const sub = args[0] ?? "list";
  if (sub === "list" || sub === "--list") {
    return { code: 0, stdout: `${formatProfileList()}\n`, stderr: "" };
  }
  if (sub === "recommend") {
    const auth = await detectAuthProviders(env);
    const rec = recommendProfile(auth);
    return { code: 0, stdout: `${formatRecommend(auth, rec)}\n`, stderr: "" };
  }
  if (sub === "apply") {
    const name = args[1];
    const force = args.includes("--force");
    if (!name || name.startsWith("-")) {
      return { code: 2, stdout: "", stderr: "usage: magpie profiles apply <budget|balanced|grok>\n" };
    }
    const auth = await detectAuthProviders(env);
    const result = await applyProfile(name, { root: options.root, auth, force });
    if (!result.ok) return { code: 1, stdout: "", stderr: `${result.message}\n` };
    return {
      code: 0,
      stdout: `${result.message}\n${JSON.stringify(result.pins, null, 2)}\n`,
      stderr: "",
    };
  }
  return {
    code: 2,
    stdout: "",
    stderr: "usage: magpie profiles [list|recommend|apply <name>]\n",
  };
}
