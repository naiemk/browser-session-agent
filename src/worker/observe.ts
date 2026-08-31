import type { Control, Observation } from "../domain/types.ts";
import { compactObservation, diffControls } from "../domain/observe-diff.ts";
import { shortId } from "../domain/ids.ts";
import type { Page } from "playwright";

interface CollectedPage {
  url: string;
  title: string;
  controls: Control[];
  dialogs: string[];
  errors: string[];
}

const COLLECT_SCRIPT = `(() => {
  const selector = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[contenteditable="true"]',
  ].join(",");

  for (const el of document.querySelectorAll("[data-bsa-ref]")) {
    el.removeAttribute("data-bsa-ref");
  }

  const isVisible = (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isEditorLike = (el) =>
    el.tagName.toLowerCase() === "textarea" ||
    el.isContentEditable === true ||
    el.getAttribute("role") === "textbox";

  const nodes = [...document.querySelectorAll(selector)].filter(
    (el) => isVisible(el) || isEditorLike(el),
  );
  const controls = nodes.map((el, index) => {
    const ref = "e" + (index + 1);
    el.setAttribute("data-bsa-ref", ref);
    const input = el;
    const tag = el.tagName.toLowerCase();
    const label = el.closest("label");
    const labelText = (label && label.textContent ? label.textContent : "")
      .trim()
      .replace(/\\s+/g, " ")
      .slice(0, 80);
    let role = el.getAttribute("role") || "";
    let inputType = input.type || undefined;
    if (el.isContentEditable) {
      role = role || "textbox";
      inputType = inputType || "contenteditable";
    } else if (tag === "textarea") {
      role = role || "textbox";
      inputType = "textarea";
    } else if (!role) {
      role = input.type || tag;
    }
    const name =
      el.getAttribute("aria-label") ||
      labelText ||
      el.getAttribute("name") ||
      el.getAttribute("placeholder") ||
      (el.textContent || "").trim().slice(0, 80) ||
      inputType ||
      tag;
    const rawValue = (() => {
      if (inputType === "password") return input.value;
      const own = (el.innerText || el.textContent || input.value || "").trim();
      const looksJson = (s) => s.startsWith("{") || s.startsWith("[");
      if (el.isContentEditable || role === "textbox") {
        if (own && looksJson(own)) return own;
        const api = window.monaco && window.monaco.editor && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0];
        if (api) {
          const fromApi = (api.getValue() || "").trim();
          if (fromApi) return fromApi;
        }
        const monaco = el.closest(".monaco-editor") || document.querySelector(".monaco-editor");
        const lines = monaco && monaco.querySelector(".view-lines");
        const fromMonaco = lines ? (lines.innerText || "").trim() : "";
        if (fromMonaco) return fromMonaco;
      }
      return own || input.value;
    })();
    const value = inputType === "password" ? (rawValue ? "***" : "") : rawValue || undefined;
    return {
      ref,
      role,
      name,
      tag,
      value,
      disabled: el.disabled || undefined,
      checked: input.checked || undefined,
      inputType,
    };
  });

  const dialogs = [...document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog']")]
    .filter(isVisible)
    .map((el) => (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 160))
    .filter(Boolean);

  const errors = [...document.querySelectorAll("[role='alert'], [aria-invalid='true']")]
    .filter(isVisible)
    .map((el) => (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 160))
    .filter(Boolean);

  return {
    url: location.href,
    title: document.title,
    controls,
    dialogs,
    errors,
  };
})()`;

export async function observePage(
  page: Page,
  tabId: string,
  previous: Observation | undefined,
  consoleErrors: string[],
): Promise<Observation> {
  const collected = (await page.evaluate(COLLECT_SCRIPT)) as CollectedPage;
  return compactObservation({
    id: shortId("obs"),
    tabId,
    url: collected.url,
    title: collected.title,
    controls: collected.controls,
    dialogs: collected.dialogs,
    errors: collected.errors,
    consoleErrors: consoleErrors.slice(-8),
    recentChanges: diffControls(previous?.controls, collected.controls),
  });
}

export async function visibleText(page: Page): Promise<string> {
  return page.evaluate("document.body ? document.body.innerText : ''");
}
