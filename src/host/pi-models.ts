/**
 * Operator pins for Magpie phases. Not a cost router (D12).
 *
 * Empty / "session" = leave Ctrl+P alone. "default" on plan/coach inherits the
 * default slot. Concrete values are Pi registry ids (`provider/id`). Floors like
 * `@ultra` are rejected — they do not switch an in-session Magpie turn.
 *
 * `enter` / `leave` stack so /plan → Execute → /coach restores the operate model,
 * and a manual /coach during plan restores the plan model.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { coreRoot } from "../core/paths.ts";
import type { ExtensionAPI, ExtensionContext } from "../pi-api.ts";

export const MODELS_COMMAND = "models";
export const MAGPIE_MODELS_FILE = "models.json";

export type ModelSlot = "default" | "plan" | "coach";

export interface MagpieModelPins {
  default: string;
  plan: string;
  coach: string;
}

export interface MagpieModelHost {
  load(): Promise<MagpieModelPins>;
  resolved(slot: ModelSlot): Promise<string | undefined>;
  enter(slot: ModelSlot, ctx: ExtensionContext): Promise<string | undefined>;
  leave(ctx: ExtensionContext): Promise<void>;
  setPin(slot: ModelSlot, value: string, ctx?: ExtensionContext): Promise<string | undefined>;
}

const SLOTS: readonly ModelSlot[] = ["default", "plan", "coach"];
const SESSION_ALIASES = new Set(["", "session", "none"]);
const FLOOR = /^(?:@(?:low|medium|high|ultra)|low|medium|high|ultra)$/i;

export const EMPTY_MODEL_PINS: MagpieModelPins = { default: "", plan: "", coach: "" };

export function modelsPath(root = coreRoot()): string {
  return path.join(root, MAGPIE_MODELS_FILE);
}

export function parseProviderModel(id: string): { provider: string; modelId: string } | undefined {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return undefined;
  return { provider: id.slice(0, slash), modelId: id.slice(slash + 1) };
}

export function modelKey(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const record = model as { provider?: unknown; id?: unknown };
  if (typeof record.provider !== "string" || typeof record.id !== "string") return undefined;
  if (!record.provider || !record.id) return undefined;
  return `${record.provider}/${record.id}`;
}

function normalizePin(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export function parseMagpieModelPins(raw: unknown): MagpieModelPins {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MODEL_PINS };
  const record = raw as Record<string, unknown>;
  return {
    default: normalizePin(record.default),
    plan: normalizePin(record.plan),
    coach: normalizePin(record.coach),
  };
}

/** Concrete registry id for a slot, or undefined to keep the session model. */
export function resolveModelPin(pins: MagpieModelPins, slot: ModelSlot): string | undefined {
  const seen = new Set<ModelSlot>();
  let current: ModelSlot = slot;
  for (;;) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const value = pins[current];
    if (SESSION_ALIASES.has(value.toLowerCase())) return undefined;
    if (value.toLowerCase() === "default") {
      current = "default";
      continue;
    }
    return value;
  }
}

export function pinError(id: string): string | undefined {
  if (FLOOR.test(id) || id.startsWith("@")) {
    return `${id} is a Pi Router floor, not a Magpie pin. Use provider/id from /models, or leave the slot empty.`;
  }
  if (!parseProviderModel(id)) {
    return `Magpie model pin must be provider/id, session, or default (got ${id})`;
  }
  return undefined;
}

function findInRegistry(ctx: ExtensionContext, id: string): unknown | undefined {
  const parsed = parseProviderModel(id);
  if (!parsed || !ctx.modelRegistry?.find) return undefined;
  return ctx.modelRegistry.find(parsed.provider, parsed.modelId);
}

function availableIds(ctx: ExtensionContext): string[] {
  const list = ctx.modelRegistry?.getAvailable?.() ?? [];
  return list
    .map((model) => modelKey(model))
    .filter((key): key is string => Boolean(key));
}

export function formatPins(pins: MagpieModelPins, current?: string): string {
  const line = (slot: ModelSlot) => {
    const raw = pins[slot] || "session";
    const resolved = resolveModelPin(pins, slot);
    const extra = resolved && resolved !== raw ? ` → ${resolved}` : "";
    return `${slot}: ${raw}${extra}`;
  };
  const now = current ? `session: ${current}` : "session: (unknown)";
  return (
    `Magpie models (${now})\n${line("default")}\n${line("plan")}\n${line("coach")}\n` +
    `Empty = this session's model. plan/coach may be "default".`
  );
}

async function readPinsFile(root: string): Promise<MagpieModelPins> {
  try {
    const text = await readFile(modelsPath(root), "utf8");
    return parseMagpieModelPins(JSON.parse(text) as unknown);
  } catch {
    return { ...EMPTY_MODEL_PINS };
  }
}

async function writePinsFile(root: string, pins: MagpieModelPins): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(modelsPath(root), `${JSON.stringify(pins, null, 2)}\n`, "utf8");
}

function snapshotModel(model: unknown): unknown {
  if (!model || typeof model !== "object") return null;
  return { ...(model as object) };
}

function isSoftSkip(error: string): boolean {
  return /unavailable|unknown/.test(error);
}

export function bindMagpieModels(pi: ExtensionAPI, root = coreRoot()): MagpieModelHost {
  const stack: unknown[] = [];

  async function load(): Promise<MagpieModelPins> {
    return readPinsFile(root);
  }

  async function switchTo(id: string, ctx: ExtensionContext): Promise<string | undefined> {
    const bad = pinError(id);
    if (bad) return bad;
    if (typeof pi.setModel !== "function" || !ctx.modelRegistry?.find) {
      return `Cannot switch to ${id}: Pi setModel/modelRegistry is unavailable`;
    }
    const found = findInRegistry(ctx, id);
    if (!found) return `${id} is not in the Pi model registry`;
    if (modelKey(ctx.model) === id) return undefined;
    if (!ctx.model) {
      return `Cannot switch to ${id}: current session model is unknown`;
    }
    const ok = await pi.setModel(found);
    if (!ok) return `Could not switch to ${id} (check auth)`;
    return undefined;
  }

  async function setPin(slot: ModelSlot, value: string, ctx?: ExtensionContext): Promise<string | undefined> {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (!SESSION_ALIASES.has(lower) && lower !== "default") {
      const bad = pinError(trimmed);
      if (bad) return bad;
      if (ctx?.modelRegistry?.find && !findInRegistry(ctx, trimmed)) {
        return `${trimmed} is not in the Pi model registry`;
      }
    }
    if (lower === "default" && slot === "default") {
      return "default cannot inherit itself; use session or provider/id";
    }
    const pins = await load();
    pins[slot] = SESSION_ALIASES.has(lower) ? "" : trimmed;
    await writePinsFile(root, pins);
    return undefined;
  }

  async function applyDefault(ctx: ExtensionContext): Promise<void> {
    const id = resolveModelPin(await load(), "default");
    if (!id) return;
    const error = await switchTo(id, ctx);
    if (error) ctx.ui.notify(`default model skipped: ${error}`, "warning");
  }

  async function restoreModel(ctx: ExtensionContext, previous: unknown): Promise<void> {
    if (!previous || typeof pi.setModel !== "function") return;
    if (modelKey(ctx.model) === modelKey(previous)) return;
    const key = modelKey(previous);
    const parsed = key ? parseProviderModel(key) : undefined;
    const found =
      parsed && ctx.modelRegistry?.find
        ? ctx.modelRegistry.find(parsed.provider, parsed.modelId)
        : undefined;
    await pi.setModel(found ?? previous);
  }

  async function unwind(ctx: ExtensionContext): Promise<void> {
    while (stack.length > 0) {
      await restoreModel(ctx, stack.pop());
    }
  }

  /**
   * Always push a restore frame so leave() is safe to call. Empty pin / hosted skip
   * push null (leave is a no-op). Hard errors do not push — the caller must not leave.
   */
  async function enter(slot: ModelSlot, ctx: ExtensionContext): Promise<string | undefined> {
    const id = resolveModelPin(await load(), slot);
    if (!id) {
      stack.push(null);
      return undefined;
    }
    const previous = snapshotModel(ctx.model);
    const error = await switchTo(id, ctx);
    if (error && isSoftSkip(error)) {
      ctx.ui.notify(`${slot} model skipped: ${error}`, "warning");
      stack.push(null);
      return undefined;
    }
    if (error) return error;
    stack.push(previous);
    return undefined;
  }

  async function leave(ctx: ExtensionContext): Promise<void> {
    if (stack.length === 0) return;
    await restoreModel(ctx, stack.pop());
  }

  pi.registerCommand(MODELS_COMMAND, {
    description: "Pin Magpie models for default / plan / coach (empty = this session)",
    handler: async (args, ctx) => {
      const pins = await load();
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const slot = parts[0]?.toLowerCase() as ModelSlot | undefined;
      const value = parts.slice(1).join(" ");

      if (!slot) {
        ctx.ui.notify(formatPins(pins, modelKey(ctx.model)));
        return;
      }
      if (!SLOTS.includes(slot)) {
        ctx.ui.notify(`Unknown slot ${slot}. Use default, plan, or coach.`, "error");
        return;
      }

      let next = value;
      if (!next) {
        const choices = ["session", ...(slot === "default" ? [] : ["default"]), ...availableIds(ctx)];
        const picked = await ctx.ui.select(`Magpie ${slot} model`, choices);
        if (!picked) return;
        next = picked;
      }

      const error = await setPin(slot, next, ctx);
      if (error) {
        ctx.ui.notify(error, "error");
        return;
      }
      if (slot === "default") await applyDefault(ctx);
      const updated = await load();
      ctx.ui.notify(`Pinned ${slot} = ${updated[slot] || "session"}`);
    },
  });

  pi.on("session_start", async (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    await unwind(ctx);
    await applyDefault(ctx);
  });

  return {
    load,
    async resolved(slot) {
      return resolveModelPin(await load(), slot);
    },
    enter,
    leave,
    setPin,
  };
}
