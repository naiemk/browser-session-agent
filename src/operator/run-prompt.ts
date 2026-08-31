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

    for (let i = 0; i < maxSteps; i++) {
      const observation = await session.inspect();
      const pageText = await session.worker.pageText(observation.tabId);
      record("browser_inspect", `${observation.url} — ${observation.controls.length} controls`);

      const editor = findEditor(observation);
      const validateBtn = findButton(observation, /validate/i);
      const prettyBtn = findButton(observation, /prettif|beautif|format/i);
      const editorValue = editor?.value ?? "";
      const validBanner = /valid json|json is valid|validated/i.test(pageText);
      const matchesSource =
        !intent.unformattedJson ||
        jsonEqual(editorValue, intent.unformattedJson) ||
        jsonEqual(editorValue, intent.jsonText ?? "");

      if (editor && isPrettyJson(editorValue) && matchesSource && (validBanner || !intent.wantValidate)) {
        const copied = editorValue.trim();
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
        const clicked = await session.act({
          action: "click",
          ref: validateBtn.ref,
          expect: { textVisible: "Valid JSON" },
        });
        record("browser_click", `Clicked ${validateBtn.name}`);
        if (clicked.verification.status === "failed") {
          throw new Error(clicked.recovery ?? "Validate did not produce Valid JSON");
        }
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
