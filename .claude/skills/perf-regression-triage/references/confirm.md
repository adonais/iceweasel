# Confirming the regression

Goal: one command that answers "does this patch actually cause the alert." Everything
here is about getting a trustworthy answer on the first attempt, because a second
confirmation round costs another few hours and a lot of CI.

## Get the local repo into the right shape

`--alert` compares your working revision against **the base revision your patches sit on**
in the local repository. The comparison is only meaningful if that base matches the alert.

1. Take `baseRev` from the PerfCompare link in the bug — that is the push immediately
   before the culprit.
2. Update to it, then apply the user's patch on top so exactly one patch separates the two
   sides. If the user still has the patch as a local commit, rebase it onto `baseRev`.
3. Confirm with `git log --oneline -3` (or `jj log`) that the patch is a single commit
   directly on top of the base.

If the culprit push contained several patches and only one is the user's, this setup is
what isolates it. That is the point: the alert blames a push, this push blames a patch.

Verify the task selection without submitting anything:

```
./mach try perf --no-push --alert <ALERT_ID> --rebuild 10
```

`--no-push` prints the calculated task selection and changes nothing. Keep it immediately
after `./mach try perf` — the skill's `allowed-tools` entry is the prefix
`Bash(./mach try perf --no-push:*)`, so putting the flag anywhere later means it no longer
matches and the dry run prompts for permission like a real push. Show the user the task
list and the command before asking to push.

## The push

```
./mach try perf --alert <ALERT_ID> --rebuild 10 -m "Confirm bug <BUG> perf regression"
```

Do not submit base and new yourself. This one command pushes both sides for you.

**Never submit this without the user's explicit approval.**

### Retriggers

`--rebuild` accepts 1-20. Use **10**. That is the floor for separating a small real shift
from run-to-run variance on speedometer-class tests, and it covers the 3-10% range where
most alerts land.

Go higher — 12 to 15 — only for a sub-3% regression or a suite already known to be noisy.
Do not go lower to save CI: a thin run routinely produces an ambiguous result, and the
second round it forces costs far more than the retriggers you skipped.

### Do not use `--non-pgo` here

Alerts are almost always detected on shippable/pgo builds (`linux2404-64-shippable` in the
alert table). `--non-pgo` builds faster but is a different optimization configuration, and
a regression can appear or vanish across that boundary. Confirm on the same configuration
the alert fired on. `--non-pgo` belongs in the iteration loop, not here.

### Narrowing

If the alert lists 18 tests, `--alert` runs all of them. That is correct for confirmation —
you want to know the true blast radius, and a fix that helps one test can hurt another.

Narrow only if the user is explicitly trading coverage for turnaround:

```
./mach try perf --alert <ALERT_ID> --tests speedometer3 --platforms linux --rebuild 10
```

Say plainly which tests you dropped. Silent narrowing turns "confirmed" into a claim the
push does not support.

## Reading the result

`mach try perf` prints a PerfCompare link when it finishes. That is the primary artifact —
open it, or give it to the user. For the raw job state:

```
treeherder-cli <try-revision> --perf
treeherder-cli <try-revision> --watch --notify     # if it is still running
```

Judge it on three things, in order:

1. **Direction and size.** Does the delta match the bug's reported magnitude? A bug
   claiming 12% that reproduces at 1% is not confirmation.
2. **Overlap.** With 10 retriggers per side, do the two distributions actually separate? A
   large mean delta with heavily overlapping runs is noise.
3. **Consistency across the alert set.** Real regressions from one patch usually move a
   coherent group of subtests, not one outlier out of eighteen.

PerfCompare's own confidence indicator is a reasonable tiebreaker, but the overlap check
matters more than the label.

## Outcomes

- **Confirmed** — record the measured delta per test in the bug (it becomes the target the
  fix has to clear). Continue to step 3 in SKILL.md.
- **Not reproduced** — do not start optimizing. Go to `close-out.md`.
- **Ambiguous** — one more round at higher `--rebuild`, narrowed to the two or three
  most-regressed subtests. If it is still ambiguous, that is itself the finding; take it to
  `close-out.md` and the perf sheriffs rather than burning more CI.
