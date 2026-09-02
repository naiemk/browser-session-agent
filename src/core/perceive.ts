/**
 * Perception: one compact semantic snapshot of a page.
 *
 * Written fresh for the new core (D34). The behaviours below are deliberately
 * ported from the old system because they were learned from real pages, not
 * because the code was reusable:
 *   - editor-like elements are collected even when zero-sized (Monaco, CodeMirror)
 *   - Monaco values come from the editor API, not the DOM text
 *   - password values are redacted at the source, never leaving the page as plaintext
 *   - refs are assigned in document order and re-tagged on every observation
 */

import type { Page } from "playwright";
import { compactControls, diffControls } from "./diff.ts";
import { shortId } from "./ids.ts";
import type { Control, Observation } from "./types.ts";

/** Attribute used to address controls. Distinct from the old system's marker. */
export const REF_ATTR = "data-core-ref";

interface Collected {
  url: string;
  title: string;
  controls: Control[];
  dialogs: string[];
  errors: string[];
}

const COLLECT = `(() => {
  const REF_ATTR = "data-core-ref";
  const selector = [
    "a", "button", "input", "select", "textarea",
    '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="checkbox"]',
    '[role="radio"]', '[role="option"]', '[role="listbox"]', '[role="combobox"]',
    '[role="menuitem"]', '[role="tab"]', '[contenteditable="true"]',
  ].join(",");

  for (const el of document.querySelectorAll("[" + REF_ATTR + "]")) {
    el.removeAttribute(REF_ATTR);
  }

  const visible = (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Zero-sized editors are real and must survive: Monaco hides its textarea.
  const editorLike = (el) =>
    el.tagName.toLowerCase() === "textarea" ||
    el.isContentEditable === true ||
    el.getAttribute("role") === "textbox";

  const clean = (s) => (s || "").trim().replace(/\\s+/g, " ");

  const monacoValue = () => {
    const api = window.monaco && window.monaco.editor && window.monaco.editor.getEditors
      ? window.monaco.editor.getEditors()[0]
      : null;
    if (api && typeof api.getValue === "function") {
      const fromApi = clean(api.getValue());
      if (fromApi) return fromApi;
    }
    const host = document.querySelector(".monaco-editor .view-lines");
    return host ? clean(host.innerText) : "";
  };

  const nodes = [...document.querySelectorAll(selector)].filter(
    (el) => visible(el) || editorLike(el),
  );

  const controls = nodes.map((el, index) => {
    const ref = "e" + (index + 1);
    el.setAttribute(REF_ATTR, ref);
    const tag = el.tagName.toLowerCase();
    const label = el.closest("label");
    const labelText = clean(label && label.textContent ? label.textContent : "").slice(0, 80);
    let role = el.getAttribute("role") || "";
    let inputType = el.type || undefined;
    if (el.isContentEditable) {
      role = role || "textbox";
      inputType = inputType || "contenteditable";
    } else if (tag === "textarea") {
      role = role || "textbox";
      inputType = "textarea";
    } else if (!role) {
      role = el.type || tag;
    }

    const name =
      el.getAttribute("aria-label") ||
      labelText ||
      el.getAttribute("name") ||
      el.getAttribute("placeholder") ||
      clean(el.textContent).slice(0, 80) ||
      inputType ||
      tag;

    let value;
    if (inputType === "password") {
      value = el.value ? "***" : "";
    } else if (el.isContentEditable || role === "textbox") {
      const own = clean(el.innerText || el.textContent || el.value);
      value = own || monacoValue() || undefined;
    } else {
      value = clean(el.value) || undefined;
    }

    const form = typeof el.closest === "function" ? el.closest("form") : null;
    const submits = Boolean(
      form &&
        (el.type === "submit" ||
          (tag === "button" && (el.type === "submit" || !el.getAttribute("type")))),
    );

    return {
      ref,
      role,
      name,
      tag,
      value,
      disabled: el.disabled || undefined,
      checked: el.checked || undefined,
      required: el.required || el.getAttribute("aria-required") === "true" || undefined,
      inputType,
      submits: submits || undefined,
      href: tag === "a" ? el.href || undefined : undefined,
    };
  });

  const dialogs = [...document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog']")]
    .filter(visible)
    .map((el) => clean(el.textContent).slice(0, 160))
    .filter(Boolean);

  const errors = [...document.querySelectorAll("[role='alert'], [aria-invalid='true'], .error")]
    .filter(visible)
    .map((el) => clean(el.textContent).slice(0, 160))
    .filter(Boolean);

  return { url: location.href, title: document.title, controls, dialogs, errors };
})()`;

export interface PerceiveContext {
  tabId: string;
  previous?: Observation;
  consoleErrors?: string[];
  failedRequests?: string[];
}

export async function perceive(page: Page, context: PerceiveContext): Promise<Observation> {
  const collected = (await page.evaluate(COLLECT)) as Collected;
  const { controls, truncated } = compactControls(collected.controls);
  return {
    id: shortId("obs"),
    tabId: context.tabId,
    url: collected.url,
    title: collected.title,
    controls,
    dialogs: collected.dialogs,
    errors: dedupe(collected.errors),
    consoleErrors: (context.consoleErrors ?? []).slice(-8),
    failedRequests: (context.failedRequests ?? []).slice(-8),
    changes: diffControls(context.previous?.controls, collected.controls),
    truncated: truncated || undefined,
    capturedAt: new Date().toISOString(),
  };
}

export async function visibleText(page: Page): Promise<string> {
  return (await page.evaluate("document.body ? document.body.innerText : ''")) as string;
}

export function refSelector(ref: string): string {
  return `[${REF_ATTR}="${ref.replace(/["\\]/g, "\\$&")}"]`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
