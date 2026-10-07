# Splitting a commit with git

Mechanics for `stack-split-commit` in a git checkout; `SKILL.md` has the
by-concern rule and the message handling. The commands assume a POSIX shell
(on Windows, Git Bash or the MozillaBuild shell; cmd.exe eats the `^` in
`HEAD^`).

## 1. Choose the cuts by recursive bisection

Cut the target's diff into two coherent halves at its widest natural boundary,
then recurse on each half. Enumerating the concerns up front works too;
bisecting suits a diff whose concerns are hard to name before you have seen
them separated.

**Stop once a piece is one coherent concern that builds green on its own.**
Stop earlier when a further cut would only produce a piece nobody gains from
reviewing alone - a refactor that reads as nonsense without the behavior
change motivating it stays with that change - or when the author has said
which way they want the trade-off made.

## 2. Make the hardest part free

Order the concerns so the messiest, most-interleaved one is **last**:

1. Hand-craft the clean early part(s) as new commits on the target's parent.
2. Get the remainder by restoring the target's whole tree:
   `git restore --source=<target> --staged --worktree :/` snaps the tree to the
   target's exact end state, so that commit's diff *is* the remainder, correct
   by construction. Restore the whole tree (`:/` is the repository root
   whatever the working directory), not a list of paths: `git restore` with a
   pathspec removes only the deleted paths the pathspec names, and `git
   checkout <target> -- <files>` removes none and aborts on one the target
   lacks, leaving the other paths un-updated.

Under bisection the upper half of each cut is that free restore and only the
lower halves are hand-built, so N leaves cost N-1 hand-built intermediates.

Build the intermediates in a checkout whose objdir is already configured; a
fresh `git worktree` has none, so the first leaf pays a full build there.

## 3. Procedure

```
git commit -a -m WIP                             # if the tree is dirty; undone at the end
git branch backup-<tip> <branch>                 # before the first rewrite

git checkout -b split-work <target>^             # scratch at target's parent
# ... build each clean early part: edit files, ./mach build, ./mach lint --fix,
#     run targeted tests, commit. Confirm behavior-neutral.

git restore --source=<target> --staged --worktree :/   # the free final part (staged)
git diff <target> --stat                         # MUST be empty
git commit -m "<message>"                        # build/test: behaves == target

git checkout <branch>
git rebase --onto split-work <target>            # graft the rest of the stack

git diff <backup> <branch> --stat                # MUST be empty
git reset HEAD^                                  # give the WIP work back, if you made one
```

Rebuild the final tree and run the tip's own tests. A test that needs
later-stack infrastructure (a CI variant, downstream commits) may fail at the
split tip and pass only after the graft; confirm on the final tree before
calling it a regression.

**Validate the intermediates against a baseline, not an absolute green.** Take
the failure set at the target end-state, then require each leaf to add nothing
to it: the final tree is correct by construction, so the risk is entirely in
the intermediates, and many suites carry known intermittents.

**Watch for over-carving.** A concern you have not migrated yet must still work
at each leaf: split A out first and B and C must still function. A green A
beside a broken B means too much went into A's leaf.

**Fold a fix into the leaf that needs it** with `git commit --fixup=<leaf>` and
`GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`, so the leaf
introduces the correct form with no separate add-then-remove. Name the base
explicitly - the parent of the oldest leaf - since `git rebase` with no
argument rebases onto the upstream branch's current tip. `--autosquash`
without `-i` works from git 2.44.

## 4. Splitting a pushed revision in two

Run the procedure above with the extracted piece as the hand-built early part
and the retained piece as the free final part, committed with
`git commit -C <original>` so it keeps the original subject **and** its
`Differential Revision` trailer. Then re-push and re-wire the edges, per
"Review-tool side" in `SKILL.md`.

## 5. Reliable file surgery

When removing or replacing whole functions, do **not** count `{`/`}` depth -
object literals, template strings and regexes break it. Use the language's
natural closer at the method's indentation (a JS class method ends at the
first line equal to `  }`; nested closers are indented more), and to drop a
method with its doc comment, scan backward over the preceding `/** ... */`. A
small scripted pass over the file lines beats `sed` or hand-edits for
multi-method surgery.

**Re-read a file with the `Read` tool at each rebase stop before editing it.**
The stop checks out that commit's tree, so an earlier read is stale and the
edit fails with "File has been modified since read"; a shell read does not
clear that state.
