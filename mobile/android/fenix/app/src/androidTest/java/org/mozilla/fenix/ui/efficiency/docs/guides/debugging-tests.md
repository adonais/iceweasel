# Running & debugging an efficiency test

Read the run for signal, and don't declare done on a false-green. Companion checks live in
`HARNESS-GOTCHAS.md` (section A).

## Read the run with effpretty

Structured test logs emit on the dedicated `Eff` logcat tag (plain — no baked-in color). Render them with
`effpretty` (`view` a saved/downloaded artifact, or `capture` live from a device). You read a clean trace
instead of thousands of lines of daemon/task noise. Build logs → pipe through `effbuild` for the same reason.

## When you want fields instead of prose

`effloop` writes `run-events.jsonl` beside `run-report.txt`: the same run as one JSON object per
event. Reach for it when the question is quantitative or the prose is in your way.

```bash
# every failure in the run, with the reason it was classified that way
jq -r 'select(.outcome=="FAIL") | "\(.failure)\t\(.verb)\t\(.selector // .page)"' run-events.jsonl

# the slowest lookups, which is usually where a timeout is hiding
jq -r 'select(.type=="LOC") | "\(.elapsedMs)\t\(.selector)"' run-events.jsonl | sort -rn | head

# which test a step belonged to
jq -r 'select(.type=="testStart" or .outcome=="FAIL") | .testId // .name' run-events.jsonl
```

`failure` is a fixed vocabulary, not a sentence: `not_found`, `wrong_state`, `action_failed`,
`still_present`, `appeared`, `never_settled`, `collection_unsatisfied`, `unsupported_strategy`,
`condition_timeout`, `not_arrived`, `no_path`. Match on it rather than on the message beside it --
messages get reworded, and a rule that keyed on the old wording fails by matching nothing at all.

## The done-gate is `effverify`, not "green + 0 failed"

"Green gradle, 0 failed" is NOT proof a test passed — an `@Ignore`'d / SKIPPED test also produces 0 failed.
A conversion is done only when the **named** test:

- appears in a `started:` line (it ran),
- is NOT in any `ignored:` line (not skipped),
- lives in a run reporting 0 failed, and
- isn't marked SKIPPED/FAILED in the raw gradle log.
  `effverify <batchdir> <TestName> [--json]` checks exactly this (lesson E2). Exit 0 = confirmed pass.

## Triage: is it the harness, or a real bug? (scan before assuming product bug)

- **Page-arrival timeout (most common, A6).** `navigateToPage` → `mozWaitForPageToLoad` can't find the
  `requiredForPage` anchor in 10s. Use the `ScreenDump` that fires on failure to separate "selector wrong"
  (element is in the dump) from "screen wrong" (element absent / wrong page / wrong launch state).
- **Slow ≠ flaky (E1).** UIAutomator list rendering can take ~3s; `mozVerify` polls-until-present (logs
  "not found" retries, then finds it). If it passed on try #1 with retries _inside_ the poll, that's fine —
  not flaky.
- **No test-level retry (A5, bug 2065120).** `BaseTest` does not re-run a failed test; a red is a red.
  Firebase still retries once, so a test that only passes on _its_ retry is flaky/failing, not done.
- **Local-only opaque crash (A1/A2).** A test that should report a clean assertion instead dies with a
  StrictMode `penaltyDeath` crash locally (but passes on Firebase) = Espresso's failure-handler screenshot
  tripping StrictMode. `BaseTest` disables screenshot capture; presence probes are exception-safe (return
  false, never throw). Don't reintroduce a throwing presence check.
- **A shared-resolution change breaks many tests uniformly (A4).** Editing `resolve()` / a shared selector
  touches every test that uses it. Re-run the WHOLE class (or suite) after any shared change; a _uniform_
  mass failure = systematic selector break, _scattered_ failures = flakiness. Don't re-tune shared
  resolution on an unconfirmed hypothesis.

## Loop

Static pre-flight with `effcheck` before every device build (it's free and catches the cheap errors), then
build+run via the effwatch bridge, `effpretty` the run, `effverify` the result. Iterate to green — or "good
enough + a logged note" when the remaining gap is a known harness limitation (record it in
`CONVERSION-LESSONS.md`).
