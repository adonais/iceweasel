# ui/efficiency — Android UI test harness

The efficiency harness is Fenix's executable model of the app under test. It centralizes selectors,
page identity, readiness, navigation, execution state, and evidence so tests and factories can express
product intent without reimplementing the mechanics that make the result trustworthy.

"Efficiency" therefore means more than short test methods or fast helpers. The long-term goal is to
lower the marginal cost of maintaining coverage, expose an analyzable testing space, and make it
possible to select useful release evidence under a time and risk budget.

## Choose a reading path

| If you want to understand… | Start with… |
| --- | --- |
| Why this work exists and how it supports release testing | [`purpose-and-strategy.md`](purpose-and-strategy.md) |
| The model-based-testing and oracle design | [`model-and-oracles.md`](model-and-oracles.md) |
| The current implementation and its boundaries | [`architecture.md`](architecture.md) |
| Test setup, cleanup, and optional resources | [`test-execution-contracts.md`](test-execution-contracts.md) |
| How to convert or author a test | [`converting-a-test.md`](converting-a-test.md) |
| Known failure modes and review checks | [`gotchas.md`](gotchas.md) |
| Developer tools | [`tooling.md`](tooling.md) |

The documents above move from programme intent to implementation. The guides below are the daily
authoring reference and should describe only behavior that exists in the tree.

## Directory map

```text
efficiency/
├── core/         selector resolution, UI actions, waits, and failure primitives
├── helpers/      BaseTest, BasePage, PageContext, readiness, and state boundaries
├── navigation/   the state-aware graph, routes, facts, effects, and launch contracts
├── generation/   case-building infrastructure and test factories
├── devtools/     developer tools, contract tests, and atomic test runners
├── logging/      structured execution evidence and its schema
├── pageObjects/  one modeled page or component per file
├── selectors/    the shared element-locator catalog
├── tests/        authored behavior tests
└── docs/         strategy, architecture, contracts, and authoring guides
```

## Quickstart — a minimal test

```kotlin
class BookmarksTest : BaseTest() {
    @SmokeTest
    @Test
    fun openBookmarksTest() {
        on.bookmarks
            .navigateToPage()
            .mozVerify(BookmarksSelectors.TOOLBAR_TITLE)
    }
}
```

`on` is the per-test `PageContext`. `navigateToPage()` selects an executable path through the
state-aware graph and verifies every visited page before the model advances. Selectors come from the
screen's catalog and element checks resolve against the live UI; they are not cached snapshots.

The harness does not retry a failed test in-process. A retry-only pass is flaky evidence, not a harness
success. See [`test-execution-contracts.md`](test-execution-contracts.md) for the exact setup and
cleanup boundary.

## Authoring guides

| To… | Read… |
| --- | --- |
| Find an element's real handles | [`guides/discovering-selectors.md`](guides/discovering-selectors.md) |
| Add locators and readiness metadata | [`guides/authoring-selectors.md`](guides/authoring-selectors.md) |
| Model a page or component | [`guides/creating-a-page-object.md`](guides/creating-a-page-object.md) |
| Add graph routes and state constraints | [`guides/adding-navigation.md`](guides/adding-navigation.md) |
| Compose a test | [`guides/writing-a-test.md`](guides/writing-a-test.md) |
| Extend the shared verb layer | [`guides/extending-basepage.md`](guides/extending-basepage.md) |
| Run and debug a test | [`guides/debugging-tests.md`](guides/debugging-tests.md) |

## Core authoring rules

- Keep product intent in tests and shared mechanics in the harness.
- Treat a page, app state, route, selector, and oracle as different concepts.
- Prefer stable semantic handles over rendered text.
- Make setup and state requirements explicit; do not depend on test order.
- Require an observable result. An action or element-presence check alone may not prove the behavior.
- Preserve independent test evidence instead of deriving the model from the app's own router.
- Treat generated cases as candidates until their setup, action, oracle, and supported context are known.

---

_Maintenance note:_ these in-tree docs are the reviewed source of truth for implemented harness
behavior. Strategy documents should distinguish current capability from planned work, and authoring
guides must not promise APIs that do not exist.
