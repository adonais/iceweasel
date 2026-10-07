# Layout module instructions

Scoped guidance for `layout/`. The global `../AGENTS.md` still applies.

## Start here
Read the docs in `layout/docs/` before non-trivial work.
- `layout/docs/LayoutOverview.md` for frame tree, frame construction, reflow,
  and fragmentation.

## Review
- Read `layout/docs/LayoutCodeReviewerChecklist.md` as guidance when reviewing
  layout changes.

## Testing
- Write new tests as web-platform-tests (WPT) by default, including
  testharness.js tests, reftests, or crashtests. Put them in the relevant
  subdirectory of `testing/web-platform/tests/`, e.g.
  `testing/web-platform/tests/css/css-flexbox/`. Read
  `testing/web-platform/tests/docs/writing-tests/reftests.md` before writing a
  reftest, and `testing/web-platform/tests/docs/writing-tests/crashtest.md`
  before writing a crashtest.
- If a test uses a Gecko-only API or CSS property, it can still use the WPT
  framework. Put it in `testing/web-platform/mozilla/tests/`.
- Fall back to traditional Mozilla-only test frameworks such as
  `layout/reftests/` or per-subdirectory `layout/*/crashtests/` only when the
  WPT framework does not work, and explain why in the commit message.

## Debugging
- Layout debugger can dump useful layout internal information for a URL. Run
  `./mach run --layoutdebug [filename]`. Read `layout/docs/LayoutDebugger.md`
  for usage.
