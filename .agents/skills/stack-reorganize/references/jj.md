# Reorganizing a stack with jj

Mechanics for `stack-reorganize` in a Jujutsu checkout. Read `SKILL.md` first
for the contract, the envision phase and the diagnosis, which hold whichever
tool you use.

## Preconditions

Before you start, ensure a clean starting state with no uncommited changes and no conflicts in the original commit series: run `jj st` and `jj log -r 'main..@'`. Also note the current op-id (`jj op log -n1`) so you can `jj op restore` if anything goes sideways. Remember how to get the overall diff of the original commit series, e.g. `jj diff --git --from oty --to yuxp --at-op aab4`.

## Execution

Once you know where you want to go, it's just a matter of creating the right commits with the right commit message and the right content. For small commits it can make sense to just rewrite them from scratch. For larger commits you'll want tool assistance.

You can choose to either mutate the original changes, or you can duplicate changes so that the original changes are still around to quickly compare against. If you mutate the original changes, you can use `--at-op=<operation-id>` with any jj command to simulate a previous state of the repository.

When you're done with everything, make sure the current jj change is an empty change on top of the last commit (`jj new`). In general, prefer `jj new; make changes; jj squash` over `jj edit` so that you can use `jj diff` while you're working to see just the changes you made - if you instead used `jj edit vwx; make changes; jj diff`, it will give you the combined diff of vwx + your local changes, which is often not what you want.

At the end, run `jj fix`. This will run ./mach lint --fix on every commit in parallel and make sure lint passes after every commit.

`jj fix` runs only the tools configured under `fix.tools`; where `jj config list fix` prints nothing, lint each rewritten commit by hand: `jj new <commit>`, `./mach lint <paths>`, repeat.

`jj describe -r <change> -m <commit-message>` sets the commit message for a change.
`jj commit -m <msg>` is a shortcut for `jj describe -m <msg> && jj new`
`jj rebase -r <single-change> -d <new-parent>` moves a single change.
`jj rebase -s <subtree-root> -d <new-parent>` moves a subtree.
`jj rebase -r <single-change> --before <new-child>` or `jj squash --from <change> --insert-before <new-child>` can be used to reorder.
`jj new <conflicted-change>; <address conflicts>; jj squash` can be used to resolve conflicts.
`jj squash --from <one-or-more-changes> --into <dest-change> [FILESET]` can be used to combine changes. Pass `-u` (use destination's description) or `-m "..."` to skip the description editor when both source and destination have descriptions.
`jj squash --from X --insert-before <target> FILESET` extracts FILESET from X into a new commit before `<target>`. This is the swiss army knife for splitting and relocating:
  - `--insert-before X` → FILESET goes into a new parent of X (split, FILESET first).
  - `--insert-before <child-of-X>` → FILESET goes into a new child of X (split, FILESET second).
  - `--insert-before <some-distant-commit>` → FILESET is relocated elsewhere in the stack (the "land-early nugget" case).
  Prefer this over `jj split`, which is a less general subset.
`jj absorb -f <change>` is the fastest way to fold a refactor commit back into its ancestors: each modified line goes to the closest mutable ancestor that last touched it. Anything attributable only to immutable code (e.g. `main`) stays behind in `<change>` as a residue, which can then be squashed manually. Try this first when "fold C4 into C2 and C3"-style work is needed.
`jj restore --from <rev> [paths]` pulls file content from another revision into the working copy without launching an editor.
`jj file show -r <rev> <path>` prints the file's content at `<rev>` to stdout — useful for snapshotting "final state" into a temp file before you rewrite history, so you can later restore or diff against it without checking out the revision.

For guidance on splitting an individual commit, check the `stack-split-commit`
skill and its `references/jj.md`.

`jj abandon <change>` drops a commit and rebases its descendants automatically, recording any conflicts in them rather than halting. That makes drop-at-source cheap here; `drop-superseded.md` says when it is the right call, and "Drops" below gives the commands by its step.

Churn measurement is git's: `git.md`, "Measuring the churn", runs `scripts/git-churn.sh` over a `<base>..<tip>` of commit ids. In a colocated checkout, `jj log --no-graph -T commit_id -r <change>` prints the commit id for a change id.

`jj op log` plus `jj op restore <op-id>` lets you undo cleanly after mutating commits; `jj --at-operation <op>` peeks at (or even mutates) prior states without disturbing current work.

## Drops

The commands for `drop-superseded.md`, by its step.

1. **Bound the blast radius.** jj has no string search over history, so a
   colocated checkout runs the shape reference's two `git log` searches; the
   path form alone is `jj log -r '<change>::<tip>' <added-path>`.
2. **Drop it.** Note the operation to return to (`jj op log -n1`) and the
   tip's commit id (`jj log --no-graph -T commit_id -r <tip>`), then
   `jj abandon <change>`. The descendants are rebased at once and their
   conflicts recorded, so the cascade is worked through afterwards. A rewrite
   carries every bookmark on the range with it: list them first
   (`jj bookmark list -r '<change>::'`), and one that must stay put is moved
   back afterwards with `jj bookmark move <name> --to <commit>
   --allow-backwards`, or the range is worked on as a `jj duplicate`.
3. **Resolve the cascade.** `jj log -r 'conflicts()'` lists the conflicted
   descendants; resolve them bottom-up with `jj new <conflicted>`, edit the
   conflict markers, `jj squash`. A faithful cascade leaves the reverser an
   empty change, which jj keeps: confirm `jj diff -r <reverser>` prints
   nothing, then `jj abandon` it; a bookmark pointing at it is deleted by the
   abandon, so move it to the parent first. On a whole-file move-then-unmove
   the reverser can instead come up conflicted on the file it deletes, which
   the drop already removed: deleting the file resolves it, and `jj diff` is
   then empty. A hunk written by hand takes its text from
   the original tip byte for byte, `jj file show -r <tip-commit-id> <path>`,
   at the path where the text lives at the tip.
4. **Finish coupled changes at their source.** `jj new <that-commit>`, edit,
   `jj squash`.
5. **Validate.** `jj diff --from <tip-commit-id> --to <new-tip>` must be empty
   for a net-zero drop; `jj op restore <op-id>` returns to the input where it
   is not.

## Fold-resplit

The commands for `fold-resplit.md`. Keep the original tip's commit id before
rewriting; it is the end-state. An input commit's version of a file is
`jj file show -r <commit> <path>`; the end-state's whole tree is
`jj restore --from <tip-commit-id>` in a new change on top of the last leaf; a
leaf equal to an input commit is that commit rebased into place
(`jj rebase -r <change> -d <parent>`), and a leaf that keeps an input commit's
message copies its description
(`jj describe -m "$(jj log --no-graph -r <original> -T description)"`).

## Avoiding interactive tools

Avoid running `jj diffedit`, `jj split` (without paths), and `jj squash -i` - these all open a diff editor and aren't usable from a non-interactive shell.
