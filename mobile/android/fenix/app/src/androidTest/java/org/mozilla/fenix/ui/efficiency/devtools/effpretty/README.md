# effpretty — accessible viewer for ui/efficiency test logs

`effpretty.py` turns a logcat capture into the indented, glyph-annotated, **colorblind-safe** view of
the harness's structured `[STEP]/[CMD]/[LOC]/[OK]/[ERR]` trace, and can write a clean ANSI-free copy
for sharing. It's a **dev tool** (a viewer) — it does not run in tests or change any behavior. Single,
portable Python tool (no shell wrappers) so it works the same for humans, AI agents, and CI on macOS,
Linux, and Windows.

## Why it lives here

`ConsoleLogger` emits a plain structured stream on the `Eff` logcat tag (no baked-in color). Color and
formatting are a _view-time_ concern, so the raw logcat artifact — including the one downloaded from a
Firebase test run — stays clean and machine-parseable. `effpretty` is how a human renders that stream.
One plain source, many renderers (this CLI today, a dev-tools GUI later).

## Use

Two subcommands (`view` is the default if you omit it):

```bash
# Render a saved logcat / downloaded Firebase artifact (no device needed)
python3 effpretty.py view firebase_logcat.txt
python3 effpretty.py firebase_logcat.txt          # same (view is default)
some-command | python3 effpretty.py               # or from stdin

# Capture from a connected device and render live
python3 effpretty.py capture --out ~/Desktop/run.txt            # live: clear buffer, then follow
python3 effpretty.py capture --mode watch --out run.txt         # attach to a run in progress
python3 effpretty.py capture --mode dump  --out run.txt         # snapshot a finished run
```

`capture` resolves `adb` via `ANDROID_SDK_ROOT` / `ANDROID_HOME` / `PATH` / the macOS default, applies
the tag filter itself (structured stream on `Eff`; `System.out` kept for pre-consolidation logs), and
streams into the renderer. Ctrl-C stops a live capture cleanly.

Common options (both subcommands): `--out FILE` (clean ANSI-free copy for handoff),
`--color-mode auto|truecolor|256|off` (auto falls back to 256-color on terminals without truecolor,
e.g. macOS Terminal.app), `--color-scope tag|line`, `--no-color`. Run `python3 effpretty.py <cmd> -h`.

Optional ergonomics: add a shell alias (e.g. `alias eff='python3 /abs/path/effpretty.py'`) — but the
tool needs no setup to run.

## Two streams, one capture

The harness emits the same run twice: prose on the `Eff` tag for a human, and one JSON object per
event on `EffJson` for a machine. effpretty is the only process reading logcat during a run, so it is
where they are separated -- a second `adb logcat` would race this one for the same buffer and both
would come away with holes.

```bash
effpretty capture --mode watch --out run-report.txt --events run-events.jsonl
```

`--events` receives the structured records verbatim, one per line, and they are never rendered: they
describe the same events as the `[CMD]`/`[LOC]` lines beside them, so printing both would bury the
narrative. `efftriage` reads that sidecar in preference to the rendered report.

`--events` works on `view` as well as `capture`, which is how a Firebase run gets the same treatment:
there is no effpretty on the CI device, but the downloaded logcat still contains the `EffJson` lines.

```bash
effpretty view firebase-logcat.txt --out run-report.txt --events run-events.jsonl
```

Why bother, when the rendered report says the same thing: triage rules that match rendered English
break silently. Rewording a harness message leaves every test passing and the rules quietly matching
nothing -- which happened to one rule in August 2026, and to eight more at once during the BasePage
consolidation. A field cannot be reworded by accident.

Each record carries what the prose only implies: `verb`, `selector`, `strategy`, `value`, `outcome`
(OK/FAIL/SKIP), `elapsedMs` as a number, a `failure` taxonomy value rather than a sentence, the
stack of whatever threw, and the label of the screen dump taken for that failure.

## What it surfaces

- Structured steps → indented, colored, glyph-annotated.
- `TestRunner` → `▶ TEST` banners; `run finished` green (0 failed) / vermillion (≥1 failed).
- `BaseTest` retry → loud `↻ RETRY (first attempt failed)` — a test that failed attempt #1 and passed
  on retry (a potentially masked failure).
- `AndroidRuntime:E` → `‼ CRASH`.

Palette is Okabe–Ito (colorblind-safe); glyphs + indentation carry the meaning so it stays readable
with color off. See the KB "Observability & Logging" how-to for the full workflow.
