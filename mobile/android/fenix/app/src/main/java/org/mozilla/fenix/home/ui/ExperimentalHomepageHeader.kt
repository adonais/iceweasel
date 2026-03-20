/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.home.ui.HomepageTestTag.PRIVATE_BROWSING_HOMEPAGE_BUTTON
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.PreviewThemeProvider
import org.mozilla.fenix.theme.Theme
import mozilla.components.ui.icons.R as iconsR

/**
 * Homepage header for the entry points experiment.
 *
 * @param wordmarkTextColor color for the wordmark.
 * @param onPrivateModeTapped callback for when the private mode button is tapped.
 * @param onStoriesTapped callback for when the stories button is tapped.
 */
@Composable
fun ExperimentalHomepageHeader(
    wordmarkTextColor: Color?,
    onPrivateModeTapped: () -> Unit,
    onStoriesTapped: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight()
            .padding(all = 16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        PrivateModeButton(onPrivateModeTapped)

        Column {
            Spacer(modifier = Modifier.height(28.dp))
            WordmarkAndLogo(wordmarkTextColor)
        }

        StoriesButton(onClick = onStoriesTapped)
    }
}

/**
 * Homepage header for the entry points experiment in private mode.
 *
 * @param onHomeTapped callback for when the home button is tapped.
 */
@Composable
fun ExperimentalPrivateHomepageHeader(onHomeTapped: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight()
            .padding(all = 16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.End,
    ) {
        HomeButton(onHomeTapped)
    }
}

@Composable
private fun WordmarkAndLogo(
    wordmarkTextColor: Color?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WordmarkLogo()
        WordmarkText(wordmarkTextColor)
    }
}

@Composable
private fun PrivateModeButton(onClick: () -> Unit) {
    LeftChevronPillButton(
        onClick = onClick,
        modifier = Modifier.semantics {
            testTagsAsResourceId = true
            testTag = PRIVATE_BROWSING_HOMEPAGE_BUTTON
        },
    ) {
        Icon(
            painter = painterResource(R.drawable.private_mode_icon),
            contentDescription = stringResource(R.string.content_description_private_browsing),
        )
    }
}

@Composable
private fun StoriesButton(onClick: () -> Unit) {
    RightChevronPillButton(onClick = onClick) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_reading_list_24),
            contentDescription = stringResource(R.string.homepage_all_stories),
        )
    }
}

@Composable
private fun HomeButton(onClick: () -> Unit) {
    RightChevronPillButton(
        onClick = onClick,
        border = BorderStroke(width = 1.dp, color = MaterialTheme.colorScheme.outlineVariant),
    ) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_home_24),
            contentDescription = stringResource(R.string.content_description_normal_browsing),
        )
    }
}

@Preview
@Composable
private fun HomepageHeaderPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme) {
        Surface {
            ExperimentalHomepageHeader(
                wordmarkTextColor = null,
                onPrivateModeTapped = {},
                onStoriesTapped = {},
            )
        }
    }
}

@Preview
@Composable
private fun PrivateHomepageHeaderPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme) {
        Surface {
            ExperimentalPrivateHomepageHeader {}
        }
    }
}
