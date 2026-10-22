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

**List the renames the target's diff hides before cutting.** `git diff
--name-status <target>^ <target>` reports a rename (`R`) only at 50%
similarity; below that the pair shows as a `D` and an `A`. Lower the threshold
to list the candidates:

```
git diff -M20% --name-status <target>^ <target> | grep '^R'
```

A hit is a candidate, not a verdict: unrelated files that share a license
header and boilerplate can pass 20%, and a pair below it can still be a rename
that the file names and the commit message give away. Each real rename is a
hand-built leaf below its content change (section 2): `git mv <old> <new>` on
top of the leaves built so far, update what names the old file, its own text
included, until `git grep -n <old-basename>` finds nothing, and check that `git
diff --name-status HEAD^ HEAD` reports the pair as `R` before building the next
leaf.

## 2. Make the hardest part free

Order the concerns so the one most interleaved with the others, sharing the
most files with them, is **last**, where it costs nothing; a part made of
whole files is free wherever dependency order puts it (step 1):

1. Hand-craft the clean early part(s) as new commits on the target's parent.
   A part that owns whole files takes them by path, `git restore
   --source=<target> --staged --worktree -- <paths>`, once `git diff
   --name-status <target>^ <target> -- <paths>` shows the pathspec names every
   file the part deletes; hand-craft only the files it shares with a later
   part.
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

## 3. Procedure

Work in a checkout whose objdir is already configured; a fresh `git worktree`
has none, so the first leaf pays a full build there. Every step below is
non-interactive: `git add -p` and a bare `git rebase -i` cannot be answered
here, so stage by path and drive `rebase -i` through `GIT_SEQUENCE_EDITOR`.
Every piece keeps the target's author: when the target is not yours, add
`--author="$(git log -1 --format='%an <%ae>' <target>)"` to each `git commit`
below, since `-m` records you. Branches are shared by every worktree of the
repository, so a split running beside another names its scratch and backup
branches for its own task rather than `split-work` and `backup-<tip>`.

```
git commit -a -m WIP                             # if the tree is dirty; undone at the end
git branch backup-<tip> <branch>                 # before the first rewrite

git checkout -b split-work <target>^             # scratch at target's parent
# ... build each clean early part: restore its whole files by path (staged),
#     hand-edit the rest and `git add <paths>` them, ./mach build,
#     ./mach lint --fix, run targeted tests, check `git diff --cached --stat`
#     lists every file of the part, grep it for names only later parts add
#     (SKILL.md's opening rule), commit. Confirm behavior-neutral.

git restore --source=<target> --staged --worktree :/   # the free final part (staged); whole tree here, never a pathspec (section 2)
git diff <target> --stat                         # MUST be empty
git commit -m "<message>"                        # build/test: behaves == target

git checkout <branch>
git rebase --onto split-work <target>            # graft the rest of the stack
git branch -D split-work

git diff <backup> <branch> --stat                # MUST be empty
git reset HEAD^                                  # give the WIP work back, if you made one
```

**At every rebase stop, re-read a file with the `Read` tool before editing
it.** The stop checks out that commit's tree, so an earlier read is stale and
the edit fails with "File has been modified since read"; a shell read does not
clear that state.

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

**Reword a leaf's message** with an `exec` line after it, from a message file
outside the tree (`--fixup=reword:` takes neither `-m` nor `-F`):

```
GIT_SEQUENCE_EDITOR="sed -i '/^pick $(git log -1 --format=%h <leaf>) /a exec git commit --amend -q -F <message-file>'" \
  git rebase -i <base>
```

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
