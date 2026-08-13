# In-tree agent skills

This directory holds agent skills that ship as part of tree. They are
available to every developer who works in the tree, and an AI agent may load any
of them automatically when a task looks relevant.

## What belongs here

In-tree skills are for **broadly useful, tree-wide workflows** — the kind of thing
that helps Firefox developers regardless of which team or component they work on.
Good candidates are general utilities such as filing a bug, splitting commits,
running a linter, or reorganizing patches for review.

Because these skills live in the tree, they carry an always-on cost: a skill's
`description` is loaded into the agent's context on every session so the agent can
decide when to invoke it. A description that is too broad can trigger the skill
where it shouldn't. Keep this directory reserved for skills that are genuinely
worth that cost for the whole project.

## What does not belong here

Skills that are useful but not for everyone — team-specific or component-specific
workflows — should be published to a marketplace instead of being added in-tree,
so developers can browse and enable only what they need:

- **Useful for Firefox developers, but not everyone:**
  [firefox-aidev-plugins](https://github.com/mozilla/firefox-aidev-plugins). This
  marketplace is enabled by default in the Firefox tree, so developers just run
  `/plugin` in Claude Code to browse and enable plugins — no extra setup needed.
- **Not Firefox-specific, useful for any Mozilla developer:**
  [aidev-plugins](https://github.com/mozilla/aidev-plugins), the public
  marketplace for general-purpose Mozilla plugins.

When in doubt, prefer a marketplace plugin: it reaches the people who need it
without adding context cost for everyone else. Reserve this directory for the core
workflows that earn their place in the tree.

## Adding a skill

Each skill lives in its own subdirectory and is defined by a `SKILL.md` file with
YAML frontmatter (at minimum a `name` and a `description`). Any supporting scripts
or assets the skill needs can live alongside it in the same subdirectory. See the
existing skills in this directory for examples.
