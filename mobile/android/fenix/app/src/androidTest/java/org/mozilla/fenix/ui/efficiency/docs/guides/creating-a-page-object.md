# Creating a page object

A page object models one screen (or a distinct component) so tests can reach it and read its state
without knowing _how_. It extends `BasePage`, names itself, contributes its outgoing routes (or synthetic
entry route), and exposes its selector catalog and readiness contract. Keep product behavior assertions
in tests; a page object should remain a thin reusable model surface.

## Steps

1. **Decide page vs component.** A full screen is a `...Page`; a reusable sub-surface (toolbar,
   share sheet, tab drawer) is a `...Component`. Both extend `BasePage`; the suffix is convention.
2. **Create `pageObjects/<Screen>Page.kt`.**
   - `override val pageName = "<Screen>Page"` — this string is the node id used by the nav graph and
     `PageStateTracker`; keep it stable and matching the class.
   - Override `registerNavigation(builder)` to contribute routes whose source is this page (see
     `adding-navigation.md`).
   - `override val selectorCatalog = <Screen>Selectors` — its automatically discovered selector vals are the
     source for readiness and typed group verification.
3. **Register it in `helpers/PageContext.kt`.** Add the import and a `val <camelName> =
<Screen>Page(composeRule)` in lexicographic order. This matters: `PageCatalog` discovers pages by
   reflecting over `PageContext`, and the reachability factory + `on.<name>` access depend on it.
4. **Add selectors** in a sibling `<Screen>Selectors.kt` (see `authoring-selectors.md`). At minimum,
   declare one stable identity selector with `readiness = PageReadinessProfiles.IDENTITY_ANCHOR`.

## Worked example (from the Onboarding pilot)

A launch-time flow with no inbound nav steps:

```kotlin
class OnboardingPage(composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : BasePage(composeRule) {
    override val pageName = "OnboardingPage"

    internal override fun registerNavigation(builder: NavigationGraph.Builder) {
        builder.register(
            from = "AppEntry",
            to = pageName,
            steps = emptyList(),
            arrival = NavigationArrival.LAUNCH_REACHED,
            launch = LaunchConfig(skipOnboarding = false),
        )
    }

    override val selectorCatalog = OnboardingSelectors
}
```

A normal page's `registerNavigation` override describes the actions available **from** that page. See
`adding-navigation.md` for that form.

## Gotchas

- `pageName` must be unique and stable; it's a graph key, not a label.
- If you forget the `PageContext` registration, the page is invisible to discovery, graph validation,
  generated reachability, and `on.<name>` access — always do step 3.
- `PageContext` rejects a navigable page unless it declares all three readiness profiles.
- Don't put assertions or multi-step flows in the page object; those belong in the test or, if truly
  reusable, a typed helper method on the page object.
