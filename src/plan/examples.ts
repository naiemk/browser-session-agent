import type { PagePlan, Target } from "./types.ts";

const country: Target = { by: "label", label: "Country" };

/**
 * Canonical branching script: searchable country combobox.
 *
 * Click the field, type "United States" and select if it appears,
 * else clear and type "USA", else scroll the open list until any
 * of the known labels is visible and click the first match.
 */
export const selectCountryUnitedStates: PagePlan = {
  context: {
    hint: { urlIncludes: "/combobox" },
    understanding:
      "Application form. Country is a searchable combobox, not a native <select>. Options appear after type or scroll.",
  },
  goal: "Set country to United States",
  actions: [
    {
      id: "select_country",
      intent: "Select United States in the country field",
      setup: [{ op: "click", target: country }],
      try: [
        {
          name: "type_united_states",
          steps: [{ op: "type", target: country, text: "United States", clear: true }],
          successWhen: { kind: "option_visible", text: "United States" },
          then: [{ op: "click", target: { by: "text", text: "United States", exact: true } }],
          doneWhen: { kind: "value_includes", target: country, text: "United" },
        },
        {
          name: "type_usa",
          steps: [
            { op: "clear", target: country },
            { op: "type", target: country, text: "USA" },
          ],
          successWhen: { kind: "option_visible", text: "USA" },
          then: [{ op: "click", target: { by: "text", text: "USA" } }],
          doneWhen: { kind: "value_includes", target: country, text: "USA" },
        },
        {
          name: "scroll_known_labels",
          steps: [
            { op: "clear", target: country },
            {
              op: "scroll_until",
              until: {
                kind: "any",
                of: [
                  { kind: "text_visible", text: "United States of America" },
                  { kind: "text_visible", text: "United States" },
                  { kind: "text_visible", text: "USA" },
                ],
              },
              maxScrolls: 8,
            },
            {
              op: "click_first",
              targets: [
                { by: "text", text: "United States of America", exact: true },
                { by: "text", text: "United States", exact: true },
                { by: "text", text: "USA", exact: true },
              ],
            },
          ],
          successWhen: {
            kind: "any",
            of: [
              { kind: "value_includes", target: country, text: "United" },
              { kind: "value_includes", target: country, text: "USA" },
            ],
          },
        },
      ],
    },
  ],
};
