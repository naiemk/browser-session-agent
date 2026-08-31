import { BrowserSession } from "../session.ts";
import {
  findButton,
  findEditor,
  interpretPrompt,
  isPrettyJson,
  jsonEqual,
  type PromptIntent,
  type PromptStep,
} from "./prompt.ts";

export interface PromptOperatorOptions {
  home: string;
  headless?: boolean;
  startUrl?: string;
  maxSteps?: number;
}

export interface PromptRunResult {
  ok: boolean;
  prompt: string;
  copiedText: string;
  prettyJson?: unknown;
  steps: PromptStep[];
  url?: string;
  error?: string;
  screenshotPath?: string;
}

const MAX_STEPS = 12;

export async function runBrowserPrompt(
  prompt: string,
  options: PromptOperatorOptions,
): Promise<PromptRunResult> {
  const intent = interpretPrompt(prompt, options.startUrl);
  const session = new BrowserSession({ home: options.home, headless: options.headless ?? true });
  const steps: PromptStep[] = [];
  const maxSteps = options.maxSteps ?? MAX_STEPS;

  const record = (tool: string, summary: string) => {
    steps.push({ tool, summary });
  };

  try {
    if (!intent.url) {
      throw new Error("Prompt did not include a URL to open");
    }
    const state = await session.startRun(intent.goal, intent.url);
    record("browser_start", `Opened ${intent.url} as ${state.runId}`);
    await session.act({
      action: "wait",
      wait: { kind: "text", value: "Validate", timeoutMs: 10_000 },
    });
    record("browser_wait", "Waited for Validate control");
    let didValidate = false;

    for (let i = 0; i < maxSteps; i++) {
      const observation = await session.inspect();
      const pageText = await session.worker.pageText(observation.tabId);
      record("browser_inspect", `${observation.url} — ${observation.controls.length} controls`);

      const editor = findEditor(observation);
      const validateBtn = findButton(observation, /validate/i);
      const prettyBtn = findButton(observation, /prettif|beautif|format/i);
      const editorValue = editor?.value ?? "";
      const validBanner =
        observation.errors.some((e) => /valid json/i.test(e)) ||
        /(^|\n)\s*Valid JSON\s*(\n|$)/.test(pageText);
      const matchesSource =
        !intent.unformattedJson ||
        jsonEqual(editorValue, intent.unformattedJson) ||
        jsonEqual(editorValue, intent.jsonText ?? "");

      if (editor && matchesSource && (validBanner || didValidate || !intent.wantValidate)) {
        const copied = isPrettyJson(editorValue)
          ? editorValue.trim()
          : JSON.stringify(JSON.parse(editorValue), null, 2);
        const screenshotPath = session.store.screenshotPath(state.runId, "copied.png");
        await session.worker.screenshot(observation.tabId, screenshotPath);
        await session.stopRun(state.runId, "completed");
        record("copy_back", `Copied ${copied.length} characters`);
        return {
          ok: true,
          prompt,
          copiedText: copied,
          prettyJson: JSON.parse(copied),
          steps,
          url: observation.url,
          screenshotPath,
        };
      }

      if (!observation.url.includes(new URL(intent.url).pathname) && !observation.url.startsWith(intent.url)) {
        await session.act({
          action: "navigate",
          url: intent.url,
          expect: { urlIncludes: new URL(intent.url).pathname || "/" },
        });
        record("browser_navigate", intent.url);
        continue;
      }

      if (editor && intent.unformattedJson && !matchesSource) {
        await session.act({
          action: "type",
          ref: editor.ref,
          text: intent.unformattedJson,
        });
        record("browser_type", `Pasted unformatted JSON into ${editor.ref}`);
        continue;
      }

      if (intent.wantValidate && validateBtn && !validBanner) {
        await session.act({ action: "click", ref: validateBtn.ref });
        record("browser_click", `Clicked ${validateBtn.name}`);
        didValidate = true;
        await session.act({
          action: "wait",
          wait: { kind: "timeout", timeoutMs: 500 },
        });
        continue;
      }

      if (intent.wantPrettify && prettyBtn && !isPrettyJson(editorValue)) {
        await session.act({ action: "click", ref: prettyBtn.ref });
        record("browser_click", `Clicked ${prettyBtn.name}`);
        continue;
      }

      if (!editor) {
        await session.act({
          action: "wait",
          wait: { kind: "timeout", timeoutMs: 750 },
        });
        record("browser_wait", "Editor not in snapshot yet");
        continue;
      }

      throw new Error(
        `Stuck after inspect of ${observation.url}. editor=${editor?.ref ?? "none"} valid=${validBanner} pretty=${isPrettyJson(editorValue)}`,
      );
    }

    throw new Error(`Exceeded ${maxSteps} browser steps`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (session.currentRunId) {
      await session.stopRun(session.currentRunId, "failed").catch(() => undefined);
    }
    return {
      ok: false,
      prompt,
      copiedText: "",
      steps,
      error: message,
    };
  } finally {
    await session.worker.stop().catch(() => undefined);
  }
}

export type { PromptIntent, PromptStep };
