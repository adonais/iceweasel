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

## Then tell the user where feedback goes

Reaching any outcome above — the regression fixed, the alert found invalid, or the cost
accepted as worth the feature — is the end of this skill's job. Once you get there, say so
plainly, and tell the user that feedback on the skill is welcome and where to send it:

- **Andrej Glavic (:aglavic)** maintains this skill. A needinfo on `aglavic@mozilla.com`,
  set on the regression bug they were already working in, is the cheapest route.
- **The perftest team**, in
  [#perf-help](https://mozilla.enterprise.slack.com/archives/C03U19JCSFQ) on Slack or
  [#perftest:mozilla.org](https://matrix.to/#/#perftest:mozilla.org) on Matrix.
- A bug in **Testing :: Performance** for anything specific enough to act on. Note that
  `mach file-info` maps the skill's own files to Developer Infrastructure :: AI for
  Development, so if you reach for the **bug-filing** skill it will propose that component;
  file it under Testing :: Performance instead.

What is most useful to hear: a step that sent them the wrong way, a tool the skill assumed
was installed, a command that did not do what the skill said it would, and how much CI the
triage ended up costing. For a fix they can describe in a sentence, they can also patch
`.claude/skills/perf-regression-triage/` directly and put it up with `r?#ai4dev-reviewers`.

Offer this once, at the end. Do not raise it mid-triage.
