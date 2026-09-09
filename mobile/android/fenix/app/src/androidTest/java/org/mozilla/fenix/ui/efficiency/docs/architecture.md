# Architecture & design

How the framework is built and _why_. Read this once to get the mental model; the `guides/` cover the
mechanics of each piece.

## The thesis

Almost every UI test is one of **three shapes**:

1. `navigate → verify` ("does this screen/element show up")
2. `navigate → interact → verify` ("does this control do the thing")
3. `navigate → interact → navigate → verify` ("does this flow land me somewhere")

If the navigation, interaction, and verification are all built from a shared, well-maintained layer, then
(a) writing the Nth test is cheap, and (b) a UI change is fixed in one place. That's the whole idea: bend
the maintenance-cost curve through reuse, and make failures attributable so red is trustworthy.

## The layers (bottom to top)

- **`core/`** — everything a verb is made of, in ten small files.
  - *Selector to element:* `Locator` describes what a `SelectorStrategy` asks for as data and
    `STRATEGY_LOCATORS` maps every strategy to one; `Resolvers` interprets that, one resolver per
    toolkit, plus `displayed()` which picks the _on-screen_ match by trying **both** Compose semantics
    trees (this is why "merged-vs-unmerged" bugs don't recur). Absence is always `null`, never a throw,
    so a presence check cannot crash a run. `UiElement` is the facade.
  - *The verbs themselves:* `Verbs` holds the seven shapes every verb has — `require`, `requireAbsent`,
    `requireAll`, `driveUntil`, `requireState`, `reportAround`, `groupPresent` — each owning the
    reporting, the polling, the one overlay-dismiss retry, the failure dump and the message. `Wait`
    declares patience (`Immediate` vs `Poll`, which backs off).
  - *Per-backend behaviour, one copy each:* `UiActions` (click, long click, text, clear, IME action),
    `Gestures` (swipes), `ElementState` (enabled/selected/checked/displayed), `Relations` (siblings).
  - **A core change reaches every test** — powerful (one fix helps all) and dangerous (one bad change
    breaks all); always full-suite it.
- **`helpers/`** — `BaseTest` (test rule, failure handling) and `BasePage`, which is three things:
  `navigateToPage` (BFS-routes to a target page over the graph), the handful of methods `core/` needs
  from a page, and the 39 `moz*` verbs, each one expression over a `core/` primitive. `ScreenDump`
  captures the on-screen hierarchy for debugging.
- **`navigation/`** — the 4-file graph core: `NavigationEdge` / `NavigationRegistry` / `NavigationStep`
  (the model) and `PageCatalog` (discovers page objects by reflection). Page objects register edges into
  this graph; `navigateToPage` finds a path.
- **`generation/`** — case-building infrastructure and the factories (see below).
- **`devtools/`** — developer/debug tooling and atomic test runners; `effpretty` (the log renderer) lives here.
- **`logging/`** — structured test logging on the dedicated `Eff` logcat tag.

## The objects you'll touch

- **Selector** (`selectors/<Screen>Selectors.kt`) — a strategy + value describing how to find an element
  (`COMPOSE_BY_TAG`, `ESPRESSO_BY_ID`, `UIAUTOMATOR_*`, `*_BY_TEXT`, …). Selectors live **only** in the
  catalog, never inline in a page object, and are grouped (e.g. `requiredForPage`).
- **Page object** (`pageObjects/<Screen>Page.kt`) — models one screen: its selector groups, a
  `requiredForPage` arrival anchor, page-specific helper methods, and one or more `NavigationRegistry`
  edges describing how to reach it (real click steps, or a `LaunchConfig` for launch-only screens like
  onboarding). Never register an edge with empty steps and no launch config.
- **PageContext (`on`)** — the entry point tests use: `on.<screen>.navigateToPage()`.

## The factories (generation/) — status is honest

Factories emit tests from metadata instead of hand-writing them. Only one is production-ready today:

- **Reachability** — ✅ production-ready. Reflects over `PageCatalog` and generates a "does this page open"
  case per page. Prefer it for pure page-open checks; it auto-covers every registered page object.
- **Pairs / Interaction / Behavior** — prototype/hold. Interaction is bookmarks-only; Behavior's context
  matrix is largely unimplemented; Pairs has no clear failure class it uniquely catches. Don't rely on them;
  hand-compose onto `BasePage` (that path is mature). Whether to keep/cut/redesign these is an open decision.

So in practice: **page-open checks → Reachability factory; everything else → hand-composed on `BasePage`.**

## Failure attribution

Structured events emit on the `Eff` tag; render them with `effpretty`. On a navigation failure the harness
fires a `ScreenDump` so you can tell "selector wrong" (element is in the dump) from "screen wrong" (element
absent / wrong state). Note the retry policy is currently broad — a single retry can turn a real red green —
so treat retry-only passes as failures. See `gotchas.md` (section A) for the catalog.
