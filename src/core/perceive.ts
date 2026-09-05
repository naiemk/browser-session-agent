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

  /*
   * A ref belongs to an element for as long as the element lasts.
   *
   * Refs used to be positional and reassigned from scratch on every look, so inserting
   * one row at the top of a list renumbered every row below it. That is why the card has
   * to say refs go stale, and it is what makes it impossible to describe a page as a
   * change from the last one: an unchanged control cannot be left out of a snapshot if
   * leaving it out also takes away the only way to address it.
   *
   * The marker is already in the DOM, so keeping it is enough. New elements are numbered
   * above every ref the page is already carrying, so a fresh number never collides with
   * one the model is still holding. Navigation replaces the document and the numbering
   * starts again, which is correct: that is a different page.
   */
  let seq = 0;
  for (const el of document.querySelectorAll("[" + REF_ATTR + "]")) {
    const existing = Number(String(el.getAttribute(REF_ATTR)).slice(1));
    if (Number.isFinite(existing) && existing > seq) seq = existing;
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

  // A label wrapping its control also contains that control's text, so
  // "<label>Location <select><option>Remote</option>…" would otherwise be named
  // "Location Remote NYC". Strip nested controls before reading the label.
  const labelTextFor = (el) => {
    const label = el.closest ? el.closest("label") : null;
    if (!label) return "";
    const copy = label.cloneNode(true);
    for (const nested of copy.querySelectorAll("input, select, textarea, button, option")) {
      nested.remove();
    }
    return clean(copy.textContent);
  };

  /*
   * The text of the row a control sits in.
   *
   * A list row routinely spreads one thing's identity across siblings: an anchor holding
   * a handle, a span beside it holding the display name. Reading only the anchor's own
   * text throws half of it away, and then a task like "find Varya" cannot be matched
   * against a row whose anchor says "v_varvar" - the two never appear together anywhere
   * the agent can see.
   *
   * Row containers, not arbitrary ancestors: going up until the text got long would pick
   * up the whole list. This is a structural property of lists rather than a fact about
   * any site.
   */
  const ROW = "li, tr, [role='listitem'], [role='row'], [role='option'], [role='treeitem']";
  const rowTextFor = (el, name) => {
    const row = el.closest ? el.closest(ROW) : null;
    if (!row) return undefined;
    const text = clean(row.innerText || row.textContent).slice(0, 120);
    if (!text || text === name) return undefined;
    // Only when it adds something the control's own name does not already carry.
    return text.includes(name) && text.length <= name.length + 2 ? undefined : text;
  };

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

  /*
   * Site furniture, from the document's own landmarks.
   *
   * Every page carries a header, a nav and a footer that are the same on every page of
   * the site, and on a crowded page they crowd out the thing the agent came for: a
   * follower dialog arrived as eleven navigation links, fifteen footer links and
   * fourteen rows of the list. Which controls those are is a structural question HTML
   * already answers, so nothing here needs to know what site it is on.
   *
   * Marked, never dropped: a nav link is often exactly the route the agent wants.
   */
  const LANDMARK = "nav, footer, header, [role='navigation'], [role='contentinfo'], [role='banner']";
  const inLandmark = (el) => Boolean(el.closest && el.closest(LANDMARK));

  // The name of a control that has no text of its own: an image link, a bare icon.
  // Without this a photo grid arrives as a dozen controls all called "a".
  const borrowedName = (el) => {
    const image = el.querySelector ? el.querySelector("img[alt], [aria-label]") : null;
    const fromImage = image
      ? clean(image.getAttribute("alt") || image.getAttribute("aria-label"))
      : "";
    if (fromImage) return fromImage;
    const title = clean(el.getAttribute("title"));
    if (title) return title;
    const href = el.tagName.toLowerCase() === "a" ? el.getAttribute("href") || "" : "";
    const tail = href.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() || "";
    return tail && tail !== "" ? tail : "";
  };

  const nodes = [...document.querySelectorAll(selector)].filter(
    (el) => visible(el) || editorLike(el),
  );

  const controls = nodes.map((el) => {
    let ref = el.getAttribute(REF_ATTR) || "";
    if (!ref) {
      seq += 1;
      ref = "e" + seq;
      el.setAttribute(REF_ATTR, ref);
    }
    const tag = el.tagName.toLowerCase();
    const labelText = labelTextFor(el).slice(0, 80);
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
      borrowedName(el).slice(0, 80) ||
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
      chrome: inLandmark(el) || undefined,
      value,
      disabled: el.disabled || undefined,
      checked: el.checked || undefined,
      required: el.required || el.getAttribute("aria-required") === "true" || undefined,
      inputType,
      submits: submits || undefined,
      href: tag === "a" ? el.href || undefined : undefined,
      row: rowTextFor(el, name),
    };
  });

  /*
   * A short summary, not the content.
   *
   * This used to be the only place a modal's text appeared, truncated to 160 characters -
   * so a follower list of hundreds of rows arrived as one clipped string and the agent
   * reasoned from a fragment. The rows inside a dialog are ordinary controls and are
   * enumerated above, each now carrying its own row text, so this can stay a summary.
   */
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

/**
 * A chance to drop controls the page is carrying but the agent cannot act on.
 *
 * Runs before the budget, and that ordering is the whole value of it. A control buried
 * under an open modal which keeps its slot in an 80-control cap has taken that slot from
 * something clickable, so filtering afterwards would fix what the model is shown without
 * fixing what it is shown *instead*.
 */
export type ControlFilter = (controls: Control[], page: Page) => Promise<Control[]>;

export async function perceive(
  page: Page,
  context: PerceiveContext,
  filter?: ControlFilter,
): Promise<Observation> {
  const collected = (await page.evaluate(COLLECT)) as Collected;
  // Everything downstream counts, diffs and ranks what is present, not what was found: a
  // control we are deliberately not offering should not appear in the delta, and should
  // not inflate the remainder the model is told about.
  const present = filter ? await filter(collected.controls, page) : collected.controls;
  const { controls, truncated } = compactControls(present);
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
    changes: diffControls(context.previous?.controls, present),
    truncated: truncated || undefined,
    // The page, not the filtered list: a buried control still exists, and the remainder
    // the model is told has to count it. Filtering decides what is offered, not what was
    // there.
    totalControls: collected.controls.length,
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
