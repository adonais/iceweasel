# Reorganizing a stack with git

Mechanics for `stack-reorganize` in a git checkout; `SKILL.md` has the
contract, the envision phase and the diagnosis. The commands assume a POSIX
shell (on Windows, Git Bash or the MozillaBuild shell; cmd.exe eats the `^`
in `HEAD^`).

git has no operation log, no recorded conflicts and no `absorb`, so: back the
branch up before the first rewrite and keep the backup until the series is
submitted, prefer constructions that are correct by construction over long
rebases that need resolving, and place part of a commit by rebuilding a tree
at the target position. The preconditions' "no conflicts in the original
commit series" is jj's; git records none, so a clean `git status` is the
whole check. Untracked files another occupant of the tree left are no
obstacle: leave them, and stage by path throughout the rebuild, never with
`git add -A`, which would sweep them into a leaf.

```
git branch backup-<name> <branch>      # any name; backup- is the convention
```

A construction built on a detached HEAD leaves the branch at the old tip, so
**finish by pointing the branch at the result**:

```
git branch -f <branch> HEAD
```

On the branch itself (`git reset --hard <base>` with it checked out) HEAD and
the branch move together and this step falls away, but the reset moves
whichever branch is checked out, so in a tree another agent can reach read
`git branch --show-current` immediately before it. Check
`git diff <backup> <branch>` after each rewrite of the whole branch and at the
last leaf of a construction, whose tree differs by design until then; for a
reorder it is **empty**. With a residue commit on top, `git diff <backup>
<branch>^` is the empty one, and `git diff <backup> <branch>` has to equal the
residue commit's own diff, so that it holds nothing the series should carry.
`git range-diff -s <base> <backup> <branch>` maps each old commit to its new
one; without `-s` it also prints the interdiff of every `!` pair, the form for
reading one pair. The markers:

- `=`: a commit that moved with its context lines unchanged.
- `!`: a moved commit whose context changed, a target that absorbed lines or
  lost an edit to a remainder now below it, or a narrowed commit the pairing
  still recognizes. The pair prints the old subject, so a reworded commit
  shows its old one.
- `<`: an absorbed or dropped commit, with no counterpart on the right.
- `>`: a new commit, with none on the left. A narrowed commit the pairing no
  longer recognizes shows twice, its old form as `<` and its new form as `>`
  on a line that starts `-:`, which a filter on a leading number drops.

The content check stays the empty `git diff`. `!` does not separate moved
context from real drift; whether a commit's changed lines are the same is one
line each side, with `-U0` so that the id hashes no context and no offsets,
only the lines themselves:

```
git show --format= -U0 <commit> | git patch-id --verbatim
```

The id covers the path headers, so a hunk re-targeted to another path, as a
drop's cascade does, never matches; there compare the changed lines themselves:

```
diff <(git show --format= -U0 <a> | grep '^[-+]' | grep -vE '^(\+\+\+|---) ' | sort) \
     <(git show --format= -U0 <b> | grep '^[-+]' | grep -vE '^(\+\+\+|---) ' | sort)
```

Empty means the same lines, in another file.

Inventory the range's renames and deletions before picking a construction;
they decide which ones are legal:

```
git diff --name-status <base> <tip>
```

**An empty diff is blind to misattribution.** A conflict resolved by taking one
side whole (`git checkout --theirs <file>`) can carry a change out of the
commit whose message explains it and into another one, with the net diff still
empty and the linter clean. After a rebase that conflicted, read each rewritten
commit's own diff and confirm it carries only the kind of change its subject
claims: pick a marker that identifies the change which belongs elsewhere - a
frontmatter key, a pref name, a function signature - and expect no hits in the
commits that don't own it:

```
git show --format= <commit> -- <paths> | grep -E '^[-+]<marker>'
```

## Measuring the churn

Evidence for both churn shapes, a dead intermediate and a commit rewriting
text from its own range:

```
bash <skill-dir>/scripts/git-churn.sh [--origins | --lines] [<carrier>] <base>..<tip> [-- <pathspec>...]
```

The script is `scripts/git-churn.sh` beside this reference,
`.claude/skills/stack-reorganize/scripts/git-churn.sh` from the repository root
when the skill loaded from the checkout; run it from the repository root, since
a pathspec is relative to the current directory. Run the copy the skill loaded
from, never one inside the range under repair. `<base>` is the commit below the
range; a prefix the owner keeps as it is moves it up, and measurement and
rebuild both start above it. The script prints the range's net total, the sum
of its commits' own totals, the gap between them, and each commit's total; a
range that keeps two copies of a directory in sync counts every line twice, so
pass one copy as the pathspec, and a hand resolution during a rebuild goes into
every copy.

The gap is the add-then-remove churn, but its **size is not a threshold**: a
hundred dead lines in a sixteen-hundred-line series reads as noise. Settle the
question by tracing what is dead: a symbol present in the individual commits but absent from the net diff
was built and torn out within the range.

**Trace each dead symbol's lifecycle**: its *birth* (the commit whose diff adds
its definition) and its *death* (the commit that removes it), e.g.
`git show <c> | grep -E '^[+-].*\bsymbol\b'` across the range. Where the churn
is prose there is no symbol to grep; `--origins` blames every line a commit
removes at that commit's parent and sums them by the commit that wrote them,
with the paths under each origin: removals from inside the range are churn to
absorb there, path by path, and removals of pre-range lines are the commit's
own work. It prints the summary table first, so one run serves both, and ends
with the files an in-range commit added that the tip lacks, the birth half of
a dead file's lifecycle. Blame credits a line to the last commit that touched
it and cannot tell a rewrite from an extension, so the in-range count is an
upper bound;
read each counted line. `--lines <carrier>` prints the ones that commit
removes under their origin, with the commit's own additions by path, where the
destination half of a move shows; without a carrier it prints every commit's,
tens of kilobytes on a dozen-commit range. The carrier's hunk in `git show
--format= <carrier> -- <path>` shows the block around each line and the `+`
line that replaced it, which tells an extension (own work) from a rewrite
(churn). The origin's own `git show` shows, in the line's `-`/`+` pair,
whether it rewrote the line or only touched it, which the block rule turns on.
Attribute by block: a block belongs to the commit that wrote most of it, a
blank line to the block it separates, and a line a commit only extended is
that commit's own work.

Then grep the tip for each dead symbol, `git grep -n '\bsymbol\b' <tip> --
<paths>`: a hit is a comment that still describes the dead model, and a rebuild
that reproduces the tip byte for byte makes some commit write that stale
comment at the symbol's birth. Collect the hits before building and fix them
in a residue commit on top, which the owner is free to drop; the `git diff
<backup> <branch>` check then takes its residue form. A dead data shape has no
one name: grep for its removed field names too, and read the doc comment of
every function whose signature the replacement changed, since a description
of the old shape can name no dead symbol at all.

The span from the first birth to the last death carries the dead model and is
often much smaller than the full range; resplitting only it captures most of
the churn win. Confirm the sub-range holds the bulk of the gap by measuring it
on its own. The per-commit column is each commit's size, not its churn; the
`--origins` table names the carriers from the remover's side, and the commit
that wrote the removed lines is the target. The gap and the origins count need
not agree: a churned line counts twice in the gap (its addition and its
removal) and once in the table, which counts removals only, and the gap also
carries diff alignment, so expect the gap on either side of twice the count
(scaffolding a move adds, a heading or blank lines the net diff never sees,
pushes it up; alignment pushes it either way) and reconcile them no further.

The gap does not add up across sub-ranges: two halves can each measure zero
while the whole range measures more, because a commit above rewrites lines a
commit below the split introduced. Measure the halves separately to find out
whether the residue sits inside a part of the range you are allowed to touch.
A small gap of either sign is alignment noise between the net diff and the
per-commit diffs, not a finding. An `R` entry in `git diff --name-status
<base> <tip>` means the full-range gap also carries rename alignment, which no
reorganization removes: the net diff pairs the renamed file with its new name
where the per-commit diffs see a rewrite plus a new file. Measure the range
without the renaming commit, on whichever side of it the churn lies; where the
renaming commit is itself a churn carrier, the `--origins` count stands in,
since blame at the parent sees the file under its old name and carries no
alignment. After a rebuild that keeps the rename, the gap is that alignment
plus twice the remaining in-range count, so read the `--origins` total rather
than the gap.

## Finding a forward reference

Take each cross-reference the range adds - a section heading, a symbol, a file
path, a flag - and confirm its definition exists at the commit that adds the
reference, not just at the tip. In prose the candidates are the backtick-quoted
headings, paths and hyphenated names and the double-quoted section titles the
commit adds; a path that illustrates rather than refers (an example inside a
sentence) is a hit to drop, not to check, and the pathspec keeps a code
file's string literals out:

```
git show --format= <commit> -- '*.md' | grep '^+' | grep -oE '`(#[^`]*|[^`]*\.(md|sh|mjs|js|css|json|yml|toml)|[a-z]+(-[a-z]+)+)`|"[A-Z][^"]{3,60}"' | sort -u
```

The pattern is a starting point; adapt its alternatives to the forms the
stack's prose uses.

In code, a call to a symbol that does not exist yet fails at that commit's
build or tests, but a comment naming one does not. Take the backticked
identifiers and `{@link}` targets in the added comment lines, and the
slash-qualified rule names that lint directives carry unquoted
(`stylelint-disable-next-line plugin/rule`):

```
git show --format= <commit> | grep -E '^\+\s*(//|/?\*)' | grep -oE '`#?[A-Za-z_][A-Za-z0-9_.]*(\(\))?`|\{@link [^}]+\}|\b[a-z-]+/[a-z]+(-[a-z]+)+\b' | sort -u
```

Grep the definition's form, not the bare name, which the reference itself and
a same-named section elsewhere also match; a method's is the name followed by
`(` at the start of a line, where a call has a `.` before the name:

```
git show <commit>:<file> | grep -c '^#* *<Heading>'
git grep -c -E '^\s*(static |async |get |set )*<method>\(' <commit> -- <paths>
```

A lint rule's definition is its registration (the plugin's rule index and the
linter's config); a file path's is the file itself, `git cat-file -e
<commit>:<path>`. Zero at that commit with a hit at the tip is a forward
reference. Reorder so the introducing commit comes first, or absorb the
reference into it. A reference to a name that exists at that depth is not a
forward reference, whatever a later commit does with the name. The mirror
defect, a comment at the tip naming a symbol the range removed, is what the
tip grep under Measuring the churn finds. That stale comment is the residue
commit's business, not this check's: a byte-exact rebuild makes some leaf
write it at the symbol's birth, so exclude the tip's stale symbols from this
grep and fix them on top.

## Splits

Follow the **`stack-split-commit`** skill and its `references/git.md`, which
also cover splitting a revision that is already in review and folding a fix
into the commit that needs it.

## Drops

The commands for `drop-superseded.md`, by its step.

1. **Bound the blast radius.** The two `git log` searches are in the shape
   reference itself.
2. **Drop it.**

   ```
   git branch backup-<name> <branch>          # skip if the backup above already exists
   git rebase --onto <commit>^ <commit> <branch>
   ```

3. **Resolve the cascade.** The rebase halts at each conflict. A faithful
   cascade makes the reverser's pick come out empty, and `git rebase` drops it
   with `dropping <sha> ... -- patch contents already upstream`. That message
   is the confirmation to look for, and git prints it on the `Rebasing (n/m)`
   progress line behind a carriage return, so read the rebase output raw or
   through `tr '\r' '\n'`; a filter that drops `Rebasing` lines drops the
   message with them. Once a delete/modify entry's change sits at the pre-move
   location, `git rm <path>` resolves the conflicted entry. A hunk written by
   hand during the cascade takes its text from the backup tip byte for byte,
   as under Absorbs, at the path where the text lives at the tip: the dropped
   file's own path does not exist there. `GIT_EDITOR=true git rebase
   --continue` after each: the continue opens an editor on the resolved
   commit's message, which a non-interactive shell cannot answer.
4. **Finish coupled changes at their source.** `git commit
   --fixup=<that-commit>`, then `GIT_SEQUENCE_EDITOR=true git rebase -i
   --autosquash <base>` with the base named explicitly (`--autosquash` without
   `-i` works from git 2.44).
5. **Validate.** `git diff <backup> <branch>` must be empty for a net-zero
   drop; `git reset --hard <backup>` returns to the input where it is not.

## Absorbs

Send a later commit's changes into the commits that introduced the text it
rewrites. Three constructions, in order of how much they leave to resolve.
**Where more than one commit is being absorbed, the absorbed commit is not the
tip, or a path it touches belongs to several targets, take the bottom-up
construction whatever the other paths do**; the others then cost one saved
diff and one cascade per commit. The path partition only
decides whether each bottom-up step is a whole-path restore or hand-written.
Whatever the construction, commit every rebuilt commit with
`git commit -C <original>`, then `git commit --amend -F <file>` where the body
changes: `git commit -m` or `-F` alone drops the author date and the
`Differential Revision` trailer with no warning.

**By fixup**, where each target's part is a whole file. Drop the absorbed
commit, re-add each target's part as a fixup of that target, and squash them
all in one rebase:

```
git rebase --onto <absorbed>^ <absorbed> <branch>     # the backup still holds it
git show <absorbed> -- <paths> | git apply --index    # once per target, then:
git commit --fixup=<target>
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>   # name the base explicitly; without -i it needs git 2.44
```

Where a target's part is only a subset of a file, split `git show <absorbed>`
into pieces by hand and apply each with `git apply --index <piece>`;
`git add -p` is interactive and unavailable here. A rework commit's hunks
seldom split that way: one hunk interleaves removals for one target with
additions for another, and a hunk computed against the tip's context fails to
apply at a target's depth when a kept commit in between touched the same
lines. When either happens, stop re-targeting hunks and take each block's
final text from the backup tip, the bottom-up construction below.

Abort on a conflict during the autosquash rather than resolving it, which
misattributes per above, and take the path rebuild instead.

**By path rebuild**, where the hunks partition by path. At each target commit,
take the paths it owns straight from the backup tip, so the content is correct
by construction:

```
git restore --source=<backup-tip> --staged --worktree -- <paths>
```

`git restore --source` runs in no-overlay mode by default: every tracked path
the pathspec matches and the source lacks is removed, so a directory pathspec
at a target commit also carries the deletions and renames that belong to
later commits, the misattribution above. Inventory them first, name files
rather than directories where the target must keep a path the backup tip
lacks, and stage by hand only what the pathspec did not name: a rename whose
`<new>` alone is named leaves `<old>` in place, so `git rm <old>` goes with
it. `git checkout <tree> -- <paths>` never removes a path and aborts on one
the tree lacks. Every restore in the bottom-up construction needs the same
inventory:

```
git diff --name-status <target> <backup-tip> -- <paths>
```

The backup tip carries every later commit's contribution too, so where a
commit above the target is being kept and touches the same paths, restoring
overshoots by its part. Where that commit's depth is free, place it below the
targets, so the top leaf is a whole-path restore and nothing overshoots;
otherwise take its part back off:

```
git show <later-commit> | git apply -R --index
```

That holds while the later commit's hunks still match. Where the later
commit's hunks no longer apply, do not lower the match context: a fuzzy apply
lands at false matches and reports success. Edit the file by hand from the tip
and judge it by its own diff and by the leaf above's, each of which must be
one concern alone, and by the per-commit gates.

**Bottom-up from the backup tip**, where one path belongs to several targets
and so cannot be restored whole at any one of them. Reset to the commit below
the range and build upward. Re-add a commit that moves unchanged with
`git cherry-pick <commit>`, which keeps its author, message and trailer where
`git show <commit> | git apply --index` fails on context that does not exist
yet. Try the original patch first for every leaf: `git show <commit> | git
apply --index --check` at the leaf's depth says whether it still applies, and
a commit the absorbed commit removed little from usually does, so only the
leaves that fail need hand-writing. A leaf found wrong after later leaves
exist takes a fixup of it (the fixup construction above), not a fresh
rebuild. Write the early commits that share the path by hand, taking each block's
text from the backup tip (`git show <backup-tip>:<path>`) byte for byte rather
than retyping it, so the later whole-path restore adds nothing back; for the
leaf directly below the tip, start from the tip's file and delete the lines the
top leaf owns, which keeps everything else byte-identical by construction. A
file assembled outside the tree goes in through git, the `hash-object` route
at the end of "Without touching the worktree" below. At each
later commit restore the paths whose final content is that commit's. Commit
every rebuilt commit, hand-written or restored, with `git commit -C <original>`
so it keeps the author, date, subject and `Differential Revision` trailer
(`git log -1 --format=%B <new> | grep '^Differential Revision:'` confirms the
trailer; `%(trailers)` does not parse that key); where the message must change
but the author and date stay, `git commit -C <original>` then `git commit
--amend -F <file>`. Nothing rebases, so no conflict arises and the net diff is
empty by construction.

**Without touching the worktree**, where the checkout is not yours to edit, the
same construction runs on a scratch index and loose objects, and the checkout
stays at the old tip until the end. Assemble each hand-written file outside
the tree from spans of the backup tip's blobs, then per commit:

```
idx=/tmp/reorg.idx                                     # a scratch index; the real one stays untouched
GIT_INDEX_FILE=$idx git read-tree <parent>             # the commit below in the new series
GIT_INDEX_FILE=$idx git update-index --add --cacheinfo <mode>,$(git hash-object -w <file>),<path>
GIT_INDEX_FILE=$idx git update-index --force-remove <path>
GIT_AUTHOR_NAME=<an> GIT_AUTHOR_EMAIL=<ae> GIT_AUTHOR_DATE=<ad> \
  git commit-tree $(GIT_INDEX_FILE=$idx git write-tree) -p <parent> -F <message-file>
```

`git log -1 --format='%an%n%ae%n%aD' <original>` supplies the author fields
and `git log -1 --format=%B <original>` the message, which is what `git commit
-C` copies; `git ls-tree <backup-tip> <path>` prints the mode; a whole-path
restore is `--cacheinfo <mode>,$(git rev-parse <backup-tip>:<path>),<path>`,
and a rename is a remove plus an add. `read-tree` and `write-tree` each take
seconds to tens of seconds on a mozilla-central-sized index, so budget about a
minute per commit. Finish with one `git reset --hard <last commit>` on the
checked-out branch, which `git branch -f` refuses to move. Where the checkout
is yours, keep the on-branch build; a hand-written file assembled in an
ignored directory is placed with `git hash-object -w`, `git update-index --add
--cacheinfo <mode>,<blob>,<path>` and `git checkout-index -f -- <path>`, which
writes it through git rather than through a shell edit a harness may record.

## Reorder (sink / hoist)

Inside a bottom-up rebuild a reorder is the order you build in. On its own,
move a commit to a new depth by reordering the rebase todo, matching on subject
text rather than hashes so the edit survives the rewriting:

```
GIT_SEQUENCE_EDITOR='<script that reorders the matching line>' git rebase -i <base>
```

A reorder is **content-preserving**, so `git diff <backup> HEAD` must be empty.

When the moved commit and the commits it crosses touched adjacent lines,
resolve the cascade by **strip-and-replay**. At the moved commit's new
position, take its full version (`git checkout <moved> -- <files>`) and *strip*
the additions that belong to the commits now replaying above it, leaving only
the moved commit's own additions on the base. Those commits then replay and
re-add their parts; resolve each re-addition as a **union**, ordering members
to match the final file's layout. Read that layout from `<backup>` (member and
case order) so the tree stays byte-identical.

Before reasoning about "the file", **map its path across the refs involved**: a
rename may live above the moved commit and replay on top, so the path at the
moved commit can differ from the path at the backup tip. A stray blank line
from a union separator shows up as a one-line final diff; fix it in the commit
that introduced it, not at the tip.

**Prove the moved commit stands alone.** When the point of the move is that
the commit is independently reviewable or landable, for instance because it is
being re-attributed to an earlier bug or phase, check it out in isolation,
build, and run the suite for the surface it touches. The empty net diff proves
only that the stack's final tree is unchanged, and a lint pass only syntax.

## Fold-resplit

Fold the range and resplit it by final concern, with the fold's end state as
the target. In git the fold needs no squash and the resplit is the bottom-up
construction under Absorbs, whole (`git commit -C <original>` for a leaf equal
to an input commit): the backup tip's tree is the end state, so
build on the branch (`git reset --hard <base>`, then write or restore each
leaf), take the last leaf with `git restore --source=<backup-tip> --staged
--worktree :/`, and cherry-pick back whatever sat above the range.
Fold-resplit is reserved for never-reviewed work, so `stack-split-commit`,
which adds the handling of a revision already in review, is not needed.
`fold-resplit.md` covers planning the leaves from the final state and building
a leaf no input commit held, reusing a prior split experiment, delegating a
long rebuild, and what each leaf's message and trailer become. Its commands:
an input commit's version of a file is `git show <commit>:<path>`; the
end-state's whole tree is `git restore --source=<end-state> --staged
--worktree :/`; a leaf that keeps an input commit's message and trailer is
`git commit -C <original>`.

## Verifying every commit, not just the tip

`mach lint` scores the worktree whichever commit you had in mind, so it cannot
check the per-commit invariant `# Goals` asks for from the tip. A bare
`./mach lint` scopes itself to the outgoing set against the default remote, so
at a detached checkout of a commit it lints the files that commit's prefix
changed, in that commit's tree; `./mach lint --outgoing <base>` names the base
instead of the remote.

Where the invariant is a whole-tree property git can read out of a commit - two
directories that have to stay in sync, a generated file that has to match its
source - no checkout is needed:

```
for c in $(git rev-list <base>..<branch>); do
  # skip commits where the path does not exist
  git cat-file -e $c:<dir-a> 2>/dev/null || continue
  git diff --quiet $c:<dir-a> $c:<dir-b> || echo "$c out of sync"
done
```

A tree diff covers the file set as well as the content; `git ls-tree -r
<commit> <path>` reads the set. A build, a linter or a test run needs a real
tree. On the branch, in a clean tree you own, `git rebase --exec '<command>'
<base>` runs the command at every commit in turn and stops at the first
failure (`warning: execution failed`); when every step passes nothing is
rewritten and the commits keep their ids. A failed step is consumed, so `git
rebase --continue` moves on without re-running it unless the rebase began with
`--reschedule-failed-exec`: either amend the commit it stopped at under that
flag and continue, or `git rebase --abort`, which returns to the branch, fix,
and rerun. The command can name the commit's own files, except at a commit
that changes the linter itself (a rule, its helpers, the config), whose own
files are the plugin's own sources, which the linter does not take as input,
so the per-file form passes there without linting anything; the invariant at
such a commit is that the whole tree lints clean under the changed rule:

```
git rebase --exec 'if git diff --quiet HEAD^ HEAD -- <linter-dir> <linter-config>; then ./mach lint -l <linter> $(git diff --name-only --diff-filter=d HEAD^ HEAD); else ./mach lint -l <linter> .; fi' <base>
```

The command stays on one line: `--exec` rejects a command containing a
newline, so a longer gate goes in a script file. `--diff-filter=d` keeps a path the commit deletes out of the list: `mach lint`
refuses a path that does not exist before it lints anything, and only filters
out a path of a type the linter does not read. Its summary line prints the
count under the same cross mark as a failure, so read the count, or let the
rebase read the exit status. Send the command's output to a file under
`artifacts/` (`{ ...; } >> artifacts/lint-<branch>.txt 2>&1` around the quoted
command) and read the summary lines there; the rebase acts on the exit status
either way. A message check run over the range scores the
kept commits' verbatim messages too; a complaint there is the owner's, not the
rebuild's.

A stack that changes a lint plugin has that plugin's own test suite and eslint
on its `.mjs` as per-commit gates too, run as the plugin's docs say (`npm`
lives under `~/.mozbuild/node/bin`, and a fresh worktree needs one `npm ci` in
the plugin directory first). Chain several gates in a script under
an ignored directory or outside the worktree and pass that to `--exec`, with
`set -o pipefail`
wherever a gate's output is filtered, since a pipe hides `npm run test`'s exit
status.

A build that must not disturb this tree runs in a detached worktree at the
commit instead. A fresh worktree has no objdir, so the first build there is a
full one; where every commit in the range has to build, prefer a checkout that
already has one.
