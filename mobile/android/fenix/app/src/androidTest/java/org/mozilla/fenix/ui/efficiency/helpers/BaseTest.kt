/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

import android.util.Log
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.v2.AndroidComposeTestRule as AndroidComposeTestRuleV2
import androidx.test.espresso.Espresso
import androidx.test.espresso.base.DefaultFailureHandler
import androidx.test.platform.app.InstrumentationRegistry
import leakcanary.NoLeakAssertionFailedError
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.rules.TestRule
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import org.junit.runners.model.Statement
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.IdlingResourceHelper.unregisterAllIdlingResources
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.ui.efficiency.logging.TestLogging
import org.mozilla.fenix.ui.efficiency.logging.TestStatus
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter
import org.mozilla.fenix.ui.efficiency.navigation.LaunchConfig
import org.mozilla.fenix.ui.efficiency.navigation.NavigationRegistry
import org.mozilla.fenix.ui.efficiency.navigation.PageCatalog

/**
 * What every efficiency test starts with, and who provides it.
 *
 * The setup a test inherits was spread across three places and stated in none, which is how a reader ends up with the
 * wrong answer about what leaks. This is that list. It is deliberately exhaustive: if something is not here, no test
 * should be relying on it.
 *
 * ## The rules, outermost first
 *
 * A LOWER `order` is applied further out, so this is also the order they run in.
 *
 * -1 [sampleOnArrival] records what the device arrived carrying, before anything clears it 0 FenixTestRule (legacy)
 * GrantPermissionRule -> TestSetupRule -> MockWebServerRule 1 [composeRuleWithCleanup] the per-test clear, then the
 * activity, then the failure dump 2 [recordTestBoundaries] test start/end and the state samples around them
 *
 * ## What is cleared, and by which of them
 *
 * FenixTestRule at order 0 is inherited from the legacy suite, and clears more than its name suggests: history,
 * bookmarks, site permissions, the downloads folder, and all notifications. It also sets portrait orientation,
 * back-gesture navigation on, data saver off, the debug drawer off, and on API 34 stops system UI reading the
 * clipboard. It grants POST_NOTIFICATIONS unconditionally, and starts a MockWebServer for every test whether the test
 * uses one or not.
 *
 * [AppDataCleaner] at order 1 then clears bookmarks and pinned sites again, sessions, autofill addresses and cards,
 * saved logins, all tabs, and the launcher icon aliases. It runs at both ends of the test, and reports which clears
 * failed rather than swallowing them.
 *
 * ## What is NOT cleared by either
 *
 * The Gecko profile, which is not under /data/data at all --- it lives in app-scoped external storage and holds
 * cookies, HSTS state, certificates, Gecko-side site permissions, localStorage and IndexedDB. Also: the default search
 * engine, fenix_preferences.xml, collections, tab groups, Nimbus, Glean, and anything the running process holds in
 * memory. Under `am instrument` the process is shared across a class's methods, so the in-memory half crosses between
 * them freely.
 *
 * The full account, with what reads each layer, is in mission-control/docs/STATE-BOUNDARIES.md.
 *
 * ## Logging
 *
 * A test describes WHAT is being tested; the harness owns HOW it runs --- navigation, selectors, waiting --- and
 * therefore owns the observability for those. Two streams come out of that: a human one on the `Eff` tag and structured
 * records on `EffJson`. Four tools outside this repository parse them, so the shape is a contract and lives in
 * logging/log-format.json.
 */
abstract class BaseTest(private val defaultLaunchConfig: LaunchConfig = LaunchConfig()) {

    private companion object {
        /** Espresso's failure handler is a process-wide singleton; installing it is a one-off. */
        @Volatile var espressoHandlerInstalled = false
    }

    /**
     * How this test launches the app.
     *
     * One mechanism, not two. BaseTest used to take the seven flags as separate constructor arguments AND expose this
     * override, so the flag list existed in two places and a reader had to check both to know what a test launches
     * with. Adding a flag meant changing a constructor signature every subclass inherits.
     *
     * Pass a LaunchConfig for a fixed launch, override this for one that varies per case --- the reachability shards
     * pick theirs from the case they were given.
     */
    protected open fun launchConfig(): LaunchConfig = defaultLaunchConfig

    /**
     * What the device arrived carrying, sampled before anything clears it.
     *
     * Order -1 so it is OUTSIDE FenixTestRule. A lower order is applied further out, and FenixTestRule at 0 wraps
     * TestSetupRule, whose before() clears history, bookmarks, site permissions, the downloads folder and
     * notifications. Sampling anywhere inside that reads what survived the cleanup, not what the previous test left ---
     * and it is the second that finds a leak. Taken from -1, an inherited history entry is visible; taken from 1 it is
     * not, which is measurably what happened: the leak demo's inherited downloads showed up and its inherited history
     * did not.
     */
    @get:Rule(order = -1)
    val sampleOnArrival: TestRule = TestRule { base, description ->
        object : Statement() {
            override fun evaluate() {
                StateProbe.record("arrival", description.displayName)
                base.evaluate()
            }
        }
    }

    @get:Rule(order = 0) val fenixTestRule: FenixTestRule = FenixTestRule()

    // Built per test rather than declared as a plain @get:Rule, because the activity flags come
    // from launchConfig(), which subclasses override --- so the config has to be read before the
    // rule is constructed. AndroidComposeTestRule also holds a TestScope that can only be entered
    // once, so it could not be reused across tests even if the flags were fixed.
    private var _composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>? = null

    /**
     * The Compose rule for the test currently running.
     *
     * Reading this before the rule at order 1 has built it is a programming error, and it used to be a `!!` --- a
     * NullPointerException with no explanation, from a rule ordering that is nowhere written down. The same hazard
     * already cost one silent bug: a watcher at order 2 recorded state through a reporter that a later @Before had not
     * installed yet, so the first test of every class lost its sample and nothing said so.
     *
     * So it says what went wrong instead. Anything that runs outside a test body --- a watcher, a rule at a lower
     * order, the inspector --- is on the wrong side of this and should not be reaching for it.
     */
    val composeRule: AndroidComposeTestRule<HomeActivityIntentTestRule, *>
        get() =
            checkNotNull(_composeRule) {
                "composeRule read before the activity rule built it. Rules run outermost-first by " +
                    "ascending order: -1 samples arrival, 0 is FenixTestRule, 1 builds this, 2 " +
                    "records boundaries. Anything at a lower order than 1, or outside a test body, " +
                    "runs before this exists."
            }

    // There is deliberately no retry here. Firebase re-runs a failing test once
    // (num-flaky-test-attempts in the TAE flank configs), and under Gradle the AndroidX Test
    // Orchestrator gives every test its own process with package data cleared. An in-process retry
    // would be the one thing that escapes that isolation: the second attempt inherits whatever the
    // first left behind, so it can pass for the wrong reason or fail differently. See bug 2065120.
    //
    // Note that the orchestrator is a GRADLE-path guarantee, not a universal one. The fleet
    // dispatches with `am instrument`, where there is no orchestrator and no clearPackageData, so
    // a class's methods share one process and one data directory --- verified by a download added
    // to the BrowserStore in one method still being there at the start of the next. Whatever
    // isolation a test needs on that path comes from the reset between queue items and from the
    // cleanup in this file, not from the runner.
    @get:Rule(order = 1)
    val composeRuleWithCleanup: TestRule = TestRule { base, description ->
        object : Statement() {
            override fun evaluate() {
                val cfg = launchConfig()
                _composeRule =
                    AndroidComposeTestRuleV2(
                        HomeActivityIntentTestRule(
                            skipOnboarding = cfg.skipOnboarding,
                            isPageLoadTranslationsPromptEnabled = cfg.isPageLoadTranslationsPromptEnabled,
                            isPocketEnabled = cfg.isPocketEnabled,
                            isRecentlyVisitedFeatureEnabled = cfg.isRecentlyVisitedFeatureEnabled,
                            shouldUseExpandedToolbar = cfg.shouldUseExpandedToolbar,
                            isTabStripEnabled = cfg.isTabStripEnabled,
                            shakeToSummarizeFeatureFlagEnabled = cfg.shakeToSummarizeFeatureFlagEnabled,
                        )
                    ) {
                        it.activity
                    }
                try {
                    AppDataCleaner.clear("before", description.displayName)
                    // Dump on ANY failure, not only those raised through a page-object verb.
                    // BasePage.dumpFailure covers navigateToPage and mozVerifyElementsByGroup, but
                    // a page object asserting with a bare JUnit assertTrue --- BrowserPage
                    // .verifyPageContent, for one --- throws straight past it, and the failure that
                    // most needs a picture is the one nobody wrote a verb for.
                    //
                    // Wrapped INSIDE the activity rule on purpose. Catching further out photographs
                    // a black screen: the activity rule finishes the activity in its own teardown,
                    // which runs before the exception reaches anything outside it.
                    val dumpOnFailure =
                        object : Statement() {
                            override fun evaluate() {
                                try {
                                    base.evaluate()
                                } catch (t: Throwable) {
                                    runCatching {
                                        ScreenDump.dumpAll(_composeRule, "test failed: ${description.methodName}")
                                    }
                                        .onFailure {
                                            Log.i("BaseTest", "BaseTest: failure dump failed: ${it.message}")
                                        }
                                    throw t
                                }
                            }
                        }
                    try {
                        composeRule.apply(dumpOnFailure, description).evaluate()
                    } finally {
                        // Tidy up after, not only before. Cleaning only at the start meant a
                        // failing test left everything it created on the device until the next
                        // test cleared up on its behalf --- and if it was the last test in the
                        // class, indefinitely. In a `finally` so a failure is tidied up after too,
                        // which is the case that used to leave the mess.
                        AppDataCleaner.clear("after", description.displayName)
                    }
                } catch (t: NoLeakAssertionFailedError) {
                    Log.i("BaseTest", "BaseTest: NoLeakAssertionFailedError caught.")
                    cleanup(removeTabs = true)
                    throw t
                }
            }
        }
    }

    // get() ensures this always delegates to the current composeRule instance,
    // not a stale one captured at class construction time.
    protected val on: PageContext
        get() = PageContext(composeRule)

    /**
     * Reporter lifecycle:
     * - Create once if missing.
     * - Reset at the start of every test so summaries and counters are per-test.
     *
     * Why reset instead of re-creating:
     * - Keeps construction cheap and avoids wiring churn if we later attach file sinks.
     * - Makes it easier to evolve toward a more formal "test context" object later.
     */
    /**
     * Test boundaries in the artifact stream. Without them details.jsonl is a flat run of steps with no way to say
     * which test any of them belonged to, which is the first thing triage asks.
     *
     * A watcher rather than @Before/@After because only a watcher sees the outcome.
     */
    @get:Rule(order = 2)
    val recordTestBoundaries: TestRule =
        object : TestWatcher() {
            override fun starting(description: Description) {
                // Sampled AFTER the reset and before the test body, so a non-zero count here is state
                // the reset could not reach --- somebody else's leftovers.
                StateProbe.record("start", description.displayName)
                // The launch configuration goes on the record, because "was this test even running the
                // app it expects?" is otherwise unanswerable after the fact. testStart has always taken
                // meta; nothing was filling it, so every trace claimed a default launch.
                installedReporter().testStart(description.displayName, launchConfig().asMeta())
            }

            override fun succeeded(description: Description) {
                StateProbe.record("end", description.displayName)
                installedReporter().testEnd(description.displayName, TestStatus.PASS)
            }

            override fun failed(e: Throwable, description: Description) {
                // Especially on failure: "the store has three history entries and the screen shows
                // none" is a different bug report from "the store is empty too".
                StateProbe.record("end", description.displayName)
                installedReporter().testEnd(description.displayName, TestStatus.FAIL)
            }

            override fun skipped(e: org.junit.AssumptionViolatedException, description: Description) {
                installedReporter().testEnd(description.displayName, TestStatus.SKIP)
            }
        }

    /**
     * Silent until a test installs a real one, so page objects driven outside a test - the inspector, tooling - narrate
     * nothing rather than crashing or logging into a void. Called from both the watcher and setUp because rule ordering
     * decides which runs first and neither should care.
     */
    private fun installedReporter(): TimedReporter = TestLogging.installed()

    /**
     * An opt-in diagnostic, read from the instrumentation arguments.
     *
     * These two were gated on `java.lang.Boolean.getBoolean`, which reads a JVM system property. Instrumentation
     * arguments do not set system properties --- they arrive through InstrumentationRegistry --- and nothing in the
     * tree calls System.setProperty for either name, so both hooks were unreachable and the page-catalog one did real
     * reflective work that nobody could trigger. Same mechanism SnapshotPrimer already uses:
     *
     * am instrument -e logPageCatalog true ...
     */
    private fun installEspressoFailureHandlerOnce() {
        if (espressoHandlerInstalled) return
        Espresso.setFailureHandler(DefaultFailureHandler(appContext, false))
        espressoHandlerInstalled = true
    }

    private fun flagArg(name: String): Boolean =
        InstrumentationRegistry.getArguments().getString(name)?.toBooleanStrictOrNull() ?: false

    @Before
    fun setUp() {
        // Disable Espresso's screenshot-on-failure locally.
        //
        // Why: Espresso's DefaultFailureHandler captures a screenshot when an interaction fails.
        // On a debug build on a REAL device, that bitmap capture (DeviceCapture ->
        // takeScreenshotOnNextFrame) trips Fenix's StrictMode penaltyDeath and KILLS the process
        // before the real assertion error is reported — so the genuine failure is swallowed and the
        // test looks like an opaque crash. It does not reproduce on Firebase (no penaltyDeath /
        // different capture path), which is why these only fail locally. Installing the default
        // handler with captureScreenshotOnFailure = false keeps failure messages intact without the
        // fatal screenshot. We still get the real error (and our own ScreenDump) for debugging.
        // Second arg is captureScreenshotOnFailure = false.
        //
        // Installed once for the process rather than on every test. It is a process-wide
        // singleton and nothing ever put it back, so setting it per test was writing the same
        // value repeatedly to a global with no owner --- and under `am instrument` the process is
        // shared across a class's methods, so "per test" was never true anyway.
        installEspressoFailureHandlerOnce()

        installedReporter().reset()
        if (flagArg("logNavigationSummary")) {
            NavigationRegistry.logPathSummary()
        }
        if (flagArg("logPageCatalog")) {
            val pages = PageCatalog.discoverPages()

            Log.i("PageCatalog", "Discovered ${pages.size} pages from PageContext")

            pages.forEachIndexed { index, pageRef ->
                val page = pageRef.getter(on)

                Log.i(
                    "PageCatalog",
                    "   ${index + 1}. ${page.pageName} (property=${pageRef.propertyName})",
                )
            }
        }

        // Where navigation believes it is. A breadcrumb, not a source of truth --- that stays
        // selector-based verification (mozIsOnPageNow / mozWaitForPageToLoad) --- but it now has a
        // second reader: ScreenDump writes it into a failure as `harnessPage`, and mission-control
        // shows it beside the page the analyser infers from the screen. A disagreement between the
        // two means navigation recorded an arrival it did not make. So a stale value is a
        // misleading diagnostic now, not just an internal inconsistency, and resetting it at the
        // start of every test is what keeps it honest.
        PageStateTracker.reset()
    }

    /**
     * Print a short per-test summary to stdout.
     *
     * Why:
     * - Helps spot where time was spent and which layer failed most often (STEP/CMD/LOC).
     * - Provides immediate value in CI where you may only have the log artifact.
     *
     * Note:
     * - "Wall time" is overall elapsed real-world time for the test (start -> end).
     * - STEP/CMD/LOC totals sum only the instrumented scopes.
     */
    @After
    fun tearDown() {
        appContext.components.useCases.tabsUseCases.removeAllTabs()
    }

    @After
    fun tearDownLogging() {
        try {
            TestLogging.reporter.printSummary()
        } catch (_: Throwable) {
            // Logging must never fail a test.
        }
    }
}

private fun cleanup(removeTabs: Boolean = false) {
    unregisterAllIdlingResources()
    if (removeTabs) {
        appContext.components.useCases.tabsUseCases.removeAllTabs()
    }
    exitMenu()
}
