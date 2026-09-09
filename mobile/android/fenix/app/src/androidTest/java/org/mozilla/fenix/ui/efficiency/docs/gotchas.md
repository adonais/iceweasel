# ui/efficiency harness gotchas & authoring checklist

A running catalog of bugs we've hit in the harness core / helpers / primitives, plus the checks that
catch them. Use it two ways: (1) a **review checklist** against new page objects, selectors, and verbs;
(2) a **triage list** when a test fails weirdly — scan here before assuming a product bug.

Each entry: **symptom → cause → check**. Add new ones as we find them; link the Jira/bug where relevant.

Last updated: 2026-07-22.

---

## A. Known harness bugs (things that have actually bitten us)

### A1. Local-only opaque crash / StrictMode penaltyDeath on any failure

- **Symptom:** a test that should report a clean assertion failure instead dies with an opaque
  StrictMode `penaltyDeath` crash — but only locally on a real device; passes on Firebase.
- **Cause:** Espresso's `DefaultFailureHandler` captures a screenshot on failure; that bitmap copy trips
  Fenix's StrictMode `penaltyDeath` and kills the process before the real error surfaces.
- **Check:** `BaseTest.setUp()` installs `Espresso.setFailureHandler(DefaultFailureHandler(appContext, false))`
  (screenshot capture off). Never swap this for a broad `StrictMode.setVmPolicy` relaxation.

### A2. A presence/verify probe that throws feeds the crash path

- **Symptom:** navigation polling or an "is this present?" check crashes instead of returning false;
  can also trigger A1.
- **Cause:** a presence primitive threw instead of degrading to `false`.
- **Check:** `mozVerifyElement` and every presence probe used by `mozIsOnPageNow`/`mozWaitForPageToLoad`
  are wrapped try/catch → return `false`, never throw. `ElementState.probe` is where that now lives, and
  any new trait added there must keep it.

### A3. Compose merged-vs-unmerged tree trap (regressed twice)

- **Symptom:** a text/content-desc selector suddenly finds 0 nodes → "element not found" → many tests
  navigating via that label fail at once (e.g. all Bookmarks tests via the "Bookmarks" menu item).
- **Cause:** querying the wrong Compose semantics tree. Many labels exist only in the UNMERGED tree;
  `onNodeWithText(value)` defaults to merged and returns nothing. Both regressions were this.
- **Check:** when touching the resolution layer, PRESERVE each strategy's proven primary tree exactly
  (text = unmerged; tag/content-desc = merged) and add the other tree only as fallback. `resolve()` now
  tries both and picks the _displayed_ match — keep that behavior.

### A4. Any shared-resolution change touches all ~185 tests

- **Symptom:** a small tweak in `core/` — `Resolvers`, `Verbs`, `UiActions` — breaks a large, uniform
  swath of tests.
- **Cause:** every verb funnels through shared resolution.
- **Check:** full efficiency-suite run before trusting ANY shared-resolution change. Reading the shape of
  the failure tells you the class: a systematic selector break fails hundreds _uniformly_; flakiness is
  _scattered_ across unrelated pages. Don't re-tune shared resolution on an unconfirmed hypothesis.

### A5. `BaseTest` does not retry (bug 2065120)

- **What changed:** `BaseTest` used to re-run a failed test once, retrying on nearly any throwable. That
  could turn an intermittent real failure green. The retry was removed.
- **Why nothing replaces it:** every test already runs in its own process with package data cleared
  (`ANDROIDX_TEST_ORCHESTRATOR` + `clearPackageData`, `app/build.gradle`), and Firebase re-runs a failing
  test once (`num-flaky-test-attempts` in the TAE flank configs) in a fresh process, reporting it as flaky
  rather than green. An in-process retry was the one thing that escaped that isolation — the second attempt
  inherited whatever the first left behind.
- **Check:** a local failure is now just a failure. Re-run the class yourself to judge flakiness; do not
  expect the harness to absorb it. The legacy suite's shared `RetryTestRule(3)` still retries and still has
  the masking problem.

### A6. Page-arrival timeouts are the most common failure shape

- **Symptom:** `navigateToPage` → `mozWaitForPageToLoad` can't find a page's `requiredForPage` anchor
  within 10s.
- **Cause:** usually timing/flakiness (slow arrival), sometimes a wrong/absent anchor selector,
  sometimes the screen genuinely isn't there (wrong launch/state — see A8).
- **Check:** `ScreenDump` now fires on `navigateToPage` failure. Use it to separate "selector wrong
  (element is in the dump)" from "screen wrong (element absent / wrong page)". Capture with
  `adb logcat -c` then `adb logcat -d -s EffScreenDump:I`.

### A7. Duplicate/pager node matches ("expected 1, found N")

- **Symptom:** a click/verify by text throws because several composed nodes share the label.
- **Cause:** a `HorizontalPager` (e.g. onboarding cards) composes adjacent pages at once, so shared button
  text ("Not now"/"Continue") matches multiple nodes.
- **Check:** for text shared across simultaneously-composed nodes, use a per-instance `testTag`, or rely
  on `Resolvers.displayed()`'s pick of the on-screen match. Prefer stable handles over shared text.

### A8. An overridable config hook whose resolved value isn't actually used

- **Symptom:** you add a per-case/per-run config override (e.g. `BaseTest.launchConfig()`) and it looks
  wired, but behavior never changes — the run uses the default.
- **Cause:** the construction site computed the resolved config (`val cfg = launchConfig()`) but still
  passed the original fixed fields to the thing being configured —
  `HomeActivityIntentTestRule(skipOnboarding = skipOnboarding, …)` instead of `cfg.skipOnboarding`. The
  override is dead code.
- **Check:** when you introduce an overridable hook, grep the construction site and confirm _every_
  argument reads from the resolved value, not the old field. (Hit 2026-07-22 wiring the reachability
  `LaunchConfig`; onboarding kept launching with `skipOnboarding=true` until the args were switched to
  `cfg.*`.)

---

## B. Authoring & review checks for new code

### B1. A new page object can NEVER have an empty navigation path ← onboarding bug, 2026-07-22

- **Why:** the Reachability factory **auto-registers every page object** (it discovers them by reflection
  over `PageContext` via `PageCatalog`) and generates a "can I reach this page?" case for each. A page
  with no reachable path — empty/absent `NavigationRegistry` steps AND no handling for a special launch —
  produces a reachability case that always fails.
- **What happened:** `OnboardingPage` registered `AppEntry → OnboardingPage` with `steps = listOf()`. The
  reachability run launches with the harness default (`skipOnboarding = true`), so onboarding never shows,
  so the `requiredForPage` anchor (ToU card title) is never found → the generated case fails.
- **Check for every new page object:**
  - It registers at least one `NavigationRegistry` edge with real steps that reach it from `AppEntry`
    (directly or transitively), **or**
  - if it only exists under a special app launch (e.g. onboarding), it declares a `LaunchConfig` on its
    `AppEntry` edge. The Reachability factory now threads that config per case and launches the activity
    with it, so the page is genuinely reached — not skipped. See
    `onboarding-branch-staging/onboarding-reachability-fix.md`.
  - Never leave `steps = listOf()` on the only edge into a page without one of the above.
  - Note: Pairs can't vary launch per case, so special-launch pages are excluded from Pairs only.

### B2. Selectors live in the catalog, not in page objects

- **Why:** a `Selector(...)` defined inline in a `pageObjects/*.kt` escapes the `selectors/*Selectors.kt`
  catalog and the migration ledger, and won't be found by tooling that scans the catalog.
- **Check:** `grep -rn "SelectorStrategy\." pageObjects/` returns nothing. Selectors that need a runtime
  value become a parameterized catalog function `fun NAME(x): Selector` (see B4). (Fixed 2 instances as
  PW-2, MTE-5722.)

### B3. A selector `value` must not be blank

- **Why:** resolution returns `null` for a blank value. Parameterized selectors with a default `""` used
  for group registration can silently resolve to nothing when accidentally called without an argument.
- **Check:** don't conflate group registration with matching via a blank-valued call; a selector used to
  match must always receive a real value.

### B4. Parameterized selector functions stay pure (no presentation logic)

- **Why:** a `fun NAME(s: String) = Selector(value = s, …)` is the idiomatic Kotlin "template" and is
  fine. The smell is functions that rebuild the app's rendered text (plurals, `HtmlCompat`, hardcoded
  English like `"$count selected"`) — that couples the catalog to i18n/formatting and is fragile.
- **Check:** a parameterized selector fun should be a single `Selector(...)` expression whose `value` is
  the parameter. If it computes a resource/plural/HTML string, prefer a stable handle (tag/res-id) instead,
  or move the string derivation to a labels layer. Track such funcs to tech-debt, not the migration.

### B5. Selector authoring priority (stable handles over text)

- **Why:** text matches break on localization and duplicate nodes (A7).
- **Check (in order):** Compose `testTag` → resource id → content-description → text (only as last resort,
  always via `getStringResource(...)`). Derive the handle from the app UI source, not from how a legacy
  robot happened to match.

### B6. A new verb is one expression over a `core/` primitive

- **Check:** the verb is a single expression over `require` / `requireAbsent` / `requireAll` /
  `driveUntil` / `requireState` / `reportAround` / `groupPresent`. If it needs a block, the primitive
  you want is missing — add the primitive.
- **Check:** no `when (element)` over the backend types and no fresh `when (strategy)` block.
  `UiActions`, `Gestures`, `ElementState` and `Relations` each hold one copy; a behaviour added inside
  a verb is silently missing from every other verb.
- **Check:** per-strategy tree semantics preserved (A3), a presence check still never throws (A2),
  and validated with a full-suite run (A4).

### B7. Nav entry/arrival selectors must cover EVERY runtime state (2026-07-23, bit us twice)

- **Why:** a screen's arrival signal or entry control can change with app state. (1) RecentlyClosed's
  `requiredForPage` was the empty-state view — absent once the list is populated, so populated tests
  couldn't confirm arrival. (2) The UnifiedTrustPanel entry button's testTag depends on the page's
  security and tracking protection state: `SITE_INFO_SECURE` vs `SITE_INFO_INSECURE_CONNECTION` vs
  `SITE_INFO_TRACKING_PROTECTION_OFF` vs `SITE_INFO_UNKNOWN` — the secure-only edge never opened
  the panel on an http page.
- **Check:** `requiredForPage` must be an element present in ALL states (e.g. a toolbar title, never an
  empty-list placeholder). A nav edge whose entry control is state-dependent must `ClickIfPresent` every
  variant. effcheck can't see this — verify by hand whenever you build/modify nav.

### B8. Test-class boilerplate (now enforced by effcheck MWS/IMP)

- A test class using `mockWebServer` must declare `private val mockWebServer get() = fenixTestRule.mockWebServer`
  — `BaseTest` does not expose it. (effcheck: MWS)
- `TestAssetHelper` members (`getGenericAsset`, `enhancedTrackingProtectionAsset`, …) must be imported even
  when called on a receiver (`mockWebServer.getGenericAsset(...)`). (effcheck: IMP)
- `navigateToPage()` returns `BasePage`: chain only `moz*`/BasePage methods off it. Call a page-specific
  method on the page object on its own line — UNLESS that page overrides `navigateToPage` with a covariant
  return type (e.g. BrowserPage), in which case chaining its own methods is fine. (compile error otherwise)
