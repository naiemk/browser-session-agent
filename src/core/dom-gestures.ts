/// <reference lib="dom" />
import type { Locator, Page } from "playwright";

/**
 * Gestures that do not go through CDP mouse/keyboard Input.
 *
 * Headed Chrome treats Input.dispatchMouseEvent / insertText as a reason to become the
 * frontmost app, which yanks OS focus out of the editor. HTMLElement.click() and
 * setting input.value stay inside the page.
 */
export async function clickWithoutOsFocus(locator: Locator, timeoutMs: number): Promise<void> {
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
    else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
}

export async function fillWithoutOsFocus(
  locator: Locator,
  text: string,
  timeoutMs: number,
): Promise<void> {
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.evaluate((el, value) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
}

export async function selectWithoutOsFocus(
  locator: Locator,
  value: string,
  timeoutMs: number,
): Promise<void> {
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  const tag = await locator.evaluate((el) => el.tagName);
  if (tag !== "SELECT") {
    await locator.selectOption(value, { timeout: timeoutMs });
    return;
  }
  await locator.evaluate((el, next) => {
    const select = el as HTMLSelectElement;
    select.value = next;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

export async function scrollWithoutOsFocus(
  page: Page,
  locator: Locator | undefined,
  dy: number,
  timeoutMs: number,
): Promise<void> {
  if (!locator) {
    await page.evaluate((delta) => window.scrollBy(0, delta), dy);
    return;
  }
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.evaluate((el, delta) => {
    const canScroll = (node: Element) =>
      node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2;
    let target: Element | null = el;
    if (target && !canScroll(target)) {
      let parent = target.parentElement;
      while (parent && !canScroll(parent)) parent = parent.parentElement;
      if (parent) target = parent;
    }
    if (target) target.scrollTop += delta;
    else window.scrollBy(0, delta);
  }, dy);
}
