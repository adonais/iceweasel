/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import mozilla.components.compose.base.badge.StatusBadge
import mozilla.components.compose.base.theme.ThemedValue
import mozilla.components.compose.base.theme.ThemedValueProvider
import mozilla.components.compose.base.theme.information
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.SummarizationMenuState
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Summarization menu item.
 *
 * @param summarizationMenuState The state of the summarization menu.
 * @param onSummarizePageMenuExposed A callback to be executed when the menu is exposed to the user. it will be used to
 *   know when to remove the highlight.
 * @param onSummarizePageClick A callback to be executed when the menu item is clicked.
 */
@Composable
internal fun SummarizationMenuItem(
    summarizationMenuState: SummarizationMenuState,
    onSummarizePageMenuExposed: () -> Unit,
    onSummarizePageClick: () -> Unit,
) {
    if (summarizationMenuState.visible) {
        LaunchedEffect(Unit) {
            if (summarizationMenuState.highlighted) {
                onSummarizePageMenuExposed()
            }
        }
        val state: MenuItemState =
            if (summarizationMenuState.enabled) {
                MenuItemState.ENABLED
            } else {
                MenuItemState.DISABLED
            }

        val containerColor =
            if (summarizationMenuState.enabled) {
                MaterialTheme.colorScheme.information
            } else {
                MaterialTheme.colorScheme.information.copy(alpha = 0.38f)
            }

        MenuItem(
            label = stringResource(id = R.string.browser_menu_summarize_page),
            labelModifier = Modifier.wrapContentWidth(),
            beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_lightning_24),
            isBeforeIconHighlighted = summarizationMenuState.highlighted,
            onClick = onSummarizePageClick,
            state = state,
            afterContent = {
                if (summarizationMenuState.showNewFeatureBadge) {
                    StatusBadge(
                        containerColor = containerColor,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        status = stringResource(R.string.browser_menu_summarize_page_badge),
                    )
                }
            },
        )
    }
}

@Preview
@Composable
private fun SummarizationMenuItemPreview(
    @PreviewParameter(SummarizationMenuStatePreviewProvider::class) state: ThemedValue<SummarizationMenuState>
) {
    FirefoxTheme(theme = state.theme) {
        Column(
            modifier =
                Modifier.background(color = MaterialTheme.colorScheme.surface)
                    .padding(all = FirefoxTheme.layout.space.static200)
        ) {
            MenuGroup {
                SummarizationMenuItem(
                    summarizationMenuState = state.value,
                    onSummarizePageMenuExposed = {},
                    onSummarizePageClick = {},
                )
            }
        }
    }
}

private class SummarizationMenuStatePreviewProvider :
    ThemedValueProvider<SummarizationMenuState>(
        baseValues =
            sequenceOf(
                SummarizationMenuState.Default.copy(
                    visible = true,
                    enabled = true,
                    highlighted = true,
                    showNewFeatureBadge = true,
                ),
                SummarizationMenuState.Default.copy(
                    visible = true,
                    enabled = true,
                ),
                SummarizationMenuState.Default.copy(
                    visible = true,
                    enabled = false,
                    showNewFeatureBadge = true,
                ),
            ),
        displayNames =
            listOf(
                "Highlighted with badge",
                "Enabled",
                "Disabled with badge",
            ),
    )
