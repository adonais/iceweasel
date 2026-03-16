/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search.toolbar

import android.graphics.Bitmap
import android.graphics.Bitmap.Config.ARGB_8888
import android.graphics.Color
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.core.graphics.applyCanvas
import androidx.core.graphics.createBitmap
import com.google.android.material.card.MaterialCardView
import io.mockk.MockKAnnotations
import io.mockk.every
import io.mockk.impl.annotations.RelaxedMockK
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.search.SearchEngine.Type.BUNDLED
import mozilla.components.concept.menu.Orientation
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Toolbar
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.search.SearchDialogFragmentStore
import org.mozilla.fenix.search.SearchFragmentAction.SearchDefaultEngineSelected
import org.mozilla.fenix.search.SearchFragmentAction.SearchHistoryEngineSelected
import org.mozilla.fenix.search.fixtures.EMPTY_SEARCH_FRAGMENT_STATE
import org.mozilla.fenix.telemetry.ACTION_SEARCH_ENGINE_SELECTOR_CLICKED
import org.mozilla.fenix.telemetry.SOURCE_ADDRESS_BAR
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class SearchSelectorToolbarActionTest {

    private lateinit var store: SearchDialogFragmentStore

    @RelaxedMockK
    private lateinit var menu: SearchSelectorMenu

    @RelaxedMockK
    private lateinit var settings: Settings

    @get:Rule
    val gleanTestRule = FenixGleanTestRule(testContext)

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        MockKAnnotations.init(this)
        store = SearchDialogFragmentStore(testSearchFragmentState)

        every { testContext.settings() } returns settings
    }

    @Test
    fun `WHEN search selector toolbar action is clicked THEN the search selector menu is shown`() = runTest(testDispatcher) {
        val action = spyk(
            SearchSelectorToolbarAction(
                store = store,
                defaultSearchEngine = null,
                menu = menu,
                mainDispatcher = testDispatcher,
            ),
        )
        val view = action.createView(LinearLayout(testContext) as ViewGroup) as SearchSelector
        val selectorIcon = view.findViewById<MaterialCardView>(R.id.search_selector)
        assertNull(Toolbar.buttonTapped.testGetValue())

        every { settings.shouldUseBottomToolbar } returns false
        view.performClick()

        assertTelemetryRecorded(ACTION_SEARCH_ENGINE_SELECTOR_CLICKED)
        verify {
            menu.menuController.show(anchor = selectorIcon, Orientation.DOWN)
        }

        every { settings.shouldUseBottomToolbar } returns true
        view.performClick()

        assertTelemetryRecorded(ACTION_SEARCH_ENGINE_SELECTOR_CLICKED)
        verify {
            menu.menuController.show(anchor = selectorIcon, Orientation.UP)
        }
    }

    @Test
    fun `GIVEN a binded search selector View WHEN a search engine is selected THEN update the icon`() = runTest(testDispatcher) {
        val selector = SearchSelectorToolbarAction(store, mockk(), mockk(), testDispatcher)
        val view = spyk(SearchSelector(testContext))

        selector.bind(view)
        testDispatcher.scheduler.advanceUntilIdle()

        store.dispatch(
            SearchDefaultEngineSelected(
                engine = testSearchEngine,
                browsingMode = BrowsingMode.Normal,
                settings = mockk(relaxed = true),
            ),
        )
        testDispatcher.scheduler.advanceUntilIdle()

        verify {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    testSearchEngine.name,
                ),
            )
        }
    }

    @Test
    fun `GIVEN the same view is binded multiple times WHEN the search engine changes THEN update the icon only once`() = runTest(testDispatcher) {
        // This scenario with the same View binded multiple times can happen after a "invalidateActions" call.
        val selector = SearchSelectorToolbarAction(store, mockk(), mockk(), testDispatcher)
        val view = spyk(SearchSelector(testContext))

        selector.bind(view)
        testDispatcher.scheduler.advanceUntilIdle()

        selector.bind(view)
        testDispatcher.scheduler.advanceUntilIdle()

        selector.bind(view)
        testDispatcher.scheduler.advanceUntilIdle()

        store.dispatch(
            SearchDefaultEngineSelected(
                engine = testSearchEngine,
                browsingMode = BrowsingMode.Private,
                settings = mockk(relaxed = true),
            ),
        )
        testDispatcher.scheduler.advanceUntilIdle()

        verify(exactly = 1) {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    testSearchEngine.name,
                ),
            )
        }
    }

    @Test
    fun `GIVEN a binded search selector View WHEN a search engine is selected THEN update the icon only if a different search engine is selected`() = runTest(testDispatcher) {
        val selector = SearchSelectorToolbarAction(store, mockk(), mockk(), testDispatcher)
        val view = spyk(SearchSelector(testContext))

        // Test an initial change
        selector.bind(view)
        testDispatcher.scheduler.advanceUntilIdle()

        store.dispatch(
            SearchDefaultEngineSelected(
                engine = testSearchEngine,
                browsingMode = BrowsingMode.Normal,
                settings = mockk(relaxed = true),
            ),
        )
        testDispatcher.scheduler.advanceUntilIdle()

        verify(exactly = 1) {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    testSearchEngine.name,
                ),
            )
        }

        // Test the same search engine being selected
        store.dispatch(
            SearchDefaultEngineSelected(
                engine = testSearchEngine,
                browsingMode = BrowsingMode.Private,
                settings = mockk(relaxed = true),
            ),
        )
        verify(exactly = 1) {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    testSearchEngine.name,
                ),
            )
        }

        // Test another search engine being selected
        val newSearchEngine = testSearchEngine.copy(
            name = "NewSearchEngine",
        )
        store.dispatch(
            SearchHistoryEngineSelected(
                engine = newSearchEngine,
            ),
        )
        testDispatcher.scheduler.advanceUntilIdle()

        verify(exactly = 1) {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    testSearchEngine.name,
                ),
            )
        }
        verify(exactly = 1) {
            view.setIcon(
                icon = any(),
                contentDescription = testContext.getString(
                    R.string.search_engine_selector_content_description,
                    newSearchEngine.name,
                ),
            )
        }
    }

    @Test
    fun `GIVEN a search engine WHEN asking for a scaled icon THEN return a drawable with a fixed size`() = runTest(testDispatcher) {
        val originalIcon = createBitmap(100, 100, ARGB_8888).applyCanvas {
            drawColor(Color.RED)
        }
        val expectedScaledIcon = createBitmap(
            testContext.resources.getDimensionPixelSize(R.dimen.preference_icon_drawable_size),
            testContext.resources.getDimensionPixelSize(R.dimen.preference_icon_drawable_size),
            ARGB_8888,
        ).applyCanvas {
            drawColor(Color.RED)
        }
        val searchEngine = testSearchEngine.copy(
            icon = originalIcon,
        )

        val result = searchEngine.getScaledIcon(testContext)

        // Check dimensions, config and pixel data
        assertTrue(expectedScaledIcon.sameAs(result.bitmap))
    }

    private fun assertTelemetryRecorded(
        item: String,
    ) {
        assertNotNull(Toolbar.buttonTapped.testGetValue())
        val snapshot = Toolbar.buttonTapped.testGetValue()!!
        val last = snapshot.last()
        val expectedSource = SOURCE_ADDRESS_BAR
        assertEquals(item, last.extra?.getValue("item"))
        assertEquals(expectedSource, last.extra?.getValue("source"))
    }
}

private val testSearchFragmentState = EMPTY_SEARCH_FRAGMENT_STATE.copy(
    query = "https://example.com",
    url = "https://example.com",
    searchTerms = "search terms",
    showSearchTermHistory = true,
    showHistorySuggestionsForCurrentEngine = true,
    showAllSessionSuggestions = true,
    showSponsoredSuggestions = true,
    showNonSponsoredSuggestions = true,
    showQrButton = true,
    tabId = "tabId",
    pastedText = "",
    searchAccessPoint = MetricsUtils.Source.SHORTCUT,
)

private val testSearchEngine = SearchEngine(
    id = UUID.randomUUID().toString(),
    name = "testSearchEngine",
    icon = Bitmap.createBitmap(10, 10, ARGB_8888),
    type = BUNDLED,
    resultUrls = listOf(
        "https://www.startpage.com/sp/search?q={searchTerms}",
    ),
)
