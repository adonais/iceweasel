/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.utils.BackInvokedHandler
import org.mozilla.fenix.R
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.home.topsites.interactor.TopSiteInteractor
import org.mozilla.fenix.home.topsites.store.ShortcutsState
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The shortcuts screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShortcutsScreen(
    state: ShortcutsState,
    interactor: TopSiteInteractor,
    onNavigationIconClick: () -> Unit,
) {
    BackInvokedHandler {
        onNavigationIconClick()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.homepage_shortcuts_title),
                        color = FirefoxTheme.colors.textPrimary,
                        style = FirefoxTheme.typography.headline6,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                navigationIcon = {
                    IconButton(onClick = onNavigationIconClick) {
                        Icon(
                            painter = painterResource(R.drawable.mozac_ic_back_24),
                            contentDescription = "",
                            tint = FirefoxTheme.colors.iconPrimary,
                        )
                    }
                },
                windowInsets = WindowInsets(
                    top = 0.dp,
                    bottom = 0.dp,
                ),
                colors = TopAppBarDefaults.topAppBarColors(containerColor = FirefoxTheme.colors.layer1),
            )
        },
        containerColor = FirefoxTheme.colors.layer1,
    ) { paddingValues ->
        ShortcutsScreenContent(
            state = state,
            paddingValues = paddingValues,
            interactor = interactor,
        )
    }
}

@Composable
private fun ShortcutsScreenContent(
    state: ShortcutsState,
    paddingValues: PaddingValues,
    interactor: TopSiteInteractor,
) {
    Column(
        modifier = Modifier
            .padding(paddingValues)
            .imePadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Shortcuts(
            topSites = state.topSites,
            interactor = interactor,
        )
    }
}

@Composable
@FlexibleWindowLightDarkPreview
private fun ShortcutsScreenPreviews() {
    FirefoxTheme {
        ShortcutsScreen(
            state = ShortcutsState(
                topSites = FakeHomepagePreview.topSites(),
            ),
            interactor = FakeHomepagePreview.topSitesInteractor,
            onNavigationIconClick = {},
        )
    }
}
