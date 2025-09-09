/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search

import android.os.Handler
import android.os.Looper
import androidx.lifecycle.Lifecycle.State.RESUMED
import androidx.lifecycle.LifecycleOwner
import androidx.navigation.NavController
import androidx.navigation.NavDirections
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.android.asCoroutineDispatcher
import kotlinx.coroutines.test.setMain
import mozilla.components.browser.state.action.AwesomeBarAction.EngagementFinished
import mozilla.components.browser.state.action.SearchAction.ApplicationSearchEnginesLoaded
import mozilla.components.browser.state.search.RegionState
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.state.SearchState
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButton
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchAborted
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.CommitUrl
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToggleEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.concept.toolbar.AutocompleteProvider
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.telemetry.glean.testing.GleanTestRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.UnifiedSearch
import org.mozilla.fenix.GleanMetrics.VoiceSearch
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.browser.browsingmode.BrowsingMode.Normal
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.QrScannerAction.QrScannerRequested
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.appstate.VoiceSearchAction.VoiceInputRequested
import org.mozilla.fenix.components.appstate.search.SelectedSearchEngine
import org.mozilla.fenix.components.search.BOOKMARKS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.HISTORY_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.TABS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.toolbar.BrowserToolbarEnvironment
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.mozilla.fenix.helpers.lifecycle.TestLifecycleOwner
import org.mozilla.fenix.search.EditPageEndActionsInteractions.ClearSearchClicked
import org.mozilla.fenix.search.EditPageEndActionsInteractions.QrScannerClicked
import org.mozilla.fenix.search.EditPageEndActionsInteractions.VoiceSearchButtonClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSelectorClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSelectorItemClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSettingsItemClicked
import org.mozilla.fenix.search.ext.searchEngineShortcuts
import org.mozilla.fenix.search.fixtures.assertSearchSelectorEquals
import org.mozilla.fenix.search.fixtures.buildExpectedSearchSelector
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.components.appstate.search.SearchState as AppSearchState

@RunWith(RobolectricTestRunner::class)
class BrowserToolbarSearchMiddlewareTest {
    @get:Rule
    val gleanTestRule = GleanTestRule(testContext)

    val appStore = AppStore()
    val browserStore: BrowserStore = mockk(relaxed = true) {
        every { state.search } returns fakeSearchState()
    }
    val components: Components = mockk()
    val settings: Settings = mockk(relaxed = true)
    val lifecycleOwner: LifecycleOwner = TestLifecycleOwner(RESUMED)
    val navController: NavController = mockk {
        every { navigate(any<NavDirections>()) } just Runs
        every { navigate(any<Int>()) } just Runs
    }
    val browsingModeManager: BrowsingModeManager = mockk()

    @Test
    fun `GIVEN an environment was already set WHEN it is cleared THEN reset it to null`() {
        val (middleware, store) = buildMiddlewareAndAddToStore()

        assertNotNull(middleware.environment)

        store.dispatch(EnvironmentCleared)

        assertNull(middleware.environment)
        assertEquals(emptyList<AutocompleteProvider>(), store.state.editState.autocompleteProviders)
    }

    @Test
    fun `WHEN the toolbar enters in edit mode THEN a new search selector button is added`() {
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))

        assertSearchSelectorEquals(
            expectedSearchSelector(),
            store.state.editState.editActionsStart[0] as SearchSelectorAction,
        )
    }

    @Test
    fun `WHEN the toolbar enters in edit mode with non-blank query THEN a clear button is shown`() {
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))
        store.dispatch(SearchQueryUpdated("test"))

        assertEquals(
            expectedClearButton,
            store.state.editState.editActionsEnd.last() as ActionButtonRes,
        )
    }

    @Test
    fun `WHEN the toolbar enters in edit mode with blank query THEN a qr scanner button is shown`() {
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))
        store.dispatch(SearchQueryUpdated(""))

        assertEquals(
            expectedQrButton,
            store.state.editState.editActionsEnd.last() as ActionButtonRes,
        )
    }

    @Test
    fun `WHEN the toolbar enters in edit mode with blank query AND user starts typing THEN qr button is replaced by clear button`() {
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))
        store.dispatch(SearchQueryUpdated(""))

        assertEquals(
            expectedQrButton,
            store.state.editState.editActionsEnd.last() as ActionButtonRes,
        )

        store.dispatch(SearchQueryUpdated("a"))

        assertEquals(
            expectedClearButton,
            store.state.editState.editActionsEnd.last() as ActionButtonRes,
        )
    }

    @Test
    fun `WHEN the toolbar enters in edit mode with non-blank query AND the clear button is clicked THEN text is cleared and telemetry is recorded`() {
        val (_, store) = buildMiddlewareAndAddToStore()
        store.dispatch(SearchQueryUpdated("test"))
        store.dispatch(ToggleEditMode(true))

        val clearButton = store.state.editState.editActionsEnd.last() as ActionButtonRes
        assertEquals(expectedClearButton, clearButton)

        store.dispatch(clearButton.onClick as BrowserToolbarEvent)
        assertEquals(store.state.editState.query, "")
        assertNotNull(Events.browserToolbarInputCleared.testGetValue())
    }

    @Test
    fun `GIVEN a custom search engine WHEN the qr button is clicked THEN start qr recognition and record telemetry`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state.searchState.selectedSearchEngine?.searchEngine } returns
                fakeSearchState().customSearchEngines.first()
        }
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)
        store.dispatch(ToggleEditMode(true))

        val qrButton = store.state.editState.editActionsEnd.last() as ActionButtonRes
        assertEquals(expectedQrButton, qrButton)

        store.dispatch(qrButton.onClick as BrowserToolbarEvent)
        assertNotNull(Events.browserToolbarQrScanTapped.testGetValue())
        verify { appStore.dispatch(QrScannerRequested) }
    }

    @Test
    fun `WHEN the voice search button is clicked THEN start voice recognition and record telemetry`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state.searchState.selectedSearchEngine } returns mockk(relaxed = true)
        }
        every { settings.shouldShowVoiceSearch } returns true
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        val store = buildStore(middleware)
        store.dispatch(ToggleEditMode(true))

        val voiceSearchButton = store.state.editState.editActionsEnd.last() as ActionButtonRes
        assertEquals(expectedVoiceSearchButton, voiceSearchButton)

        store.dispatch(voiceSearchButton.onClick as BrowserToolbarEvent)
        assertNotNull(VoiceSearch.tapped.testGetValue())
        verify { appStore.dispatch(VoiceInputRequested) }
    }

    @Test
    fun `WHEN the search selector button is clicked THEN record a telemetry event`() {
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(SearchSelectorClicked)

        assertNotNull(UnifiedSearch.searchMenuTapped.testGetValue())
    }

    @Test
    fun `GIVEN the search selector menu is open WHEN the search settings button is clicked THEN exit edit mode and open search settings`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)
        appStore.dispatch(SearchStarted())
        store.dispatch(ToggleEditMode(true))
        store.dispatch(SearchQueryUpdated("test"))
        assertTrue(store.state.isEditMode())
        assertTrue(appStore.state.searchState.isSearchActive)
        assertEquals("test", store.state.editState.query)

        store.dispatch(SearchSettingsItemClicked)

        assertFalse(appStore.state.searchState.isSearchActive)
        assertEquals("", store.state.editState.query)
        captorMiddleware.assertLastAction(SearchEnded::class) {}
        verify { browserStore.dispatch(EngagementFinished(abandoned = true)) }
        verify {
            navController.navigate(
                BrowserFragmentDirections.actionGlobalSearchEngineFragment(),
            )
        }
    }

    @Test
    fun `GIVEN the search selector menu is open WHEN a menu item is clicked THEN update the selected search engine and rebuild the menu`() {
        val (_, store) = buildMiddlewareAndAddToStore()
        val newEngineSelection = fakeSearchState().searchEngineShortcuts.last()
        store.dispatch(ToggleEditMode(true))
        assertSearchSelectorEquals(
            expectedSearchSelector(),
            store.state.editState.editActionsStart[0] as SearchSelectorAction,
        )

        store.dispatch(SearchSelectorItemClicked(newEngineSelection))

        assertSearchSelectorEquals(
            expectedSearchSelector(newEngineSelection),
            store.state.editState.editActionsStart[0] as SearchSelectorAction,
        )
    }

    @Test
    fun `GIVEN the search selector menu is open while in display mode WHEN a menu item is clicked THEN enter edit mode`() {
        val (_, store) = buildMiddlewareAndAddToStore()
        val newEngineSelection = fakeSearchState().searchEngineShortcuts.last()
        store.dispatch(ToggleEditMode(false))
        assertFalse(store.state.isEditMode())

        store.dispatch(SearchSelectorItemClicked(newEngineSelection))

        assertTrue(appStore.state.searchState.isSearchActive)
    }

    @Test
    fun `GIVEN default engine selected WHEN entering in edit mode THEN set autocomplete providers and page end buttons`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns true
        every { settings.shouldShowBookmarkSuggestions } returns true
        every { settings.shouldShowVoiceSearch } returns true
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        configureAutocompleteProvidersInComponents()
        val store = buildStore(middleware)

        store.dispatch(ToggleEditMode(true))

        assertEquals(
            listOf(
                components.core.historyStorage,
                components.core.bookmarksStorage,
                components.core.domainsAutocompleteProvider,
            ),
            store.state.editState.autocompleteProviders,
        )
        assertEquals(2, store.state.editState.editActionsEnd.size)
        assertEquals(expectedVoiceSearchButton, store.state.editState.editActionsEnd.first())
        assertEquals(expectedQrButton, store.state.editState.editActionsEnd.last())
    }

    @Test
    fun `GIVEN default engine selected and history suggestions disabled WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns false
        every { settings.shouldShowBookmarkSuggestions } returns true
        configureAutocompleteProvidersInComponents()
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))

        assertEquals(
            listOf(
                components.core.bookmarksStorage,
                components.core.domainsAutocompleteProvider,
            ),
            store.state.editState.autocompleteProviders,
        )
    }

    @Test
    fun `GIVEN default engine selected and bookmarks suggestions disabled WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns true
        every { settings.shouldShowBookmarkSuggestions } returns false
        configureAutocompleteProvidersInComponents()
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))

        assertEquals(
            listOf(
                components.core.historyStorage,
                components.core.domainsAutocompleteProvider,
            ),
            store.state.editState.autocompleteProviders,
        )
    }

    @Test
    fun `GIVEN default engine selected and history + bookmarks suggestions disabled WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns false
        every { settings.shouldShowBookmarkSuggestions } returns false
        configureAutocompleteProvidersInComponents()
        val (_, store) = buildMiddlewareAndAddToStore()

        store.dispatch(ToggleEditMode(true))

        assertEquals(
            listOf(components.core.domainsAutocompleteProvider),
            store.state.editState.autocompleteProviders,
        )
    }

    @Test
    fun `GIVEN tabs engine selected WHEN entering in edit mode THEN set autocomplete providers and page end buttons`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns true
        every { settings.shouldShowBookmarkSuggestions } returns true
        every { settings.shouldShowVoiceSearch } returns true
        val appStore = AppStore()
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        configureAutocompleteProvidersInComponents()
        val store = buildStore(middleware)

        store.dispatch(
            SearchSelectorItemClicked(
                fakeSearchState().applicationSearchEngines.first { it.id == TABS_SEARCH_ENGINE_ID },
            ),
        ).joinBlocking()

        assertEquals(
            listOf(
                components.core.sessionAutocompleteProvider,
                components.backgroundServices.syncedTabsAutocompleteProvider,
            ),
            store.state.editState.autocompleteProviders,
        )
        assertEquals(1, store.state.editState.editActionsEnd.size)
        assertEquals(expectedVoiceSearchButton, store.state.editState.editActionsEnd.first())
    }

    @Test
    fun `GIVEN bookmarks engine selected WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns true
        every { settings.shouldShowBookmarkSuggestions } returns true
        every { settings.shouldShowVoiceSearch } returns true
        val appStore = AppStore()
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        configureAutocompleteProvidersInComponents()
        val store = buildStore(middleware)

        store.dispatch(
            SearchSelectorItemClicked(
                fakeSearchState().applicationSearchEngines.first { it.id == BOOKMARKS_SEARCH_ENGINE_ID },
            ),
        ).joinBlocking()

        assertEquals(
            listOf(components.core.bookmarksStorage),
            store.state.editState.autocompleteProviders,
        )
        assertEquals(1, store.state.editState.editActionsEnd.size)
        assertEquals(expectedVoiceSearchButton, store.state.editState.editActionsEnd.first())
    }

    @Test
    fun `GIVEN history engine selected WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowHistorySuggestions } returns true
        every { settings.shouldShowBookmarkSuggestions } returns true
        every { settings.shouldShowVoiceSearch } returns true
        val appStore = AppStore()
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        configureAutocompleteProvidersInComponents()
        val store = buildStore(middleware)

        store.dispatch(
            SearchSelectorItemClicked(
                fakeSearchState().applicationSearchEngines.first { it.id == HISTORY_SEARCH_ENGINE_ID },
            ),
        ).joinBlocking()

        assertEquals(
            listOf(components.core.historyStorage),
            store.state.editState.autocompleteProviders,
        )
        assertEquals(1, store.state.editState.editActionsEnd.size)
        assertEquals(expectedVoiceSearchButton, store.state.editState.editActionsEnd.first())
    }

    @Test
    fun `GIVEN other search engine selected WHEN entering in edit mode THEN set autocomplete providers`() {
        every { settings.shouldAutocompleteInAwesomebar } returns true
        every { settings.shouldShowVoiceSearch } returns true
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        configureAutocompleteProvidersInComponents()
        val store = buildStore(middleware)

        store.dispatch(SearchSelectorItemClicked(mockk(relaxed = true))).joinBlocking()
        store.dispatch(ToggleEditMode(true))

        assertEquals(
            emptyList<AutocompleteProvider>(),
            store.state.editState.autocompleteProviders,
        )
        assertEquals(1, store.state.editState.editActionsEnd.size)
        assertEquals(expectedVoiceSearchButton, store.state.editState.editActionsEnd.first())
    }

    @Test
    fun `WHEN the search engines are updated in BrowserStore THEN update the search selector and search providers`() {
        Dispatchers.setMain(Handler(Looper.getMainLooper()).asCoroutineDispatcher())

        val browserStore = BrowserStore()
        val (_, store) = buildMiddlewareAndAddToStore(browserStore = browserStore)
        store.dispatch(ToggleEditMode(true))
        val newSearchEngines = fakeSearchState().applicationSearchEngines

        browserStore.dispatch(ApplicationSearchEnginesLoaded(newSearchEngines)).joinBlocking()
        shadowOf(Looper.getMainLooper()).idle() // wait for observing and processing the search engines update

        assertSearchSelectorEquals(
            expectedSearchSelector(newSearchEngines[0], newSearchEngines),
            store.state.editState.editActionsStart[0] as SearchSelectorAction,
        )
    }

    @Test
    fun `GIVEN a search engine is already selected WHEN the search engines are updated in BrowserStore THEN don't change the selected search engine`() {
        Dispatchers.setMain(Handler(Looper.getMainLooper()).asCoroutineDispatcher())

        val selectedSearchEngine = fakeSearchState().applicationSearchEngines.first().copy(id = "test")
        val appStore = AppStore(
            AppState(
                searchState = AppSearchState.EMPTY.copy(
                    selectedSearchEngine = SelectedSearchEngine(selectedSearchEngine, true),
                ),
            ),
        )
        val browserStore = BrowserStore()
        val (_, store) = buildMiddlewareAndAddToStore(appStore, browserStore)
        store.dispatch(ToggleEditMode(true))
        val newSearchEngines = fakeSearchState().applicationSearchEngines

        browserStore.dispatch(ApplicationSearchEnginesLoaded(newSearchEngines)).joinBlocking()
        shadowOf(Looper.getMainLooper()).idle() // wait for observing and processing the search engines update

        assertSearchSelectorEquals(
            expectedSearchSelector(selectedSearchEngine, newSearchEngines),
            store.state.editState.editActionsStart[0] as SearchSelectorAction,
        )
    }

    @Test
    @Config(sdk = [33])
    fun `GIVEN on Android 33+ WHEN the search is aborted THEN don't exit search mode`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state.searchState } returns AppSearchState.EMPTY
        }
        val browserStore: BrowserStore = mockk(relaxed = true)
        val (_, store) = buildMiddlewareAndAddToStore(appStore, browserStore)

        store.dispatch(SearchAborted)

        verify(exactly = 0) { appStore.dispatch(SearchEnded) }
        verify(exactly = 0) { browserStore.dispatch(EngagementFinished(abandoned = true)) }
    }

    @Test
    @Config(sdk = [32])
    fun `GIVEN on Android 32- WHEN the search is aborted THEN sync this in application and browser state`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state.searchState } returns AppSearchState.EMPTY
        }
        val browserStore: BrowserStore = mockk(relaxed = true)
        val (_, store) = buildMiddlewareAndAddToStore(appStore, browserStore)

        store.dispatch(SearchAborted)

        verify { appStore.dispatch(SearchEnded) }
        verify { browserStore.dispatch(EngagementFinished(abandoned = true)) }
    }

    @Test
    @Config(sdk = [32])
    fun `GIVEN on Android 32- and search was started from a tab WHEN the search is aborted THEN sync this data and navigate back to the tab that started search`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state.searchState } returns AppSearchState.EMPTY.copy(
                sourceTabId = "test",
            )
        }
        val browserStore: BrowserStore = mockk(relaxed = true)
        val (_, store) = buildMiddlewareAndAddToStore(appStore, browserStore)

        store.dispatch(SearchAborted)

        verify { appStore.dispatch(SearchEnded) }
        verify { browserStore.dispatch(EngagementFinished(abandoned = true)) }
        verify { navController.navigate(R.id.browserFragment) }
    }

    @Test
    fun `WHEN the search engine is added by the application THEN do not load URL`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val browserStore: BrowserStore = mockk(relaxed = true) {
            every { state.search } returns fakeSearchState().copy(
                userSelectedSearchEngineId = TABS_SEARCH_ENGINE_ID,
            )
        }
        val browserUseCases: FenixBrowserUseCases = mockk(relaxed = true)
        val components: Components = mockk(relaxed = true) {
            every { useCases.fenixBrowserUseCases } returns browserUseCases
        }
        val (_, store) = buildMiddlewareAndAddToStore(
            appStore = appStore,
            browserStore = browserStore,
            components = components,
        )

        store.dispatch(CommitUrl("test"))

        verify(exactly = 0) {
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = any(),
                newTab = any(),
                forceSearch = any(),
                private = any(),
                searchEngine = any(),
            )
        }
        captorMiddleware.assertNotDispatched(SearchEnded::class)
    }

    @Test
    fun `WHEN about crashes is searched THEN navigate to crash list fragment`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)

        store.dispatch(CommitUrl("about:crashes"))

        verify { navController.navigate(NavGraphDirections.actionGlobalCrashListFragment()) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `WHEN about addons is searched THEN navigate to addons management fragment`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)

        store.dispatch(CommitUrl("about:addons"))

        verify { navController.navigate(NavGraphDirections.actionGlobalAddonsManagementFragment()) }
        verify { browserStore.dispatch(EngagementFinished(abandoned = false)) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `WHEN about glean is searched THEN navigate to glean debug tools fragment`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)

        store.dispatch(CommitUrl("about:glean"))

        verify { navController.navigate(NavGraphDirections.actionGlobalGleanDebugToolsFragment()) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `WHEN mozilla manifesto URL is searched THEN navigate to mozilla manifesto page`() {
        val manifestoUrl = SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.MANIFESTO)
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val browserUseCases: FenixBrowserUseCases = mockk(relaxed = true)
        val components: Components = mockk(relaxed = true) {
            every { useCases.fenixBrowserUseCases } returns browserUseCases
        }
        val browsingModeManager: BrowsingModeManager = mockk(relaxed = true) {
            every { mode } returns Normal
        }
        val (_, store) = buildMiddlewareAndAddToStore(
            appStore = appStore,
            components = components,
            browsingModeManager = browsingModeManager,
        )

        assertNull(Events.enteredUrl.testGetValue())

        store.dispatch(CommitUrl("moz://a")).joinBlocking()

        verifyOrder {
            navController.navigate(NavGraphDirections.actionGlobalBrowser())
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = manifestoUrl,
                newTab = true,
                forceSearch = false,
                private = false,
                searchEngine = any(),
            )
        }
        assertNotNull(Events.enteredUrl.testGetValue())
        assertEquals(1, Events.enteredUrl.testGetValue()!!.size)
        assertEquals(
            "false",
            Events.enteredUrl.testGetValue()!!.single().extra?.getValue("autocomplete"),
        )
        verify { browserStore.dispatch(EngagementFinished(abandoned = false)) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `WHEN empty text is searched THEN finish engagement as abandoned`() {
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val (_, store) = buildMiddlewareAndAddToStore(appStore = appStore)

        store.dispatch(CommitUrl(""))

        verify { browserStore.dispatch(EngagementFinished(abandoned = true)) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `GIVEN homepage as a new tab is enabled WHEN url is committed THEN perform search in the existing tab`() {
        val url = "https://www.mozilla.org"
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val browserUseCases: FenixBrowserUseCases = mockk(relaxed = true)
        val components: Components = mockk(relaxed = true) {
            every { useCases.fenixBrowserUseCases } returns browserUseCases
        }
        val settings: Settings = mockk(relaxed = true) {
            every { enableHomepageAsNewTab } returns true
        }
        val browsingModeManager: BrowsingModeManager = mockk(relaxed = true) {
            every { mode } returns Normal
        }
        val (_, store) = buildMiddlewareAndAddToStore(
            appStore = appStore,
            components = components,
            settings = settings,
            browsingModeManager = browsingModeManager,
        )

        assertNull(Events.enteredUrl.testGetValue())

        store.dispatch(CommitUrl(url)).joinBlocking()

        verifyOrder {
            navController.navigate(NavGraphDirections.actionGlobalBrowser())
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = url,
                newTab = false,
                forceSearch = false,
                private = false,
                searchEngine = any(),
            )
        }
        assertNotNull(Events.enteredUrl.testGetValue())
        assertEquals(1, Events.enteredUrl.testGetValue()!!.size)
        assertEquals(
            "false",
            Events.enteredUrl.testGetValue()!!.single().extra?.getValue("autocomplete"),
        )
        verify { browserStore.dispatch(EngagementFinished(abandoned = false)) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `GIVEN homepage as a new tab is enabled WHEN search term is committed THEN perform search in the existing tab`() {
        val searchTerm = "Firefox"
        val captorMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
        val appStore = AppStore(middlewares = listOf(captorMiddleware))
        val browserUseCases: FenixBrowserUseCases = mockk(relaxed = true)
        val components: Components = mockk(relaxed = true) {
            every { useCases.fenixBrowserUseCases } returns browserUseCases
        }
        val settings: Settings = mockk(relaxed = true) {
            every { enableHomepageAsNewTab } returns true
        }
        val browsingModeManager: BrowsingModeManager = mockk(relaxed = true) {
            every { mode } returns Normal
        }
        val (_, store) = buildMiddlewareAndAddToStore(
            appStore = appStore,
            components = components,
            settings = settings,
            browsingModeManager = browsingModeManager,
        )

        store.dispatch(CommitUrl(searchTerm))

        verifyOrder {
            navController.navigate(NavGraphDirections.actionGlobalBrowser())
            browserUseCases.loadUrlOrSearch(
                searchTermOrURL = searchTerm,
                newTab = false,
                forceSearch = false,
                private = false,
                searchEngine = any(),
            )
        }
        verify { browserStore.dispatch(EngagementFinished(abandoned = false)) }
        captorMiddleware.assertLastAction(SearchEnded::class) {}
    }

    @Test
    fun `GIVEN the toolbar is in edit mode WHEN updateSearchActionsEnd is triggered via ToggleEditMode THEN a voice search action button is added to the end actions`() {
        every { settings.shouldShowVoiceSearch } returns true
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        val store = buildStore(middleware)
        store.dispatch(ToggleEditMode(true))

        store.dispatch(ToggleEditMode(true))

        val actions = store.state.editState.editActionsEnd
        assertEquals(2, actions.size)
        val voiceAction = actions.first() as ActionButtonRes
        assertEquals(expectedVoiceSearchButton, voiceAction)
    }

    @Test
    fun `GIVEN the toolbar is in edit mode but speech recognition is not available THEN don't show a voice search action button`() {
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns false
        val store = buildStore(middleware)
        store.dispatch(ToggleEditMode(true))
        store.dispatch(SearchQueryUpdated(""))
        store.dispatch(ToggleEditMode(true))

        val actions = store.state.editState.editActionsEnd
        assertTrue(actions.size == 1)
        assertEquals(expectedQrButton, actions.last())
    }

    @Test
    fun `WHEN the voice action is tapped THEN add a new voice input request to the AppStore`() {
        val appStore: AppStore = mockk(relaxed = true) {
            every { state } returns mockk(relaxed = true)
        }
        every { settings.shouldShowVoiceSearch } returns true
        val middleware = spyk(buildMiddleware(appStore = appStore))
        every { middleware.isSpeechRecognitionAvailable() } returns true
        val store = buildStore(middleware)
        store.dispatch(ToggleEditMode(true))
        val voiceAction = store.state.editState.editActionsEnd.first() as ActionButtonRes

        store.dispatch(voiceAction.onClick as BrowserToolbarEvent)

        verify { appStore.dispatch(VoiceInputRequested) }
    }

    private fun expectedSearchSelector(
        defaultOrSelectedSearchEngine: SearchEngine = fakeSearchState().selectedOrDefaultSearchEngine!!,
        searchEngineShortcuts: List<SearchEngine> = fakeSearchState().searchEngineShortcuts,
    ) = buildExpectedSearchSelector(
        defaultOrSelectedSearchEngine,
        searchEngineShortcuts,
        testContext.resources,
    )

    private val expectedClearButton = ActionButtonRes(
        drawableResId = R.drawable.mozac_ic_cross_circle_fill_24,
        contentDescription = R.string.mozac_clear_button_description,
        state = ActionButton.State.DEFAULT,
        onClick = ClearSearchClicked,
    )

    private val expectedQrButton = ActionButtonRes(
        drawableResId = R.drawable.mozac_ic_qr_code_24,
        contentDescription = R.string.mozac_feature_qr_scanner,
        state = ActionButton.State.DEFAULT,
        onClick = QrScannerClicked,
    )

    private val expectedVoiceSearchButton = ActionButtonRes(
        drawableResId = iconsR.drawable.mozac_ic_microphone_24,
        contentDescription = R.string.voice_search_content_description,
        onClick = VoiceSearchButtonClicked,
    )

    private fun buildMiddlewareAndAddToStore(
        appStore: AppStore = this.appStore,
        browserStore: BrowserStore = this.browserStore,
        components: Components = this.components,
        settings: Settings = this.settings,
        lifecycleOwner: LifecycleOwner = this.lifecycleOwner,
        navController: NavController = this.navController,
        browsingModeManager: BrowsingModeManager = this.browsingModeManager,
    ): Pair<BrowserToolbarSearchMiddleware, BrowserToolbarStore> {
        val middleware = buildMiddleware(appStore, browserStore, components, settings)
        val store = buildStore(middleware, lifecycleOwner, navController, browsingModeManager)

        return middleware to store
    }

    private fun buildStore(
        middleware: BrowserToolbarSearchMiddleware = buildMiddleware(),
        lifecycleOwner: LifecycleOwner = this.lifecycleOwner,
        navController: NavController = this.navController,
        browsingModeManager: BrowsingModeManager = this.browsingModeManager,
    ) = BrowserToolbarStore(
            middleware = listOf(middleware),
        ).also {
            it.dispatch(
                EnvironmentRehydrated(
                    BrowserToolbarEnvironment(
                        testContext, lifecycleOwner, navController, browsingModeManager,
                    ),
                ),
            )
        }

    private fun buildMiddleware(
        appStore: AppStore = this.appStore,
        browserStore: BrowserStore = this.browserStore,
        components: Components = this.components,
        settings: Settings = this.settings,
    ) = BrowserToolbarSearchMiddleware(appStore, browserStore, components, settings)

    private fun configureAutocompleteProvidersInComponents() {
        every { components.core.historyStorage } returns mockk()
        every { components.core.bookmarksStorage } returns mockk()
        every { components.core.domainsAutocompleteProvider } returns mockk()
        every { components.core.sessionAutocompleteProvider } returns mockk()
        every { components.backgroundServices.syncedTabsAutocompleteProvider } returns mockk()
    }

    private fun fakeSearchState() = SearchState(
        region = RegionState("US", "US"),
        regionSearchEngines = listOf(
            SearchEngine("engine-a", "Engine A", mock(), type = SearchEngine.Type.BUNDLED),
            SearchEngine("engine-b", "Engine B", mock(), type = SearchEngine.Type.BUNDLED),
        ),
        customSearchEngines = listOf(
            SearchEngine("engine-c", "Engine C", mock(), type = SearchEngine.Type.CUSTOM),
        ),
        applicationSearchEngines = listOf(
            SearchEngine(TABS_SEARCH_ENGINE_ID, "Tabs", mock(), type = SearchEngine.Type.APPLICATION),
            SearchEngine(BOOKMARKS_SEARCH_ENGINE_ID, "Bookmarks", mock(), type = SearchEngine.Type.APPLICATION),
            SearchEngine(HISTORY_SEARCH_ENGINE_ID, "History", mock(), type = SearchEngine.Type.APPLICATION),
        ),
        additionalSearchEngines = listOf(
            SearchEngine("engine-e", "Engine E", mock(), type = SearchEngine.Type.BUNDLED_ADDITIONAL),
        ),
        additionalAvailableSearchEngines = listOf(
            SearchEngine("engine-f", "Engine F", mock(), type = SearchEngine.Type.BUNDLED_ADDITIONAL),
        ),
        hiddenSearchEngines = listOf(
            SearchEngine("engine-g", "Engine G", mock(), type = SearchEngine.Type.BUNDLED),
        ),
        regionDefaultSearchEngineId = null,
        userSelectedSearchEngineId = "engine-c",
        userSelectedSearchEngineName = null,
    )
}
