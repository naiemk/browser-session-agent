/**
 * The browser port, across a wire.
 *
 * The product splits the agent from the browser: the agent runs on a server and the
 * browser runs on the operator's desktop, joined by a websocket. This is the pair that
 * makes that split invisible to the core - a client implementing `BrowserPort` by calling,
 * and a dispatcher answering with a real port on the other side.
 *
 * It is short, and that is the point. It only exists because the port was made
 * serializable: every method takes data and returns data, so there is nothing to marshal
 * by hand. When the port still handed out a live Playwright page, this file was not
 * writable at all.
 */

import type { BrowserPort, ProbeLimits } from "../../core/browser.ts";
import type { Observation, PageFacts, WaitSpec } from "../../core/types.ts";
import type { ProbeResult } from "../../core/probe.ts";
import type { AffordanceSurvey } from "../../core/survey.ts";

/** Anything that can carry a method name and arguments and bring back a result. */
export interface RpcCaller {
  call(method: string, args: unknown[]): Promise<unknown>;
}

export const PORT_RPC_PREFIX = "port.";

/**
 * Methods the dispatcher will answer. Listed rather than derived so adding a port method
 * is a deliberate act on both sides, and a test can hold the two in step.
 */
export const PORT_RPC_METHODS = [
  "openTab",
  "openIsolatedTab",
  "closeTab",
  "observe",
  "facts",
  "probe",
  "survey",
  "navigate",
  "click",
  "fill",
  "selectOption",
  "scroll",
  "setInputFiles",
  "waitFor",
  "screenshot",
] as const;

export class RpcBrowserPort implements BrowserPort {
  /**
   * The newest observation per tab, remembered locally.
   *
   * `lastObservation` is the one read a caller expects to be free, and a round trip is
   * not free. Every observation passes through here anyway, so caching it costs nothing.
   */
  private readonly seen = new Map<string, Observation>();

  constructor(private readonly rpc: RpcCaller) {}

  private call<T>(method: string, args: unknown[]): Promise<T> {
    return this.rpc.call(`${PORT_RPC_PREFIX}${method}`, args) as Promise<T>;
  }

  async openTab(url?: string): Promise<string> {
    return this.call("openTab", [url]);
  }

  async openIsolatedTab(url: string): Promise<string> {
    return this.call("openIsolatedTab", [url]);
  }

  async closeTab(tabId: string): Promise<void> {
    this.seen.delete(tabId);
    await this.call("closeTab", [tabId]);
  }

  async observe(tabId?: string): Promise<Observation> {
    const observation = await this.call<Observation>("observe", [tabId]);
    this.seen.set(observation.tabId, observation);
    return observation;
  }

  async facts(tabId?: string): Promise<PageFacts> {
    const facts = await this.call<PageFacts>("facts", [tabId]);
    this.seen.set(facts.observation.tabId, facts.observation);
    return facts;
  }

  lastObservation(tabId?: string): Observation | undefined {
    if (tabId) return this.seen.get(tabId);
    return [...this.seen.values()].pop();
  }

  async probe(query: unknown, tabId?: string, limits?: ProbeLimits): Promise<ProbeResult> {
    return this.call("probe", [query, tabId, limits]);
  }

  async survey(tabId?: string): Promise<AffordanceSurvey> {
    return this.call("survey", [tabId]);
  }

  async navigate(tabId: string | undefined, url: string, timeoutMs: number): Promise<void> {
    await this.call("navigate", [tabId, url, timeoutMs]);
  }

  async click(tabId: string | undefined, ref: string, timeoutMs: number): Promise<void> {
    await this.call("click", [tabId, ref, timeoutMs]);
  }

  async fill(
    tabId: string | undefined,
    ref: string,
    text: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.call("fill", [tabId, ref, text, timeoutMs]);
  }

  async selectOption(
    tabId: string | undefined,
    ref: string,
    value: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.call("selectOption", [tabId, ref, value, timeoutMs]);
  }

  async scroll(
    tabId: string | undefined,
    ref: string | undefined,
    dy: number | undefined,
    timeoutMs: number,
  ): Promise<void> {
    await this.call("scroll", [tabId, ref, dy, timeoutMs]);
  }

  async setInputFiles(
    tabId: string | undefined,
    ref: string,
    files: string[],
    timeoutMs: number,
  ): Promise<void> {
    await this.call("setInputFiles", [tabId, ref, files, timeoutMs]);
  }

  async waitFor(tabId: string | undefined, spec: WaitSpec, timeoutMs: number): Promise<void> {
    await this.call("waitFor", [tabId, spec, timeoutMs]);
  }

  async screenshot(tabId: string | undefined, path: string): Promise<void> {
    await this.call("screenshot", [tabId, path]);
  }

  /** The browser belongs to the desktop; a finished task must not close it. */
  async close(): Promise<void> {
    this.seen.clear();
  }
}

/**
 * Answer a port call against a real port.
 *
 * Returns `{ handled: false }` for anything that is not a port method, so the existing
 * session dispatcher keeps working alongside this during the cutover.
 */
export async function dispatchPortRpc(
  port: BrowserPort,
  method: string,
  args: unknown[],
): Promise<{ handled: true; result: unknown } | { handled: false }> {
  if (!method.startsWith(PORT_RPC_PREFIX)) return { handled: false };
  const name = method.slice(PORT_RPC_PREFIX.length);

  /*
   * JSON has no `undefined`, so an omitted optional argument arrives as `null` and a
   * default parameter never fires. Normalizing here keeps that a wire concern: the core
   * should not have to know it is sometimes called from far away.
   */
  const arg = <T>(index: number): T => (args[index] ?? undefined) as T;
  const tab = (index: number) => arg<string | undefined>(index);

  switch (name) {
    case "openTab":
      return { handled: true, result: await port.openTab(arg<string | undefined>(0)) };
    case "openIsolatedTab":
      return { handled: true, result: await port.openIsolatedTab(arg<string>(0)) };
    case "closeTab":
      return { handled: true, result: await port.closeTab(arg<string>(0)) };
    case "observe":
      return { handled: true, result: await port.observe(tab(0)) };
    case "facts":
      return { handled: true, result: await port.facts(tab(0)) };
    case "probe":
      return {
        handled: true,
        result: await port.probe(arg(0), tab(1), arg<ProbeLimits | undefined>(2)),
      };
    case "survey":
      return { handled: true, result: await port.survey(tab(0)) };
    case "navigate":
      return {
        handled: true,
        result: await port.navigate(tab(0), arg<string>(1), arg<number>(2)),
      };
    case "click":
      return { handled: true, result: await port.click(tab(0), arg<string>(1), arg<number>(2)) };
    case "fill":
      return {
        handled: true,
        result: await port.fill(tab(0), arg<string>(1), arg<string>(2), arg<number>(3)),
      };
    case "selectOption":
      return {
        handled: true,
        result: await port.selectOption(tab(0), arg<string>(1), arg<string>(2), arg<number>(3)),
      };
    case "scroll":
      return {
        handled: true,
        result: await port.scroll(
          tab(0),
          arg<string | undefined>(1),
          arg<number | undefined>(2),
          arg<number>(3),
        ),
      };
    case "setInputFiles":
      return {
        handled: true,
        result: await port.setInputFiles(
          tab(0),
          arg<string>(1),
          arg<string[]>(2),
          arg<number>(3),
        ),
      };
    case "waitFor":
      return {
        handled: true,
        result: await port.waitFor(tab(0), arg<WaitSpec>(1), arg<number>(2)),
      };
    case "screenshot":
      return { handled: true, result: await port.screenshot(tab(0), arg<string>(1)) };
    default:
      return { handled: false };
  }
}
