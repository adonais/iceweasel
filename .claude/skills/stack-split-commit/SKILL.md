---
name: stack-split-commit
description: Split one large or hard-to-review commit into several commits that each stand on their own for review, in a git or a Jujutsu (jj) checkout. Use when asked to split a commit or patch, break up a big diff for review, or make a lumped commit more reviewable. One commit at a time - `stack-reorganize` restructures a whole stack.
allowed-tools:
  - Bash(git log:*)
  - Bash(git show:*)
  - Bash(git diff:*)
  - Bash(git status:*)
  - Bash(git branch:*)
  - Bash(git checkout:*)
  - Bash(git restore:*)
  - Bash(git commit:*)
  - Bash(git rebase:*)
  - Bash(git reset:*)
  - Bash(git apply:*)
  - Bash(jj log:*)
  - Bash(jj show:*)
  - Bash(jj diff:*)
  - Bash(jj split:*)
  - Bash(jj commit:*)
  - Bash(jj new:*)
  - Bash(jj describe:*)
  - Bash(jj rebase:*)
  - Bash(jj edit:*)
  - Bash(jj abandon:*)
  - Bash(jj restore:*)
  - Bash(jj file show:*)
  - Read
  - Grep
  - Glob
---

# Splitting a commit into reviewable pieces

Split without changing the final tree. Every prefix of the result has to leave
the tree building, linting and passing tests, and no commit may mention a
concept that only a later commit introduces.

Pick the cuts by the rules below, then follow the mechanics for this
checkout's version control system. Use jj where the checkout has a `.jj`
directory at its root: it rebases descendants for you and records conflicts
instead of halting. Do not fall back to git commands there even if available.

- Jujutsu (jj): `references/jj.md`
- git: `references/git.md`

## Split by concern, not by "new vs. deleted"

A reviewer checks a move or a replacement by diffing the new code against the
code it replaces, so both go in the **same** commit.

- A behavior-neutral **move**, such as inlining logic into a shared helper, is
  one commit, old-out and new-in side by side.
- A genuine **shape change**, such as an IPDL message or a data-format swap, is
  a separate commit, again with old and new together.
- A piece that both moves and changes behavior is split into the neutral move
  and the behavior change.

## A cut may need code that neither end state contains

The intermediate state often needs code written for it alone: a
compatibility stub so the earlier commit still builds, or an interim form of a
function that neither the parent nor the target has. Write it; a later commit
removes it. Don't assume every piece falls out of the original diff.

## Revisit each piece's message

The original's message now over-scopes, since it still describes what moved
out: narrow it to its own piece, and write the new piece's message from
scratch. The `firefox-commits` skill says what a message contains; what the
split adds is a body line for what only the split made true, such as a claim
of behavior-neutrality for a moved piece or an ordering that looks incidental
but isn't. When a subagent builds the pieces, specify each subject and only
the bodies that are warranted.

## Review-tool side

Submitting the split creates the new revisions but leaves the stack's
parent/child edges where they were. `moz-phab reorg [start_rev] [end_rev]`
recomputes them from the local order and previews the changes before acting
(`docs/contributing/stack_quickref.md`).

**Stop if the preview proposes abandoning a revision.** `reorg` abandons every
revision that is in the remote stack but not in the local range (those already
abandoned excepted), and narrowing the range grows that set: a WIP tip above
the range and the landed floor of a partially-landed stack are remote-only
under any range. `--no-abandon` re-wires the edges without the abandon
transactions. Never re-push without explicit approval.

## Splitting a revision that is already in review

Keep the original revision on the piece that retains the subject, usually the
higher-level concept: it keeps the `Differential Revision` trailer, so its
revision updates in place with a smaller diff, and the extracted piece lands as
`(New)` below it. The submit does not make the retained revision depend on the
new one; `moz-phab reorg` does, per above. Revisit both messages as above.
