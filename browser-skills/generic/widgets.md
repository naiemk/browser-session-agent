---
name: widgets
description: Comboboxes, autocompletes, virtualized lists, and other controls that are not plain inputs.
match: combobox, autocomplete, dropdown, select, country, timezone, search, typeahead, list, pagination
---

# Widgets that are not plain inputs

## Comboboxes are three different controls wearing one costume

A box with a list under it behaves in one of three ways, and the right move depends on
which one you have:

1. **Native `<select>`** — use a select action with an option *value* from
   `{"kind":"elements","select":"select","fields":["name","options"]}`. Clicking is
   unnecessary and often does not work.
2. **Filtering combobox** — typing narrows the list. Type a distinctive fragment, then
   click the option by name. If typing narrows to nothing, your fragment is wrong, not
   the widget.
3. **Non-filtering list** — typing does nothing, or clears the list. The only way down
   the list is scrolling it.

Find out which you have by typing a fragment and observing: did the option count change?

## Virtualized lists render only what is visible

A long list often keeps just a handful of rows in the DOM. An option you cannot see does
not exist yet, so waiting for it or searching the snapshot for it will not help.

Scroll *inside* the list container, not the page: a scroll action with the list's ref and
a positive `dy` hovers the container and wheels it. Re-observe after each scroll and stop
as soon as the option appears. Cap your attempts; if the option never appears after
covering the list, it is not there.

## Choosing is not the same as committing

Many comboboxes only commit on selection, and typing a value into the box leaves the
underlying field empty. After choosing, check the committed value rather than the box
text. Sites frequently display the label you typed while holding nothing.

## When the value you want is not offered

Look for a synonym before giving up: "United States", "United States of America", "USA",
and "US" are four different strings and sites pick one. If none of them is present, do
not force something close. Report that the value is unavailable and commit nothing — a
wrong country on an application is worse than an unfinished one.

## Pagination

Paging is enumeration, not exploration: it is the work. Click through with a stop
condition (the item you want, or the last page), re-observing each time, and give it a
step budget so a broken pager cannot loop forever.
