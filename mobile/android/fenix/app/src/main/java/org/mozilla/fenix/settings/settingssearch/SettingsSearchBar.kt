/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.compose.base.textfield.TextFieldColors
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Composable for the settings search bar.
 *
 * @param store [SettingsSearchStore] for the screen.
 * @param onBackClick Invoked when the app bar's back button is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSearchBar(
    store: SettingsSearchStore,
    onBackClick: () -> Unit,
) {
    val state by store.observeAsComposableState { it }
    var searchQuery by remember { mutableStateOf(state.searchQuery) }

    TopAppBar(
        modifier = Modifier
            .height(72.dp),
        title = {
            TextField(
                value = searchQuery,
                onValueChange = { value ->
                    searchQuery = value
                    store.dispatch(SettingsSearchAction.SearchQueryUpdated(value))
                },
                modifier = Modifier
                    .fillMaxWidth(),
                placeholder = stringResource(R.string.settings_search_title),
                singleLine = true,
                errorText = stringResource(R.string.settings_search_error_message),
                colors = TextFieldColors.default(
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    errorIndicatorColor = Color.Transparent,
                ),
                trailingIcons = {
                    when (state) {
                        is SettingsSearchState.SearchInProgress,
                         is SettingsSearchState.NoSearchResults,
                             -> {
                            IconButton(
                                onClick = {
                                    searchQuery = ""
                                    store.dispatch(SettingsSearchAction.SearchQueryUpdated(""))
                                },
                                contentDescription = stringResource(
                                    R.string.content_description_settings_search_clear_search,
                                ),
                            ) {
                                Icon(
                                    painter = painterResource(iconsR.drawable.mozac_ic_cross_circle_fill_24),
                                    contentDescription = null,
                                    tint = FirefoxTheme.colors.textPrimary,
                                )
                            }
                        }
                        else -> Unit
                    }
                },
            )
        },
        navigationIcon = {
            IconButton(
                onClick = onBackClick,
                contentDescription =
                    stringResource(
                        R.string.content_description_settings_search_navigate_back,
                    ),
            ) {
                Icon(
                    painter = painterResource(
                        iconsR.drawable.mozac_ic_back_24,
                    ),
                    contentDescription = null,
                    tint = FirefoxTheme.colors.textPrimary,
                )
            }
        },
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
    )
}
