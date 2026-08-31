# MVP-03-T01: Semantic page observation

Status: planned  
Story: MVP-03  
Depends: MVP-02-T01

## Spec

`inspect` returns a compact page summary: URL, title, accessible interactive controls with refs, dialogs, errors, and a short list of recent changes versus the last snapshot on that tab.

## Possible

`page.ariaSnapshot()` is a YAML a11y tree (good for diffs, noisy for actions). Tagging visible interactive elements with `data-bsa-ref` in-page gives clickable refs. Combine: tagged control list + dialog/alert query + optional aria YAML excerpt.

## Do

- Collect visible `a, button, input, select, textarea, [role=button], [role=link], [role=textbox], [contenteditable]`
- Assign `e1…eN` refs, include role, name, value (never password values), disabled, checked
- Detect `dialog[open]`, `[role=dialog]`, `[role=alert]`, `aria-invalid`
- Buffer recent console errors on the page
- Diff control refs/names against previous observation

## Tests

- `/apply` inspect includes named inputs and the submit button as refs
- Password input value is redacted
- `/dialog` lists a dialog
- `/error` lists an alert and a console error
- `/dynamic` after click reports a recent change for the new control

## Done when

Observation payloads are JSON objects under a size budget (truncate control lists at 80 entries) and contain no HTML dumps.
