---
name: forms
description: Filling and submitting web forms reliably, including validation, required fields, and what to do when a value will not stick.
match: form, apply, application, submit, fill, checkout, signup, register, profile
---

# Forms

## Find out what the form wants before typing

A snapshot shows controls; it does not tell you which are required or what a select
will accept. Probe first:

- `{"kind":"form_inventory"}` gives every field with its wire name, type, required
  flag, current value, and the submit labels.
- `{"kind":"elements","select":"select","fields":["name","options"]}` gives the exact
  option values, which is what a select action needs. Guessing an option label that is
  not in the list fails silently on some sites.

Knowing the required set up front tells you whether you can finish at all, or whether
you need to ask the operator for something first. Discovering that on submit wastes the
attempt.

## Typing is not the same as the value sticking

Every type action reads the value back. If the read-back fails, the page rejected or
rewrote your input. Common causes, in the order worth checking:

- the field is masked or formatted as you type (phone numbers, card numbers, dates)
- the field is controlled by a framework that resets on blur
- the field is disabled or readonly and the snapshot said so
- you typed into a lookalike field: two fields share a label

Do not retype the same value harder. Look at what the read-back actually returned.

## Validation happens in two very different places

**Server or script validation** puts a message on the page. That message is readable,
so a check like `text_visible "required"` works, and the task can report it.

**Native browser validation** (`required` on the input) blocks submission without
putting anything in the DOM. There is no message to find. The only observable truth is
that the page did not advance and nothing was sent. If a submit appears to do nothing
and the fields have `required` set, this is why: fill the missing field rather than
looking for an error to read.

## Submitting

A submit is irreversible. Before it:

1. Check every required field has the value you intended, by read-back and not memory.
2. Know what success looks like on this page: a confirmation string, a URL change, or
   the form disappearing. That is what you check afterwards.

If a submit produces no page delta at all, it did not submit.
