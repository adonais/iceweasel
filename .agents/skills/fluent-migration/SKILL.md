---
name: fluent-migration
description: >
  Use this skill when a patch or local changes rename, restructure, move, or
  replace Fluent (.ftl) strings - or migrate legacy .properties strings to Fluent
  - and you need a migration recipe in python/l10n/fluent_migrations so existing
  translations carry over. You read the diff, classify each changed string, write
  the recipe by hand, and validate it with the in-tree `./mach
  fluent-migration-test`. Triggers: "write/generate a fluent migration", "migrate
  these strings", renamed/bumped l10n IDs (foo -> foo2), moving a value to/from an
  attribute, adding or removing an attribute on a message, moving a string between
  files, .properties -> Fluent. Also covers changes that must NOT be migrated.
---

## What this does

A **migration recipe** is a Python module in `python/l10n/fluent_migrations/`,
shipped in the same patch. It tells l10n tooling to copy existing translations
over to a renamed, moved, or restructured string, so locales don't fall back to
English. It only helps when the English text can be **reused** - identical, or
differing only in capitalization. If the wording really changed, the string gets
translated fresh instead (give it a new id and leave it out of the recipe).

You build the recipe by hand: read the diff, decide per string whether it's
migratable, write the `add_transforms` blocks, then let `./mach
fluent-migration-test` check them authoritatively against real l10n. There is no
generator - the test is the source of truth.

**Two hard rules - never break them when writing a migration file:**
- **No partial migrations.** Migration is all-or-nothing per message. Every
  translatable part of the target message (its value and *each* attribute) must
  be rebuildable from reused source content via `COPY`/`COPY_PATTERN`. If any part
  is new or changed - a new attribute, a removed attribute, a changed value, or an
  attribute with reworded text - you can't migrate *just* the reused parts: either
  the **whole message** is migratable (every part the new message *keeps*, rebuilt
  from reused source under a new id) or it stays out of the recipe entirely and
  translates fresh. Whether every kept part has a reusable source decides which:
  an attribute with genuinely new wording has none, so the whole message stays out;
  but a new attribute that *reuses* an existing source string's text (e.g. adding
  `.aria-label = Go back` to a message whose old `.title` was already `Go back`)
  makes the **whole** message migratable from reused content under a new id - copy
  the kept `.title` and the added `.aria-label` both from the old `.title`. Removing
  an attribute is likewise migratable under a new id: copy each surviving part from
  its old counterpart and just don't reference the dropped one. Either way the id
  must be bumped first - see the added/removed-attribute rows in step 2.
  Bumping the id does **not** by itself rescue a message: a message that changed one
  attribute (say `.style = ...45em` -> `...32em`) still needs a new id *and* still
  stays out of the recipe, because migrating its unchanged `.title` while the
  `.style` changed is exactly a partial migration. Never suggest "give it a new id
  and migrate the reused part" - the new id and migratability are separate
  questions, and a message only becomes migratable when *every* part is reused.
- **No hardcoded strings.** Never put a literal in the recipe to fill in content
  the migration can't produce from a source string (for example, copying `.title`
  via `COPY_PATTERN` while hardcoding a changed `.style = ...`). Mixing copied
  translations with hardcoded literals is just a partial migration in disguise.
  (Some landed patches do this as a deliberate human exception - but it's an
  exception, never something this skill should produce or suggest.)

## Workflow

### 1. Get the diff of the string changes

These commands work on uncommitted changes too. Look only at `.ftl` /
`.properties` files:

```bash
# working tree (local-only change):
git diff -- '*.ftl' '*.properties'
# committed change (single commit):
git diff 'HEAD^!' -- '*.ftl' '*.properties'
# committed change spanning several commits <base>..<tip>:
git diff <base>~1 <tip> -- '*.ftl' '*.properties'
```

To confirm a string's text is reused, read its *old* value from the pre-change
file. `<rev>` is the commit *before* the change (e.g. `HEAD^`, or `<base>~1`):

```bash
git show <rev>:browser/locales/en-US/browser/preferences/containers.ftl
```

### 2. Classify each changed string

Decide, per message, what the recipe should do. This table is the core of the
job:

**First, a mandatory mechanical step - do this for _every_ added id before you
classify anything.** Naming-based comparison (`foo` vs `foo-1`) is NOT sufficient
and is the classic way to wrongly stamp a migratable string "fresh": a new id
often reuses the exact text of a *differently named* message (e.g. a new
`...feature-introduction-title-1` whose value matches an unrelated
`unauthenticated-vpn-title`). So for each added message, extract its literal value
(and each attribute's literal value) and grep that exact text across the changed
`.ftl`/`.properties` file(s) themselves to find any byte-identical (or
capitalization-only) source there. Limit the search to the files touched by the
diff - do not branch out into other files. Run this search uniformly for all added
ids, including long prose strings; never skip a string because it "looks novel" or
decide by intuition which ones "might" collide. Only after this search comes up
empty for a part may you classify that part as translated-fresh. A convenient
sweep: pull every added (`^\+`) message value from the diff and search each one's
text within the changed files, rather than hand-picking a subset.

| What changed | Migrate? | How |
| --- | --- | --- |
| id renamed/bumped, text identical (`foo` -> `foo2`) | Yes | `COPY_PATTERN(from_path, "foo")` for the value; `"foo.attr"` for each attribute |
| capitalization-only difference | Yes (still reusable) | same as above; the test flags it `WARNING` - confirm only the casing changed. **But a new id + migration is optional here** - the casing can instead be changed in place under the *same id*, with no recipe at all |
| wording genuinely changed | **No** | new id, translated fresh; leave out of the recipe entirely |
| moved to another file, text unchanged | Yes | `target` = new file, `from_path` = old file; a pure move may even keep its id |
| value <-> attribute restructure, **all** text reused, **with a new id or new file** | Yes | `COPY_PATTERN` each reused piece from the *old* id |
| value <-> attribute restructure keeping the **same id in the same file** | **No - flag it** | the message changed, so this is a cardinal-rule violation: the dev must bump the id first. A recipe entry here is a self-migration the test rejects (no-op) |
| attribute **added or removed** (e.g. add `.aria-label`, drop `.accesskey`), **id kept** | **No - flag it** | adding *or* removing a part *changes* the message, so it needs a new id; keeping the id is a cardinal-rule violation. Tell the dev to bump the id, then migrate per the next row. (Migrating under the same id would also be a self-migration the test rejects.) |
| attribute added or removed **under a new id**, and every part of the new message reuses an existing source string's text | Yes | `COPY_PATTERN` *every* part of the new message from a reused source. **Removed** attribute: copy each surviving part from its old counterpart (the dropped one simply isn't referenced). **Added** attribute: copy the carried-over parts from their old counterparts and the added attribute from whatever source shares its text - often another attribute of the old message (e.g. both `.title` and a new `.aria-label` from the old `back-nav-button-title.title`). Confirm cross-message context if any borrowed text comes from a different message |
| restructure that adds/changes any text (new `.description`, changed `.style`, ...) with no reusable source for some part | **No** (no partial) | leave the whole message out |
| brand-new id, but **every** part reuses an existing source string's text (cross-message reuse) | Yes | `COPY_PATTERN(from_path, "<other-source-id>")` (or `.attr`) for each part; confirm the source context matches - see cross-message note below |
| legacy `.properties` key -> Fluent | Yes | `COPY` / `REPLACE` / `PLURALS` / `CONCAT` (see below) |

Cardinal rule: **a changed string must get a new identifier** (unique, with a
meaning that stays stable across files) - otherwise locales keep showing the old
translation next to the new English. "Changed" means any non-capitalization change
to the value *or to any attribute* - including non-prose attributes like `.style`,
`.accesskey`, or `.key`, **including adding a brand-new attribute or removing an
existing one** (the message gains or loses a part, so it changed - e.g. adding
`.aria-label` to a message that only had `.title`, or dropping a `.accesskey`),
**and including structural changes that move text between
the value and an attribute even when the text itself is reused** (dropping the
value and adding `.label`, promoting a `.label` to the value, etc.). A message whose
only edit is `.style = ...45em` -> `...32em` still needs a new id; so does one that
turns `foo = Add an item` into `foo =\n    .label = Add an item`, and so does one
that merely gains or loses an attribute. Reused text makes
such a change *migratable* (from the old id), but it does **not** exempt it
from needing a new id. When you see a same-id restructure in a diff, flag it: the fix is for
the dev to bump the id, after which it migrates cleanly. The only exception to the
new-id rule is an *unchanged* cross-file move, which keeps its id. A brand-new id (no predecessor of its own) is usually
translated from scratch - *but not always*: if **every** translatable part of it
reuses the exact text of an existing source string, it is migratable via
cross-message reuse (copy each part with `COPY_PATTERN` from that other source),
subject to the no-partial rule and the cross-message context check below. Only a
new string for which some part has no reusable source is left out entirely. Do not
reflexively dismiss a new id as "translated fresh" - first check whether its text
already exists elsewhere.

If text matches several candidate source strings (AMBIGUOUS), pick the source by
hand. For legacy `.properties`, you can also scaffold with `properties-to-ftl`
(https://github.com/mozilla/properties-to-ftl).

When a target message draws its parts from a **different source message** - one or
more (e.g. a restructure whose value comes from one string and whose
`.title`/`.header` come from others, or a brand-new id whose `.title`/`.aria-label`
reuse some existing string's value), the test only proves the *English text*
matches - it cannot tell you the borrowed translation belongs in the new context.
A translation that is correct in its original message may be wrong once reused
elsewhere. For every such cross-message reuse, surface it to the user and have
them **independently confirm the source string's context matches the target's**
before relying on the migration; if the contexts don't line up, leave that part
(and therefore the whole message - no partial) out and let it translate fresh.

### 3. Write the recipe file

Path: `python/l10n/fluent_migrations/bug_<number>_<slug>.py`. The docstring must
contain the bug number and the literal `part {index}`. Use one `add_transforms`
block per `(target, from_path)` pair. See "Recipe shape" below for the template.

The bug number comes from the work you're doing - look in the relevant commit
message (`git log`, e.g. `git log -1 --format=%s`, or the bug reference on the
commit you diffed) and the conversation/task. If you can't find it, **use a
numeric placeholder** - `bug_0000000_<slug>.py` with `Bug 0000000` in the
docstring - rather than stalling; it keeps the test passing. Then tell the user
plainly that the bug number is a placeholder they must replace (rename the file
and update the docstring to match) before landing.

### 4. Validate with the in-tree test (authoritative)

```bash
./mach fluent-migration-test python/l10n/fluent_migrations/bug_<number>_<slug>.py
```

It checks out the pre-change strings, runs the recipe, and exits non-zero on any
error. Read the **"Fluent migration test summary"** (the diff above it is just a
visual aid), which sorts every finding into three levels:

- **ERROR** (must fix; the test exits non-zero): a recipe string that wasn't
  migrated, a migrated message differing from the reference by more than
  capitalization, a same-id/same-file ("migrated from itself") migration, a
  non-normalized reference path, a recipe that couldn't be inspected or loaded
  ("Could not inspect declared targets"), or a bad bug number / a commit missing
  `part {index}`.
- **WARNING** (surface every one): a migrated message differing only in
  capitalization (confirm only the casing changed - then it's fine); a migrated
  message "not present in the reference" (the target id doesn't exist in the new
  en-US, usually a wrong or mistyped target id - fix it); or "No migration applied"
  (the recipe produced no changes at all - almost always a mistake - fix it).
- **INFO**: strings that differ but aren't in the recipe. Surface these to the
  user for review rather than silently ignoring them: each changed string needs
  the cardinal-rule treatment (a **new id**, counting *every* attribute - see step
  2). Flagging that a string "needs a new id" is **not** an invitation to then
  migrate its unchanged parts: if any part changed, the whole message stays out (no
  partial - see the hard rules). A genuinely new string with no reusable source for
  some part, and quarantined strings, are fine to ignore - but a brand-new string
  whose *every* part matches an existing source string's text should be migrated via
  cross-message reuse (step 2), not ignored.

Relay **every** ERROR and WARNING line the summary prints to the user - never drop
a finding just because it isn't described above. Use the summary to correct
yourself too: an ERROR on a string you left out means it *was* fully reusable - add
it; an ERROR on a string you included means the text wasn't reusable - remove it,
and re-check against the two hard rules (you may be attempting a partial or
hardcoded migration).

## Recipe shape & hand-writing

Template - `COPY_PATTERN` for FTL sources, `COPY` for `.properties` keys:

```python
# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug <number> - <description>, part {index}."""

    source = "browser/browser/preferences/containers.ftl"
    target = "toolkit/toolkit/global/contextual-identity.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
user-context-color-blue =
    .label = {COPY_PATTERN(from_path, "containers-color-blue.label")}
""",
            from_path=source,
        ),
    )
```

- Recipe paths drop `locales/en-US/` (`browser/locales/en-US/browser/foo.ftl` ->
  `browser/browser/foo.ftl`). `from_path` is the *old* file, `target` is the new
  file; use one `add_transforms` block per (target, `from_path`) pair.
- Inside the `transforms_from` string, always reference `from_path` (the keyword
  passed to `transforms_from`), regardless of the local variable's name.
- `COPY_PATTERN`: `"id"` copies the value, `"id.attr"` copies an attribute. List
  every attribute you migrate - and per the no-partial rule, migrate all of a
  message's translatable parts or none.
- `.properties` -> Fluent uses **`COPY`** with the flat key. For placeholders,
  brand, plurals, or markup, drop down to the raw AST:
  ```python
  import fluent.syntax.ast as FTL
  from fluent.migrate.transforms import COPY, REPLACE, PLURALS, REPLACE_IN_TEXT, CONCAT
  from fluent.migrate.helpers import VARIABLE_REFERENCE, TERM_REFERENCE, MESSAGE_REFERENCE
  ```
  - `%S`/`%1$S`/brand -> `REPLACE(path, key, {"%1$S": VARIABLE_REFERENCE("name"),
    "Firefox": TERM_REFERENCE("brand-short-name")})` (`normalize_printf=True` is
    the default for `.properties`).
  - `a;b` plural with `#1` -> `PLURALS(path, key, VARIABLE_REFERENCE("count"),
    lambda t: REPLACE_IN_TEXT(t, {"#1": VARIABLE_REFERENCE("count")}))`.
  - markup / joined strings -> `CONCAT(...)`; never add your own spaces/punctuation.
- FTL->FTL transforms (strip `…`, remove a `<span>`, rename a `{ $var }`) need a
  custom `TransformPattern` subclass. Never bake English literals into a template -
  that is the no-hardcoding rule.

Authoritative docs: `intl/l10n/docs/migrations/{overview,fluent,legacy,testing}.rst`.
For recent examples grep `python/l10n/fluent_migrations/` (pruned each cycle).
