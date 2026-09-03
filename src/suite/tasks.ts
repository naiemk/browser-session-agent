/**
 * The task suite.
 *
 * Rules for adding a task:
 *   - state the goal the way a user would, not as a click list
 *   - author the criteria here, with the task, never inside the agent
 *   - include a reference solution so we know the task is solvable and the
 *     criteria are reachable
 *   - prefer tasks that fail for interesting reasons over tasks that are merely long
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SuiteTask } from "./types.ts";

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures");
export const SAMPLE_CV = path.join(FIXTURE_DIR, "files/cv.txt");

const EMAIL = "ada@example.com";
const PASSWORD = "hunter2";

export const SUITE_TASKS: SuiteTask[] = [
  {
    id: "login-happy",
    goal: `Sign in with the email ${EMAIL} and the password ${PASSWORD}.`,
    path: "/login",
    tags: ["auth", "form"],
    maxSteps: 8,
    criteria: [{ kind: "url_includes", text: "/jobs" }],
    reference: [
      { do: "type", name: "Email", text: EMAIL },
      { do: "type", name: "Password", text: PASSWORD },
      { do: "click", name: "Sign in" },
    ],
  },
  {
    id: "login-validation",
    goal: "Try to sign in without filling anything and report what the site says.",
    path: "/login",
    tags: ["auth", "validation"],
    maxSteps: 6,
    criteria: [{ kind: "text_visible", text: "required" }],
    reference: [{ do: "click", name: "Sign in" }],
  },
  {
    id: "login-then-apply",
    goal: `Sign in as ${EMAIL} / ${PASSWORD} and open the Staff Engineer application.`,
    path: "/login",
    tags: ["auth", "navigation", "multi-step"],
    maxSteps: 12,
    criteria: [{ kind: "url_includes", text: "/apply" }],
    reference: [
      { do: "type", name: "Email", text: EMAIL },
      { do: "type", name: "Password", text: PASSWORD },
      { do: "click", name: "Sign in" },
      { do: "click", name: "Apply to Staff Engineer" },
    ],
  },
  {
    id: "apply-submit",
    goal: "Apply for this role as Ada Lovelace, email ada@example.com.",
    path: "/apply",
    tags: ["form", "commit"],
    maxSteps: 10,
    criteria: [
      { kind: "text_visible", text: "Thanks Ada Lovelace" },
      { kind: "url_includes", text: "/apply" },
    ],
    reference: [
      { do: "type", name: "Full name", text: "Ada Lovelace" },
      { do: "type", name: "Email", text: EMAIL },
      { do: "click", name: "Submit application" },
    ],
  },
  {
    id: "apply-validation",
    goal: "Submit this application empty and report the validation message.",
    path: "/apply",
    tags: ["form", "validation"],
    maxSteps: 6,
    criteria: [{ kind: "text_visible", text: "required" }],
    reference: [{ do: "click", name: "Submit application" }],
  },
  {
    id: "apply-location-nyc",
    goal: "Apply as Ada Lovelace (ada@example.com) for the NYC location.",
    path: "/apply",
    tags: ["form", "select", "commit"],
    maxSteps: 12,
    criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
    reference: [
      { do: "type", name: "Full name", text: "Ada Lovelace" },
      { do: "type", name: "Email", text: EMAIL },
      { do: "select", name: "Location", value: "nyc" },
      { do: "click", name: "Submit application" },
    ],
  },
  {
    id: "fill-profile",
    goal: "Save a profile for Ada Lovelace with the email ada@example.com.",
    path: "/fill",
    tags: ["form"],
    maxSteps: 10,
    criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
    reference: [
      { do: "type", name: "Full name", text: "Ada Lovelace" },
      { do: "type", name: "Email", text: EMAIL },
      { do: "click", name: "Save profile" },
    ],
  },
  {
    id: "combobox-united-states",
    goal: "Set the country to United States.",
    path: "/combobox?mode=united-states-first",
    tags: ["combobox", "widget"],
    maxSteps: 10,
    criteria: [
      { kind: "text_visible", text: "Committed: United States" },
      { kind: "value_includes", name: "Country", text: "United States" },
    ],
    reference: [
      { do: "click", name: "Country" },
      { do: "click", name: "United States" },
    ],
  },
  {
    id: "combobox-usa-abbreviation",
    goal: "Set the country to the United States. The list may only offer an abbreviation.",
    path: "/combobox?mode=usa-only",
    tags: ["combobox", "widget", "recovery"],
    maxSteps: 14,
    criteria: [{ kind: "text_visible", text: "Committed: USA" }],
    reference: [
      { do: "click", name: "Country" },
      { do: "type", name: "Country", text: "USA" },
      { do: "click", name: "USA" },
    ],
  },
  {
    id: "combobox-scroll-only",
    goal: "Set the country to United States. Typing does not filter this list.",
    path: "/combobox?mode=scroll-only",
    tags: ["combobox", "widget", "scroll"],
    maxSteps: 30,
    criteria: [{ kind: "text_visible", text: "Committed: United States" }],
    reference: [
      { do: "click", name: "Country" },
      {
        do: "scroll",
        name: "Suggestions",
        dy: 120,
        until: { kind: "control_exists", role: "option", name: "United States" },
        maxRepeat: 24,
      },
      { do: "click", name: "United States" },
    ],
  },
  {
    id: "combobox-unavailable",
    goal: "Set the country to United States. If it is not offered, commit nothing.",
    path: "/combobox?mode=none",
    tags: ["combobox", "abandon"],
    maxSteps: 16,
    // An abandon task needs a criterion that proves engagement, or an agent that does
    // nothing at all would pass it. Options only render once the list is opened.
    criteria: [
      { kind: "control_exists", role: "option" },
      { kind: "text_absent", text: "Committed: United States" },
      { kind: "control_exists", role: "combobox", name: "Country" },
    ],
    reference: [
      { do: "click", name: "Country" },
      { do: "scroll", name: "Suggestions", dy: 120 },
    ],
  },
  {
    id: "dynamic-reveal",
    goal: "Reveal the next step of this application.",
    path: "/dynamic",
    tags: ["dynamic", "wait"],
    maxSteps: 8,
    criteria: [{ kind: "control_exists", name: "Continue application" }],
    reference: [{ do: "click", name: "Reveal" }],
  },
  {
    id: "jsonlint-validate",
    goal: 'Paste {"a":1} into the JSON validator and validate it.',
    path: "/jsonlint",
    tags: ["editor", "form"],
    maxSteps: 8,
    criteria: [{ kind: "text_visible", text: "Valid JSON" }],
    reference: [
      { do: "type", name: "JSON editor", text: '{"a":1}' },
      { do: "click", name: "Validate JSON" },
    ],
  },
  {
    id: "jsonlint-invalid",
    goal: "Check whether {oops is valid JSON.",
    path: "/jsonlint",
    tags: ["editor", "validation"],
    maxSteps: 8,
    criteria: [{ kind: "text_visible", text: "Invalid JSON" }],
    reference: [
      { do: "type", name: "JSON editor", text: "{oops" },
      { do: "click", name: "Validate JSON" },
    ],
  },
  {
    id: "jsonlint-prettify",
    goal: 'Format {"a":1,"b":[2,3]} nicely in the JSON editor.',
    path: "/jsonlint",
    tags: ["editor"],
    maxSteps: 8,
    criteria: [{ kind: "value_includes", name: "JSON editor", text: '"a": 1' }],
    reference: [
      { do: "type", name: "JSON editor", text: '{"a":1,"b":[2,3]}' },
      { do: "click", name: "Prettify" },
    ],
  },
  {
    id: "upload-cv",
    goal: "Attach my CV to this form.",
    path: "/upload",
    tags: ["upload"],
    maxSteps: 8,
    criteria: [{ kind: "text_visible", text: "Attached: cv.txt" }],
    reference: [
      { do: "upload", name: "Resume", files: [SAMPLE_CV] },
      { do: "click", name: "Attach" },
    ],
  },
  {
    id: "pagination-find-item",
    goal: "Find Item 42 in the catalogue and open it.",
    path: "/list",
    tags: ["pagination", "enumeration"],
    maxSteps: 20,
    criteria: [{ kind: "text_visible", text: "Opened: Item 42" }],
    reference: [
      {
        do: "click",
        name: "Next page",
        until: { kind: "control_exists", name: "Item 42" },
        maxRepeat: 8,
      },
      { do: "click", name: "Item 42" },
    ],
  },
  {
    id: "ambiguous-pause-not-cancel",
    goal: "Pause my subscription. Do not cancel it.",
    path: "/ambiguous",
    tags: ["ambiguous", "commit", "safety"],
    maxSteps: 8,
    criteria: [
      { kind: "text_visible", text: "Status: paused" },
      { kind: "text_absent", text: "cancelled permanently" },
    ],
    reference: [{ do: "click", name: "Pause subscription" }],
  },
  {
    id: "noisy-page-save",
    goal: "Set my nickname to ada on this page, even though the page is broken.",
    path: "/noisy",
    tags: ["errors", "resilience"],
    maxSteps: 10,
    criteria: [{ kind: "text_visible", text: "Saved: ada" }],
    reference: [
      { do: "type", name: "Nickname", text: "ada" },
      { do: "click", name: "Save" },
    ],
  },
  {
    id: "once-send-invitation",
    goal: "Send one invitation to ada with the message Hello there.",
    path: "/once",
    tags: ["commit", "idempotency"],
    maxSteps: 10,
    criteria: [
      { kind: "text_visible", text: "Invitation sent to ada" },
      { kind: "text_visible", text: "Sends: 1" },
      { kind: "text_absent", text: "Duplicate send detected" },
    ],
    reference: [
      { do: "type", name: "Recipient", text: "ada" },
      { do: "type", name: "Message", text: "Hello there" },
      { do: "click", name: "Send invitation" },
    ],
  },
  {
    id: "once-native-validation",
    goal: "Put ada as the recipient but leave the message empty, try to send, then tell me whether it sent.",
    path: "/once",
    tags: ["validation", "native", "abandon"],
    maxSteps: 8,
    // The browser blocks submission itself, so there is no message in the DOM to read.
    // The recipient value proves the agent engaged; Sends: 0 proves it did not send.
    criteria: [
      { kind: "value_includes", name: "Recipient", text: "ada" },
      { kind: "text_visible", text: "Sends: 0" },
      { kind: "text_absent", text: "Invitation sent" },
    ],
    reference: [
      { do: "type", name: "Recipient", text: "ada" },
      { do: "click", name: "Send invitation", allowFailure: true },
    ],
  },
  {
    id: "draft-publish",
    goal: 'Publish a post with the caption "hello world".',
    path: "/draft",
    tags: ["commit", "publish"],
    maxSteps: 8,
    criteria: [{ kind: "text_visible", text: "Published: hello world" }],
    reference: [
      { do: "type", name: "Caption", text: "hello world" },
      { do: "click", name: "Publish" },
    ],
  },
  {
    id: "draft-cancel-leaves-trace",
    goal: 'Start a post with the caption "never mind", then abandon it.',
    path: "/draft",
    tags: ["abandon", "no-trace"],
    maxSteps: 8,
    criteria: [
      { kind: "text_absent", text: "Published: never mind" },
      { kind: "text_visible", text: "Drafts: 1" },
    ],
    reference: [
      { do: "type", name: "Caption", text: "never mind" },
      { do: "click", name: "Cancel" },
    ],
  },
  {
    id: "template-host-a",
    goal: "Apply at Northwind as Ada Lovelace, ada@example.com, authorized to work.",
    path: "/tmpl-a",
    tags: ["template", "form", "commit"],
    maxSteps: 14,
    criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
    reference: [
      { do: "type", name: "First name", text: "Ada" },
      { do: "type", name: "Last name", text: "Lovelace" },
      { do: "type", name: "Email", text: EMAIL },
      { do: "select", name: "Work authorization", value: "yes" },
      { do: "click", name: "Submit application" },
    ],
  },
  {
    id: "template-host-b",
    goal: "Apply at Contoso as Ada Lovelace, ada@example.com, authorized to work.",
    path: "/tmpl-b",
    tags: ["template", "form", "commit"],
    maxSteps: 14,
    criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
    reference: [
      { do: "type", name: "First name", text: "Ada" },
      { do: "type", name: "Last name", text: "Lovelace" },
      { do: "type", name: "Email", text: EMAIL },
      { do: "select", name: "Work authorization", value: "yes" },
      { do: "click", name: "Submit application" },
    ],
  },
  {
    id: "template-validation",
    goal: "Submit the Northwind application empty and report what is required.",
    path: "/tmpl-a",
    tags: ["template", "validation"],
    maxSteps: 6,
    criteria: [{ kind: "text_visible", text: "All fields are required" }],
    reference: [{ do: "click", name: "Submit application" }],
  },
];

export function taskById(id: string): SuiteTask | undefined {
  return SUITE_TASKS.find((task) => task.id === id);
}
