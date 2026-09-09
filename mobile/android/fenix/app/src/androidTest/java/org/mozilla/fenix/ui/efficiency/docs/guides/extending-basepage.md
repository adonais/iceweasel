# Extending BasePage (primitives) — the exception path

Reach for this only when the interaction/assertion gate fails: a test needs something the existing
verbs can't express. Extending is rare on purpose — most tests compose what's already here. When you
do extend, add the smallest _general_ capability, because every test inherits it.

## First, check what already exists (don't reinvent)

All 39, generated from `BasePage.kt` — grep it if this list looks stale.

**Touch it:** `mozClick`, `mozClickIfPresent`, `mozClickWhenEnabled`, `mozLongClick`,
`mozClickFirstWithParentText`, `mozSetSliderValue`.

**Type into it:** `mozEnterText`, `mozClear`, `mozClearAndEnterText`, `mozPressEnter`.

**Move the screen:** `mozSwipeTo` (scroll until visible), `mozSwipeElement` (directional),
`mozSwipeElementUntilAbsent`, `mozPressBack`, `mozPressBackUntilGone`, `mozPressBackUntilPresent`.

**Is it there:** `mozVerify`, `mozIsElementPresent`, `mozVerifyElementAbsent`, `mozWaitUntilAbsent`,
`mozVerifyElementStaysAbsent`.

**What state is it in:** `mozVerifyElementIs{Selected,NotSelected,Enabled,NotEnabled,Checked,NotChecked}`,
`mozVerifyElementHasSiblingWithText`, `mozVerifyElementHasCheckedSiblingByResName`.

**All the matches at once:** `mozVerifyElementCount`, `mozVerifyAnyContainsText`,
`mozVerifyAnyHasChildWithText`, `mozVerifyNoneContainText`.

**The device around the app:** `mozIsKeyboardVisible`, `mozVerifyKeyboardVisible`,
`mozOpenNotificationsTray`, `mozVerifyNativeAppOpens`, `mozVerifyFileOpensInExternalApp`.

**Pages:** `navigateToPage`, `mozVerifyElementsByGroup`.

If one of these fits, compose — stop here.

## Decide: primitive vs page-object helper

- **Add a `moz*` primitive** when the capability is generic across screens (a new interaction gesture
  or a new kind of assertion). It goes on `BasePage` as a one-line expression over a primitive from
  `core/`; the backend dispatch is not yours to write (see below).
- **Add a typed helper on the page object** when the logic is specific to one screen (e.g.
  `BookmarksPage.createFolder(name)` wrapping a few steps). This keeps `BasePage` general and the
  screen-specific flow discoverable.

## How to add a primitive

**A verb should be one expression.** Everything a verb used to do by hand — announce itself, resolve
the selector, poll, retry once past a blocking overlay, dump the screen, throw naming the selector —
lives in `core/Verbs.kt`. Pick the shape that matches the question you are asking:

| shape | the question |
|---|---|
| `require` | one element must satisfy something; then act on it |
| `requireAbsent` | it must not be there — now, or for a whole window |
| `requireAll` | something must hold across every match for a selector |
| `driveUntil` | repeat an action until the screen changes the way you want |
| `requireState` | poll a condition that has no selector behind it |
| `reportAround` | wrap a call that already throws for itself |
| `groupPresent` | are all of a group's selectors on screen? answered, not thrown |

Each returns its receiver, so the verb chains without a `return this`:

```kotlin
fun mozVerifyElementAbsent(selector: Selector) = requireAbsent("verify_absent", selector)
```

**Do not write a `when (element)` over the backend types.** `core/UiActions.kt` dispatches click,
long click, text entry, clearing and the IME action across Espresso / UiAutomator / UiAutomator2 /
Compose; `core/Gestures.kt` does swipes; `core/ElementState.kt` answers enabled/selected/checked/
displayed; `core/Relations.kt` answers questions about siblings. If your verb needs a backend
behaviour none of them has, add it *there* — one copy, for every verb — rather than in the verb.

**Patience is a parameter, not a loop.** Pass `WaitPolicy.Immediate` or
`WaitPolicy.Poll(timeout, interval)`. Poll backs off from 25ms up to the interval; pass
`backoff = false` only when probing faster would change the answer rather than just find it sooner
(a list still filling passes through the expected count on its way to a larger one).

If the verb cannot be an expression, the primitive you need is missing. Add the primitive.

## Harness gaps worth naming (not yet abstracted)

These are currently hand-wired in tests rather than harness verbs — if a conversion needs one, that's
a candidate for a real primitive/helper, and worth flagging:

- Permissions (`GrantPermissionRule`), account sign-in, and app-restart flows.
- A launcher-intent launch (some flows only appear via a launcher intent; the efficiency
  `HomeActivityIntentTestRule` path may need this option — verify against onboarding).
- Scroll as a first-class step (today it's a `requiresScroll` selector-group side effect).
- `mozClick` resolves through `Resolvers.displayed()` while every other verb resolves through
  `mozGetElement`, so an element can be clickable but unverifiable. Both paths now live in
  `core/Resolvers.kt`; closing the gap is tracked on MTE-5737.

## Gotchas

- Resist test-specific primitives — if only one test would ever call it, it's probably a page-object
  helper or just inline steps, not a `BasePage` verb.
- A backend behaviour added inside a verb instead of in `core/` will silently be missing from every
  other verb. That duplication is what the `core/` split removed; don't reintroduce it one verb at a
  time.
- Reporting is a consumed interface. effpretty renders the CMD/LOC stream and effverify grades it, so
  a verb that skips reporting, or reports in a new shape, breaks tooling outside this tree.
