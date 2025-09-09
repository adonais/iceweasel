/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search.awesomebar

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.core.graphics.toColorInt
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.navigation.NavController
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.awesomebar.AwesomeBar
import mozilla.components.compose.browser.awesomebar.AwesomeBarDefaults
import mozilla.components.compose.browser.awesomebar.AwesomeBarOrientation
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.components.support.ktx.android.view.hideKeyboard
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.search.BrowserStoreToFenixSearchMapperMiddleware
import org.mozilla.fenix.search.BrowserToolbarToFenixSearchMapperMiddleware
import org.mozilla.fenix.search.FenixSearchMiddleware
import org.mozilla.fenix.search.SearchFragmentAction
import org.mozilla.fenix.search.SearchFragmentAction.SuggestionClicked
import org.mozilla.fenix.search.SearchFragmentAction.SuggestionSelected
import org.mozilla.fenix.search.SearchFragmentStore
import org.mozilla.fenix.search.createInitialSearchFragmentState
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.theme.FirefoxTheme

private const val MATERIAL_DESIGN_SCRIM = "#52000000"

/**
 * Wrapper over a [Composable] to show search suggestions, responsible for its setup.
 *
 * @param activity [HomeActivity] providing the ability to open URLs and querying the current browsing mode.
 * @param modifier [Modifier] to be applied to the [Composable].
 * @param components [Components] for accessing other functionalities of the application.
 * @param appStore [AppStore] for accessing the current application state.
 * @param browserStore [BrowserStore] for accessing the current browser state.
 * @param toolbarStore [BrowserToolbarStore] for accessing the current toolbar state.
 * @param navController [NavController] for navigating to other destinations in the application.
 * @param lifecycleOwner [Fragment] for controlling the lifetime of long running operations.
 * @param tabId [String] Id of the current tab for which a new search was started.
 * @param showScrimWhenNoSuggestions Whether to show a scrim when no suggestions are available.
 * @param searchAccessPoint Where search was started from.
 */
@Suppress("LongParameterList")
class AwesomeBarComposable(
    private val activity: HomeActivity,
    private val modifier: Modifier,
    private val components: Components,
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val toolbarStore: BrowserToolbarStore,
    private val navController: NavController,
    private val lifecycleOwner: Fragment,
    private val tabId: String? = null,
    private val showScrimWhenNoSuggestions: Boolean = false,
    private val searchAccessPoint: MetricsUtils.Source = MetricsUtils.Source.NONE,
) {
    private val searchStore = initializeSearchStore()

    /**
     * [Composable] fully integrated with [BrowserStore] and [BrowserToolbarStore]
     * that will show search suggestions whenever the users edits the current query in the toolbar.
     */
    @OptIn(ExperimentalLayoutApi::class) // for WindowInsets.isImeVisible
    @Suppress("LongMethod", "CyclomaticComplexMethod")
    @Composable
    fun SearchSuggestions() {
        val isSearchActive = appStore.observeAsComposableState { it.searchState.isSearchActive }.value
        val state = searchStore.observeAsComposableState { it }.value
        val orientation by remember(state.searchSuggestionsOrientedAtBottom) {
            derivedStateOf {
                when (searchStore.state.searchSuggestionsOrientedAtBottom) {
                    true -> AwesomeBarOrientation.BOTTOM
                    false -> AwesomeBarOrientation.TOP
                }
            }
        }
        val shouldShowClipboardBar by remember(
            state.showClipboardSuggestions,
            state.query,
            state.clipboardHasUrl,
            state.showSearchShortcuts,
        ) {
            derivedStateOf {
                state.showClipboardSuggestions &&
                        state.query.isEmpty() &&
                        state.clipboardHasUrl &&
                        !state.showSearchShortcuts
            }
        }
        val view = LocalView.current
        val focusManager = LocalFocusManager.current
        val keyboardController = LocalSoftwareKeyboardController.current

        LaunchedEffect(isSearchActive) {
            if (!isSearchActive) {
                focusManager.clearFocus()
                keyboardController?.hide()
            } else {
                val hasUrl = components.clipboardHandler.containsURL()
                searchStore.dispatch(SearchFragmentAction.UpdateClipboardHasUrl(hasUrl))
            }
        }

        if (isSearchActive && shouldShowClipboardBar && orientation == AwesomeBarOrientation.TOP) {
            val url = components.clipboardHandler.extractURL()

            ClipboardSuggestionBar(
                shouldUseBottomToolbar = components.settings.shouldUseBottomToolbar,
                onClick = {
                    url?.let {
                        toolbarStore.dispatch(
                            SearchQueryUpdated(query = url, isQueryPrefilled = false),
                        )
                    }
                },
            )
        }

        if (isSearchActive) {
            if (state.showSearchSuggestionsHint) {
                PrivateSuggestionsCard(
                    onSearchSuggestionsInPrivateModeAllowed = {
                        activity.settings().shouldShowSearchSuggestionsInPrivate = true
                        activity.settings().showSearchSuggestionsInPrivateOnboardingFinished = true
                        searchStore.dispatch(SearchFragmentAction.SetShowSearchSuggestions(true))
                        searchStore.dispatch(SearchFragmentAction.AllowSearchSuggestionsInPrivateModePrompt(false))
                        searchStore.dispatch(SearchFragmentAction.PrivateSuggestionsCardAccepted)
                    },
                    onSearchSuggestionsInPrivateModeBlocked = {
                        activity.settings().shouldShowSearchSuggestionsInPrivate = false
                        activity.settings().showSearchSuggestionsInPrivateOnboardingFinished = true
                        searchStore.dispatch(
                            SearchFragmentAction.AllowSearchSuggestionsInPrivateModePrompt(false),
                        )
                    },
                    onLearnMoreClick = {
                        components.useCases.fenixBrowserUseCases.loadUrlOrSearch(
                            searchTermOrURL = SupportUtils.getGenericSumoURLForTopic(
                                SupportUtils.SumoTopic.SEARCH_SUGGESTION,
                            ),
                            newTab = appStore.state.searchState.sourceTabId == null,
                            private = true,
                        )
                        navController.navigate(R.id.browserFragment)
                    },
                )
            }
            if (state.shouldShowSearchSuggestions) {
                Box(
                    modifier = modifier
                        .background(AcornTheme.colors.layer1)
                        .fillMaxSize()
                        .pointerInput(WindowInsets.isImeVisible) {
                            detectTapGestures(
                                // Hide the keyboard for any touches in the empty area of the awesomebar
                                onPress = { view.hideKeyboard() },
                            )
                        },
                ) {
                    AwesomeBar(
                        text = state.query,
                        providers = state.searchSuggestionsProviders,
                        orientation = orientation,
                        colors = AwesomeBarDefaults.colors(
                            background = Color.Transparent,
                            title = FirefoxTheme.colors.textPrimary,
                            description = FirefoxTheme.colors.textSecondary,
                            autocompleteIcon = FirefoxTheme.colors.textSecondary,
                            groupTitle = FirefoxTheme.colors.textSecondary,
                        ),
                        onSuggestionClicked = { suggestion ->
                            searchStore.dispatch(SuggestionClicked(suggestion))
                        },
                        onAutoComplete = { suggestion ->
                            searchStore.dispatch(SuggestionSelected(suggestion))
                        },
                        onVisibilityStateUpdated = {
                            browserStore.dispatch(AwesomeBarAction.VisibilityStateUpdated(it))
                        },
                        onScroll = { view.hideKeyboard() },
                        profiler = components.core.engine.profiler,
                    )
                }
            } else if (showScrimWhenNoSuggestions) {
                Spacer(
                    modifier = modifier
                        .background(Color(MATERIAL_DESIGN_SCRIM.toColorInt()))
                        .fillMaxSize()
                        .pointerInput(WindowInsets.isImeVisible) {
                            detectTapGestures(
                                onPress = {
                                    focusManager.clearFocus()
                                    keyboardController?.hide()
                                    appStore.dispatch(SearchEnded)
                                },
                            )
                        },
                )
            }
        }

        if (isSearchActive && shouldShowClipboardBar && orientation == AwesomeBarOrientation.BOTTOM) {
            val url = components.clipboardHandler.extractURL()

            ClipboardSuggestionBar(
                shouldUseBottomToolbar = components.settings.shouldUseBottomToolbar,
                onClick = {
                    url?.let {
                        toolbarStore.dispatch(
                            SearchQueryUpdated(query = url, isQueryPrefilled = false),
                        )
                    }
                },
            )
        }
    }

    private fun initializeSearchStore() = StoreProvider.get(lifecycleOwner) {
        SearchFragmentStore(
            initialState = createInitialSearchFragmentState(
                activity = activity,
                components = components,
                tabId = tabId,
                pastedText = null,
                searchAccessPoint = searchAccessPoint,
            ),
            middleware = listOf(
                BrowserToolbarToFenixSearchMapperMiddleware(toolbarStore, browserStore),
                BrowserStoreToFenixSearchMapperMiddleware(browserStore),
                FenixSearchMiddleware(
                    engine = components.core.engine,
                    useCases = components.useCases,
                    nimbusComponents = components.nimbus,
                    settings = components.settings,
                    appStore = appStore,
                    browserStore = browserStore,
                    toolbarStore = toolbarStore,
                ),
            ),
        )
    }.also {
        it.dispatch(
            SearchFragmentAction.EnvironmentRehydrated(
                SearchFragmentStore.Environment(
                    context = activity,
                    viewLifecycleOwner = lifecycleOwner.viewLifecycleOwner,
                    browsingModeManager = activity.browsingModeManager,
                    navController = navController,
                ),
            ),
        )

        lifecycleOwner.viewLifecycleOwner.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    it.dispatch(SearchFragmentAction.EnvironmentCleared)
                }
            },
        )
    }
}
