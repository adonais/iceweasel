---
name: stack-reorganize
description: Reorganize a range of local commits so each one stands on its own for review, by splitting, reordering, squashing or dropping them. Use when a stack or its commits are hard to review, carry churn, or have an awkward shape - "my stack is hard to review", "clean up these commits", "organize my patches for review". Works in a git or a Jujutsu (jj) checkout.
allowed-tools:
  - Bash(git log:*)
  - Bash(git show:*)
  - Bash(git blame:*)
  - Bash(git add:*)
  - Bash(git diff:*)
  - Bash(git status:*)
  - Bash(git branch:*)
  - Bash(git checkout:*)
  - Bash(git restore:*)
  - Bash(git commit:*)
  - Bash(git cherry-pick:*)
  - Bash(git rebase:*)
  - Bash(git reset:*)
  - Bash(git rev-list:*)
  - Bash(git ls-tree:*)
  - Bash(git apply:*)
  - Bash(git range-diff:*)
  - Bash(git patch-id:*)
  - Bash(git grep:*)
  - Bash(git cat-file:*)
  - Bash(git rev-parse:*)
  - Bash(grep:*)
  - Bash(awk:*)
  - Bash(sort:*)
  - Bash(tr:*)
  - Bash(bash .claude/skills/stack-reorganize/scripts/git-churn.sh:*)
  - Bash(bash .agents/skills/stack-reorganize/scripts/git-churn.sh:*)
  - Bash(jj log:*)
  - Bash(jj show:*)
  - Bash(jj diff:*)
  - Bash(jj st:*)
  - Bash(jj op:*)
  - Bash(jj squash:*)
  - Bash(jj commit:*)
  - Bash(jj new:*)
  - Bash(jj describe:*)
  - Bash(jj rebase:*)
  - Bash(jj edit:*)
  - Bash(jj abandon:*)
  - Bash(jj absorb:*)
  - Bash(jj fix:*)
  - Bash(jj restore:*)
  - Bash(jj file show:*)
  - Read
  - Grep
  - Glob
---

# Reorganizing a stack for reviewability

The mechanics depend on this checkout's version control system. Use jj where
the checkout has a `.jj` directory at its root: it rebases descendants for you
and records conflicts instead of halting. Do not fall back to git commands
there even if available.

- Jujutsu (jj): `references/jj.md`
- git: `references/git.md`

Open `references/drop-superseded.md` once Phase 2 names its shape, and
`references/fold-resplit.md` once Phase 3 picks that intervention; the
mechanics reference covers everything else.

# Goals

- Smoothe out the landing process by avoiding known sources of review and landing friction.
- Reduce cognitive load during review, so that it's easy for the reviewer to spot bugs, and to understand the impact of a change.
- Every "prefix" of the patch series should leave the world in a meaningful valid state: the tree builds, lints, and passes tests after every commit, not just at the tip.
- Every patch should be an incremental improvement that makes sense to a reviewer in isolation.
- Every patch should look "natural" and not depend on later work to justify its existence.
- No forward references: an earlier patch's code and comments can't mention a concept that only a later patch introduces.

# Strategies to minimize friction

- "Land-early nuggets": Often, a larger change will include small tweaks which are orthogonal to the goal of the larger change, but which are non-controversial and which make sense to adopt even if the larger change is rejected. Find those nuggets of value and pull them out into patches that go *before* the larger work - they can be reviewed quickly and will reduce the amount of rebasing that has to happen for the larger change if that one is stuck in review for a while.
- Refactor first, then change behavior: In the process of writing a patch, the main focus is usually on a certain behavior change, and then sometimes some cleanup is done afterwards. But during review, it's usually better to do the "cleanup" / refactor first, in such a way that the actual behavior change that follows will look very natural.
- Predict reviewer response: Do a review of each patch yourself, and predict what a reviewer would say about it. Then shift things around until you think that the reviewer will have nothing to complain about - or at least until they could only disagree with the effect of the patch / the proposed change, and not with the mechanics of the implementation.
- Put behavior changes front-and-center: In patches which change behavior, minimize distractions from unrelated changes.

# Multiple bugs

Sometimes it can make sense to split the series across multiple Bugzilla bugs. Here, the term "bug" is used loosely in the sense of "patch subseries container" / "unit of landing". You can use "Bug TBF-consolidate-rdm-styles - [...]" placeholders in the commit message (TBF = to-be-filed). When done, give the user a list of bugs that need to be filed prior to patch submission, and let them know which placeholders they will need to substitute.

Another approach is to put all patches on the same bug first, and move them out as needed for individual landings. More concretely: As the reviews come in, the developer can move a "fully-reviewed prefix" of the patch series into a different bug and land them there, while the remaining patches stay in the original bug where they wait for the rest of the reviews to come in. The goal is to have one landing per bug. With Phabricator, patches can be moved across bugs without losing the review status.

# FAQ

## What should be moved to the front of the series?

- Front-load non-controversial improvements.
- Front-load risk: If the entire larger change is doomed if one of its pieces doesn't work out, and if that deal-breaker piece can be validated independently, it can make sense to get just that piece reviewed and landed first. Then it can go through Nightly testing while the specifics of the rest are still being discussed.
- Front-load changes which don't change behavior but which, by being separate, improve the clarity of upcoming behavior change patches.

## What should I do if, in the process of reorganizing patches, I suddenly notice an entirely new and better implementation approach which was non-obvious before? Should I implement the better approach instead?

For this skill, the goal is to have a patch series whose overall diff exactly matches the original overall diff. So resist the temptation to switch approaches; if the temptation is unbearable, ask the user for permission first.

For cosmetic differences, you can have a "residue" patch at the end of the series which makes the diffs match, but which the user is free to abandon.

A change that is *not* in the original diff at all - a cleanup that only became obvious once the pieces were separate - also goes in its own patch at the end of the series, so the series below it still matches the original and the user can drop the addition on its own.

# Mechanics

The `references/` files and `scripts/` named below sit beside this file; read
and run them from the directory this file was loaded from, since a checkout can
hold another version of this skill.

## Phase 1: Envision

### Preconditions

Before you start, ensure a clean starting state with no uncommitted changes and no conflicts in the original commit series. Also make sure you can get back to the current state if anything goes sideways; the mechanics reference for your VCS says how.

Then follow these steps:

1. If the original commit series is small, do a quick review of the original commit series. If it's clear that the patches are already clean, well-ordered, and ready for review, you're done.
2. Remember how to get the overall diff of the original commit series.
3. Make a list of the original commits. For each commit:
  - List which files are touched by the commit
  - List which "logical units" the patch consists of. E.g. individual cleanups, orthogonal behavior changes, plumbing, refactors.
4. The hard part: Brainstorm various orderings of the logical units, regardless of what original commit the unit of change was originally part of. Here you create a fresh "origin story" for the final state, and this new origin story should satisfy all the goals above. One challenge is that you need to keep many different states of the code base in your head at the same time. For example, comments in earlier patches can't refer to concepts that only get introduced in later patches, because that would create a non-sensical intermediate state.
5. Settle on an ideal organization, think of commit messages.

Example:
- Commits A, B, C with logical units `A: [M, N, O], B: [P], C: [Q, R, S]`.
- Settled on ideal organization: `R, M, Q, P, [N, O], S`.

## Phase 2: Diagnose the shape

Where the owner keeps a prefix of the range as it is, the range under
diagnosis starts above it, and so do the measurement and the rebuild in the
mechanics reference.

- **Lumped commit** - one commit does two or more separable concerns, e.g. a
  behavior-neutral move *and* a shape change. Two changes are one concern when
  neither would be worth reviewing without the other. Fix: split it, per the
  **`stack-split-commit` skill**; where the separable half moves or rewrites
  text an earlier commit in the range introduced, it is churn, and it absorbs
  into that commit by the rules below instead of becoming a commit of its own.
- **Superseded / move-then-unmove commit** - a commit's whole point is a
  decision that is being reversed: either a later commit already undid it, or a
  later commit obsoleted its rationale and you are choosing to undo it now.
  Fix: drop it at source, per **`references/drop-superseded.md`**; of a
  move-then-unmove pair the earlier commit goes, and the reverser then comes
  out empty.
- **Churn inside the range** - a commit rewrites or moves text that an earlier
  commit *in the same range* introduced; extending it is not this shape. Its
  content survives to the final tree, so it is not droppable. Measure and
  attribute it per the mechanics reference. Fix: absorb it, per Phase 3, into
  the commit that introduced the text it rewrites or moves; a drop outranks an
  absorb into the dropped commit, and the edit rides the cascade to wherever
  the text lives after the drop:
  - A commit that is part churn and part net-new splits by line origin: the
    lines that rewrite in-range text absorb, the lines that stand against
    pre-range text stay as the commit, with its message narrowed to them.
  - The remainder's depth is free: where a target names text the remainder
    introduces, the remainder goes directly below the lowest such target.
  - An added line has no origin to blame: it stays with the narrowed commit
    unless it completes text the target introduced. A hunk of mixed origin
    goes where most of its lines belong, provided the intermediate still
    reads; the remainder keeps only the pre-range removal.
  - A *move* has two halves: the removal goes to the commit owning the source
    and the addition to the one creating the destination.
- **Forward reference** - an earlier commit's text names a section, symbol,
  file or flag that a later commit in the range introduces. No diff check
  catches it; search for it per the mechanics reference. Judge the reference
  in its final form first: a rewrite the range makes later absorbs into the
  commit that introduced the reference (the churn rule), and a final form that
  exists at that depth is no forward reference. Fix: reorder so the
  introducing commit comes first (free inside a rebuild, where it is the order
  you build in), or absorb the reference into it.
- **Dead-intermediate model** - several commits build a mechanism (a wire
  format, a data model) that a later commit tears out and replaces, so the
  history carries both the construction and the removal. Fix: absorb the
  replacement into the commits that built what it replaces, which keeps their
  revisions; fold and resplit instead where Phase 3 allows it and the input's
  commit boundaries would not serve as the leaves. They serve where each block
  of the replacement lands in one existing commit whose subject already names
  its concern; a block with no such commit is a boundary to redraw.
- **Mis-ordered / mis-attributed commit** - a commit sits at the wrong stack
  depth: it belongs to an earlier concern or phase, or its position blocks a
  cleaner split. A message that explains text living in another commit is the
  tell: read every message against its own diff while listing the logical
  units in Phase 1, since a carried-forward message keeps the claim, and the
  marker grep in the mechanics reference locates the text. Fix:
  reorder it, move the text to the commit whose message claims it and narrow
  the other's message, or, where moving the text would create a forward
  reference or churn, move the claim into the body of the commit that carries
  the text.

## Phase 3: Choose the intervention (most targeted wins)

Ordered by how much review history they preserve: drop one superseded commit,
split one lumped commit, absorb a commit into the ones that own the text it
rewrites, or fold a range and resplit it by final concern. Default to the first
three, which touch only the offending commit and its cascade. The last builds
the final model directly so the dead intermediate never exists, but it
**discards the review history** of every commit whose leaf boundary moves (a
leaf whose concern equals an input commit's keeps that commit's message and
trailer): reserve it for a whole model that was built-then-replaced in work
nobody has reviewed deeply yet.

The ranking is per shape, and a commit carrying two shapes takes the one
construction that serves both. Nor does it rank mechanics: an absorb rebuilt
bottom-up and a fold-resplit are the same rebuild when the absorbed commit's
targets span the whole range. Read the per-target origin counts before taking
that span at face value: a target the absorbed commit removed little from
keeps its patch and receives a small fixup. They differ in what each leaf keeps: an absorb
keeps every original commit's boundary, message and trailer, and a fold-resplit
draws the boundaries afresh, which is the review history it discards. Either
can leave a bug with no commit; the shape's reference says what to report.

Find out which commits carry review history before ranking by it:

```
git log --format='%h %s' --grep='^Differential Revision:' <range>
```

No output means no commit in the range has a revision.
(`%(trailers:key=Differential Revision,…)` returns nothing: git does not parse
a key containing a space as a trailer.)

A trailer proves that a revision was created, not that anyone read it, and it
survives on a commit whose revision was since abandoned. Where the owner says a
revision was never reviewed, the owner's word decides, and the owner resolves
the revisions before any submit.

**Absorbing** sends a commit's changes into the commits that introduced the
text it rewrites, so the series builds each line once. Check first whether its
hunks **partition by path** across those commits (`git show --name-only
--format= <commit>`, then map each path to its target): a partition lands each
part on its owner with nothing to resolve. A path several targets touch absorbs
too, by a construction the mechanics reference gives. Never resolve a conflict
along the way: taking one side whole carries content into the wrong commit
while every later check still passes, so stop and rebuild by path.

**Absorb by line origin first, then judge the remainder by subject.**

- Lines the target itself introduced and this commit removes absorb whatever
  the commit's subject says: they are a block built and torn out, or content
  that belongs to the target's concern anyway.
- Judge a block, not a line: blame credits a line to the last commit that
  touched it, so a block belongs to the commit that wrote most of it.
- An edit to a line a later commit deletes is dead; whichever commit deletes
  the line in the new order takes the edit with it.
- The one exception to the first rule is a line the target must write in a
  provisional form because the final form would refer forward to work the
  target precedes; that is churn the series cannot remove, so it stays. The
  target keeps its provisional text and the commit that introduces the name
  rewrites it, so the churn shows at that later commit with the target as its
  origin; expect it in the measurement after the rebuild and do not chase it
  to zero.
- The lines that stand against pre-range text are the commit's own work. They
  stay as the narrowed commit where its subject names a concern the target's
  does not, even at the cost of a few lines touched twice, and join the target
  only where they belong to its concern anyway.

Whichever you pick, verify first that the reorganized series nets to the
original overall diff, apart from a residue commit you declared (the stale
comments the tip grep under the churn measurement collects before the build,
fixed on top in a commit the owner may drop) or a decision
you are deliberately reversing because a later commit obsoleted it (the
deliberate-reversal case of `references/drop-superseded.md`, where building and
testing takes over from the diff check the net-zero drop keeps). Measure the
churn again on the result: the gap should fall to the rename alignment and the
provisional lines the intervention could not remove, which shows it did what it
was chosen for. Then build, lint and test, whichever of the three the stack's
content admits - every commit, not just the tip, as `# Goals` asks; a linter
reads the worktree rather than a commit, so take the per-commit checks from the
mechanics reference.

Read each message against the diff it now has, and a claim about the tree's
state (a heading present at that depth, a helper already defined) against the
tree at that depth, `git show <commit>:<path>`, since the diff cannot show it
and a reorder or a moved claim changes what is true there. The messages are
carried forward, so a claim that was already wrong in the original (text the
message explains living in another commit) survives, and a commit that gave
part of its content away is left over-scoped. Absorbing or dropping a commit
destroys its message: harvest whatever in it the diff cannot show before it
goes, into the receiving commit's body where its subject cannot carry it, and
widen that subject where it no longer describes what the commit does. A body
that justifies a placement the rebuild never makes has nothing to harvest.

# Review-tool side

`moz-phab submit` updates the diffs but leaves the stack's parent/child edges
where they were. Scope the submit to the commits you rewrote: a full-range
submit updates revisions that did not change, and any rewrite of a mid-stack
commit, a message-only reword included, re-parents the commits above it, so
their revisions get no-op updates on the next push. Then run
`moz-phab reorg [start_rev] [end_rev]` to recompute the edges from the local
order (`docs/contributing/stack_quickref.md`).

**Read `reorg`'s preview and stop if it proposes abandoning a revision.** It
abandons every revision that is in the remote stack but not in the local range
(those already abandoned excepted), and narrowing the range grows that set: a
WIP tip above the range and the landed floor of a partially-landed stack are
remote-only under any range. `--no-abandon` re-wires the edges without the
abandon transactions. Never re-push without explicit approval.

Splitting a revision that is already in review is the **`stack-split-commit`
skill**'s job, including which piece keeps the revision number.
