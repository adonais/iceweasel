/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
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
    val focusRequester = remember { FocusRequester() }

    TopAppBar(
        modifier = Modifier
            .wrapContentHeight(),
        title = {
            SettingsSearchField(
                store = store,
                focusRequester = focusRequester,
            )
        },
        navigationIcon = { BackButton(onClick = onBackClick) },
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
    )

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
}

@Composable
private fun SettingsSearchField(
    store: SettingsSearchStore,
    focusRequester: FocusRequester,
) {
    val state by store.observeAsComposableState { it }
    var searchQuery by remember {
        mutableStateOf(
            TextFieldValue(
                text = state.searchQuery,
                selection = TextRange(state.searchQuery.length),
            ),
        )
    }

    TextField(
        value = searchQuery,
        onValueChange = { value: TextFieldValue ->
            searchQuery = value
            store.dispatch(SettingsSearchAction.SearchQueryUpdated(value.text))
        },
        textStyle = AcornTheme.typography.body1,
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focusRequester),
        placeholder = @Composable {
            Text(
                text = stringResource(R.string.settings_search_title),
                style = AcornTheme.typography.body1,
            )
        },
        singleLine = true,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            errorIndicatorColor = Color.Transparent,
        ),
        trailingIcon = @Composable {
            when (state) {
                is SettingsSearchState.SearchInProgress,
                is SettingsSearchState.NoSearchResults,
                    -> {
                    ClearTextButton(
                        onClick = {
                            searchQuery = TextFieldValue("")
                            store.dispatch(SettingsSearchAction.SearchQueryUpdated(""))
                        },
                    )
                }
                else -> Unit
            }
        },
    )
}

@Composable
private fun BackButton(
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
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
        )
    }
}

@Composable
private fun ClearTextButton(
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        contentDescription = stringResource(
            R.string.content_description_settings_search_clear_search,
        ),
    ) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_cross_circle_fill_24),
            contentDescription = null,
        )
    }
}
