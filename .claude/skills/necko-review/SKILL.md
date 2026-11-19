---
name: necko-review
description: Use this skill when reviewing or writing patches to networking code (Necko, netwerk/).
---

# Guidelines for netwerk/ (Necko) patches

These guidelines assume the general Firefox C++ rules, which they do not repeat. Follow the [Mozilla C++ coding style](https://firefox-source-docs.mozilla.org/code-quality/coding-style/coding_style_cpp.html) (naming prefixes, string argument types, error checking, include rules, `static` linkage, clang-format) and [Using C++ in Mozilla code](https://firefox-source-docs.mozilla.org/code-quality/coding-style/using_cxx_in_firefox_code.html) (permitted language features, and Mozilla data structures such as `nsTArray`, `nsTHashMap` and `Maybe` in place of their `std::` equivalents). The guidelines below cover what reviewers repeatedly asked for beyond those documents.

## 1. Explain the non-obvious in comments and interface docs

Add a short comment saying *why*: why a dispatch goes through the event loop, why an early return is safe, why a fix is the right one. Document every new IDL attribute, interface, enum ordering and `StaticPrefList.yaml` entry. Link or quote the spec step being implemented. Delete or update comments that the change makes stale. Update prose docs, for example `captive_portals.md`, when behaviour changes, and mark retired bitflag values as unused. Be concise and use existing terminology. Limit inline comments to 2 lines if possible.

## 2. Reuse existing helpers, simplify control flow, and keep APIs minimal and well placed

Use existing Gecko helpers whenever possible, for example:

- `CloseTransaction`
- `DataMutex<T>` in place of hand-rolled locking
- `Services.io.newURI` in place of regex URI parsing
- an existing `"last-pb-context-exited"` observer

Prefer early returns to extra indentation, not only on error paths, and factor duplicated branches into one. Keep members private, adding a `Take…()` accessor or a read-only IDL attribute instead of making fields public. Don't make functions public when they are only used inside their `.cpp` file.

Put code in the layer that owns the concept. For example, `NeqoHttp3Conn` stays inside `Http3Session`, and generic UDP and QUIC fixes go upstream into neqo or `quinn-udp` (file happy-eyeballs state-machine issues on its GitHub repository). Forward-declare interfaces in IDL too, not only in C++ headers. Never include private netwerk headers by relative path.

## 3. Ship tests with the change, and make them robust

Maintain test coverage:

- Every fix comes with a regression test: xpcshell, gtest, mochitest, marionette or WPT.
- Cover both pref states, including the old behaviour with the pref flipped.
- Cover negative paths and redirects.
- If the logic runs in a child process, add a `netwerk/test/unit_ipc` variant.
- Extend `http3server` when HTTP/3 behaviour needs a server.
- Prefer `NodeServer.sys.mjs` to `httpd.sys.mjs`.
- See [Network Testing Guidelines](https://firefox-source-docs.mozilla.org/networking/network_test_guidelines.html) for examples.

Good test hygiene:

- Restore state with `registerCleanupFunction` and `Services.prefs.clearUserPref`, or with `SpecialPowers.pushPrefEnv`, and close servers in cleanup.
- Wait with `TestUtils.waitForCondition` rather than racing events.
- Prefer using events instead of timeouts.
- Run new tests with `--verify`.
- Avoid deprecated helpers such as `Preferences.jsm`.
- Give each `skip-if` a minimal condition and a bug number.

## 4. Keep the diff minimal and lint-clean

Remove the following before requesting review:

- includes your change made unnecessary (but keep the ones you use directly, as the C++ style guide requires)
- dead code and redundant checks or assertions
- debug leftovers
- unrelated files and unneeded IDL uuid bumps

Don't reformat code you didn't touch. Do reformat code you did touch. Run all linters with `./mach lint --outgoing --warnings` and static analysis with `./mach static-analysis --warnings --outgoing`, not just clang-format. Use `//` comments in C++.

## 5. Send a well-described, correctly split, try-tested stack

- **Commit message:** make it describe what the patch actually does, including removals. Keep security-sensitive details such as UAF descriptions out of the summary, because it lands as the commit message.
- **Stack shape:** put each change in the revision it belongs to, and keep dependencies in the stack.
- **Follow-up bugs:** file one for deferred work and reference it in a `TODO`/`XXX` comment.
- **Sign-offs:** get the required ones: necko-reviewers, data review, l10n review for new strings, and `supply-chain/` audits for new crates (extend existing audits where possible).
- **Dependencies:** pin crate versions, not `"*"`, and pin releases, not branches.
- **Try runs:** link a try run with the relevant suites.
- **Builds:** watch for includes that only non-unified builds catch, and for heavy headers such as `GleanMetrics.h` included from a header.

## 6. Handle every failure path, assert your invariants, and log usefully

Handling failures:

- Null-check anything that can be null, even where it rarely is, such as the URI from `NS_GetFinalChannelURI`.
- Don't let an early return skip later work (e.g., logging, notifications in `Cancel`, `OnStart`/`OnStopRequest`, sanitization steps).
- Pick the error code deliberately. `NS_ERROR_NET_RESET` restarts the transaction.
- Make intentionally ignored results explicit with `(void)`.

Assertions:

- State invariants with `MOZ_ASSERT`, and use `MOZ_ASSERT_UNREACHABLE` for exhaustive cases. In Rust, add a debug-mode panic for "impossible" states, such as unexpected 0-RTT states.
- Decide deliberately between `MOZ_DIAGNOSTIC_ASSERT`, a release assert, and a runtime check with a graceful fallback. Reviewers prefer a check to a crash when the case is reachable, or `MOZ_ASSERT` plus an early return.

Logging:

- Keep `LOG()` lines reachable across early returns, and don't drop them in a rebase.
- Log cancel reasons where they are guaranteed to run, such as the channel destructor.
- Log state transitions through a setter.
- Log `nsresult` values with `PRIx32` and a cast.
- Use `neqo_common::qerror` (and similar) in Rust, including in the HTTP/3 test server.
- Emit a console message only once per load.

## 7. Use precise names and clear user-facing strings

Names:

- Bake units into names, for example `sleepInMs`.
- Drop legacy `NS_`/`ns` prefixes inside `mozilla::net`.
- Choose names that describe what the thing is, for example `mAttempts` and `is_doh`.
- Keep Glean metric namespaces consistent, for example all TRR metrics under `dns::`.
- Name enum values so that comparisons read correctly.
- Positive pref names are covered in guideline 11.

User-facing strings:

- Avoid Necko jargon, for example "speculative connection".
- Give a string a new ID when its meaning or placeholders change, as with `CORSDidNotSucceed2`.
- Add a Fluent migration when moving `.properties` strings to `.ftl`. Migrations between two `.properties` files are not supported.
- Keep phrasing consistent within a file, and describe placeholders accurately for translators.

## 8. Use Gecko idioms in C++ and Rust

C++, beyond the style guide:

- Use `nsDependentCSubstring` for string views and `LowerCaseEqualsASCII` for case-insensitive comparisons.
- Use `Result`/`mozilla::pkix::Result` over ad-hoc result types, and enums over bare `bool` return values.
- Use `size_t` for sizes, to avoid implicit narrowing.
- Make data `const` when it is never mutated.
- Use `inline constexpr` for header constants.
- Move rvalues instead of copying.
- Avoid unnecessary `reinterpret_cast`.
- Don't add new NSPR (`PR_*`) uses.

Rust:

- Use `moz_task` rather than hand-rolled runnables.
- Return a `Result` internally and convert it to an `nsresult` at the public boundary. Avoid `unwrap` where an error can propagate.
- Drop unneeded `pub`.

## 9. Treat the content process as untrusted, and design IPC defensively

Validating content-process data:

- Validate or recompute in the parent anything a content process sends, such as hosts, flags like `LOAD_DOCUMENT_NEEDS_COOKIE` and domains written to prefs. Don't trust values arriving through `CookieServiceChild` or `DocumentLoadListener`.
- Use type-checked enums in IPDL rather than bare integers.
- Use `IPC_FAIL` with a reason string.

Limiting what reaches the content process:

- Send the content process only what it needs, for example no proxy response headers, and cleared headers for cancelled channels as a Spectre defence.
- Consider whether a feature should be parent-process-only.

Security checks:

- Use principals rather than URIs. Calling `SchemeIs` on a principal is a smell.
- Include `OriginAttributes` in keys, and key WebTransport connection hashes by `serverCertificateHashes`.
- Keep anonymous (`SEC_COOKIES_OMIT`) requests off connections that carry cookies.
- Filter private-browsing entries, for example in `about:networking`.
- Fail closed on unauthenticated metadata.

IPC design:

- Don't send IPC messages from constructors.
- Avoid new sync IPC.
- Prefer IPDL return values or `MozPromise` to paired request/response messages.

## 10. Design telemetry so it can be analysed, and test it

Before landing, decide how the change will be measured in the field.

- **Metric type:** pick the Glean type that fits:
  - `memory_distribution` for byte values
  - labeled counters with labels taken from, for example, `neqo_transport::Error`
  - `exponential` rather than `linear` custom distributions for log-normal data
- **Labels:** use generated label enums via `EnumGet`.
- **Existing probes:** don't change the type of an existing probe, because that breaks queries. Rename it instead.
- **Hot paths:** avoid recording at high frequency on hot paths, and aggregate instead.
- **Coverage:** add tests that assert collection, and don't drop existing probes on some platforms.

## 11. Gate new behaviour behind a well-named pref, and plan rollout and migration

Gating and rollout:

- Gate new behaviour behind a pref, and check it before doing any other work.
- Use positive `.enabled` names.
- Document each value in `StaticPrefList.yaml`.
- Enable in Nightly first and file a bug for the release flip.
- Mark Nimbus features that record exposure accordingly in `FeatureManifest.yaml`.
- Decide whether a pref is read once at `Init()` or live, and what a runtime change means for cached state.
- Remove prefs that become dead.
- Push to try with the relevant networking pref flipped, for example `fast-fallback-to-IPv4`, and run `./mach try perf` with a new pref enabled.

Migration:

- When renaming prefs or changing persisted data (cookie DB, Cache API `DBSchema`, permissions, profile flags), write a migration.
- Preserve raw stored values, such as the cookie DB's `rawSameSite`.
- Weigh a schema migration against alternatives. For example, reviewers compared a cookie schema migration with re-shipping CHIPS.
- Check upgrade and downgrade paths, including extension and embedder APIs.

## 12. Make thread affinity and locking explicit

Necko objects are often touched from several threads: the main thread, the socket thread, the WebSocket `IOThread` and others.

Thread affinity:

- Assert thread affinity with `MOZ_ASSERT(NS_IsMainThread())`, even when every current caller is on the right thread. This is especially important when reading prefs that are not `RelaxedAtomic`, and for main-thread-only state such as the maps in `nsIOService`.
- Use `NS_DECL_THREADSAFE_ISUPPORTS` for objects used off the main thread.
- Decide up front which thread owns an object, and assert it. `SocketProcessChild` singletons, for example, should assert their owning thread, and a `HappyEyeballs` instance should track the thread it was created on.
- Don't re-dispatch when already on the target thread.
- Proxy-release members on their owning thread, for example the WebSocket `IOThread`, instead of adding locks.

Locking:

- Annotate locked state with `MOZ_REQUIRES`/`MOZ_GUARDED_BY` rather than runtime asserts, as with `MOZ_REQUIRES(mLock)` on `nsHttpTransaction` accessors.
- Place a mutex next to the fields it guards.
- Keep pref accesses and sorting outside locked regions.

## 13. Follow the spec, compare with other browsers, and keep WPT metadata accurate

- **Spec conformance:** link and/or quote the spec (WHATWG, W3C or IETF RFCs) at the implementing code, and check behaviour against its exact wording, for example "*from* secure contexts". When diverging from a spec, comment on the reason.
- **Other browsers:** when diverging, check what Chrome does.
- **WPT:**
  - Update `testing/web-platform/meta` expectations when results change.
  - Don't delete expectations wholesale.
  - Upstream new WPTs through the web-platform-tests repository.

## 14. Avoid unnecessary work on hot paths, and measure performance claims

Avoiding waste:

- Reuse buffers on hot paths (`Truncate()` and refill) instead of reallocating.
- Avoid memory allocations or copies when possible.
- Order conditions so the cheapest check runs first.
- Hoist values that don't change per request, such as an SSD check.
- Reuse an already-computed `now` rather than making another syscall.
- Avoid extra refcount cycles.
- Avoid a sync main-thread dispatch followed by sync IPC; do the work off the main thread.
- Move blocking I/O off the thread that owns it.
- Bound loops over untrusted input.
- Use the best-suited data structures in terms of operational complexity, especially for the hot path.

Measuring claims:

- Back performance claims with profiles at realistic sizes.
- Back them with a `./mach try perf` or Talos run.

## 15. Get ownership, lifetimes and shutdown order right

Ownership:

- Pass non-owning references as raw pointers.
- Capture `RefPtr{this}` in async lambdas.
- Don't return raw pointers into internal data.
- Clear back-pointers so that nothing outlives its owner.
- Prefer `MOZ_STACK_CLASS` to refcounting for scope guards.
- Copy data that listeners could mutate by cancelling, because otherwise a UAF can result.

Cycles and shutdown:

- Check for reference cycles, for example between `Http3Stream` and `Http3Session`. Break them with `WeakPtr` as `Http2Session` does, and cycle-collect held promises.
- Use an observer such as `"last-pb-context-exited"` for private-browsing cleanup.
- Order shutdown relative to Glean and XPCOM.
