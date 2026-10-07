# Dropping a superseded mid-stack commit

Remove a commit whose change a later commit reverses - a *move-then-unmove* -
so the landed history never carries the churn. Reverting on top reaches the
same tree with no rewrite but bakes both the move and its reversal into
permanent history; dropping at source costs a conflict cascade now and, where
the commit's revision has been reviewed, each reviewer their place in it.
Dropping usually wins; the reviewed revision is the exception.

The commands for each step are in the mechanics reference for your VCS, under
"Drops", numbered as the steps are here. Step 1's searches are git's, and a
colocated jj checkout runs them too.

## When this applies

Both must hold:

1. **Its change is one you're reversing** - either a later commit *already*
   undid it (net-zero in the final tree), or a later commit obsoleted its
   *rationale* and you're choosing to revert it, in which case the change
   survives to the final tree until you do.
2. **Nothing above it uses what it introduced, other than editing it in
   place.** A later commit that only edits text the dropped commit touched is
   bounded (step 3 redirects the edit); one that uses a symbol, API or file it
   added from elsewhere is not, and dropping cascades through it.

A net-zero commit that still tells a useful incremental story can stay; a pure
move-then-unmove documents a reversed decision and cannot.

Start from the superseding commit's own account of what it removes or reworks
(its message). A commit that lays durable scaffolding a later commit *builds
on* is not net-zero, and dropping it loses real work.
There is no cheap mechanical test: reverse-applying the commit's patch to the
tip reports false "superseded" on clearly durable commits, since later commits
shift context around surviving changes. The drop itself is the test; step 5
says how to read it.

## Procedure

### 1. Bound the blast radius first

For each symbol or API the commit adds:

```
git log -S'<symbol>' <commit>..<branch>     # commits above that touch it
git log <commit>..<branch> -- <added-path>  # commits above that edit a file it adds
```

`-S` counts occurrences of the string, so a commit that edits the body of a
file the dropped commit adds is invisible to it; the path form finds that
commit, and each commit either form names is a conflict to expect in step 3.
An empty result means the cascade is bounded to commits touching the *same*
code. Search the whole tree with `-S`, not `-- <file>`: a commit above that
consumes the symbol from somewhere else is exactly the dependency condition 2
rules out, and a path filter hides it.

### 2. Drop it

Back the branch up unless the mechanics reference's backup already exists,
then remove the commit and replay every commit above it onto its parent. Its
message and the reverser's go with it: harvest what the diff cannot show first
(`SKILL.md`, Phase 3).

### 3. Resolve the cascade faithfully

Expect one conflict per commit that built on the dropped one, plus any commit
that merely trimmed a comment near the dropped code. The reverser itself does
not conflict when the resolutions below it were faithful: its change is
already in the tree, so it comes out empty; the mechanics reference says how
each VCS reports that and what to confirm. A reverser that conflicts on
anything but the deletion of a file the drop already removed means a
resolution below it diverged from the reverser's form. The usual shape is
the dropped commit's additions appearing as *context re-adds* (the merge
thinks the later commit is re-introducing the symbols): drop those re-adds and
repoint reads to the pre-move form. A commit that only *modified* what the
dropped commit added conflicts as delete/modify instead, with no re-add to
drop: keep its real change, rebased onto the pre-move form (the edit rides the
cascade to wherever the text lives after the drop, the churn rule in
`SKILL.md`), and never resolve it by the deletion alone. Where re-targeting
the hunk to the pre-move path does not apply cleanly, insert the change by
hand and check it byte for byte against the backup tip at that path. Check any
whole-tree invariant (the mechanics reference, verifying every commit) at the
resolved commit too. Keep each later commit's *real* changes; drop only what
the dropped commit had introduced.

### 4. Finish coupled changes at their source

Dropping the commit may fix one owner (e.g. the implementation and its test)
while a parallel owner elsewhere still carries the reversed form. Complete that
at the commit that *introduced* it, not on top, so that commit introduces the
correct form with no separate add-then-remove.

### 5. Validate

- **Already net-zero:** the diff from the backup tip to the result must be
  **empty**. Non-empty means the commit had surviving changes: return to the
  backup and keep it. The resolution must have been faithful; forcing the
  final content makes the diff trivially empty and proves nothing.
- **Deliberate reversal:** the tree changes by design, so build and test
  instead. The drop is sound only if the result is behavior-neutral on the
  default path and any remaining failures are *unrelated* gaps, not
  regressions.

## The review-tool side

`moz-phab submit` updates the surviving revisions but neither abandons the
dropped commit's revision nor re-parents around it, so the orphan stays
bridged into the stack by stale "Depends On" edges. `moz-phab reorg`
recomputes the edges and abandons the orphan; confirm in its preview that the
orphan is the *only* thing it proposes abandoning, per "Review-tool side" in
`SKILL.md`. Never re-push without explicit approval.
