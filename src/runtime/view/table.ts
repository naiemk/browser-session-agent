/**
 * The control list as a table instead of as objects.
 *
 * A control is four short strings and a few booleans, and JSON spends more on saying so
 * than on the strings: `{"ref":"e20","role":"link","name":"member1"}` is forty-four
 * characters to carry seventeen, and the field names are repeated for every row of every
 * snapshot of every turn. In the measured run the control lists were the single largest
 * share of the model's context.
 *
 * A table says the field names nowhere and the values once. The envelope stays JSON,
 * because everything else in a reply is a handful of fields that objects describe well
 * and because leaving it alone keeps the change to one field.
 *
 * Lossless, and tested to be: the point of a seam is that the two descriptions can be
 * compared, and a description that quietly drops a `required` flag is not a cheaper
 * description of the same page.
 */

import type { WireControl } from "../wire.ts";

/** Booleans, written as bare words because their presence is the whole message. */
const FLAGS = ["required", "disabled", "checked", "submits"] as const;

/**
 * What the card tells the model once, so no snapshot has to carry a header.
 *
 * Paid once per turn either way, but once per turn beats once per observation.
 */
export const TABLE_LEGEND =
  "Controls are tab-separated rows: ref, role, name, then optional value=…, row=… " +
  "and flags (required/disabled/checked/submits).";

function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

function unescape(value: string): string {
  return value.replace(/\\\\|\\t|\\n/g, (match) =>
    match === "\\t" ? "\t" : match === "\\n" ? "\n" : "\\",
  );
}

export function formatControls(controls: readonly WireControl[]): string {
  return controls
    .map((control) => {
      const cells = [control.ref, control.role, escape(control.name)];
      if (control.value !== undefined) cells.push(`value=${escape(control.value)}`);
      if (control.row !== undefined) cells.push(`row=${escape(control.row)}`);
      for (const flag of FLAGS) if (control[flag]) cells.push(flag);
      return cells.join("\t");
    })
    .join("\n");
}

export function parseControls(text: string): WireControl[] {
  if (text === "") return [];
  return text.split("\n").map((line) => {
    const [ref = "", role = "", name = "", ...extras] = line.split("\t");
    const control: WireControl = { ref, role, name: unescape(name) };
    for (const extra of extras) {
      if (extra.startsWith("value=")) control.value = unescape(extra.slice("value=".length));
      else if (extra.startsWith("row=")) control.row = unescape(extra.slice("row=".length));
      else if ((FLAGS as readonly string[]).includes(extra)) {
        control[extra as (typeof FLAGS)[number]] = true;
      }
    }
    return control;
  });
}
