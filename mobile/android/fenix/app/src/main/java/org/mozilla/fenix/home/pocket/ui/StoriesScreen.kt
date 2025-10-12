/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
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
import org.mozilla.fenix.components.appstate.recommendations.ContentRecommendationsState
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.home.pocket.interactor.PocketStoriesInteractor
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Stories screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoriesScreen(
    state: ContentRecommendationsState,
    interactor: PocketStoriesInteractor,
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
                        text = stringResource(R.string.pocket_stories_header_2),
                        color = FirefoxTheme.colors.textPrimary,
                        style = FirefoxTheme.typography.headline6,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                navigationIcon = {
                    IconButton(onClick = onNavigationIconClick) {
                        Icon(
                            painter = painterResource(iconsR.drawable.mozac_ic_back_24),
                            contentDescription = stringResource(R.string.stories_back_button_content_description),
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
        StoriesScreenContent(
            state = state,
            paddingValues = paddingValues,
            interactor = interactor,
        )
    }
}

@Composable
private fun StoriesScreenContent(
    state: ContentRecommendationsState,
    paddingValues: PaddingValues,
    interactor: PocketStoriesInteractor,
) {
    Column(
        modifier = Modifier
            .padding(paddingValues)
            .imePadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Stories(
            state = state,
            interactor = interactor,
        )
    }
}

@Composable
private fun Stories(
    state: ContentRecommendationsState,
    interactor: PocketStoriesInteractor,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(1),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier.padding(16.dp),
    ) {
        state.pocketStories.forEachIndexed { index, story ->
            item {
                StoryCard(
                    story = story,
                    onClick = interactor::onStoryClicked,
                )
            }
        }
    }
}

@Composable
@FlexibleWindowLightDarkPreview
private fun ShortcutsScreenPreviews() {
    FirefoxTheme {
        StoriesScreen(
            state = ContentRecommendationsState(
                pocketStories = FakeHomepagePreview.pocketStories(),
            ),
            interactor = FakeHomepagePreview.storiesInteractor,
            onNavigationIconClick = {},
        )
    }
}
