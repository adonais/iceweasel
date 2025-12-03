/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.TextButton
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Composable for the settings search screen.
 *
 * @param store [SettingsSearchStore] for the screen.
 * @param onBackClick Callback for when the back button is clicked.
 */
@Composable
fun SettingsSearchScreen(
    store: SettingsSearchStore,
    onBackClick: () -> Unit,
) {
    val state by store.observeAsComposableState { it }
    Scaffold(
        topBar = {
            Column {
                SettingsSearchBar(
                    store = store,
                    onBackClick = onBackClick,
                )
                HorizontalDivider()
            }
        },
    ) { paddingValues ->
        val topPadding = remember(paddingValues) {
            paddingValues.calculateTopPadding()
        }

        when (state) {
            is SettingsSearchState.Default -> {
                if (state.recentSearches.isNotEmpty()) {
                    RecentSearchesContent(
                        store = store,
                        recentSearches = state.recentSearches,
                        modifier = Modifier
                            .padding(top = topPadding)
                            .fillMaxSize(),
                        )
                } else {
                    SettingsSearchMessageContent(
                        modifier = Modifier
                            .padding(top = topPadding)
                            .fillMaxSize(),
                    )
                }
            }
            is SettingsSearchState.NoSearchResults -> {
                SettingsSearchMessageContent(
                    modifier = Modifier
                        .padding(top = topPadding)
                        .fillMaxSize(),
                    currentUserQuery = state.searchQuery,
                    )
            }
            is SettingsSearchState.SearchInProgress -> {
                SearchResults(
                    store = store,
                    searchItems = state.searchResults,
                    modifier = Modifier
                        .padding(top = topPadding)
                        .fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun SettingsSearchMessageContent(
    modifier: Modifier = Modifier,
    currentUserQuery: String = "",
) {
    val displayMessage = if (currentUserQuery.isBlank()) {
        stringResource(R.string.settings_search_empty_query_placeholder)
    } else {
        stringResource(
            R.string.settings_search_no_results_found_message,
            currentUserQuery,
        )
    }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = displayMessage,
            textAlign = TextAlign.Center,
            style = FirefoxTheme.typography.body2,
            color = FirefoxTheme.colors.textSecondary,
        )
    }
}

@Composable
private fun SearchResults(
    store: SettingsSearchStore,
    searchItems: List<SettingsSearchItem>,
    modifier: Modifier = Modifier,
) {
    val state by store.observeAsComposableState { it }

    LazyColumn(
        modifier = modifier,
    ) {
        items(searchItems.size) { index ->
            val searchItem = searchItems[index]
            if (index > 0) {
                HorizontalDivider()
            }
            SettingsSearchResultItem(
                item = searchItem,
                query = state.searchQuery,
                onClick = {
                    store.dispatch(
                        SettingsSearchAction.ResultItemClicked(
                            searchItem,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun RecentSearchesContent(
    store: SettingsSearchStore,
    recentSearches: List<SettingsSearchItem>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(34.dp)
                .padding(start = 16.dp, end = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.settings_search_recent_searches_section_header),
                style = FirefoxTheme.typography.headline8,
            )
            TextButton(
                text = stringResource(R.string.settings_search_clear_recent_searches_message),
                onClick = {
                    store.dispatch(SettingsSearchAction.ClearRecentSearchesClicked)
                },
            )
        }
        SearchResults(store, recentSearches, Modifier)
    }
}

/**
 * Preview for the settings search screen initial state.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchScreenInitialStatePreview() {
    FirefoxTheme {
        SettingsSearchScreen(
            store = SettingsSearchStore(),
            onBackClick = {},
        )
    }
}

/**
 * Preview for the settings search screen displaying a list of recent searches.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchScreenWithRecentsPreview() {
    val storeWithRecents = SettingsSearchStore(
        initialState = SettingsSearchState.Default(
            recentSearches = listOf(
                SettingsSearchItem(
                    "Search engine",
                    "Choose your default",
                    "search_engine",
                    listOf("General"),
                    PreferenceFileInformation.SearchSettingsPreferences,
                ),
                SettingsSearchItem(
                    "Delete browsing data",
                    "Clear history, cookies, and more",
                    "delete_browsing_data",
                    listOf("Privacy"),
                    PreferenceFileInformation.PrivateBrowsingPreferences,
                ),
            ),
        ),
    )
    FirefoxTheme {
        SettingsSearchScreen(
            store = storeWithRecents,
            onBackClick = {},
        )
    }
}

/**
 * Preview for the settings search screen displaying search results.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchScreenWithResultsPreview() {
    val storeWithResults = SettingsSearchStore(
        initialState = SettingsSearchState.SearchInProgress(
            searchQuery = "privacy",
            searchResults = listOf(
                SettingsSearchItem(
                    "Tracking Protection",
                    "Strict, Standard, or Custom",
                    "tracking_protection",
                    listOf("Privacy"),
                    PreferenceFileInformation.GeneralPreferences,
                ),
                SettingsSearchItem(
                    "Delete browsing data",
                    "Clear history, cookies, and more",
                    "delete_browsing_data",
                    listOf("Privacy"),
                    PreferenceFileInformation.GeneralPreferences,
                ),
                SettingsSearchItem(
                    "HTTPS-Only Mode",
                    "Enable in all tabs",
                    "https_only_mode",
                    listOf("Privacy", "Advanced"),
                    PreferenceFileInformation.GeneralPreferences,
                ),
            ),
            recentSearches = emptyList(),
        ),
    )
    FirefoxTheme {
        SettingsSearchScreen(
            store = storeWithResults,
            onBackClick = {},
        )
    }
}

/**
 * Preview for the settings search screen when no results are found.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchScreenNoResultsPreview() {
    val storeWithNoResults = SettingsSearchStore(
        initialState = SettingsSearchState.NoSearchResults(
            searchQuery = "nonexistent query",
            recentSearches = emptyList(),
        ),
    )
    FirefoxTheme {
        SettingsSearchScreen(
            store = storeWithNoResults,
            onBackClick = {},
        )
    }
}
