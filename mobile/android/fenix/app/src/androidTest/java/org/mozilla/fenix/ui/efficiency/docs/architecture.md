# Architecture and design

This document describes the harness that exists in the tree. Read
[`purpose-and-strategy.md`](purpose-and-strategy.md) for the release-testing goal and
[`model-and-oracles.md`](model-and-oracles.md) for the model and oracle rationale.

## Design in one sentence

The harness turns independently maintained page, selector, state, transition, execution, and oracle
contracts into short authored tests and enumerable factory cases, then records enough evidence to tell
what ran and why it passed or failed.

## Layers

- **`core/` — UI runtime.** `Selector` strategies are data. The locator table and toolkit-specific
  resolvers interpret them, `UiElement` hides Espresso, Compose, and UIAutomator differences, and the
  action/state/relation primitives implement the small set of operations used by every verb. Presence
  probes return absence instead of throwing. A change here reaches nearly every test.
- **`helpers/` — execution facade and contracts.** `BasePage` exposes navigation and the `moz*` verbs.
  `PageReadinessContract` turns selector metadata and conditional rules into page oracles. `PageContext`
  owns the page catalog and graph for one test. `BaseTest` composes JUnit rules, activity launch,
  execution requirements, cleanup, state probes, and failure capture.
- **`navigation/` — state-aware test model.** Nodes, routes, steps, facts, effects, arrival modes,
  launch configuration, and request options form the executable navigation model. The planner selects a
  deterministic eligible path; execution verifies a checkpoint after every edge.
- **`selectors/` and `pageObjects/` — app-specific model declarations.** Selector containers describe
  observable handles and typed cohorts. Pages define identity/readiness contracts, outgoing routes, and
  small page-specific operations.
- **`generation/` — model consumers.** Factories derive cases from the catalog and graph rather than
  duplicating navigation and discovery logic.
- **`logging/` and `devtools/` — evidence and validation.** Structured attempt, step, command, locator,
  state, and artifact records support rendering, completion checks, and failure attribution. Contract
  tests reject structural drift without launching Fenix.

## Per-test composition and ownership

`BaseTest` creates a `PageContext` for the running test. `PageContext` is the composition root:

1. `PageCatalog` reflects over its page properties and selects navigable pages.
2. Each page's declared readiness profiles are validated.
3. A new `NavigationGraph.Builder` is created with the declared nodes.
4. Each page contributes its outgoing routes through `registerNavigation(builder)`.
5. Each page's checkpoint verifier is registered.
6. The builder validates and freezes the graph, which is then bound to those page instances.

The graph is not a process-global registry. A test cannot inherit routes registered by another test,
and graph construction has a single point at which to reject unknown nodes, missing verifiers,
contradictory facts, invalid zero-step routes, duplicate route IDs, and ambiguous parallel edges.

When the source is a page, that source page owns the route. This keeps a page's available user actions
beside the state in which they are valid. Entry routes are declared by the page reached from synthetic
`AppEntry`; external destinations such as Google Play are declared explicitly.

## Navigation planning and execution

`NavigationOptions` separates hard constraints from soft preferences:

- `via`, `requiredRoutes`, and `requiredFacts` constrain the successful destination;
- `excludedPages` and `excludedRoutes` prohibit paths;
- `avoidPages` and `avoidTraits` influence ranking without making a route impossible;
- `readinessProfiles` overrides a page checkpoint for one request.

Routes can also declare fact guards and effects. The planner explores `NavigationState`, not page names
alone, and ranks valid candidates deterministically. It prefers setup routes over coverage routes, honors
avoidance preferences, and then considers edge count, action count, and stable route IDs. It is not a
plain breadth-first search.

Execution is deliberately incremental:

1. Probe the target's `IDENTIFIED` contract to avoid unnecessary navigation when it is already present.
2. Select a path from the tracked page and facts.
3. Verify the starting checkpoint when navigation begins from a modeled page.
4. Execute one route and resolve each action against the live UI.
5. Verify the arrived page with `NAVIGATION_READY` for an intermediate node or `INTERACTIVE` for a
   destination or explicit waypoint.
6. Advance `PageStateTracker` only after the checkpoint succeeds, then continue.

An action route proves arrival through the target checkpoint. A zero-step route must instead declare an
explicit `LAUNCH_REACHED` or `EDGE_COMPLETION` arrival mode; an empty action route is rejected.

## Selectors, identity, and readiness

A `Selector` contains a strategy, values, description, typed groups, readiness membership, and optional
scroll/lifecycle metadata. `SelectorContainer` discovers concrete selector properties by reflection, so
authors do not maintain a second `all` list. It rejects duplicate selector instances and validates the
explicit traversal order required when a group contains several scrolling selectors.

Readiness has three profiles:

- `IDENTIFIED` fingerprints the page for a quick recognition probe;
- `NAVIGATION_READY` establishes that an intermediate page can support its outgoing route;
- `INTERACTIVE` establishes that a destination or waypoint is ready for the test.

`IDENTITY_ANCHOR` assigns a selector to every profile; `READY_CONTENT` assigns it to the two profiles
after identification. A page can extend the generated contract with named `AllOf`/`AnyOf` rules and an
`appliesWhen` predicate over navigation state, incoming/outgoing route, checkpoint role, or runtime app
configuration.

The evaluator performs fresh selector lookups while polling. It does not cache a UI hierarchy or element
coordinates, and global UI idleness is not treated as proof that page-specific content is stable. The
following action resolves its selector again.

## Execution and state contracts

`EfficiencyExecutionRequirements` declares orientation, device toggles, permissions, external cleanup,
and whether MockWebServer is needed. `EfficiencyTestRule` applies the resolved requirements before
activity launch and pairs setup with teardown and verification. `AppDataCleaner` owns an explicit
allowlist of app data, while runtime, input, and activity cleaners own their respective process-global
boundaries.

This boundary is deliberately explicit rather than "reset everything." Gecko profile data and other
unlisted state are not silently claimed as clean. See
[`test-execution-contracts.md`](test-execution-contracts.md) for rule order, defaults, opt-out behavior,
and the current limitations.

The harness does not retry tests in-process. Firebase may rerun a failed test in a fresh attempt and
report flakiness, but the harness preserves the original failure rather than turning an inherited-state
retry green.

## Factories and authored tests

The reachability factory discovers every navigable page and checks whether the live app can reach its
interactive contract under the declared launch configuration. Because the readiness checkpoint is the
reachability oracle, a generated reachability case does not need an unrelated page-specific assertion.

Pairs, interaction, and behavior factories are prototypes or limited pilots. Authored tests remain the
right place for domain behavior and critical journeys that do not yet have complete factory metadata.
Generation should not outrun setup and oracle quality: an enumerable case is not automatically valid
coverage.

## Failure attribution

The `Eff` stream is a human-readable timed narrative. `EffJson` is the structured attempt record consumed
by tools. Navigation failures include the path, active route/step, readiness profile, tracked state, and
a screen dump. Setup and cleanup failures are finalized into the same attempt outcome.

Logging is a consumed interface rather than incidental debug text. Its schema is versioned in
`logging/log-format.json`; changes to names or fields require the same care as an API change.

## Architectural boundaries

- The navigation graph models observable test behavior; it must not mirror the production router as its
  source of truth.
- Pages and selectors describe reusable mechanics; test methods own behavior intent and result oracles.
- Readiness proves page identity/usability, not the domain behavior of every test on that page.
- Factories enumerate modeled candidates; future impact/risk planning selects among them.
- Tools may analyze or propose changes, but release-gating decisions must remain deterministic and
  auditable.
