#!/usr/bin/env bash
# Cold-tests which skill fires for a set of prompts, to catch trigger regressions on the
# perftest / perf-regression-triage / profiler-analysis boundary.
#
#   ./trigger-tests.sh [results-dir]
#
# Exits 0 if every case routes as expected, 1 otherwise. Each run spawns a fresh headless
# session granted only the Skill tool: granting Read as well lets the model reach skill
# content without invoking Skill, which silently defeats the measurement.
#
# Advisory, not a gate. This measures model behaviour, so a case can fail for reasons
# unrelated to the skill descriptions (model update, nondeterminism). Re-run before
# concluding an edit broke routing, and do not wire it into CI.
#
# Add a case as "name|expected-skill|prompt", using <none> when nothing should fire.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RESULTS_DIR="${1:-$REPO_ROOT/artifacts/skill-trigger-tests/$(date +%Y%m%dT%H%M%S)}"

# Project skills only load for sessions rooted in the repo; without this every case
# silently reports <none> when the script is invoked from elsewhere.
cd "$REPO_ROOT" || { echo "cannot cd to $REPO_ROOT" >&2; exit 2; }

CASES=(
  "pos-bug-live-framing|perf-regression-triage|https://bugzilla.mozilla.org/show_bug.cgi?id=2034476 my patch caused this regression, what do I do now"
  "pos-alert-no-url|perf-regression-triage|Perfherder filed an alert saying my patch regressed speedometer3 by 12% on linux2404-64-shippable. Alert summary 49649. What now?"
  "pos-perfcompare|perf-regression-triage|what does this PerfCompare result mean, my patch looks slower"
  "neg-raptor-local|perftest|how do I run raptor speedometer3 locally"
  "neg-alert-tests-on-try|perftest|how do I run the tests from alert summary 49649 on try"
  "neg-profiler-link|profiler-analysis|can you analyze https://share.firefox.dev/4xbihh8"
  "neg-mochitest-failure|<none>|this mochitest started failing on autoland"
)

command -v claude >/dev/null || { echo "claude not found in PATH" >&2; exit 2; }
command -v rg >/dev/null || { echo "rg not found in PATH; run ./mach bootstrap" >&2; exit 2; }

mkdir -p "$RESULTS_DIR"
echo "Running ${#CASES[@]} cases -> $RESULTS_DIR"
echo

for entry in "${CASES[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  prompt="${rest#*|}"
  claude -p "$prompt" \
    --allowedTools Skill \
    --output-format stream-json \
    --verbose \
    > "$RESULTS_DIR/$name.jsonl" 2>&1 &
done
wait

failures=0
for entry in "${CASES[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  expected="${rest%%|*}"

  fired=$(rg -o '"name":"Skill","input":\{"skill":"[^"]*"' "$RESULTS_DIR/$name.jsonl" 2>/dev/null \
    | sed 's/.*"skill":"//; s/"$//' | sort -u | paste -sd, -)
  [ -z "$fired" ] && fired="<none>"

  if [ "$fired" = "$expected" ]; then
    printf 'PASS  %-24s %s\n' "$name" "$fired"
  else
    printf 'FAIL  %-24s expected %s, got %s\n' "$name" "$expected" "$fired"
    failures=$((failures + 1))
  fi
done

echo
if [ "$failures" -eq 0 ]; then
  echo "All ${#CASES[@]} cases routed as expected."
  exit 0
fi
echo "$failures of ${#CASES[@]} cases mis-routed. Transcripts in $RESULTS_DIR"
exit 1
