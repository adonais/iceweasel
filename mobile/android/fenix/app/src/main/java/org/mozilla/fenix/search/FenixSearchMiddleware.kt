/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search

import androidx.annotation.VisibleForTesting
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.coroutineScope
import androidx.navigation.NavController
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.launch
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.search.DefaultSearchEngineProvider
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.ui.BrowserToolbarQuery
import mozilla.components.concept.awesomebar.AwesomeBar
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.EngineSession.LoadUrlFlags
import mozilla.components.feature.search.SearchUseCases.SearchUseCase
import mozilla.components.feature.session.SessionUseCases.LoadUrlUseCase
import mozilla.components.feature.tabs.TabsUseCases.SelectTabUseCase
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store
import mozilla.components.lib.state.ext.flow
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.BookmarksManagement
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.History
import org.mozilla.fenix.GleanMetrics.Toolbar
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.NimbusComponents
import org.mozilla.fenix.components.UseCases
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEngineSelected
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.components.search.BOOKMARKS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.HISTORY_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.TABS_SEARCH_ENGINE_ID
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.navigateSafe
import org.mozilla.fenix.ext.telemetryName
import org.mozilla.fenix.nimbus.FxNimbus
import org.mozilla.fenix.search.SearchFragmentAction.Init
import org.mozilla.fenix.search.SearchFragmentAction.PrivateSuggestionsCardAccepted
import org.mozilla.fenix.search.SearchFragmentAction.SearchEnginesSelectedActions
import org.mozilla.fenix.search.SearchFragmentAction.SearchProvidersUpdated
import org.mozilla.fenix.search.SearchFragmentAction.SearchStarted
import org.mozilla.fenix.search.SearchFragmentAction.SearchSuggestionsVisibilityUpdated
import org.mozilla.fenix.search.SearchFragmentAction.SuggestionClicked
import org.mozilla.fenix.search.SearchFragmentAction.SuggestionSelected
import org.mozilla.fenix.search.SearchFragmentAction.UpdateQuery
import org.mozilla.fenix.search.awesomebar.DefaultSuggestionIconProvider
import org.mozilla.fenix.search.awesomebar.DefaultSuggestionsStringsProvider
import org.mozilla.fenix.search.awesomebar.SearchSuggestionsProvidersBuilder
import org.mozilla.fenix.search.awesomebar.toSearchProviderState
import org.mozilla.fenix.telemetry.ACTION_SEARCH_ENGINE_SELECTED
import org.mozilla.fenix.telemetry.SOURCE_ADDRESS_BAR
import org.mozilla.fenix.utils.Settings
import mozilla.components.lib.state.Action as MVIAction

/**
 * [SearchFragmentStore] [Middleware] that will handle the setup of the search UX and related user interactions.
 *
 * @param fragment [Fragment] in which this middleware is used. Will observe it's lifecycle for cleanup.
 * @param engine [Engine] used for speculative connections to search suggestions URLs.
 * @param useCases [UseCases] helping this integrate with other features of the applications.
 * @param nimbusComponents [NimbusComponents] used for accessing Nimbus events to use in telemetry.
 * @param settings [Settings] application settings.
 * @param appStore [AppStore] to sync search related data with.
 * @param browserStore [BrowserStore] to sync search related data with.
 * @param toolbarStore [BrowserToolbarStore] used for querying and updating the toolbar state.
 * @param navController [NavController] to use for navigating to other in-app destinations.
 * @param browsingModeManager [BrowsingModeManager] used for querying and updating the browsing mode.
 */
@Suppress("LongParameterList")
class FenixSearchMiddleware(
    private val fragment: Fragment,
    private val engine: Engine,
    private val useCases: UseCases,
    private val nimbusComponents: NimbusComponents,
    private val settings: Settings,
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val toolbarStore: BrowserToolbarStore,
    private val navController: NavController,
    private val browsingModeManager: BrowsingModeManager,
) : Middleware<SearchFragmentState, SearchFragmentAction> {
    private var observeSearchEnginesChangeJob: Job? = null

    @VisibleForTesting
    internal var suggestionsProvidersBuilder: SearchSuggestionsProvidersBuilder? = null

    override fun invoke(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
        next: (SearchFragmentAction) -> Unit,
        action: SearchFragmentAction,
    ) {
        when (action) {
            is Init -> {
                next(action)

                suggestionsProvidersBuilder = buildSearchSuggestionsProvider(context)
                updateSearchProviders(context)

                setupSuggestionsProvidersCleanup(context)

                context.dispatch(
                    SearchFragmentAction.UpdateSearchState(
                        browserStore.state.search,
                        true,
                    ),
                )
            }

            is SearchStarted -> {
                next(action)

                engine.speculativeCreateSession(action.inPrivateMode)
                suggestionsProvidersBuilder = buildSearchSuggestionsProvider(context)
                setSearchEngine(context, action.selectedSearchEngine, action.isUserSelected)
                observeSearchEngineSelection(context)
            }

            is UpdateQuery -> {
                next(action)

                maybeShowSearchSuggestions(context, action.query)
            }

            is SearchEnginesSelectedActions -> {
                next(action)

                updateSearchProviders(context)
                maybeShowSearchSuggestions(context, context.state.query)
            }

            is SearchProvidersUpdated -> {
                next(action)

                if (action.providers.isNotEmpty()) {
                    maybeShowSearchSuggestions(context, context.state.query)
                }
            }

            is SuggestionClicked -> {
                val suggestion = action.suggestion
                when {
                    suggestion.flags.contains(AwesomeBar.Suggestion.Flag.HISTORY) -> {
                        History.searchResultTapped.record(NoExtras())
                    }
                    suggestion.flags.contains(AwesomeBar.Suggestion.Flag.BOOKMARK) -> {
                        BookmarksManagement.searchResultTapped.record(NoExtras())
                    }
                }
                browserStore.dispatch(AwesomeBarAction.SuggestionClicked(suggestion))
                toolbarStore.dispatch(BrowserEditToolbarAction.SearchQueryUpdated(BrowserToolbarQuery("")))
                suggestion.onSuggestionClicked?.invoke()
            }

            is SuggestionSelected -> {
                action.suggestion.editSuggestion?.let {
                    toolbarStore.dispatch(BrowserEditToolbarAction.SearchQueryUpdated(BrowserToolbarQuery(it)))
                }
            }

            is PrivateSuggestionsCardAccepted -> {
                updateSearchProviders(context)
            }

            else -> next(action)
        }
    }

    /**
     * Observe when the user changes the search engine to use for the current in-progress search
     * and update the suggestions providers used and shown suggestions accordingly.
     */
    private fun observeSearchEngineSelection(context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>) {
        observeSearchEnginesChangeJob?.cancel()
        observeSearchEnginesChangeJob = appStore.observeWhileActive {
            distinctUntilChangedBy { it.searchState.selectedSearchEngine?.searchEngine }
                .collect {
                    it.searchState.selectedSearchEngine?.let {
                        when (it.isUserSelected) {
                            true -> handleSearchShortcutEngineSelectedByUser(context, it.searchEngine)
                            false -> handleSearchShortcutEngineSelected(context, it.searchEngine)
                        }
                    }
                }
        }
    }

    /**
     * Update the search engine to the one selected by the user or fallback to the default search engine.
     *
     * @param context The current [MiddlewareContext] allowing to read and update the search state.
     * @param searchEngine The new [SearchEngine] to be used for new searches or `null` to fallback to
     * fallback to the default search engine.
     * @param isSelectedByUser isUserSelected Whether or not the search engine was selected by the user.
     */
    private fun setSearchEngine(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
        searchEngine: SearchEngine?,
        isSelectedByUser: Boolean,
    ) {
        searchEngine?.let {
            when (isSelectedByUser) {
                true -> handleSearchShortcutEngineSelectedByUser(context, it)
                false -> handleSearchShortcutEngineSelected(context, it)
            }
        } ?: context.state.defaultEngine?.let { handleSearchShortcutEngineSelected(context, it) }
    }

    /**
     * Check if new search suggestions should be shown based on the current search query.
     */
    private fun maybeShowSearchSuggestions(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
        query: String,
    ) {
        val shouldShowTrendingSearches = context.state.run {
            (showTrendingSearches || showRecentSearches) &&
                (searchStartedForCurrentUrl || FxNimbus.features.searchSuggestionsOnHomepage.value().enabled)
        }
        val shouldShowSearchSuggestions = with(context.state) {
            ((url != query && query.isNotBlank()) || showSearchShortcuts)
        }
        val shouldShowSuggestions = shouldShowTrendingSearches || shouldShowSearchSuggestions

        context.dispatch(SearchSuggestionsVisibilityUpdated(shouldShowSuggestions))

        val showPrivatePrompt = with(context.state) {
            !settings.showSearchSuggestionsInPrivateOnboardingFinished &&
                    browsingModeManager.mode.isPrivate &&
                    !isSearchSuggestionsFeatureEnabled() && !showSearchShortcuts && url != query
        }

        context.dispatch(
            SearchFragmentAction.AllowSearchSuggestionsInPrivateModePrompt(
                showPrivatePrompt,
            ),
        )
    }

    /**
     * Update the search providers used and shown suggestions based on the current search state.
     */
    private fun updateSearchProviders(context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>) {
        val suggestionsProvidersBuilder = suggestionsProvidersBuilder ?: return
        context.dispatch(
            SearchProvidersUpdated(
                buildList {
                    if (context.state.showSearchShortcuts) {
                        add(suggestionsProvidersBuilder.shortcutsEnginePickerProvider)
                    }
                    addAll((suggestionsProvidersBuilder.getProvidersToAdd(context.state.toSearchProviderState())))
                },
            ),
        )
    }

    @VisibleForTesting
    internal fun buildSearchSuggestionsProvider(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
    ): SearchSuggestionsProvidersBuilder? {
        val uiContext = fragment.context ?: return null

        return SearchSuggestionsProvidersBuilder(
            components = uiContext.components,
            browsingModeManager = browsingModeManager,
            includeSelectedTab = context.state.tabId == null,
            loadUrlUseCase = loadUrlUseCase(context),
            searchUseCase = searchUseCase(context),
            selectTabUseCase = selectTabUseCase(),
            suggestionsStringsProvider = DefaultSuggestionsStringsProvider(
                uiContext,
                DefaultSearchEngineProvider(uiContext.components.core.store),
            ),
            suggestionIconProvider = DefaultSuggestionIconProvider(uiContext),
            onSearchEngineShortcutSelected = ::handleSearchEngineSuggestionClicked,
            onSearchEngineSuggestionSelected = ::handleSearchEngineSuggestionClicked,
            onSearchEngineSettingsClicked = { handleClickSearchEngineSettings() },
        )
    }

    @VisibleForTesting
    internal fun loadUrlUseCase(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
    ) = object : LoadUrlUseCase {
        override fun invoke(
            url: String,
            flags: LoadUrlFlags,
            additionalHeaders: Map<String, String>?,
            originalInput: String?,
        ) {
            openToBrowserAndLoad(
                url = url,
                createNewTab = if (settings.enableHomepageAsNewTab) {
                    false
                } else {
                    context.state.tabId == null
                },
                usePrivateMode = browsingModeManager.mode.isPrivate,
                flags = flags,
            )

            Events.enteredUrl.record(Events.EnteredUrlExtra(autocomplete = false))

            browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = false))
        }
    }

    @VisibleForTesting
    internal fun searchUseCase(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
    ) = object : SearchUseCase {
        override fun invoke(
            searchTerms: String,
            searchEngine: SearchEngine?,
            parentSessionId: String?,
        ) {
            val searchEngine = context.state.searchEngineSource.searchEngine

            openToBrowserAndLoad(
                url = searchTerms,
                createNewTab = if (settings.enableHomepageAsNewTab) {
                    false
                } else {
                    context.state.tabId == null
                },
                usePrivateMode = browsingModeManager.mode.isPrivate,
                forceSearch = true,
                searchEngine = searchEngine,
            )

            val searchAccessPoint = when (context.state.searchAccessPoint) {
                MetricsUtils.Source.NONE -> MetricsUtils.Source.SUGGESTION
                else -> context.state.searchAccessPoint
            }

            if (searchEngine != null) {
                MetricsUtils.recordSearchMetrics(
                    searchEngine,
                    searchEngine == context.state.defaultEngine,
                    searchAccessPoint,
                    nimbusComponents.events,
                )
            }

            browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = false))
        }
    }

    @VisibleForTesting
    internal fun selectTabUseCase() = object : SelectTabUseCase {
        override fun invoke(tabId: String) {
            useCases.tabsUseCases.selectTab(tabId)

            navController.navigate(R.id.browserFragment)

            browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = false))
        }
    }

    private fun openToBrowserAndLoad(
        url: String,
        createNewTab: Boolean,
        usePrivateMode: Boolean,
        forceSearch: Boolean = false,
        searchEngine: SearchEngine? = null,
        flags: LoadUrlFlags = LoadUrlFlags.none(),
    ) {
        navController.navigate(R.id.browserFragment)
        useCases.fenixBrowserUseCases.loadUrlOrSearch(
            searchTermOrURL = url,
            newTab = createNewTab,
            private = usePrivateMode,
            forceSearch = forceSearch,
            searchEngine = searchEngine,
            flags = flags,
        )
    }

    /**
     * Handle a search shortcut engine being selected by the user.
     * This will result in using a different set of suggestions providers and showing different search suggestions.
     * The difference between this and [handleSearchShortcutEngineSelected] is that this also
     * records the appropriate telemetry for the user interaction.
     *
     * @param context The store which will provide the state and environment dependencies needed.
     * @param searchEngine The [SearchEngine] to be used for the current in-progress search.
     */
    @VisibleForTesting
    internal fun handleSearchShortcutEngineSelectedByUser(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
        searchEngine: SearchEngine,
    ) {
        handleSearchShortcutEngineSelected(context, searchEngine)

        Toolbar.buttonTapped.record(
            Toolbar.ButtonTappedExtra(
                source = SOURCE_ADDRESS_BAR,
                item = ACTION_SEARCH_ENGINE_SELECTED,
                extra = searchEngine.telemetryName(),
            ),
        )
    }

    /**
     * Update what search engine to use for the current in-progress search.
     * This will result in using a different set of suggestions providers and showing different search suggestions.
     *
     * @param context The current [MiddlewareContext] allowing to read and update the search state.
     * @param searchEngine The [SearchEngine] to be used for the current in-progress search.
     */
    private fun handleSearchShortcutEngineSelected(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
        searchEngine: SearchEngine,
    ) {
        when {
            searchEngine.type == SearchEngine.Type.APPLICATION && searchEngine.id == HISTORY_SEARCH_ENGINE_ID -> {
                context.dispatch(SearchFragmentAction.SearchHistoryEngineSelected(searchEngine))
            }
            searchEngine.type == SearchEngine.Type.APPLICATION && searchEngine.id == BOOKMARKS_SEARCH_ENGINE_ID -> {
                context.dispatch(SearchFragmentAction.SearchBookmarksEngineSelected(searchEngine))
            }
            searchEngine.type == SearchEngine.Type.APPLICATION && searchEngine.id == TABS_SEARCH_ENGINE_ID -> {
                context.dispatch(SearchFragmentAction.SearchTabsEngineSelected(searchEngine))
            }
            searchEngine == context.state.defaultEngine -> {
                context.dispatch(
                    SearchFragmentAction.SearchDefaultEngineSelected(
                        engine = searchEngine,
                        browsingMode = browsingModeManager.mode,
                        settings = settings,
                    ),
                )
            }
            else -> {
                context.dispatch(
                    SearchFragmentAction.SearchShortcutEngineSelected(
                        engine = searchEngine,
                        browsingMode = browsingModeManager.mode,
                        settings = settings,
                    ),
                )
            }
        }
    }

    private fun handleSearchEngineSuggestionClicked(searchEngine: SearchEngine) {
        appStore.dispatch(SearchEngineSelected(searchEngine, true))
    }

    @VisibleForTesting
    internal fun handleClickSearchEngineSettings() {
        val directions = SearchDialogFragmentDirections.actionGlobalSearchEngineFragment()
        navController.navigateSafe(R.id.searchDialogFragment, directions)
        browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = true))
    }

    private inline fun <S : State, A : MVIAction> Store<S, A>.observeWhileActive(
        crossinline observe: suspend (Flow<S>.() -> Unit),
    ): Job = fragment.viewLifecycleOwner.lifecycle.coroutineScope.launch { flow().observe() }

    private fun setupSuggestionsProvidersCleanup(
        context: MiddlewareContext<SearchFragmentState, SearchFragmentAction>,
    ) {
        fragment.viewLifecycleOwner.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    // Search providers may keep hard references to lifecycle dependent objects
                    // so we need to reset them when the environment is cleared.
                    context.dispatch(SearchProvidersUpdated(emptyList()))
                }
            },
        )
    }

    /**
     * Check whether search suggestions should be shown in the AwesomeBar.
     *
     * @return `true` if search suggestions should be shown `false` otherwise.
     */
    @VisibleForTesting
    internal fun isSearchSuggestionsFeatureEnabled(): Boolean {
        return when (browsingModeManager.mode) {
            BrowsingMode.Normal -> settings.shouldShowSearchSuggestions
            BrowsingMode.Private ->
                settings.shouldShowSearchSuggestions && settings.shouldShowSearchSuggestionsInPrivate
        }
    }
}
