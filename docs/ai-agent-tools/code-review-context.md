# Code Review Context (`review-context.toml`)

## Overview

Review Helper can load domain knowledge from the tree at review time and inject
it into the review prompt before the model sees a patch. This lets the people
who own a piece of code encode their review expectations once, in a file in the
repository, and have the agent apply them automatically every time a matching
patch is reviewed.

The mechanism has two parts:

- **Skill / documentation files** -- Typically Markdown documents containing
  review guidance. These can be files written specifically as review guides, or
  existing docs already in the tree. They can also be any other file type that
  could be useful.
- **Rules** in `review-context.toml` at the repository root -- declarations
  that say *which files to load* when *certain criteria are matched*.

When the agent reviews a patch it fetches `review-context.toml`, matches each
rule against the files the patch changes, fetches the skill/documentation files
referenced by the matching rules, and injects their contents as trusted
`<context>` blocks ahead of the diff.

## Adding a rule

Add a skill or documentation file, then add a rule that loads it. Conventional
location for a dedicated review skill is
`.claude/skills/<component-name>/SKILL.md`, but any Markdown or other file
already in the tree can be referenced, in particular documentation.

```toml
version = 1

[[rules]]
name = "DOM: Web Audio C++"
description = "Web Audio implementation and realtime-safety guidance."
when = { any_file = { include = ["dom/media/webaudio/**"], ext = [".cpp", ".h"] } }
load = [
  { type = "file", path = ".claude/skills/dom-audio/SKILL.md" },
]
```

Each rule has a required `when` predicate and a `load` list:

- `any_file` matches when *at least one* changed file matches the file
  predicate; `all_files` matches only when *every* changed file does (use it
  for patch-shape rules like docs-only or tests-only changes).
- A file predicate combines optional `include` globs, `exclude` globs, and
  `ext` suffixes. Globs use Python `fnmatchcase` semantics, where `*` also
  matches `/` -- so `dom/media/**` matches everything under that prefix.
  Matching is case-sensitive on every platform and runs against the
  repository-relative `+++ b/` paths in the diff.
- `all`, `any`, and `not` compose predicates for more complex conditions.
- `load` entries fetch a `file` from the repository (the default repo and
  branch are those of `review-context.toml` itself). YAML/RST frontmatter is
  stripped before injection.

Multiple rules can fire for one patch; loads are deduplicated globally, so the
same file is never injected twice. Load failures are non-fatal -- the review
proceeds without that content and the failure is logged.

## Validating

Validate the file before landing changes to it:

```shell
mach lint review-context.toml
```

The validator rejects unknown fields, unknown action types, and malformed
rules. It uses only the Python standard library, so it can also run in tree
tests.

## Reference

The full rule language -- reusable predicate definitions, Bugzilla/review/patch
metadata predicates, the GitHub repository allow-list, `priority` ordering,
and the `fetch_revision` action -- is documented in the bugbug repository at
`docs/code-review-skills.md`.
