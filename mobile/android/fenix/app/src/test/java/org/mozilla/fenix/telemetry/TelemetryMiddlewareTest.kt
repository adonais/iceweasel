/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.telemetry

import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.action.ExtensionsProcessAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.action.TranslationsAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.state.recover.RecoverableTab
import mozilla.components.browser.state.state.recover.TabState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.translate.TranslationError
import mozilla.components.concept.engine.translate.TranslationOperation
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.support.base.android.Clock
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.robolectric.testContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Addons
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.Metrics
import org.mozilla.fenix.GleanMetrics.Translations
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.metrics.Event
import org.mozilla.fenix.components.metrics.MetricController
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLooper
import org.mozilla.fenix.GleanMetrics.EngineTab as EngineMetrics

@RunWith(RobolectricTestRunner::class)
class TelemetryMiddlewareTest {

    private lateinit var store: BrowserStore
    private lateinit var appStore: AppStore
    private lateinit var settings: Settings
    private lateinit var telemetryMiddleware: TelemetryMiddleware
    private lateinit var tabsUseCases: TabsUseCases

    @get:Rule
    val gleanRule = FenixGleanTestRule(ApplicationProvider.getApplicationContext())

    private val clock = FakeClock()
    private val metrics: MetricController = mockk()

    @Before
    fun setUp() {
        Clock.delegate = clock
        settings = Settings(testContext)
        telemetryMiddleware = TelemetryMiddleware(
            context = testContext,
            settings = settings,
            metrics = metrics,
        )
        val engine: Engine = mockk()
        every { engine.enableExtensionProcessSpawning() } just runs
        every { engine.disableExtensionProcessSpawning() } just runs
        every { engine.getSupportedTranslationLanguages(any(), any()) } just runs
        every { engine.isTranslationsEngineSupported(any(), any()) } just runs
        every { engine.createSession(any(), any()) } returns mockk(relaxed = true)

        store = BrowserStore(
            middleware = listOf(telemetryMiddleware),
            initialState = BrowserState(),
        )
        appStore = AppStore()
        every { testContext.components.appStore } returns appStore
        tabsUseCases = TabsUseCases(store)
    }

    @After
    fun tearDown() {
        Clock.reset()
    }

    @Test
    fun `WHEN a tab is added THEN the open tab count is updated`() = runTest {
        assertEquals(0, settings.openTabsCount)
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(TabListAction.AddTabAction(createTab("https://mozilla.org"))).joinBlocking()
        assertEquals(1, settings.openTabsCount)

        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN a private tab is added THEN the open tab count is not updated`() = runTest {
        assertEquals(0, settings.openTabsCount)
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(TabListAction.AddTabAction(createTab("https://mozilla.org", private = true)))
            .joinBlocking()
        assertEquals(0, settings.openTabsCount)

        assertFalse(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN multiple tabs are added THEN the open tab count is updated`() = runTest {
        assertEquals(0, settings.openTabsCount)
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(
            TabListAction.AddMultipleTabsAction(
                listOf(
                    createTab("https://mozilla.org"),
                    createTab("https://firefox.com"),
                ),
            ),
        ).joinBlocking()

        assertEquals(2, settings.openTabsCount)

        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN a tab is removed THEN the open tab count is updated`() = runTest {
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(
            TabListAction.AddMultipleTabsAction(
                listOf(
                    createTab(id = "1", url = "https://mozilla.org"),
                    createTab(id = "2", url = "https://firefox.com"),
                ),
            ),
        ).joinBlocking()
        assertEquals(2, settings.openTabsCount)

        store.dispatch(TabListAction.RemoveTabAction("1")).joinBlocking()
        assertEquals(1, settings.openTabsCount)

        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN all tabs are removed THEN the open tab count is updated`() = runTest {
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(
            TabListAction.AddMultipleTabsAction(
                listOf(
                    createTab("https://mozilla.org"),
                    createTab("https://firefox.com"),
                ),
            ),
        ).joinBlocking()
        assertEquals(2, settings.openTabsCount)

        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)

        store.dispatch(TabListAction.RemoveAllTabsAction()).joinBlocking()
        assertEquals(0, settings.openTabsCount)

        assertFalse(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN all normal tabs are removed THEN the open tab count is updated`() = runTest {
        assertNull(Metrics.hasOpenTabs.testGetValue())

        store.dispatch(
            TabListAction.AddMultipleTabsAction(
                listOf(
                    createTab("https://mozilla.org"),
                    createTab("https://firefox.com"),
                    createTab("https://getpocket.com", private = true),
                ),
            ),
        ).joinBlocking()
        assertEquals(2, settings.openTabsCount)
        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)

        store.dispatch(TabListAction.RemoveAllNormalTabsAction).joinBlocking()
        assertEquals(0, settings.openTabsCount)
        assertFalse(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `WHEN tabs are restored THEN the open tab count is updated`() = runTest {
        assertEquals(0, settings.openTabsCount)
        assertNull(Metrics.hasOpenTabs.testGetValue())

        val tabsToRestore = listOf(
            RecoverableTab(null, TabState(url = "https://mozilla.org", id = "1")),
            RecoverableTab(null, TabState(url = "https://firefox.com", id = "2")),
        )

        store.dispatch(
            TabListAction.RestoreAction(
                tabs = tabsToRestore,
                restoreLocation = TabListAction.RestoreAction.RestoreLocation.BEGINNING,
            ),
        ).joinBlocking()
        assertEquals(2, settings.openTabsCount)

        assertTrue(Metrics.hasOpenTabs.testGetValue()!!)
    }

    @Test
    fun `GIVEN a normal page is loading WHEN loading is complete THEN we record a UriOpened event`() =
        runTest {
            val tab = createTab(id = "1", url = "https://mozilla.org")
            assertNull(Events.normalAndPrivateUriCount.testGetValue())

            store.dispatch(TabListAction.AddTabAction(tab)).joinBlocking()
            store.dispatch(ContentAction.UpdateLoadingStateAction(tab.id, true)).joinBlocking()
            assertNull(Events.normalAndPrivateUriCount.testGetValue())

            store.dispatch(ContentAction.UpdateLoadingStateAction(tab.id, false)).joinBlocking()
            val count = Events.normalAndPrivateUriCount.testGetValue()!!
            assertEquals(1, count)
        }

    @Test
    fun `GIVEN a private page is loading WHEN loading is complete THEN we record a UriOpened event`() =
        runTest {
            val tab = createTab(id = "1", url = "https://mozilla.org", private = true)
            assertNull(Events.normalAndPrivateUriCount.testGetValue())

            store.dispatch(TabListAction.AddTabAction(tab)).joinBlocking()
            store.dispatch(ContentAction.UpdateLoadingStateAction(tab.id, true)).joinBlocking()
            assertNull(Events.normalAndPrivateUriCount.testGetValue())

            store.dispatch(ContentAction.UpdateLoadingStateAction(tab.id, false)).joinBlocking()
            val count = Events.normalAndPrivateUriCount.testGetValue()!!
            assertEquals(1, count)
        }

    @Test
    fun `WHEN tabs gets killed THEN middleware sends an event`() = runTest {
        store.dispatch(
            TabListAction.RestoreAction(
                listOf(
                    RecoverableTab(
                        null,
                        TabState(url = "https://www.mozilla.org", id = "foreground"),
                    ),
                    RecoverableTab(
                        null,
                        TabState(
                            url = "https://getpocket.com",
                            id = "background_pocket",
                            hasFormData = true,
                        ),
                    ),
                ),
                selectedTabId = "foreground",
                restoreLocation = TabListAction.RestoreAction.RestoreLocation.BEGINNING,
            ),
        ).joinBlocking()

        assertNull(EngineMetrics.tabKilled.testGetValue())

        store.dispatch(
            EngineAction.KillEngineSessionAction("background_pocket"),
        ).joinBlocking()

        assertEquals(1, EngineMetrics.tabKilled.testGetValue()?.size)
        EngineMetrics.tabKilled.testGetValue()?.get(0)?.extra?.also {
            assertEquals("false", it["foreground_tab"])
            assertEquals("true", it["had_form_data"])
            assertEquals("true", it["app_foreground"])
        }

        appStore.dispatch(
            AppAction.AppLifecycleAction.PauseAction,
        ).joinBlocking()

        store.dispatch(
            EngineAction.KillEngineSessionAction("foreground"),
        ).joinBlocking()

        assertEquals(2, EngineMetrics.tabKilled.testGetValue()?.size)
        EngineMetrics.tabKilled.testGetValue()?.get(1)?.extra?.also {
            assertEquals("true", it["foreground_tab"])
            assertEquals("false", it["had_form_data"])
            assertEquals("false", it["app_foreground"])
        }
    }

    @Test
    fun `GIVEN the request to check for form data WHEN it fails THEN telemetry is sent`() =
        runTest {
            assertNull(Events.formDataFailure.testGetValue())

            store.dispatch(
                ContentAction.CheckForFormDataExceptionAction(
                    "1",
                    RuntimeException("session form data request failed"),
                ),
            ).joinBlocking()

            // Wait for the main looper to process the re-thrown exception.
            ShadowLooper.idleMainLooper()

            assertNotNull(Events.formDataFailure.testGetValue())
        }

    @Test
    fun `GIVEN an existing tab WHEN it reloads THEN telemetry is sent`() = runTest {
        val tabId = "test-tab-id"

        store.dispatch(
            TabListAction.AddTabAction(
                createTab(
                    id = tabId,
                    url = "https://firefox.com",
                ),
            ),
        )
            .joinBlocking()

        store.dispatch(
            EngineAction.KillEngineSessionAction(tabId),
        ).joinBlocking()
        assertTrue(store.state.recentlyKilledTabs.contains(tabId))

        store.dispatch(
            EngineAction.CreateEngineSessionAction(tabId),
        ).joinBlocking()

        ShadowLooper.idleMainLooper()

        val recordedEvents = EngineMetrics.reloaded.testGetValue()
        assertNotNull(recordedEvents)
        assertEquals(1, recordedEvents!!.size)

        assertFalse(store.state.recentlyKilledTabs.contains(tabId))
    }

    @Test
    fun `GIVEN a tab that was not recently killed WHEN it reloads THEN telemetry is NOT sent`() =
        runTest {
            val tabId = "test-tab-id"

            store.dispatch(
                TabListAction.AddTabAction(createTab(id = tabId, url = "https://firefox.com")),
            ).joinBlocking()

            store.dispatch(
                EngineAction.CreateEngineSessionAction(tabId),
            ).joinBlocking()

            ShadowLooper.idleMainLooper()

            val recordedEvents = EngineMetrics.reloaded.testGetValue()
            assertTrue(recordedEvents.isNullOrEmpty())
        }

    @Test
    fun `GIVEN a tab that is killed multiple times WHEN checking recentlyKilledTabs THEN it only appears once`() =
        runTest {
            val tabId = "test-tab-id"

            store.dispatch(EngineAction.KillEngineSessionAction(tabId)).joinBlocking()
            store.dispatch(EngineAction.KillEngineSessionAction(tabId)).joinBlocking()

            assertEquals(1, store.state.recentlyKilledTabs.count { it == tabId })
        }

    @Test
    fun `GIVEN more than 50 tabs are killed WHEN checking recentlyKilledTabs THEN it does not exceed 50`() =
        runTest {
            repeat(51) { i ->
                val tab = createTab("https://www.mozilla.org")
                store.dispatch(TabListAction.AddTabAction(tab))
                store.dispatch(EngineAction.KillEngineSessionAction(tab.id)).joinBlocking()
            }

            assertEquals(50, store.state.recentlyKilledTabs.size)
        }

    @Test
    fun `GIVEN 50 killed tabs WHEN another killed tab is reloaded THEN oldest tab is removed and reloaded tab is recorded`() =
        runTest {
            val oldestTabId = "tab-id-0"
            val newTabId = "new-tab-id"

            // Fill recentlyKilledTabs with 50 entries and verify max limit is reached
            repeat(50) { i ->
                val tabId = "tab-id-$i"
                store.dispatch(
                    TabListAction.AddTabAction(
                        createTab(
                            id = tabId,
                            url = "https://example.com/$i",
                        ),
                    ),
                ).joinBlocking()
                store.dispatch(EngineAction.KillEngineSessionAction(tabId)).joinBlocking()
            }
            assertTrue(store.state.recentlyKilledTabs.contains(oldestTabId))
            assertEquals(50, store.state.recentlyKilledTabs.size)

            // Kill one more tab and verify oldest tab is removed
            store.dispatch(
                TabListAction.AddTabAction(
                    createTab(
                        id = newTabId,
                        url = "https://example.com/$newTabId",
                    ),
                ),
            ).joinBlocking()
            store.dispatch(EngineAction.KillEngineSessionAction(newTabId)).joinBlocking()
            assertFalse(store.state.recentlyKilledTabs.contains(oldestTabId))
            assertTrue(store.state.recentlyKilledTabs.contains(newTabId))
            assertEquals(50, store.state.recentlyKilledTabs.size)

            // Verify the reload of the newest tab was recorded
            val recordedEventsBefore = EngineMetrics.reloaded.testGetValue()?.size ?: 0
            store.dispatch(EngineAction.CreateEngineSessionAction(newTabId)).joinBlocking()
            ShadowLooper.idleMainLooper()
            val recordedEventsAfter = EngineMetrics.reloaded.testGetValue()
            assertNotNull(recordedEventsAfter)
            assertEquals(recordedEventsBefore + 1, recordedEventsAfter!!.size)
        }

    @Test
    fun `WHEN uri loaded to engine THEN matching event is sent to metrics`() = runTest {
        store.dispatch(EngineAction.LoadUrlAction("", "")).joinBlocking()

        verify { metrics.track(Event.GrowthData.FirstUriLoadForDay) }
    }

    @Test
    fun `WHEN EnabledAction is dispatched THEN enable the process spawning`() = runTest {
        assertNull(Addons.extensionsProcessUiRetry.testGetValue())
        assertNull(Addons.extensionsProcessUiDisable.testGetValue())

        store.dispatch(ExtensionsProcessAction.EnabledAction).joinBlocking()

        assertEquals(1, Addons.extensionsProcessUiRetry.testGetValue())
        assertNull(Addons.extensionsProcessUiDisable.testGetValue())
    }

    @Test
    fun `WHEN DisabledAction is dispatched THEN disable the process spawning`() = runTest {
        assertNull(Addons.extensionsProcessUiRetry.testGetValue())
        assertNull(Addons.extensionsProcessUiDisable.testGetValue())

        store.dispatch(ExtensionsProcessAction.DisabledAction).joinBlocking()

        assertEquals(1, Addons.extensionsProcessUiDisable.testGetValue())
        assertNull(Addons.extensionsProcessUiRetry.testGetValue())
    }

    @Test
    fun `WHEN TranslateAction is dispatched THEN update telemetry`() = runTest {
        assertNull(Translations.translateRequested.testGetValue())

        store.dispatch(
            TranslationsAction.TranslateAction(
                tabId = "1",
                fromLanguage = "en",
                toLanguage = "es",
                options = null,
            ),
        ).joinBlocking()

        val telemetry = Translations.translateRequested.testGetValue()?.firstOrNull()
        assertEquals("es", telemetry?.extra?.get("to_language"))
        assertEquals("en", telemetry?.extra?.get("from_language"))
    }

    @Test
    fun `WHEN TranslateSuccessAction is dispatched THEN update telemetry`() = runTest {
        assertNull(Translations.translateSuccess.testGetValue())

        // Shouldn't record other operations
        store.dispatch(
            TranslationsAction.TranslateSuccessAction(
                tabId = "1",
                operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
            ),
        ).joinBlocking()
        assertNull(Translations.translateSuccess.testGetValue())

        // Should record translate operations
        store.dispatch(
            TranslationsAction.TranslateSuccessAction(
                tabId = "1",
                operation = TranslationOperation.TRANSLATE,
            ),
        ).joinBlocking()

        val telemetry = Translations.translateSuccess.testGetValue()?.firstOrNull()
        assertNotNull(telemetry)
    }

    @Test
    fun `WHEN TranslateExceptionAction for Translate operation is dispatched THEN update telemetry`() =
        runTest {
            assertNull(Translations.translateFailed.testGetValue())

            // Shouldn't record other operations
            store.dispatch(
                TranslationsAction.TranslateExceptionAction(
                    tabId = "1",
                    operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
                    translationError = TranslationError.UnknownError(IllegalStateException()),
                ),
            ).joinBlocking()
            assertNull(Translations.translateFailed.testGetValue())

            // Should record translate operations
            store.dispatch(
                TranslationsAction.TranslateExceptionAction(
                    tabId = "1",
                    operation = TranslationOperation.TRANSLATE,
                    translationError = TranslationError.CouldNotTranslateError(null),
                ),
            ).joinBlocking()

            val telemetry = Translations.translateFailed.testGetValue()?.firstOrNull()
            assertEquals(
                TranslationError.CouldNotTranslateError(cause = null).errorName,
                telemetry?.extra?.get("error"),
            )
        }

    @Test
    fun `WHEN SetEngineSupportedAction is dispatched AND unsupported THEN update telemetry`() =
        runTest {
            assertNull(Translations.engineUnsupported.testGetValue())

            store.dispatch(
                TranslationsAction.SetEngineSupportedAction(
                    isEngineSupported = false,
                ),
            ).joinBlocking()

            assertNotNull(Translations.engineUnsupported.testGetValue())
        }
}

internal class FakeClock : Clock.Delegate {
    var elapsedTime: Long = 0
    override fun elapsedRealtime(): Long = elapsedTime
}
