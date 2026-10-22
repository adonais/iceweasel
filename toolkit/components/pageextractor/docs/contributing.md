(pageextractor-contributing)=

# Contributing to Page Extractor

Start with the type definitions for the caller-facing contract, then follow a
request from the parent actor into the child actor. General page traversal has
its own module. Keep site-specific and observability code out of that path.

## Design guidelines

- Treat page data as untrusted. Review changes to hidden navigation,
  permissions, actor replacement, and cleanup for security impact.
- Avoid mutating the live page to make extraction easier. If a page interaction
  is unavoidable, review it as a separate behavior.
- Reject a node with cheap checks before you query style or geometry. Preserve
  early termination and caller-requested limits.
- Keep caller-visible types in the type definitions and describe each option
  by its effect on the result.
- Document decisions and invariants the code does not make clear. Do not
  restate the implementation.

## Run the tests

Browser mochitests live in `toolkit/components/pageextractor/tests/browser`:

```
./mach test toolkit/components/pageextractor/tests/browser
```

Use a small page fixture and assert on the result the caller sees. Cover both
sides of a behavior, such as visible and hidden content. For navigation races,
assert which event fired instead of sleeping for a fixed delay.

For documentation-only changes, run:

```
./mach lint -l codespell -l file-whitespace -l trojan-source toolkit/components/pageextractor/docs
./mach doc toolkit/components/pageextractor --no-serve --no-open
```

## Known limitations

Page Extractor does not read embedded frames, preserve page structure as
Markdown, return PDF links, or expose clickability and ARIA semantics.
Authentication and anti-bot systems can block hidden loads. Search the
component's open bugs before you expand one of these areas.
