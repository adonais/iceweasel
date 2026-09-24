# Authoring selectors

A `Selector` is one way to find one element. They live in `selectors/<Screen>Selectors.kt` as an
`object` implementing `SelectorContainer`. The test/harness never hard-codes matchers — it references
these, so a UI change is fixed in one place.

## Anatomy

```kotlin
enum class Group : SelectorGroup {
    CONTINUE_BUTTONS,
}

val CONTINUE_BUTTON = Selector(
    strategy = SelectorStrategy.COMPOSE_BY_TEXT,
    value = getStringResource(R.string.nova_onboarding_continue_button),
    description = "Onboarding Continue button",
    groups = setOf(Group.CONTINUE_BUTTONS),
    readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
)
```

- **strategy** — how to match. Pick the one matching how the legacy robot found it.
- **value** — the matcher input. Prefer stable inputs: `getStringResource(R.string.x)` for localized
  text, test tags, or resource ids — not hard-coded English (breaks under localization).
- **description** — human-readable; shows up in logs.
- **groups** — typed, page-local assertion cohorts (below).
- **readiness** — which page-readiness profiles require this selector.
- **scrollDirection** — a typed scroll precondition, when the element is normally off-screen.
- **lifecycle** — typed version metadata for selectors removed from the product.
- **id / appearsAfter** — stable typed identities and result relationships used by generated interaction cases.

Every selector declared as a `val` is discovered automatically and exposed through the container's inherited
`all` property. Parameterized selector factory functions are intentionally excluded because they do not name a
concrete element until called. The page object exposes the container as `selectorCatalog`; readiness and typed
group verification use its discovered selectors.

When two or more selectors in one group require scrolling, declare their on-screen traversal order once in
`scrollTraversalOrder`. Non-scrolling group members are checked first. The container validates that the order
contains every scrolling member, so a new scrolling selector cannot silently make group verification unstable.

## Choosing a strategy — priority order (important)

Derive the selector from the **app UI source** (`app/src/main/...`), NOT from how the legacy robot
matched. Legacy robots lean on visible text because it was convenient to write; the efficiency
framework prefers stable, language-independent identifiers so a copy tweak or a localized build
doesn't break the test. Open the composable/view for the element and use the FIRST handle that
exists, in this order:

1. **Compose test tag → `COMPOSE_BY_TAG`.** Look for `Modifier.testTag("x")` or
   `.semantics { testTag = "x" }` on (or wrapping) the element. Most stable Compose handle.
   `value = "<the tag>"` (e.g. `"homepage.view"`, `"top_sites_list"`).
2. **Resource id → `ESPRESSO_BY_ID` (View) or `UIAUTOMATOR_WITH_RES_ID`.** Look for `android:id=` in
   XML or a `resourceId`. `value = "<id name>"` (no `R.id.` prefix).
3. **Content description → `COMPOSE_BY_CONTENT_DESCRIPTION` / `ESPRESSO_BY_CONTENT_DESC`.** Use when
   the element sets a stable `contentDescription` (common on icon buttons). Prefer a string resource
   over a literal.
4. **Text — LAST resort → `COMPOSE_BY_TEXT` / `ESPRESSO_BY_TEXT` / `UIAUTOMATOR_WITH_TEXT`.** Only
   when the element exposes no tag/id/content-desc. Always `value = getStringResource(R.string.x)` so
   it survives localization — never hard-code English. Text is the most fragile handle (copy changes,
   duplicate strings, substring collisions).

How to read the source: `Modifier.testTag(x)` / `semantics { testTag = x }` → tag (strategy 1);
`Text(stringResource(id))` with no tag on that node → you're stuck with text (strategy 4) for it;
icon/image with a `contentDescription` → content-desc (strategy 3). Fenix mixes View / Compose /
GeckoView, so different elements on one screen may need different strategies — decide per element.

### Worked example: onboarding cards (why text is sometimes correct)

The onboarding card _titles_ are `Text(stringResource(title))` with **no** `testTag` or id on the
title node — so `COMPOSE_BY_TEXT` on the string resource is the right (and only) stable handle for
"is card X shown". The card _buttons_ do expose a tag, but it's title-prefixed and awkward
(`testTag = <localized title> + "onboarding_card.positive_button"`), so matching their text resource
(`nova_onboarding_continue_button`) is simpler and equally stable. Lesson: **prefer tags/ids, but
confirm what the composable actually exposes** — don't assume a tag exists, and don't reflexively
copy the legacy robot's text matcher when a tag _does_ exist.

## Readiness and groups (important)

Readiness is separate from assertion grouping:

- **`IDENTIFIED`** is the minimum stable evidence that distinguishes this page. The first anchor normally
  uses `PageReadinessProfiles.IDENTITY_ANCHOR`, which includes all three profiles.
- **`NAVIGATION_READY`** is checked before navigation may leave a visited page. Additional elements that
  must settle after the identity anchor use `PageReadinessProfiles.READY_CONTENT`.
- **`INTERACTIVE`** is checked for the destination and explicit waypoints. It normally includes the same
  selectors as navigation readiness and may be strengthened independently.
- **Domain groups** are nested enums in the selector catalog. A test verifies one with
  `mozVerifyElementsByGroup(SettingsSelectors.Group.GENERAL_SETTINGS_SECTION)`.

Do not encode behavior or metadata in a group name. Use `scrollDirection`, `lifecycle`, `id`, and
`appearsAfter` for those concepts. For state-dependent readiness, add a named `PageReadinessRule` to the
page object with an `appliesWhen` predicate and an `AllOf` or `AnyOf` condition.

## Gotchas

- Declare concrete catalog entries as `val`s. Use functions only for selectors whose values require runtime input.
- Identity evidence must exist in every runtime state. Put state-specific evidence behind a readiness rule
  instead of making it unconditional.
- Reuse a shared selector (like a common Continue button) rather than duplicating it per card/screen.
