---
name: find-reviewer
description: Find the right reviewer for a Firefox/Gecko change so the user does not have to. Use this primarily when committing changes, to fill in the `r=` part of the commit message automatically instead of leaving it blank or guessing. Also use it when the user asks directly who should review a patch or what reviewer group to use.
allowed-tools:
  - Bash(./mach file-info:*)
---

## NEVER invent a reviewer name

A reviewer or group name must be used **exactly** as it appears in the tooling's
output. NEVER abbreviate, shorten, guess, or make up a name (for example, writing
`r=#build` when the real group is `r=#firefox-build-system-reviewers`). `moz-phab`
rejects a submission containing an unknown reviewer (`#madeup-reviewer-group is
not a valid reviewer's name`), forcing the user to amend the commit and
re-submit. For a name that did not come straight from the Herald output, do not
use it unless it appears in `./mach file-info reviewer-groups`.

## Overview

When committing a Firefox/Gecko change, the `r=` reviewer should be filled in for
the user, not left to them. This skill determines it from the files the change
touches: the primary signal is the set of group reviewers that Phabricator's
Herald rules would automatically attach; when no rule matches, it falls back to
the individuals and groups that reviewed recent patches to those files.

Use it whenever you are about to write a commit message for a change, and also
when the user asks directly who should review something.

## Workflow

1. **Run the reviewer suggester** on a representative set of the changed files:
   ```
   ./mach file-info reviewers <file> [<file> ...]
   ```

2. **Interpret the output.**
   - **Herald group reviewers** are the authoritative answer: these are the groups
     Phabricator would add automatically, so prefer them. A group marked
     `(blocking)` must approve before landing.
   - When it prints **"No Herald group reviewers matched"**, it lists **recent
     reviewers from version control history** instead. Treat these as candidates,
     not certainties: rank by the counts shown, and discount groups that only
     appear because of tree-wide mechanical commits (mass reformats, lint sweeps)
     that are unrelated to the change.
   - If neither yields a good answer, fall back to the file's Bugzilla component
     (`./mach file-info bugzilla-component <file>`) and its matching reviewer
     group, after validating the name (step 3).

3. **Validate names whose origin is not the Herald output.** Herald group
   reviewers come straight from the current reviewer-selector data, so they are
   already valid -- do not re-check them. Confirm the exact spelling only of a
   group that came from somewhere else: one the user supplied, or one taken from
   version control history (which may have been renamed or retired since that
   commit landed):
   ```
   ./mach file-info reviewer-groups            # one group name per line
   ```
   Only use such a group if it appears in this list. (See the rule at the top.)

4. **Use it in the commit message.** Groups take a `#` prefix
   (`r=#firefox-build-system-reviewers`); individuals take none (`r=somebody`).
   Append `!` to require a reviewer's approval before landing
   (`r=#firefox-build-system-reviewers!`); the command marks such reviewers
   `(blocking)`. When the choice is ambiguous (several plausible groups, or only
   noisy history), state the pick and the runners-up so the user can override.

## Notes

- This skill suggests reviewers; it does not submit anything to Phabricator.
