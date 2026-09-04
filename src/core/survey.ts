/**
 * What this page says you can do here.
 *
 * The agent picked the first workable route it saw instead of looking at the routes on
 * offer. The tempting fix is to teach it what each site can do, which is hopeless: it
 * needs writing per site, it goes stale, and for a well-known site the model already knows
 * while for a custom app nothing we cached will help.
 *
 * There is a much better property to lean on, and it is one of the few places the browser
 * is *easier* than a repository: interfaces advertise their own capabilities. A navigation
 * bar exists precisely so a human can find out what is possible here. A repository has no
 * nav bar; capability is implicit in the code and must be inferred. So the affordances can
 * simply be read, on a site nobody has ever seen, with no stored knowledge at all.
 *
 * This groups and dedupes rather than dumping every link, because the point is a short
 * list of candidate routes the agent can weigh against each other. It follows nothing: a
 * survey that navigated would be the very commitment it exists to postpone.
 */

import type { Page } from "playwright";
import type { Ledger } from "./ledger.ts";
import { probe } from "./probe.ts";

export interface Affordance {
  name: string;
  href?: string;
}

export interface AffordanceSurvey {
  url: string;
  title: string;
  /** Links inside navigation landmarks: what the app says its main areas are. */
  navigation: Affordance[];
  /** Tablists and anything else that switches a view in place. */
  tabs: Affordance[];
  /** Ways to ask the app a question instead of browsing for the answer. */
  search: Affordance[];
  /** Links in the main content that look like routes rather than prose. */
  content: Affordance[];
  /** Buttons: things that would change something, listed but never pressed. */
  actions: Affordance[];
  truncated: boolean;
}

const PER_GROUP = 15;

/**
 * Landmarks first, because a link's meaning depends on where it sits. The same anchor is a
 * primary route inside a nav and an incidental mention inside an article.
 */
const NAV_SELECTOR = "nav, header, aside, [role=navigation], [role=banner]";
const TAB_SELECTOR = "[role=tab], [role=tablist] a, [role=tablist] button";
const SEARCH_SELECTOR =
  'input[type=search], input[name*=search i], input[placeholder*=search i], [role=searchbox], form[role=search] input';

interface RawElement {
  name?: string | null;
  text?: string | null;
  href?: string | null;
  placeholder?: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Same destination or same label twice is one affordance, not two. */
function dedupe(items: Affordance[]): { items: Affordance[]; truncated: boolean } {
  const seen = new Set<string>();
  const out: Affordance[] = [];
  for (const item of items) {
    if (!item.name) continue;
    const key = item.href ? `h:${item.href}` : `n:${item.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return { items: out.slice(0, PER_GROUP), truncated: out.length > PER_GROUP };
}

async function read(
  page: Page,
  select: string,
  fields: Array<"name" | "text" | "href" | "placeholder">,
): Promise<RawElement[]> {
  try {
    const result = await probe(page, { kind: "elements", select, fields, limit: 60 });
    return ((result.data as { elements?: RawElement[] }).elements ?? []) as RawElement[];
  } catch {
    // A selector no browser engine likes, or a page that went away mid-read. A survey
    // returning less is fine; a survey that throws would push the agent back to guessing.
    return [];
  }
}

function toAffordances(raw: RawElement[]): Affordance[] {
  return raw.map((element) => {
    const name = clean(element.text) || clean(element.name) || clean(element.placeholder);
    const href = clean(element.href);
    return href ? { name, href } : { name };
  });
}

/**
 * Read the routes this page offers, following none of them.
 */
export async function surveyAffordances(
  page: Page,
  options: { ledger?: Ledger; entityId?: string } = {},
): Promise<AffordanceSurvey> {
  const meta = (await probe(page, { kind: "page_meta" })).data as { url: string; title: string };

  const navLinks = await read(
    page,
    NAV_SELECTOR.split(", ")
      .map((landmark) => `${landmark} a[href]`)
      .join(", "),
    ["text", "href"],
  );
  const tabLinks = await read(page, TAB_SELECTOR, ["text", "name", "href"]);
  const searchBoxes = await read(page, SEARCH_SELECTOR, ["name", "placeholder"]);
  const mainLinks = await read(page, "main a[href], [role=main] a[href], body > a[href]", [
    "text",
    "href",
  ]);
  const buttons = await read(page, "button, [role=button], input[type=submit]", ["text", "name"]);

  const navigation = dedupe(toAffordances(navLinks));
  const tabs = dedupe(toAffordances(tabLinks));
  const search = dedupe(toAffordances(searchBoxes));
  const inNav = new Set(navigation.items.map((item) => item.href).filter(Boolean));
  const content = dedupe(toAffordances(mainLinks).filter((item) => !inNav.has(item.href)));
  const actions = dedupe(toAffordances(buttons));

  const survey: AffordanceSurvey = {
    url: meta.url,
    title: meta.title,
    navigation: navigation.items,
    tabs: tabs.items,
    search: search.items,
    content: content.items,
    actions: actions.items,
    truncated:
      navigation.truncated ||
      tabs.truncated ||
      search.truncated ||
      content.truncated ||
      actions.truncated,
  };

  await options.ledger?.append({
    type: "probe",
    entityId: options.entityId,
    intent: `survey what ${meta.url} offers`,
    payload: {
      counts: {
        navigation: survey.navigation.length,
        tabs: survey.tabs.length,
        search: survey.search.length,
        content: survey.content.length,
        actions: survey.actions.length,
      },
    },
  });

  return survey;
}
