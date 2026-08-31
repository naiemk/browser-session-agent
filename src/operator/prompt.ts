import type { Control, Observation } from "../domain/types.ts";
import { isEditorControl } from "../domain/observe-diff.ts";

const DEFAULT_JSON = {
  name: "Ada Lovelace",
  skills: ["math", "programming"],
  active: true,
  years: 36,
};

export interface PromptIntent {
  goal: string;
  url?: string;
  jsonText?: string;
  unformattedJson?: string;
  wantValidate: boolean;
  wantPrettify: boolean;
  wantCopy: boolean;
}

export interface PromptStep {
  tool: string;
  summary: string;
}

export function interpretPrompt(prompt: string, fallbackUrl?: string): PromptIntent {
  const url = prompt.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, "") ?? fallbackUrl;
  const jsonText = extractJson(prompt);
  const wantCreate = /unformatted|minif(?:y|ied)|create/.test(prompt.toLowerCase());
  let unformattedJson: string | undefined;
  if (jsonText) {
    try {
      unformattedJson = JSON.stringify(JSON.parse(jsonText));
    } catch {
      unformattedJson = jsonText;
    }
  } else if (wantCreate) {
    unformattedJson = JSON.stringify(DEFAULT_JSON);
  }
  const lower = prompt.toLowerCase();
  return {
    goal: prompt.trim(),
    url: url ?? (/\bjsonlint\b/i.test(prompt) ? "https://jsonlint.com/" : undefined),
    jsonText,
    unformattedJson,
    wantValidate: /validat|lint/.test(lower),
    wantPrettify: /prettif|beautif|format/.test(lower),
    wantCopy: /copy|return|paste back|copy back/.test(lower),
  };
}

export function extractJson(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // keep scanning
    }
  }
  const start = text.search(/[\[{]/);
  if (start < 0) return undefined;
  for (let end = text.length; end > start + 1; end--) {
    const slice = text.slice(start, end).trim();
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      // shrink
    }
  }
  return undefined;
}

export function isPrettyJson(text: string): boolean {
  try {
    JSON.parse(text);
  } catch {
    return false;
  }
  return text.includes("\n") && /  +/.test(text);
}

export function jsonEqual(left: string, right: string): boolean {
  try {
    return JSON.stringify(JSON.parse(left)) === JSON.stringify(JSON.parse(right));
  } catch {
    return false;
  }
}

export function findEditor(observation: Observation): Control | undefined {
  const editors = observation.controls.filter(isEditorControl);
  return (
    editors.find((c) => /json|editor|code/i.test(c.name)) ??
    editors.sort((a, b) => (b.value?.length ?? 0) - (a.value?.length ?? 0))[0]
  );
}

export function findButton(observation: Observation, pattern: RegExp): Control | undefined {
  return observation.controls.find(
    (c) =>
      (c.tag === "button" || c.role === "button" || c.inputType === "submit") &&
      pattern.test(c.name),
  );
}
