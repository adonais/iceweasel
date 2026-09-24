# Closing out a perf regression bug

Every path here ends with a comment in the bug. The perf sheriffs track these, and the
regression policy clock keeps running until the bug reflects reality.

## Acknowledge early, regardless of outcome

The policy gives **3 business days** from the bug being filed to acknowledge and begin
investigating, after which the patch may be backed out. If the user has not commented yet
and the bug is more than a day or two old, say so and draft the acknowledgement before
anything else. A one-line "looking at this, confirmation push running" resets the social
clock even when you have no answer yet.

## Outcomes

### Confirmed and fixed

- Post the final unnarrowed PerfCompare link from `iterate.md` showing the alert set back
  at base.
- Reference the fix bug or Phabricator revision.
- Resolve **FIXED** once the fix lands. If the fix is a separate bug, leave this one open
  and blocked on it rather than resolving early.

### Confirmed, not going to fix

This is a legitimate outcome — a correctness fix or a feature can be worth a few percent —
but it is **not the patch author's call alone**. Do not resolve WONTFIX unilaterally.

- Comment with: the confirmed magnitude, why the patch is worth it, and what was tried.
- Needinfo the perf sheriff named in comment 0 of the alert bug, and raise it in
  [#perf-help](https://mozilla.enterprise.slack.com/archives/C03U19JCSFQ) on Slack or
  [#perftest:mozilla.org](https://matrix.to/#/#perftest:mozilla.org) on Matrix.
- Let them set the resolution.

### Not reproduced

The confirmation push showed no regression, or the distributions overlapped completely.

- Post the PerfCompare link and state the measured delta versus the reported one.
- Say which of these it looks like:
  - **Noise** — the alert fired on variance; the confirmation separates cleanly at base.
  - **A different patch in the same push** — your patch isolated cleanly and showed
    nothing. Name the other candidates from the pushlog so the sheriffs can redirect.
  - **Infrastructure or environment** — a machine pool change, a test harness change, or a
    dependency bump landing around the same time.
- Resolve **INVALID** for noise or an infra artifact. For a wrong-patch attribution, leave
  it open and needinfo the sheriff rather than resolving — the regression is real, just not
  yours.

### Still ambiguous after two confirmation rounds

Do not keep pushing. Comment with both PerfCompare links, state that the effect is inside
the noise band at the retrigger counts tried, and needinfo the perf sheriff. They have
history on which suites and platforms are chronically noisy and can often resolve it
without more CI.

## Bug fields

- **Severity / priority** — set if still `--`. Match the magnitude: a 10%+ regression on a
  headline benchmark like speedometer3 is not S4.
- **`regressed_by`** — should already point at the culprit push. Fix it if the confirmation
  push identified a different patch.
- **Assignee** — if the user is not the right owner (their patch isolated clean), unassign
  rather than silently sitting on it.
- **Keywords** — `perf` and `regression` are usually set by the filer already.

## Draft, do not post

Write the comment and show it to the user. Never post to Bugzilla, change bug state, or
needinfo anyone without their explicit approval.
