# Adding navigation nodes and routes

The navigation graph lets a test say `on.settings.navigateToPage()` without encoding the route in the
test. Nodes are modeled pages or external surfaces; routes contain the user actions, state constraints,
effects, and arrival contract between them. `navigateToPage()` selects a state-aware path, verifies the
starting page, executes one route, verifies the page it reached, and only then advances modeled state.

## Register an outgoing route

A page contributes routes from itself through `registerNavigation`:

```kotlin
internal override fun registerNavigation(builder: NavigationGraph.Builder) {
    builder.register(
        from = pageName,
        to = "SettingsPage",
        steps = listOf(
            NavigationStep.Click(MainMenuSelectors.SETTINGS_BUTTON),
        ),
    )
}
```

When the source is a page, it owns the route because it owns the UI actions available in that state. If a
page can leave for several destinations, register each outgoing route in the same override. Reverse
navigation is a separate directed route owned by the reverse source page. Because synthetic `AppEntry`
has no page object, its launch route is declared by the page reached at entry.

`PageContext` calls every navigable page's override while building one graph for the test. Do not mutate a
singleton registry or register routes in an initializer.

## NavigationStep types

The step types include `Click`, `LongClick`, `ClickIfPresent`, `Swipe`, `EnterText`, `EnterTextValue`,
`PressEnter`, `PressBack`, `PressBackUntilGone`, `OpenNotificationsTray`, `LaunchCustomTab`, and
`WaitForIdle`. Compose the smallest sequence that represents the user's observable route. If a needed
operation is missing, treat that as a shared harness gap rather than embedding raw framework calls in the
route.

## State constraints and path requests

Use typed route fields for behavior that depends on modeled state:

- `requires` and `forbids` determine whether the route is eligible;
- `provides` and `invalidates` update facts after the route succeeds;
- `effects` apply supported typed setup effects;
- `purpose = COVERAGE` marks a route that should not be preferred for ordinary setup;
- `traits` let a request avoid a category of route without prohibiting it.

At the call site, `NavigationOptions` can require ordered waypoints, facts, or route IDs; exclude pages or
routes; express soft avoidance preferences; and override a page's readiness profile for that request.
Prefer facts and traits over test-name conditionals.

## Entry and zero-step routes

`AppEntry` is the synthetic launch root. A launch-time surface can declare an empty route only when its
arrival is independently observable:

```kotlin
builder.register(
    from = "AppEntry",
    to = pageName,
    steps = emptyList(),
    arrival = NavigationArrival.LAUNCH_REACHED,
    launch = LaunchConfig(skipOnboarding = false),
)
```

Use `EDGE_COMPLETION` for a non-action transition whose typed effect establishes the target. A zero-step
route with the default `ACTION` arrival is rejected because it would claim movement without an action or
an independent arrival mechanism.

## Readiness along the path

Every visited page is a checkpoint. Intermediate pages use `NAVIGATION_READY`; the destination and
explicit waypoints use `INTERACTIVE`. `IDENTIFIED` is the immediate probe used to decide whether the
target is already on screen.

State- and route-dependent UI belongs in the page's readiness contract. Conditional rules include their
selectors only when their predicate matches the planned `NavigationState`, incoming or outgoing route,
checkpoint role, or runtime app configuration. This is how Settings can wait for a debug-only row before
a direct click without requiring it in builds where the row is absent.

All selector probes are live. Readiness does not cache a hierarchy snapshot or element coordinates, and
the following action resolves its target again.

## Verify the model and the route

- Graph construction fails on unknown endpoints, missing page verifiers, duplicate routes,
  contradictory facts, and invalid zero-step declarations.
- Run the navigation contract tests for structural changes.
- Run the affected page's reachability case to prove the test model still matches the live app.
- Use `-PlogNavigationSummary` or the reachability tooling to inspect computed paths.
- Read the logged selected route and readiness failure before changing selectors; a missing path, wrong
  path, and failed arrival are different defects.

## Review checks

- A page source owns each outgoing route; a target page declares its synthetic entry route.
- Directed return routes are declared when tests need them.
- Steps mirror the observable user sequence and use shared selectors.
- Guards and effects describe state rather than relying on test order.
- Every supported target state has an honest identity/readiness contract.
- Empty routes declare a valid non-action arrival and, when necessary, a matching launch configuration.
