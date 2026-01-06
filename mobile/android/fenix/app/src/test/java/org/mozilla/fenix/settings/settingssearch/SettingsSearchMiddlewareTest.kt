/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation.NavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsSearchMiddlewareTest {

    @get:Rule
    val coroutineRule = MainCoroutineRule()

    private val navController: NavController = mockk(relaxed = true)
    private lateinit var lifecycleOwner: FakeLifecycleOwner
    private lateinit var fragment: Fragment
    private val recentSearchesRepository: FenixRecentSettingsSearchesRepository = mockk(relaxed = true)
    private val recentSearchesFlow = MutableStateFlow<List<SettingsSearchItem>>(emptyList())

    @Before
    fun setUp() {
        every { recentSearchesRepository.recentSearches } returns recentSearchesFlow
        lifecycleOwner = FakeLifecycleOwner(Lifecycle.State.RESUMED)
        fragment = spyk(Fragment()).apply {
            every { context } returns testContext
        }
        every { fragment.viewLifecycleOwner } returns lifecycleOwner
    }

    private fun buildMiddleware(
        fenixSettingsIndexer: SettingsIndexer = TestSettingsIndexer(),
        navController: NavController = this.navController,
        recentSettingsSearchesRepository: RecentSettingsSearchesRepository = this.recentSearchesRepository,
        scope: CoroutineScope = coroutineRule.scope,
        dispatcher: CoroutineDispatcher = coroutineRule.testDispatcher,
    ) = SettingsSearchMiddleware(
        fenixSettingsIndexer = fenixSettingsIndexer,
        navController = navController,
        recentSettingsSearchesRepository = recentSettingsSearchesRepository,
        scope = scope,
        dispatcher = dispatcher,
    )

    @Test
    fun `WHEN the settings search query is updated and results are not found THEN the state is updated`() {
        val middleware = buildMiddleware(EmptyTestSettingsIndexer())
        val query = "longSample"
        val store = SettingsSearchStore(middleware = listOf(middleware))
        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        assert(store.state is SettingsSearchState.NoSearchResults)
        assert(store.state.searchQuery == query)
        assert(store.state.searchResults.isEmpty())
    }

    @Test
    fun `WHEN the settings search query is updated and results are found THEN the state is updated`() {
        val middleware = buildMiddleware()
        val query = "a"
        val store = SettingsSearchStore(middleware = listOf(middleware))
        store.dispatch(SettingsSearchAction.Init)
        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        assert(store.state is SettingsSearchState.SearchInProgress)
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `WHEN a result item is clicked THEN it should be added to the recent searches repository`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        val testItem = testList.first()

        store.dispatch(SettingsSearchAction.Init)

        store.dispatch(SettingsSearchAction.ResultItemClicked(testItem))

        coVerify { recentSearchesRepository.addRecentSearchItem(testItem) }
        verify { navController.navigate(testItem.preferenceFileInformation.fragmentId, any()) }
    }

    @Test
    fun `WHEN RecentSearchesUpdated is dispatched THEN store state is updated correctly`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        val updatedRecents = listOf(testList.first())

        store.dispatch(SettingsSearchAction.RecentSearchesUpdated(updatedRecents))

        assert(store.state.recentSearches == updatedRecents)
    }

    @Test
    fun `WHEN ClearRecentSearchesClicked is dispatched THEN store state is updated correctly`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))

        store.dispatch(SettingsSearchAction.ClearRecentSearchesClicked)

        assert(store.state.recentSearches.isEmpty())
    }

    @After
    fun tearDown() = runTest {
        lifecycleOwner.destroy()
    }
}

val testList = listOf(
    SettingsSearchItem(
        title = "Search Engine",
        summary = "Set your preferred search engine for browsing.",
        preferenceKey = "search_engine_main",
        categoryHeader = "General",
        preferenceFileInformation = PreferenceFileInformation.SearchSettingsPreferences,
    ),
    SettingsSearchItem(
        title = "Advanced Settings",
        summary = "", // Empty or blank summary
        preferenceKey = "advanced_stuff",
        categoryHeader = "Advanced",
        preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
    ),
    SettingsSearchItem(
        title = "Do not collect usage data",
        summary = "", // Empty or blank summary
        preferenceKey = "do_not_collect_data",
        categoryHeader = "Privacy",
        preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
    ),
)

class TestSettingsIndexer : SettingsIndexer {

    override fun indexAllSettings() {
        // no op
    }

    override suspend fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        return testList
    }
}

class EmptyTestSettingsIndexer : SettingsIndexer {
    override fun indexAllSettings() {
        // no op
    }

    override suspend fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        return emptyList()
    }
}

private class FakeLifecycleOwner(initialState: Lifecycle.State) : LifecycleOwner {
    private val registry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle = registry

    init {
        registry.currentState = initialState
    }

    fun destroy() {
        registry.currentState = Lifecycle.State.DESTROYED
    }
}
