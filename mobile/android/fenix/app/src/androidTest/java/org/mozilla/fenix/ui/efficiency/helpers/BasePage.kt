/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityWindowInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.compose.ui.test.filter
import androidx.compose.ui.test.hasAnyChild
import androidx.compose.ui.test.hasParent
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.longClick as composeLongClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.longClick
import androidx.test.platform.app.InstrumentationRegistry
import org.hamcrest.CoreMatchers.not
import org.mozilla.fenix.helpers.AppAndSystemHelper
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.packageName
import org.mozilla.fenix.ui.efficiency.core.ElementState
import org.mozilla.fenix.ui.efficiency.core.Failure
import org.mozilla.fenix.ui.efficiency.core.Gestures
import org.mozilla.fenix.ui.efficiency.core.Layer
import org.mozilla.fenix.ui.efficiency.core.Relations
import org.mozilla.fenix.ui.efficiency.core.Resolvers
import org.mozilla.fenix.ui.efficiency.core.STRATEGY_LOCATORS
import org.mozilla.fenix.ui.efficiency.core.UiActions
import org.mozilla.fenix.ui.efficiency.core.UiElement
import org.mozilla.fenix.ui.efficiency.core.VerbHost
import org.mozilla.fenix.ui.efficiency.core.WaitPolicy
import org.mozilla.fenix.ui.efficiency.core.driveUntil
import org.mozilla.fenix.ui.efficiency.core.facts
import org.mozilla.fenix.ui.efficiency.core.groupPresent
import org.mozilla.fenix.ui.efficiency.core.reportAround
import org.mozilla.fenix.ui.efficiency.core.require
import org.mozilla.fenix.ui.efficiency.core.requireAbsent
import org.mozilla.fenix.ui.efficiency.core.requireAll
import org.mozilla.fenix.ui.efficiency.core.requireState
import org.mozilla.fenix.ui.efficiency.logging.TestLogging
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRegistry
import org.mozilla.fenix.ui.efficiency.navigation.NavigationStep

/**
 * What every page object is.
 *
 * Three things live here and nothing else should. **Navigation**: how to get to this page from wherever the last test
 * step left off, via [NavigationRegistry]. **Host wiring**: the handful of methods the verb executor in `core/` needs
 * from a page, so that the verbs themselves - reporting, polling, overlay retries, failure dumps - can live outside
 * this file. And the **verb vocabulary**, where each verb is one expression naming a primitive from `core/Verbs.kt`.
 *
 * A verb that is more than an expression is a sign the primitive is missing, not that the verb is special. See
 * docs/guides/extending-basepage.md.
 */
abstract class BasePage(protected val composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>) : VerbHost {

    // --- What the verb executor needs from a page --------------------------------

    override fun reporter() = rep()

    override fun locate(selector: Selector, applyPreconditions: Boolean) = mozGetElement(selector, applyPreconditions)

    // Only a Compose tag can name more than one element; the collection verbs report any other
    // strategy as the reason rather than as "not found".
    override fun locateAll(selector: Selector): SemanticsNodeInteractionCollection? =
        if (selector.value.isBlank()) {
            null
        } else {
            when (selector.strategy) {
                SelectorStrategy.COMPOSE_BY_TAG,
                SelectorStrategy.COMPOSE_ON_ALL_NODES_BY_TAG_ON_FIRST -> composeRule.onAllNodesWithTag(selector.value)
                else -> null
            }
        }

    override fun dismissOverlays() = dismissKnownOverlaysIfPresent()

    // Both layers, because they answer different questions. dump() is the readable trace and the
    // structured dumpNode records triage queries; dumpAll() additionally writes a screenshot and
    // every element's on-screen bounds, which is what renders the failure as a picture with the
    // available selectors mapped onto it. Failure-only, so the cost is not on the passing path.
    override fun dumpFailure(label: String) {
        ScreenDump.dump(composeRule, label)
        runCatching { ScreenDump.dumpAll(composeRule, label) }
            .onFailure { Log.i("Eff", "dumpAll failed, text dump stands: ${it.message}") }
    }

    override fun stepId(prefix: String, description: String) = safeId(prefix, description)

    // --- Page identity -----------------------------------------------------------

    abstract val pageName: String

    abstract fun mozGetSelectorsByGroup(group: String = "requiredForPage"): List<Selector>

    companion object {
        // Mirrors the minimum displayed-area Espresso's click() action requires before it will tap.
        private const val CLICKABLE_VISIBILITY_PERCENT = 90
    }

    // --- Reporting internals -----------------------------------------------------

    private fun rep() = TestLogging.reporter

    private fun safeId(prefix: String, raw: String): String {
        val cleaned = raw.replace(Regex("[^A-Za-z0-9_\\-]"), "_")
        return "'$prefix'_$cleaned".take(120)
    }

    // --- Navigation (STEP) -------------------------------------------------------

    open fun navigateToPage(url: String = "", forceNavigation: Boolean = false): BasePage {
        val step = rep().start(TimedReporter.Type.STEP, "nav_$pageName", "Attempting to Navigate to $pageName")

        try {
            if (!forceNavigation && mozIsOnPageNow()) {
                PageStateTracker.currentPageName = pageName
                step.ok("'$pageName' already loaded", facts("navigate", extra = mapOf("page" to pageName)))
                return this
            }

            val fromPage = PageStateTracker.currentPageName
            Log.i("PageNavigation", "Trying to find path from '$fromPage' to '$pageName'")

            val path = NavigationRegistry.findPath(fromPage, pageName)

            if (path == null) {
                NavigationRegistry.logGraph()
                step.fail(
                    "No navigation path found to '$pageName'",
                    facts =
                        facts(
                            "navigate",
                            failure = Failure.NO_PATH,
                            extra = mapOf("page" to pageName, "from" to fromPage),
                        ),
                )
                assertionFailure("No navigation path found from '$fromPage' to '$pageName'")
            } else {
                Log.i("PageNavigation", "Navigation path found from '$fromPage' to '$pageName':")
                path.forEachIndexed { i, step -> Log.i("PageNavigation", "   Step ${i + 1}: $step") }
            }

            path.forEach { step ->
                when (step) {
                    is NavigationStep.Click -> mozClick(step.selector)
                    is NavigationStep.LongClick -> mozLongClick(step.selector)
                    is NavigationStep.ClickIfPresent -> mozClickIfPresent(step.selector)
                    is NavigationStep.Swipe -> mozSwipeTo(step.selector, step.direction)
                    is NavigationStep.OpenNotificationsTray -> mozOpenNotificationsTray()
                    is NavigationStep.Action -> step.action()
                    is NavigationStep.EnterText -> mozEnterText(url, step.selector)
                    is NavigationStep.EnterTextValue -> mozEnterText(step.text, step.selector)
                    is NavigationStep.PressEnter -> mozPressEnter(step.selector)
                    is NavigationStep.PressBack -> {
                        mDevice.pressBack()
                        mDevice.waitForIdle()
                    }
                    is NavigationStep.WaitForIdle -> composeRule.waitForIdle()
                    is NavigationStep.PressBackUntilGone -> mozPressBackUntilGone(step.selector, step.maxPresses)
                }
            }

            if (!mozWaitForPageToLoad()) {
                step.fail(
                    "'$pageName' did not load",
                    facts = facts("navigate", failure = Failure.NOT_ARRIVED, extra = mapOf("page" to pageName)),
                )
                assertionFailure("Failed to navigate to $pageName")
            }

            PageStateTracker.currentPageName = pageName
            step.ok("Navigation to '$pageName' completed", facts("navigate", extra = mapOf("page" to pageName)))
            return this
        } catch (t: Throwable) {
            step.fail(
                "Navigation to '$pageName' failed: ${t.message ?: "exception"}",
                cause = t,
                facts = facts("navigate", failure = Failure.ACTION_FAILED, extra = mapOf("page" to pageName)),
            )
            // Without this a nav failure says only "did not arrive" - not which page we landed on.
            dumpFailure("navigateToPage failed: $pageName")
            throw t
        }
    }

    /**
     * One pass, no polling: navigateToPage() asks before it has navigated anywhere, so waiting here would spend seconds
     * confirming a page it has not tried to reach. Readiness is [mozWaitForPageToLoad]'s job, afterwards.
     */
    private fun mozIsOnPageNow(): Boolean =
        groupPresent(
            verb = "is_on",
            label = pageName,
            selectors = mozGetSelectorsByGroup("requiredForPage"),
            whenPresent = "'$pageName' already visible",
        )

    private fun mozWaitForPageToLoad(timeout: Long = 10_000, interval: Long = 100): Boolean {
        val selectors = mozGetSelectorsByGroup("requiredForPage")
        if (
            groupPresent(
                verb = "wait",
                label = pageName,
                selectors = selectors,
                policy = WaitPolicy.Poll(timeout, interval),
            )
        ) {
            return true
        }
        if (!dismissKnownOverlaysIfPresent()) return false
        return groupPresent(
            verb = "wait",
            label = pageName,
            selectors = selectors,
            policy = WaitPolicy.Poll(timeout, interval),
        )
    }

    fun mozVerifyElementsByGroup(group: String = "requiredForPage"): BasePage {
        val present =
            groupPresent(
                verb = "verify_group",
                label = "${pageName}_$group",
                selectors = mozGetSelectorsByGroup(group),
                applyPreconditions = true,
            )
        if (!present) {
            // The `all {}` stops at the first miss, so the log alone cannot tell you whether the
            // element is absent, renamed, or merely off-screen.
            dumpFailure("mozVerifyElementsByGroup failed: $pageName group '$group'")
            assertionFailure("Not all elements in group '$group' are present")
        }
        return this
    }

    // --- Resolution: selector -> element -----------------------------------------

    /**
     * Find the element a selector names, or null. Strategies are described as data in [STRATEGY_LOCATORS] and
     * interpreted by [Resolvers], one per UI toolkit, so adding one is a table row rather than a branch.
     */
    private fun mozGetElement(selector: Selector, applyPreconditions: Boolean = true): Any? {
        if (selector.value.isBlank()) {
            Log.i("mozGetElement", "Empty or blank selector value: ${selector.description}")
            return null
        }
        if (applyPreconditions && requiresScroll(selector.groups)) {
            ensureReachable(selector) // may call mozSwipeTo with applyPreconditions = false
        }
        val locator = STRATEGY_LOCATORS[selector.strategy]
        if (locator == null) {
            Log.i("mozGetElement", "No locator for strategy ${selector.strategy}")
            return null
        }
        return when (locator.layer) {
            Layer.COMPOSE -> Resolvers.compose(composeRule, locator, selector)
            Layer.ESPRESSO -> Resolvers.espresso(locator, selector) { selector.toResourceId() }
            Layer.UIAUTOMATOR -> Resolvers.uiAutomator(mDevice, packageName, locator, selector)
            Layer.UIAUTOMATOR2 -> Resolvers.uiAutomator2(mDevice, packageName, locator, selector)
        }.also { if (it == null) Log.i("mozGetElement", "not found: ${selector.description}") }
    }

    /**
     * The click path's resolver: prefer the on-screen match, else the first, as a backend-agnostic [UiElement]. Every
     * other verb resolves through [mozGetElement] instead, so an element can be clickable and unverifiable - MTE-5737.
     */
    private fun resolve(selector: Selector, applyPreconditions: Boolean = true): UiElement? {
        if (selector.value.isBlank()) return null
        if (applyPreconditions && requiresScroll(selector.groups)) {
            ensureReachable(selector)
        }
        return Resolvers.displayed(composeRule, selector)
            ?: UiElement.wrap(mozGetElement(selector, applyPreconditions = false))
    }

    private fun mozVerifyElement(selector: Selector, applyPreconditions: Boolean = true): Boolean {
        // MUST NOT throw. The page probes poll this before navigation starts, and an escaped
        // exception reaches navigateToPage() -> failure screenshot -> StrictMode penaltyDeath, which
        // masks the real error. Both halves below degrade to false instead.
        val element = runCatching { mozGetElement(selector, applyPreconditions) }.getOrNull() ?: return false
        return ElementState.probe(element, ElementState.Trait.DISPLAYED)
    }

    // --- Preconditions and interference ------------------------------------------

    private fun requiresScroll(groups: List<String>): Boolean {
        return groups.any {
            it.equals("requiresScroll", ignoreCase = true) || it.equals("needsSwipeNavStep", ignoreCase = true)
        }
    }

    private fun desiredSwipeDirection(groups: List<String>): SwipeDirection {
        return when {
            groups.any { it.equals("swipeDown", true) } -> SwipeDirection.DOWN
            groups.any { it.equals("swipeLeft", true) } -> SwipeDirection.LEFT
            groups.any { it.equals("swipeRight", true) } -> SwipeDirection.RIGHT
            else -> SwipeDirection.UP
        }
    }

    private fun ensureReachable(selector: Selector) {
        if (!requiresScroll(selector.groups)) return
        val dir = desiredSwipeDirection(selector.groups)
        Log.i("Preconditions", "'${selector.description}' requires scroll. Swiping $dir to bring into view.")
        reportAround(
            "precondition_scroll",
            "Bringing '${selector.description}' into view (swipe ${dir.name.lowercase()})",
        ) {
            // IMPORTANT: do not allow nested preconditions during swipe-to lookup
            mozSwipeTo(selector, direction = dir, maxSwipes = 10)
        }
    }

    /**
     * Hide the soft keyboard, tolerating failure. closeSoftKeyboard() throws PerformException when no editable view has
     * focus - the homepage, or after a dialog takes it. Hiding the keyboard is only ever a convenience for the next
     * assertion, so it must not fail the test. Use this, never a bare closeSoftKeyboard().
     */
    protected fun dismissSoftKeyboard() {
        runCatching { closeSoftKeyboard() }
            .onFailure { Log.i("BasePage", "dismissSoftKeyboard: ignored ${it::class.java.simpleName}") }
    }

    /**
     * Dismiss any known blocking overlay ([OverlayRegistry]) covering the app. Every verb calls this on a locate miss,
     * so an OEM popup in its own window cannot masquerade as "element not found"; page objects can also call it
     * directly when they know one is likely.
     *
     * Returns true if an overlay was DETECTED and a dismiss attempted - not that it worked. Callers re-probe for their
     * own target rather than trusting this.
     *
     * Exercised with one registered overlay only; read the OverlayRegistry KDoc before adding more.
     */
    fun dismissKnownOverlaysIfPresent(): Boolean {
        var handled = false
        for (overlay in OverlayRegistry.known) {
            if (mozVerifyElement(overlay.presence, applyPreconditions = false)) {
                Log.i("BasePage", "⚠ Blocking overlay detected: '${overlay.name}' — attempting dismiss")
                for (dismiss in overlay.dismiss) {
                    mozClickIfPresent(dismiss, timeout = 1_000)
                    // Stop once it is gone: further clicks would land on whatever is underneath.
                    if (!mozVerifyElement(overlay.presence, applyPreconditions = false)) break
                }
                handled = true
            }
        }
        if (handled) composeRule.waitForIdle()
        return handled
    }

    // --- Verbs: is it there? -----------------------------------------------------

    fun mozVerify(selector: Selector, timeout: Long = 5_000, interval: Long = 500) =
        require(
            verb = "verify",
            selector = selector,
            policy = WaitPolicy.Poll(timeout, interval),
            applyPreconditions = false,
            predicate = { ElementState.probe(it, ElementState.Trait.DISPLAYED) },
        )

    /** On screen right now? Never throws, never waits, so it can drive control flow. */
    fun mozIsElementPresent(selector: Selector): Boolean = mozVerifyElement(selector, applyPreconditions = false)

    fun mozVerifyElementAbsent(selector: Selector) = requireAbsent("verify_absent", selector)

    fun mozWaitUntilAbsent(
        selector: Selector,
        timeout: Long = TestAssetHelper.waitingTime,
        interval: Long = 500,
    ) = requireAbsent("wait_until_absent", selector, WaitPolicy.Poll(timeout, interval))

    /**
     * "Must not show up" - fails the moment it appears, unlike [mozVerifyElementAbsent] (one probe) or
     * [mozWaitUntilAbsent] (waits for it to go). Sometimes load-bearing: a screen that navigates away and bounces back
     * looks absent-then-present, which only a sustained check separates from absent.
     */
    fun mozVerifyElementStaysAbsent(
        selector: Selector,
        timeout: Long = TestAssetHelper.waitingTimeShort,
        interval: Long = 200,
    ) =
        requireAbsent(
            verb = "verify_stays_absent",
            selector = selector,
            policy = WaitPolicy.Poll(timeout, interval),
            sustain = true,
            dumpOnFailure = true,
        )

    // --- Verbs: what state is it in? ---------------------------------------------

    fun mozVerifyElementIsSelected(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.SELECTED, want = true, applyPreconditions)

    fun mozVerifyElementIsNotSelected(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.SELECTED, want = false, applyPreconditions)

    fun mozVerifyElementIsEnabled(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.ENABLED, want = true, applyPreconditions)

    fun mozVerifyElementIsNotEnabled(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.ENABLED, want = false, applyPreconditions)

    fun mozVerifyElementIsChecked(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.CHECKED, want = true, applyPreconditions)

    fun mozVerifyElementIsNotChecked(selector: Selector, applyPreconditions: Boolean = true) =
        state(selector, ElementState.Trait.CHECKED, want = false, applyPreconditions)

    private fun state(
        selector: Selector,
        trait: ElementState.Trait,
        want: Boolean,
        applyPreconditions: Boolean,
    ): BasePage {
        val name = trait.name.lowercase()
        require(
            verb = if (want) "verify_$name" else "verify_not_$name",
            selector = selector,
            expectation = if (want) "is $name" else "is not $name",
            applyPreconditions = applyPreconditions,
            dumpOnFailure = false,
            predicate = { if (want) ElementState.probe(it, trait) else ElementState.isNot(it, trait) },
        )
        return this
    }

    fun mozVerifyElementHasSiblingWithText(
        selector: Selector,
        siblingText: String,
        applyPreconditions: Boolean = true,
    ) =
        require(
            verb = "verify_sibling_text",
            selector = selector,
            expectation = "has a sibling reading '$siblingText'",
            applyPreconditions = applyPreconditions,
            dumpOnFailure = false,
            predicate = { Relations.hasSiblingWithText(it, siblingText) },
        )

    fun mozVerifyElementHasCheckedSiblingByResName(selector: Selector, siblingResName: String) =
        require(
            verb = "verify_checked_sibling",
            selector = selector,
            expectation = "has a checked sibling named '$siblingResName'",
            dumpOnFailure = false,
            predicate = { Relations.hasCheckedSiblingNamed(it, siblingResName) },
        )

    // --- Verbs: all the matches at once ------------------------------------------

    fun mozVerifyElementCount(
        selector: Selector,
        count: Int,
        timeout: Long = TestAssetHelper.waitingTime,
        interval: Long = 500,
    ) =
        requireAll(
            verb = "verify_element_count",
            selector = selector,
            expectation = "has exactly $count matches",
            // Fixed interval, no backoff: a list still being populated passes through the expected count
            // on its way to a larger one, and probing faster makes that transient easier to catch.
            policy = WaitPolicy.Poll(timeout, interval, backoff = false),
            dumpOnFailure = true,
            before = { dismissSoftKeyboard() },
            satisfied = { it.fetchSemanticsNodes().size == count },
        )

    fun mozVerifyAnyContainsText(
        selector: Selector,
        text: String,
        timeout: Long = TestAssetHelper.waitingTime,
        interval: Long = 500,
    ) =
        requireAll(
            verb = "verify_any_contains_text",
            selector = selector,
            expectation = "has a match containing '$text'",
            policy = WaitPolicy.Poll(timeout, interval),
            before = { dismissSoftKeyboard() },
            satisfied = { it.filter(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() },
        )

    fun mozVerifyAnyHasChildWithText(
        selector: Selector,
        text: String,
        timeout: Long = TestAssetHelper.waitingTime,
        interval: Long = 500,
    ) =
        requireAll(
            verb = "verify_any_has_child_text",
            selector = selector,
            expectation = "has a match with a child containing '$text'",
            policy = WaitPolicy.Poll(timeout, interval),
            satisfied = { it.filter(hasAnyChild(hasText(text))).fetchSemanticsNodes().isNotEmpty() },
        )

    fun mozVerifyNoneContainText(selector: Selector, text: String) =
        requireAll(
            verb = "verify_none_contain_text",
            selector = selector,
            expectation = "has no match containing '$text'",
            before = { dismissSoftKeyboard() },
            satisfied = { it.filter(hasText(text)).fetchSemanticsNodes().isEmpty() },
        )

    fun mozClickFirstWithParentText(selector: Selector, parentText: String) =
        requireAll(
            verb = "click_first_with_parent_text",
            selector = selector,
            expectation = "has a match under a parent reading '$parentText'",
            satisfied = { it.filter(hasParent(hasText(parentText))).fetchSemanticsNodes().isNotEmpty() },
            action = { it.filter(hasParent(hasText(parentText))).onFirst().performClick() },
        )

    // --- Verbs: touch it ---------------------------------------------------------

    fun mozClick(selector: Selector) =
        require(
            verb = "click",
            selector = selector,
            expectation = "clickable",
            via = { sel, pre ->
                composeRule.waitForIdle()
                resolve(sel, pre)
            },
            action = UiActions::click,
        )

    fun mozClickIfPresent(selector: Selector, timeout: Long = 3_000, interval: Long = 200) =
        require(
            verb = "click_if_present",
            selector = selector,
            policy = WaitPolicy.Poll(timeout, interval),
            applyPreconditions = false,
            optional = true,
            action = UiActions::click,
        )

    /**
     * For a control that renders immediately but is briefly disabled - the add-on permission dialog's "Add" button,
     * disabled for ~1s. [mozClick] checks presence only and would tap it while disabled, which the app ignores: a
     * silent no-op that passes.
     */
    fun mozClickWhenEnabled(
        selector: Selector,
        timeout: Long = TestAssetHelper.waitingTime,
        interval: Long = 200,
    ) =
        require(
            verb = "click_when_enabled",
            selector = selector,
            expectation = "enabled",
            policy = WaitPolicy.Poll(timeout, interval),
            applyPreconditions = false,
            predicate = { ElementState.probe(it, ElementState.Trait.ENABLED) },
            action = UiActions::click,
        )

    fun mozLongClick(selector: Selector) =
        require(
            verb = "long_click",
            selector = selector,
            expectation = "long-clickable",
            dumpOnFailure = false,
            action = { element ->
                // TEXT_MERGED re-fetches by text instead of using the located node: the merged node can
                // be the whole row, and the gesture has to land on the text itself.
                if (
                    element is SemanticsNodeInteraction && selector.strategy == SelectorStrategy.COMPOSE_BY_TEXT_MERGED
                ) {
                    composeRule.waitUntil(TestAssetHelper.waitingTime) {
                        composeRule.onAllNodesWithText(selector.value).fetchSemanticsNodes().isNotEmpty()
                    }
                    composeRule.onNodeWithText(selector.value).performTouchInput {
                        composeLongClick(durationMillis = 5000)
                    }
                } else {
                    UiActions.longClick(element)
                }
            },
        )

    fun mozSetSliderValue(selector: Selector, value: Float) =
        reportAround("set_slider", "Setting '${selector.description}' to $value", dumpOnFailure = true) {
            composeRule.onNodeWithTag(selector.value).run {
                assertExists()
                performSemanticsAction(SemanticsActions.SetProgress) { it(value) }
            }
        }

    // --- Verbs: type into it -----------------------------------------------------

    fun mozEnterText(text: String, selector: Selector) =
        require(
            verb = "enter_text",
            selector = selector,
            expectation = "editable",
            dumpOnFailure = false,
            action = { UiActions.enterText(it, text) },
        )

    fun mozClear(selector: Selector) =
        require(
            verb = "clear_text",
            selector = selector,
            expectation = "editable",
            dumpOnFailure = false,
            action = UiActions::clear,
        )

    fun mozClearAndEnterText(text: String, selector: Selector): BasePage {
        mozClear(selector)
        return mozEnterText(text, selector)
    }

    fun mozPressEnter(selector: Selector) =
        require(
            verb = "press_enter",
            selector = selector,
            dumpOnFailure = false,
            action = UiActions::pressEnter,
        )

    // --- Verbs: move the screen --------------------------------------------------

    fun mozSwipeTo(
        selector: Selector,
        direction: SwipeDirection = SwipeDirection.DOWN,
        maxSwipes: Int = 10, // TODO (Jackie J. 10/30/2025): replace hard-coded value with self-selecting x,y boundaries
    ) =
        driveUntil(
            verb = "swipe_to",
            selector = selector,
            attempts = maxSwipes,
            want = true,
            // Stricter than plain presence: Espresso's click() rejects a view displayed under
            // CLICKABLE_VISIBILITY_PERCENT, so stopping at "exists" would leave the element unclickable.
            probe = { ElementState.isClickablyVisible(it, CLICKABLE_VISIBILITY_PERCENT) },
            settle = { SystemClock.sleep(500) },
            step = { Gestures.onScreen(direction) },
        )

    /**
     * Swipe once on [selector]'s element. [steps] is the UiAutomator motion-event count, so it sets gesture speed: some
     * gestures only register as a flick (the navigation toolbar to switch tabs), hence a low value.
     */
    fun mozSwipeElement(
        selector: Selector,
        direction: SwipeDirection,
        applyPreconditions: Boolean = false,
        steps: Int = 100,
    ) =
        require(
            verb = "swipe_element",
            selector = selector,
            expectation = "swipeable",
            applyPreconditions = applyPreconditions,
            dumpOnFailure = false,
            action = { Gestures.onElement(it, direction, steps) },
        )

    fun mozSwipeElementUntilAbsent(
        selector: Selector,
        direction: SwipeDirection,
        maxSwipes: Int = 3,
        applyPreconditions: Boolean = false,
    ) =
        driveUntil(
            verb = "swipe_element_until_absent",
            selector = selector,
            attempts = maxSwipes,
            want = false,
            dumpOnFailure = true,
            settle = {
                composeRule.waitForIdle()
                mDevice.waitForIdle()
            },
            step = { mozSwipeElement(selector, direction, applyPreconditions) },
        )

    // For leaving something with no selector to poll - closing a 404 tab, say. "Back until X is gone"
    // cannot stand in: it presses again if the first press has not landed yet.
    fun mozPressBack(): BasePage {
        val cmd = rep().start(TimedReporter.Type.CMD, "press_back", "Pressing back...")
        mDevice.pressBack()
        mDevice.waitForIdle()
        cmd.ok("Pressed back")
        return this
    }

    fun mozPressBackUntilGone(selector: Selector, maxPresses: Int = 5) =
        driveUntil(
            verb = "press_back_until_gone",
            selector = selector,
            attempts = maxPresses,
            want = false,
            step = {
                mDevice.pressBack()
                mDevice.waitForIdle()
            },
        )

    /**
     * For backing out of an unknown number of screens: how deep you are depends on whether a dialog intercepted an
     * earlier step, and a fixed count either overshoots - backgrounding the app - or stops short.
     */
    fun mozPressBackUntilPresent(selector: Selector, maxPresses: Int = 5) =
        driveUntil(
            verb = "press_back_until_present",
            selector = selector,
            attempts = maxPresses,
            want = true,
            dumpOnFailure = true,
            step = {
                mDevice.pressBack()
                mDevice.waitForIdle()
            },
        )

    // --- Verbs: the device around the app ----------------------------------------

    /** Is an IME window on screen? Reads the accessibility window list, so no shell access needed. */
    fun mozIsKeyboardVisible(): Boolean =
        InstrumentationRegistry.getInstrumentation().uiAutomation.windows.any {
            it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD
        }

    /** Poll until the soft keyboard is showing; throws if it never appears within [timeout]. */
    fun mozVerifyKeyboardVisible(timeout: Long = 5_000, interval: Long = 200) =
        requireState(
            verb = "verify_keyboard_visible",
            description = "the soft keyboard is visible",
            policy = WaitPolicy.Poll(timeout, interval),
            dumpOnFailure = true,
            condition = ::mozIsKeyboardVisible,
        )

    fun mozOpenNotificationsTray() =
        reportAround("open_notifications_tray", "Opening the Notifications tray") { mDevice.openNotification() }

    /**
     * Asserts the native app [appPackageName] launches, then force-stops it so it doesn't linger into subsequent tests.
     * Falls back to verifying [url] if the package isn't installed.
     */
    fun mozVerifyNativeAppOpens(appPackageName: String, url: String = "") =
        reportAround("verify_native_app_opens", "Verifying native app '$appPackageName' opens") {
            AppAndSystemHelper.assertNativeAppOpens(composeRule, appPackageName, url)
        }

    fun mozVerifyFileOpensInExternalApp(appPackageName: String) =
        reportAround("verify_file_opens_in_external_app", "Verifying external app '$appPackageName' opens") {
            AppAndSystemHelper.assertExternalAppOpens(appPackageName)
        }
}

/**
 * Fails the current test with [message]. Returning [Nothing] lets call sites use it in expression position, the way a
 * bare `throw` would.
 */
private fun assertionFailure(message: String, cause: Throwable? = null): Nothing = throw AssertionError(message, cause)
